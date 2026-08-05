# 2026-08-05 — Dogfood: weekly-store-report

First end-to-end run of skill #6 against a live store. Read-only throughout;
`--allow-mutations` was never passed and nothing was written to the store.

Admin API through `shopify store execute`, CLI 4.5.2. Run on a Wednesday, so the
skill reported the last **closed** week.

**This run validates the plumbing, not the arithmetic.** The store has no
payment provider, so every money column is zero. Read the last section before
treating anything here as proof the report is correct.

## Period resolution

    today                2026-08-05 (Wednesday)
    reported week        2026-07-27 – 2026-08-02   (ISO 2026-W31)
    previous week        2026-07-20 – 2026-07-26

Correct: the last Sunday that had already passed was 2026-08-02, and the current
week was still running and therefore not reported.

## What came back

Four ShopifyQL calls, `parseErrors` empty on all four, every requested column
present in `columns`.

| Metric | 20–26 Jul | 27 Jul – 2 Aug | Change |
|---|---|---|---|
| Sessions | 276 | 11 | −96% |
| Conversion | 0.0% | 0.0% | — |
| Revenue | €0 | €0 | — |
| Net revenue | €0 | €0 | — |
| Orders | 0 | 0 | — |
| AOV | `null` | `null` | — |

The sessions figure is real and it moved. Everything downstream of a paid order
is zero because the store cannot take payment yet.

## Three findings

### 1. `average_order_value` returns `null`, not `0`

With no orders in the week, `total_sales`, `net_sales` and `orders` all came
back as the string `"0"`, but `average_order_value` came back `null`.

That distinction matters more than it looks. A skill that treats `null` as zero
computes a percentage change against it and prints something confident and
wrong — and on a real store the first week a metric is unavailable is exactly
when a false −100% would be most alarming. The skill now states that null is not
zero, prints the row as `—`, and refuses to compute a change from it or into it.
A test pins the rule.

Found by running it. No amount of reading the schema would have shown this,
because the schema types the column as MONEY either way.

### 2. The cross-check ran and agreed — trivially

ShopifyQL reported `total_sales` 0 and `orders` 0. The order records for the
same window returned `nodes: []`, `hasNextPage: false` — zero orders, sum zero.
The two sources agree.

They agree because both are zero, which is the weakest possible form of
agreement. **The cross-check has still never fired against non-zero data**, and
it has never had the opportunity to disagree. This is the open item, it is
disclosed in the README, and it does not close until a store with revenue runs
this skill.

### 3. `displayName` is localised, as expected

    total_sales           → "Totale omzet"
    average_order_value   → "Gemiddelde bestelwaarde"
    conversion_rate       → "Conversiepercentage"

The store is Dutch. Confirms the rule already written into Step 3: branch on
`name`, print `displayName`.

## What is still untested

1. **Every money column against a store with revenue.** All figures were zero.
2. **The cross-check disagreeing.** The case worth seeing is the one where
   `total_sales` and the summed order records differ, because that is where the
   skill has to print both numbers and call the gap unexplained. It has never
   happened, because it cannot happen at zero.
3. **The 250-order pagination limit on the cross-check.** No store available has
   250 orders in a week.
4. **A week where a metric moves in both directions at once.** The sort order —
   largest absolute change first — has only been exercised on a table where one
   row moved and the rest were flat.
