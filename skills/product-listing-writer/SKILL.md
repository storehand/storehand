---
name: product-listing-writer
description: Write Shopify product copy in the store's own voice — titles, descriptions, SEO title and description, and image alt text — as an editable proposal file, then apply exactly what you left in it. Use when the user wants product listings written or rewritten, better product descriptions, SEO texts for products, alt text for product images, or asks to apply a listing proposal.
---

# Product listing writer

Two phases, and they never run in one breath. **Propose** reads the store and
writes a file you edit. **Apply** writes to the store, and only the fields you
left in that file that nobody touched in the admin meanwhile.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md`, `queries/`, `mutations/`, `scripts/` — live under the plugin's
install directory. The store profile and the proposals (`.storehand/`) live in
the user's working directory.

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

## Which phase am I in

- The user named products, a collection or a tag → **propose** (Steps 1–5).
- The user said "apply", "doorvoeren", or pointed at a proposal file →
  **apply** (Steps 6–10).
- Neither is clear → ask. Never guess your way into a write.

## Step 1 — Load the profile

Read `.storehand/store.yaml`: you need `store`. Read `.storehand/store.md` in
full — that is the brand voice, and it is the only source for how the copy
should sound. No `.storehand/`? Point the user at `storehand-setup` and stop.

If `store.md` says nothing about voice, audience or house style, **ask before
writing a word.** Copy invented from a blank profile is copy in your voice, not
the store's, and the owner will have to rewrite all of it.

## Step 2 — Resolve the products

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned version,
pass `--version <handle>` on every call. All calls in this phase are read-only —
**never add `--allow-mutations`**. Write variables to files, never inline:

```bash
V="$(mktemp -d)"
```

Shell state does not survive between tool calls. Set `V` again in every call
below, or pick one fixed scratch path and reuse it.

Named handles — one query, quoting each handle:

```bash
printf '%s' '{"query":"handle:linnen-blazer OR handle:wollen-jas","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-handle.graphql" \
  --variable-file "$V/vars.json"
```

A collection:

```bash
printf '%s' '{"handle":"nieuw-binnen","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-collection.graphql" \
  --variable-file "$V/vars.json"
```

A tag:

```bash
printf '%s' '{"query":"tag:zomer","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-tag.graphql" \
  --variable-file "$V/vars.json"
```

Progress lines and the CLI's error box both go to stderr while stdout stays
empty on failure. `2>/dev/null` therefore hides errors, not noise. Check the
exit code, and treat empty stdout as a failed call, never as "no products".

**Re-check what came back — the check differs by path.** Per `shared/safety.md`,
the Admin API silently ignores search terms it does not recognise, and a bad
filter can hand back the whole catalogue with no error. Each path fails
differently, so check accordingly:

- **Named handles** — drop every returned product whose `handle` is not one
  you asked for, and if any asked-for handle is missing from the result, name
  it. Do not quietly write copy for 40 products when the user named 2.
- **Tag** — drop every returned product whose `tags` do not contain the tag
  you queried for. If *any* product fails that check, say so plainly in the
  report: it means the filter did not work, and the result may also be
  missing products that were never returned at all.
- **Collection** — a different failure mode, and it fails loudly instead of
  silently: `collectionByHandle` returns `null` for a handle that does not
  exist, rather than silently widening to the whole catalogue. Membership in
  a collection is not a search filter, so there is nothing to re-verify per
  product — but a `null` collection must stop the run with a clear message
  naming the handle, never be treated as "no products found".

If `pageInfo.hasNextPage` is true, say the selection was truncated and stop
rather than proposing a partial set. Do not paginate.

## Step 3 — Confirm the scope before writing anything

Say how many products you resolved and name them. Above 20, say the number and
ask whether to continue — a proposal file nobody reads to the end is a file
that gets applied unread.

## Step 4 — Write the copy

Read `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md` first — it holds the
thresholds this table refers to, and it is the only place they live. The audit
skill judges against exactly the same file, so a value you accept here is a
value it will not flag.

For each product, write a proposal for **only** the fields that need one:

| Field | Write one when |
|---|---|
| `title` | It breaks a rule in `shared/metadata-rules.md`. But judge only what the query returned: no query fetches variant SKUs, and you have not seen the rest of the catalogue, so **never claim a title "is the SKU" or "is a duplicate" as fact** — that last one is the audit skill's finding, not yours. A good title is rarely worth touching — say so and leave it |
| `description` | The description is empty, or is spec-dump prose with no reason to buy. Output HTML, because the field is `descriptionHtml` |
| `seo.title` | It breaks a rule in `shared/metadata-rules.md` |
| `seo.description` | It breaks a rule in `shared/metadata-rules.md` |
| `image.alt` | It breaks a rule in `shared/metadata-rules.md`. One proposal per `MediaImage` node, each with its own media id. An alt that already describes this particular photo is fine — **leave it alone** |

The commonest real alt-text problem is not an empty field, it is the **same alt
on every photo** of a product — usually the product title, repeated. Measured on
a live store: 429 of 429 images, and not one empty field. Photo one and photo
six then say the same thing, while photo six is a close-up of the hem. That is
the case worth fixing, and a rule that only fires on empty fields would have
repaired nothing at all on that store.

Rules for the copy itself:

- The voice comes from `store.md`. Not your defaults, not "premium quality".
- **Never invent a fact.** No material, no measurement, no origin, no care
  instruction that is not already in the product data. If the description needs
  a fact you do not have, leave a plain `[?]` in the text and say in the report
  which products carry one. A confident invented fabric composition is a returns
  problem and a legal one.
- Write in the language the existing listings are in.
- Do not propose a field whose current value is already good. An unchanged
  proposal is noise in a file the owner has to read line by line.

If `media.pageInfo.hasNextPage` is true for a product, say that product has more
images than were fetched and that its alt-text proposals cover only the first 10.

## Step 5 — Render the proposal

Build the JSON the renderer expects — `store`, `createdAt` (now, ISO 8601 UTC),
`apiVersion` (the pinned handle, or `none`), and `products` with `handle`, `id`
and the `fields` you wrote. `current` is the live value exactly as it came back
(empty string when null); `proposed` is your text. For `image.alt`, include the
`mediaId`.

```bash
mkdir -p .storehand/proposals
node --input-type=module -e '
  import { renderProposal } from "'"$CLAUDE_PLUGIN_ROOT"'/skills/product-listing-writer/scripts/proposal.mjs";
  import fs from "node:fs";
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  fs.writeFileSync(process.argv[2], renderProposal(source));
' "$V/source.json" ".storehand/proposals/$(date -u +%Y-%m-%d-%H%M)-listings.md"
```

Then tell the user, in this shape:

1. One line: how many products, how many fields, where the file is.
2. Which products carry a `[?]` and what fact is missing.
3. Anything you deliberately left alone, and why.
4. The exact next command — and that nothing has been written to the store yet.

Never read the proposal back to the user in the chat. The file is the artefact;
a wall of copy in the terminal is how it gets approved unread.

## Step 6 — Read the proposal back

Read `.storehand/store.yaml` for `store`, then parse the file the user pointed
at (default: the newest in `.storehand/proposals/`).

```bash
node --input-type=module -e '
  import { parseProposal } from "'"$CLAUDE_PLUGIN_ROOT"'/skills/product-listing-writer/scripts/proposal.mjs";
  import fs from "node:fs";
  console.log(JSON.stringify(parseProposal(fs.readFileSync(process.argv[1], "utf8")), null, 2));
