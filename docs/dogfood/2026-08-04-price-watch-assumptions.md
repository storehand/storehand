# Measuring the price-watch assumptions before building

Date: 2026-08-04. Task 1 of `docs/plans/2026-08-04-price-and-competitor-watch.md`.
Three open points from the design, measured rather than assumed. Nothing was
written to any store; every call below is read-only.

## 1. The price fields exist, and one of them lies

Query run against a live store on the pinned version `2026-07`:

```graphql
query PriceProbe($first: Int!) {
  products(first: $first) {
    nodes {
      handle
      status
      priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
      variants(first: 5) { nodes { title price compareAtPrice } pageInfo { hasNextPage } }
    }
  }
}
```

**Result: every field exists and returns what the design expects.** `amount` and
`price` come back as strings (`"69.99"`), `currencyCode` as `"EUR"`.

### `compareAtPrice` is `"0.00"`, never `null`

Across the whole catalogue — **42 products, 356 variants** — `compareAtPrice`
came back as the string `"0.00"` **356 times out of 356**. Not once `null`.

This matters because the skill uses a strike-through price to tell a sale from a
normal price. The obvious check — *is `compareAtPrice` set?* — is true for
`"0.00"`, and the report would then announce a sale on every product in the
store and put "normally €0.00" next to it.

Same failure family as the `null`-versus-`""` finding of 2026-08-03: Shopify
hands back a value that is technically present and semantically empty.

**Whether this is Shopify's own behaviour or the importer app writing zeros is
not established — this is one store.** So the rule must not depend on knowing
which:

> A product is on sale only when `compareAtPrice` parses as a number **strictly
> greater than** `price`. `null`, `"0.00"`, and any value equal to or below the
> price all mean: not on sale.

That holds under either convention, which is the point.

### Variant truncation does not affect the compared price

No product on this store has more than 30 variants, and the catalogue was not
truncated at 50. But the compared number comes from
`priceRangeV2.minVariantPrice`, which is the true minimum regardless of how many
variants the query returns. A truncated `variants` list therefore cannot silently
change the price this skill reports — worth stating, because it is the kind of
thing that would only surface on someone else's larger store.

## 2. Web tooling: available, and blocked by the shops that matter most

This is the measurement that could have invalidated the design. It did not — but
it changes what the skill should promise.

### It is available

Skills do not restrict tools. All four shipped `SKILL.md` files declare only
`name` and `description` in their front matter, so a skill runs with whatever
tools the session has. The `hooks/` directory is a git pre-commit hook for secret
scanning, not a Claude hook, and restricts nothing.

Both `WebSearch` and `WebFetch` were present and functional.

### Searching works

A plain-language product search returned nine real Dutch and Belgian shops —
two department stores, one marketplace, and six clothing brands. **Discovery has
an engine.** (Hostnames are left out of this file on purpose: the repo's secret
scanner flags any real shop domain, and that guard is worth more than the
convenience of naming them here.)

Two limits, both visible in the result: search returns **category pages, not
product pages**, and it returns **no prices**. So search finds candidate shops;
it cannot finish the job.

### Fetching is blocked by exactly those shops

`WebFetch` behaves like `curl`, not like a browser:

| Target | Plain `fetch` (earlier today) | `WebFetch` |
|---|---|---|
| Large sports retailer, product page | 403 | **403** |
| Large fashion marketplace, category page | 403 | **timeout (60s)** |
| Shopify storefront (two different shops) | 200 / 429 | **429, `Retry-After: 60`** |

**This corrects something I told Steffano earlier in the session.** After
measuring five 403s with a plain `fetch`, I said the user's own Claude would get
past a share of them because it may have a real browser underneath. That is true
of Playwright; it is **not** true of `WebFetch`, which is a server-side fetcher
and gets the same 403 from the same shops. The correction matters because the
whole no-script decision rests on what the user's Claude can actually read.

### What this means for the design

Nothing in the design breaks. Three things sharpen:

1. **"Read every candidate before it goes on the list" is now load-bearing, not
   tidiness.** A large share of what search finds will be unreadable, and finding
   that out at listing time is the difference between an honest short list and a
   list that quietly fails every week.
2. **The first discovery run will produce a big `unreadable` section, and the
   skill must say so up front** — otherwise it looks broken when it is being
   accurate. Mainstream retailers block automated reading; small and mid-sized
   DTC shops mostly do not, and those are the comparable competitors anyway.
3. **New rule, straight out of the 429s: pace the reads, and treat 429 as
   "not read".** Shopify's edge rate-limits, and a run that opens twelve Shopify
   competitor pages back to back can trip it. A 429 is never a price and never
   "unchanged" — it goes under **Not read** with its reason, and it is tried
   again next run. This was not in the design; it belongs in Step 7 of the skill.

### Still unverified

`WebSearch`'s own documentation says **US-only**. Queries from here returned
Dutch and Belgian shops, so it clearly serves NL-language queries — but whether
the tool is available at all to an account outside the US is not something this
machine can establish. **A Dutch shop owner who installs StoreHand may not have
`WebSearch` at all.** That is why the skill must name the no-search case
explicitly and never report it as "no competitors found".

## 3. `competitors.yaml` is not git-ignored

`.storehand/state.json` is ignored (machine-written bookkeeping);
`.storehand/store.yaml` is not (hand-written configuration). `competitors.yaml`
is proposed by the skill but **edited and owned by the shop owner** — its whole
purpose is that a human corrects it — so it follows `store.yaml` and stays
tracked.

It holds no secrets. It does hold a shop's competitor analysis, which is why the
decision is worth writing down rather than inheriting by accident: a shop owner
who commits it to a public repository is publishing that analysis. The skill
should say so once, when it first writes the file.

## Verdict

Task 1 does not block Task 2. The design stands, with one rule added (429
handling and pacing) and one expectation corrected (`WebFetch` is not a browser).
