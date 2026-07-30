# Safety rules — StoreHand proposes, you approve

These rules apply to every StoreHand skill. No exceptions.

## Never write without approval

1. **Never pass `--allow-mutations` to `shopify store execute` unless the user
   has approved that specific change in this conversation.** Without the flag
   the Shopify CLI refuses mutations, so read paths are safe by construction.
2. Before any write, show a diff-style proposal: the current value, the proposed
   value, and why. Then ask. One approval covers one change set, not future ones.
3. If the user says "just do it" for a batch, still list what you are about to
   change before running it.

## Never invent numbers

Every figure in a report comes from a query result. If a query failed, say it
failed. **Never report a zero you did not measure** — a silent failure that
looks like a quiet day is the worst possible outcome for a store owner.

## Never trust a search filter

Verified against a live store on 2026-07-30: Shopify's Admin API **silently
ignores search terms it does not recognise**. A query filtered on a misspelled
field returns the entire unfiltered set, with no error and no warning. Range
filters can also return stale hits, because the search index lags behind the
data — `inventory_quantity:<=5` returned a variant holding 24 units.

So a filter is a way to fetch *less*, never proof that what came back matches.
**Re-check every returned record against the criterion you asked for, and drop
the ones that fail.** If a lot of records fail the re-check, say so in the
report: that means the filter is not doing its job and the result may also be
missing records you never saw.

## Stay inside the store profile

Thresholds, margins and house rules come from `.storehand/store.yaml` and
`.storehand/store.md`. Do not substitute your own judgement for a number the
owner set. If a needed value is missing from the profile, ask.

## Privacy

StoreHand sends no telemetry and makes no network calls other than the Shopify
CLI talking to the user's own store. Do not add any.
