import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanText, scanRepo, mask } from '../scripts/scan-secrets.mjs';

/* The credential-shaped fixtures below are invented — none of them is or was a
 * real token. They are assembled at runtime rather than written out as string
 * literals, because a literal that looks exactly like a Shopify token *is* one
 * as far as any scanner can tell: GitHub's push protection rejected this file
 * when the fixtures were spelled out, which is the correct behaviour. Splitting
 * them keeps the fixture invisible to a scanner reading the file, while the
 * test still exercises the rule against a fully formed value. */
const fixture = (...parts) => parts.join('');

const rulesFound = (text) => scanText(text).map((f) => f.rule);

test('catches a Shopify access token', () => {
  assert.ok(rulesFound(fixture('token: shp','at_','0123456789abcdef'.repeat(2))).includes('shopify-token'));
});

test('catches a Shopify refresh token', () => {
  assert.ok(rulesFound(fixture('shp','rt_','abcdef0123456789'.repeat(2))).includes('shopify-token'));
});

test('catches a GitHub personal access token', () => {
  assert.ok(rulesFound(fixture('gh','p_','ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).includes('github-token'));
});

test('catches an AWS access key id', () => {
  assert.ok(rulesFound(fixture('AKI','AIOSFODNN7EXAMPLE')).includes('aws-key'));
});

test('catches a private key block', () => {
  assert.ok(rulesFound(fixture('-----BEGIN ','RSA PRIVATE',' KEY-----')).includes('private-key'));
});

test('catches a secret assigned to a secret-looking name', () => {
  assert.ok(rulesFound(fixture('api_key',' = "aVeryLongLookingSecretValue123"')).includes('generic-secret-assignment'));
});

test('catches a real store handle', () => {
  assert.ok(rulesFound('store: acme-clothing.myshopify.com').includes('store-handle')); // storehand-allow-secret: store-handle
});

test('allows the documented placeholder handles', () => {
  for (const placeholder of ['your-store.myshopify.com', '<store>.myshopify.com', '*.myshopify.com']) {
    assert.deepEqual(scanText(placeholder), [], `${placeholder} should be allowed`);
  }
});

test('catches a numeric shop id in a URL', () => {
  assert.ok(rulesFound('https://shopify.com/999888777666/account/orders').includes('shop-id')); // storehand-allow-secret: shop-id
});

test('catches a Shopify global id', () => {
  assert.ok(rulesFound('gid://shopify/Product/1234567890123').includes('shopify-gid')); // storehand-allow-secret: shopify-gid
});

test('catches an email address but allows noreply and example ones', () => {
  assert.ok(rulesFound('owner@somestore.nl').includes('email')); // storehand-allow-secret: email, unknown-host
  assert.deepEqual(scanText('142841909+someone@users.noreply.github.com'), []);
  assert.deepEqual(scanText('someone@example.com'), []);
});

test('catches a customer domain that is not on the allowlist', () => {
  /* The leak this scanner was written for: a real storefront named in a note. */
  const findings = rulesFound('storefront live on https://www.someclothingbrand.nl'); // storehand-allow-secret: unknown-host
  assert.ok(findings.includes('unknown-host'));
});

test('catches an IP address but allows loopback', () => {
  /* Loopback is documentation: the Shopify CLI's callback is 127.0.0.1 for
   * every user. A VPN node or a LAN address names somebody's machine. */
  assert.ok(rulesFound('node reachable at 100.101.102.103').includes('network-address')); // storehand-allow-secret: network-address
  assert.ok(rulesFound('router at 192.168.1.50').includes('network-address')); // storehand-allow-secret: network-address
  assert.deepEqual(scanText('callback on 127.0.0.1:13387'), []);
  assert.deepEqual(scanText('Shopify CLI 4.5.2'), []);
});

test('catches a VPN hostname', () => {
  assert.ok(rulesFound('laptop.tailnet-1234.ts.net').includes('unknown-host')); // storehand-allow-secret: unknown-host
});

test('catches a real ssh target, including behind flags with arguments', () => {
  /* The tight form `ssh <flags> user@host` matches nothing on a real
   * invocation, because -L carries an argument. That silent miss is the bug
   * this test exists to prevent. */
  const real = 'ssh -N -L 13387:127.0.0.1:13387 someone@their-own-server'; // storehand-allow-secret: ssh-target
  assert.ok(rulesFound(real).includes('ssh-target'));
  assert.deepEqual(scanText('ssh -N -L 13387:127.0.0.1:13387 user@your-server'), []);
  assert.deepEqual(scanText('ssh -N -L 13387:127.0.0.1:13387 user@host'), []);
});

test('allows the hosts the repository legitimately links to', () => {
  const text = [
    'https://www.apache.org/licenses/LICENSE-2.0',
    'https://github.com/storehand/storehand',
    'https://shopify.dev/docs/api',
    'https://docs.shopify.dev/nested/path',
    'https://store.example/pages/x',
  ].join('\n');
  assert.deepEqual(scanText(text), []);
});

test('does not mistake dotted code for a hostname', () => {
  const code = 'const u = import.meta.url; report.checked.length; check-urls.test.mjs';
  assert.deepEqual(scanText(code), []);
});

test('an inline exemption silences exactly one rule on exactly that line', () => {
  const exempt = 'store: acme-clothing.myshopify.com storehand-allow-secret: store-handle'; // storehand-allow-secret: store-handle
  assert.deepEqual(scanText(exempt), []);
  const wrongRule = 'store: acme-clothing.myshopify.com storehand-allow-secret: email'; // storehand-allow-secret: store-handle
  assert.ok(rulesFound(wrongRule).includes('store-handle'));
});

test('mask never reveals the middle of a value', () => {
  const masked = mask(fixture('shp','at_','0123456789abcdef'));
  assert.ok(!masked.includes('0123456789'));
  assert.match(masked, /^sh\*+ef$/);
});

test('scanRepo reports a forbidden path even when the file is empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storehand-scan-'));
  fs.mkdirSync(path.join(root, '.storehand'), { recursive: true });
  fs.writeFileSync(path.join(root, '.storehand', 'store.yaml'), '');
  const findings = scanRepo(root, ['.storehand/store.yaml']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'store-profile');
});

test('scanRepo finds a secret inside a file and names the line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storehand-scan-'));
  fs.writeFileSync(path.join(root, 'note.md'), 'fine\nstore: acme-clothing.myshopify.com\n'); // storehand-allow-secret: store-handle
  const findings = scanRepo(root, ['note.md']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].file, 'note.md');
});

test('the repository itself is clean', () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  assert.deepEqual(scanRepo(root), []);
});
