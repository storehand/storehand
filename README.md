# StoreHand — Claude skills for Shopify

**An extra pair of hands for your store.**

Open-source Claude Code skills that turn Claude into your daily Shopify store
operator: a morning briefing on orders and payments, a weekly store health
check, and product copy written in your own brand voice. Read-only by default,
no telemetry, no account, nothing running on someone else's server.

[Skills](#skills-that-ship-today) · [Roadmap](#roadmap) ·
[Quickstart](#quickstart) · [What it can see](#what-storehand-may-see) ·
[Hosted version](https://storehand.github.io)

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

## Why another set of Claude skills for Shopify

Shopify's own AI Toolkit gives an assistant the *rails* and the *knowledge* — 21
agent skills covering Admin GraphQL, ShopifyQL, Liquid, Polaris and more. What it
does not ship is a single operator routine: an agent still only does what you
prompt it to do, every time, from scratch.

StoreHand is the *routine* on top. Which questions get asked every morning,
which thresholds apply to **your** store, in what shape the answer arrives, and
one rule that never bends: **StoreHand proposes, you approve.**

It is a Claude Code plugin, not an app you install in your Shopify admin. The
skills are markdown and version-pinned GraphQL; the official Shopify CLI does
the talking. Nothing runs on anyone else's server.

## Who this is for

Shop owners and operators who already use Claude Code and would rather answer
"what changed overnight?" in ten seconds than click through four admin screens.
It helps if you are comfortable in a terminal — if you are not, the hosted
version below is the one to wait for.

## Skills that ship today

| Skill | What it does | Writes to your store? |
|---|---|---|
| `storehand-setup` | Builds your store profile and connects the store | No — local files only |
| `daily-store-briefing` | Morning briefing: new orders, failed payments, cancellations, refunds, low-stock alerts | No — local files only |
| `store-health-check` | Weekly Shopify store audit: sold-out-but-active products, discount windows, broken storefront links, missing SEO metadata | No — local files only |
| `product-listing-writer` | Product titles, descriptions, SEO fields and image alt text in your own voice — proposed in a file you edit, applied only on a separate command | Yes — only what you approved, and only with `write_products` |

The first three write nothing to your store. "Local files only" means
`.storehand/` in your own directory — the profile, a timestamp so tomorrow's
briefing knows where to start, and the health check's memory of what it found
last time.

`product-listing-writer` is the one that can change something, and it is built
so that it cannot surprise you. It proposes into a file, you read and edit that
file, and applying it writes only the fields you left in it. Any field somebody
changed in the Shopify admin in the meantime is skipped and reported, never
overwritten. Without the `write_products` scope it still works — it produces the
proposal and stops at the point of writing.

## Roadmap

Six skills make up version 1. Four are shipped and running against a real shop;
two are not written yet. A skill is only listed as shipped once it has been
run against a live store and the evidence is in [`docs/dogfood/`](docs/dogfood/).

| # | Skill | What it will do | Status |
|---|---|---|---|
| 1 | `daily-store-briefing` | Orders, payments, cancellations, stock | **Shipped** |
| 2 | `store-health-check` | Weekly store audit, broken links, discount and metadata gaps | **Shipped** |
| 3 | `product-listing-writer` | Product titles, descriptions, SEO fields and alt text in your brand voice — proposed in a file you edit, applied only on a separate command | **Shipped** |
| 4 | `price-and-competitor-watch` | Follows a fixed list of competitor product pages and reports the gap against your margin rules | Planned |
| 5 | `seo-metadata-audit` | Sweeps the whole catalogue for titles, meta descriptions and alt text that lag behind, and prepares the fixes | Planned |
| 6 | `weekly-store-report` | Revenue, conversion and returning customers, with concrete actions | Planned |

Skill 3 is the only one that writes to a store, and it changes the rules above:
it needs `write_products`, and it works in two steps. First a proposal file
listing the current and the suggested text for every field, which you read and
edit. Then a separate command that applies exactly what you left in that file —
and skips anything you changed in the admin in the meantime rather than
overwriting your work. That skip is not a nicety: it was tested against a live
store before this was called shipped, and the run is written up in
[`docs/dogfood/`](docs/dogfood/).

Everything else stays read-only.

**Deliberately not in version 1:** customer-service chat and email, review
replies, email marketing and social, discount campaign creation, A/B testing.
Each needs either realtime infrastructure or a third-party platform, and both
break the "no external services" promise this project runs on.

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

Setup requests five **read-only** scopes. A sixth, `write_products`, is offered
separately and only if you want the listing writer — every other skill works
without it, and a store connected with the five is the safer resting state.

| Scope | Why |
|---|---|
| `read_orders` | New orders, payment status, cancellations, refunds |
| `read_products` | Product and variant details |
| `read_inventory` | Stock levels for low-stock alerts |
| `read_discounts` | Discount codes and windows for the health check |
| `read_online_store_navigation` | Menu links for the broken-link check |
| `read_reports` | Not requested by StoreHand — Shopify's own CLI app adds it to every authorization. Listed here because the consent screen will show it |
| `write_products` | **Optional, opt-in.** Only for `product-listing-writer`, and only to apply a proposal you have read and edited. Titles, descriptions, SEO fields and image alt text — not prices, not inventory, not orders |

You approve these in your own browser, on Shopify's own screen. Skills that
propose changes ask for write access separately, and never write without showing
you the change first.

See [docs/connect.md](docs/connect.md) for how the connection works and why it
needs no app of your own.

## No telemetry

StoreHand sends nothing anywhere. No usage pings, no prompts, no store data.
The only network traffic is the Shopify CLI talking to your own store.

## A hosted version

The skills here are free and open source, and always will be — clone the repo
and run them yourself. A hosted version for shop owners who would rather not run
anything at all is being built; it will be announced here first.

<https://storehand.github.io>

## Contributing

Bug reports and skill ideas are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Every skill has to run against a real store
before it ships, and the evidence goes in `docs/dogfood/`: the commands, the real
output, and what was awkward about it.

## Licence

Apache-2.0. Not affiliated with Shopify Inc.
