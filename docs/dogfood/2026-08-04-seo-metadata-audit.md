# Dogfooding the SEO metadata audit — run 1

Date: 2026-08-04. Task 10 of `docs/plans/2026-08-04-seo-metadata-audit.md`.
**This is the read-only half.** The audit ran against a live store of 42
products; nothing was written, and `product-listing-writer` has not been let
near this store yet. Run 2 and the difference count still have to happen.

## What ran

The sweep query and the menu query from the shipped skill, against the live
store, on the pinned API version. One page at `first: 100` — 42 products, so
`hasNextPage` was false. Pagination itself was proven separately in
`2026-08-04-seo-audit-assumptions.md` by forcing `first: 5`.

## The report

```
SEO audit — 42 products swept across 1 page

HEAVY    38 products with no seo.description
         15 of them in 'tops', which is in your menu
HEAVY     0 images with no alt text
MEDIUM  429 images carry the same alt as another image
          on the same product
MEDIUM    0 seo.titles are the product title verbatim
MEDIUM    0 products share a title with another product
LIGHT     3 seo.titles past the threshold
LIGHT     1 seo.description past the threshold

Bottom: none — every product sits in at least one collection,
and 40 of the 42 in one that is in your menu.

Biggest win: the 15 in 'tops'.
  → /storehand:product-listing-writer on collection tops

Nothing was written. This run was read-only from start to finish.
```

The gaps by collection, which is what produces the closing line:

| Products with no `seo.description` | Collection |
|---|---|
| 15 | `tops` — in the menu |
| 8 | `jassen` — in the menu |
| 8 | `broeken` — in the menu |
| 5 | `sets` — in the menu |
| 1 each | `frontpage`, `accessoires`, `jurken` |

## The bug this run found, in the audit itself

The first pass reported **76 products with no meta description on a catalogue of
42**. A product was being counted twice.

What makes it worth writing down is not the arithmetic, it is the shape: 76 is
not obviously wrong. It reads as a store in worse condition than expected, which
is exactly the reaction that carries a bad number past review. It is only
*impossible* if you compare it against the size of what was swept — and nothing
was doing that.

**Fixed in the skill, not just in this run.** Step 4 now requires every count to
be checked against the sweep before it is printed: a per-product category can
never exceed the products swept, a per-image category can never exceed the
images. One comparison catches the whole class, and the real example stays in
the instruction so the next editor knows why the rule is there.

This is the same family as every other finding in `docs/dogfood/`: not a command
that fails, but a number that looks reasonable and is not.

## What the numbers say about the rules

**The duplicate-alt rule is carrying the whole alt-text category.** 429 of 429
images, and zero empty alts — so the rule as it stood before this round would
have found nothing at all on this store. That was the point of widening it, and
the store confirms the reasoning rather than merely permitting it.

**The two unproven alt patterns are still unproven.** Vendor-name alts: 0.
Filename alts: 0. Two runs on one store is not evidence they never occur, but it
is now the second measurement in a row that found none. If run 2 and the next
store agree, they should be dropped rather than carried as rules no catalogue has
ever triggered.

**Three of the four judgement categories came back empty**, and that is a
result, not a disappointment: no duplicate titles, no `seo.title` equal to the
product title, no missing alt text. A skill that finds something everywhere is
not judging, it is complaining. Worth re-checking on a messier store.

## What has not been tested

- **The second run and the difference count.** Half of what makes this an audit
  rather than a snapshot, and completely unproven.
- **`product-listing-writer` reading photos and writing alt text.** A write
  against a live store, so it waits for the owner.
- **The missing-menu-scope path.** This store has
  `read_online_store_navigation`, so the branch that drops the visibility layer
  has never executed. It must be forced before release.
- **A store with no collections at all.** Every product here sits in at least
  one, so the "bottom of the report" section rendered empty and its wording is
  untested.
- **A catalogue that needs more than one page.** 42 products fit in one sweep;
  the multi-page path was proven only with an artificially small page size.

Skill #5 is **not shippable** on this evidence alone. The roadmap row that says
`Shipped` is a claim ahead of its evidence until the items above are closed.
