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
