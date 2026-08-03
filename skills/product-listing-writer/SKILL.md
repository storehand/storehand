---
name: product-listing-writer
description: Write Shopify product copy in the store's own voice — titles, descriptions, SEO title and description, and image alt text — as an editable proposal file, then apply exactly what you left in it. Use when the user wants product listings written or rewritten, better product descriptions, SEO texts for products, alt text for product images, or asks to apply a listing proposal.
---

# Product listing writer

Two phases, and they never run in one breath. **Propose** reads the store and
writes a file you edit. **Apply** writes to the store, and only the fields you
left in that file that nobody touched in the admin meanwhile.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md`, `queries/`, `mutations/`, `scripts/` — live under
`$CLAUDE_PLUGIN_ROOT`. The store profile and the proposals (`.storehand/`) live
in the user's working directory. If `$CLAUDE_PLUGIN_ROOT` is empty, say so and
stop; do not guess a path.

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

**Re-check what came back.** Per `shared/safety.md`, the Admin API silently
ignores search terms it does not recognise: a misspelled handle returns the
whole catalogue. Drop every returned product whose `handle` is not one you
asked for, and if any asked-for handle is missing from the result, name it —
do not quietly write copy for 40 products when the user named 2.

If `pageInfo.hasNextPage` is true, say the selection was truncated and stop
rather than proposing a partial set. Do not paginate.

## Step 3 — Confirm the scope before writing anything

Say how many products you resolved and name them. Above 20, say the number and
ask whether to continue — a proposal file nobody reads to the end is a file
that gets applied unread.

## Step 4 — Write the copy

For each product, write a proposal for **only** the fields that need one:

| Field | Write one when |
|---|---|
| `title` | The current title is a bare SKU, a duplicate, or says nothing a buyer searches for. A good title is rarely worth touching — say so and leave it |
| `description` | The description is empty, or is spec-dump prose with no reason to buy. Output HTML, because the field is `descriptionHtml` |
| `seo.title` | Empty, or a copy of the product title beyond ~60 characters |
| `seo.description` | Empty, or over ~155 characters, or it repeats the title |
| `image.alt` | Empty or null. One proposal per `MediaImage` node, each with its own media id |

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
