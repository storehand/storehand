# price-and-competitor-watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship StoreHand skill #4 — find out who else sells your products, then follow their prices week over week and report where you sit, what changed, and what could not be read.

**Architecture:** One skill, two modes, no shipped script. `SKILL.md` steers the user's own Claude; the plugin contributes one GraphQL query and a file format. Discovery searches the web and proposes `.storehand/competitors.yaml` for the owner to confirm; watching runs weekly against that confirmed list and compares with `state.json`. Read-only throughout — the skill never writes to the store, and never asks for a write scope.

**Tech Stack:** Markdown skills · Shopify Admin GraphQL via the official Shopify CLI (`shopify store execute`) · Node's built-in test runner (`node --test`) · YAML/JSON profile files under `.storehand/`.

**Design doc:** `/root/toekomst-plan/docs/specs/2026-08-04-ontwerp-skill-4-price-and-competitor-watch.md`. Read it before Task 1. Everything below implements it; where this plan and the design disagree, the design wins and the plan is wrong.

---

## File Structure

| Path | Responsibility |
|---|---|
| `skills/price-and-competitor-watch/SKILL.md` | The whole skill. Both modes, the report shape, the errors table. |
| `skills/price-and-competitor-watch/queries/products-with-prices.graphql` | The only query. Own catalogue with variant prices. |
| `tests/competitor-watch.test.mjs` | Assertions over the text of `SKILL.md` — the rules that must not be edited away. |
| `shared/store-profile.md` | Modified: `competitors` key removed, `competitors.yaml` documented, `min_margin_percent` demoted. |
| `shared/safety.md` | Modified: the network promise rewritten (three named routes). |
| `templates/storehand/store.yaml` | Modified: `competitors: []` removed. |
| `skills/storehand-setup/SKILL.md` | Modified: stops creating the `competitors` key. |
| `README.md` | Modified: network sentence, roadmap row, skill count. |
| `.claude-plugin/plugin.json` | Modified: version bump, description no longer says price watching is "on the way". |
| `CHANGELOG.md` | Modified: 0.4.0 entry. |
| `docs/dogfood/2026-08-XX-price-and-competitor-watch.md` | Created in Task 9: evidence of the real run. |

**No `scripts/` directory for this skill.** That is a design decision, not an omission — see design §2. A task that adds one is implementing the wrong plan.

---

## Task 1: Measure the two assumptions before writing anything

Design §11 lists three open points. Two of them can invalidate the whole skill, and both have the same shape as the `$CLAUDE_PLUGIN_ROOT` bug that shipped broken in 0.2.0: an assumed capability that is not there, where a user following the instructions literally stalls on step one.

**Files:**
- Create: `docs/dogfood/2026-08-04-price-watch-assumptions.md`

- [ ] **Step 1: Confirm the price fields exist on the pinned API version**

None of the three existing product queries returns a price, so the shape is unverified. Check `shared/api-version.md` for the pinned version first, then run against a real store:

```bash
V="$(mktemp -d)"
cat > "$V/q.graphql" <<'GQL'
query PriceProbe($first: Int!) {
  products(first: $first) {
    nodes {
      handle
      priceRangeV2 { minVariantPrice { amount currencyCode } }
      variants(first: 5) {
        nodes { price compareAtPrice }
        pageInfo { hasNextPage }
      }
    }
  }
}
GQL
printf '%s' '{"first":3}' > "$V/v.json"
shopify store execute --store <store> --json --query-file "$V/q.graphql" --variable-file "$V/v.json"
```

Expected: JSON with `priceRangeV2.minVariantPrice.amount` as a string and `variants.nodes[].price` as a string. A field that does not exist comes back as a GraphQL validation error naming the field — that is the answer, write it down.

- [ ] **Step 2: Measure whether web tooling is available inside a plugin skill**

This is the one that can kill the skill. In a Claude Code session **with StoreHand installed as a plugin**, invoke a skill and have it attempt one web fetch of a public page. Record: did the tool exist, did it need a permission prompt, and what did the failure look like when denied.

Write down the exact failure text. Step 3 of the discovery mode depends on it, and **"no competitors found" and "no web access" must not look the same** — that distinction is what Task 5 encodes.

- [ ] **Step 3: Decide the `.gitignore` question**

