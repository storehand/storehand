<p align="center">
  <img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/logo-wide.png" alt="StoreHand" width="400" height="80" />
</p>

<h1 align="center">StoreHand — Claude skills for Shopify</h1>

<p align="center"><strong>An extra pair of hands for your store.</strong></p>

<p align="center">
  <a href="https://github.com/storehand/storehand/actions/workflows/ci.yml"><img src="https://github.com/storehand/storehand/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/storehand/storehand/releases"><img src="https://img.shields.io/github/v/release/storehand/storehand?label=release&color=black" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/licence-Apache--2.0-black" alt="Apache-2.0 licence" />
  <img src="https://img.shields.io/badge/telemetry-none-black" alt="No telemetry" />
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/storehand?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-storehand" target="_blank" rel="noopener noreferrer"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1213844&amp;theme=light&amp;t=1785914225227" alt="StoreHand - Claude Code skills that run your Shopify store daily | Product Hunt" width="250" height="54" /></a>
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
of it — new orders, payments that failed, stock running out. Five open-source
skills for Claude Code. **Read-only by default**, no telemetry, no account,
nothing running on someone else's server.

Ask *"how did the store do overnight?"* and this is what comes back:

<img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/demo-briefing-report.png" alt="A StoreHand briefing: 4 new orders, €412 collected, 1 expired payment of €89, 1 partial refund of €24, 5 variants low, no cancellations. It names the expired order and the customer, lists the two unfulfilled orders, tables the five low-stock variants, and suggests three actions. It closes by noting the low-stock filter also returned a variant holding 12 units, which it dropped." />

Note the last paragraph. The stock filter handed back a variant holding twelve
units against a threshold of five — Shopify's search index lagging behind the
data — and the briefing dropped it and said so. **Every number in a StoreHand
report is checked against the thing it claims to measure before you read it.**

<sub>Every screenshot on this page is a real run of the shipped skills, captured
from the terminal — not a mock-up, and nothing in them retyped by hand. The shop
underneath is invented: it has no Shopify account, and its products, orders and
customer names were written for the demo. The skills, the queries, the re-checks
and the storefront requests are the ones this repository ships.</sub>

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
| `product-listing-writer` | Product titles, descriptions, SEO fields and image alt text in your own voice — proposed in a file you edit, applied only on a separate command | Yes — only what you approved. Titles, descriptions and SEO need `write_products`; alt text needs `write_files` as well |
| `weekly-store-report` | Week-on-week change in revenue, orders, average order value, sessions and conversion, with revenue and orders cross-checked against the order records | No — local files only |

"Local files only" means `.storehand/` in your own directory — the profile, a
timestamp so tomorrow's briefing knows where to start, and the health check's
memory of what it found last time.

Every skill has run against a live store before being called shipped, and the
run is written up in [`docs/dogfood/`](docs/dogfood/) — the commands, the real
output, and what was awkward about it. The test suite runs on every push; the badge above says whether it is green.

The weekly check is the one that finds things nobody is looking for. It fetches
your storefront over HTTP rather than trusting the admin, so a link that exists
in Shopify and 404s for customers shows up as what it is:

<img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/demo-health-report.png" alt="A StoreHand health check: 2 products sold out but active, 1 broken link, 4 discount issues, 10 metadata gaps. It names the two sold-out products, reports that the Size guide menu link returns 404, excludes a third product because it sells on backorder by design, flags a discount whose ACTIVE status contradicts its start date, tables the metadata gaps, and lists five suggested actions." />

It also refuses to be fooled by a store that answers 200 for pages that do not
exist — it probes for that first, and says the link check measured nothing
rather than reporting a clean bill of health.

---

## StoreHand proposes, you approve

Four of the five skills read your store and write nothing to it — not a
product, not a price, not an order.

`product-listing-writer` is the one that can change something, and it is built
so that it cannot surprise you. It works in two steps.

**Step one writes a file, not your store:**

<img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/demo-listings-propose.png" alt="A StoreHand proposal run: it opens by saying nothing has been written to the store and the whole run was read-only, then reports 5 field proposals across 2 of the 3 outerwear products, written to a file. It flags one product whose record carries no fabric, cut or features, saying it left the shape of the sentences with a placeholder where the facts go rather than inventing them. It lists what it left alone deliberately, including a product whose copy was already right, and closes by warning that two fields would publish literal placeholders to the storefront if applied as they stand." />

It says so in the first line, and it means it: that entire run was read-only.
Note what it refused to do. Where the product record had no fabric, no cut and
no features, it left the shape of the sentence with a `[?]` where the fact goes
and told you which facts it needs from you — rather than writing something
plausible. It skipped a product whose copy was already right instead of
rewriting it to look busy. And it ends by warning you about its own output:
apply this as it stands and two fields publish a literal `[?]` to your
storefront.

**Step two applies exactly what you left in that file** — and nothing that
moved underneath you in the meantime. Any field somebody changed in the Shopify
admin in between is skipped and reported, never overwritten. That skip is not a
nicety; it was tested against a live store before this shipped. Here it is
happening:

<img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/demo-listings-apply.png" alt="A StoreHand apply run: 1 product written, 2 fields, 3 fields not written. It lists the SEO title and image alt text it wrote, then reports that the product's SEO description was changed in the admin after the proposal was made and was therefore skipped, and that two more fields were held back because they still contained unfilled placeholders. It ends by saying the proposal file was not modified and can safely be applied again." />

Two fields written, three not — one because somebody had edited it in the admin
meanwhile, two because they still carried blanks the copy could not fill without
inventing a fact. Re-running the same file is safe: anything already written
comes back as already-applied and is not written twice.

