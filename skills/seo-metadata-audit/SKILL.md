---
name: seo-metadata-audit
description: Read-only sweep of a whole Shopify catalogue for SEO titles, meta descriptions, image alt text and product titles that lag behind — ordered by how much each gap costs, with a pointer at the skill that fixes them. Use when the user asks for an SEO audit, a metadata check, which products need better SEO texts, or where their alt text is weak.
---

# SEO metadata audit

One read-only sweep of the entire catalogue. It judges what is there, orders the
findings by how much they cost, and hands the fixing to
`product-listing-writer`. It writes nothing to the store and asks for no write
scope.

Network: none

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md` and the `queries/` directory — live under the plugin's install
directory. The store profile (`.storehand/`) lives in the user's working
directory.

## Step 0 — Find the plugin

`$CLAUDE_PLUGIN_ROOT` is empty in the environment of a Bash tool call. That is
measured, not assumed; the working routes and the reasoning are in
`shared/plugin-root.md`. Run this once, before anything else:

```bash
ROOT=$( {
  printf '%s\n' "${CLAUDE_PLUGIN_ROOT:-}"
  printf '%s' "$PATH" | tr ':' '\n' | sed -n 's|/bin$||p' | grep -E '/storehand/[^/]+$'
  node -e 'const fs=require("fs"),os=require("os"),p=require("path");try{const j=JSON.parse(fs.readFileSync(p.join(os.homedir(),".claude","plugins","installed_plugins.json"),"utf8"));for(const[k,v]of Object.entries(j.plugins||{}))if(k.split("@")[0]==="storehand"&&v[0]&&v[0].installPath){console.log(v[0].installPath);break}}catch{}' 2>/dev/null
} | while IFS= read -r c; do
  [ -n "$c" ] && [ -f "$c/shared/api-version.md" ] && { printf '%s' "$c"; break; }
done )
[ -n "$ROOT" ] && echo "StoreHand plugin root: $ROOT" || echo "StoreHand plugin root NOT FOUND"
```

Shell state does not survive between tool calls, so there is nothing to export
into: take the path it printed and **substitute it literally** wherever these
instructions write `$CLAUDE_PLUGIN_ROOT`. Never guess it.

Printed `NOT FOUND`? Stop, and tell the user to reinstall the plugin with
`/plugin marketplace add storehand/storehand`.

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` and
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md` before you start.


## Step 1 — Load the profile, the rules and the memory

Read `.storehand/store.yaml`: you need `store`. No `.storehand/`? Point the user
at the `storehand-setup` skill and stop.

Read `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md`. **Those thresholds are the
only ones you judge by.** Do not bring your own idea of a good meta description
length: if that file and your instinct disagree, the file wins, because
`product-listing-writer` fixes against exactly the same rules. A value you flag
here that it would not touch is a finding the owner cannot act on.

Read `.storehand/state.json` and keep the **whole** object in hand — other
skills store their keys there and they must survive your write in Step 5. Under
`seoAudit` you may find `lastRunAt` and `counts`.

- **File absent, or no `seoAudit` key** → this is the first audit: say so and
  leave out the "since last time" column entirely.
- **File present but unparseable** → say so in the report, run the sweep anyway,
  and do **not** write `state.json` at the end. Overwriting a file you could not
  parse destroys another skill's memory along with your own.

## Step 2 — Sweep the whole catalogue

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned version,
pass `--version <handle>` on every call. All calls are read-only — **never add
`--allow-mutations`**. Write variables to a file, never inline, because quoting
damage is silent:

```bash
V="$(mktemp -d)"
printf '%s' '{"first":100}' > "$V/page.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/seo-metadata-audit/queries/catalogue-metadata.graphql" \
  --variable-file "$V/page.json"
```

**Every other skill stops when `hasNextPage` is true. This one does not.** An
audit that reports on the first hundred products of a five-hundred product store
is not an audit, it is a sample wearing the clothes of a total. So keep paging:
take `pageInfo.endCursor` from the page you just read and call again with it,
until `hasNextPage` comes back false.

```bash
printf '%s' '{"first":100,"after":"<endCursor from the previous page>"}' > "$V/page.json"
```

Verified on a live store on 2026-08-04: consecutive pages share no products and
skip none.

Count the pages and say how many products were swept. **If a page fails, stop
and report how far you got** — never present a partial sweep as a total. That is
the one mistake this skill cannot recover from, because the number looks
perfectly reasonable either way.

Shell state does not survive between tool calls, so set `V` again in every call
or pick one fixed scratch path. An unset `V` turns `"$V/page.json"` into
`/page.json`, which fails or writes somewhere else without ever mentioning `V`.

Progress lines and the CLI's error box both land on **stderr** while stdout
stays empty, so `2>/dev/null` hides errors rather than noise. Check the exit
code, and treat empty stdout as a failed call, never as a quiet result.

## Step 3 — Judge, and place every finding on two axes

Judge every product against `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md`. Then
place each finding by **severity** and by **visibility**, because a missing meta
description on a product nobody can reach costs nothing, and putting it next to
one on your best-selling page makes the report useless.

**Visible** means `status` is `ACTIVE` **and** the product is reachable through
at least one collection or menu path. Collections come back on the sweep query.
For menu paths, reuse the health check's query:

```bash
printf '%s' '{"first":10}' > "$V/menus.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/menus-and-domain.graphql" \
  --variable-file "$V/menus.json"
