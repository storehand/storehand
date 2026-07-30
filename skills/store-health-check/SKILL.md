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
(a list of `{ "id", "firstSeenAt" }`). No `healthCheck` key? This is the first
health check: say so in the report and skip the "new"/"open since" labels.

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

Read each command's output before moving on. The last two need scopes a store
connected before health checks existed will not have (`read_discounts`,
`read_online_store_navigation`). An ACCESS_DENIED there does **not** kill the
run: mark that check "not measured", keep going, and put the exact re-auth
line from the Errors table in the report.

If any `pageInfo.hasNextPage` is true, say the list was truncated and that the
real numbers are higher. Do not paginate.

## Step 3 — Derive the findings

Re-check everything; filters narrow, they do not guarantee.

- **Sold out but active** — products where `status` is `ACTIVE`,
  `tracksInventory` is true and `totalInventory <= 0`.
  Finding id: `oos:<handle>`.
- **Discounts** (skip entirely if not measured) — compare against the clock,
  not against `status` alone:
  - `ACTIVE` and `endsAt` null → `promo:<title>:no-end` (informational);
  - `endsAt` within the past 7 days → `promo:<title>:just-expired`
    ("was that intentional?");
  - `ACTIVE` and `endsAt` within the next 7 days → `promo:<title>:ends-soon`.

  On a store with more discounts than the query fetches, the just-expired
  finding is a lower bound — an old untouched discount can fall outside the
  window; say so when `hasNextPage` was true.
- **Metadata gaps** — counts plus at most three example handles each:
  products with `seo.description` null or empty
  (`meta:products-no-seo-description`), products whose `featuredMedia.alt` is
  null or empty (`meta:images-no-alt`), collections where **both** the body
  `description` and `seo.description` are empty
  (`meta:collections-no-description`). Presence only — judging and fixing the
  texts is the SEO audit skill's job, say so in the report.

## Step 4 — Check the storefront links

Build one URL list from what the store says exists:

- `/collections/<handle>` for every collection from Step 2;
- `/products/<handle>` for every **ACTIVE** product;
- every menu item `url` (all levels, when menus were measured), **skipping**
  items whose URL is empty or points at another domain — count those external
  links and mention the count, do not fetch them.

Write the input file yourself from the query output (no extra tooling needed):

```bash
cat > "$V/urls.json" <<'JSON'
{ "base": "<primaryDomain.url from Step 2>",
  "urls": ["/collections/…", "/products/…", "…"] }
JSON
node "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/scripts/check-urls.mjs" "$V/urls.json"
```

When `menus` was not measured, take `base` from the profile's `store` domain's
primary domain — it is in the same query as the menus; if that whole query was
denied, fall back to `https://<store>` and say so in the report.

Read the JSON it prints:

- any entry with `passwordPage: true` → **the storefront is behind its
  password page.** Report that as one finding (`lock:password-page`), skip all
  other link findings — behind the lock every URL redirects there and none of
  it means anything.
- entries with `status >= 400` → finding `link:<path>:<status>`. For a
  collection or product URL, name the admin object it came from: "exists in
  admin but returns 404 — not published to the Online Store, or broken".
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
- previous id that no longer occurs → drop it silently. Resolved is resolved.

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
`{ "lastRunAt": "<now, ISO 8601 UTC>", "findings": [ … ] }` (all current ids
with their `firstSeenAt`), and write the whole object back. If any measured
check failed outright, leave the file untouched — a moved marker after a
partial run hides whatever the failed part never saw.

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
