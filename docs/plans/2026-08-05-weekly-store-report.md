# weekly-store-report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship StoreHand skill #6 — a read-only weekly report that says what changed against the previous whole week across revenue, orders, average order value, sessions and conversion, cross-checks the two figures that have a second source, and prints no verdict it did not measure.

**Architecture:** One read-only skill, no new shared files. `SKILL.md` steers the user's own Claude through the established Step 0–5 shape; the plugin contributes one GraphQL query file that wraps ShopifyQL. The cross-check reuses `daily-store-briefing`'s existing orders query rather than adding a second way to ask the same question. Nothing writes to the store and no write scope is requested.

**Tech Stack:** Markdown skills · ShopifyQL through the Admin GraphQL `shopifyqlQuery` field via the official Shopify CLI · Node's built-in test runner (`node --test`) · profile and memory under `.storehand/`.

**Design doc:** `/root/toekomst-plan/docs/specs/2026-08-05-ontwerp-skill-6-weekly-store-report.md`. Read it before Task 1. Where this plan and the design disagree, the design wins.

**Probe evidence:** `docs/dogfood/2026-08-05-shopifyql-probes.md`. Every column name in this plan was executed against a live store before being written down. Do not substitute a column name that is not in that file.

---

## A note on what "tested" means in this repository

StoreHand skills are prose. The logic lives in `SKILL.md` and is executed by the
user's Claude, not by a runtime this repository ships. So a test here asserts
that **the skill states the rule** — see `tests/seo-audit.test.mjs` for the
established idiom. Do not invent a JavaScript runtime for skill logic; that is a
new pattern and it is not in this plan.

Where the design says the cross-check must be exercised against fabricated
numbers, that is done the way the briefing does it: a **worked example inside
the skill** with real-looking figures showing both outcomes, plus a test
asserting the example is there. This is Task 6.

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `skills/weekly-store-report/SKILL.md` | The whole skill: Steps 0–5, the report shape, the rules |
| `skills/weekly-store-report/queries/shopifyql.graphql` | One reusable wrapper around the `shopifyqlQuery` field, ShopifyQL body passed as a variable |
| `tests/weekly-report.test.mjs` | Assertions that pin the rules this skill must not lose |

**Modify:**

| Path | Change |
|---|---|
| `README.md` | Add to "What ships today"; move roadmap row 6 to shipped-with-disclosure; add the disclosure itself |
| `.claude-plugin/plugin.json` | Description still says "On the way: price watching and weekly reports" |
| `docs/dogfood/2026-08-05-weekly-store-report.md` | New: the run record (Task 10) |

**Reuse, do not copy:** `skills/daily-store-briefing/queries/orders-since.graphql`
already fetches orders in a window with `totalPriceSet`. The cross-check calls
that file by path. Writing a second orders query is how the two drift apart.

---

## Task 1: Skill skeleton, frontmatter and routing

**Files:**
- Create: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/weekly-report.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../skills/weekly-store-report/SKILL.md'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/weekly-store-report/SKILL.md`:

```markdown
---
name: weekly-store-report
description: Read-only weekly report on what changed in a Shopify store against the previous whole week — revenue, orders, average order value, sessions and conversion, with the figures that have a second source cross-checked against the order records. Use when the user asks how last week went, for a weekly report, week-on-week numbers, or whether sales or conversion are moving. Not for today or yesterday, which is `daily-store-briefing`; not for things that are broken or missing, which is `store-health-check`; not for product copy or metadata quality, which is `seo-metadata-audit`.
---

# Weekly store report

What changed since the week before. One read-only run per week. It writes
nothing to the store and asks for no write scope — **never add
`--allow-mutations`** to any command in this skill.

Network: none

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md` and the `queries/` directory — live under the plugin's install
directory. The store profile (`.storehand/`) lives in the user's working
directory.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 2 tests

- [ ] **Step 5: Verify the plugin validator accepts the new skill**

Run: `npm test`
Expected: all tests pass. `tests/validate-plugin.test.mjs` and the
`Network:`-declaration test in `tests/seo-audit.test.mjs` both sweep every
directory under `skills/`, so a malformed skill fails here rather than at
install time.

