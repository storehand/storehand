// tests/check-urls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { checkUrl, checkUrls } from '../skills/store-health-check/scripts/check-urls.mjs';

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

test('een gewone 200 komt terug als status 200 zonder vlaggen', async () => {
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

test('een onbestaand pad komt terug als 404', async () => {
  const { server, base } = await startServer(route({}));
  try {
    const result = await checkUrl(base, '/weg', { timeoutMs: 2000 });
    assert.equal(result.status, 404);
  } finally { server.close(); }
});

test('redirect naar /password wordt gevlagd en niet verder gevolgd', async () => {
  const { server, base } = await startServer(route({
    '/dicht': (req, res) => { res.writeHead(302, { location: '/password' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/dicht', { timeoutMs: 2000 });
    assert.equal(result.passwordPage, true);
    assert.match(result.finalUrl, /\/password$/);
  } finally { server.close(); }
});

test('redirect naar een ander domein wordt gevlagd en niet opgehaald', async () => {
  const { server, base } = await startServer(route({
    '/ext': (req, res) => { res.writeHead(301, { location: 'https://elders.example/x' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/ext', { timeoutMs: 2000 });
    assert.equal(result.offDomain, true);
    assert.equal(result.finalUrl, 'https://elders.example/x');
  } finally { server.close(); }
});

test('een redirectketen binnen het domein wordt gevolgd tot de eindstatus', async () => {
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

test('een hangend antwoord wordt een timeout-fout, geen crash', async () => {
  const { server, base } = await startServer(route({
    '/traag': () => { /* nooit antwoorden */ },
  }));
  try {
    const result = await checkUrl(base, '/traag', { timeoutMs: 150 });
    assert.equal(result.error, 'timeout');
    assert.equal(result.status, undefined);
  } finally { server.close(); }
});

test('checkUrls respecteert de cap en meldt afkapping', async () => {
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

test('absolute URLs op hetzelfde domein en relatieve paden werken allebei', async () => {
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

test('een misvormde Location-header op één URL laat de rest van de batch niet omvallen', async () => {
  const { server, base } = await startServer(route({
    '/kapot': (req, res) => { res.writeHead(302, { location: 'http://[' }); res.end(); },
    '/gezond': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  try {
    const report = await checkUrls({ base, urls: ['/kapot', '/gezond'], timeoutMs: 2000 });
    const [broken, healthy] = report.checked;
    assert.match(broken.error, /invalid redirect target/);
    assert.equal(healthy.status, 200);
  } finally { server.close(); }
});

test('checkUrl geeft een foutresultaat terug voor een misvormde Location-header (niet een throw)', async () => {
  const { server, base } = await startServer(route({
    '/kapot': (req, res) => { res.writeHead(302, { location: 'http://[' }); res.end(); },
  }));
  try {
    const result = await checkUrl(base, '/kapot', { timeoutMs: 2000 });
    assert.match(result.error, /invalid redirect target/);
  } finally { server.close(); }
});

test('een mailto-URL wordt overgeslagen zonder fetch en zonder de batch te verstoren', async () => {
  const { server, base } = await startServer(route({
    '/gezond': (req, res) => { res.writeHead(200); res.end('fine'); },
  }));
  try {
    const report = await checkUrls({
      base,
      urls: ['mailto:x@example.com', '/gezond'],
      timeoutMs: 2000,
    });
    const [mail, healthy] = report.checked;
    assert.equal(mail.skipped, true);
    assert.equal(mail.error, undefined);
    assert.equal(healthy.status, 200);
  } finally { server.close(); }
});
