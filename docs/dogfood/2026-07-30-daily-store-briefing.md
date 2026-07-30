# 2026-07-30 — Query verification for `daily-store-briefing`

Store: a live Shopify store with 42 products, 356 variants and **zero orders**
(no payment provider connected yet). Admin API version `2026-07`.

**Route caveat, read this first.** These queries were run against the Admin API
through an existing custom app on the store, **not** through
`shopify store execute`. So this run proves the GraphQL and the search filters;
it does not yet prove the CLI path that the skill actually uses. That smoke test
is still open — see "Still unverified" below.

## What passed

All four query files are schema-valid on `2026-07`. Every field resolves,
including the ones most likely to be wrong: `sourceName`, `cancelReason`,
`totalRefundedSet`, `displayFinancialStatus`, `inventoryQuantity`.

| Query | Result |
|---|---|
| `orders-since.graphql` | 0 rows (store has no orders), no errors |
| `payment-problems.graphql` | 0 rows, no errors |
| `cancellations-and-refunds.graphql` | 0 + 0 rows, no errors |
| `low-stock.graphql` | 113 rows — see finding 2 |

Search syntax, checked against known truth on products (42 total, newest created
2026-07-22):

| Filter | Result | Correct? |
|---|---|---|
| `created_at:>'2026-07-23T00:00:00Z'` | 0 | yes |
| `created_at:<'2026-07-23T00:00:00Z'` | 42 | yes |
| `created_at:>'2026-07-21T00:00:00Z'` | 38 | yes |
| `created_at:>2026-07-23T00:00:00Z` (unquoted) | 0 | yes — quotes are optional |
| `created_at:<'…' AND (status:active OR status:draft)` | 42 | yes — grouping works |

## Finding 1 — an unrecognised filter field is silently ignored

```
onzin_veld:<=5              → 100 of 100 variants, unfiltered
created_at:>'…' (valid)     → correctly filtered
onzin:>'2026-07-23…'        → 42 of 42 products, unfiltered
```

No error, no warning, no hint in the response. A typo in a filter turns a
targeted query into "fetch everything" and the caller cannot tell.

For a briefing this is the worst possible failure mode: a misspelled date filter
would report every order the store ever had as "new since your last briefing".

**Fixed by:** a re-check step in the skill (Step 3b) plus a general rule in
`shared/safety.md` — a filter narrows, it never proves. Every returned record is
checked against the criterion before it reaches the report.

## Finding 2 — the variant search index lags, so range filters return stale hits

Truth, by fetching all 356 variants and counting: **112** variants hold 5 units
or fewer.

```
inventory_quantity:<=5      → 113 rows, one of them holding 24 units
inventory_quantity:<6       → same 113 rows
inventory_quantity:<'6'     → same 113 rows
-inventory_quantity:>5      → same 113 rows
inventory_quantity:[0 TO 5] → 0 rows (this syntax is not supported)
inventory_quantity:5        → 4 rows, all holding exactly 5 (exact match works)
```

So the filter is roughly right but not authoritative: the search index had not
caught up with a stock change. False positives are visible and can be dropped;
**false negatives cannot** — a variant that just dropped to 2 may not appear yet.

**Fixed by:** the same re-check step. The query keeps the filter to fetch less,
the skill drops anything above the threshold, and the skill says so when a lot of
records fail the re-check, because that is the signal that records may also be
missing.

Documented in the query file itself so the next person does not rediscover it.

## Still unverified

1. **The CLI path.** `shopify store auth` + `shopify store execute` has not run
   yet. That is what the skill actually calls, so it remains the last open
   question before this skill can be called done.
2. **Order-specific filters.** `financial_status:…` and `cancelled_at:…` could
   not be proven, because the store has no orders and — per finding 1 — an
   ignored filter and an empty result look identical. The date and grouping
   syntax they rely on is proven; the field names are not.
3. **A real morning.** This is a verification run, not a briefing. The skill has
   not yet produced a report a human read over coffee, which is the actual bar.

## What was awkward

Building the `--variables` JSON inline in a shell string was the first thing to
break, and it broke quietly. Writing the variables to a file and passing
`--variable-file` removed the whole class of problem; that is now how every query
in the skill is called.
