# Connecting StoreHand to your store

There are three ways an AI assistant can reach a Shopify store. StoreHand uses
the first one.

## 1. Shopify CLI auth — what StoreHand uses

```bash
shopify store auth --store your-store.myshopify.com --scopes read_orders,read_products,read_inventory
```

The Shopify CLI has its own Shopify-managed app. **You do not create an app.**
No Partner account, no app review, no access token to keep safe. A browser opens
and shows exactly which permissions are requested; the CLI stores a token in
`~/.config/` and refreshes it for you.

The three scopes above are read-only. StoreHand cannot change anything in your
store with them. Skills that propose changes ask for write scopes separately,
and the Shopify CLI refuses mutations unless `--allow-mutations` is passed
explicitly — which StoreHand only does after you approve a specific change.

No browser available (a server, a remote shell)? Use the device flow:

```bash
SHOPIFY_CLI_DEVICE_AUTH=1 shopify store auth --store your-store.myshopify.com --scopes read_orders,read_products,read_inventory
```

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