```

That needs the scope `read_online_store_navigation`, which a store connected
before menus were ever queried will not have. On ACCESS_DENIED, **drop the
visibility layer and say so in the report** — collections alone still tell you
something, and the severity ladder collapses to its first axis. **Never assume a
product is invisible because you could not check.** That turns one missing scope
into a whole catalogue of low-priority findings, and the owner would have no way
to tell that from a genuinely unreachable catalogue.

A truncated `collections` list (`hasNextPage` true on that product) can only
under-state visibility, never over-state it: a product already in one collection
is visible whatever the eleventh one says. Treat it as visible and move on.

| Severity | What lands here |
|---|---|
| **HEAVY** | An empty field on a visible product |
| **MEDIUM** | A filled but weak field on a visible product — duplicate alt, `seo.title` identical to the product title, `seo.description` repeating the title |
| **LIGHT** | Length problems: `seo.title` or `seo.description` past the threshold |
| **Bottom of the report** | The same gaps on products reachable from nowhere. Counted, listed last, with the reason spelled out |

### The finding no other skill may make

`product-listing-writer` is forbidden from calling a title a duplicate, and says
so itself: it sees ten products and has not seen the rest. You sweep the **whole
catalogue**, so you can establish it. Products that share an identical title are
your own MEDIUM finding, and you name the handles that collide.

Make it carefully, because it is the one judgement nobody else can check:
compare titles exactly, and **if the sweep stopped early for any reason, say the
duplicate check is incomplete rather than reporting a number.** A duplicate
count from a partial sweep is not a smaller truth, it is a different claim.

## Step 4 — Report

```
SEO audit — 412 products swept across 5 pages

HEAVY    38 products with no seo.description        (was 55)
         12 of them sit in a collection that is in your menu
HEAVY     9 images with no alt text                 (was 9)
MEDIUM  399 images carry the same alt as another image
          on the same product                       (was 429)
          10 products partially updated — images 1-3 fixed,
          the rest still duplicated
MEDIUM   17 seo.titles are the product title verbatim
MEDIUM    4 products share a title with another product
          nl-jas-kort / nl-jas-kort-2
LIGHT    54 seo.titles past the threshold
LIGHT     7 titles read like a stock code

Bottom: 31 gaps on 14 products that sit in no collection and
no menu. Fixing them pays nothing until they are reachable.

Biggest win: the 12 in 'Jassen'.
  → /storehand:product-listing-writer on collection jassen

Nothing was written. This run was read-only from start to finish.
```

### Check every number against what you swept, before you print it

A category counted per product can never exceed the number of products swept. A
category counted per image can never exceed the number of images. **If one does,
the count is wrong — say so and do not print it as a finding.**

This is not hypothetical: the first real run of this skill reported 76 products
without a meta description on a catalogue of 42, because a product was being
counted twice. The number looked alarming rather than impossible, which is
exactly how a counting bug survives. One comparison against the total catches
the whole class.

Rules for the shape:

- Every category that ran gets a number, **including a zero**. A measured zero
  is a result; a category missing from the list reads like a zero without being
  one.
- The `(was …)` column appears only for categories measured both this run and
  last. Leave it off entirely on a first audit rather than printing a dash.
- When `product-listing-writer` has fixed part of a product's images, say
  **partially updated** and name the range. Images four and up keep their old
  alt, so the product stays in the count — without that line the owner sees a
  number that barely moved and concludes the work did nothing.
- Close by naming the collection or tag with the densest cluster of HEAVY
  findings and the exact `product-listing-writer` invocation for it. **An audit
  that ends without a next action is a list**, and a list of 412 products is
  what the owner already had.

### Why your numbers differ from the health check

`store-health-check` counts some of the same gaps, but it **caps at 100
products** and it reports presence only, never quality. This skill sweeps
everything and judges. Its numbers are legitimately higher, and they are not in
conflict.

**Say that in the report whenever a health check has run before.** An owner who
reads 12 in one report and 38 in the other will assume one of them is broken,
and the wrong conclusion is that the audit cannot be trusted.

## Step 5 — Remember

**Only after a successful report**, write `.storehand/state.json`: take the
object from Step 1, replace only the `seoAudit` key with
`{ "lastRunAt": "<now, ISO 8601 UTC>", "counts": { … } }`, and write the **whole
object** back. A skill that rebuilds this file from scratch erases another
skill's memory along with its own.

A category that could not be measured this run **never counts as fixed**: carry
the previous number forward and mark it not measured. Zero found and never
looked at are indistinguishable in a difference count, and the difference count
is half of what makes this an audit rather than a snapshot.

If the sweep stopped early, **do not write `state.json` at all**. A marker moved
after a partial sweep turns next week's "you fixed 17" into a fiction, and
nobody will know which run introduced it.

## Errors — never report a catalogue you did not sweep

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show `shopify store auth --store <store> --scopes read_products,read_online_store_navigation`, stop |
| ACCESS_DENIED on menus only | Drop the visibility layer, say so, continue on collections alone |
| A page of the sweep fails | Report how far you got. Never present a partial sweep as a total |
| `state.json` unparseable | Say so, run anyway, write nothing at the end |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| Step 0 printed `NOT FOUND` | Stop and tell the user to reinstall; never guess where plugin files are |

A clean catalogue and a sweep that died on page one look identical in a report
that hides its failures. Never let them.
