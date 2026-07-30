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

Take the newest `supported: true` handle, record it below with the date, and add
`--version <handle>` to every query call in every skill.

## Pinned version

_Not yet pinned. See above._

## Why one place

Six skills share these queries. A version bump must be one edit, not six.
