# site/

The waitlist page. One self-contained `index.html` — no build step, no
dependencies, no external requests (system fonts only, so nothing is fetched
from a third party when someone opens it).

## Before it goes live

1. **Pick a form provider** (Formspree, Buttondown, Tally) and replace
   `REPLACE_WITH_FORM_ENDPOINT` in `index.html` with its endpoint. Until then
   the form deliberately does nothing on submit rather than posting addresses
   into a URL that does not exist.
2. Check that the fine print under the form still matches what that provider
   actually does with the address.

## Publishing

GitHub Pages, two options — they differ only in the URL:

**Own repo (`storehand.github.io`), served at `https://storehand.github.io`.**
Create that repo in the org, copy `index.html` into its root, enable Pages on
the default branch. Shortest URL, and `getstorehand.com` can be pointed at it
later without moving anything. Cost: the page lives in a second repo.

**This repo, served at `https://storehand.github.io/storehand`.** Pages can only
serve a branch root or `/docs` from a repo, and `/docs` is already the project
documentation — so this needs a small Actions workflow to publish `site/`.
Keeps everything in one place, at a longer URL.

Either way the page is static: no server, no database, nothing to keep running.
