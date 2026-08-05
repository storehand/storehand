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

## Step 0 — Find the plugin

`$CLAUDE_PLUGIN_ROOT` is empty in the environment of a Bash tool call. That is
measured, not assumed; the working routes and the reasoning are in
`shared/plugin-root.md`. Run this once, before anything else:

```bash
ROOT=$( {
  printf '%s\n' "${CLAUDE_PLUGIN_ROOT:-}"
  printf '%s' "$PATH" | tr ':' '\n' | sed -n 's|/bin$||p' | grep -E '/storehand/[^/]+$'
  node -e 'const fs=require("fs"),os=require("os"),p=require("path");try{const j=JSON.parse(fs.readFileSync(p.join(os.homedir(),".claude","plugins","installed_plugins.json"),"utf8"));for(const[k,v]of Object.entries(j.plugins||{}))if(k.split("@")[0]==="storehand"&&v[0]&&v[0].installPath){console.log(v[0].installPath);break}}catch{}' 2>/dev/null
} | while IFS= read -r c; do
  [ -n "$c" ] && [ -f "$c/shared/api-version.md" ] && { printf '%s' "$c"; break; }
done )
[ -n "$ROOT" ] && echo "StoreHand plugin root: $ROOT" || echo "StoreHand plugin root NOT FOUND"
```

Shell state does not survive between tool calls, so there is nothing to export
into: take the path it printed and **substitute it literally** wherever these
instructions write `$CLAUDE_PLUGIN_ROOT`. Never guess it.

Printed `NOT FOUND`? Stop, and tell the user to reinstall the plugin with
`/plugin marketplace add storehand/storehand`.

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` and
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md` before you start.

## Step 1 — Load the profile and the memory

Read `.storehand/store.yaml`: you need `store` and the store's timezone. No
`.storehand/`? Point the user at `/storehand:storehand-setup` and stop.

Read `.storehand/state.json` and keep the **whole object** in hand — other
skills store their keys there and they must survive your write in Step 5. Under
`weeklyReport` you may find `lastWeekReported` (an ISO week like `2026-W31`).

- **File absent, or no `weeklyReport` key** → this is the first report: say so.
- **`lastWeekReported` equals the week you are about to report** → say the
  report is unchanged since the last run and ask whether to print it again,
  rather than presenting old news as new.
- **File present but unparseable** → say so in the report, run anyway, and do
  **not** write `state.json` at the end. Overwriting a file you could not parse
  destroys another skill's memory along with your own.

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
column: four candidate names were tried against a live store on 2026-08-05 and
every one returned `Column Not Found`. If a merchant asks for returning
customers, say the metric is not available through this interface. Do not guess
a seventh name.

**Read the column list, not the labels.** `displayName` comes back translated
into the store's own language — `total_sales` arrives as "Totale omzet" on a
Dutch store. Match on `name` for every decision you make. `displayName` is safe
to print, and is the better label to print, because it matches what the owner
sees in their own admin. Never branch on `displayName`.

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
- **A present column can still hold `null`.** Measured on a live store on
  2026-08-05: with no orders in the week, `average_order_value` came back `null`
  while `total_sales` and `orders` came back `"0"`. Null is not zero and it is
  not a hundred percent drop. Print the row as `—` with a word for why, and
  never compute a percentage change from it or into it.

ShopifyQL fails loudly here, which is the opposite of the Admin API search
filters recorded in the probes of 2026-07-30. A bad ShopifyQL column is an
error; a bad Admin API filter term is silently ignored and returns everything.
Do not carry an instinct from one to the other.

### Layer 2 — was the answer right

`total_sales` and `orders` have a second, independent source: the order records
themselves. Fetch them for the same week with the query the briefing already
ships —

```bash
printf '%s' '{"query":"created_at:>='2026-07-28T00:00:00Z' AND created_at:<='2026-08-03T23:59:59Z'","first":250}' > "$V/o.json"
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
    Both figures are printed because it is not known which definition the
    gap comes from. Do not treat either as the corrected one.

### What cannot be checked

`sessions` and `conversion_rate` have **no second source**. Nothing else in the
Shopify API computes them, so there is nothing to compare against. Say this once
at the bottom of the report. Two verified numbers must not lend borrowed
credibility to two unverified ones sitting in the same table.

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

Three rules hold this shape together, and each exists because the obvious
alternative would need a number nobody measured:

1. **Nothing is suppressed.** Every metric appears every week, including the
   ones that barely moved. Hiding a quiet row needs a threshold, and no
   threshold here has been measured.
2. **Absolute values sit next to every percentage.** −37% on 42 orders is six
   orders. Show both and the reader sees the size without being told what to
   conclude.
3. **No verdict.** No severity words, no warning markers. Sort order carries the
   emphasis and asserts nothing.

Do not add a summary sentence that interprets the table. If the owner wants to
know why sessions fell, that is a different question and a different tool.

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