Without the write scopes the skill still works: it produces the proposal and
stops at the point of writing. With `write_products` but not `write_files` it
writes the text fields and reports the alt text as not written — measured on a
live store on 2026-08-04, where `fileUpdate` returned ACCESS_DENIED while
`productUpdate` succeeded.

## What StoreHand may see

Setup requests five **read-only** scopes. Two write scopes, `write_products` and
`write_files`, are offered separately and only if you want the listing writer —
every other skill works without them, and a store connected with the five is the
safer resting state.

| Scope | Why |
|---|---|
| `read_orders` | New orders, payment status, cancellations, refunds |
| `read_products` | Product and variant details |
| `read_inventory` | Stock levels for low-stock alerts |
| `read_discounts` | Discount codes and windows for the health check |
| `read_online_store_navigation` | Menu links for the broken-link check |
| `read_reports` | Not requested by StoreHand — Shopify's own CLI app adds it to every authorization. Listed here because the consent screen will show it |
| `write_products` | **Optional, opt-in.** Only for `product-listing-writer`, and only to apply a proposal you have read and edited. Titles, descriptions and SEO fields — not prices, not inventory, not orders |
| `write_files` | **Optional, opt-in.** Image alt text only. Shopify puts alt text behind `fileUpdate`, which `write_products` does not cover — without this scope the listing writer applies everything else and reports the alt text as not written |

You approve these in your own browser, on Shopify's own screen. See
[docs/connect.md](docs/connect.md) for how the connection works and why it needs
no app of your own.

## No telemetry

StoreHand sends nothing anywhere. No usage pings, no prompts, no store data, and
there is no StoreHand server for any of it to go to.

The network traffic is the Shopify CLI talking to your own store, setup finishing
its login on your own machine, the health check requesting your own storefront,
and the listing writer fetching your own product images so it can describe what
is in a photo rather than guess. That is the whole list, it is written down in
[`shared/safety.md`](shared/safety.md), and a test checks it against what the
skills actually declare.

---

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

Version 1 is setup plus five skills. **Setup and all five are shipped.** A skill is only listed as shipped once it has run
against a live store and the evidence is in [`docs/dogfood/`](docs/dogfood/).

| # | Skill | What it does | Status |
|---|---|---|---|
| 0 | `storehand-setup` | Store profile and connection | **Shipped** |
| 1 | `daily-store-briefing` | Orders, payments, cancellations, stock | **Shipped** |
| 2 | `store-health-check` | Weekly audit, broken links, discount and metadata gaps | **Shipped** |
| 3 | `product-listing-writer` | Titles, descriptions, SEO fields and alt text in your brand voice | **Shipped** |
| 4 | `price-and-competitor-watch` | Follows a fixed list of competitor product pages and reports the gap against your margin rules | After version 1 |
| 5 | `seo-metadata-audit` | Sweeps the whole catalogue, judges titles, meta descriptions and alt text, and orders what to fix first | **Shipped** |
| 6 | `weekly-store-report` | Week-on-week change in revenue, orders, average order value, sessions and conversion — cross-checked against the order records | **Shipped** |

**What is untested in skill 6.** The ShopifyQL pipe is proven: every column
`weekly-store-report` reads was executed against a live store and the evidence
is in `docs/dogfood/`. What has not run is the cross-check. The store available
for testing has no payment provider, so revenue and orders are both zero — and
two zeroes always agree. **The cross-check has never fired against non-zero
data.** It may also turn out to report a gap every week on a real store, because
`total_sales` is a defined Shopify metric rather than a synonym for summing
order totals. That is why a gap is printed as *unexplained* rather than *wrong*,
and why this paragraph exists instead of a claim that the skill is fully
exercised.

**Why 4 moved out of version 1.** It was measured before it was built, and the
measurement killed the design. Fetching competitor product pages the way the
other skills fetch a storefront succeeded once in nine attempts, and **zero
times on Shopify** — the platform the design was aimed at. Three failure modes:
403 bot protection, 429 from Shopify's edge throttling datacenter addresses, and
pages that load fine but carry no price because the shop renders it in the
browser. A headless browser on a normal machine read the same pages without
trouble — 18 prices on a client-rendered Shopify shop, 15 on a Magento one — so
the skill is possible, but only by requiring a browser StoreHand does not
currently depend on. That is a dependency this project should not gain quietly,
so skill 4 gets its own design round after version 1 rather than a patch now.

**Deliberately not in version 1:** customer-service chat and email, review
replies, email marketing and social, discount campaign creation, A/B testing.
Each needs either realtime infrastructure or a third-party platform, and both
break the "no external services" promise this project runs on.

### Following along

Version 1 is complete. Each skill shipped the same way: built, run against a
real store, evidence in `docs/dogfood/`, and only then listed as shipped.

- **Watch → Custom → Releases** tells you when one lands, and nothing else.
  Plain *Watch* also sends you every issue and pull request, which is probably
  not what you want.
- **A star** is how the next shop owner finds this. That is the entire
  distribution plan of a project with no marketing budget behind it.
- **[Leave your email](https://storehand.github.io)** only if you want the
  hosted version rather than running this yourself — see below. One message,
  ever.

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

---

<p align="center">
  <img src="https://raw.githubusercontent.com/storehand/storehand/refs/heads/main/assets/logo-mark.png" alt="" width="56" height="56" />
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="https://github.com/storehand/storehand/releases">Releases</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/dogfood/">Evidence</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="https://storehand.github.io">Get notified</a>
</p>

<p align="center">
  <sub><strong>An extra pair of hands for your store.</strong><br />
  Apache-2.0 · Not affiliated with Shopify Inc. · No telemetry, no account, nothing running on someone else's server.</sub>
</p>
