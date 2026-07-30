---
name: daily-store-briefing
description: Open the day with a short read-only briefing on a Shopify store — new orders and revenue since the last briefing, payments that need attention, cancellations and refunds, and variants below the stock threshold. Use when the user asks how the store is doing, what happened overnight, for a morning or daily briefing, or for new orders since yesterday.
---

# Daily store briefing

One short report, every morning, from four read-only queries. Writes nothing to
the store, ever. Read `shared/safety.md` and `shared/store-profile.md` first.

## Step 1 — Load the profile

Read `.storehand/store.yaml` from the working directory. You need `store`,
`timezone`, `currency` and `inventory.low_stock_threshold`.

- **No `.storehand/`:** tell the user to run `/storehand-setup` and stop. Do not
  ask for the domain and carry on — the profile is what makes the other skills
  work too.
- **A required key is missing:** name the key, point at `/storehand-setup`, stop.

## Step 2 — Work out the period

Read `.storehand/state.json`:

- `lastBriefingAt` present → the period starts there.
- Absent or unreadable → the period starts 24 hours ago, and say so in the
  report ("first briefing, showing the last 24 hours").

Format the boundary as an ISO 8601 UTC timestamp. Interpret day boundaries in
the profile's `timezone`, not in UTC and not in yours.

## Step 3 — Run the four queries

All four are read-only. **Never add `--allow-mutations`.**

```bash
shopify store execute --store <store> --json \
  --query-file queries/orders-since.graphql \
  --variables '{"query":"created_at:>'"'"'<since>'"'"'","first":50}'
```

```bash
shopify store execute --store <store> --json \
  --query-file queries/payment-problems.graphql \
  --variables '{"query":"financial_status:pending OR financial_status:unpaid OR financial_status:expired","first":50}'
```

```bash
shopify store execute --store <store> --json \
  --query-file queries/cancellations-and-refunds.graphql \
  --variables '{"cancelled":"cancelled_at:><since>","refunded":"updated_at:><since> AND (financial_status:refunded OR financial_status:partially_refunded)","first":50}'
```

```bash
shopify store execute --store <store> --json \
  --query-file queries/low-stock.graphql \
  --variables '{"query":"inventory_quantity:<=<threshold>","first":50}'
```

Quoting note: the search values contain single quotes and comparison operators.
Build the `--variables` JSON carefully and check the CLI's error output rather
than assuming a silent success.

If `pageInfo.hasNextPage` is true, say the list was truncated. Do not paginate —
a briefing that needs more than 50 orders needs a report, not a briefing.

## Step 4 — Report

Fixed shape, in this order:

1. **One headline line**, counts and money only:
   > 3 new orders (€412) · 1 failed payment · 2 variants low · no cancellations
2. **What needs attention**, only the categories that are non-empty. Name orders
   by their `name` (`#1042`), not their GraphQL id.
3. **Suggested actions** — concrete and few. Never act on them.

Keep it short enough to read with a coffee. Detail on request.

## Step 5 — Update the marker

**Only after a successful report**, write `.storehand/state.json`:

```json
{ "lastBriefingAt": "<the ISO timestamp of this run>" }
```

If any query failed, leave the file untouched. Moving the marker after a partial
run means tomorrow silently skips whatever today never saw.

## Errors — never report a number you did not measure

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show the exact `shopify store auth --store … --scopes read_orders,read_products,read_inventory` line, stop |
| One query fails | Report the categories that succeeded and state clearly which one failed, with the literal error |
| A field does not exist (API version drift) | Show the error, name the query file, say the query needs updating — see `shared/api-version.md` |
| All queries fail | Report the failure. Never "nothing happened today" |

A quiet day and a broken integration look identical in a report that hides
errors. Never let them.