' ".storehand/proposals/<file>.md" > "$V/proposal.json"
```

If the parser throws, **stop**. Show the message literally — it names the
product and the field — and ask the user to fix that spot. Never apply the part
of a file you could read: a proposal you half understand is a store you half
rewrite.

Check `store` in the file against `store.yaml`. Different? Stop and say so.

## Step 7 — Re-fetch the live values

Read-only, no `--allow-mutations` yet. Build the `handle:a OR handle:b …`
query Step 2 uses for its named-handles path, against
`products-by-handle.graphql`, quoting every handle from the proposal in one
call — regardless of whether the proposal itself came from a handle list, a
collection or a tag, apply always works from the concrete handles it parsed
out of the file. Re-check the result the same way that path does: drop any
returned product whose `handle` is not one you asked for, and treat any
asked-for handle missing from the result as a re-fetch failure — see below.

Build `$V/live.json` in the shape `plan-apply.mjs` expects — one entry per
product, `values` keyed by the same field names the proposal uses:

```json
{ "products": [
  { "id": "gid://shopify/Product/PRODUCT_ID", "handle": "linnen-blazer",
    "values": { "title": "…", "description": "…", "seo.title": "…", "seo.description": "…" },
    "media": [ { "id": "gid://shopify/MediaImage/MEDIA_ID", "alt": "" } ] } ] }
```

`description` here is the **`descriptionHtml`** value, because that is what the
proposal recorded and what will be written back. A field the query did not
return must be left out, not filled with `""` — a missing value is a conflict,
and `plan-apply.mjs` treats it as one.

If the re-fetch fails for any product, stop. Applying to the products that did
answer leaves the owner with a half-applied proposal and no record of which half.

## Step 8 — Decide what may be written

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/scripts/plan-apply.mjs" \
  ".storehand/proposals/<file>.md" "$V/live.json" > "$V/plan.json"
```

Read the JSON. Then show the user, before touching anything:

- **apply** — per product, which fields and the new values, shortened to one
  line each.
- **skipped** with `changed-in-admin` — name the field, what the proposal
  recorded and what is there now. This is the mechanism working, not an error:
  somebody edited that field after the proposal was made.
- **skipped** with `already-applied` — the field already carries exactly the
  proposed text, so an earlier run of this same proposal wrote it. Say "already
  done", never "changed in the admin": the owner did not touch it and should not
  be told they did.
