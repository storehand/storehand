# 2026-07-30 — First real run of `store-health-check`

Store: the same live Shopify store as the briefing dogfood — 42 active products,
356 variants, 7 collections, zero orders, storefront live on its own custom
domain. Admin API version `2026-07`, Shopify CLI 4.5.2.

Run through the real code path this time from the first minute: `shopify store
execute` with `--query-file` and `--variable-file`, and the skill's own
`check-urls.mjs` against the public storefront. Nothing was written to the
store; the only write anywhere was `.storehand/state.json`.

## What was run

All four queries, then the link check, then the state write.

| Step | Result |
|---|---|
| `active-products-inventory.graphql` | 42 nodes, no errors, `hasNextPage: false` |
| `collections-health.graphql` | 7 collections + `primaryDomain`, no errors |
| `discounts.graphql` | **ACCESS_DENIED** — `read_discounts` missing |
| `menus-and-domain.graphql` | **ACCESS_DENIED** — `menus` field |
| `check-urls.mjs` | 49 URLs, all `status: 200`, `truncated: false` |

Both scope failures behaved exactly as the skill predicts: exit code 1, the
error box on stderr, **stdout completely empty**. The skill's warning that
`2>/dev/null` would hide the error and leave an empty result that looks like a
quiet day is not theoretical — that is precisely what these two calls look like.

## The report it produced

> **0 sold out but active · 0 broken links (49 storefront URLs checked) ·
> discounts: not measured · 40 metadata gaps**
>
> First health check on this store — no previous run to compare against, so
> nothing is labelled "new" or "open since".
>
> **Not measured (2 of 4 checks)**
> - Discounts — `ACCESS_DENIED`: "Apps must have `read_discounts` access scope."
> - Navigation menus — `ACCESS_DENIED` on `menus`. Menu links were therefore
>   left out of the link check; they are the only hand-typed URLs, so this is
>   the part most likely to hide a broken link.
> - Fix both: `shopify store auth --store <store> --scopes
>   read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation`
>
> **Metadata gaps (40)** — presence only; whether the texts are any good is the
> SEO audit's job.
> - 39 of 42 active products have no `seo.description`. Only 3 have one.
> - 1 of 7 collections has neither a body description nor an SEO description:
>   `frontpage` ("Home page").
> - Images are clean: every active product has a featured image, and every one
>   of those has alt text.
>
> **Healthy** — 42 active products, none sold out while still tracking
> inventory. All 7 collection URLs and all 42 product URLs return 200; no
> password page, no off-domain redirects, list not truncated (49 of a 200 cap).
>
> **Suggested (not executed)** — re-auth with the two missing scopes; write SEO
> descriptions for the 39 products; give `frontpage` a description or ignore it
> deliberately.

## What the store data actually showed

- **Sold out but active: zero.** Every one of the 42 active products tracks
  inventory and every one has `totalInventory > 0`.
- **SEO descriptions: 39 of 42 missing.** The 3 that have one are the
  English-handled `elegant-*` products, so the gap looks like a batch that was
  imported without SEO fields rather than three products that were forgotten.
- **Collections are in good shape.** Six of seven have a real body description.
  Only `frontpage` is empty, and that one is a theme container more than a
  browsable page.
- **Images: nothing to report.** Zero products without a featured image, zero
  featured images without alt text. Worth recording because it is the first
  check in this plugin that came back clean on a real store.
- **Link check: 49 of 49 at 200.** No password page — consistent with the store
  having gone public on 2026-07-22.

### The "0 broken links" was verified, not assumed

A storefront that soft-404s (serving 200 with an error page) would make the
whole link check meaningless and the skill would happily report "no broken
links". So a negative control was run against three URLs that cannot exist:

```
/products/deze-bestaat-echt-niet-xyz  → 404
/collections/bestaat-niet-xyz         → 404
/pages/ook-niet                       → 404
```

The storefront returns real 404s, so the 49 × 200 is a measured zero. **This
control is not in the skill and should be** — see open point 3.

## Friction — where SKILL.md fought back

### Friction 1 — `V="$(mktemp -d)"` lives in its own code block (FIXED)

Step 2 sets up the scratch directory in one fenced block and then uses `$V` in
four separate blocks. In a real Claude session every Bash call is a fresh
shell, so an agent that runs the blocks as written loses `V` immediately.

The failure is quiet, which is what makes it bad: with `V` unset,
`"$V/products.json"` expands to `/products.json`. Running as root that write
*succeeds* and the query runs fine; running as a normal user it fails with a
permission error that never mentions `V`. Same skill, two different outcomes
depending on who you are.

**Fixed** by four lines under the `mktemp` block saying shell state does not
survive between calls and to either re-set `V` or use one fixed path. The run
itself already used a single fixed scratch path, so nothing needed re-running —
the fix documents what a correct execution has to do anyway.

**Follow-up:** `daily-store-briefing/SKILL.md` has the identical structure and
the identical trap. Left alone deliberately (it was not the skill under test),
but it should get the same line.