`.storehand/state.json` is git-ignored, `.storehand/store.yaml` is not. `competitors.yaml` is hand-edited like `store.yaml`, so it follows `store.yaml` and is **not** ignored. Record the reasoning; do not silently pick.

- [ ] **Step 4: Write the findings up**

Create `docs/dogfood/2026-08-04-price-watch-assumptions.md` with all three results, including anything that came back different from the expectation above. If Step 2 shows web tooling is unavailable by default, **stop and report to the human before Task 2** — the design needs revisiting, not the plan.

- [ ] **Step 5: Commit**

```bash
git add docs/dogfood/2026-08-04-price-watch-assumptions.md
git commit -m "docs: measure the two price-watch assumptions before building"
```

---

## Task 2: The query

**Files:**
- Create: `skills/price-and-competitor-watch/queries/products-with-prices.graphql`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/competitor-watch.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SKILL_DIR = path.join(import.meta.dirname, '..', 'skills', 'price-and-competitor-watch');
const query = () =>
  fs.readFileSync(path.join(SKILL_DIR, 'queries', 'products-with-prices.graphql'), 'utf8');

test('the query asks for variant prices and exposes truncation', () => {
  const q = query();
  assert.match(q, /priceRangeV2/, 'needs the price range for the "from" price');
  assert.match(q, /compareAtPrice/, 'needs the strike-through price to spot sales');
  assert.match(q, /hasNextPage/, 'truncation must be visible, never silent');
});

