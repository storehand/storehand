# Metadata quality rules

The thresholds every StoreHand skill judges product metadata by. They live here
and nowhere else: `product-listing-writer` writes against them and
`seo-metadata-audit` judges against them, and a skill carrying its own copy
would eventually disagree with the other one without anyone noticing.

A change here is one edit, not one edit per skill — the same reasoning as
`shared/api-version.md`. There is a test that fails if a threshold reappears
inside a skill.

## Thresholds

| Field | Counts as a problem when |
|---|---|
| `seo.title` | Empty · or longer than **60** characters · or identical to the product title |
| `seo.description` | Empty · or longer than **155** characters · or it repeats the product title |
| `image.alt` | Empty or null · or identical to the alt of another image on the same product · or equal to the vendor or brand name and nothing more · or a filename (`IMG_2831`, `DSC_0042.jpg`) |
| any text field | **Not in the store's language**, as declared by `language` in `.storehand/store.yaml` |
| `title` | Reads like a stock code rather than a name · or says nothing a buyer would search for · or is identical to another product's title |

The two length numbers are where search engines start truncating, so a value
above them is not broken — it is a sentence the shopper will not finish reading.
Judge it as worth improving, not as an error.

## What is measured, and what is not

The four `image.alt` patterns are not equally grounded. Measured on a live store
on 2026-08-04, across **429 images on 42 products**:

| Pattern | Hits |
|---|---|
| empty | 0 |
| identical to another image on the same product | **429** |
| equal to the vendor name | 0 |
| a filename | 0 |

So the duplicate-alt rule is the one carrying this store, and the other two are
**unproven** — cheap to check, but no store has yet produced one. Say so rather
than implying all four are equally grounded.

That measurement is also why the "empty or null" rule cannot stand alone: on
this store it would have found nothing at all, while 429 images carried the
product title repeated across every photo of the product.

## The rule that needs the whole catalogue

`product-listing-writer` sees ten products at a time and **must never claim a
title is a duplicate** — it has not seen the rest of the catalogue.
`seo-metadata-audit` sweeps everything, so it can, and it is the only skill
allowed to report that finding.
