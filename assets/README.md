# Brand assets

| File | Size | Use |
|---|---|---|
| `logo-wide.png` | 500 × 100 (5:1) | The horizontal lockup — mark plus wordmark. The README header |
| `logo-mark.png` | 500 × 500 (1:1) | The mark alone. Avatars, the org picture, favicons, Product Hunt |

## Two things worth knowing before you swap either file

**Never set both `width` and `height` unless they match the file's own ratio.**
The header briefly rendered `logo-wide.png` at `265 × 265`, which squeezed a 5:1
image into a square and flattened the lettering. It is now `400 × 80`, which is
the same 5:1. If you replace the file at a different ratio, change those numbers
with it — or give only `width` and let the browser work out the rest.

**Filenames have no spaces on purpose.** A space becomes `%20` in the raw URL,
which is easy to get wrong by hand and silently returns a 404 that renders as a
broken image rather than an error.

## Where the README points

The header uses an absolute `raw.githubusercontent.com` URL rather than a
relative path, because `assets/` is not shipped in the npm tarball — a relative
link renders on GitHub but breaks on the npm package page.

## Sizes to check before shipping new artwork

The mark ends up at 24 px as a favicon and around 96 px in most listings. Look
at it that small before deciding: fine detail and lettering disappear first, and
a 1200 px canvas hides that completely.
