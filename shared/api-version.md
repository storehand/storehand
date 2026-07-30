# Shopify Admin API version

## Pinned version

```
Pinned: 2026-07 (verified 2026-07-30)
```

Skills read this line and pass it as `--version` on every
`shopify store execute` call. This is the only place it is recorded: a version
bump is one edit here, not one edit per skill.

## How it was chosen

Read from a live store, not guessed:

```bash
shopify store execute --store <store>.myshopify.com --json \
  --query '{ publicApiVersions { handle supported } }'
```

On 2026-07-30 that returned `2025-10`, `2026-01`, `2026-04` and `2026-07` as
supported. All queries in this plugin were verified against `2026-07`.

## Bumping it

Re-run the command above, take the newest `supported: true` handle, and replace
the `Pinned:` line with the new handle and today's date. Then re-run every
query in `skills/*/queries/` against a real store before shipping the bump — a
field that disappears between versions is exactly what this pin protects against.

If the line ever reads `Pinned: none`, skills leave `--version` off and the CLI
uses the latest stable version.

## Why one place

Every skill shares these queries, and more skills are coming. A version bump has
to be one edit here, not one edit per skill — which is why skills read this file
instead of hardcoding a version.
