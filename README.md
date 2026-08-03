<p align="center">
  <img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/Lang%20Logo.png" alt="StoreHand" width="400" height="80" />
</p>

<h1 align="center">StoreHand — Claude skills for Shopify</h1>

<p align="center"><strong>An extra pair of hands for your store.</strong></p>

<p align="center">
  <a href="https://github.com/storehand/storehand/actions/workflows/ci.yml"><img src="https://github.com/storehand/storehand/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/licence-Apache--2.0-black" alt="Apache-2.0 licence" />
  <img src="https://img.shields.io/badge/telemetry-none-black" alt="No telemetry" />
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-ships-today">Skills</a> ·
  <a href="#storehand-proposes-you-approve">Safety</a> ·
  <a href="#what-storehand-may-see">Permissions</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="https://storehand.github.io">Get notified</a>
</p>

---

Ask your store a question in plain language and get the answer Claude read out
of it — new orders, payments that failed, stock running out. Four open-source
skills for Claude Code. **Read-only by default**, no telemetry, no account,
nothing running on someone else's server.

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

## Install

You need **Claude Code** and the
[Shopify CLI](https://shopify.dev/docs/api/shopify-cli) 4.5 or newer
(`npm install -g @shopify/cli`). StoreHand is a Claude Code plugin, not an app
you install in your Shopify admin.

```
/plugin marketplace add storehand/storehand
```

Then, in the directory you want to work from:

```
/storehand:storehand-setup
```

Or just ask: *"set up StoreHand for my store"*. Either way it asks a handful of
questions, writes `.storehand/store.yaml` and `.storehand/store.md`, and connects
your store through Shopify's own consent screen. After that:

```
/storehand:daily-store-briefing
```

Or ask *"how did the store do overnight?"* — the skill picks itself up.

**Who this is for:** shop owners and operators who already use Claude Code and
would rather answer "what changed overnight?" in ten seconds than click through
four admin screens. It helps if you are comfortable in a terminal. If you are
not, [leave your email](https://storehand.github.io) — see
[below](#a-hosted-version--only-if-enough-people-want-one).

## What ships today

| Skill | What it does | Writes to your store? |
|---|---|---|
| `storehand-setup` | Builds your store profile and connects the store | No — local files only |
| `daily-store-briefing` | Morning briefing: new orders, failed payments, cancellations, refunds, low-stock alerts | No — local files only |
| `store-health-check` | Weekly audit: sold-out-but-active products, discount windows, broken storefront links, missing SEO metadata | No — local files only |
| `product-listing-writer` | Product titles, descriptions, SEO fields and image alt text in your own voice — proposed in a file you edit, applied only on a separate command | Yes — only what you approved, and only with `write_products` |

"Local files only" means `.storehand/` in your own directory — the profile, a
timestamp so tomorrow's briefing knows where to start, and the health check's
memory of what it found last time.

Every skill has run against a live store before being called shipped, and the
run is written up in [`docs/dogfood/`](docs/dogfood/) — the commands, the real
output, and what was awkward about it. The repository carries 121 tests.

## StoreHand proposes, you approve

Three of the four skills read your store and write nothing to it — not a
product, not a price, not an order.

`product-listing-writer` is the one that can change something, and it is built
so that it cannot surprise you. It works in two steps:

1. It writes a **proposal file** listing the current and the suggested text for
   every field. You read it and edit it.
2. A **separate command** applies exactly what you left in that file.

Any field somebody changed in the Shopify admin in between is skipped and
reported, never overwritten. That skip is not a nicety — it was tested against a
live store before this shipped. Without the `write_products` scope the skill
still works: it produces the proposal and stops at the point of writing.

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

You approve these in your own browser, on Shopify's own screen. See
[docs/connect.md](docs/connect.md) for how the connection works and why it needs
no app of your own.

## No telemetry

StoreHand sends nothing anywhere. No usage pings, no prompts, no store data. The
only network traffic is the Shopify CLI talking to your own store.

## Why another set of Claude skills for Shopify

Shopify's own AI Toolkit gives an assistant the *rails* and the *knowledge* — 21
agent skills covering Admin GraphQL, ShopifyQL, Liquid, Polaris and more. What it
does not ship is a single operator routine: an agent still only does what you
prompt it to do, every time, from scratch.

StoreHand is the *routine* on top. Which questions get asked every morning,
which thresholds apply to **your** store, in what shape the answer arrives, and
one rule that never bends: StoreHand proposes, you approve.

The skills are markdown and version-pinned GraphQL; the official Shopify CLI
does the talking. You can read every question it will ever ask your store.

## Roadmap

Version 1 is setup plus six skills. **Setup and three of the six are shipped**;
three are not written yet. A skill is only listed as shipped once it has run
against a live store and the evidence is in [`docs/dogfood/`](docs/dogfood/).

| # | Skill | What it does | Status |
|---|---|---|---|
| 0 | `storehand-setup` | Store profile and connection | **Shipped** |
| 1 | `daily-store-briefing` | Orders, payments, cancellations, stock | **Shipped** |
| 2 | `store-health-check` | Weekly audit, broken links, discount and metadata gaps | **Shipped** |
| 3 | `product-listing-writer` | Titles, descriptions, SEO fields and alt text in your brand voice | **Shipped** |
| 4 | `price-and-competitor-watch` | Follows a fixed list of competitor product pages and reports the gap against your margin rules | Planned |
| 5 | `seo-metadata-audit` | Sweeps the whole catalogue for titles, meta descriptions and alt text that lag behind, and prepares the fixes | Planned |
| 6 | `weekly-store-report` | Revenue, conversion and returning customers, with concrete actions | Planned |

**Deliberately not in version 1:** customer-service chat and email, review
replies, email marketing and social, discount campaign creation, A/B testing.
Each needs either realtime infrastructure or a third-party platform, and both
break the "no external services" promise this project runs on.

## A hosted version — only if enough people want one

The skills here are free, open source, and stay that way. This repository stays
online no matter what.

What does not exist yet is a hosted version for shop owners who would rather not
run anything themselves. It only gets built if enough people ask for it.
[Leave your email](https://storehand.github.io) and you get one message: the
launch date, once it is known. Miss the minimum sign-ups and the list is
deleted, nothing is sent, and nothing is built.

## Contributing

Bug reports and skill ideas are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Every skill has to run against a real store
before it ships, and the evidence goes in `docs/dogfood/`.

Found a security issue? [SECURITY.md](SECURITY.md).

## Licence

Apache-2.0. Not affiliated with Shopify Inc.
