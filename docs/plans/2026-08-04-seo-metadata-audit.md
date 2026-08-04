# seo-metadata-audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship StoreHand skill #5 — a read-only sweep of the whole catalogue that judges `seo.title`, `seo.description`, `image.alt` and product titles, orders the findings by severity and visibility, and hands the fixing to skill #3.

**Architecture:** One read-only skill plus one shared rules file. `SKILL.md` steers the user's own Claude; the plugin contributes one paginating GraphQL query and `shared/metadata-rules.md`, which becomes the single home for every quality threshold so #3 and #5 cannot drift apart. This round also repairs skill #3: its alt-text rule only fires on empty fields, which on a real store repairs nothing, and it gains the ability to look at product photos.

**Tech Stack:** Markdown skills · Shopify Admin GraphQL via the official Shopify CLI · Node's built-in test runner (`node --test`) · profile files under `.storehand/`.

**Design doc:** `/root/toekomst-plan/docs/specs/2026-08-04-ontwerp-skill-5-seo-metadata-audit.md`. Read it before Task 1. Where this plan and the design disagree, the design wins.

---

## File Structure

| Path | Responsibility |
|---|---|
| `shared/metadata-rules.md` | **New.** Every quality threshold, in one place. Read by #3 and #5. |
| `skills/seo-metadata-audit/SKILL.md` | The audit. Sweep, judge, order, report. Writes nothing. |
| `skills/seo-metadata-audit/queries/catalogue-metadata.graphql` | Whole-catalogue metadata with a cursor, so the sweep can paginate. |
| `tests/seo-audit.test.mjs` | Assertions over the audit's text and over the single-source-of-thresholds rule. |
| `skills/product-listing-writer/SKILL.md` | Modified: alt rule widened, photos looked at, thresholds moved out. |
| `shared/safety.md` | Modified: fourth network route (store images from Shopify's CDN). |
| `README.md` | Modified: roadmap row for #5, shipped counts. |
| `.claude-plugin/plugin.json`, `CHANGELOG.md` | Modified in Task 11: release 0.4.0. |
| `docs/dogfood/2026-08-XX-seo-metadata-audit.md` | Created in Task 10: evidence of two real runs. |

**No `scripts/` for this skill.** The audit compares strings and counts; the user's Claude does that directly. Nothing here needs a shipped executable.

**Every text assertion matches against `flat(...)`, never against raw markdown.**
`tests/seo-audit.test.mjs` defines `const flat = (text) => text.replace(/\s+/g, ' ')`
and the readers return flattened text. These files are hard-wrapped at 80
columns, so a phrase can be split at any space: a regex with a literal space in
it passes or fails depending on where the paragraph happened to wrap, which
measures formatting rather than meaning. Found twice in Tasks 3 and 4 — first
patched by sprinkling `\s+` between words, which only moved the problem to the
next gap. Use the raw text only where line structure is the point, such as the
`Network:` declaration in Task 8.

---

## Task 1: Measure the three open assumptions

Design §8 lists five open points; three of them can change the shape of the skill and all three are cheap to settle. The pattern is set: skill #4 was parked in this same session because an unmeasured capability turned out not to exist.

**Files:**
- Create: `docs/dogfood/2026-08-04-seo-audit-assumptions.md`

- [ ] **Step 1: Measure what looking at a photo costs**

Take three product images from a real store and read them. Record, per image: the file size, and roughly how much of the context window one image consumes. Thirty images per round is currently an assumption about what is workable, not a number.

```bash
V="$(mktemp -d)"
cat > "$V/q.graphql" <<'GQL'
query ImageProbe($first: Int!) {
  products(first: $first) {
    nodes { handle media(first: 3) { nodes { ... on MediaImage { alt image { url width height } } } } }
  }
}
GQL
printf '%s' '{"first":1}' > "$V/v.json"
shopify store execute --store <store> --json --version <pinned> \
  --query-file "$V/q.graphql" --variable-file "$V/v.json"
```

Download one image with `curl` and read it. Expected from the measurement already done on 2026-08-04: HTTP 200, around 400 KB, and legible enough to describe the garment, its closure, and its finish.

If thirty images per round turns out to be impractical, **lower the cap in the design before building**, do not discover it during the dogfood run.

- [ ] **Step 2: Settle pagination**

Every existing skill stops at `hasNextPage` rather than paginating. #5 is the first that must not. Run the catalogue query twice using the cursor and confirm the second page returns different products:

```bash
cat > "$V/p.graphql" <<'GQL'
query Page($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    nodes { handle }
    pageInfo { hasNextPage endCursor }
  }
}
GQL
printf '%s' '{"first":5}' > "$V/p1.json"
shopify store execute --store <store> --json --version <pinned> --query-file "$V/p.graphql" --variable-file "$V/p1.json"
# take endCursor from that output:
printf '%s' '{"first":5,"after":"<endCursor>"}' > "$V/p2.json"
shopify store execute --store <store> --json --version <pinned> --query-file "$V/p.graphql" --variable-file "$V/p2.json"
```

Expected: the second call returns five different handles and its own `endCursor`. Record how many pages a real catalogue takes and roughly how long that runs — the audit has to stay usable on a store with hundreds of products.

- [ ] **Step 3: Check the visibility signal**

The severity ladder leans on "reachable through a collection or a menu path". Confirm both are readable, and record what happens when a store has neither — that store's whole catalogue would otherwise be labelled invisible, which is worse than useless.

Reuse the existing queries: `skills/store-health-check/queries/collections-health.graphql` and `skills/store-health-check/queries/menus-and-domain.graphql`. Note that menus need `read_online_store_navigation`; an ACCESS_DENIED there is the case the report has to name.

- [ ] **Step 4: Write the findings up**

Create `docs/dogfood/2026-08-04-seo-audit-assumptions.md` with all three results, including anything that came back different from the expectation. State plainly what could not be measured.

- [ ] **Step 5: Commit**

```bash
git add docs/dogfood/2026-08-04-seo-audit-assumptions.md
git commit -m "docs: measure the seo-audit assumptions before building"
```

---

## Task 2: One home for the thresholds

Design §2. `~60` and `~155` live in `skills/product-listing-writer/SKILL.md` lines 141–142 today. With #5 judging against the same numbers, two skills could disagree without anyone noticing.

**Files:**
- Create: `shared/metadata-rules.md`
- Create: `tests/seo-audit.test.mjs`
- Modify: `skills/product-listing-writer/SKILL.md:141-142`

- [ ] **Step 1: Write the failing test**

Create `tests/seo-audit.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const skillFiles = () =>
  fs
    .readdirSync(path.join(REPO, 'skills'))
    .map((name) => [`skills/${name}/SKILL.md`, read(`skills/${name}/SKILL.md`)]);

test('the thresholds live in shared/metadata-rules.md', () => {
  const rules = read('shared/metadata-rules.md');
  assert.match(rules, /60/, 'the seo.title length threshold belongs here');
  assert.match(rules, /155/, 'the seo.description length threshold belongs here');
});

test('no skill carries a threshold number of its own', () => {
  for (const [name, text] of skillFiles()) {
    for (const threshold of [/~?60 characters/, /~?155 characters/]) {
      assert.doesNotMatch(
        text,
        threshold,
        `${name} repeats a threshold — it must read shared/metadata-rules.md instead`,
      );
    }
  }
});

test('every skill that judges metadata points at the shared rules', () => {
  for (const name of ['product-listing-writer', 'seo-metadata-audit']) {
    assert.match(
      read(`skills/${name}/SKILL.md`),
      /shared\/metadata-rules\.md/,
      `${name} must read the shared rules`,
    );
  }
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: FAIL — `ENOENT` on `shared/metadata-rules.md`.

- [ ] **Step 3: Write `shared/metadata-rules.md`**

```markdown
# Metadata quality rules

The thresholds every StoreHand skill judges product metadata by. They live here
and nowhere else: `product-listing-writer` writes against them and
`seo-metadata-audit` judges against them, and a skill that carried its own copy
would eventually disagree with the other one without anyone noticing.

A change here is one edit, not one edit per skill. The same reasoning as
`shared/api-version.md`.

## Thresholds

| Field | Counts as a problem when |
|---|---|
| `seo.title` | Empty · or longer than **60** characters · or identical to the product title |
| `seo.description` | Empty · or longer than **155** characters · or it repeats the product title |
| `image.alt` | Empty or null · or identical to the alt of another image on the same product · or equal to the vendor or brand name and nothing more · or a filename (`IMG_2831`, `DSC_0042.jpg`) |
| `title` | Reads like a stock code rather than a name · or says nothing a buyer would search for · or is identical to another product's title |

## What is measured, and what is not

The last three `image.alt` patterns are not equally proven. Measured on a live
store on 2026-08-04, across **429 images on 42 products**:

| Pattern | Hits |
|---|---|
| empty | 0 |
| identical to another image on the same product | **429** |
| equal to the vendor name | 0 |
| a filename | 0 |

So the duplicate-alt rule is the one that carries this store, and the other two
are **unproven** — cheap to check, but no store has yet shown one. Say so rather
than implying all four are equally grounded.

The duplicate-title rule is the only one that needs the whole catalogue.
`product-listing-writer` sees ten products at a time and must never claim a
title is a duplicate; `seo-metadata-audit` sweeps everything and can.
```

- [ ] **Step 4: Point #3 at the shared file**

In `skills/product-listing-writer/SKILL.md`, replace the two threshold cells in the Step 4 table so the numbers are gone:

```markdown
| `seo.title` | It breaks a rule in `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md` |
| `seo.description` | It breaks a rule in `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md` |
```

And add one line above that table:

```markdown
Read `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md` first — it holds the
thresholds this table refers to.
```

- [ ] **Step 5: Run the tests**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: the first two PASS. The third still FAILs, because `skills/seo-metadata-audit/SKILL.md` does not exist yet — that is Task 5.

- [ ] **Step 6: Commit**

```bash
git add shared/metadata-rules.md tests/seo-audit.test.mjs skills/product-listing-writer/SKILL.md
git commit -m "refactor: metadata thresholds move to one shared file"
```

---

## Task 3: Widen the alt rule in skill #3

Design §5. Today #3 proposes alt text only for an empty field. On the dogfood store that repairs **nothing**: zero of 429 images have an empty alt.

**Files:**
- Modify: `skills/product-listing-writer/SKILL.md:143`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
const writer = () => read('skills/product-listing-writer/SKILL.md');

test('alt text is proposed for a duplicate, not only for an empty field', () => {
  const s = writer();
  assert.match(s, /identical to the alt of another image on the same product/i);
  assert.doesNotMatch(
    s,
    /`image\.alt` \| Empty or null\./,
    'the empty-only rule repaired nothing on a real store — 0 of 429 images were empty',
  );
});

test('an alt that already says something is left alone', () => {
  assert.match(
    writer(),
    /leave it alone/i,
    'a rewrite of every alt text is as useless as rewriting none',
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: two FAILs.

- [ ] **Step 3: Replace the `image.alt` row**

In the Step 4 table of `skills/product-listing-writer/SKILL.md`:

```markdown
| `image.alt` | It breaks a rule in `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md`. One proposal per `MediaImage` node, each with its own media id. An alt that already describes this particular photo is fine — **leave it alone** |
```

Add below the table:

```markdown
The commonest real case is not an empty alt, it is the same alt on every photo
of a product — usually the product title, repeated. Measured on a live store:
429 of 429 images. Photo one and photo six then say the same thing, while photo
six is a close-up of the hem. That is the case worth fixing.
```

- [ ] **Step 4: Run the tests**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: both PASS (the shared-rules test from Task 2 still fails until Task 5).

- [ ] **Step 5: Commit**

```bash
git add skills/product-listing-writer/SKILL.md tests/seo-audit.test.mjs
git commit -m "fix: alt-text rule fires on duplicates, not only on empty fields"
```

---

## Task 4: Skill #3 looks at the photos

Design §5. Writing what is in photo six requires seeing photo six. Measured on 2026-08-04: the CDN serves the image (HTTP 200, 432 KB) and it is legible enough to describe the garment, its closure and its finish.

**Files:**
- Modify: `skills/product-listing-writer/SKILL.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
test('the alt text describes the product, not the model', () => {
  const s = writer();
  assert.match(s, /describe the product, not the model/i);
});

test('looking at a photo is measuring; deducing from it is not', () => {
  const s = writer();
  assert.match(s, /only what is visible/i);
  assert.match(s, /fabric|composition/i, 'name the thing that must never be deduced from a photo');
});

test('photo reading is capped per product and per round', () => {
  const s = writer();
  assert.match(s, /3 images per product/i);
  assert.match(s, /30 images (in total|per round)/i);
});

test('a partial fix is reported as partial', () => {
  assert.match(
    writer(),
    /say which images you covered/i,
    'photos 4 and up keep their duplicate alt — the audit will still flag the product',
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: three FAILs.

- [ ] **Step 3: Add the photo step to `SKILL.md`**

Insert into Step 4, after the copy rules:

````markdown
### Alt text: look at the photo

For every image you are proposing alt text for, fetch it and look at it. The
image URL comes back on the `MediaImage` node.

```bash
curl -s -o "$V/img-1.jpg" "<image.url from the query>"
```

Then read the file and describe what is actually in it.

**Two caps, and they are on images, not on products: at most 3 images per
product, and at most 30 images in the whole round.** Measured on a live store on
2026-08-04: the median product carries 9 images and the busiest carries 20, so
"ten products" is anywhere between 50 and 200 images. A cap that varies fourfold
depending on which products came back is not a cap. The first three images are
what a shopper sees on a listing and product page, so that is where the value is.

**Say which images you covered.** Images four and up keep their old alt text, so
the audit will still flag that product — report "images 1–3 updated" rather than
implying the product is done. Work that looks like it achieved nothing is worse
than work not done.

Two rules, and they are the difference between an alt text that helps and one
that misleads:

- **Describe the product, not the model.** "Woman with curly hair" helps nobody
  searching for this garment or hearing the page read aloud. The jacket is the
  subject; the person wearing it is not.
- **Only what is visible.** Looking at a photo is measuring. Deducing fabric or
  composition from it is inventing, and the rule against inventing a fact holds
  exactly as before: a stated cotton content that came from looking at a picture
  is a returns problem and a legal one.

If an image cannot be fetched, say so for that image and propose nothing for it.
Never write alt text for a photo you did not see.
````

- [ ] **Step 4: Run the whole suite**

Run: `cd /root/storehand && npm run check`
Expected: everything passes except the Task 2 shared-rules test waiting on Task 5.

- [ ] **Step 5: Commit**

```bash
git add skills/product-listing-writer/SKILL.md tests/seo-audit.test.mjs
git commit -m "feat: the listing writer looks at product photos before writing alt text"
```

---

## Task 5: The audit — query, front matter, sweep

**Files:**
- Create: `skills/seo-metadata-audit/queries/catalogue-metadata.graphql`
- Create: `skills/seo-metadata-audit/SKILL.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
const audit = () => read('skills/seo-metadata-audit/SKILL.md');

test('the audit query paginates and is read-only', () => {
  const q = read('skills/seo-metadata-audit/queries/catalogue-metadata.graphql');
  assert.match(q, /\$after: String/, 'the sweep needs a cursor');
  assert.match(q, /endCursor/);
  assert.doesNotMatch(q, /\bmutation\b/i);
});

test('the audit declares itself read-only and asks for no write scope', () => {
  const s = audit();
  assert.match(s, /^---\nname: seo-metadata-audit\n/);
  assert.match(s, /Use when/);
  assert.doesNotMatch(s, /--allow-mutations/);
  assert.doesNotMatch(s, /write_products/);
});

test('the audit sweeps the whole catalogue instead of stopping at a page', () => {
  const s = audit();
  assert.match(s, /keep paging/i);
  assert.match(s, /every other skill stops/i, 'say why this one is different');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: three FAILs.

- [ ] **Step 3: Write the query**

Create `skills/seo-metadata-audit/queries/catalogue-metadata.graphql`:

```graphql
# The whole catalogue's metadata, one page at a time. Read-only.
#
# This is the only StoreHand query that is meant to be called repeatedly with a
# cursor: the audit judges the entire catalogue, so stopping at the first page
# would silently under-report. Pass `after` as the previous page's `endCursor`.
query CatalogueMetadata($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    nodes {
      id
      title
      handle
      status
      vendor
      seo { title description }
      media(first: 20) {
        nodes { ... on MediaImage { id alt } }
        pageInfo { hasNextPage }
      }
      collections(first: 10) {
        nodes { handle title }
        pageInfo { hasNextPage }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

- [ ] **Step 4: Write the first part of `SKILL.md`**

Step 0 must be byte-identical to the copy in the other four skills — `tests/plugin-root.test.mjs` asserts it. Extract rather than retype:

```bash
cd /root/storehand
sed -n '/^## Step 0 — Find the plugin$/,/^## Step 1/p' skills/store-health-check/SKILL.md \
  | sed '$d' > /tmp/step0.md
wc -l /tmp/step0.md   # 27 — verified 2026-08-04
```

Create `skills/seo-metadata-audit/SKILL.md`:

````markdown
---
name: seo-metadata-audit
description: Read-only sweep of a whole Shopify catalogue for SEO titles, meta descriptions, image alt text and product titles that lag behind — ordered by how much each gap costs, with a pointer at the skill that fixes them. Use when the user asks for an SEO audit, a metadata check, which products need better SEO texts, or where their alt text is weak.
---

# SEO metadata audit

One read-only sweep of the entire catalogue. It judges what is there, orders the
findings by how much they cost, and hands the fixing to
`product-listing-writer`. It writes nothing to the store and asks for no write
scope.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md` and the `queries/` directory — live under the plugin's install
directory. The store profile (`.storehand/`) lives in the user's working
directory.

[Step 0]  ← paste /tmp/step0.md here verbatim, heading included

## Step 1 — Load the profile, the rules and the memory

Read `.storehand/store.yaml`: you need `store`. No `.storehand/`? Point the user
at the `storehand-setup` skill and stop.

Read `$CLAUDE_PLUGIN_ROOT/shared/metadata-rules.md`. **Those thresholds are the
only ones you judge by.** Do not bring your own idea of a good meta description
length — if this file and your instinct disagree, the file wins, because
`product-listing-writer` fixes against exactly these rules.

Read `.storehand/state.json` and keep the **whole** object. Under `seoAudit` you
may find `lastRunAt` and `counts`. No key → first audit: say so and skip the
"since last time" column.

## Step 2 — Sweep the whole catalogue

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; pass `--version <handle>` if
it names one. Read-only — **never add `--allow-mutations`**.

```bash
V="$(mktemp -d)"
printf '%s' '{"first":100}' > "$V/page.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/seo-metadata-audit/queries/catalogue-metadata.graphql" \
  --variable-file "$V/page.json"
```

**Every other skill stops when `hasNextPage` is true. This one does not.** An
audit that reports on the first hundred products of a five-hundred product store
is not an audit, it is a sample that looks like a total. So keep paging: take
`pageInfo.endCursor` and call again with it, until `hasNextPage` is false.

```bash
printf '%s' '{"first":100,"after":"<endCursor from the previous page>"}' > "$V/page.json"
```

Count the pages and say how many products were swept. If a page fails, stop and
report how far you got — a partial sweep reported as a total is the whole failure
mode this skill exists to avoid.

Shell state does not survive between tool calls: set `V` again in every call. The
CLI's error box goes to **stderr** with empty stdout, so empty stdout is a failed
call, never a quiet result.
````

- [ ] **Step 5: Run the tests**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs tests/plugin-root.test.mjs`
Expected: PASS, including the Task 2 shared-rules test that was waiting on this file.

- [ ] **Step 6: Commit**

```bash
git add skills/seo-metadata-audit tests/seo-audit.test.mjs
git commit -m "feat: seo audit skeleton and paginating catalogue sweep"
```

---

## Task 6: The judging — severity, visibility, duplicate titles

**Files:**
- Modify: `skills/seo-metadata-audit/SKILL.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
test('severity is crossed with visibility', () => {
  const s = audit();
  for (const level of [/HEAVY/, /MEDIUM/, /LIGHT/]) assert.match(s, level);
  assert.match(s, /reachable through a collection or a menu/i);
});

test('a missing menu scope drops the visibility layer out loud', () => {
  const s = audit();
  assert.match(s, /read_online_store_navigation/);
  assert.match(s, /say so/i);
  assert.doesNotMatch(s, /assume .*invisible/i);
});

test('duplicate titles are the finding only this skill may report', () => {
  const s = audit();
  assert.match(s, /duplicate title/i);
  assert.match(s, /whole catalogue/i);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: three FAILs.

- [ ] **Step 3: Append the judging step**

````markdown
## Step 3 — Judge, and place each finding on two axes

Judge every product against `shared/metadata-rules.md`. Then place each finding
by **severity** and by **visibility**, because a missing meta description on a
product nobody can reach costs nothing.

**Visible** = `status` is `ACTIVE` **and** the product is reachable through at
least one collection or menu path. Collections come back on the sweep query.
For menu paths, reuse
`$CLAUDE_PLUGIN_ROOT/skills/store-health-check/queries/menus-and-domain.graphql`.

That query needs `read_online_store_navigation`. On ACCESS_DENIED, **drop the
visibility layer and say so in the report** — collections alone still tell you
something. Never assume a product is invisible because you could not check; that
turns a missing scope into a catalogue full of low-priority findings.

| Severity | What lands here |
|---|---|
| **HEAVY** | An empty field on a visible product |
| **MEDIUM** | A filled but weak field on a visible product — duplicate alt, `seo.title` identical to the product title, `seo.description` repeating the title |
| **LIGHT** | Length problems: `seo.title` or `seo.description` over the threshold |
| **Bottom of the report** | The same gaps on products reachable from nowhere. Counted, listed last, with the reason |

### The finding only this skill may report

`product-listing-writer` is forbidden from calling a title a duplicate: it sees
ten products and says so itself. You sweep the **whole catalogue**, so you can
establish it. Report products sharing an identical title as their own MEDIUM
finding, naming the handles that collide.

This is the one judgement no other skill can make, so make it carefully: compare
the titles exactly, and when the sweep was cut short by a failed page, say the
duplicate check is incomplete rather than reporting a number.
````

- [ ] **Step 4: Run the tests**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/seo-metadata-audit/SKILL.md tests/seo-audit.test.mjs
git commit -m "feat: severity crossed with visibility, and catalogue-wide duplicate titles"
```

---

## Task 7: The report, the memory, and the number that will not match

**Files:**
- Modify: `skills/seo-metadata-audit/SKILL.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
test('the report explains why its counts differ from the health check', () => {
  const s = audit();
  assert.match(s, /store-health-check/);
  assert.match(s, /caps at 100/i);
});

test('a category that could not be measured is never counted as fixed', () => {
  const s = audit();
  assert.match(s, /never counts as fixed/i);
});

test('the memory follows the shared-state contract', () => {
  const s = audit();
  assert.match(s, /seoAudit/);
  assert.match(s, /whole object/i);
});

test('the report ends by pointing at the skill that fixes things', () => {
  assert.match(audit(), /product-listing-writer/);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: four FAILs.

- [ ] **Step 3: Append the report and memory steps**

````markdown
## Step 4 — Report

```
SEO audit — 412 products swept across 5 pages

HEAVY    38 products with no seo.description        (was 55)
         12 of them sit in a collection that is in your menu
HEAVY     9 images with no alt text                 (was 9)
MEDIUM  399 images carry the same alt as another image
          on the same product                            (was 429)
          10 products partially updated — images 1-3 fixed,
          the rest still duplicated
MEDIUM   17 seo.titles are the product title verbatim
MEDIUM    4 products share a title with another product
          nl-jas-kort / nl-jas-kort-2
LIGHT    54 seo.titles over the threshold
LIGHT     7 titles read like a stock code

Bottom: 31 gaps on 14 products that sit in no collection and
no menu. Fixing them pays nothing until they are reachable.

Biggest win: the 12 in 'Jassen'.
  → /storehand:product-listing-writer on collection jassen

Nothing was written. This run was read-only from start to finish.
```

Rules for the shape:

- Every category that ran gets a number, **including a zero**. A measured zero
  is a result; a category missing from the list reads like a zero without being
  one.
- The "(was …)" column only appears for categories that were measured both this
  run and last.
- Close by naming the collection or tag with the densest cluster of HEAVY
  findings and the exact `product-listing-writer` invocation for it. An audit
  that ends without a next action is a list.

### Why your numbers differ from the health check

`store-health-check` counts the same gaps but **caps at 100 products**, and it
reports presence only. This skill sweeps everything and judges quality, so its
numbers are legitimately higher. **Say this in the report whenever the health
check has run before** — an owner who sees 12 in one report and 38 in the other
will assume something is broken.

## Step 5 — Remember

**Only after a successful report**, write `.storehand/state.json`: take the
object from Step 1, replace only the `seoAudit` key with
`{ "lastRunAt": "<now, ISO 8601 UTC>", "counts": { … } }`, and write the **whole
object** back. A skill that rebuilds this file erases another skill's memory.

A category that could not be measured this run **never counts as fixed**: carry
the previous number forward and mark it as not measured. Zero found and not
looked at are indistinguishable in a difference count, and the difference count
is half of what makes this an audit rather than a snapshot.

If the sweep stopped early, do not write `state.json` at all — a moved marker
after a partial sweep turns next week's report into a fiction.

## Errors — never report a catalogue you did not sweep

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show `shopify store auth --store <store> --scopes read_products,read_online_store_navigation`, stop |
| ACCESS_DENIED on menus only | Drop the visibility layer, say so, continue on collections alone |
| A page of the sweep fails | Report how far you got. Never present a partial sweep as a total |
| `state.json` unparseable | Say so, run anyway, write nothing at the end |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| Step 0 printed `NOT FOUND` | Stop and tell the user to reinstall; never guess where plugin files are |

A clean catalogue and a sweep that stopped on page one look identical in a report
that hides its failures. Never let them.
````

- [ ] **Step 4: Run the whole suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/seo-metadata-audit/SKILL.md tests/seo-audit.test.mjs
git commit -m "feat: audit report, difference counting and the shared-state memory"
```

---

## Task 8: A fourth network route, and a test that keeps the promise honest

Design §6. Fetching store images from Shopify's CDN is traffic that `shared/safety.md` does not list. This is the second time in one day the list needed updating, so the list gets a test.

**Files:**
- Modify: `shared/safety.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/seo-audit.test.mjs`:

```javascript
test('the network promise lists the image route', () => {
  const s = read('shared/safety.md');
  assert.match(s, /cdn\.shopify\.com|your own store's images/i);
  assert.match(s, /exactly (three|four) ways/i);
});

test('every skill declares what it does on the network', () => {
  for (const [name, text] of skillFiles()) {
    assert.match(
      text,
      /^Network: .+$/m,
      `${name} has no Network: declaration — add one, "none" is a valid answer`,
    );
  }
});

test('a skill that declares network traffic is named in the promise', () => {
  const promise = read('shared/safety.md');
  for (const [file, text] of skillFiles()) {
    const skill = file.split('/')[1];
    const declared = text.match(/^Network: (.+)$/m)[1].trim();
    if (declared.toLowerCase() === 'none') {
      assert.doesNotMatch(
        promise,
        new RegExp(`\`${skill}\``),
        `${skill} declares no network traffic but the promise lists it`,
      );
      continue;
    }
    assert.match(
      promise,
      new RegExp(`\`${skill}\``),
      `${skill} declares "${declared}" but shared/safety.md does not name it`,
    );
  }
});
```

**Why a declaration instead of scanning for `curl`.** Scanning the text was tried first and every skill matched — three of them only because "fetch" is an ordinary English verb in a sentence about fetching query results. A test with false positives forces wrong documentation, which is worse than no test. A one-line declaration is unambiguous, and writing it makes an author decide what their skill does before CI does it for them.

- [ ] **Step 2: Run and watch them fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: FAIL on the image route.

- [ ] **Step 3: Give every skill a `Network:` line**

One line in each `SKILL.md`, directly under the opening paragraph. `none` means
nothing beyond the Shopify CLI talking to the user's own store — that route is
universal and does not need repeating per skill.

| File | Line to add |
|---|---|
| `skills/storehand-setup/SKILL.md` | `Network: the localhost auth callback (route 2 in shared/safety.md)` |
| `skills/daily-store-briefing/SKILL.md` | `Network: none` |
| `skills/store-health-check/SKILL.md` | `Network: your own storefront (route 3 in shared/safety.md)` |
| `skills/product-listing-writer/SKILL.md` | `Network: your own store's product images (route 4 in shared/safety.md)` |
| `skills/seo-metadata-audit/SKILL.md` | `Network: none` |

- [ ] **Step 4: Update the Privacy section of `shared/safety.md`**

Note that this adds the localhost auth callback, which the promise has never
mentioned. It is not new behaviour — `storehand-setup` has always done it — but
the list claimed to be complete and was not.

```markdown
## Privacy and network

StoreHand sends no telemetry and has no server of its own. Nothing you run here
reports back to anyone.

Skills reach the network in exactly four ways, and no others:

1. the Shopify CLI talking to your own store — every skill, and nothing else for
   most of them;
2. `storehand-setup` completing the authentication callback on your own machine;
3. `store-health-check` requesting your own storefront, to see which links
   really answer;
4. `product-listing-writer` fetching your own store's product images from
   Shopify's CDN, so it can describe what is actually in a photo instead of
   guessing.

Every skill states its own traffic in a `Network:` line, and a test checks that
line against this list. Anything beyond these four changes the promise rather
than implementing it — and it goes in this list in the same commit.
```

- [ ] **Step 5: Run the whole suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/safety.md skills/*/SKILL.md tests/seo-audit.test.mjs
git commit -m "docs: every skill declares its network traffic, and a test checks the promise"
```

---

## Task 9: Make the README say what ships

**Files:**
- Modify: `README.md`
- Test: `tests/seo-audit.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/seo-audit.test.mjs`:

```javascript
test('the roadmap no longer says the audit prepares the fixes', () => {
  const r = read('README.md');
  assert.doesNotMatch(r, /prepares the fixes/);
  assert.match(r, /seo-metadata-audit/);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd /root/storehand && node --test tests/seo-audit.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update the roadmap row and the counts**

Replace the row for skill 5:

```markdown
| 5 | `seo-metadata-audit` | Sweeps the whole catalogue, judges titles, meta descriptions and alt text, and orders what to fix first | **Shipped** |
```

Update the line above the table (`Setup and three of the six are shipped`) to four of the six, and the *Following along* line ("Three skills to go") to two. Skill #4 stays **Planned** — it is parked, and the roadmap has never promised a date.

- [ ] **Step 4: Run the whole suite**

Run: `cd /root/storehand && npm run check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/seo-audit.test.mjs
git commit -m "docs: roadmap says what the audit actually does"
```

---

## Task 10: Two real runs

One run proves the sweep. Only a second run proves the difference count, and that is half of what makes this an audit.

**Files:**
- Create: `docs/dogfood/2026-08-XX-seo-metadata-audit.md` (use the date of the run)

- [ ] **Step 1: First run on a real store**

Install the branch as a plugin, open a session in the store's working directory, ask for an SEO audit. Record: products swept, pages needed, wall-clock time, and every count.

- [ ] **Step 2: Check the finding that must not fire**

Find a product whose alt text genuinely describes its photos and confirm it is **not** flagged. An audit that condemns everything is as useless as one that finds nothing. If it flags a good alt, that is a bug and it blocks the release.

- [ ] **Step 3: Fix something with skill #3, using photos**

Run `product-listing-writer` on two or three products from the HEAVY list. Confirm it fetches the images, that the alt text describes the garment rather than the model, and that it invents no fabric. Apply the proposal.

- [ ] **Step 4: Second run, and check the difference**

Run the audit again. The counts must drop by exactly what was fixed, and the report must show the "(was …)" column with real numbers.

- [ ] **Step 5: Force the two failure paths**

Run once with the menu scope missing: the visibility layer must drop out loud, and no product may be labelled invisible by default. Then interrupt a sweep mid-way and confirm it reports how far it got and writes no `state.json`.

- [ ] **Step 6: Write the dogfood report**

Create the file with what ran, what it found, every bug found and fixed, and everything still unproven — including whether the two unproven alt patterns from `shared/metadata-rules.md` fired on this store.

- [ ] **Step 7: Commit**

```bash
git add docs/dogfood/
git commit -m "docs: dogfood the seo audit over two runs on a live store"
```

---

## Task 11: Ship it

- [ ] **Step 1: Bump the version**

Edit `.claude-plugin/plugin.json`: `"version": "0.4.0"`. Move SEO audits out of the "on the way" list in the description.

**The bump is the mechanism, not a formality.** Measured on 2026-08-04: with the marketplace clone pointing at a fixed `main`, `claude plugin update` reported `already at the latest version` and changed nothing. Updates are decided on the version number alone. Without the bump, no existing user gets this.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add a `## 0.4.0` entry above 0.3.0: the new audit skill, the widened alt rule and photo reading in `product-listing-writer` (a behaviour change users will notice), the new `shared/metadata-rules.md`, and the fourth network route.

- [ ] **Step 3: Run everything**

Run: `cd /root/storehand && npm run check`
Expected: all PASS, scan clean.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "chore: release 0.4.0 — seo metadata audit"
git -c credential.helper='store --file=/root/.git-credentials' push -u origin feat/seo-metadata-audit
```

Open the PR with the repo's template. Body: what the audit does, why it does not write, what changed in `product-listing-writer` and why, and the measurement that justified the alt-rule change (429 of 429 images duplicated, zero empty).

- [ ] **Step 5: After the merge, tag the release**

Tag `v0.4.0` on the merge commit and write release notes, matching v0.1.0 through v0.3.0.

---

## Open points for the human

- **This round changes a shipped skill.** `product-listing-writer` gains a
  widened alt rule and starts fetching images. Existing users will see it behave
  differently on the same store — that belongs in the changelog and the release
  notes, not just in the diff.
- **Two of the four alt patterns are unproven.** Vendor-name and filename alts
  had zero hits on the only store measured. They are cheap to keep, but if the
  dogfood run turns up nothing either, consider dropping them rather than
  carrying rules no store has ever triggered.
- **The photo-reading cap is a guess until Task 1 Step 1 measures it.** Ten
  products is inherited from `product-listing-writer`; the number of photos
  behind those ten products is not bounded by anything today.