- [ ] **Step 6: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly-store-report skeleton, read-only and routed"
```

---

## Task 2: Steps 0 and 1 — find the plugin, load the profile and memory

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `the skill needs its own state key`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`. Copy Step 0 **verbatim** from
`skills/seo-metadata-audit/SKILL.md` lines 20–45 — it is the measured
plugin-root routine and it must not be paraphrased. Then add:

```markdown
## Step 1 — Load the profile and the memory

Read `.storehand/store.yaml`: you need `store`. No `.storehand/`? Point the user
at `/storehand:storehand-setup` and stop.

Read `.storehand/state.json` and keep the **whole** object in hand — other
skills store their keys there and they must survive your write in Step 5. Under
`weeklyReport` you may find `lastWeekReported` (an ISO week like `2026-W31`).

- **File absent, or no `weeklyReport` key** → this is the first report: say so.
- **`lastWeekReported` equals the week you are about to report** → say the
  report is unchanged since the last run and ask whether to print it again,
  rather than presenting old news as new.
- **File present but unparseable** → say so in the report, run anyway, and do
  **not** write `state.json` at the end. Overwriting a file you could not parse
  destroys another skill's memory along with your own.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly report loads the profile and merges its memory"
```

---

## Task 3: Step 2 — whole calendar weeks only

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `the week boundary must be stated, not implied`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`:

```markdown
## Step 2 — Work out the two weeks

Weeks run **Monday 00:00:00 to Sunday 23:59:59**, in the store's own timezone as
recorded in `.storehand/store.yaml`.

Report the last **closed** week — the most recent Sunday that has already
passed, and the six days before it. Compare it against the seven days before
that.

**Never compare a partial week against a whole one.** A Wednesday run that put
three days next to seven would print a column of negative percentages that mean
nothing, which is precisely the false signal this skill exists to avoid. If
today is not a Monday, say in the report which week was covered and that the
current one is still running.

