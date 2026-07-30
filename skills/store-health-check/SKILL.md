---
name: store-health-check
description: Weekly read-only health check of a Shopify store — active products that are out of stock, discounts that expired or never end, storefront links that 404, and missing SEO metadata. Use when the user asks for a health check, a site check, broken link check, a weekly store checkup, or whether the store is healthy.
---

# Store health check

One weekly, read-only sweep. Four checks, one report, and a small memory so the
report can say "new" and "open since". Writes nothing to the store, ever.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md`, the `queries/` and `scripts/` directories — live under
`$CLAUDE_PLUGIN_ROOT`. The store profile (`.storehand/`) lives in the user's
working directory. If `$CLAUDE_PLUGIN_ROOT` is empty, say so and stop; do not
guess a path.

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` and
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md` before you start.

## Step 1 — Load the profile and the memory

Read `.storehand/store.yaml`: you need `store`. No `.storehand/`? Point the
user at the `storehand-setup` skill and stop.

Read `.storehand/state.json` and keep the **whole** object in hand — other
skills store their keys in this file and they must survive your write in
Step 6. Under `healthCheck` you may find `lastRunAt` and `findings`
(a list of `{ "id", "firstSeenAt" }`).

- **File absent** → this is the first health check: say so in the report and
  skip the "new"/"open since" labels.
- **File present but unparseable** → say so explicitly in the report, run the
  checks anyway, but do **not** write `state.json` at the end — overwriting a
  file you could not parse would destroy another skill's marker along with
  your own.
- **File present but no `healthCheck` key** → first health check for this
  skill: say so and skip the "new"/"open since" labels.

## Step 2 — Run the queries

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned
version, pass `--version <handle>` on every call. All calls are read-only —
**never add `--allow-mutations`**. Write variables to files, never inline
(quoting damage is silent):

```bash
V="$(mktemp -d)"
```

```bash
printf '%s' '{"query":"status:active","first":100}' > "$V/products.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/active-products-inventory.graphql" \
  --variable-file "$V/products.json"
```

```bash
printf '%s' '{"first":100}' > "$V/collections.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/collections-health.graphql" \
  --variable-file "$V/collections.json"
```

```bash
printf '%s' '{"first":50}' > "$V/discounts.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/discounts.graphql" \
  --variable-file "$V/discounts.json"
```

```bash
printf '%s' '{"first":10}' > "$V/menus.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/menus-and-domain.graphql" \
  --variable-file "$V/menus.json"
```

Read each command's output before moving on.

Progress lines with terminal escape codes go to stderr — and so does the
CLI's error box when a call fails, while stdout stays empty. `2>/dev/null`
therefore hides errors, not just noise: only silence stderr once a command
has proven to work. Check the exit code, and treat empty stdout as a failed
call, never as a quiet result.

The last two need scopes a store
connected before health checks existed will not have (`read_discounts`,
`read_online_store_navigation`). An ACCESS_DENIED there does **not** kill the
run: mark that check "not measured", keep going, and put the exact re-auth
line from the Errors table in the report.

If any `pageInfo.hasNextPage` is true, say the list was truncated and that the
real numbers are higher. Do not paginate.

## Step 3 — Derive the findings

Re-check everything; filters narrow, they do not guarantee.

- **Sold out but active** — products where `status` is `ACTIVE`,
  `tracksInventory` is true and `totalInventory <= 0`. Exclude products where
  every returned variant has `inventoryPolicy: CONTINUE` — they sell on
  backorder by design, not a stockout. When some but not all variants
  continue selling, keep the finding but phrase it as a question in the
  report ("intentional backorder, or should it be hidden?"). If a product
  has more variants than the query returns, keep the finding rather than
  excluding it — a hidden `DENY` variant may be the stockout.
  Finding id: `oos:<handle>`.
- **Discounts** (skip entirely if not measured) — compare against the clock,
  not against `status` alone:
  - `ACTIVE` and `endsAt` null → `promo:<title>:no-end` (informational);
  - `endsAt` within the past 7 days → `promo:<title>:just-expired`
    ("was that intentional?");
  - `ACTIVE` and `endsAt` within the next 7 days → `promo:<title>:ends-soon`.

  On a store with more discounts than the query fetches, the just-expired
  finding is a lower bound — an old untouched discount can fall outside the
  window; say so when `hasNextPage` was true. A discount naturally moves
  `ends-soon` → `just-expired` between runs; when the old id disappears
  exactly as the new one appears, say "expired as announced" rather than
  calling it new.
- **Metadata gaps** — counts plus at most three example handles each:
  products with `seo.description` null or empty
  (`meta:products-no-seo-description`), collections where **both** the body
  `description` and `seo.description` are empty
  (`meta:collections-no-description`). For images: products with
  `featuredMedia` null are a separate count and a worse problem — no image at
  all (`meta:images-missing`); only products with a non-null `featuredMedia`
  whose `alt` is empty or null count toward `meta:images-no-alt`. Presence
  only — judging and fixing the texts is the SEO audit skill's job, say so in
  the report.

## Step 4 — Check the storefront links

Build one URL list from what the store says exists, in this order — menu
items first, then collections, then products:

- every menu item `url` (all levels, when menus were measured), **skipping**
  items whose URL is empty or points at another domain — count those external
  links and mention the count, do not fetch them. Menu-item URLs arrive
  absolute (`https://store.example/pages/x`); normalise each to its path
  before it goes in the list;
