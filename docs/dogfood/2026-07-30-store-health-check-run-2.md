# 2026-07-30 — Second run of `store-health-check`, all four checks measured

Same store as run 1, same day, roughly two hours later. The point of this run
was not the store — nothing about it changed — but the two things run 1 could
not exercise: the **discount and menu checks** (blocked on scopes) and the
**memory layer** (no previous run to compare against).

Store token re-authorised in between with six scopes:
`read_orders`, `read_products`, `read_inventory`, `read_discounts`,
`read_online_store_navigation`, `read_reports`. Admin API `2026-07`,
Shopify CLI 4.5.2, `--version 2026-07` passed on all four calls.

## What was run

| Step | Run 1 | Run 2 |
|---|---|---|
| `active-products-inventory.graphql` | 42 nodes | 42 nodes, `hasNextPage: false` |
| `collections-health.graphql` | 7 collections | 7 collections + `primaryDomain` |
| `discounts.graphql` | **ACCESS_DENIED** | **0 discount nodes**, no errors |
| `menus-and-domain.graphql` | **ACCESS_DENIED** | **3 menus**, no errors |
| `check-urls.mjs` | 49 URLs, all 200 | **55 URLs**, all 200, `truncated: false` |

Nothing was written to the store. The only write was `.storehand/state.json`.

## The report it produced

> **0 sold out but active · 0 discount findings · 0 broken links (55 storefront
> URLs checked) · 40 metadata gaps**
>
> **Metadata gaps (40)** — both open since 2026-07-30T16:03:21Z, unchanged
> since the first health check.
> - 39 of 42 active products have no `seo.description`.
> - 1 of 7 collections has neither a body description nor an SEO description:
>   `frontpage`.
> - Images clean: every active product has a featured image with alt text.
>
> **Healthy** — no active product is sold out while tracking inventory. The
> store has no discounts at all, so nothing expired, nothing runs without an
> end date. All 10 menu paths, 7 collection URLs and 42 product URLs return
> 200; no password page, no off-domain redirects, list not truncated.
>
> **Suggested (not executed)** — write SEO descriptions for the 39 products;
> give `frontpage` a description or ignore it deliberately.

## What the two new checks actually showed

**Discounts: a measured zero.** The store has no discount nodes at all. Access
is proven — the query returns `"nodes": []` with no errors where it returned
ACCESS_DENIED two hours earlier.

**But the discount *logic* is still unexercised, and this is the important
caveat.** Step 3 derives three findings from this query — `no-end`,
`just-expired`, `ends-soon` — and all three need at least one discount to
exist. An empty list exercises none of them. What run 2 proves is that the
query is reachable and parses; what it does not prove is that the clock
comparisons work. Do not read "discounts: 0" as "the discount check works".

**Menus: 3 menus, and the link check finally covers its risky half.** Every
level was walked; the URLs split as:

- **10 internal paths**, all fetched: `/`,
  `/collections/all?sort_by=created-descending`, `/collections/tops`,
  `/collections/jassen`, `/collections/broeken`, `/collections/sets`,
  `/pages/contact`, `/pages/over-ons`, `/pages/faq`, `/pages/maattabel`
- **2 external**, counted and deliberately not fetched — the customer-account
  menu points at `https://shopify.com/<shop-id>/account/…`
- **0 empty URLs**

The four `/pages/*` links are the only hand-typed URLs on the store, which is
exactly what open point 4 of run 1 said had never been tested. They all return
200. Note that the menu contributed only four genuinely new paths: the rest are
collection URLs the check already generated from the admin, deduplicated here.
The link count went 49 → 55, not 49 → 59.

**Query-level detail worth keeping:** menu item URLs come back absolute
(`https://<storefront>/pages/faq`), so the normalisation to a path that
Step 4 asks for is load-bearing, not defensive. Handing those absolute URLs to
the checker unchanged would have made every one of them `offDomain` against
a `base` of the same host — a silent no-op rather than an error.

### The 55 × 200 is a measured zero, again by negative control

Same improvised control as run 1, because the skill still does not do this
itself (run 1, open point 3):

```
/products/deze-bestaat-echt-niet-xyz  → 404
/collections/bestaat-niet-xyz         → 404
/pages/ook-niet                       → 404
```

Real 404s, so the storefront does not soft-404 and the clean result means
something. Two runs have now needed this control and neither got it from the
skill. That strengthens open point 3 rather than resolving it.

## The memory layer — first real test, and a weak one

Run 1 wrote two finding ids. Run 2 found the same two, and labelled both
**open since 2026-07-30T16:03:21Z**, carrying the original `firstSeenAt`
forward rather than stamping them with the current time. Nothing was dropped;
no id disappeared. `lastBriefingAt` from `daily-store-briefing` survived the
write untouched, which was the specific risk Step 6 warns about.

So the mechanism works. But be honest about how thin the test is:

- The **carry-forward** path ran. The **"new"** path did not — no id appeared
  that was not there before. The **"drop resolved"** path did not either.
- The gap between the two runs is about two hours on the same day, so an
  `firstSeenAt` that was silently overwritten with "now" would have looked
  almost identical in the report. The test distinguishes the two only because
  the timestamps were compared literally in the state file, not because the
  report made it obvious.
- The **carry-forward-on-not-measured** rule from Step 5 — arguably the
  subtlest rule in the skill — still has never run, because this time
  everything was measured.

A run after a real gap, with a finding that actually resolves, is still owed.

## Open points from run 1 — status

1. **Product-level vs variant-level stock** — unchanged, still open. Run 2
   again reported "0 sold out but active" on a store where the briefing found
   34 variants at zero.
2. **Aggregate metadata ids hide the trend** — now visible in practice:
   `meta:products-no-seo-description` was carried forward unchanged, and the
   report cannot say whether 39 is better or worse than last time. Still open.
3. **Nothing verifies the storefront really 404s** — still open, and now needed
   twice.
4. **Menu links never measured** — **closed by this run.** They are measured,
   they are first in the list, absolute-to-path normalisation is confirmed
   necessary, and they are all healthy.

New open point:

5. **A measured-zero discount check reads like a working discount check.** The
   headline says "0 discount findings" whether the logic ran or there was
   simply nothing to run it on. That is true to the skill's own rule (a
   measured zero is a result), but the three clock-based derivations remain
   completely untested. The cheapest honest test is a throwaway discount on a
   dev store, not on this one.

## State

`state.json` afterwards:

```json
{
  "lastBriefingAt": "2026-07-30T12:42:41Z",
  "healthCheck": {
    "lastRunAt": "2026-07-30T18:24:27Z",
    "findings": [
      {
        "id": "meta:products-no-seo-description",
        "firstSeenAt": "2026-07-30T16:03:21Z"
      },
      {
        "id": "meta:collections-no-description",
        "firstSeenAt": "2026-07-30T16:03:21Z"
      }
    ]
  }
}
```

## Getting the token — what the re-auth cost

Worth recording because it is not in the skill and it bit hard. `shopify store
auth` has **no device flow**; the `SHOPIFY_CLI_DEVICE_AUTH` environment
variable is real but belongs to a different login path and does nothing here.
On a headless machine the CLI does not print the authorization URL either — it
dies with `spawn xdg-open ENOENT` before the "open this manually" fallback.
The working route without a tunnel is now written up in `docs/connect.md`:
shim `xdg-open` to capture the URL, approve in a browser elsewhere, then hand
the callback URL to the still-waiting process with `curl`.
