// tests/check-urls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
import { checkUrl, checkUrls } from '../skills/store-health-check/scripts/check-urls.mjs';

const SCRIPT_PATH = fileURLToPath(
  new URL('../skills/store-health-check/scripts/check-urls.mjs', import.meta.url),
);

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function route(routes) {
  return (req, res) => {
    const found = routes[req.url];
    if (!found) { res.writeHead(404); res.end('not found'); return; }
    found(req, res);
  };
}

test('a plain 200 comes back as status 200 with no flags', async () => {
  const { server, base } = await startServer(route({
    '/ok': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  try {
    const result = await checkUrl(base, '/ok', { timeoutMs: 2000 });
    assert.equal(result.status, 200);
    assert.equal(result.passwordPage, undefined);
    assert.equal(result.offDomain, undefined);
    assert.equal(result.error, undefined);
  } finally { server.close(); }
});

test("a path that doesn't exist comes back as 404", async () => {
  const { server, base } = await startServer(route({}));
  try {
    const result = await checkUrl(base, '/missing', { timeoutMs: 2000 });
    assert.equal(result.status, 404);
  } finally { server.close(); }
});

test('a redirect to /password is flagged and not followed further', async () => {
  const { server, base } = await startServer(route({
    '/closed': (req, res) => { res.writeHead(302, { location: '/password' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/closed', { timeoutMs: 2000 });
    assert.equal(result.passwordPage, true);
    assert.match(result.finalUrl, /\/password$/);
  } finally { server.close(); }
});

test('a redirect to another domain is flagged and not fetched', async () => {
  const { server, base } = await startServer(route({
    '/ext': (req, res) => { res.writeHead(301, { location: 'https://elsewhere.example/x' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/ext', { timeoutMs: 2000 });
    assert.equal(result.offDomain, true);
    assert.equal(result.finalUrl, 'https://elsewhere.example/x');
  } finally { server.close(); }
});

test('a redirect chain within the domain is followed to the final status', async () => {
  const { server, base } = await startServer(route({
    '/a': (req, res) => { res.writeHead(302, { location: '/b' }); res.end(); },
    '/b': (req, res) => { res.writeHead(200); res.end('landed'); },
  }));
  try {
    const result = await checkUrl(base, '/a', { timeoutMs: 2000 });
    assert.equal(result.status, 200);
    assert.match(result.finalUrl, /\/b$/);
    assert.equal(result.redirects.length, 1);
  } finally { server.close(); }
});

test('a hanging response becomes a timeout error, not a crash', async () => {
  const { server, base } = await startServer(route({
    '/slow': () => { /* never respond */ },
  }));
  try {
    const result = await checkUrl(base, '/slow', { timeoutMs: 150 });
    assert.equal(result.error, 'timeout');
    assert.equal(result.status, undefined);
  } finally { server.close(); }
});

test('checkUrls respects the cap and reports truncation', async () => {
  const { server, base } = await startServer(route({
    '/1': (req, res) => { res.writeHead(200); res.end(); },
    '/2': (req, res) => { res.writeHead(200); res.end(); },
    '/3': (req, res) => { res.writeHead(200); res.end(); },
  }));
  try {
    const report = await checkUrls({ base, urls: ['/1', '/2', '/3'], maxUrls: 2, timeoutMs: 2000 });
    assert.equal(report.checked.length, 2);
    assert.equal(report.truncated, true);
  } finally { server.close(); }
});

test('absolute URLs on the same domain and relative paths both work', async () => {
  const { server, base } = await startServer(route({
    '/abs': (req, res) => { res.writeHead(200); res.end(); },
  }));
  try {
    const report = await checkUrls({ base, urls: [`${base}/abs`, '/abs'], timeoutMs: 2000 });
    assert.equal(report.checked[0].status, 200);
    assert.equal(report.checked[1].status, 200);
    assert.equal(report.truncated, false);
  } finally { server.close(); }
});

test("a malformed Location header on one URL doesn't take down the rest of the batch", async () => {
  const { server, base } = await startServer(route({
    '/broken': (req, res) => { res.writeHead(302, { location: 'http://[' }); res.end(); },
    '/healthy': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  try {
    const report = await checkUrls({ base, urls: ['/broken', '/healthy'], timeoutMs: 2000 });
    const [broken, healthy] = report.checked;
    assert.match(broken.error, /invalid redirect target/);
    assert.equal(healthy.status, 200);
  } finally { server.close(); }
});

test('checkUrl returns an error result for a malformed Location header (not a throw)', async () => {
  const { server, base } = await startServer(route({
    '/broken': (req, res) => { res.writeHead(302, { location: 'http://[' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/broken', { timeoutMs: 2000 });
    assert.match(result.error, /invalid redirect target/);
  } finally { server.close(); }
});

test('a mailto URL is skipped without fetching and without disrupting the batch', async () => {
  const { server, base } = await startServer(route({
    '/healthy': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  try {
    const report = await checkUrls({
      base,
      urls: ['mailto:x@example.com', '/healthy'],
      timeoutMs: 2000,
    });
    const [mail, healthy] = report.checked;
    assert.equal(mail.skipped, true);
    assert.equal(mail.error, undefined);
    assert.equal(healthy.status, 200);
  } finally { server.close(); }
});

test('a negative concurrency falls back to at least one worker', async () => {
  const { server, base } = await startServer(route({
    '/1': (req, res) => { res.writeHead(200); res.end(); },
    '/2': (req, res) => { res.writeHead(200); res.end(); },
  }));
  try {
    const report = await checkUrls({ base, urls: ['/1', '/2'], concurrency: -1, timeoutMs: 2000 });
    assert.equal(report.checked[0].status, 200);
    assert.equal(report.checked[1].status, 200);
  } finally { server.close(); }
});

test('the cli entry point still runs when its own path contains a space', async () => {
  const { server, base } = await startServer(route({
    '/ok': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store hand-'));
  try {
    const copiedScript = path.join(tmpDir, 'check-urls.mjs');
    fs.copyFileSync(SCRIPT_PATH, copiedScript);
    const inputFile = path.join(tmpDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify({ base, urls: ['/ok'] }));

    // execFile (async), not execFileSync: the mock server above lives in this
    // same process, so a *synchronous* child_process call would block this
    // process's event loop and the server could never answer the child's
    // request — a self-deadlock, not a bug in the script under test.
    const { stdout } = await execFileAsync(process.execPath, [copiedScript, inputFile]);
    const report = JSON.parse(stdout);
    assert.equal(report.checked[0].status, 200);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
