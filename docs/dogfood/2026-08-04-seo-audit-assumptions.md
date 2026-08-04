# Measuring the SEO-audit assumptions before building

Date: 2026-08-04. Task 1 of `docs/plans/2026-08-04-seo-metadata-audit.md`.
Read-only throughout; nothing was written to any store.

## 1. The photo cap in the design is wrong

The design says the listing writer looks at photos "within the same 10 products
per round" and the plan calls that "a few dozen photos, not a few hundred".
**Measured on a live store of 42 products carrying 429 images:**

| | |
|---|---|
| Images per product | min **5** · median **9** · max **20** |
| Ten average products | **~102 images** |
| The ten busiest products | **145 images** |
| Image dimensions | 1200×1800, 1080×1620, 800×1200 |

A hundred images is not a few dozen. At the usual cost of an image to a
vision-capable model — roughly `width × height / 750` tokens after it is scaled
to fit 1568px, so about 2,000 tokens for these — a hundred images is on the
order of two hundred thousand tokens. That is a whole context window spent on
one round of alt text. **The number of images is measured; the token figure is
an estimate from the published formula, not something this machine can weigh
directly.** The decision rests on the image count, which is measured.

### Why capping on products cannot work

The spread is the problem, not the average. One product carries 5 images and
another carries 20, so "ten products" is anywhere between 50 and 200 images. A
cap that varies fourfold depending on which products you picked is not a cap.

### Proposed change to the design

Cap **images**, and cap them twice:

- at most **3 images per product** — the first three are what a shopper actually
  sees, and fixing those already breaks the duplicate-alt pattern where it
  matters;
- at most **30 images per round** in total.

Ten products then cost thirty images instead of a hundred and change, and the
number no longer depends on which products came back. The run says how many
images it read and for which products, and offers the rest on request.

This needs Steffano's approval before Task 4 is built, because it changes the
design rather than the plan.

## 2. Pagination works, and the pages are disjoint

The audit is the first skill that must sweep past the first page. Verified with
the cursor on the live store:

```
page 1: denim-vrouwen-jas-kort-…, cotton-vrouwen-t-shirt-…, geweven-casual-… | hasNextPage true
page 2: stylish-straight-pants-…, cozy-acrylic-knit-sweater-…, elegant-checkered-…
overlap between page 1 and page 2: 0
```

`pageInfo.endCursor` fed back as `after` returns the next slice with no repeats
and no gaps. A 42-product catalogue is one page at `first: 100`; the paging path
was proven by forcing `first: 5`.

## 3. Both visibility sources are readable

The severity ladder needs to know whether a product is reachable.

- **Collections** — `store-health-check/queries/collections-health.graphql` runs
  and returns the collections plus `shop.primaryDomain`. No extra scope.
- **Menus** — `store-health-check/queries/menus-and-domain.graphql` runs and
  returns `main-menu` with its items. This needs
  `read_online_store_navigation`, which this store has because skill #2 asked
  for it earlier.

**Not measured: what happens on a store without that scope.** This store has it,
so the ACCESS_DENIED path is still only reasoned about, not seen. The skill must
handle it, and the dogfood run in Task 10 has to force it — a store that cannot
read menus must lose the visibility layer loudly, never end up with a catalogue
labelled invisible.

Also unmeasured: a store with no collections and no menus at all. Same failure
shape, same requirement.

## Verdict

Pagination and visibility are settled and the plan can proceed on both. **The
photo cap is not settled** and Task 4 is blocked on the decision in §1.
