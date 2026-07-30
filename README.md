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

Shopify's own AI Toolkit gives an assistant the *rails* — how to write Admin
GraphQL, ShopifyQL, Liquid. It deliberately ships no workflows: an agent can
only do what you prompt it to do.

StoreHand is the *routine* on top. Which questions get asked every morning,
which thresholds apply to **your** store, in what shape the answer arrives, and
one rule that never bends: **StoreHand proposes, you approve.**

## Skills

| Skill | Does | Writes? |
|---|---|---|
| `storehand-setup` | Creates your store profile and connects the store | Local files only |
| `daily-store-briefing` | Orders, payment problems, cancellations, stock alerts | No |

More on the way: store health check, product listing writer, price and
competitor watch, SEO metadata audit, weekly store report.

## Quickstart

You need the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) 4.5 or
newer (`npm install -g @shopify/cli`) and Claude Code.

```
/plugin marketplace add storehand/storehand
```

Then, in the directory you want to work from:

```
/storehand-setup
```

It asks a handful of questions, writes `.storehand/store.yaml` and
`.storehand/store.md`, and connects your store. After that:

```
/daily-store-briefing
```

## What StoreHand may see

Setup requests three **read-only** scopes and nothing else:

| Scope | Why |
|---|---|
| `read_orders` | New orders, payment status, cancellations, refunds |
| `read_products` | Product and variant details |
| `read_inventory` | Stock levels for low-stock alerts |

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
[CONTRIBUTING.md](CONTRIBUTING.md). Every skill must be dogfooded on a real
store before it ships; `docs/dogfood/` holds the evidence.

## Licence

Apache-2.0. Not affiliated with Shopify Inc.
