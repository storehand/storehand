# 2026-07-30 — Probes: search filters, the memory paths, ShopifyQL

Not a skill run. A targeted session against the same live store to close out
everything the two health-check runs left "untested", and to be explicit about
what could not be closed.

Six scopes, Admin API `2026-07`, CLI 4.5.2. Read-only throughout — no writes to
the store, and the real `.storehand/state.json` was not touched (the memory test
ran in a throwaway directory).

## 1. Search filters fail silently, in two opposite directions

The most important result here, and it affects every skill that passes a
`query:` string.

Probed against `products`, where the store actually has data (42 active
products, no drafts, no archived):

| Filter | Result |
|---|---|
| `status:active` | 42 products |
| `status:draft` | 0 |
| `status:archived` | 0 |
| `status:zzznotreal` — unknown **value** | **0** |
| `zzzbogusfield:whatever` — unknown **field** | **42 — everything** |
| `""` (no filter) | 42 |

**An unknown field name is silently ignored and the filter simply does not
apply.** An unknown value on a known field matches nothing. Neither raises an
error, and the two failures point in opposite directions:

- Misspell a **field** (`finantial_status:pending`) → the query returns
  *everything*. A briefing would then report every order as a payment problem.
- Misspell or outlive a **value** (Shopify renames a status) → the query returns
  *nothing*, and the report reads as a quiet day.

The second failure is the one `shared/safety.md` already warns about. The first
is worse and was not on the radar: a false alarm on every record, produced by a
query that looks like it worked.

**What this does not show:** this store has no draft or archived products, so
the *consequence* of an ignored `status:` filter could not be demonstrated here
— only the mechanism. On a store with drafts, a typo in that field name would
put unpublished products into the health check without any signal.

**Suggested follow-up (not done):** the queries in this repo hardcode their
filter fields, so a typo is a code bug, not a user bug — a test that asserts
each query's filter actually narrows (compare filtered vs unfiltered counts on
a fixture store) would catch it. Recorded, not built.

## 2. The order filters remain genuinely unprovable

`financial_status:` and `cancelled_at:` were probed the same way:

| Filter on `orders` | Result |
|---|---|
| `financial_status:pending` | 0 |
| `financial_status:zzznotarealstatus` | 0 |
| `cancelled_at:>'2026-07-29T00:00:00Z'` | 0 |
| `cancelled_at:>'not-a-date'` | 0 |
| `zzzbogusfield:whatever` | 0 |

Every one returns an empty list without an error — because the store has zero
orders, so the unfiltered result is empty too. The trick that worked on products
(an ignored filter returns *everything*, which is visibly different from zero)
cannot work here: everything and nothing are the same list.

**Conclusion: still blocked, and blocked for a provable reason rather than an
assumed one.** The first real order closes it in one run. Until then this stays
in the open-points list.

## 3. The memory layer — all four Step 5 paths exercised

Run 2 only exercised carry-forward. This probe built a throwaway working
directory with a doctored `state.json` dated 2026-07-01 (a 29-day gap, not two
hours) containing four finding ids, then applied Step 5 with the discount check
deliberately treated as **not measured**:

| Previous id | Expected | Result |
|---|---|---|
| `meta:products-no-seo-description` (still found) | carry `firstSeenAt` forward | **open since 2026-07-01T09:00:00Z** ✅ |
| `meta:collections-no-description` (absent before) | label new, stamp now | **new** ✅ |
| `oos:…` (gone, check ran) | drop — resolved | **dropped** ✅ |
| `link:/pages/…` (gone, check ran) | drop — resolved | **dropped** ✅ |
| `promo:Zomeractie:no-end` (gone, check **not measured**) | carry forward unchanged | **carried forward, 2026-07-01 intact** ✅ |

`lastBriefingAt` survived the write. The subtlest rule in the skill — a finding
you could not look at is not resolved — behaves as written.

**Honest limit:** the rules in Step 5 are prose for an agent to follow, so this
implements them in code and checks the specification is unambiguous. It does not
prove a model following the prose reaches the same result. What it does prove is
that the prose *can* be followed to exactly one outcome, which is the part that
was in doubt.

## 4. The promo clock derivations — five right, two gaps

No discounts exist on this store, so this was run against fabricated nodes.
Same caveat as above: it tests the rules, not the API.

| Case | Finding |
|---|---|
| ACTIVE, no `endsAt` | `no-end` ✅ |
| ended 3 days ago | `just-expired` ✅ |
| ACTIVE, ends in 4 days | `ends-soon` ✅ |
| ended 30 days ago | none ✅ |
| ACTIVE, ends in 60 days | none ✅ |
| **status ACTIVE but `endsAt` 2 days past** | `just-expired` ✅ — the "status lies" case works |
| **status EXPIRED but `endsAt` 3 days in the future** | **none** ⚠️ |
| **status SCHEDULED, ends in 2 days** | **none** ⚠️ |

The two flagged rows are real gaps in Step 3, not bugs in the test:

- **EXPIRED with a future end date contradicts the skill's own instruction.**
  Step 3 opens with "compare against the clock, not against `status` alone", but
  `ends-soon` is gated on `status == ACTIVE`. A discount Shopify has marked
  EXPIRED while its end date is still ahead produces nothing at all. That is
  arguably correct — Shopify is authoritative about whether a discount is live —
  but then the sentence about not trusting status is only half true, and the
  skill should say which side wins.
- **SCHEDULED discounts are invisible.** A discount that starts tomorrow and
  ends in two days is never mentioned by any of the three rules. For a store
  owner, a promo window opening and closing unnoticed is exactly the kind of
  thing a weekly check exists to surface.

Both are design decisions, not defects, and neither was changed here.

## 5. ShopifyQL — closed, and better than the research said

The research note concluded `read_reports` plus "Level 2 protected customer
data" was required. With `read_reports` alone:

```
FROM sessions SHOW sessions GROUP BY day SINCE -7d
→ columns: day (DAY_TIMESTAMP), sessions (INTEGER)
→ rows: one row per day, each with an integer session count
        (actual figures withheld — store traffic)
```

Real columns, real rows, real data. So the pipe works end to end and the earlier
empty `FROM sales` result was genuinely "no orders", not a silent failure.

`parseErrors` is a working validator, which also settles how much the empty
result could be trusted:

```
FROM products SHOW quantity_sold …
→ "Schema Error: Invalid dataset in FROM clause - products"
FROM orders SHOW total_price …
→ "Schema Error: Invalid dataset in FROM clause - orders"
```

Useful for skill #6's design: `products` and `orders` are **not** ShopifyQL
datasets. `sales` and `sessions` are. A query written against a guessed dataset
name fails loudly rather than quietly — the opposite of the search-filter
behaviour in section 1, and worth knowing when choosing which of the two
mechanisms a skill leans on.

**Remaining gap:** `FROM sales` specifically has still never returned a row.
Small risk now that the mechanism is proven, and it closes with the first order.

## What is still untested after this session

1. **The discounts query shape when discounts exist.** Section 4 tested the
   rules against fabricated nodes; nothing has confirmed the live query returns
   `title`, `status`, `startsAt`, `endsAt` in the shape the rules expect across
   all eight discount typenames. This needs one real discount, which means a
   write — deliberately not done on a live public store.
2. **`financial_status:` / `cancelled_at:`** — section 2. Needs an order.
3. **`FROM sales` returning rows** — section 5. Needs an order.
