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

## The proposal contract

A skill that writes does it in two phases with a file in between. The file
records, per field, the value that was live when the proposal was made.

At apply time the live value is compared against that record. Identical → the
field may be written. Anything else — changed, missing, unmeasured — is skipped
and reported, never overwritten and never guessed at.

Half a proposal is never applied. A proposal file that cannot be parsed in full
stops the run, because a file understood in part is a store rewritten in part.

And a write has three outcomes, not two. A call that does not come back cleanly
is **unknown**: it may have landed before the response was lost. Never call that
failed, never retry it, and never let a report imply either.

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

## Privacy and network

StoreHand sends no telemetry and has no server of its own. Nothing you run here
reports back to anyone.

Skills reach the network in exactly four ways, and no others:

1. the Shopify CLI talking to your own store — every skill, and nothing else for
   most of them;
2. `storehand-setup` completing the authentication callback on your own machine;
3. `store-health-check` requesting your own storefront, to see which links
   really answer;
4. `product-listing-writer` fetching your own store's product images from
   Shopify's CDN, so it can describe what is actually in a photo instead of
   guessing at it.

Route 2 is not new behaviour — setup has always done it — but this list claimed
to be complete and was not. That is the failure mode a hand-maintained promise
has, so it is no longer hand-maintained alone: every skill states its own
traffic in a `Network:` line near the top, and a test checks those lines against
this list.

Anything beyond these four changes the promise rather than implementing it. Do
not add one — and if you do, it goes in this list in the same commit.
