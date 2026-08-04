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
