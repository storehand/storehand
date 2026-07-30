# Shopify Admin API version

**Current setting: not pinned.** StoreHand omits `--version` on
`shopify store execute`, so the Shopify CLI uses the latest stable Admin API
version.

## Why it is not pinned yet

Pinning a version we have not verified against a real store is a guess. The
version gets pinned here as soon as it has been read from a live store:

```bash
shopify store execute --store <store>.myshopify.com --json \
  --query '{ publicApiVersions { handle supported } }'
```

Take the newest `supported: true` handle and record it below with the date. That
is the only edit needed — skills read the pinned version from this file and pass
it as `--version` themselves.

## Pinned version

_Not yet pinned._ While this line says "not pinned", skills leave `--version` off
and the CLI uses the latest stable version.

To pin, replace the line above with exactly this shape:

```
Pinned: 2026-07 (verified 2026-08-15)
```

## Why one place

Every skill shares these queries, and more skills are coming. A version bump has
to be one edit here, not one edit per skill — which is why skills read this file
instead of hardcoding a version.