- `/collections/<handle>` for every collection from Step 2;
- `/products/<handle>` for every **ACTIVE** product.

The script checks at most 200 URLs (its own cap). Put the menu links first so
they are never the ones dropped — they are the only hand-typed URLs and the
likeliest to be broken. When the cap is hit the script says `truncated: true`;
name the cap in the report.

Write the input file yourself from the query output (no extra tooling needed):

```bash
cat > "$V/urls.json" <<'JSON'
{ "base": "<primaryDomain.url from Step 2>",
  "urls": ["/collections/…", "/products/…", "/pages/contact"] }
JSON
node "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/scripts/check-urls.mjs" "$V/urls.json"
```

The run can take several minutes on a large store (200 URLs, 10s timeout
each, 4 at a time) — give the command a generous shell timeout rather than
letting a default kill it silently.

`base` is `shop.primaryDomain.url` from the collections query (it rides along
there precisely because that query needs no extra scope). If even that is
missing, do **not** run the link check — report it "not measured". Never
substitute the `*.myshopify.com` domain: its canonical redirect makes every
URL come back `offDomain` and the check silently measures nothing.

Read the JSON it prints:

- any entry with `passwordPage: true` → **the storefront is behind its
  password page.** Report that as one finding (`lock:password-page`), skip all
  other link findings — behind the lock every URL redirects there and none of
  it means anything.
- entries with `status >= 400` → finding `link:<path>` (no status in the id —
  a 404 that becomes a 503 is the same broken link; report the current status
  as detail). For a collection or product URL, name the admin object it came
  from: "exists in admin but returns 404 — not published to the Online Store,
  or broken".
- entries with `offDomain: true` → informational: name the URL and where it
  went.
- entries with `skipped: true` → not fetched (a `mailto:`, `tel:` or similar
  non-http link); count them with the external links, never as broken.
- entries with `error` → the check did not run for that URL; report the
  literal error, never count it as healthy or broken.
- `truncated: true` → say the list was cut off at the cap and link findings
  are a lower bound.

## Step 5 — Compare with last time

For every finding id from Steps 3–4:

- id present in the previous `findings` → label it **open since
  <firstSeenAt>** and carry the old `firstSeenAt` forward;
- id not present before → label it **new**, `firstSeenAt` = now;
- previous id that no longer occurs → drop it silently — resolved is
  resolved — but **only if the check that produces that id prefix actually
  ran**. For a check reported "not measured", and for all `link:*` ids when
  the password page was hit, carry the previous entries forward unchanged; a
  finding you could not look at is not resolved.

## Step 6 — Report, then remember

Fixed shape:

1. One headline line, counts only:
   > 2 sold out but active · 1 broken link (**new**) · 1 discount without an
   > end date · 12 metadata gaps
2. Only the non-empty categories, new findings first, with the "open since"
   labels. Name products and collections by handle or title, never by GraphQL
   id. Above ~15 items in one category, give the shape (how many, how bad)
   and offer the full list on request.
3. A few concrete suggested actions. **Never execute them** — this skill
   proposes, the human decides.

**Only after a successful report** — every check either measured or explicitly
reported "not measured" — write `.storehand/state.json`: take the object from
Step 1, replace only the `healthCheck` key with
`{ "lastRunAt": "<now, ISO 8601 UTC>", "findings": [ … ] }` — all ids you
reported this run **plus every id carried forward under Step 5** (a finding
you could not look at keeps its place and its `firstSeenAt`) — and write the
whole object back. If any measured check failed outright, leave the file
untouched — a moved marker after a partial run hides whatever the failed part
never saw. And as in Step 1: if `state.json` was unparseable, do not write at
all.

## Errors — never report a number you did not measure

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show `shopify store auth --store <store> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation`, stop |
| ACCESS_DENIED on discounts or menus only | Report that check "not measured", show the auth line above as the fix, continue with the rest |
| Storefront behind its password page | One finding, no link list — see Step 4 |
| `check-urls.mjs` fails or times out | Show the literal error; never report "no broken links" |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| `$CLAUDE_PLUGIN_ROOT` is empty | Stop; never guess where plugin files are |
| Every query fails | Report the failure. Never "the store is healthy" |

A healthy store and a broken integration look identical in a report that hides
errors. Never let them.
