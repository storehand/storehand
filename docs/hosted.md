# The hosted version

**Nothing on this page is built.** No code, no beta, no date. This is the plan
for what the hosted version would be, written down in public so it can be
argued with before it exists.

Two things stay true regardless of what happens here:

- The skills in this repository are free, open source, and stay that way.
- This repository stays online no matter what.

The hosted version is a separate, paid product for shop owners who would rather
not run anything themselves. It only gets built if enough people ask for it —
[leave your email](https://storehand.github.io) and you get one message, the
launch date, once it is known. Miss the minimum sign-ups and the list is
deleted, nothing is sent, and nothing is built.

---

## 1. Theme builder

The headline feature, and the reason the hosted version is worth building at
all.

### The problem it goes after

A working Shopify store rents its features. A size guide is a monthly fee. A
bundle block is a monthly fee. Sticky add-to-cart, FAQ accordions, product tabs,
colour swatches, stock-level bars, announcement bars, trust badges, upsell
blocks on the cart page — each one an app, each one a subscription, each one a
script the storefront now has to load.

Most of that is a section of Liquid, a schema block and some CSS. Shop owners
are not paying for complexity. They are paying because they cannot write it and
will not risk breaking a theme they do not understand.

### What it would do

You describe the block you want. Claude writes it into your theme: the Liquid,
the section schema so it is editable in the theme editor like any native
section, the CSS, and the settings you asked for.

The intended flow:

1. **Describe.** "A size guide on the product page that opens in a drawer, reads
   the measurements from a metafield, and matches the product page typography."
2. **Build on a development theme.** Never on the live theme. The hosted version
   creates or reuses an unpublished theme and works there.
3. **Look at it.** A preview link to the real storefront on the dev theme, on
   your real products, with your real data.
4. **Approve or send it back.** Changes are a sentence, not a settings panel.
5. **Publish when you say so.** Never before.

Same rule as every skill in this repository: **StoreHand proposes, you
approve.** The hosted version does not get an exception because it is paid.

### What you end up owning

The output is a section in your theme. Not an embedded app block, not a script
tag pointing at someone else's server, not a licence check.

That has a consequence worth stating plainly: **if you cancel the hosted
version, everything it built keeps working.** The code is in your theme, it is
yours, and the storefront makes no request to StoreHand to render it. That is
the opposite of how an app subscription works, and it is intentional.

It also means the usual app tax disappears — no third-party script in the
critical path, no "upgrade to remove the badge", no settings panel that nearly
does the thing you wanted.

### Managing what it built

A store that accumulates custom blocks the way it used to accumulate apps has
not gained anything. So the builder has to own the whole lifecycle:

- **A register of what it made.** Every block StoreHand wrote, on which
  template, doing what, added when.
- **Changing one.** "Make the size guide drawer open from the right on mobile"
  edits the existing block instead of writing a second one.
- **Removing one cleanly.** Section, schema, CSS and any settings go together —
  no orphaned CSS and dead includes left behind, which is exactly the mess an
  uninstalled app leaves.
- **Surviving a theme change.** When you switch or update themes, the register
  says what has to be rebuilt, and rebuilding it is a command rather than a
  project.
- **Reporting on it.** What is installed, what it costs you in page weight, and
  which blocks nothing on the store references any more.

### What this honestly cannot replace

The claim is "most apps", not "all apps". An app earns its subscription when it
needs something a theme cannot do:

- Anything with its **own backend** — subscriptions and recurring billing,
  loyalty programmes with balances, inventory syncing to an external system.
- Anything that **stores and moderates data over time** — product reviews with
  photos, back-in-stock lists, customer wishlists that follow a login.
- Anything running **when nobody is on the page** — abandoned-cart flows, email
  and SMS sequences, scheduled feeds to Google or Meta.
- **Checkout itself.** Shopify only permits changes there through checkout
  extensions and Shopify Plus rules, and no amount of Liquid gets around that.

For those, an app is the right answer and the hosted version should say so
rather than build a worse version of one.

Where it does apply — presentation, layout, product-page behaviour, anything
that is really markup and style — the app was never the hard part.

---

## 2. Why hosted at all

The open source skills need Claude Code, a terminal and your own machine
switched on. Everything the hosted version adds comes from removing those three
requirements:

- **Runs on a schedule without you.** The morning briefing arrives because it is
  morning, not because you opened a terminal.
- **No install.** Connect the store, done. No Node, no plugin, no CLI.
- **Somewhere to read it.** Briefings, health checks and weekly reports in a
  place you can open on a phone.
- **Approvals from anywhere.** The proposal-and-approve rule only works if
  approving is easy.

The theme builder is what makes it worth paying for. The rest is what makes it
usable by people who would never have installed the open source version.

---

## 3. What has not been decided

Written down so it does not look settled when it is not:

- **Price.** Unknown. The only fixed point is that it has to be under what the
  apps it replaces cost together, or the argument collapses.
- **Where it runs.** Undecided, and it decides what happens to the "nothing
  running on someone else's server" promise. That promise stays exactly true for
  the open source skills either way.
- **Which blocks ship first.** Probably the ones people name most, which is why
  the question is being asked in public before anything is built.
- **Whether the builder is one skill or several.** A skill that both writes
  Liquid and manages a register may be two skills wearing one name.

Disagree with any of it — [open an issue](https://github.com/storehand/storehand/issues).
Arguing about a feature before it is built is cheaper than arguing after.
