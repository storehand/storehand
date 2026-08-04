# Dogfooding the SEO metadata audit — three runs on a live store

Date: 2026-08-04. Task 10 of `docs/plans/2026-08-04-seo-metadata-audit.md`.

Three sweeps of a live 42-product catalogue, with a real write in between: the
audit read the store, `product-listing-writer` fixed one product against what it
saw in the photos, and the next sweeps proved the difference count and the
partial-update reporting.

**Three bugs came out of it, two of them in shipped code**, and all three have
the same shape — a partial or impossible result that reads as a complete one:

1. a count of 76 findings on a catalogue of 42 (this branch);
2. an instruction to fetch an image URL that no query returned (v0.3.0);
3. alt text documented as covered by `write_products` when Shopify keeps it
   behind `write_files` (v0.3.0), with an errors table that sent the user back
   to the scope they already had.

Each is written up below with its fix and the test that now holds it.

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

## The listing writer, propose phase — and the bug that stopped it

Ran against the `tops` collection on the same store. 17 products, 15 without a
meta description. Reduced deliberately to one product and three images, enough
to prove the mechanism without spending a context window.

### A shipped instruction that could not be followed

Step 4 tells the reader to fetch each image and look at it, and says the URL
"comes back on the `MediaImage` node". **It does not.** None of the three
listing-writer queries selected `image { url }` — they returned `id` and `alt`
only. A user following the instruction literally would have had nothing to
fetch.

This is the same failure class as the `$CLAUDE_PLUGIN_ROOT` bug of 2026-08-04:
an instruction that reads as complete and cannot be executed. It was written in
the same session that added the instruction, and it survived a full test suite,
because nothing tested that the queries could satisfy what the prose asked for.

Fixed in all three queries, and a test now asserts that any query selecting
`MediaImage` also returns the image URL.

### What the photos actually showed

The three images all carried the identical alt
`"Gimme Knitted Comfort T-Shirts - Soft, Stylish & All Fit"`. Looking at them:

| Image | What is really there |
|---|---|
| 1 | The T-shirt in **taupe**, cropped at the hip |
| 2 | The same shirt in **pale yellow**, cropped at the hip |
| 3 | The pale yellow shirt **full length**, over grey wide-leg jeans |

So the duplicate alt was hiding two different things at once: **two colours**
and **two framings**. A shopper searching for a beige top never reaches image 1,
and a screen reader announces the same English supplier name three times on a
Dutch store.

**A third alt-text problem that no rule catches: language.** The alts are the
supplier's English product name while the store, its titles and its copy are
Dutch. `shared/metadata-rules.md` has no rule for that, and this store makes it
429 images wide. Candidate rule, not yet added — one store is not evidence, and
that is exactly the reasoning that kept the vendor-name pattern marked unproven.

### Proposed output

```
1. "Aansluitend basic T-shirt met ronde hals in taupe,
    gecombineerd met een grijze jeans"
2. "Hetzelfde T-shirt in zachtgeel, met korte mouwen en ronde hals"
3. "Zachtgeel basic T-shirt in vol beeld, op een grijze wide-leg jeans"

seo.description: "Aansluitend basic T-shirt met ronde hals en korte mouwen.
                  Verkrijgbaar in taupe en zachtgeel."
```

No fabric, no composition, no "premium quality" — colour, cut and framing only,
which is what is visible. The proposal file was **not** written and nothing went
to Shopify: this stops at the point where the owner has to approve.

## Applying it — and the scope that was documented wrong

The owner approved writing the four fields on one product. The staleness check
re-read the live values first and they were unchanged, so the write went ahead.

**`productUpdate` succeeded.** `seo.description` was written and read back:

```
"Aansluitend basic T-shirt met ronde hals en korte mouwen.
 Verkrijgbaar in taupe en zachtgeel."
```

**`fileUpdate` was refused**, and the refusal is a shipped documentation bug:

```
Access denied for fileUpdate field. Required access:
`write_files` access scope or `write_themes` access scope.
```

Alt text does not live behind `write_products`. It lives behind `write_files`,
because Shopify treats images as files rather than as product fields. And this
repository told users otherwise, in three places, all shipped in v0.3.0:

- the README's skill table promised `write_products` covers "image alt text";
- the README's permission table said the same;
- `storehand-setup` requested only `write_products` on its auth line.

So a user who followed the documented setup exactly and granted `write_products`
would have had every alt-text write refused — and the skill's own errors table
would have told them to re-authorise with `write_products`, which they already
had. A loop with no exit, on one of the five fields the skill advertises.

