import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter, validatePlugin } from '../scripts/validate-plugin.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storehand-'));
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'storehand', description: 'x', version: '0.1.0' })
  );
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'storehand', plugins: [{ name: 'storehand', source: './' }] })
  );
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  return root;
}

function addSkill(root, name, body) {
  const dir = path.join(root, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body);
  return dir;
}

const goodSkill = (name) => `---
name: ${name}
description: Does a useful thing for a store.
---

Body text.
`;

test('parseFrontmatter extracts name and description', () => {
  const fm = parseFrontmatter(goodSkill('daily-store-briefing'));
  assert.equal(fm.name, 'daily-store-briefing');
  assert.equal(fm.description, 'Does a useful thing for a store.');
});

test('parseFrontmatter returns null when frontmatter is missing', () => {
  assert.equal(parseFrontmatter('# Just a heading\n'), null);
});

test('a well-formed plugin reports no errors', () => {
  const root = makeFixture();
  addSkill(root, 'daily-store-briefing', goodSkill('daily-store-briefing'));
  assert.deepEqual(validatePlugin(root), []);
});

test('a skill directory without SKILL.md is an error', () => {
  const root = makeFixture();
  fs.mkdirSync(path.join(root, 'skills', 'broken'), { recursive: true });
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /broken.*SKILL\.md/);
});

test('frontmatter name must match the directory name', () => {
  const root = makeFixture();
  addSkill(root, 'daily-store-briefing', goodSkill('wrong-name'));
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /wrong-name/);
});

test('an empty description is an error', () => {
  const root = makeFixture();
  addSkill(root, 'thin', '---\nname: thin\ndescription:\n---\n\nBody.\n');
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /description/);
});

test('a referenced query file that does not exist is an error', () => {
  const root = makeFixture();
  addSkill(
    root,
    'daily-store-briefing',
    `${goodSkill('daily-store-briefing')}\nRun: --query-file queries/missing.graphql\n`
  );
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /queries\/missing\.graphql/);
});

test('a referenced query file that exists is fine', () => {
  const root = makeFixture();
  const dir = addSkill(
    root,
    'daily-store-briefing',
    `${goodSkill('daily-store-briefing')}\nRun: --query-file queries/orders-since.graphql\n`
  );
  fs.mkdirSync(path.join(dir, 'queries'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'queries', 'orders-since.graphql'), '{ shop { name } }');
  assert.deepEqual(validatePlugin(root), []);
});

test('a query path anchored on $CLAUDE_PLUGIN_ROOT resolves against the root', () => {
  const root = makeFixture();
  addSkill(
    root,
    'daily-store-briefing',
    `${goodSkill('daily-store-briefing')}
Run: --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/orders.graphql"
`
  );
  fs.mkdirSync(path.join(root, 'skills', 'daily-store-briefing', 'queries'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'skills', 'daily-store-briefing', 'queries', 'orders.graphql'),
    '{ shop { name } }'
  );
  assert.deepEqual(validatePlugin(root), []);
});

test('a query path with an unresolvable variable is an error, not a skip', () => {
  const root = makeFixture();
  addSkill(
    root,
    'daily-store-briefing',
    `${goodSkill('daily-store-briefing')}\nRun: --query-file "$Q/orders.graphql"\n`
  );
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot be resolved/);
});

test('a description written as a YAML block scalar is rejected', () => {
  const root = makeFixture();
  addSkill(root, 'blocky', '---\nname: blocky\ndescription: >\n  A long description\n  over two lines.\n---\n\nBody.\n');
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /description/);
});

test('a symlinked skill directory is checked, not skipped', () => {
  const root = makeFixture();
  const real = path.join(root, 'elsewhere');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, path.join(root, 'skills', 'linked'));
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /linked.*SKILL\.md/);
});

test('a plugin with no skills at all is an error', () => {
  const root = makeFixture();
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no skills/);
});

test('a markdown link to a missing file is an error', () => {
  const root = makeFixture();
  addSkill(root, 'daily-store-briefing', goodSkill('daily-store-briefing'));
  fs.writeFileSync(path.join(root, 'README.md'), 'See [the guide](docs/gone.md).\n');
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /docs\/gone\.md/);
});

test('markdown links to existing files and to the web are fine', () => {
  const root = makeFixture();
  addSkill(root, 'daily-store-briefing', goodSkill('daily-store-briefing'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'connect.md'), 'Hi.\n');
  fs.writeFileSync(
    path.join(root, 'README.md'),
    'See [the guide](docs/connect.md) and [Shopify](https://shopify.dev).\n'
  );
  assert.deepEqual(validatePlugin(root), []);
});

test('a plugin listed in marketplace.json must exist on disk', () => {
  const root = makeFixture();
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'storehand', plugins: [{ name: 'storehand', source: './nope' }] })
  );
  addSkill(root, 'daily-store-briefing', goodSkill('daily-store-briefing'));
  const errors = validatePlugin(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /nope/);
});