State both ranges in the report header so the reader can check them:

    WEEK 31 · 28 Jul – 3 Aug          previous: 21–27 Jul
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly report compares whole closed weeks only"
```

---

## Task 4: The ShopifyQL query wrapper

**Files:**
- Create: `skills/weekly-store-report/queries/shopifyql.graphql`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
test('the ShopifyQL wrapper is read-only and asks for parse errors', () => {
  const q = read('skills/weekly-store-report/queries/shopifyql.graphql');
  assert.doesNotMatch(q, /\bmutation\b/i);
  assert.match(q, /\$query: String!/, 'the ShopifyQL body is a variable, never inlined');
  assert.match(q, /parseErrors/, 'without this the skill cannot tell a bad query from no data');
  assert.match(q, /rows/, 'the field is rows, typed JSON — not rowData');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `ENOENT ... queries/shopifyql.graphql`

- [ ] **Step 3: Write minimal implementation**

Create `skills/weekly-store-report/queries/shopifyql.graphql`:

```graphql
# One ShopifyQL query, executed through the Admin API. Read-only.
# Requires the read_reports scope, which Shopify's own CLI app grants on every
# authorization — StoreHand does not request it separately.
#
# $query example: "FROM sales SHOW total_sales, net_sales, orders,
#                  average_order_value SINCE 2026-07-28 UNTIL 2026-08-03"
#
# The field is `rows`, typed JSON. There is no `rowData` field; asking for one
# fails the whole query. Measured 2026-08-05.
query WeeklyShopifyQL($query: String!) {
  shopifyqlQuery(query: $query) {
    parseErrors
    tableData {
      columns {
        name
        dataType
        displayName
      }
      rows
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/queries/shopifyql.graphql tests/weekly-report.test.mjs
git commit -m "feat: read-only ShopifyQL wrapper with parse errors surfaced"
```

---

## Task 5: Step 3 — run the two ShopifyQL queries

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
/** Every fenced code block in a markdown file, contents only. */
const codeBlocks = (text) =>
  [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

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

test('no command in this skill passes --allow-mutations', () => {
  for (const block of codeBlocks(raw())) {
    assert.doesNotMatch(block, /--allow-mutations/, 'a command in this skill passes --allow-mutations');
  }
});

test('logic keys off the column name, never the display name', () => {
  assert.match(
    skill(),
    /displayName/,
    'displayName returns in the store language — the skill must say so',
  );
  assert.match(skill(), /never.{0,40}displayName|displayName.{0,60}never/is);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `total_sales was measured and belongs here`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`:

```markdown
## Step 3 — Run the queries

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned version,
pass `--version <handle>` on every call. All calls are read-only — **never add
`--allow-mutations`**. Write variables to a file, never inline, because quoting
damage is silent:

```bash
V="$(mktemp -d)"
printf '%s' '{"query":"FROM sales SHOW total_sales, net_sales, orders, average_order_value SINCE 2026-07-28 UNTIL 2026-08-03"}' > "$V/q.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/weekly-store-report/queries/shopifyql.graphql" \
  --variable-file "$V/q.json"
```

Four calls in total: the `sales` query and the `sessions` query, each for the
reported week and for the week before.

| Dataset | Columns |
|---|---|
| `FROM sales` | `total_sales`, `net_sales`, `orders`, `average_order_value` |
| `FROM sessions` | `sessions`, `conversion_rate` |

**These six are the whole list.** `orders` and `products` are not ShopifyQL
datasets — only `sales` and `sessions` are. There is no returning-customer
column: `returning_customer_rate`, a `customers` dataset, `customer_type` as a
dimension and per-type sales columns were all tried against a live store and all
returned `Column Not Found`. If a merchant asks for returning customers, say the
metric is not available through this interface. Do not guess a seventh name.

**Read the column list, not the labels.** `displayName` comes back translated
into the store's own language — `total_sales` arrives as "Totale omzet" on a
Dutch store. Match on `name` for every decision you make. `displayName` is safe
to print, and is the better label to print, because it matches what the owner
sees in their own admin.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly report runs the six measured ShopifyQL columns"
```

---

## Task 6: Step 3b — the two-layer re-check, with a worked example

This is the task that carries the skill. Everything else is plumbing.

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
test('layer 1 refuses to read a number out of a failed query', () => {
  const s = skill();
  assert.match(s, /parseErrors/, 'the skill must check parse errors before reading rows');
  assert.match(
    s,
    /never report a number you did not measure/i,
    'the house rule belongs in the skill, not only in the README',
  );
});

test('layer 2 measures revenue and orders a second time', () => {
  const s = skill();
  assert.match(s, /orders-since\.graphql/, 'reuse the briefing query, do not write a second one');
  assert.match(s, /total_sales/);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `the skill must check parse errors before reading rows`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`:

````markdown
## Step 3b — Re-check what came back

Every StoreHand skill re-checks its own output before printing it. An aggregate
has no records to walk, so this one checks in two layers.

### Layer 1 — was the question valid

Before reading a single row:

- `parseErrors` must be empty. If it is not, the query was wrong, not the store.
  Print the parse error and stop. **Never report a number you did not measure**,
  and a query that failed to parse measured nothing.
- Every column you asked for must appear in `columns`. A column that silently
  went missing is the same failure wearing a friendlier face.

ShopifyQL fails loudly here, which is the opposite of the Admin API search
filters documented in `docs/dogfood/2026-07-30-probes-filters-memory-shopifyql.md`.
A bad ShopifyQL column is an error; a bad Admin API filter term is silently
ignored and returns everything. Do not carry an instinct from one to the other.

### Layer 2 — was the answer right

`total_sales` and `orders` have a second, independent source: the order records
themselves. Fetch them for the same week with the query the briefing already
ships —

```bash
printf '%s' '{"query":"created_at:>=\x272026-07-28T00:00:00Z\x27 AND created_at:<=\x272026-08-03T23:59:59Z\x27","first":250}' > "$V/o.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/daily-store-briefing/queries/orders-since.graphql" \
  --variable-file "$V/o.json"
```

— then count the nodes and sum `totalPriceSet.shopMoney.amount`, and put the two
measurements of the same week side by side.

**Print both numbers whenever they differ. Never pick a winner.** A silent
preference for one source is indistinguishable from not having checked.

**There is no tolerance, deliberately.** `total_sales` is a defined Shopify
metric, not a synonym for "add up the order totals" — discounts, shipping, taxes
and returns may each sit on a different side of that definition. Until a run
against a store with real revenue establishes what the normal gap is and why,
report the difference as **unexplained**, not as wrong. Inventing a tolerance
before measuring one is exactly the move the rest of this skill refuses to make.

If `pageInfo.hasNextPage` is true on the orders query, say the cross-check
covered only the first 250 orders and is therefore incomplete. An incomplete
cross-check is not a passed one.

### What both outcomes look like

Agreement:

    Revenue and orders cross-checked against the order records: they agree.

Disagreement:

    Revenue and orders do not match the order records:
      ShopifyQL total_sales   €3,890.00
      Sum of 42 order records €4,102.50   difference €212.50, unexplained
    Both figures are printed because it is not known which definition
    the gap comes from. Do not treat either as the corrected one.

### What cannot be checked

`sessions` and `conversion_rate` have **no second source**. Nothing else in the
Shopify API computes them, so there is nothing to compare against. Say this once
at the bottom of the report. Two verified numbers must not lend borrowed
credibility to two unverified ones sitting in the same table.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: two-layer re-check, and a gap is unexplained rather than wrong"
```

---

## Task 7: Step 4 — the report shape

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
test('rows are sorted by size of change and nothing is suppressed', () => {
  const s = skill();
  assert.match(s, /largest first/i);
  assert.match(s, /every metric appears every week/i, 'suppression needs a cutoff nobody measured');
});

test('an absolute pair sits next to every percentage', () => {
  assert.match(
    skill(),
    /absolute/i,
    'minus 37 percent on 42 orders is six orders — the reader must be able to see that',
  );
});

test('the report carries no severity vocabulary', () => {
  const s = skill();
  for (const verdict of [/\bsignificant\b/i, /\bweak signal\b/i, /\bsevere\b/i, /⚠/]) {
    assert.doesNotMatch(s, verdict, 'a verdict needs a cutoff, and no cutoff here was measured');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `largest first`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`:

````markdown
## Step 4 — Report

Fixed shape. One table, sorted by size of change, **largest first** by absolute
percentage:

```
WEEK 31 · 28 Jul – 3 Aug          previous: 21–27 Jul

Conversion    1.9%   → 1.2%      −37%   (48 → 42 orders)
Sessions      2,140  → 1,510     −29%
Net revenue   €3,980 → €3,610     −9%
AOV           €85.80 → €92.60     +8%
Orders        48     → 42         −7%
Revenue       €4,120 → €3,890     −6%

Revenue and orders cross-checked against the order records: they agree.
Sessions and conversion come from ShopifyQL only — nothing else in the
Shopify API computes them, so they are reported unverified.
```

Three rules hold this shape together, and each one exists because the obvious
alternative would require a number nobody measured:

1. **Nothing is suppressed.** Every metric appears every week, including the
   ones that barely moved. Hiding a quiet row needs a threshold, and no
   threshold here has been measured.
2. **Absolute values sit next to every percentage.** −37% on 42 orders is six
   orders. Show both figures and the reader can see the size for themselves
   without being told what to conclude.
3. **No verdict.** No "significant", no "weak", no warning markers. Sort order
   carries the emphasis and asserts nothing.

Do not add a summary sentence that interprets the table. If the owner wants to
know why sessions fell, that is a different question and a different tool.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly report prints every row, sorted, with no verdict"
```

---

## Task 8: Step 5 — update the marker

**Files:**
- Modify: `skills/weekly-store-report/SKILL.md`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
test('the marker moves only after a report that was actually printed', () => {
  assert.match(skill(), /only after a successful report/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `only after a successful report`

- [ ] **Step 3: Write minimal implementation**

Append to `skills/weekly-store-report/SKILL.md`:

```markdown
## Step 5 — Update the marker

**Only after a successful report**, write `.storehand/state.json`: take the
object from Step 1, replace only the `weeklyReport` key with
`{ "lastWeekReported": "<ISO week, e.g. 2026-W31>", "lastRunAt": "<now, ISO 8601 UTC>" }`,
and write the **whole object** back. A skill that rebuilds this file from
scratch erases another skill's memory along with its own.

A run that stopped at a parse error, or one where the state file could not be
parsed in Step 1, writes nothing.

## Errors — never report a number you did not measure

- Parse error from ShopifyQL → print it, report nothing from that query.
- A column missing from `columns` → treat it as absent, not as zero.
- Orders query failed → the cross-check did not happen. Say that, and do not
  present the ShopifyQL figures as verified.
- Store timezone missing from the profile → ask for it rather than assuming UTC.
  A week boundary in the wrong timezone moves revenue between weeks.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/weekly-report.test.mjs`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add skills/weekly-store-report/SKILL.md tests/weekly-report.test.mjs
git commit -m "feat: weekly report marker moves only on a printed report"
```

---

## Task 9: README and plugin description, with the disclosure

**Files:**
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`
- Test: `tests/weekly-report.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/weekly-report.test.mjs`:

```javascript
const flatReadme = () => flat(read('README.md'));

test('the README says exactly which path has never run', () => {
  const r = flatReadme();
  assert.match(r, /`weekly-store-report`/);
  assert.match(
    r,
    /cross-check has never fired against non-zero data/i,
    'the honest sentence is more specific than "partly tested"',
  );
});

test('the plugin description no longer calls weekly reports upcoming', () => {
  const d = JSON.parse(read('.claude-plugin/plugin.json')).description;
  assert.doesNotMatch(d, /On the way:.*weekly report/i, 'it ships now');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/weekly-report.test.mjs`
Expected: FAIL — `the honest sentence is more specific than "partly tested"`

- [ ] **Step 3: Write the implementation**

In `README.md`, add a row to the "What ships today" table, after
`product-listing-writer`:

```markdown
| `weekly-store-report` | Week-on-week change in revenue, orders, average order value, sessions and conversion, with revenue and orders cross-checked against the order records | No — local files only |
```

In the roadmap table, change row 6's status from `Planned` to
`Shipped, one path untested`.

Directly under the roadmap table, before the "Why 4 moved out of version 1"
paragraph, add:

```markdown
**What is untested in skill 6.** The ShopifyQL pipe is proven: every column it
reads was executed against a live store and the evidence is in
`docs/dogfood/`. What has not run is the cross-check. The store
available for testing has no payment provider, so revenue and orders are both
zero — and two zeroes always agree. **The cross-check has never fired against
non-zero data.** It may also turn out to report a gap every week on a real
store, because `total_sales` is a defined Shopify metric rather than a synonym
for summing order totals. That is why a gap is printed as *unexplained* rather
than *wrong*, and why this line is here instead of a claim that the skill is
fully exercised.
```

In `.claude-plugin/plugin.json`, replace `On the way: price watching and weekly
reports.` with `On the way: price watching.` and add the weekly report to the
list of what ships.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all tests pass. Note that `tests/seo-audit.test.mjs` asserts the
roadmap prose matches the table — if the shipped count changed, that test is the
one that will say so.

- [ ] **Step 5: Commit**

```bash
git add README.md .claude-plugin/plugin.json tests/weekly-report.test.mjs
git commit -m "docs: weekly report ships, and says which path never ran"
```

---

## Task 10: Dogfood run

**Files:**
- Create: `docs/dogfood/2026-08-05-weekly-store-report.md`

- [ ] **Step 1: Run the skill end to end against the connected store**

Use the store already connected in the working directory. Capture the real
commands and the real output, including the zeroes.

- [ ] **Step 2: Write the run record**

Create `docs/dogfood/2026-08-05-weekly-store-report.md` following the shape of
`docs/dogfood/2026-08-04-seo-metadata-audit.md`: what was run, the real output,
what was awkward, and a **"What is still untested"** section that names the
cross-check against non-zero revenue as the open item.

Do not describe the run as a validation of the report's arithmetic. It is a
validation of the plumbing.

- [ ] **Step 3: Commit**

```bash
git add docs/dogfood/2026-08-05-weekly-store-report.md
git commit -m "docs: dogfood run for the weekly report, zeroes and all"
```

---

## Self-review notes

**Spec coverage.** Every section of the design maps to a task: metrics → Task 5,
period → Task 3, Step 3b both layers → Task 6, report shape → Task 7, routing →
Task 1, state → Tasks 2 and 8, testing → assertions throughout, the shipping
disclosure → Task 9.

**One deliberate deviation from the design.** The design's testing section says
"unit: the cross-check reports a disagreement rather than choosing a side". This
repository has no runtime for skill logic, so that is implemented as a worked
example inside the skill plus an assertion that the example exists (Task 6).
Building a JavaScript cross-check runtime would be a new pattern in this
codebase and is deliberately not in this plan. If it is wanted later, it is an
addition, not a correction.

**Not in scope.** No returning-customer metric. No interpretation layer above
the table. No tolerance for the cross-check until one has been measured.