- **skipped** with `media-gone` or `not-measured` — say which and why.
- **unchanged** and **missing** — counts, and name the missing handles.

Then ask for approval, in the words of `shared/safety.md`: one approval covers
this change set and nothing else. If `plan.apply` is empty, say so and stop —
there is nothing to approve.

## Step 9 — Write

Only after an explicit yes. This is the one place in StoreHand that passes
`--allow-mutations`, and it needs the `write_products` scope; a store connected
with the read-only scopes will get ACCESS_DENIED here (see the Errors table).

Per product in `plan.apply`, when `productInput` is not empty:

```bash
printf '%s' '{"product":{"id":"gid://shopify/Product/PRODUCT_ID","title":"…"}}' > "$V/m.json"
shopify store execute --store <store> --json --allow-mutations \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/mutations/product-update.graphql" \
  --variable-file "$V/m.json"
```

The `product` variable is the entry's `productInput` with `"id"` added.

Per product with a non-empty `files`, **one call per image** — never batch
several images into a single `fileUpdate` call, even though the mutation's
`files` argument accepts a list. Shopify can apply some entries in a batch and
reject others in the same response, which turns "did this one alt text land"
into a reconciliation problem across every id you sent. One call per image
keeps that question single-valued: this call either wrote this image's alt
text or it did not.

```bash
printf '%s' '{"files":[{"id":"gid://shopify/MediaImage/MEDIA_ID","alt":"…"}]}' > "$V/f.json"
shopify store execute --store <store> --json --allow-mutations \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/mutations/file-update.graphql" \
  --variable-file "$V/f.json"
```

(`files` still takes a list in the mutation's shape — send exactly one entry.)

**Read `userErrors` on every response.** A mutation that returns HTTP 200 with a
populated `userErrors` array wrote nothing. Treat it as a failure for that one
call — that product for `productUpdate`, that single image for `fileUpdate`.
Report it and keep going with the rest, then say at the end exactly which
products and which images succeeded and which did not. Never report "images
updated" for a product as one yes or no when the calls underneath it are per
image; name each one.

**A call that does not come back clean is a third outcome, not a second one.**
`shopify store execute` exiting non-zero, timing out, or printing output that
does not parse is neither "wrote" nor "did not write" — it is **unknown**. The
request may have reached Shopify and applied before the response was lost, or
it may never have arrived. Nothing available to the session can tell which:

- **Do not retry.** Retrying an unknown write is how the same change gets
  applied twice.
- **Stop the run right there.** Do not continue to the next product or the
  next image — once one outcome is unknown, a report covering the rest cannot
  honestly describe the state of the store.
- Tell the owner exactly which product and which field (or which image) was in
  flight when the call failed to return cleanly, and that they should check
  that one in the Shopify admin before doing anything else.
- Say plainly what re-running apply afterwards will look like, because
  otherwise it reads as a bug: if the write did land, the next run finds the
  live value already equal to the proposed text and skips that field as
  `already-applied`. Nothing is written twice. If it did **not** land, the field
  comes back as applicable and the re-run writes it. Either way the re-run is
  safe — which is why the answer to an unknown outcome is to look, not to retry
  blindly.

Go product by product, and image by image within a product. Never batch: when
one call fails you must still be able to say precisely where the run stopped.

## Step 10 — Report

1. One line: how many products written, how many fields, how many skipped.
2. Per written product, the fields that changed.
3. The skipped list again, because it is what the owner needs to act on — a
   `changed-in-admin` field is still waiting for a decision. Keep
   `already-applied` separate from it: that one needs no decision at all, and
   burying it in the same list makes a finished field look like a conflict.
4. Where the proposal file is, and that it was **not** modified. Re-running
   apply on the same file is safe: every field written by the first run comes
   back as `already-applied` and nothing is written twice. It does **not** come
   back as `unchanged` — that word is reserved for a field whose proposed text
   was already the live value before any run touched it.

Do not write `.storehand/state.json`. This skill keeps no memory between runs —
the proposal file is the record.

## Errors — never report a write you did not make

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show the auth line from `storehand-setup`, stop |
| ACCESS_DENIED on the mutation | The store is connected read-only. Show `shopify store auth --store <store> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation,write_products` and stop. Never retry without it |
| The parser refuses the proposal | Show the message literally, stop, change nothing |
| `store` in the proposal ≠ `store.yaml` | Stop — this proposal belongs to another store |
| Re-fetch fails for any product | Stop before writing anything |
| `userErrors` non-empty | That product — or that one image, for `fileUpdate` — was not written. Report it and continue with the rest |
| A mutation call exits non-zero, times out, or its output does not parse | **Unknown, not failed.** Stop the run immediately. Name the exact product and field (or image) in flight, and tell the owner to check it in the Shopify admin before doing anything else. Never retry |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| Step 0 printed `NOT FOUND` | Stop and tell the user to reinstall; never guess where plugin files are |

A store that was not written and a store that was written wrong look identical
in a report that hides errors. Never let them.