test('the query is read-only — no mutation may hide in it', () => {
  assert.doesNotMatch(query(), /\bmutation\b/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: FAIL — `ENOENT`, the query file does not exist.

- [ ] **Step 3: Write the query**

Create `skills/price-and-competitor-watch/queries/products-with-prices.graphql`:

```graphql
# Own catalogue with the prices a shopper actually sees. Read-only.
#
# priceRangeV2.minVariantPrice is the "from" price on a listing page, and it is
# the number this skill compares — see SKILL.md, "Which price is compared".
# variants carries compareAtPrice so a sale on your own side is visible too.
#
# The filter narrows, it does not guarantee (verified 2026-07-30 on a live
# store). Re-check `status` on every record before reporting it.
query ProductsWithPrices($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    nodes {
      id
      title
      handle
      status
      priceRangeV2 {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      variants(first: 20) {
        nodes {
          title
          price
          compareAtPrice
        }
        pageInfo { hasNextPage }
      }
    }
    pageInfo { hasNextPage }
  }
}
```

- [ ] **Step 4: Run the test and the validator**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs && npm run validate`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/price-and-competitor-watch/queries/products-with-prices.graphql tests/competitor-watch.test.mjs
git commit -m "feat: query for own catalogue prices"
```

---

## Task 3: Retire the `competitors` key from the store profile

Design §5, "Botsing met wat er al staat". `shared/store-profile.md` documents `competitors` as a **required** key in `store.yaml`, left over from the fixed-list design that was reopened. It now points at the wrong file.

`pricing.min_margin_percent` gets the same look: nothing in the shipped skills reads it, and v1 of this skill does not either. It stays — a later price-writing round needs it — but it must stop being listed as required, or a user without it gets blocked for a value nothing uses.

**Files:**
- Modify: `shared/store-profile.md`
- Modify: `templates/storehand/store.yaml`
- Modify: `skills/storehand-setup/SKILL.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
const REPO = path.join(import.meta.dirname, '..');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('the store profile no longer requires a competitors key', () => {
  const doc = readRepo('shared/store-profile.md');
  assert.doesNotMatch(
    doc,
    /^\|\s*`competitors`/m,
    'the required-keys table must not list `competitors` — the list lives in competitors.yaml',
  );
  assert.match(doc, /competitors\.yaml/, 'the new file must be documented instead');
});

test('the template does not seed a competitors key', () => {
  assert.doesNotMatch(readRepo('templates/storehand/store.yaml'), /^competitors:/m);
});

test('min_margin_percent is documented as unused in v1, not as required', () => {
  const doc = readRepo('shared/store-profile.md');
  assert.match(doc, /min_margin_percent/);
  assert.match(
    doc,
    /not read by any shipped skill/i,
    'a required key nothing reads blocks users for nothing — say so plainly',
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: three FAILs.

- [ ] **Step 3: Edit `shared/store-profile.md`**

Remove the `competitors` row from the required-keys table. Change the `pricing.min_margin_percent` row to read:

```markdown
| `pricing.min_margin_percent` | Optional. Reserved for a future skill that proposes prices. **Not read by any shipped skill** — leave it out or set it to null. |
```

Add a new section after the `store.yaml` section:

```markdown
## `competitors.yaml` — written by the price watch, edited by you

`price-and-competitor-watch` proposes this file; you confirm it. It is the only
thing the weekly run reads, so deleting a line stops that page being followed.

Not machine-only: it is meant to be read and corrected by hand, so it sits next
to `store.yaml` rather than inside `state.json`, and it is not git-ignored.

    storeCurrency: EUR

    products:
      - handle: kimono-jacket-floral
        yourPrice: "34.95"          # your price when the list was proposed
        watch:
          - url: https://example-shop.test/products/kimono-floral
            seenTitle: "Kimono cardigan floral print"
            seenPrice: "29.95"
            currency: EUR
            match: confirmed        # confirmed | unconfirmed — you decide
            note: same supplier photo

    # Found, but cannot be followed. Kept so you know they exist and the weekly
    # run is never quietly measuring less than you think.
    unreadable:
      - url: https://example-retailer.test/p/12345
        reason: "403 — refuses automated reading"
        forProduct: kimono-jacket-floral

`match: unconfirmed` entries are shown in the report but **left out of the
median and the position**. An unconfirmed match that quietly drags the average
down is worse than no match at all.
```

- [ ] **Step 4: Edit `templates/storehand/store.yaml`**

Delete these two lines:

```yaml
# Product pages you want the price watch skill to follow. May stay empty.
competitors: []
```

And change the `pricing` block to:

```yaml
pricing:
  # Optional, and not read by any shipped skill yet. Reserved for a future
  # skill that proposes prices.
  min_margin_percent: null
```

- [ ] **Step 5: Edit `skills/storehand-setup/SKILL.md`**

Find where it writes the profile and remove `competitors` from the generated `store.yaml`. Add one line to the same step:

```markdown
Do not create a `competitors` key. Older profiles may still carry one; ignore
it — the price watch reads `.storehand/competitors.yaml` and nothing else.
```

- [ ] **Step 6: Run the whole suite**

Run: `cd /root/storehand && npm run check`
Expected: all tests pass, validator passes, secret scan clean.

- [ ] **Step 7: Commit**

```bash
git add shared/store-profile.md templates/storehand/store.yaml skills/storehand-setup/SKILL.md tests/competitor-watch.test.mjs
git commit -m "refactor: competitors list moves out of store.yaml into its own file"
```

---

## Task 4: SKILL.md — front matter, Step 0, and picking the mode

**Files:**
- Create: `skills/price-and-competitor-watch/SKILL.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
const skill = () => fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');

test('front matter carries a name and a description that says when to use it', () => {
  const s = skill();
  assert.match(s, /^---\nname: price-and-competitor-watch\n/);
  assert.match(s, /description: .*competitor/i);
  assert.match(s, /Use when/, 'the description must tell Claude when to reach for it');
});

test('the mode is chosen on the state of the file, not on a flag', () => {
  const s = skill();
  assert.match(s, /competitors\.yaml/);
  assert.match(s, /missing or empty/i, 'absent list means discovery');
});

test('a second discovery round proposes alongside the list, never over it', () => {
  assert.match(
    skill(),
    /never overwrite/i,
    'overwriting would wipe the owner’s confirmed matches back to unconfirmed',
  );
});

test('the skill never asks for a write scope and never mutates', () => {
  const s = skill();
  assert.doesNotMatch(s, /--allow-mutations/);
  assert.doesNotMatch(s, /write_products/);
});

test('v1 reports a position and never proposes a price', () => {
  const s = skill();
  assert.doesNotMatch(
    s,
    /suggested price|recommended price|propose a (new )?price/i,
    'a proposed price needs a cost price, and inventing one is what safety.md forbids',
  );
  assert.doesNotMatch(s, /margin/i, 'margin is out of v1 — it needs a cost price nobody has');
});

test('this skill ships no scripts', () => {
  assert.equal(
    fs.existsSync(path.join(SKILL_DIR, 'scripts')),
    false,
    'design §2: the user’s own Claude does the reading — a script here is the wrong plan',
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: FAIL — `ENOENT` on `SKILL.md`.

- [ ] **Step 3: Write the first part of `SKILL.md`**

Create `skills/price-and-competitor-watch/SKILL.md`. Step 0 must be **byte-identical** to the copy in the other four skills — `tests/plugin-root.test.mjs` asserts exactly that, so a reworded or retyped version fails the suite. Do not retype it; extract it:

```bash
cd /root/storehand
sed -n '/^## Step 0 — Find the plugin$/,/^## Step 1/p' skills/store-health-check/SKILL.md \
  | sed '$d' > /tmp/step0.md
wc -l /tmp/step0.md   # 27 — verified 2026-08-04; all four shipped skills carry these exact 27 lines
```

`tests/plugin-root.test.mjs` reads the `skills/` directory, so it picks the new skill up on its own and fails the moment Step 0 drifts. Two consequences: nothing needs registering, and the assertion message in that test ("update all four together") should be reworded to say five.

Paste `/tmp/step0.md` into the new SKILL.md where the outline below says `[Step 0]`, unchanged. The final line of that block — the one pointing at `shared/safety.md` and `shared/store-profile.md` — stays as it is; both files matter to this skill too.

````markdown
---
name: price-and-competitor-watch
description: Find out who else sells your products, then follow their prices week over week — where you sit against the market, what changed since last time, and what could not be read. Read-only. Use when the user asks about competitor prices, price comparison, where their prices sit in the market, or to find out who their competitors are.
---

# Price and competitor watch

Two modes in one skill. **Discover** searches the web for shops selling what you
sell and proposes a list you confirm. **Watch** runs weekly against that
confirmed list and reports where you sit. Neither mode writes anything to the
store — not a price, not a tag, nothing.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md` and the `queries/` directory — live under the plugin's install
directory. The store profile (`.storehand/`) lives in the user's working
directory.

[Step 0]  ← paste /tmp/step0.md here verbatim, heading included

## Step 1 — Load the profile, then pick the mode

Read `.storehand/store.yaml`: you need `store` and `currency`. No `.storehand/`?
Point the user at the `storehand-setup` skill and stop. Do not ask for the
values and carry on.

An older profile may still carry a `competitors:` key. **Ignore it.** The list
lives in `.storehand/competitors.yaml` and nowhere else; reading a half-migrated
profile is how a run quietly measures the wrong thing.

Then decide the mode on what is on disk, not on a flag:

| State | Mode |
|---|---|
| `.storehand/competitors.yaml` missing or empty | **Discover** — Steps 2 to 5 |
| The file is there | **Watch** — Steps 6 to 9 |
| The user explicitly asks to look for new competitors | **Discover**, then merge |

When discovery runs against an existing list, **never overwrite that file**.
Propose the new entries alongside the existing ones and let the user merge. A
rewrite sets every `match: confirmed` back to `unconfirmed`, throwing away the
only work in this skill that a human did.
````

- [ ] **Step 4: Run the tests**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs tests/plugin-root.test.mjs`
Expected: PASS, including the byte-identical Step 0 check.

- [ ] **Step 5: Commit**

```bash
git add skills/price-and-competitor-watch/SKILL.md tests/competitor-watch.test.mjs
git commit -m "feat: price watch skill skeleton and mode selection"
```

---

## Task 5: SKILL.md — the discovery mode

**Files:**
- Modify: `skills/price-and-competitor-watch/SKILL.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
test('no web access and no competitors found must not look the same', () => {
  const s = skill();
  assert.match(
    s,
    /cannot reach the web/i,
    'the skill must name the no-web-access case explicitly',
  );
  assert.match(s, /never report .*no competitors/i);
});

test('every candidate is read before it goes on the list', () => {
  assert.match(skill(), /before it goes on the list/i);
});

test('discovery is capped at ten products per round', () => {
  const s = skill();
  assert.match(s, /\b10 products\b/);
  assert.match(s, /unless the user asks for more/i);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: three FAILs.

- [ ] **Step 3: Append the discovery steps to `SKILL.md`**

````markdown
## Step 2 — Fetch your own catalogue

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned version,
pass `--version <handle>`. Read-only — **never add `--allow-mutations`**.
Write variables to a file, never inline (quoting damage is silent):

```bash
V="$(mktemp -d)"
printf '%s' '{"query":"status:active","first":100}' > "$V/products.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/price-and-competitor-watch/queries/products-with-prices.graphql" \
  --variable-file "$V/products.json"
```

Shell state does not survive between tool calls: set `V` again in every call, or
use one fixed scratch path. The CLI's error box goes to **stderr** with empty
stdout, so empty stdout is a failed call, never a quiet result.

`pageInfo.hasNextPage` true → say the catalogue was truncated. Do not paginate.

## Step 3 — Choose at most ten products

Default: **10 products** per round, the ones the owner names, or the newest
active ones if they name none. Not more, unless the user asks for more — and
when they do, say how many the proposal will contain.

Ten is a design choice, not a technical limit. Forty rows do not get reviewed;
they get waved through, and then the confirmation step is decoration while still
looking like a safeguard.

## Step 4 — Search, and read before you list

For each product, search the web for shops selling the same or a closely
comparable item. Then, **before it goes on the list, open the page and read the
price.** A URL that cannot be read is not a competitor you can follow, and
finding that out in week six is a wasted month.

Record per candidate: the page title, the price, the currency, and whether you
are sure this is the same product. Say `match: confirmed` only when the evidence
is on the page — same supplier photo, same model name, same specification. Guess
work is `match: unconfirmed`, and the owner decides.

**A block is an answer, not an obstacle.** Some shops refuse automated reading
(403), and that refusal is to be respected and reported, never worked around.
Do not change your user agent to look like something else, do not retry through
another route, do not use a browser to get past a refusal you already received.
This project's entire promise is that it does not lie about what it measured;
it does not get to lie to the neighbours either.

**If you cannot reach the web at all** — no fetch tool, a denied permission, or
every request failing the same way — stop and say exactly that. **Never report
"no competitors found"** when the truth is that nothing was searched. Those two
outcomes look identical in a report and mean opposite things.

## Step 5 — Propose the list

Write `.storehand/competitors.yaml` in the format documented in
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md`. Everything you could read goes
under `products`; everything you found but could not read goes under
`unreadable`, with the reason.

Then tell the user, in the chat, three things: how many products the list
covers, how many entries are `unconfirmed` and waiting on them, and which shops
came back unreadable. Close by saying the file is theirs to edit and that
nothing is followed until they have looked at it.

Nothing has been written to the store. This mode is read-only from beginning
to end.
````

- [ ] **Step 4: Run the tests**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/price-and-competitor-watch/SKILL.md tests/competitor-watch.test.mjs
git commit -m "feat: discovery mode — search, read before listing, refuse to fake a result"
```

---

## Task 6: SKILL.md — the watch mode, the report, and the memory

**Files:**
- Modify: `skills/price-and-competitor-watch/SKILL.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
test('the three outcomes are named and kept apart', () => {
  const s = skill();
  assert.match(s, /Not read/);
  assert.match(s, /Changed page/);
  assert.match(s, /never .*unchanged/i, 'a page that would not open is not "unchanged"');
});

test('unconfirmed matches are excluded from the median', () => {
  const s = skill();
  assert.match(s, /unconfirmed/);
  assert.match(s, /left out of the median/i);
});

test('a foreign currency is never converted', () => {
  const s = skill();
  assert.match(s, /do not convert/i);
  assert.match(s, /rate that is different tomorrow/i);
});

test('an unread URL keeps its previous reading and its old date', () => {
  assert.match(skill(), /keeps its previous reading/i);
});

test('the tax assumption is stated in the report, not hidden', () => {
  assert.match(
    skill(),
    /assumed to include tax/i,
    'two prices that look comparable are not, if one excludes tax — say the assumption out loud',
  );
});

test('state.json is shared — the whole object is written back', () => {
  const s = skill();
  assert.match(s, /competitorWatch/);
  assert.match(s, /whole object/i);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: five FAILs.

- [ ] **Step 3: Append the watch steps to `SKILL.md`**

````markdown
## Step 6 — Load the list and the memory

Read `.storehand/competitors.yaml`. Cannot parse it in full? **Stop.** A list
understood in part is a market measured in part, and the report would not show
which part. Say which line broke and ask the user to fix it.

Read `.storehand/state.json` and keep the **whole** object in hand — other
skills keep their keys there and they must survive your write in Step 9. Under
`competitorWatch` you may find `lastRunAt` and `readings` (a list of
`{ "url", "price", "currency", "onSale", "readAt" }`).

No `competitorWatch` key → this is the first watch: say so and skip the
"changed since" labels. File present but unparseable → say so, run anyway, and
do **not** write `state.json` at the end.

## Step 7 — Read the pages, then re-read your own prices

Fetch your own current prices again with the Step 2 query — the owner may have
changed a price since the list was proposed, and comparing against a stale
`yourPrice` would invent a movement that never happened.

Then open every `url` under `products[].watch` and read the price. Per entry,
one of exactly three outcomes:

- **read** — you got a price. Compare the page title against `seenTitle`. Close
  enough → record the price. Clearly a different product → this is not a read,
  it is a **changed page** (below);
- **not read** — 403, timeout, 404, or the page would not load. Record the
  literal reason. **Never treat this as "unchanged"**: those are different
  facts, and only one of them is a measurement;
- **changed page** — the URL now shows something else. Report no price for it
  and tell the owner to check that line in `competitors.yaml`.

**Which price is compared.** The lowest variant price on both sides — that is
what a shopper sees on a listing page — and the report says so.

**Sale prices.** A strike-through price means the number you read is temporary.
Record both and report them together: "€24.95 (on sale, normally €34.95)". A
competitor running a weekend promotion is not structurally cheaper, and chasing
one is how a store prices itself down for nothing.

**Currency.** Record it. If it differs from `storeCurrency`, **do not convert** —
that needs a rate that is different tomorrow, and a report should not contain a
number that ages. Leave that competitor out of the position and say how many
were left out and why.

**Unconfirmed matches.** Entries with `match: unconfirmed` are read and shown,
but **left out of the median and the position** until the owner confirms them.

## Step 8 — The report

```
Price position — 2026-08-11
12 products followed across 4 competitors

Kimono jacket — floral                       you €34.95
  market €24.95 – €39.95   median €29.95   position 6 of 7
  ↓ example-shop.test  €29.95 → €26.95  (on sale, normally €29.95)

Denim jacket — oversized                     you €49.95
  market €44.95 – €54.95   median €49.95   position 3 of 5
  unchanged since 2026-08-04

Knitted jumper                               you €27.50
  market €27.50 – €34.95   position 1 of 3 — you are the cheapest

Not read (2)
  example-retailer.test   403 — this shop does not allow automated reading
  boho.test               timeout; will be tried again next run

Changed page (1)
  label.test — this URL now shows "Summer dress blue", was "Flora kimono".
  No price reported.
  → check that line in competitors.yaml

Left out
  3 competitors in GBP · 2 matches still unconfirmed

Prices compared as shown on the page (assumed to include tax).
```

The bottom three blocks are the actual work. A report that shows only the top
part lies by omission. Every one of them appears **even when empty** — "Not read
(0)" is a result; a missing heading reads like a zero without being one.

Close with a few concrete suggestions. **Never act on them** — this skill
proposes, the owner decides, and this skill cannot change a price even if asked.

## Step 9 — Remember

**Only after a successful report**, write `.storehand/state.json`: take the
object from Step 6, replace only the `competitorWatch` key with
`{ "lastRunAt": "<now, ISO 8601 UTC>", "readings": [ … ] }`, and write the
**whole object** back. A skill that rebuilds this file from scratch erases
another skill's memory.

A URL that could not be read this run **keeps its previous reading and its old
`readAt`**. That is what lets the next report say "unchanged since 2026-08-04"
instead of "unchanged" — the difference between *I looked and it is the same*
and *I could not look* stays visible right down to the sentence.

If `state.json` was unparseable in Step 6, do not write at all.
````

- [ ] **Step 4: Run the full suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/price-and-competitor-watch/SKILL.md tests/competitor-watch.test.mjs
git commit -m "feat: watch mode, report shape and shared-state memory"
```

---

## Task 7: The errors table, and the honesty rule enforced in CI

Design §6 makes "never disguise yourself to get past a block" a principle. A principle in prose is untestable, which is exactly the failure class this project has hit five times. This task turns it into a test.

**Files:**
- Modify: `skills/price-and-competitor-watch/SKILL.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
test('the skill never tells the reader to disguise itself', () => {
  const s = skill();
  for (const forbidden of [
    /spoof/i,
    /pretend to be a (real )?browser/i,
    /change (your|the) user[- ]agent/i,
    /bypass the block/i,
    /work around the 403/i,
  ]) {
    assert.doesNotMatch(s, forbidden, `forbidden instruction matched ${forbidden}`);
  }
  assert.match(s, /a block is an answer, not an obstacle/i, 'the rule itself must be stated');
});

test('the errors table refuses to turn a failure into a clean result', () => {
  const s = skill();
  assert.match(s, /\| Situation \| What to do \|/);
  assert.match(s, /Never .*"?you are competitively priced"?/i);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: FAIL on the errors table (the honesty rule already passes — it was written in Task 5, and that is fine: the test now locks it in place).

- [ ] **Step 3: Append the errors table to `SKILL.md`**

````markdown
## Errors — never report a position you did not measure

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show `shopify store auth --store <store> --scopes read_products`, stop |
| No web access at all | Say so plainly and stop. Never report "no competitors found" |
| A competitor returns 403 | Report it under **Not read** with the reason. Never work around it |
| A page times out | Report it under **Not read**; it is tried again next run |
| The page behind a URL changed product | Report under **Changed page**, no price, point at `competitors.yaml` |
| `competitors.yaml` cannot be parsed in full | Stop, name the line, change nothing |
| Every competitor came back unread | Report the failure. **Never** "you are competitively priced" |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| Step 0 printed `NOT FOUND` | Stop and tell the user to reinstall; never guess where plugin files are |

A store that is priced well and a run that measured nothing look identical in a
report that hides its failures. Never let them.
````

- [ ] **Step 4: Run the full suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/price-and-competitor-watch/SKILL.md tests/competitor-watch.test.mjs
git commit -m "feat: errors table, and the do-not-disguise rule enforced by a test"
```

---

## Task 8: Rewrite the network promise

Design §9. Three public claims are now wrong, and one of them was already wrong before this skill existed.

**Files:**
- Modify: `shared/safety.md`
- Modify: `README.md`
- Test: `tests/competitor-watch.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/competitor-watch.test.mjs`:

```javascript
test('the network promise names every route, and there are three', () => {
  const s = readRepo('shared/safety.md');
  assert.doesNotMatch(
    s,
    /makes no network calls other than the Shopify CLI/,
    'that sentence was already untrue — store-health-check fetches the storefront',
  );
  assert.match(s, /exactly three ways/i);
  assert.match(s, /never disguised/i);
});

test('the README roadmap no longer promises margin rules for skill 4', () => {
  const r = readRepo('README.md');
  assert.doesNotMatch(r, /gap against your margin rules/);
  assert.doesNotMatch(r, /fixed list of competitor product pages/);
});

test('the README still promises there is no StoreHand server', () => {
  assert.match(readRepo('README.md'), /nothing running on someone else's server/);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/competitor-watch.test.mjs`
Expected: FAILs on the first two; the third passes and stays as a guard.

- [ ] **Step 3: Replace the Privacy section in `shared/safety.md`**

Replace the existing `## Privacy` section with:

```markdown
## Privacy and network

StoreHand sends no telemetry and has no server of its own. Nothing you run here
reports back to anyone.

Skills reach the network in exactly three ways, and no others:

1. the Shopify CLI talking to your own store;
2. StoreHand requesting your own storefront (`store-health-check`);
3. `price-and-competitor-watch` reading competitor pages listed in your own
   `competitors.yaml` — public pages, GET only, identified as StoreHand, and
   **never disguised to get past a block**.

Anything beyond these three changes the promise rather than implementing it.
Do not add one.
```

- [ ] **Step 4: Update the three places in `README.md`**

Replace the sentence `only network traffic is the Shopify CLI talking to your own store` with:

```markdown
The only network traffic is the Shopify CLI talking to your own store, StoreHand
checking your own storefront, and — if you use the price watch — reading the
competitor pages you listed yourself. Nothing else, and nothing to us.
```

Replace the roadmap row for skill 4 with:

```markdown
| 4 | `price-and-competitor-watch` | Finds who else sells your products, then follows their prices week over week and shows where you sit | **Shipped** |
```

Update the sentence above the roadmap table (`Setup and three of the six are shipped`) to four of the six, and the "Three skills to go" line under *Following along* to two.

- [ ] **Step 5: Run the full suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/safety.md README.md tests/competitor-watch.test.mjs
git commit -m "docs: network promise names all three routes; roadmap matches what ships"
```

---

## Task 9: Run it against a real store

A skill is not shipped until it has run on a live store and the evidence is in `docs/dogfood/`. That is the quality gate, not a formality — the last three skills each turned up bugs that were invisible while writing them.

**Files:**
- Create: `docs/dogfood/2026-08-XX-price-and-competitor-watch.md`

- [ ] **Step 1: Run discovery on the real store**

Install the branch as a plugin, open a session in the store's working directory, and ask for competitor research. Record: how many products it covered, how many candidates it found, how many it could read, how many came back `unconfirmed`.

- [ ] **Step 2: Deliberately test the case the store makes easy**

The dogfood store buys from a single dropship wholesaler, so competitors often sell the **identical** article with the same supplier photos. That makes matching unusually easy and is a property of that shop, not of the user who installs this.

**Pick at least one product with no identical match anywhere** and check what the skill does. Expected: `match: unconfirmed` with an honest note, or no candidate at all — never a confident match on a merely similar item. If it claims confidence there, that is a bug and it blocks the release.

- [ ] **Step 3: Confirm the list by hand, then run the watch**

Edit `competitors.yaml` the way a user would: delete a wrong entry, promote one `unconfirmed` to `confirmed`, leave one `unconfirmed`. Run the watch. Check the report: is the still-unconfirmed one shown but excluded from the median?

- [ ] **Step 4: Force each failure path**

Put a URL that 404s in the list, one that 403s (design §4 names five shops that reliably do), and one that points at a different product than `seenTitle` says. Run the watch again. Each must land under its own heading, and none may read as "unchanged".

- [ ] **Step 5: Run it twice and check the memory**

Run the watch a second time with nothing changed. The report must say "unchanged since <date>" with a real date, and `state.json` must still contain the other skills' keys.

- [ ] **Step 6: Write the dogfood report**

Create `docs/dogfood/2026-08-XX-price-and-competitor-watch.md`: what ran, what it found, every bug found and fixed, and everything still unproven. List what could **not** be tested as plainly as what could.

- [ ] **Step 7: Commit**

```bash
git add docs/dogfood/2026-08-XX-price-and-competitor-watch.md
git commit -m "docs: dogfood run of the price watch on a live store"
```

---

## Task 10: Ship it

- [ ] **Step 1: Bump the version**

Edit `.claude-plugin/plugin.json`: `"version": "0.4.0"`. Update the description — it currently says price watching is "On the way"; move it to the shipped list.

**The bump is the mechanism, not a formality.** Measured on 2026-08-04: with the marketplace clone pointing at a fixed `main`, `claude plugin update` reported `already at the latest version` and changed nothing. Updates are decided on the version number alone. Without the bump, no existing user ever gets this skill.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add a `## 0.4.0` entry above 0.3.0: the new skill, the two modes, the `competitors` key moving out of `store.yaml` (a profile change users will notice), and the reworded network promise.

- [ ] **Step 3: Run everything one more time**

Run: `cd /root/storehand && npm run check`
Expected: all PASS, scan clean.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "chore: release 0.4.0 — price and competitor watch"
git push -u origin feat/price-and-competitor-watch
```

Open the PR with the repo's template. Body: what the skill does, the two modes, the profile change, and the two claims that were measured in Task 1 rather than assumed.

- [ ] **Step 5: After the merge, tag the release**

Tag `v0.4.0` on the merge commit and write release notes, matching how v0.1.0 through v0.3.0 were done. A repo that shows releases is one of the first things a visitor checks.

---

## Open points for the human

- **The reading behaviour is not unit-tested**, because no shipped code does the reading. That is the price of the no-script decision (design §2), and Tasks 4–7 cover it as far as text assertions can: the rules cannot be edited away without failing CI. What they cannot check is whether Claude follows them on a page nobody anticipated. Only Task 9 touches that.
- **Task 1 Step 2 can invalidate the design.** If web tooling turns out to be unavailable or permission-gated by default, discovery does not work for a user who installs the plugin and changes nothing. Stop and re-open the design rather than shipping a skill that stalls on step one — that is exactly what 0.2.0 did.
- **`min_margin_percent` now sits in the profile unused.** Task 3 documents it as reserved. If the price-writing round never happens, it should be removed rather than left as furniture.
