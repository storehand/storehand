# Changelog

Notable changes per release. A skill is only listed as shipped once it has run
against a live store and the evidence is in [`docs/dogfood/`](docs/dogfood/).

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0 the shape of a skill's output is not a stable interface — the
`.storehand/` profile format and the safety rules are.

## [Unreleased]

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
