# 2026-08-05 — Probes: ShopifyQL columns for skill 6

Not a skill run. A targeted session against a live store to find out whether
`weekly-store-report` can be built at all, before designing it.

Admin API through `shopify store execute`, CLI 4.5.2. Read-only throughout —
`shopifyqlQuery` is a read operation and `--allow-mutations` was never passed.
Figures withheld where they are store data; the store used has no payment
provider, so the money columns return zero. That is a property of the store, not
of the query.

This session closes the gap left open on 2026-07-30: *"`FROM sales` specifically
has still never returned a row."* It has now.

## 1. The pipe works, and `read_reports` is already there

`shopifyqlQuery` executes through the same `shopify store execute` path every
other StoreHand skill uses. No browser, no new dependency, no additional
authorization step.

The scope it requires, `read_reports`, is already granted on every StoreHand
connection — not because StoreHand asks for it, but because Shopify's own CLI
app adds it to every authorization. The README has said so since setup was
written; this confirms it end to end rather than on paper.

The documented *"Level 2 access to Customer data"* requirement did not block
aggregate sales metrics.

## 2. Columns that exist

Executed, `parseErrors` empty, real columns returned:

```
FROM sales    SHOW total_sales, net_sales, orders   SINCE -90d
FROM sales    SHOW average_order_value              SINCE -90d
FROM sessions SHOW sessions, conversion_rate        SINCE -90d
```

`conversion_rate` matters more than it looks. Searching the Admin GraphQL
documentation for "conversion rate" returns nothing relevant — it is not a
field on any Admin type. Sessions and conversion are reachable *only* through
ShopifyQL, which settles which mechanism skill 6 has to lean on.

## 3. Columns that do not exist

Four attempts to reach a returning-customer metric, all rejected:

```
FROM customers SHOW customers, returning_customer_rate      → Column Not Found ×2
FROM sales     SHOW total_sales GROUP BY customer_type      → Column Not Found
FROM orders    SHOW orders GROUP BY customer_type           → Schema Error: invalid dataset
FROM sales     SHOW returning_customer_sales,
                    first_time_customer_sales               → Column Not Found ×2
```

Consequence: the returning-customer metric is dropped from skill 6 and the
roadmap entry corrected. Shopify's own ShopifyQL guidance is explicit that the
right move here is to say the metric is unavailable rather than emit a guess,
and a fifth invented column name would have been exactly that.

`FROM orders` confirms the 2026-07-30 finding independently: `orders` is a
column inside `sales`, not a dataset of its own.

## 4. ShopifyQL fails loudly

The useful property, and the reason Step 3b of skill 6 can be cheap:

- a wrong column name returns `Column Not Found` in `parseErrors`, with
  `tableData: null`
- a wrong dataset returns `Schema Error`
- nothing returns an empty result presented as zero

This is the **opposite** of the Admin API search filters documented in section 1
of the 2026-07-30 probes, where an unrecognised filter term is silently ignored
and returns everything unfiltered. Two mechanisms, two failure modes, and a
skill has to be written differently depending on which one it is standing on.

Worth stating plainly because the intuition runs the wrong way: the aggregate
interface is the trustworthy one about *its own validity*, while the
record-level interface is the one that lies about what it filtered.

## 5. A wrong field name cost one round trip

The first query written for this session requested `tableData { rowData }`.
There is no such field — it is `rows`, typed `JSON!`. The error named the type
and the field, the correct name came out of a schema lookup, and the second
attempt worked.

Recorded because it is the argument for Step 3b layer 1 in miniature: the
GraphQL wrapper being well-formed says nothing about the ShopifyQL inside it,
and neither says anything about whether the field names were real.

## 6. `displayName` comes back in the store's language

```
total_sales      → "Totale omzet"
net_sales        → "Netto-omzet"
orders           → "Bestellingen"
```

The store used is Dutch. Any logic in skill 6 must key off `name`, never
`displayName`, or it will work in one language and silently fail in another.
`displayName` is safe to *print* — and is arguably the better label to print,
since it already matches what the owner sees in their own admin.

## What is still untested

1. **Every money column against a store with revenue.** All figures were zero
   here. The mechanism is proven; the arithmetic is not.
2. **The cross-check in Step 3b.** Comparing `total_sales` against summed order
   records needs orders to exist before it can be shown to agree — or to
   disagree, which is the case actually worth seeing.
3. **Whether a returning-customer metric exists under a name not tried.** Four
   attempts is not proof of absence. It is enough to stop guessing.
