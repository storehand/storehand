/*
 * Rules that must not be edited away.
 *
 * Two of these guard something this repository learned the hard way: a quality
 * threshold living in two skills will eventually disagree with itself, and a
 * network promise maintained by hand goes stale without anyone noticing. Both
 * are asserted here rather than trusted to prose.
 *
 * These assertions run against markdown that is hard-wrapped at 80 columns, so
 * a phrase can be split at any space. Match against `flat(...)`, never against
 * the raw text — a regex with a literal space in it passes or fails depending
 * on where the paragraph happened to wrap, which measures formatting instead of
 * meaning. Use the raw text only where line structure is the point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

const skillFiles = () =>
  fs
    .readdirSync(path.join(REPO, 'skills'))
    .map((name) => [`skills/${name}/SKILL.md`, read(`skills/${name}/SKILL.md`)]);

const writer = () => flat(read('skills/product-listing-writer/SKILL.md'));
const rules = () => flat(read('shared/metadata-rules.md'));

// --- one home for the thresholds ------------------------------------------

test('the thresholds live in shared/metadata-rules.md', () => {
  assert.match(rules(), /60/, 'the seo.title length threshold belongs here');
  assert.match(rules(), /155/, 'the seo.description length threshold belongs here');
});

test('no skill carries a threshold number of its own', () => {
  for (const [name, text] of skillFiles()) {
    for (const threshold of [/~?60 characters/, /~?155 characters/]) {
      assert.doesNotMatch(
        flat(text),
        threshold,
        `${name} repeats a threshold — it must read shared/metadata-rules.md instead`,
      );
    }
  }
});

test('every skill that judges metadata points at the shared rules', () => {
  for (const name of ['product-listing-writer', 'seo-metadata-audit']) {
    assert.match(
      flat(read(`skills/${name}/SKILL.md`)),
      /shared\/metadata-rules\.md/,
      `${name} must read the shared rules`,
    );
  }
});

// --- the alt-text rule ----------------------------------------------------

test('the duplicate-alt pattern is a rule, not folklore', () => {
  assert.match(
    rules(),
    /identical to the alt of another image on the same product/i,
    'measured: 429 of 429 images on a live store, and 0 empty ones',
  );
});

test('the writer no longer treats an empty field as the only alt problem', () => {
  assert.doesNotMatch(
    writer(),
    /`image\.alt` \| Empty or null\./,
    'the empty-only rule repaired nothing on a real store',
  );
});

test('an alt that already says something is left alone', () => {
  assert.match(writer(), /leave it alone/i);
});

test('the writer explains why a duplicate alt is the case worth fixing', () => {
  assert.match(
    writer(),
    /same alt on every photo/i,
    'without the reason, the next editor narrows this rule back to empty fields',
  );
});

// --- looking at the photos ------------------------------------------------

test('the alt text describes the product, not the model', () => {
  assert.match(writer(), /describe the product, not the model/i);
});

test('looking at a photo is measuring; deducing from it is not', () => {
  assert.match(writer(), /only what is visible/i);
  assert.match(writer(), /fabric|composition/i, 'name what must never be deduced');
});

test('photo reading is capped per product and per round', () => {
  assert.match(writer(), /3 images per product/i);
  assert.match(writer(), /30 images/i);
});

test('a partial fix is reported as partial', () => {
  assert.match(
    writer(),
    /say which images you covered/i,
    'images 4 and up keep their old alt — the audit will still flag the product',
  );
});

// --- the audit: query, front matter, sweep ---------------------------------

const audit = () => flat(read('skills/seo-metadata-audit/SKILL.md'));
const auditRaw = () => read('skills/seo-metadata-audit/SKILL.md');

test('the audit query paginates and is read-only', () => {
  const q = read('skills/seo-metadata-audit/queries/catalogue-metadata.graphql');
  assert.match(q, /\$after: String/, 'the sweep needs a cursor');
  assert.match(q, /endCursor/);
  assert.doesNotMatch(q, /\bmutation\b/i);
});

/** Every fenced code block in a markdown file, contents only. */
const codeBlocks = (text) =>
  [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

test('the audit declares itself read-only and asks for no write scope', () => {
  // raw: front matter is line structure, not prose
  assert.match(auditRaw(), /^---\nname: seo-metadata-audit\n/);
  assert.match(audit(), /Use when/);
  assert.doesNotMatch(audit(), /write_products/, 'a read-only skill needs no write scope');

  // Naming the flag in a prohibition is the point; running it is the problem.
  assert.match(audit(), /never add `--allow-mutations`/i, 'say the rule out loud');
  for (const block of codeBlocks(auditRaw())) {
    assert.doesNotMatch(
      block,
      /--allow-mutations/,
      'a command in this skill passes --allow-mutations',
    );
  }
});

test('the audit sweeps the whole catalogue instead of stopping at a page', () => {
  assert.match(audit(), /keep paging/i);
  assert.match(audit(), /every other skill stops/i, 'say why this one is different');
});
