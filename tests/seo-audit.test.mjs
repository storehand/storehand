/*
 * Rules that must not be edited away.
 *
 * Two of these guard something this repository learned the hard way: a quality
 * threshold that lives in two skills will eventually disagree with itself, and
 * a network promise that is maintained by hand goes stale without anyone
 * noticing. Both are asserted here rather than trusted to prose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const skillFiles = () =>
  fs
    .readdirSync(path.join(REPO, 'skills'))
    .map((name) => [`skills/${name}/SKILL.md`, read(`skills/${name}/SKILL.md`)]);

test('the thresholds live in shared/metadata-rules.md', () => {
  const rules = read('shared/metadata-rules.md');
  assert.match(rules, /60/, 'the seo.title length threshold belongs here');
  assert.match(rules, /155/, 'the seo.description length threshold belongs here');
});

test('no skill carries a threshold number of its own', () => {
  for (const [name, text] of skillFiles()) {
    for (const threshold of [/~?60 characters/, /~?155 characters/]) {
      assert.doesNotMatch(
        text,
        threshold,
        `${name} repeats a threshold — it must read shared/metadata-rules.md instead`,
      );
    }
  }
});

test('every skill that judges metadata points at the shared rules', () => {
  for (const name of ['product-listing-writer', 'seo-metadata-audit']) {
    assert.match(
      read(`skills/${name}/SKILL.md`),
      /shared\/metadata-rules\.md/,
      `${name} must read the shared rules`,
    );
  }
});