Fixed in all three places, plus a new errors row that distinguishes the two
failures: ACCESS_DENIED on `productUpdate` means read-only, ACCESS_DENIED on
`fileUpdate` alone means the text was written and the alt text was not — which
must be reported per image, never as a finished product. Two tests now hold it:
one asserts that any skill reaching `fileUpdate` names `write_files`, one that
setup asks for both.

**Why no test caught this:** every test asserted what the instructions *say*.
Nothing asserted that the instructions can be *carried out*. Same gap as the
missing image URL above, found in the same hour, and both only surfaced by
running against a real store.

## Run 2 — the difference count works

Re-ran the sweep straight after the write:

```
HEAVY  products with no seo.description  37   (was 38 — 1 fixed)
HEAVY  images with no alt text            0   (unchanged)
MEDIUM images with a duplicate alt      429   (unchanged)
SANITY ok — no per-product category exceeds 42
```

Exactly one finding closed, which is exactly one product written. The duplicate
alt count did not move, and that is correct rather than disappointing: the alt
text could not be written, so nothing about it changed, and the report says so
instead of quietly implying progress.

**That is the half of this skill that had never been proven**, and it now is.

## Run 3 — alt text written end to end, and a partial fix reported as partial

The owner re-authorised with `write_files` (via the `xdg-open` shim route in
`docs/connect.md`, since this machine has no browser). Three alt texts were then
written, one `fileUpdate` call per image, and read back from the store:

```
foto 1: "Aansluitend basic T-shirt met ronde hals in taupe, gecombineerd met een grijze jeans"
foto 2: "Hetzelfde T-shirt in zachtgeel, met korte mouwen en ronde hals"
foto 3: "Zachtgeel basic T-shirt in vol beeld, op een grijze wide-leg jeans"
foto 4: "Gimme Knitted Comfort T-Shirts - Soft, Stylish & All Fit"   ← untouched, as designed
```

Third sweep straight after:

```
MEDIUM images with a duplicate alt   426   (was 429 — 3 fixed)
partially updated: 1 product — 3 of 16 images now unique
```

**The cap behaved exactly as designed and the report says so.** Three images
fixed, thirteen still sharing an alt, one product flagged as partially updated
rather than quietly dropped or quietly kept. That is the case the whole
`partially updated` rule exists for, and it is now proven rather than argued.

### One more truncated view read as a whole number

This product has **16 images, not 10**. The earlier note in this file said ten,
because `products-by-handle.graphql` fetches `media(first: 10)` while the audit's
sweep fetches `first: 20`. Nothing was wrong with either query — the number in
the prose was a capped view quoted as a total.

Third instance in one session of the same shape: a partial result that reads as
complete. The others were the 76-on-42 count and the missing image URL. Worth
noting that all three were caught by comparing two sources, never by reading one
more carefully.

## What has not been tested

- **The missing-menu-scope path.** This store has
  `read_online_store_navigation`, so the branch that drops the visibility layer
  has never executed. It must be forced before release.
- **A store with no collections at all.** Every product here sits in at least
  one, so the "bottom of the report" section rendered empty and its wording is
  untested.
- **A catalogue that needs more than one page.** 42 products fit in one sweep;
  the multi-page path was proven only with an artificially small page size.

## Shipped anyway, and why

An earlier draft of this note ended "skill #5 is not shippable on this evidence
alone". It went out in v0.4.0 regardless, as a deliberate call rather than an
oversight, so the reasoning belongs here next to the gaps.

**What tipped it:** two of the three bugs above are in *shipped* 0.3.0 and are
hurting users now. Anyone who followed the documented setup and tried to write
alt text hit a refused scope and an errors table that sent them back to the
scope they already had. Holding that fix until a second test store exists costs
more than the three untested paths risk.

**What the untested paths actually risk:** all three are degradation paths, not
data paths. A store without the menu scope gets a coarser ordering; a store with
no collections gets an untested sentence; a large catalogue exercises paging that
was proven at `first: 5` but not at scale. None of them can write to a store,
and none can make the audit report a number it did not measure — the count check
in Step 4 holds regardless.

**What would change the call:** an untested path that could produce a wrong
number rather than a worse ordering. There is none here. If a future round finds
one, it blocks the release rather than joining this list.

The three gaps stay open above, in their own words, and the roadmap says
`Shipped`. Both are true at once, and this paragraph is what makes them
compatible instead of contradictory.
