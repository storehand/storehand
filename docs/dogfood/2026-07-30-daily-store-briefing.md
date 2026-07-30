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

## Second run, same day — through the CLI this time

`shopify store auth` and `shopify store execute` both work. Authenticated with a
store owner account, three read-only scopes, API version `2026-07`. All four
queries ran through `--query-file` + `--variable-file` exactly as the skill
prescribes.

Result of the first real briefing (first run, so a 24-hour window):

```
0 new orders · 0 payments needing attention · 0 cancellations, 0 refunds
49 variants at or below the stock threshold (list truncated, more pages exist)
  - 34 sold out (0 units)
  - 15 low (1-5 units)
  - across 14 products
```

**The re-check earned its place immediately.** The stock query returned 50
variants; one of them held more than the threshold and was dropped. Same index
lag as finding 2, caught live, through the real code path.

## Finding 3 — a flat threshold buries the signal

49 alerts across 14 products is a wall of text, not a briefing. On a young store,
plenty of variants sit at zero because they were never restocked, not because
something happened last night.

**Fixed by:** above roughly fifteen items the skill now reports the shape (how
many at zero, how many merely low, across how many products) and offers the full
list on request. It also has to say when a list was truncated instead of
reporting the count it happened to fetch.

## Finding 4 — connecting is where a real user gets stuck

Two obstacles that had nothing to do with the queries:

1. **No browser on a server.** `shopify store auth` opens a browser and its
   redirect target is hardcoded to `http://127.0.0.1:13387/auth/callback`, so the
   browser has to be on the same machine as the CLI. On a headless host you need
   an SSH tunnel (`ssh -N -L 13387:127.0.0.1:13387 user@host`) — being on the same
   private network is not enough, because the CLI binds to `127.0.0.1` only.
2. **"Unauthorized Access" from the store admin.** The authorization page can
   reject the request before showing any consent screen, with no explanation. In
   this case the fix was signing in to that specific store's admin first. An
   account without permission to install apps would fail the same way and look
   identical.

Both belong in the user-facing connection guide, because both will happen to
other people.

## Still unverified

1. **Order-specific filters.** `financial_status:…` and `cancelled_at:…` could
   not be proven, because the store has no orders and — per finding 1 — an
   ignored filter and an empty result look identical. The date and grouping
   syntax they rely on is proven; the field names are not. This stays open until
   the store takes its first order.
2. **More than one morning.** One briefing is not a routine. The bar is a report
   a human reads over coffee, several days running, and still wants.

## What was awkward

Building the `--variables` JSON inline in a shell string was the first thing to
break, and it broke quietly. Writing the variables to a file and passing
`--variable-file` removed the whole class of problem; that is now how every query
in the skill is called.
