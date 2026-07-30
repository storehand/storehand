# Security

## Reporting a vulnerability

Open a [security advisory](https://github.com/storehand/storehand/security/advisories/new)
rather than a public issue. If you do not have access to that, open an issue
saying only that you have a security report and asking for a contact — no
details in the issue itself.

## What StoreHand can reach

StoreHand is a set of Claude Code skills. It has no server, no telemetry and no
network calls of its own. Every request to a store goes through the Shopify CLI
under the user's own authentication, and the CLI refuses mutations unless
`--allow-mutations` is passed explicitly.

**This repository contains no credentials and never will.** There is nothing to
steal here: the token lives in the user's own `~/.config`, not in this project.

### For anyone running StoreHand

Two things are worth knowing about your own machine, because the repository
cannot protect them for you:

- **The Shopify CLI stores an access token on the machine that ran
  `shopify store auth`** (under `~/.config/shopify-cli-store-nodejs/`). Anyone
  with an account on that machine can read your store with it until it expires,
  and it renews itself. On a shared or remote machine, that is the thing worth
  guarding — not this repository.
- **Your store profile lives in your working directory**, not here. `.storehand/`
  holds your `*.myshopify.com` handle. It is not secret, but it names your admin
  login, so keep it out of any repository you publish. The scanner below refuses
  to commit it.

## What must never enter this repository

The rule is stricter than "no secrets", because the leak that prompted these
controls was not a secret. A dogfood note named a real storefront, and the URL
went public in a merged pull request.

Nothing that identifies a real store may be committed:

| Never | Use instead |
|---|---|
| A real `*.myshopify.com` handle | `your-store.myshopify.com` |
| A customer's or your own storefront domain | `store.example`, or "its own custom domain" |
| A numeric shop id | `<shop-id>` |
| A `gid://shopify/...` of a real object | an invented id |
| Real traffic, revenue or order figures | describe the shape, withhold the figures |
| Email addresses, names, anything about a customer | omit entirely |
| Any token, key or session file | omit entirely |

Dogfood notes stay honest under this rule: what matters in them is what the
skill did and where it fought back, never which store it was.

## The controls

Three layers, deliberately overlapping — each catches what the one before it
missed.

**1. Pre-commit hook.** `git config core.hooksPath hooks` enables
`hooks/pre-commit`, which runs the scanner before a commit is written. This is
the only layer that acts while removing the data is still free.

**2. CI.** `.github/workflows/ci.yml` runs the same scanner on every push and
pull request, before the tests. A clone without the hook still cannot merge a
leak.

**3. The scanner itself.** `scripts/scan-secrets.mjs` checks for tokens, keys,
store handles, shop ids, Shopify gids, email addresses and — the rule that would
have caught the original leak — **any hostname that is not on an allowlist**.
A blocklist cannot catch a domain nobody thought of; an allowlist can.

```bash
node scripts/scan-secrets.mjs .          # masked output, safe anywhere
node scripts/scan-secrets.mjs . --reveal # shows the values, local use only
```

**Findings are masked by default.** CI logs on a public repository are public, so
a scanner that prints `found store.example in docs/note.md` would publish the
very thing it blocked. CI shows rule, file and line; run it locally to see the
value.

If a match is a deliberate example, end that line with:

```
storehand-allow-secret: <rule-id>
```

The exemption is per line and per rule, so a line excused for `store-handle` is
still checked for tokens. `tests/scan-secrets.test.mjs` uses this for its own
fixtures, which keeps the mechanism honest — if it broke, those tests would fail.

## Known limitation

These controls guard what goes in from now on. They do not rewrite what is
already in the published history. One early dogfood note named a storefront
domain before the controls existed; the current files no longer contain it, but
the commit that introduced it is still reachable in the public history. It is a
public webshop address that grants no access to anything, so it has been left in
place deliberately rather than force-pushing a rewritten history onto everyone's
clones.
