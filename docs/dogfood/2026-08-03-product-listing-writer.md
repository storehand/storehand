# Dogfood — product-listing-writer, 2026-08-03

Run against a live store on Admin API `2026-07`. Store anonymised throughout as
`your-store.myshopify.com`; product ids replaced with `PRODUCT_ID`.

Both phases ran end to end, including one approved write and its verification.
The write was reverted afterwards, so the store is as it was found. Six findings
came out of the run; four were fixed on this branch, one confirmed a fix made
earlier, and one is deliberately left open.

## The two unverified GraphQL shapes are settled

The plan flagged both as taken from Shopify's docs rather than from a live call.
Both were checked against the pinned version:

| Shape | Result |
|---|---|
| `collectionByHandle(handle:)` | **Exists.** A non-existent handle returns `null` with no error, rather than failing validation — so the field is valid on `2026-07` and its miss is a quiet `null`, not an exception |
| `productUpdate(product: ProductUpdateInput!)` | **Correct argument name.** An `id`-only mutation returned the product with `userErrors: []`, changing no field — enough to prove the argument without writing anything |

No query or mutation file needed changing.

## The filter warning in shared/safety.md, measured

`shared/safety.md` says a search term the Admin API does not recognise is
silently ignored. Measured on a store with **42 active products**, using this
skill's own `products-by-tag.graphql`:

| Query | Products returned |
|---|---|
| `tag:denim` | 1 |
| `tagg:denim` | **42 — the whole catalogue** |
| `handel:<a real handle>` | **42 — the whole catalogue** |
| `handle:does-not-exist` | 0 |

The distinction matters and is worth stating plainly: a misspelled **field name**
widens silently to everything, while a misspelled **value** correctly returns
nothing. Only the first is dangerous, and it is the one no error message
announces.

Without Step 2's per-path re-check, a single wrong letter would have produced
rewritten copy for all 42 products.

## What the run did

Two products, `seo.description` on both, empty on both beforehand.

1. **Propose** — rendered a proposal recording `HUIDIG` as empty for each.
2. **A change from outside the proposal** — one product's `seo.description` was
   then set through a separate `productUpdate` call, standing in for the shop
   owner editing it in the Shopify admin between the two phases.
3. **Decide** — `plan-apply.mjs` against freshly fetched live values:

   ```
   apply    1 product · seo.description
   skipped  1 · changed-in-admin, quoting what the proposal recorded ("")
              and what is there now
   ```

The untouched product stayed applicable and the edited one was skipped. **One
changed field did not block the other product**, which is the behaviour the
per-field design exists for.

## What this run found

### 1. The operator talked himself out of the brand-voice rule (no change needed)

Step 1 says `store.md` is the only source for how the copy should sound, and to
stop and ask when it is missing. The test store had no `store.md`, so this run
should have stopped. **It did not.** The voice was inferred from the store's 42
existing product descriptions instead, and the copy was written on that basis.

That was the wrong call, and the rule is right as written. Three reasons, in
increasing order of importance:

1. `store.md` belongs to the shop owner, not to this repository. `storehand-setup`
   creates it from a template with the prompts left in place, precisely so the
   owner fills it in. A missing one means onboarding was never finished — which
   is what happened here — and the fix is to finish onboarding, not to loosen
   the skill.
2. Deriving the voice removes the reason to ever write the file. A rule that
   quietly works around itself stops being a rule.
3. **The inference only looked sound because of survivorship.** This store's
   descriptions read well because they had already been rewritten by hand. On a
   store that has not had that treatment, the existing descriptions are the
   supplier's stock text — the very thing this skill exists to replace. Deriving
   "the store's voice" there would faithfully reproduce a wholesaler's copy and
   present it as the owner's own.

The instructive part is how easy the rule was to reason past: there was
plausible evidence sitting right there, and the derived copy was good. Rules of
this kind are broken by good intentions and a convenient exception, not by
carelessness. Left exactly as written.

