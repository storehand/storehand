# StoreHand

**An extra pair of hands for your store.**

Open-source Claude Code skills that turn Claude into your daily Shopify
operator. Read-only by default, no telemetry, no account.

```
You: how did the store do overnight?

StoreHand: 3 new orders (€412) · 1 failed payment · 2 variants low
           · no cancellations

  Needs attention
  - #1042 payment expired (€89) — customer may retry or need a new invoice
  - "Linen blazer / M" is down to 2, "Wool coat / L" to 1

  Suggested
  - Send #1042 a fresh payment link
  - Reorder the blazer before the weekend
```

## Why

Shopify's own AI Toolkit gives an assistant the *rails* and the *knowledge* — 21
skills covering Admin GraphQL, ShopifyQL, Liquid, Polaris and more. What it does
not ship is a single operator routine: an agent still only does what you prompt
it to do, every time, from scratch.

StoreHand is the *routine* on top. Which questions get asked every morning,
which thresholds apply to **your** store, in what shape the answer arrives, and
one rule that never bends: **StoreHand proposes, you approve.**

## Skills

| Skill | Does | Writes? |
|---|---|---|
| `storehand-setup` | Creates your store profile and connects the store | Local files only |
| `daily-store-briefing` | Orders, payment problems, cancellations, stock alerts | Local files only |
| `store-health-check` | Weekly check: sold-out-but-active products, discount windows, broken storefront links, metadata gaps | Local files only |

Neither skill writes anything to your store. "Local files only" means
`.storehand/` in your own directory — the profile, and a timestamp so tomorrow's
briefing knows where to start.

More on the way: product listing writer, price and competitor watch, SEO
metadata audit, weekly store report.

## Quickstart

You need the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) 4.5 or
newer (`npm install -g @shopify/cli`) and Claude Code.

```
/plugin marketplace add storehand/storehand
```

Then, in the directory you want to work from:

```
/storehand:storehand-setup
```

Or just ask: *"set up StoreHand for my store"*. Either way it asks a handful of
questions, writes `.storehand/store.yaml` and `.storehand/store.md`, and connects
your store. After that:

```
/storehand:daily-store-briefing
```

Or ask *"how did the store do overnight?"* — the skill picks itself up.

## What StoreHand may see

Setup requests five **read-only** scopes and nothing else:

| Scope | Why |
|---|---|
| `read_orders` | New orders, payment status, cancellations, refunds |
| `read_products` | Product and variant details |
| `read_inventory` | Stock levels for low-stock alerts |
| `read_discounts` | Discount codes and windows for the health check |
| `read_online_store_navigation` | Menu links for the broken-link check |

You approve these in your own browser, on Shopify's own screen. Skills that
propose changes ask for write access separately, and never write without showing
you the change first.

See [docs/connect.md](docs/connect.md) for how the connection works and why it
needs no app of your own.

## No telemetry

StoreHand sends nothing anywhere. No usage pings, no prompts, no store data.
The only network traffic is the Shopify CLI talking to your own store.

## Contributing

Bug reports and skill ideas are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Every skill has to run against a real store
before it ships, and the evidence goes in `docs/dogfood/`: the commands, the real
output, and what was awkward about it.

## Licence

Apache-2.0. Not affiliated with Shopify Inc.
