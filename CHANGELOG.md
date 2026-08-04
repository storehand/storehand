# Changelog

Notable changes per release. A skill is only listed as shipped once it has run
against a live store and the evidence is in [`docs/dogfood/`](docs/dogfood/).

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0 the shape of a skill's output is not a stable interface — the
`.storehand/` profile format and the safety rules are.

## [Unreleased]

## [0.4.0] — 2026-08-04

### Added

- **`seo-metadata-audit` (skill #5).** A read-only sweep of the *whole*
  catalogue — the first skill that pages past `hasNextPage` instead of stopping
  at one page. It judges SEO titles, meta descriptions, image alt text and
  product titles, orders findings by severity crossed with whether the product
  is reachable at all, and hands the fixing to `product-listing-writer`. It
  writes nothing and asks for no write scope. Duplicate product titles are its
  finding alone: no other skill sees enough of the catalogue to make that call.
- **`shared/metadata-rules.md`.** Every quality threshold now lives in one file,
  read by both the writer and the audit. A test fails if a threshold reappears
  inside a skill — two skills with their own copy of "60 characters" would
  eventually disagree without anyone noticing.
- **A declared store `language`.** `storehand-setup` now asks for it and
  everything StoreHand writes uses it. The old rule was "write in the language
  the existing listings are in", which on a store importing from a foreign
  supplier keeps the supplier's language forever — measured on a live Dutch
  store carrying 429 English alt texts. Existing profiles have no `language`
  key: both skills ask for it rather than guessing.
- **A `Network:` line in every skill**, checked by a test against the list in
  `shared/safety.md`, so the privacy promise cannot go stale unnoticed. That
  list gained a fourth route (product images) and a second one it had always
  been missing: the localhost callback `storehand-setup` has always used.

### Changed

- **`product-listing-writer` looks at your product photos.** It fetches the
  images it is proposing alt text for and describes what is in them, capped at
  3 images per product and 30 per round. Describes the product, never the model,
  and never deduces fabric or composition from a picture — looking is measuring,
  deducing is inventing.
- **Its alt-text rule fires on more than an empty field.** It now also proposes
  for an alt duplicated across a product's images, one equal to the vendor name,
  or a filename. Measured: on a live store, **0 of 429 images had an empty alt
  and all 429 shared one with another image of the same product** — so the old
  rule would have repaired nothing at all there.

### Fixed

- **Alt text needs `write_files`, not `write_products`.** Shopify keeps alt text
  behind `fileUpdate`. The README promised `write_products` covered it, and
  `storehand-setup` requested only that scope, so anyone who followed the setup
  exactly had every alt-text write refused — and the errors table then told them
  to re-authorise with the scope they already had. Both scopes are now requested
  and documented, and the errors table separates the two failures: refused on
  `productUpdate` means read-only, refused on `fileUpdate` alone means the text
  was written and the alt text was not.
- **The listing writer's queries now return the image URL** its own instructions
  tell you to fetch. All three selected `id` and `alt` only, so the "fetch the
  image and look at it" step had nothing to work with.
- The README no longer quotes a test count that had gone stale, and its network
  sentence matches `shared/safety.md`.

**If you use the listing writer, re-authorise** to add `write_files` — otherwise
alt text is skipped and reported as not written. Everything else keeps working
unchanged.

Evidence for all of the above: [`docs/dogfood/`](docs/dogfood/) — three sweeps of
a live catalogue with a real write in between. Three edge cases remain untested
and are named there: a store without the menu scope, a store with no collections,
and a catalogue large enough to need several pages.

## [0.3.0] — 2026-08-04

### Fixed

- **Skills no longer stop before they start.** All four told the reader to halt
  if `$CLAUDE_PLUGIN_ROOT` was empty — and that variable is always empty in a
  Bash tool call, so following the instruction literally halted every skill at
  step one on a correct installation. Exporting it once does not help either:
  shell state does not survive between tool calls. Both measured, not assumed.
- A new **Step 0** resolves the plugin directory over three routes — the
  variable itself, `PATH`, then Claude Code's install register — and verifies
  the winner actually contains `shared/api-version.md` before using it. Neither
  fallback is a documented contract, so neither is trusted on its own.
  Background in `shared/plugin-root.md`, run notes in
  [`docs/dogfood/`](docs/dogfood/).

**If you installed 0.2.0, update.** The plugin cache is keyed on the version
number, so the fix does not reach an existing install on its own.

### Changed

- Issue and pull request templates, a code of conduct, and this changelog.
- `assets/` no longer carries a byte-identical duplicate of the wide logo or an
  unused export.
- 130 tests, up from 121. Nine of them hold the four copies of the Step 0
  snippet byte-identical and run it against a home directory with a space in it.
- The README now shows the **proposal** step as well as the apply step. The
  proposal screenshot is the only place the read-only promise is made by the
  tool itself, and the only one showing it refuse to invent a fact it did not
  have.

## [0.2.0] — 2026-08-03

### Added

- **`product-listing-writer`** — the first skill that can change something, and
  it works in two steps. Propose writes a file listing current and suggested
  text for every field; you edit it. Apply writes only what is still in that
  file. A field somebody changed in the Shopify admin in between is skipped and
  reported, never overwritten. Without the `write_products` scope it still
  produces the proposal and stops at the point of writing.
- Product titles, descriptions, `seo.title`, `seo.description` and image alt
  text, written from the store's own voice in `.storehand/store.md`.
- Re-running an applied proposal is safe: already-written fields come back as
  already-applied rather than being written twice.

### Changed

- The README's scope table now lists `read_reports`. StoreHand does not request
  it — Shopify's own CLI app adds it to every authorization, and the consent
  screen shows it, so leaving it out made the screen look wrong.
- `storehand-setup` no longer describes a device-code flow for headless
  machines. Verified against CLI 4.5.2: `SHOPIFY_CLI_DEVICE_AUTH` is named among
  the CLI's environment variables but read nowhere in its code. The route that
  does work is in `docs/connect.md`.

## [0.1.0] — 2026-07-31

### Added

- **`storehand-setup`** — store profile, connection through Shopify's own CLI
  app, and a read-only smoke test. No Partner account, no app review.
- **`daily-store-briefing`** — new orders and revenue since the last briefing,
  payments needing attention, cancellations, refunds, and variants under the
  stock threshold. Remembers where it left off.
- **`store-health-check`** — weekly sweep for sold-out-but-active products,
  discount windows that expired or never end, storefront links that 404, and
  missing SEO metadata. Fetches the storefront over HTTP rather than trusting
  the admin, and probes for soft 404s first so a store that answers 200 for
  everything is reported as measuring nothing rather than as healthy.
- **Every number is re-checked against the thing it claims to measure.** Shopify
  silently ignores filter terms it does not recognise and its search index lags
  behind the data — both observed on a live store, so a filter is treated as a
  way to fetch less, never as proof.
- A leak-prevention layer after a store domain reached the repository once: a
  scanner, a pre-commit hook, a CI step and `SECURITY.md`. The full history was
  verified afterwards — no token was ever committed.
- Query filter verification (`scripts/verify-filters.mjs`): ask a known field for
  an impossible value, and a filter that is being ignored gives itself away.
- Apache-2.0, a NOTICE, a CLA, and branch protection with CI as a required check.

[Unreleased]: https://github.com/storehand/storehand/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/storehand/storehand/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/storehand/storehand/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/storehand/storehand/releases/tag/v0.1.0
