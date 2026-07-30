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
