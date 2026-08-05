/*
 * Rules that must not be edited away from skill #6.
 *
 * Assertions run against markdown hard-wrapped at 80 columns, so a phrase can
 * be split at any space. Match against `flat(...)`, never the raw text, except
 * where line structure is the point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

const raw = () => read('skills/weekly-store-report/SKILL.md');
const skill = () => flat(raw());

/** Every fenced code block in a markdown file, contents only. */
const codeBlocks = (text) =>
  [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

// --- shape, scope and routing ---------------------------------------------

test('the skill declares itself read-only and asks for no write scope', () => {
  assert.match(raw(), /^---\nname: weekly-store-report\n/);
  assert.match(raw(), /^Network: none$/m);
  assert.doesNotMatch(skill(), /write_products|write_files/, 'a read-only skill needs no write scope');
  assert.match(skill(), /never add `--allow-mutations`/i, 'say the rule out loud');
});

test('the description pushes the other three skills away by name', () => {
  const d = skill();
  for (const other of ['daily-store-briefing', 'store-health-check', 'seo-metadata-audit']) {
    assert.match(d, new RegExp(other), `the description must route away from ${other}`);
  }
});

test('no command in this skill passes --allow-mutations', () => {
  for (const block of codeBlocks(raw())) {
    assert.doesNotMatch(block, /--allow-mutations/, 'a command in this skill passes --allow-mutations');
  }
});

// --- memory ----------------------------------------------------------------

test('the memory is merged, never rebuilt', () => {
  assert.match(skill(), /whole object/i, 'rebuilding state.json erases another skill memory');
  assert.match(skill(), /weeklyReport/, 'the skill needs its own state key');
});

test('an unparseable state file never gets overwritten', () => {
  assert.match(
    skill(),
    /do \*\*not\*\* write `state\.json`|do not write `state\.json`/i,
    'overwriting a file you could not parse destroys another skill memory',
  );
});

test('the marker moves only after a report that was actually printed', () => {
  assert.match(skill(), /only after a successful report/i);
});

// --- the period ------------------------------------------------------------

test('only whole closed weeks are compared', () => {
  const s = skill();
  assert.match(s, /Monday/i, 'the week boundary must be stated, not implied');
  assert.match(s, /last \*\*closed\*\* week|last closed week/i);
  assert.match(
    s,
    /never compare a partial week/i,
    'three days against seven manufactures a column of false negatives',
  );
});

test('a mid-week run says which week it covered', () => {
  assert.match(skill(), /still running/i, 'the reader must not think this covers today');
});

// --- the query and its columns ---------------------------------------------

test('the ShopifyQL wrapper is read-only and asks for parse errors', () => {
  const q = read('skills/weekly-store-report/queries/shopifyql.graphql');
  assert.doesNotMatch(q, /\bmutation\b/i);
  assert.match(q, /\$query: String!/, 'the ShopifyQL body is a variable, never inlined');
  assert.match(q, /parseErrors/, 'without this the skill cannot tell a bad query from no data');
  assert.match(q, /rows/, 'the field is rows, typed JSON — not rowData');
});

test('only measured column names appear in the skill', () => {
  const s = skill();
  for (const column of [
    'total_sales', 'net_sales', 'orders', 'average_order_value',
    'sessions', 'conversion_rate',
  ]) {
    assert.match(s, new RegExp(column), `${column} was measured and belongs here`);
  }
  for (const dead of [
    'returning_customer_rate', 'first_time_customer_sales', 'customer_type',
  ]) {
    assert.doesNotMatch(s, new RegExp(dead), `${dead} returned Column Not Found — it must not appear`);
  }
});

test('logic keys off the column name, never the display name', () => {
  const s = skill();
  assert.match(s, /displayName/, 'displayName returns in the store language — the skill must say so');
  assert.match(s, /Never branch on `displayName`/i);
});

// --- the two-layer re-check -------------------------------------------------

test('layer 1 refuses to read a number out of a failed query', () => {
  const s = skill();
  assert.match(s, /parseErrors/, 'the skill must check parse errors before reading rows');
  assert.match(
    s,
    /never report a number you did not measure/i,
    'the house rule belongs in the skill, not only in the README',
  );
});

test('a null value is not treated as zero', () => {
  const s = skill();
  assert.match(
    s,
    /Null is not zero/i,
    'average_order_value returns null on a week with no orders — measured 2026-08-05',
  );
  assert.match(s, /never compute a percentage change from it/i);
});

test('layer 2 measures revenue and orders a second time', () => {
  const s = skill();
  assert.match(s, /orders-since\.graphql/, 'reuse the briefing query, do not write a second one');
  assert.match(s, /cross-check/i);
});

test('a disagreement prints both numbers and is never resolved silently', () => {
  const s = skill();
  assert.match(s, /both numbers/i, 'picking a winner is indistinguishable from not checking');
  assert.match(s, /unexplained/i, 'the gap is unexplained, not wrong — the definitions may differ');
  assert.doesNotMatch(
    s,
    /tolerance of \d|within \d+ cents?|margin of \d/i,
    'no tolerance has been measured yet; hard-coding one invents the number this skill refuses to invent',
  );
});

test('the cross-check carries a worked example of both outcomes', () => {
  const s = skill();
  assert.match(s, /they agree/i, 'show what agreement looks like');
  assert.match(s, /do not match/i, 'show what a disagreement looks like');
});

test('sessions and conversion are labelled unverifiable', () => {
  const s = skill();
  assert.match(s, /no second source/i);
  assert.match(
    s,
    /nothing else in the Shopify API computes them/i,
    'say why, or a later editor will "fix" it by inventing a check',
  );
});

// --- the report shape -------------------------------------------------------

test('rows are sorted by size of change and nothing is suppressed', () => {
  const s = skill();
  assert.match(s, /largest first/i);
  assert.match(s, /every metric appears every week/i, 'suppression needs a cutoff nobody measured');
});

test('an absolute pair sits next to every percentage', () => {
  assert.match(
    skill(),
    /absolute values sit next to every percentage/i,
    'minus 37 percent on 42 orders is six orders — the reader must be able to see that',
  );
});

test('the report carries no severity vocabulary', () => {
  const s = skill();
  for (const verdict of [/\bsignificant\b/i, /\bweak signal\b/i, /\bsevere\b/i, /⚠/]) {
    assert.doesNotMatch(s, verdict, 'a verdict needs a cutoff, and no cutoff here was measured');
  }
});

// --- the promise made in public --------------------------------------------

test('the README says exactly which path has never run', () => {
  const r = flat(read('README.md'));
  assert.match(r, /`weekly-store-report`/);
  assert.match(
    r,
    /cross-check has never fired against non-zero data/i,
    'the honest sentence is more specific than "partly tested"',
  );
});

test('the plugin description no longer calls weekly reports upcoming', () => {
  const d = JSON.parse(read('.claude-plugin/plugin.json')).description;
  assert.doesNotMatch(d, /On the way:[^.]*weekly report/i, 'it ships now');
});
