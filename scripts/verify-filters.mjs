#!/usr/bin/env node
/*
 * Checks that every `query:` filter field this repo relies on is actually
 * understood by the Shopify API of the pinned version.
 *
 * Why this exists: Shopify silently ignores an unknown *field* name and hands
 * back the unfiltered list, while an unknown *value* on a known field matches
 * nothing. Both come back HTTP 200 with no warning. A typo in a field name is
 * therefore invisible and points the wrong way — the briefing would report
 * every order as a payment problem, and the health check would pull draft
 * products into a report about the live store. Renames on Shopify's side land
 * in the same trap without a single line of our code changing.
 *
 * The trick: ask a known field for a value nothing can match. A working field
 * returns zero rows; an ignored one returns everything. That separates the two
 * without needing a store that happens to hold a mix of data.
 *
 * Maintainer tool, not part of `npm test`: it needs a connected store. The
 * verdict logic below is unit-tested; the CLI around it is a thin shell.
 *
 * Usage: node scripts/verify-filters.mjs <store-domain>
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const IMPOSSIBLE_VALUE = 'zzz-storehand-no-such-value-9f3a';
const IMPOSSIBLE_FUTURE = ">'2999-01-01T00:00:00Z'";
const PROBE_FIRST = 250;
const PROBE_TIMEOUT_MS = 60000;

// One entry per filter field used by a query in skills/*/queries/.
// `impossible` is the filter fragment appended to the field name.
export const FILTER_FIELDS = [
  { field: 'status', resource: 'products', impossible: `:${IMPOSSIBLE_VALUE}` },
  { field: 'financial_status', resource: 'orders', impossible: `:${IMPOSSIBLE_VALUE}` },
  { field: 'cancelled_at', resource: 'orders', impossible: IMPOSSIBLE_FUTURE },
  { field: 'created_at', resource: 'orders', impossible: IMPOSSIBLE_FUTURE },
  { field: 'updated_at', resource: 'orders', impossible: IMPOSSIBLE_FUTURE },
  { field: 'inventory_quantity', resource: 'productVariants', impossible: ':<=-999999999' },
];

export function verdictFor({ unfiltered, impossible }) {
  if (typeof unfiltered !== 'number' || typeof impossible !== 'number') return 'inconclusive';
  // An empty resource makes "everything" and "nothing" the same list, so the
  // probe cannot tell a working filter from an ignored one. Say so.
  if (unfiltered === 0) return 'inconclusive';
  if (impossible === 0) return 'ok';
  if (impossible === unfiltered) return 'ignored';
  return 'suspect';
}

export function summarise(results) {
  const ignored = results.filter((r) => r.verdict === 'ignored').map((r) => r.field);
  const suspect = results.filter((r) => r.verdict === 'suspect').map((r) => r.field);
  const inconclusive = results.filter((r) => r.verdict === 'inconclusive').map((r) => r.field);
  const proven = results.filter((r) => r.verdict === 'ok').map((r) => r.field);
  return { proven, ignored, suspect, inconclusive, failed: ignored.length > 0 || suspect.length > 0 };
}

function probeQuery(resource) {
  return `query Probe($query: String!, $first: Int!) {\n` +
    `  ${resource}(first: $first, query: $query) { nodes { id } }\n}\n`;
}

async function countFor(store, resource, filter, workDir) {
  const queryFile = path.join(workDir, `${resource}.graphql`);
  const variableFile = path.join(workDir, `vars-${resource}-${Buffer.from(filter).toString('hex').slice(0, 12)}.json`);
  fs.writeFileSync(queryFile, probeQuery(resource));
  fs.writeFileSync(variableFile, JSON.stringify({ query: filter, first: PROBE_FIRST }));
  const { stdout } = await execFileAsync(
    'shopify',
    ['store', 'execute', '--store', store, '--json', '--query-file', queryFile, '--variable-file', variableFile],
    { timeout: PROBE_TIMEOUT_MS },
  );
  // Empty stdout means the call failed — the CLI puts its error box on stderr.
  if (!stdout.trim()) throw new Error('empty response from shopify store execute');
  const parsed = JSON.parse(stdout);
  // `shopify store execute --json` already unwraps the GraphQL `data` envelope
  // and prints `{ "<resource>": { … } }`. Accept the wrapped shape too rather
  // than depending on that staying true across CLI versions.
  const nodes = (parsed?.data?.[resource] ?? parsed?.[resource])?.nodes;
  if (!Array.isArray(nodes)) {
    const message = parsed?.errors?.[0]?.message ?? `no nodes in response: ${stdout.slice(0, 120)}`;
    throw new Error(message);
  }
  return nodes.length;
}

async function main() {
  const store = process.argv[2];
  if (!store) {
    console.error('usage: node scripts/verify-filters.mjs <store-domain>');
    process.exit(1);
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storehand-filters-'));
  const results = [];
  try {
    for (const { field, resource, impossible } of FILTER_FIELDS) {
      let unfiltered = null;
      let impossibleCount = null;
      let error;
      try {
        unfiltered = await countFor(store, resource, '', workDir);
        impossibleCount = await countFor(store, resource, `${field}${impossible}`, workDir);
      } catch (caught) {
        error = caught.message;
      }
      const verdict = error ? 'inconclusive' : verdictFor({ unfiltered, impossible: impossibleCount });
      results.push({ field, resource, unfiltered, impossible: impossibleCount, verdict, error });
      const detail = error ? `error: ${error}` : `unfiltered ${unfiltered}, impossible ${impossibleCount}`;
      console.log(`${verdict.padEnd(13)} ${resource}.${field}  (${detail})`);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const summary = summarise(results);
  if (summary.inconclusive.length > 0) {
    console.log(`\nUnproven (no data to narrow, or the call failed): ${summary.inconclusive.join(', ')}`);
  }
  if (summary.failed) {
    console.error(`\nFAIL — these fields do not filter: ${[...summary.ignored, ...summary.suspect].join(', ')}`);
    process.exit(1);
  }
  // "Nothing was disproven" is not "everything is fine". Six failed calls must
  // never read like a pass — that is the exact silent-success shape this
  // script exists to catch elsewhere.
  if (summary.proven.length === 0) {
    console.error('\nNOTHING PROVEN — not a single field could be checked. This is not a pass.');
    process.exit(1);
  }
  console.log(`\n${summary.proven.length} of ${results.length} fields proven to narrow; the rest unproven.`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().catch((error) => { console.error(`verify-filters failed: ${error.message}`); process.exit(1); });
}
