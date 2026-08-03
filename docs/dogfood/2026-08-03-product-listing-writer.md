# Dogfood — product-listing-writer, 2026-08-03

Run against a live store on Admin API `2026-07`. Store anonymised throughout as
`your-store.myshopify.com`; product ids replaced with `PRODUCT_ID`.

The propose phase, the decision layer and the conflict check all ran end to end.
The final approved write is not in this document — see "Still open" at the
bottom.

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

### 1. The brand-voice rule is too strict (open)

Step 1 says `store.md` is "the only source for how the copy should sound" and
tells the session to stop and ask when it is missing. This store has no
`store.md` — but it does have 42 product descriptions in a distinctly
deliberate voice: second person, concrete, understated, no marketing
adjectives.

So the rule blocks on a missing file while the evidence sits in the store
itself. It should permit deriving the voice from existing listings, say that it
did so, and ask only when there is nothing to derive from. Not changed yet:
this is a judgement about how the skill should behave, not a defect in what it
does.

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

## Still open — the last mile

The shop owner was asked for approval at Step 8 and **declined**. Nothing was
written from the proposal, and the remaining product's `seo.description` is
still empty. That is the gate behaving exactly as designed: the run stops at a
no, and stops completely.

What that leaves proven and unproven is worth being precise about, because the
difference decides whether this skill may be called shipped:

| | |
|---|---|
| The mutation reaches the store and reports honestly | **Proven** — `productUpdate` wrote a real field and returned `userErrors: []` |
| Propose → edit → decide → conflict check | **Proven** end to end against live data |
| Step 9 executing an approved plan, and Step 10 reporting it | **Not run** |

So the mechanism is verified and the final hand-off is not. Until a run gets a
yes and Step 9 writes from `plan.apply`, `product-listing-writer` stays
**"Designed, in build"** in the README. The repository's own rule — a skill is
only listed as shipped once it has run against a live store with the evidence
here — is not satisfied by a run that stopped at the gate, however correctly it
stopped.
