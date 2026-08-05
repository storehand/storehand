/*
 * The two manifests must agree.
 *
 * Measured failure, not a hypothetical: at 0.4.0 the release commit touched
 * plugin.json and left marketplace.json on 0.3.0, where it sat for two releases
 * still advertising the SEO audit as upcoming. Nothing noticed, because nothing
 * was looking. marketplace.json is what a new user reads at
 * `/plugin marketplace add`, and Claude Code decides whether an installed
 * plugin updates on the version number alone — so a stale number here does not
 * merely misinform, it withholds the release.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

const plugin = () => json('.claude-plugin/plugin.json');
const listing = () => json('.claude-plugin/marketplace.json').plugins[0];

test('both manifests carry the same version', () => {
  assert.equal(
    listing().version,
    plugin().version,
    'marketplace.json fell two releases behind plugin.json once already',
  );
});

test('the version is a plain semver triple', () => {
  assert.match(plugin().version, /^\d+\.\d+\.\d+$/);
});

test('both manifests carry the same description', () => {
  assert.equal(
    listing().description,
    plugin().description,
    'the marketplace listing is what a new user reads first — it must not drift',
  );
});

test('the description does not promise a skill that already shipped', () => {
  const d = plugin().description;
  const shipped = fs
    .readdirSync(path.join(REPO, 'skills'))
    .filter((name) => name !== 'storehand-setup');

  const onTheWay = /On the way:([^.]*)\./.exec(d);
  assert.ok(onTheWay, 'the description must say what is still coming, even if that is nothing');

  for (const name of shipped) {
    const words = name.split('-').filter((w) => w.length > 3);
    const promised = words.every((w) => new RegExp(w, 'i').test(onTheWay[1]));
    assert.ok(!promised, `${name} has shipped but is still listed under "On the way"`);
  }
});

test('the changelog has a section for the current version', () => {
  const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
  assert.match(
    changelog,
    new RegExp(`^## \\[${plugin().version.replace(/\./g, '\\.')}\\]`, 'm'),
    'a version bump without a changelog entry ships changes nobody can read',
  );
});
