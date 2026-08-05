# 2026-08-05 — Design: `weekly-store-report`

Skill 6, the last one in version 1. Read-only throughout.

Evidence for every capability claim below is in
[`docs/dogfood/2026-08-05-shopifyql-probes.md`](../dogfood/2026-08-05-shopifyql-probes.md),
measured against a live store on the day this was written.

## What it is

Once a week: **what changed against the week before.** Not a dashboard, not an
answer to a question somebody asked.

That distinction is the whole reason this skill exists. Shopify's own
`shopify-shopifyql` skill computes any of these metrics on demand and does it
well. What an on-demand skill structurally cannot do is tell you, unprompted,
that conversion fell by a third while you were looking somewhere else. The
weekly rhythm is the product; the arithmetic is commodity.

## Metrics

Six columns across two ShopifyQL datasets. Every one was executed against a
live store before being written down here.

| Dataset | Columns |
|---|---|
| `FROM sales` | `total_sales`, `net_sales`, `orders`, `average_order_value` |
| `FROM sessions` | `sessions`, `conversion_rate` |

**Returning customers is not in this skill.** The roadmap promised it. Four
queries across three datasets — `returning_customer_rate`, `customers`,
`customer_type` as a `GROUP BY` dimension, and `returning_customer_sales` /
`first_time_customer_sales` — every one came back `Column Not Found`. Rather
than guess a fifth name, the metric is dropped and the roadmap entry corrected.
If someone later finds the right dataset, it is an addition, not a repair.

`orders` and `products` are not ShopifyQL datasets; `sales` and `sessions` are.
This was already established in the probes of 2026-07-30 and independently
confirmed here.

## Period

Whole calendar weeks, Monday to Sunday. The report compares the last **closed**
week against the one before it.

Never a partial week. A Wednesday run that compared three days against seven
would produce a column of meaningless negative percentages, and the skill would
be manufacturing exactly the kind of false signal the rest of this project
refuses to print. If today is mid-week, the report says which week it covered
and that the current one is still running.

## Step 3b — re-check what came back

Every StoreHand skill re-checks its own output before printing it. An aggregate
has no records to walk, so the check works in two layers instead.

**Layer 1 — was the question valid.** `parseErrors` must be empty, and every
column requested must come back in `columns`. ShopifyQL fails loudly rather
than silently, which is the opposite of the Admin API search filters documented
in the 2026-07-30 probes: a bad column name is an error, not an empty result
quietly presented as zero. This layer is cheap and it catches the whole class of
mistake that produced the four dead column names above.

**Layer 2 — was the answer right.** `total_sales` and `orders` are measured a
second time, independently: the order records for the same week, fetched with
the Admin API query `daily-store-briefing` already ships and has already been
dogfooded. Two systems, one claim.

When the two disagree, the report prints **both numbers and the gap**. It does
not pick a winner. A silent preference for one source is indistinguishable from
not having checked.

**What counts as disagreement is not yet known, and must not be guessed.**
`total_sales` is a defined Shopify metric, not a synonym for "add up the order
totals" — discounts, shipping, taxes and returns may each sit on a different
side of that definition. Until the first run against a store with revenue shows
what the normal gap looks like and why, the skill reports the two figures side
by side and calls the difference *unexplained* rather than *wrong*. Hard-coding
a tolerance before measuring one would be inventing the very number this design
spent three sections refusing to invent.

This mirrors what `store-health-check` already does when it fetches the
storefront over HTTP rather than believing the admin.

**`sessions` and `conversion_rate` have no second source.** Nothing else in the
Shopify API computes them. The report says so once, at the bottom, rather than
letting two verified numbers lend borrowed credibility to two unverified ones.

## Report shape

Sorted by size of change, largest first. No severity markers.

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

Three rules hold this shape together:

1. **Nothing is suppressed.** Every metric appears every week, including the
   ones that barely moved.
2. **Absolute values sit next to every percentage.** −37% on 42 orders is six
   orders. The reader can see that without being told what to conclude.
3. **No verdict.** No "weak", no "significant", no warning triangle. Each of
   those needs a cutoff, and a cutoff nobody measured is precisely the kind of
   invented number this project does not print. Sort order carries the emphasis
   and asserts nothing.

## Routing

Version 1 ends with four skills that a store owner could plausibly summon by
asking "how is the shop doing?". The description must push the other three away
explicitly — the pattern Shopify uses across their own skill set, where each
description names the skills it is *not*:

- not today or yesterday → `daily-store-briefing`
- not things that are broken → `store-health-check`
- not product copy or metadata → `seo-metadata-audit`

## State

One key in `.storehand/state.json`, following the shared-state contract: read
the whole object, add the key, write the whole object back. Rebuilding the file
erases the other skills' memory.

The key records which week was last reported, so a second run in the same week
says the report is unchanged rather than printing it again as if it were news.

## Testing

- Unit: period arithmetic — a run on Monday, mid-week, and Sunday all resolve to
  the same closed week; week boundaries across a month and a year edge.
- Unit: the cross-check reports a disagreement rather than choosing a side, and
  reports agreement when the two sources match.
- Unit: a non-empty `parseErrors` never reaches the report as a number.
- Assertion, in the style of `tests/seo-audit.test.mjs`: the SKILL.md carries no
  severity vocabulary and no `--allow-mutations` in any code block.

## What is not settled

**Dogfood evidence.** A skill is only listed as shipped once it has run against
a live store with the evidence in `docs/dogfood/`. The store available for
testing has no payment provider, so every metric returns zero — enough to prove
the pipe, not enough to prove the skill, because a report about change cannot be
demonstrated by a week in which nothing changed.

Skill 6 therefore stays at **built, not yet shipped** until a store with real
traffic is available. That is the existing rule, applied rather than bent.