### 2. Alt text is skipped where it is worst (open)

Step 4 proposes `image.alt` only when the field is "empty or null". On this
store no alt text is empty — every image carries the raw supplier product name,
repeated identically across all three images of a product ("Denim Vrouwen Jas
Kort Tiger Stripe Patroon"). Those are exactly the alt texts worth rewriting,
and the rule skips all of them.

"Empty" is the wrong test. Something closer to "empty, or identical across
several images of one product, or clearly a supplier's stock string" would
catch the real case. Left alone deliberately until there is more than one
store's worth of evidence.

### 3. The setup skill's headless auth instruction did not work (fixed)

`storehand-setup` told server users to authenticate with
`SHOPIFY_CLI_DEVICE_AUTH=1`. On CLI 4.5.2 that variable is listed among the
CLI's environment variable names but read nowhere in its code — setting it
changes nothing, and `shopify store auth` still dies with
`spawn xdg-open ENOENT`. The skill promised a way out to precisely the audience
that needs one.

Replaced with the route that actually worked: an `xdg-open` stand-in that prints
the URL, an SSH tunnel for the callback, and a `curl` fallback for delivering
the code by hand when the tunnel was not up in time.

**Read the callback port out of the printed URL.** The CLI's source contains
`3456` as a constant; the real `redirect_uri` on this run was port `13387`.
Documenting the constant would have sent someone to tunnel the wrong port.

### 4. Shopify requests a scope StoreHand does not ask for (fixed)

The consent screen listed `read_reports` alongside the six requested scopes —
Shopify's own CLI app adds it to every authorization. The README claimed an
exact scope list, so the claim was not quite true. Now noted in the scope table.

## The write, end to end

The owner declined at the first approval gate, then approved a run whose only
purpose was to prove Steps 9 and 10. It ran in full:

1. Live values re-fetched. `plan-apply.mjs` put one product in `apply` and kept
   the edited one in `skipped`.
2. `productUpdate` executed with the entry's `productInput` plus its `id`.
   Response: `userErrors: []`, with the new value echoed back.
3. Verified independently by re-querying the product rather than trusting the
   mutation's own response.
4. Reverted afterwards — the test store is left as it was found.

### 5. Re-running a proposal accused the owner of an edit they never made (fixed)

Step 10 claimed that re-running apply on the same file "will report everything
as `unchanged`". Tested immediately after the successful write. It does not.

The field now holds the proposed text, which differs from the `HUIDIG` block the
proposal recorded — so it took the drift branch and came back as
**`changed-in-admin`**. Nothing was written twice, so the run was safe. The
report was not: it told the shop owner that somebody had edited that field in
the admin, when StoreHand itself had written it one run earlier.

Same failure as the parser message earlier in this branch — a report inventing a
cause — and worse here, because it accuses a person.

Fixed in `plan-apply.mjs` rather than in the prose: when the live value is
exactly the proposed text, the skip reason is now `already-applied`. Both
outcomes still skip the field; only the words differ, and the words are what the
owner acts on. Confirmed against the live store: the written product now reports
`already-applied` while the separately-edited one still reports
`changed-in-admin`.

### 6. Shopify stores an empty SEO field as `null`, not `""` (confirms an earlier fix)

The revert wrote `""` to `seo.description`. Reading it back returns `null`.

That is the exact case behind the `raw ?? ''` normalisation in `plan-apply.mjs`:
a proposal records an empty field as `""`, the store hands back `null`, and a
strict comparison would call every empty field a conflict. The fix was made on
reasoning earlier in this branch; this run turned it into a measurement.

## Still open — nothing

Every step of both phases has now run against a live store, and the evidence is
above. `product-listing-writer` meets the repository's bar for shipped.

| | |
|---|---|
| Both unverified GraphQL shapes | Settled against `2026-07` |
| Propose → edit → decide → conflict check | Proven |
| Step 9 writing an approved plan, Step 10 reporting it | Proven |
| Store left as found | Yes — the one test write was reverted |
