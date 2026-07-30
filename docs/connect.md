# Connecting StoreHand to your store

There are three ways an AI assistant can reach a Shopify store. StoreHand uses
the first one.

## 1. Shopify CLI auth — what StoreHand uses

```bash
shopify store auth --store your-store.myshopify.com --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation
```

The Shopify CLI has its own Shopify-managed app. **You do not create an app.**
No Partner account, no app review, no access token to keep safe. A browser opens
and shows exactly which permissions are requested; the CLI stores a token in
`~/.config/` and refreshes it for you.

The five scopes above are read-only. StoreHand cannot change anything in your
store with them. Skills that propose changes ask for write scopes separately,
and the Shopify CLI refuses mutations unless `--allow-mutations` is passed
explicitly — which StoreHand only does after you approve a specific change.

### If it goes wrong

Two things bite in practice. Both are fixable and neither is your fault.

**"Unauthorized Access" instead of a consent screen.** The authorization page can
reject the request before showing you anything, with no explanation. Check two
things: that you are signed in to *that* store's admin in the same browser, and
that your account may install apps. A staff or collaborator account without the
apps permission fails exactly this way, and the page looks the same either way —
in that case the store owner has to either grant the permission or do this step.

**No browser on the machine running the CLI** (a server, a remote shell). The
redirect target is hardcoded to `http://127.0.0.1:13387/auth/callback`, so the
browser has to reach *that machine's* loopback address. Being on the same private
network is not enough: the CLI binds to `127.0.0.1` only. Forward the port over
SSH first, then open the authorization URL in your own browser:

```bash
ssh -N -L 13387:127.0.0.1:13387 user@your-server
```

That command prints nothing and appears to hang. That is what success looks like —
leave it open. Simplest alternative: run `shopify store auth` on your laptop
instead, where the browser and the CLI are on the same machine.

**There is no device flow for this command.** `shopify store auth` only does the
browser redirect above. The CLI does know a device-code flow — the environment
variable `SHOPIFY_CLI_DEVICE_AUTH` is real — but it belongs to the identity login
used by other commands, and setting it here changes nothing. Do not plan around
it: verified against CLI 4.5.2, which opened the browser regardless.

**The CLI crashes instead of printing the URL when no browser exists.** On a
headless machine it dies with `Error: spawn xdg-open ENOENT` before you ever see
the authorization link. The "Browser did not open automatically" fallback in the
CLI does not catch this. Put a stand-in on the `PATH` that records the URL rather
than opening it:

```bash
mkdir -p /tmp/authshim
printf '#!/bin/sh\nprintf "%%s\\n" "$1" > /tmp/authshim/url.txt\n' > /tmp/authshim/xdg-open
chmod +x /tmp/authshim/xdg-open
PATH=/tmp/authshim:$PATH shopify store auth --store your-store.myshopify.com --scopes …
```

The command keeps running and waits; `/tmp/authshim/url.txt` holds the URL.

**Finishing without any tunnel.** If you cannot forward the port, open that URL in
your own browser and approve. The browser then tries to reach
`127.0.0.1:13387` on *your* machine and fails to connect — expected, and not an
error. Copy the whole address from the address bar and deliver it to the waiting
process yourself:

```bash
curl "http://127.0.0.1:13387/auth/callback?code=…&shop=…&state=…"
```

The `state` value must be the one from the URL you opened; it is tied to that one
waiting process. Authorization codes are single-use and short-lived, so if the
process has already exited, start over and use the fresh link.

## 2. A custom app token — not used

You can create a custom app in your admin and get a token that never expires,
which is what you would need for unattended runs. `shopify store execute` does
not accept such a token, so StoreHand does not use this route today.

## 3. A public Shopify app — the hosted version

Installing from the Shopify App Store needs no terminal at all. That is the
hosted version of StoreHand, and it is not what this repository is.

**The honest split:** in the open-source version, you type the command. In the
hosted version, the command does not exist. Same skills either way — nothing is
held back from this repository.