### Friction 2 — the report shape had no branch for a clean check (FIXED)

Step 6 says "only the non-empty categories". Two of the four checks on this
store came back completely clean, and the headline example only ever shows
non-zero counts. Followed literally, the headline would have been "40 metadata
gaps" and the reader could not tell whether the sold-out check found nothing or
never ran — which is the exact confusion `shared/safety.md` exists to prevent.

Resolved during the run by putting explicit zeros in the headline, then **fixed
in the skill**: the headline now must carry a number for every check that ran,
including a zero, and the words "not measured" for every check that did not.
The report above already follows the amended rule, so it did not need redoing.

### Friction 3 — `--version` appears in the prose but in none of the examples

Step 2 says to pass `--version <handle>` on every call, and then shows four
example commands that all omit it. An agent that copy-pastes the blocks runs
against the CLI default and silently loses the version pin — the one thing the
pin exists to prevent.

**Not fixed.** `daily-store-briefing` does exactly the same thing, so this is a
house convention rather than a slip, and changing it means changing both skills
and deciding how to render a placeholder that must disappear when the file says
`Pinned: none`. Recorded here so the decision is made on purpose. The run passed
`--version 2026-07` on all four calls.

### Friction 4 — "write the input file yourself (no extra tooling needed)"

Step 4's example is a heredoc with three URLs in it. The real list was 49, and
on a larger store it is 200. Hand-writing that from query output is exactly the
kind of transcription work that produces a typo'd handle, which then reports as
a broken link that is not broken. The list was generated from the two query
outputs with a short `node -e` instead.

**Not fixed** — the instruction is followable, just misleadingly small. But the
example sets an expectation that breaks down at the first realistic store, and
a line acknowledging that generating the list is fine would cost nothing.

### Friction 5 — the menus error does not name the scope

`discountNodes` fails with "Apps must have `read_discounts` access scope"; the
`menus` failure is just "Access denied for menus field." with no
`requiredAccess`. No problem in practice, because the skill's Errors table
carries the full five-scope re-auth line rather than relying on the API to name
the missing scope — but it is worth knowing that the API is not a reliable
source for which scope to ask for.

## Open points — design decisions, deliberately not fixed

1. **The sold-out check is product-level, the briefing's stock check is
   variant-level.** This run reported "0 sold out but active" on the same store
   where the briefing found 34 variants at zero units the same morning. Both are
   correct and neither is lying: `totalInventory` sums across variants, so a
   product with 12 of 14 sizes sold out still shows a healthy number. For a
   clothing store — where the size that is gone *is* the problem — the
   product-level check is the less useful of the two. Changing it changes the
   `oos:<handle>` finding id and the check's meaning, so it stays open.

2. **Aggregate metadata ids hide the trend.** `meta:products-no-seo-description`
   is one id whether 39 products or 3 are missing a description. Next week it
   will be labelled "open since 2026-07-30" even if 36 of them were fixed. The
   count is in the report body but never in the memory, so the skill cannot say
   "was 39, now 3". Changing this changes the finding-id design.

3. **Nothing verifies that the storefront really 404s.** The negative control
   above was improvised. A soft-404 storefront (some themes, some proxies) turns
   this check into a guaranteed clean bill of health. Making one throwaway URL
   part of the run would cost one request and would make "0 broken links"
   trustworthy by construction. Left open because it changes what the check
   does, and because it needs a decision on what to do when the control itself
   returns 200.

4. **Menu links — the most valuable part of the link check — were never
   measured.** Collections and products are generated by Shopify from handles
   that exist by definition; they are the URLs least likely to be broken. The
   hand-typed menu URLs are the likely breakage and they need a scope this token
   does not have. This first run therefore exercised the cheap half of the check.
   Not a defect, but the check has not really been proven until a run with
   `read_online_store_navigation` happens.

## State

`state.json` afterwards, with the briefing's key intact:

```json
{
  "lastBriefingAt": "2026-07-30T12:42:41Z",
  "healthCheck": {
    "lastRunAt": "2026-07-30T16:03:21Z",
    "findings": [
      { "id": "meta:products-no-seo-description", "firstSeenAt": "2026-07-30T16:03:21Z" },
      { "id": "meta:collections-no-description", "firstSeenAt": "2026-07-30T16:03:21Z" }
    ]
  }
}
```

The shared-file rule held: the whole object was read, only `healthCheck` was
replaced, the whole object written back.

## Still unverified

1. **A second run.** Everything in Step 5 — "new", "open since", "expired as
   announced", carrying forward the ids of a check that could not run — is
   untested code, because this run had nothing to compare against. The first run
   with a populated `healthCheck` key is the real test of this skill.
2. **The discount findings.** All three ids (`no-end`, `just-expired`,
   `ends-soon`) are unproven; the query never returned a row.
3. **Broken links.** Zero were found, so `link:<path>`, the admin-object phrasing
   and the `truncated` branch are all unexercised.
4. **The password-page lock rule.** The storefront is open, so `lock:password-page`
   and the "skip all other link findings" branch never fired.
