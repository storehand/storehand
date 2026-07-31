// tests/verify-filters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_FIELDS, IMPOSSIBLE_VALUE, verdictFor, summarise } from '../scripts/verify-filters.mjs';

// The probe in docs/dogfood/2026-07-30-probes-filters-memory-shopifyql.md
// established the mechanism this leans on: Shopify silently ignores an unknown
// *field* (the query returns everything) and matches nothing for an unknown
// *value* on a known field. So asking a known field for an impossible value
// separates the two without needing a store that has a mix of data.

test('a field that narrows to nothing on an impossible value is working', () => {
  assert.equal(verdictFor({ unfiltered: 42, impossible: 0 }), 'ok');
});

test('a field that still returns everything is being ignored', () => {
  assert.equal(verdictFor({ unfiltered: 42, impossible: 42 }), 'ignored');
});

test('an empty resource cannot prove anything either way', () => {
  assert.equal(verdictFor({ unfiltered: 0, impossible: 0 }), 'inconclusive');
});

test('a partial narrowing is not a pass — an impossible value must match nothing', () => {
  assert.equal(verdictFor({ unfiltered: 42, impossible: 7 }), 'suspect');
});

test('a count that could not be read is inconclusive, never a pass', () => {
  assert.equal(verdictFor({ unfiltered: null, impossible: 0 }), 'inconclusive');
  assert.equal(verdictFor({ unfiltered: 42, impossible: null }), 'inconclusive');
});

test('every filter field the repo queries with is covered', () => {
  const fields = FILTER_FIELDS.map((f) => f.field);
  for (const expected of ['status', 'financial_status', 'cancelled_at', 'created_at', 'inventory_quantity']) {
    assert.ok(fields.includes(expected), `missing coverage for ${expected}`);
  }
});

test('the impossible value is unlikely enough that a real record cannot match it', () => {
  assert.match(IMPOSSIBLE_VALUE, /storehand/);
  assert.ok(IMPOSSIBLE_VALUE.length > 12);
});

test('one ignored field fails the summary even when the rest pass', () => {
  const summary = summarise([
    { field: 'status', verdict: 'ok' },
    { field: 'financial_status', verdict: 'ignored' },
    { field: 'created_at', verdict: 'ok' },
  ]);
  assert.equal(summary.failed, true);
  assert.deepEqual(summary.ignored, ['financial_status']);
});

test('inconclusive results are reported but do not fail the run', () => {
  const summary = summarise([
    { field: 'status', verdict: 'ok' },
    { field: 'cancelled_at', verdict: 'inconclusive' },
  ]);
  assert.equal(summary.failed, false);
  assert.deepEqual(summary.inconclusive, ['cancelled_at']);
});

test('a suspect result fails too — a filter that half works is not proven', () => {
  const summary = summarise([{ field: 'status', verdict: 'suspect' }]);
  assert.equal(summary.failed, true);
});

test('a run where nothing could be checked proves nothing — proven stays empty', () => {
  const summary = summarise([
    { field: 'status', verdict: 'inconclusive' },
    { field: 'created_at', verdict: 'inconclusive' },
  ]);
  assert.deepEqual(summary.proven, []);
  assert.equal(summary.failed, false, 'no field was disproven either');
});
