---
name: storehand-setup
description: Set up StoreHand for a Shopify store — create the store profile in .storehand/, connect the store through the Shopify CLI, and verify the connection with a read-only test query. Use when the user installs StoreHand, when a skill reports that .storehand/ is missing or incomplete, or when the user wants to connect another store.
---

# StoreHand setup

Get the user from a fresh install to a working, connected store profile. Aim for
under ten minutes.

**Two kinds of path, do not mix them up.** This plugin's own files —
`shared/safety.md` and the `templates/` directory — live under the plugin's
install directory. The profile you are about to create (`.storehand/`) goes in
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

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` before you start.

## Step 1 — Check the Shopify CLI

```bash
shopify version
```

- **Not found:** tell the user to install it (`npm install -g @shopify/cli`) or
  see https://shopify.dev/docs/api/shopify-cli, then stop. Do not continue.
- **Below 4.5:** ask them to run `shopify upgrade`. `shopify store execute` is
  required and does not exist in older versions.

## Step 2 — Check for an existing profile

Look for `.storehand/store.yaml` in the working directory.

- **Exists:** show the user what is in it and ask whether they want to update it
  or set up a different store. Never silently overwrite a profile.
- **Does not exist:** continue.

## Step 3 — Ask for the essentials

Ask these one at a time. Do not fill in guesses.

1. The `*.myshopify.com` domain (not their custom domain — the admin URL shows
   it). If they give a custom domain, ask again for the myshopify one.
2. Timezone and currency. Offer a sensible guess based on the domain or their
   language and let them confirm.
3. The low-stock threshold: "below how many items do you want a warning?"
4. The minimum margin percentage StoreHand must never price below. If they don't
   know, say so in the profile as a comment rather than inventing a number.

## Step 4 — Write the profile

Create `.storehand/` and copy the templates from this plugin, filling in the
answers:

- `store.yaml` from `$CLAUDE_PLUGIN_ROOT/templates/storehand/store.yaml` —
  replace every placeholder
- `store.md` from `$CLAUDE_PLUGIN_ROOT/templates/storehand/store.md` — leave the
  comment prompts in place so the user can fill them in later

Then tell the user plainly: **`store.md` is what makes the writing skills sound
like their store.** It is worth ten minutes of their time, but it is not needed
for the daily briefing, so they can do it later.

## Step 5 — Connect the store

Show the command, explain it, then run it:

```bash
shopify store auth --store <domain> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation
```

Explain before running:

- This uses **Shopify's own CLI app**. The user does not create an app, does not
  need a Partner account, and there is no app review.
- A browser opens and shows exactly which permissions are being requested. These
  five scopes are **read-only** — StoreHand cannot change anything with them.
- The token is stored locally by the Shopify CLI in `~/.config/`, and it refreshes
  itself.

**If no browser is available** (a server, a remote SSH session), the CLI still
needs one — it has no device-code flow. Verified against CLI 4.5.2 on
2026-08-03: `SHOPIFY_CLI_DEVICE_AUTH` is listed among the CLI's environment
variable names but is read nowhere in its code, so setting it changes nothing
and `shopify store auth` still fails with `spawn xdg-open ENOENT`.

What works is borrowing the browser on another machine and tunnelling the
callback back. Three steps, in this order:

1. Give the headless box something to "open" with, so the URL is printed
   instead of the command failing:

   ```bash
   printf '#!/bin/sh\nprintf "%%s\\n" "$1"\n' > /usr/local/bin/xdg-open
   chmod +x /usr/local/bin/xdg-open
   ```

2. From the machine that *does* have a browser, open a tunnel and leave it
   running. **Read the port out of the printed URL rather than assuming it** —
   it is the `redirect_uri` parameter, and it is not the `3456` that appears as
   a constant in the CLI's own source:

   ```bash
   ssh -L <port>:127.0.0.1:<port> <user>@<host>
   ```

3. Run `shopify store auth` on the headless box. It prints the authorization
   URL. Open that URL in the browser on the other machine and approve. Shopify
   redirects to `127.0.0.1:<port>`, the tunnel carries it back, and the CLI
   stores the token.

If the tunnel was not up in time, the browser shows a connection error but the
authorization code is still in its address bar and the CLI is still listening.
Deliver it by hand on the headless box — the code is single use, so do this
once:

```bash
curl "http://127.0.0.1:<port>/auth/callback?code=<code>&shop=<domain>&state=<state>"
```

Note on order history: the `read_orders` scope covers roughly the last 60 days,
which is more than a daily briefing needs. Longer history needs extra permission
from Shopify and is not part of StoreHand.

### If they want the listing writer

`product-listing-writer` is the only skill that changes anything, and it needs
one scope more. Offer this, do not run it by default — a store connected with
the five read-only scopes is the safer resting state, and every other skill
works without it.

```bash
shopify store auth --store <domain> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation,write_products
```

Say what it does and does not buy them:

- `write_products` lets StoreHand change product titles, descriptions, SEO
  fields and image alt text. Nothing else — not prices, not inventory, not
  orders, not customers.
- Even with the scope granted, nothing is written without them approving that
  specific change set first. The listing writer proposes into a file they read
  and edit, and applies only what is still in it.
- Without the scope, the listing writer still works up to the point of writing:
  it produces the proposal and then stops, saying which scope is missing.

They can add it later. Re-running the auth command with the longer scope list
replaces the old grant, so this is not a decision they are stuck with.

## Step 6 — Smoke test

```bash
shopify store execute --store <domain> --json --query '{ shop { name currencyCode timezoneAbbreviation } }'
```

- **Works:** show the store name and confirm it is the right store. If the
  currency or timezone differs from what they told you, point that out and offer
  to correct `store.yaml`.
- **Fails:** show the exact error. Common causes: wrong domain, the account
  lacks permission to grant app access, or the auth step never finished. Do not
  claim setup succeeded.

## Step 7 — Hand off

Confirm what exists now (`.storehand/store.yaml`, `.storehand/store.md`, a
connected store) and suggest the obvious next move: run the
`daily-store-briefing` skill.
