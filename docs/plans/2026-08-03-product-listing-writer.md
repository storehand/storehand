# product-listing-writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skill #3 writes product copy in the store's own voice into an editable
markdown proposal, and — on a separate command — applies exactly what the human
left in that file, field by field, silently skipping any field that changed in
the admin meanwhile.

**Architecture:** One skill, two phases. `propose` is read-only: it fetches the
named products, Claude writes the copy, and a script renders the proposal file.
`apply` is the only writing path in StoreHand: a script re-fetches live values,
compares them against the `HUIDIG` block stored in the proposal, and emits the
mutation variables for the fields that still match. The proposal file is the
whole interface between the two phases — nothing is carried in conversation.

**Tech Stack:** Node 18+ ESM (`.mjs`), `node:test` + `node:assert/strict`,
Shopify Admin GraphQL via `shopify store execute`, API version read from
`shared/api-version.md`.

**Design decisions already fixed** (do not relitigate):

| Decision | Choice |
|---|---|
| Which products | Only what the user names: handles, `--collection <handle>`, or `--tag <tag>` |
| Proposal format | Markdown, strict parser that refuses a file it cannot read in full |
| Conflict detection | Per field: proposal `HUIDIG` vs live value at apply time |
| Fields covered | `title`, `description`, `seo.title`, `seo.description`, `image.alt` |

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `skills/product-listing-writer/SKILL.md` | The two-phase workflow Claude follows |
| `skills/product-listing-writer/queries/products-by-handle.graphql` | Fetch named products with all five field values + media |
| `skills/product-listing-writer/queries/products-by-collection.graphql` | Same shape, selected by collection handle |
| `skills/product-listing-writer/queries/products-by-tag.graphql` | Same shape, selected by tag |
| `skills/product-listing-writer/mutations/product-update.graphql` | `productUpdate` for title/description/seo |
| `skills/product-listing-writer/mutations/file-update.graphql` | `fileUpdate` for image alt text |
| `skills/product-listing-writer/scripts/proposal.mjs` | The file format — renders it and parses it back. Both directions in one file so they cannot drift |
| `skills/product-listing-writer/scripts/plan-apply.mjs` | Compares a parsed proposal against live values and decides apply / skip / unchanged |
| `tests/proposal.test.mjs` | Round-trip and strict-refusal tests |
| `tests/plan-apply.test.mjs` | Conflict-detection tests |
| `docs/dogfood/2026-08-03-product-listing-writer.md` | Live-store evidence (Task 8) |

**Modify:**

| Path | Change |
|---|---|
| `skills/storehand-setup/SKILL.md` | Second, opt-in auth line that adds `write_products` |
| `README.md` | Scope table, roadmap row 3 → Shipped, skills table |
| `shared/safety.md` | A section naming the proposal/apply contract |

`.claude-plugin/marketplace.json` needs **no** change: `scripts/validate-plugin.mjs`
discovers skills by walking `skills/`.

---

## The proposal file format

This is the contract both scripts implement. Values are wrapped in `~~~` fences
so a multi-line `description` survives; `~~~` is used rather than ``` because
product HTML may contain backtick fences.

```markdown
# StoreHand listing proposal

- store: `your-store.myshopify.com`
- created: `2026-08-03T09:14:00Z`
- api-version: `2026-07`

Edit the text inside the VOORSTEL blocks. Delete a `###` field block to leave
that field alone. Do not touch the HUIDIG blocks — they are what protects your
admin edits.

---

## linnen-blazer

<!-- product: gid://shopify/Product/PRODUCT_ID -->

### title

HUIDIG
~~~
Linnen blazer
~~~

VOORSTEL
~~~
Linnen blazer — ongevoerd, voor warme dagen
~~~

### image.alt

<!-- media: gid://shopify/MediaImage/MEDIA_ID -->

HUIDIG
~~~
~~~

VOORSTEL
~~~
Model draagt de linnen blazer, half opengeslagen
~~~
```

**Parsed shape** (`parseProposal` returns this):

```js
{
  store: 'your-store.myshopify.com',
  createdAt: '2026-08-03T09:14:00Z',
  apiVersion: '2026-07',
  products: [
    {
      handle: 'linnen-blazer',
      id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'Linnen blazer', proposed: 'Linnen blazer — ongevoerd, voor warme dagen' },
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Model draagt de linnen blazer, half opengeslagen' },
      ],
    },
  ],
}
```

**Live shape** (what Claude assembles from the re-fetch and hands to `planApply`):

```js
{
  products: [
    {
      id: 'gid://shopify/Product/PRODUCT_ID',
      handle: 'linnen-blazer',
      values: { title: 'Linnen blazer', description: '<p>…</p>', 'seo.title': '', 'seo.description': '' },
      media: [ { id: 'gid://shopify/MediaImage/MEDIA_ID', alt: '' } ],
    },
  ],
}
```

---

### Task 1: Render the proposal file

**Files:**
- Create: `skills/product-listing-writer/scripts/proposal.mjs`
- Test: `tests/proposal.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/proposal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProposal } from '../skills/product-listing-writer/scripts/proposal.mjs';

const ONE_PRODUCT = {
  store: 'your-store.myshopify.com',
  createdAt: '2026-08-03T09:14:00Z',
  apiVersion: '2026-07',
  products: [
    {
      handle: 'linnen-blazer',
      id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'Linnen blazer', proposed: 'Linnen blazer — ongevoerd' },
      ],
    },
  ],
};

test('the header carries the store, the timestamp and the API version', () => {
  const text = renderProposal(ONE_PRODUCT);
  assert.match(text, /- store: `your-store\.myshopify\.com`/);
  assert.match(text, /- created: `2026-08-03T09:14:00Z`/);
  assert.match(text, /- api-version: `2026-07`/);
});

test('a product becomes an H2 with its gid in a comment', () => {
  const text = renderProposal(ONE_PRODUCT);
  assert.match(text, /^## linnen-blazer$/m);
  assert.match(text, /^<!-- product: gid:\/\/shopify\/Product\/PRODUCT_ID -->$/m);
});

test('a field renders both blocks, HUIDIG before VOORSTEL', () => {
  const text = renderProposal(ONE_PRODUCT);
  const body = text.slice(text.indexOf('### title'));
  assert.match(body, /### title\n\nHUIDIG\n~~~\nLinnen blazer\n~~~\n\nVOORSTEL\n~~~\nLinnen blazer — ongevoerd\n~~~/);
});

test('an empty current value renders an empty fence, not the word empty', () => {
  const text = renderProposal({
    ...ONE_PRODUCT,
    products: [{
      handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'seo.description', current: '', proposed: 'Iets' }],
    }],
  });
  assert.match(text, /HUIDIG\n~~~\n~~~/);
});

test('image.alt carries its media gid in a comment of its own', () => {
  const text = renderProposal({
    ...ONE_PRODUCT,
    products: [{
      handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Alt' }],
    }],
  });
  assert.match(text, /### image\.alt\n\n<!-- media: gid:\/\/shopify\/MediaImage\/MEDIA_ID -->/);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test tests/proposal.test.mjs`
Expected: FAIL — `Cannot find module '.../proposal.mjs'`

- [ ] **Step 3: Write the renderer**

```js
// skills/product-listing-writer/scripts/proposal.mjs
//
// The proposal file format, in both directions. Render and parse live in one
// file on purpose: if they drift, a proposal StoreHand wrote becomes a proposal
// StoreHand cannot read back, and the apply phase refuses the whole file.

export const FIELD_NAMES = ['title', 'description', 'seo.title', 'seo.description', 'image.alt'];

const FENCE = '~~~';

const PREAMBLE = `Edit the text inside the VOORSTEL blocks. Delete a \`###\` field block to leave
that field alone. Do not touch the HUIDIG blocks — they are what protects your
admin edits.`;

function block(label, value) {
  return `${label}\n${FENCE}\n${value === '' ? '' : `${value}\n`}${FENCE}`;
}

function renderField(field) {
  const head = field.name === 'image.alt'
    ? `### image.alt\n\n<!-- media: ${field.mediaId} -->`
    : `### ${field.name}`;
  return `${head}\n\n${block('HUIDIG', field.current)}\n\n${block('VOORSTEL', field.proposed)}`;
}

function renderProduct(product) {
  const fields = product.fields.map(renderField).join('\n\n');
  return `## ${product.handle}\n\n<!-- product: ${product.id} -->\n\n${fields}`;
}

export function renderProposal({ store, createdAt, apiVersion, products }) {
  const header = [
    '# StoreHand listing proposal',
    '',
    `- store: \`${store}\``,
    `- created: \`${createdAt}\``,
    `- api-version: \`${apiVersion}\``,
    '',
    PREAMBLE,
    '',
    '---',
  ].join('\n');
  return `${header}\n\n${products.map(renderProduct).join('\n\n')}\n`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `node --test tests/proposal.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add skills/product-listing-writer/scripts/proposal.mjs tests/proposal.test.mjs
git commit -m "feat: render the listing proposal file"
```

---

### Task 2: Parse the proposal back, and refuse what it cannot read

The parser is the safety boundary. A file it half-understands must produce an
error, never a partial write.

**Files:**
- Modify: `skills/product-listing-writer/scripts/proposal.mjs`
- Modify: `tests/proposal.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/proposal.test.mjs`:

```js
import { parseProposal } from '../skills/product-listing-writer/scripts/proposal.mjs';

test('what render writes, parse reads back unchanged', () => {
  const source = {
    store: 'your-store.myshopify.com',
    createdAt: '2026-08-03T09:14:00Z',
    apiVersion: '2026-07',
    products: [{
      handle: 'linnen-blazer',
      id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'Linnen blazer', proposed: 'Linnen blazer — ongevoerd' },
        { name: 'seo.description', current: '', proposed: 'Ongevoerde linnen blazer.' },
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Model draagt de blazer' },
      ],
    }],
  };
  assert.deepEqual(parseProposal(renderProposal(source)), source);
});

test('a multi-line description survives the round trip', () => {
  const source = {
    store: 'your-store.myshopify.com',
    createdAt: '2026-08-03T09:14:00Z',
    apiVersion: '2026-07',
    products: [{
      handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: '<p>Regel een</p>\n<p>Regel twee</p>' }],
    }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields[0].proposed, '<p>Regel een</p>\n<p>Regel twee</p>');
});

test('a field block the human emptied is dropped, not applied as blank', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'title', current: 'Oud', proposed: '' }] }],
  });
  const parsed = parseProposal(text);
  assert.deepEqual(parsed.products[0].fields, []);
});

test('an unknown field name is refused, naming the field and the handle', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'title', current: 'a', proposed: 'b' }] }],
  }).replace('### title', '### prijs');
  assert.throws(() => parseProposal(text), /prijs.*\bx\b|\bx\b.*prijs/);
});

test('a product without its gid comment is refused', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'title', current: 'a', proposed: 'b' }] }],
  }).replace('<!-- product: gid://shopify/Product/PRODUCT_ID -->\n\n', '');
  assert.throws(() => parseProposal(text), /gid|product id/i);
});

test('an unterminated fence is refused rather than swallowing the rest of the file', () => {
  const text = `# StoreHand listing proposal

- store: \`your-store.myshopify.com\`
- created: \`t\`
- api-version: \`v\`

---

## x

<!-- product: gid://shopify/Product/PRODUCT_ID -->

### title

HUIDIG
~~~
a
~~~

VOORSTEL
~~~
b
`;
  assert.throws(() => parseProposal(text), /unterminated|closing/i);
});

test('image.alt without a media gid is refused', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'alt' }] }],
  }).replace('<!-- media: gid://shopify/MediaImage/MEDIA_ID -->\n\n', '');
  assert.throws(() => parseProposal(text), /media/i);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/proposal.test.mjs`
Expected: FAIL — `parseProposal is not a function`

- [ ] **Step 3: Write the parser**

Append to `skills/product-listing-writer/scripts/proposal.mjs`:

```js
class ProposalError extends Error {}

function fail(message) {
  throw new ProposalError(`proposal file: ${message}`);
}

/** Reads a `LABEL` line followed by a ~~~ fence. Returns [value, nextIndex]. */
function readBlock(lines, start, label, where) {
  let i = start;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (lines[i]?.trim() !== label) fail(`${where}: expected a ${label} block`);
  i += 1;
  if (lines[i]?.trim() !== FENCE) fail(`${where}: ${label} is not followed by a ${FENCE} fence`);
  i += 1;
  const value = [];
  while (i < lines.length && lines[i].trim() !== FENCE) {
    value.push(lines[i]);
    i += 1;
  }
  if (i >= lines.length) fail(`${where}: unterminated ${label} block — no closing ${FENCE}`);
  return [value.join('\n'), i + 1];
}

function headerValue(text, key) {
  const found = text.match(new RegExp(`^- ${key}: \`([^\`]*)\``, 'm'));
  if (!found) fail(`missing \`${key}\` in the header`);
  return found[1];
}

export function parseProposal(text) {
  const parsed = {
    store: headerValue(text, 'store'),
    createdAt: headerValue(text, 'created'),
    apiVersion: headerValue(text, 'api-version'),
    products: [],
  };

  const lines = text.split('\n');
  let product = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const isProduct = line.match(/^## (.+)$/);
    if (isProduct) {
      const handle = isProduct[1].trim();
      const gid = lines.slice(i + 1, i + 4).join('\n').match(/<!-- product: (\S+) -->/);
      if (!gid) fail(`product "${handle}": no product gid comment under the heading`);
      product = { handle, id: gid[1], fields: [] };
      parsed.products.push(product);
      i += 1;
      continue;
    }

    const isField = line.match(/^### (.+)$/);
    if (isField) {
      const name = isField[1].trim();
      if (!product) fail(`field "${name}" appears before any product heading`);
      const where = `${product.handle} / ${name}`;
      if (!FIELD_NAMES.includes(name)) {
        fail(`${where}: "${name}" is not a field StoreHand writes (${FIELD_NAMES.join(', ')})`);
      }

      let mediaId;
      let cursor = i + 1;
      if (name === 'image.alt') {
        const comment = lines.slice(cursor, cursor + 3).join('\n').match(/<!-- media: (\S+) -->/);
        if (!comment) fail(`${where}: no media gid comment — StoreHand cannot tell which image to update`);
        mediaId = comment[1];
      }

      const [current, afterCurrent] = readBlock(lines, cursor, 'HUIDIG', where);
      const [proposed, afterProposed] = readBlock(lines, afterCurrent, 'VOORSTEL', where);
      i = afterProposed;

      // An emptied VOORSTEL means "leave this field alone", never "blank it".
      if (proposed.trim() !== '') {
        product.fields.push(mediaId ? { name, mediaId, current, proposed } : { name, current, proposed });
      }
      continue;
    }

    i += 1;
  }

  if (parsed.products.length === 0) fail('no product headings found');
  return parsed;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/proposal.test.mjs`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add skills/product-listing-writer/scripts/proposal.mjs tests/proposal.test.mjs
git commit -m "feat: parse the proposal file, strictly"
```

---

### Task 3: Decide what may be applied

**Files:**
- Create: `skills/product-listing-writer/scripts/plan-apply.mjs`
- Test: `tests/plan-apply.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/plan-apply.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApply } from '../skills/product-listing-writer/scripts/plan-apply.mjs';

const proposal = (fields) => ({
  store: 'your-store.myshopify.com', createdAt: 't', apiVersion: '2026-07',
  products: [{ handle: 'linnen-blazer', id: 'gid://shopify/Product/PRODUCT_ID', fields }],
});

const live = (values, media = []) => ({
  products: [{ id: 'gid://shopify/Product/PRODUCT_ID', handle: 'linnen-blazer', values, media }],
});

test('a field whose live value still matches HUIDIG is applied', () => {
  const plan = planApply(
    proposal([{ name: 'title', current: 'Oud', proposed: 'Nieuw' }]),
    live({ title: 'Oud' }),
  );
  assert.equal(plan.apply.length, 1);
  assert.deepEqual(plan.apply[0].productInput, { title: 'Nieuw' });
  assert.equal(plan.skipped.length, 0);
});

test('a field changed in the admin is skipped, and says both values', () => {
  const plan = planApply(
    proposal([{ name: 'title', current: 'Oud', proposed: 'Nieuw' }]),
    live({ title: 'Oud (SALE)' }),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.skipped, [{
    handle: 'linnen-blazer', field: 'title', reason: 'changed-in-admin',
    wasInProposal: 'Oud', isNow: 'Oud (SALE)',
  }]);
});

test('one changed field does not block the others on the same product', () => {
  const plan = planApply(
    proposal([
      { name: 'title', current: 'Oud', proposed: 'Nieuw' },
      { name: 'seo.description', current: '', proposed: 'Beschrijving' },
    ]),
    live({ title: 'Oud (SALE)', 'seo.description': '' }),
  );
  assert.deepEqual(plan.apply[0].productInput, { seo: { description: 'Beschrijving' } });
  assert.equal(plan.skipped.length, 1);
});

test('seo.title and seo.description merge into one seo object', () => {
  const plan = planApply(
    proposal([
      { name: 'seo.title', current: '', proposed: 'T' },
      { name: 'seo.description', current: '', proposed: 'D' },
    ]),
    live({ 'seo.title': '', 'seo.description': '' }),
  );
  assert.deepEqual(plan.apply[0].productInput, { seo: { title: 'T', description: 'D' } });
});

test('description maps onto descriptionHtml', () => {
  const plan = planApply(
    proposal([{ name: 'description', current: '<p>a</p>', proposed: '<p>b</p>' }]),
    live({ description: '<p>a</p>' }),
  );
  assert.deepEqual(plan.apply[0].productInput, { descriptionHtml: '<p>b</p>' });
});

test('image.alt becomes a files entry, not a product input', () => {
  const plan = planApply(
    proposal([{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Alt' }]),
    live({}, [{ id: 'gid://shopify/MediaImage/MEDIA_ID', alt: '' }]),
  );
  assert.deepEqual(plan.apply[0].files, [{ id: 'gid://shopify/MediaImage/MEDIA_ID', alt: 'Alt' }]);
  assert.deepEqual(plan.apply[0].productInput, {});
});

test('an image that disappeared from the product is skipped, not invented', () => {
  const plan = planApply(
    proposal([{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Alt' }]),
    live({}, []),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.skipped, [{
    handle: 'linnen-blazer', field: 'image.alt', reason: 'media-gone',
    wasInProposal: '', isNow: null,
  }]);
});

test('a proposal equal to the live value is unchanged, not an apply', () => {
  const plan = planApply(
    proposal([{ name: 'title', current: 'Zelfde', proposed: 'Zelfde' }]),
    live({ title: 'Zelfde' }),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.unchanged, [{ handle: 'linnen-blazer', field: 'title' }]);
});

test('a product that no longer exists is reported, never guessed at', () => {
  const plan = planApply(
    proposal([{ name: 'title', current: 'Oud', proposed: 'Nieuw' }]),
    { products: [] },
  );
  assert.deepEqual(plan.missing, [{ handle: 'linnen-blazer', reason: 'product-not-found' }]);
  assert.equal(plan.apply.length, 0);
});

test('a live value missing from the fetch counts as a conflict, never as a match', () => {
  const plan = planApply(
    proposal([{ name: 'seo.title', current: '', proposed: 'T' }]),
    live({}),
  );
  assert.equal(plan.apply.length, 0);
  assert.equal(plan.skipped[0].reason, 'not-measured');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/plan-apply.test.mjs`
Expected: FAIL — cannot find module `plan-apply.mjs`

- [ ] **Step 3: Write the planner**

```js
// skills/product-listing-writer/scripts/plan-apply.mjs
//
// Decides, field by field, what the apply phase is still allowed to write.
// The rule: a field may be written only when the live value is byte-identical
// to the HUIDIG block the proposal recorded. Anything else — changed, missing,
// unmeasured — is skipped and reported. Never write on a maybe.

const PRODUCT_FIELDS = new Set(['title', 'description', 'seo.title', 'seo.description']);

function intoProductInput(input, name, value) {
  if (name === 'title') input.title = value;
  else if (name === 'description') input.descriptionHtml = value;
  else if (name === 'seo.title') (input.seo ??= {}).title = value;
  else if (name === 'seo.description') (input.seo ??= {}).description = value;
  return input;
}

export function planApply(proposal, liveData) {
  const plan = { apply: [], skipped: [], unchanged: [], missing: [] };
  const byId = new Map((liveData.products ?? []).map((p) => [p.id, p]));

  for (const product of proposal.products) {
    const liveProduct = byId.get(product.id);
    if (!liveProduct) {
      plan.missing.push({ handle: product.handle, reason: 'product-not-found' });
      continue;
    }

    const entry = { handle: product.handle, productId: product.id, productInput: {}, files: [] };

    for (const field of product.fields) {
      const isAlt = field.name === 'image.alt';
      const media = isAlt
        ? (liveProduct.media ?? []).find((m) => m.id === field.mediaId)
        : null;

      if (isAlt && !media) {
        plan.skipped.push({
          handle: product.handle, field: field.name, reason: 'media-gone',
          wasInProposal: field.current, isNow: null,
        });
        continue;
      }

      const liveValue = isAlt ? (media.alt ?? '') : liveProduct.values?.[field.name];

      if (liveValue === undefined) {
        plan.skipped.push({
          handle: product.handle, field: field.name, reason: 'not-measured',
          wasInProposal: field.current, isNow: null,
        });
        continue;
      }

      if (liveValue !== field.current) {
        plan.skipped.push({
          handle: product.handle, field: field.name, reason: 'changed-in-admin',
          wasInProposal: field.current, isNow: liveValue,
        });
        continue;
      }

      if (field.proposed === liveValue) {
        plan.unchanged.push({ handle: product.handle, field: field.name });
        continue;
      }

      if (isAlt) entry.files.push({ id: field.mediaId, alt: field.proposed });
      else if (PRODUCT_FIELDS.has(field.name)) intoProductInput(entry.productInput, field.name, field.proposed);
    }

    if (Object.keys(entry.productInput).length > 0 || entry.files.length > 0) plan.apply.push(entry);
  }

  return plan;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/plan-apply.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Add the CLI entry so the skill can call it**

Append to `plan-apply.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProposal } from './proposal.mjs';

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const [proposalFile, liveFile] = process.argv.slice(2);
  if (!proposalFile || !liveFile) {
    console.error('usage: plan-apply.mjs <proposal.md> <live.json>');
    process.exit(2);
  }
  try {
    const proposal = parseProposal(fs.readFileSync(proposalFile, 'utf8'));
    const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
    console.log(JSON.stringify(planApply(proposal, live), null, 2));
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exit(1);
  }
}
```

- [ ] **Step 6: Verify the CLI refuses a broken proposal with exit code 1**

```bash
printf 'rubbish\n' > /tmp/bad.md && printf '{"products":[]}' > /tmp/live.json
node skills/product-listing-writer/scripts/plan-apply.mjs /tmp/bad.md /tmp/live.json; echo "exit=$?"
```

Expected: a `proposal file: missing \`store\` in the header` message on stderr and `exit=1`

- [ ] **Step 7: Commit**

```bash
git add skills/product-listing-writer/scripts/plan-apply.mjs tests/plan-apply.test.mjs
git commit -m "feat: decide per field what apply may write"
```

---

### Task 4: The queries and the mutations

**Files:**
- Create: `skills/product-listing-writer/queries/products-by-handle.graphql`
- Create: `skills/product-listing-writer/queries/products-by-collection.graphql`
- Create: `skills/product-listing-writer/queries/products-by-tag.graphql`
- Create: `skills/product-listing-writer/mutations/product-update.graphql`
- Create: `skills/product-listing-writer/mutations/file-update.graphql`

All three queries return the same selection set, so the propose phase and the
apply-time re-fetch read one shape.

- [ ] **Step 1: Write `products-by-handle.graphql`**

```graphql
query ProductsByHandle($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    pageInfo { hasNextPage }
    nodes {
      id
      handle
      title
      description
      descriptionHtml
      seo { title description }
      media(first: 10) {
        pageInfo { hasNextPage }
        nodes { ... on MediaImage { id alt } }
      }
    }
  }
}
```

- [ ] **Step 2: Write `products-by-collection.graphql`**

```graphql
query ProductsByCollection($handle: String!, $first: Int!) {
  collectionByHandle(handle: $handle) {
    id
    handle
    products(first: $first) {
      pageInfo { hasNextPage }
      nodes {
        id
        handle
        title
        description
        descriptionHtml
        seo { title description }
        media(first: 10) {
          pageInfo { hasNextPage }
          nodes { ... on MediaImage { id alt } }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Write `products-by-tag.graphql`**

```graphql
query ProductsByTag($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    pageInfo { hasNextPage }
    nodes {
      id
      handle
      title
      description
      descriptionHtml
      seo { title description }
      media(first: 10) {
        pageInfo { hasNextPage }
        nodes { ... on MediaImage { id alt } }
      }
    }
  }
}
```

- [ ] **Step 4: Write `product-update.graphql`**

```graphql
mutation UpdateListing($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      handle
      title
      seo { title description }
    }
    userErrors { field message }
  }
}
```

- [ ] **Step 5: Write `file-update.graphql`**

```graphql
mutation UpdateAlt($files: [FileUpdateInput!]!) {
  fileUpdate(files: $files) {
    files {
      ... on MediaImage { id alt }
    }
    userErrors { field message code }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add skills/product-listing-writer/queries skills/product-listing-writer/mutations
git commit -m "feat: queries and mutations for the listing writer"
```

> **Unverified until Task 8.** These shapes come from Shopify's published docs,
> not from a live call against the pinned `2026-07` version. Two are most likely
> to move: `collectionByHandle` (superseded by `collection(handle:)` in some
> versions) and the `ProductUpdateInput` argument name (an older `input:
> ProductInput` is deprecated but still accepted). Task 8 settles both against
> a real store before anything ships.

---

### Task 5: SKILL.md — the propose phase

**Files:**
- Create: `skills/product-listing-writer/SKILL.md`

- [ ] **Step 1: Write the frontmatter and the propose phase**

````markdown
---
name: product-listing-writer
description: Write Shopify product copy in the store's own voice — titles, descriptions, SEO title and description, and image alt text — as an editable proposal file, then apply exactly what you left in it. Use when the user wants product listings written or rewritten, better product descriptions, SEO texts for products, alt text for product images, or asks to apply a listing proposal.
---

# Product listing writer

Two phases, and they never run in one breath. **Propose** reads the store and
writes a file you edit. **Apply** writes to the store, and only the fields you
left in that file that nobody touched in the admin meanwhile.

**Two kinds of path, do not mix them up.** Files belonging to this plugin —
`shared/*.md`, `queries/`, `mutations/`, `scripts/` — live under
`$CLAUDE_PLUGIN_ROOT`. The store profile and the proposals (`.storehand/`) live
in the user's working directory. If `$CLAUDE_PLUGIN_ROOT` is empty, say so and
stop; do not guess a path.

Read `$CLAUDE_PLUGIN_ROOT/shared/safety.md` and
`$CLAUDE_PLUGIN_ROOT/shared/store-profile.md` before you start.

## Which phase am I in

- The user named products, a collection or a tag → **propose** (Steps 1–5).
- The user said "apply", "doorvoeren", or pointed at a proposal file →
  **apply** (Steps 6–10).
- Neither is clear → ask. Never guess your way into a write.

## Step 1 — Load the profile

Read `.storehand/store.yaml`: you need `store`. Read `.storehand/store.md` in
full — that is the brand voice, and it is the only source for how the copy
should sound. No `.storehand/`? Point the user at `storehand-setup` and stop.

If `store.md` says nothing about voice, audience or house style, **ask before
writing a word.** Copy invented from a blank profile is copy in your voice, not
the store's, and the owner will have to rewrite all of it.

## Step 2 — Resolve the products

Check `$CLAUDE_PLUGIN_ROOT/shared/api-version.md`; if it names a pinned version,
pass `--version <handle>` on every call. All calls in this phase are read-only —
**never add `--allow-mutations`**. Write variables to files, never inline:

```bash
V="$(mktemp -d)"
```

Shell state does not survive between tool calls. Set `V` again in every call
below, or pick one fixed scratch path and reuse it.

Named handles — one query, quoting each handle:

```bash
printf '%s' '{"query":"handle:linnen-blazer OR handle:wollen-jas","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-handle.graphql" \
  --variable-file "$V/vars.json"
```

A collection:

```bash
printf '%s' '{"handle":"nieuw-binnen","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-collection.graphql" \
  --variable-file "$V/vars.json"
```

A tag:

```bash
printf '%s' '{"query":"tag:zomer","first":50}' > "$V/vars.json"
shopify store execute --store <store> --json \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/queries/products-by-tag.graphql" \
  --variable-file "$V/vars.json"
```

Progress lines and the CLI's error box both go to stderr while stdout stays
empty on failure. `2>/dev/null` therefore hides errors, not noise. Check the
exit code, and treat empty stdout as a failed call, never as "no products".

**Re-check what came back.** Per `shared/safety.md`, the Admin API silently
ignores search terms it does not recognise: a misspelled handle returns the
whole catalogue. Drop every returned product whose `handle` is not one you
asked for, and if any asked-for handle is missing from the result, name it —
do not quietly write copy for 40 products when the user named 2.

If `pageInfo.hasNextPage` is true, say the selection was truncated and stop
rather than proposing a partial set. Do not paginate.

## Step 3 — Confirm the scope before writing anything

Say how many products you resolved and name them. Above 20, say the number and
ask whether to continue — a proposal file nobody reads to the end is a file
that gets applied unread.

## Step 4 — Write the copy

For each product, write a proposal for **only** the fields that need one:

| Field | Write one when |
|---|---|
| `title` | The current title is a bare SKU, a duplicate, or says nothing a buyer searches for. A good title is rarely worth touching — say so and leave it |
| `description` | The description is empty, or is spec-dump prose with no reason to buy. Output HTML, because the field is `descriptionHtml` |
| `seo.title` | Empty, or a copy of the product title beyond ~60 characters |
| `seo.description` | Empty, or over ~155 characters, or it repeats the title |
| `image.alt` | Empty or null. One proposal per `MediaImage` node, each with its own media id |

Rules for the copy itself:

- The voice comes from `store.md`. Not your defaults, not "premium quality".
- **Never invent a fact.** No material, no measurement, no origin, no care
  instruction that is not already in the product data. If the description needs
  a fact you do not have, leave a plain `[?]` in the text and say in the report
  which products carry one. A confident invented fabric composition is a returns
  problem and a legal one.
- Write in the language the existing listings are in.
- Do not propose a field whose current value is already good. An unchanged
  proposal is noise in a file the owner has to read line by line.

If `media.pageInfo.hasNextPage` is true for a product, say that product has more
images than were fetched and that its alt-text proposals cover only the first 10.

## Step 5 — Render the proposal

Build the JSON the renderer expects — `store`, `createdAt` (now, ISO 8601 UTC),
`apiVersion` (the pinned handle, or `none`), and `products` with `handle`, `id`
and the `fields` you wrote. `current` is the live value exactly as it came back
(empty string when null); `proposed` is your text. For `image.alt`, include the
`mediaId`.

```bash
mkdir -p .storehand/proposals
node --input-type=module -e '
  import { renderProposal } from "'"$CLAUDE_PLUGIN_ROOT"'/skills/product-listing-writer/scripts/proposal.mjs";
  import fs from "node:fs";
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  fs.writeFileSync(process.argv[2], renderProposal(source));
' "$V/source.json" ".storehand/proposals/$(date -u +%Y-%m-%d-%H%M)-listings.md"
```

Then tell the user, in this shape:

1. One line: how many products, how many fields, where the file is.
2. Which products carry a `[?]` and what fact is missing.
3. Anything you deliberately left alone, and why.
4. The exact next command — and that nothing has been written to the store yet.

Never read the proposal back to the user in the chat. The file is the artefact;
a wall of copy in the terminal is how it gets approved unread.
````

- [ ] **Step 2: Check the validator accepts the skill so far**

Run: `npm run validate`
Expected: `StoreHand plugin is valid.` — it resolves every `$CLAUDE_PLUGIN_ROOT`
path in the skill, so a typo in a query path fails here.

- [ ] **Step 3: Commit**

```bash
git add skills/product-listing-writer/SKILL.md
git commit -m "feat: product-listing-writer, propose phase"
```

---

### Task 6: SKILL.md — the apply phase and the errors table

**Files:**
- Modify: `skills/product-listing-writer/SKILL.md`

- [ ] **Step 1: Append the apply phase**

````markdown
## Step 6 — Read the proposal back

Read `.storehand/store.yaml` for `store`, then parse the file the user pointed
at (default: the newest in `.storehand/proposals/`).

```bash
node --input-type=module -e '
  import { parseProposal } from "'"$CLAUDE_PLUGIN_ROOT"'/skills/product-listing-writer/scripts/proposal.mjs";
  import fs from "node:fs";
  console.log(JSON.stringify(parseProposal(fs.readFileSync(process.argv[1], "utf8")), null, 2));
' ".storehand/proposals/<file>.md" > "$V/proposal.json"
```

If the parser throws, **stop**. Show the message literally — it names the
product and the field — and ask the user to fix that spot. Never apply the part
of a file you could read: a proposal you half understand is a store you half
rewrite.

Check `store` in the file against `store.yaml`. Different? Stop and say so.

## Step 7 — Re-fetch the live values

Read-only, no `--allow-mutations` yet. Same query as Step 2, on exactly the
handles in the proposal.

Build `$V/live.json` in the shape `plan-apply.mjs` expects — one entry per
product, `values` keyed by the same field names the proposal uses:

```json
{ "products": [
  { "id": "gid://shopify/Product/PRODUCT_ID", "handle": "linnen-blazer",
    "values": { "title": "…", "description": "…", "seo.title": "…", "seo.description": "…" },
    "media": [ { "id": "gid://shopify/MediaImage/MEDIA_ID", "alt": "" } ] } ] }
```

`description` here is the **`descriptionHtml`** value, because that is what the
proposal recorded and what will be written back. A field the query did not
return must be left out, not filled with `""` — a missing value is a conflict,
and `plan-apply.mjs` treats it as one.

If the re-fetch fails for any product, stop. Applying to the products that did
answer leaves the owner with a half-applied proposal and no record of which half.

## Step 8 — Decide what may be written

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/scripts/plan-apply.mjs" \
  ".storehand/proposals/<file>.md" "$V/live.json" > "$V/plan.json"
```

Read the JSON. Then show the user, before touching anything:

- **apply** — per product, which fields and the new values, shortened to one
  line each.
- **skipped** with `changed-in-admin` — name the field, what the proposal
  recorded and what is there now. This is the mechanism working, not an error.
- **skipped** with `media-gone` or `not-measured` — say which and why.
- **unchanged** and **missing** — counts, and name the missing handles.

Then ask for approval, in the words of `shared/safety.md`: one approval covers
this change set and nothing else. If `plan.apply` is empty, say so and stop —
there is nothing to approve.

## Step 9 — Write

Only after an explicit yes. This is the one place in StoreHand that passes
`--allow-mutations`, and it needs the `write_products` scope; a store connected
with the read-only scopes will get ACCESS_DENIED here (see the Errors table).

Per product in `plan.apply`, when `productInput` is not empty:

```bash
printf '%s' '{"product":{"id":"gid://shopify/Product/PRODUCT_ID","title":"…"}}' > "$V/m.json"
shopify store execute --store <store> --json --allow-mutations \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/mutations/product-update.graphql" \
  --variable-file "$V/m.json"
```

The `product` variable is the entry's `productInput` with `"id"` added.

Per product with a non-empty `files`, one call for all of its images:

```bash
printf '%s' '{"files":[{"id":"gid://shopify/MediaImage/MEDIA_ID","alt":"…"}]}' > "$V/f.json"
shopify store execute --store <store> --json --allow-mutations \
  --query-file "$CLAUDE_PLUGIN_ROOT/skills/product-listing-writer/mutations/file-update.graphql" \
  --variable-file "$V/f.json"
```

**Read `userErrors` on every response.** A mutation that returns HTTP 200 with a
populated `userErrors` array wrote nothing. Treat it as a failure for that
product, report it, and keep going with the rest — then say at the end exactly
which products succeeded and which did not.

Go product by product. Never batch across products: when one fails you must
still be able to say precisely where the run stopped.

## Step 10 — Report

1. One line: how many products written, how many fields, how many skipped.
2. Per written product, the fields that changed.
3. The skipped list again, because it is what the owner needs to act on — a
   `changed-in-admin` field is still waiting for a decision.
4. Where the proposal file is, and that it was **not** modified: re-running
   apply on the same file is safe and will report everything as `unchanged`.

Do not write `.storehand/state.json`. This skill keeps no memory between runs —
the proposal file is the record.

## Errors — never report a write you did not make

| Situation | What to do |
|---|---|
| `shopify` not found or older than 4.5 | Show the install or `shopify upgrade` step, stop |
| Not authenticated / token expired | Show the auth line from `storehand-setup`, stop |
| ACCESS_DENIED on the mutation | The store is connected read-only. Show `shopify store auth --store <store> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation,write_products` and stop. Never retry without it |
| The parser refuses the proposal | Show the message literally, stop, change nothing |
| `store` in the proposal ≠ `store.yaml` | Stop — this proposal belongs to another store |
| Re-fetch fails for any product | Stop before writing anything |
| `userErrors` non-empty | That product was not written. Report it and continue with the rest |
| A field does not exist (API version drift) | Show the error, name the query file, point at `$CLAUDE_PLUGIN_ROOT/shared/api-version.md` |
| `$CLAUDE_PLUGIN_ROOT` is empty | Stop; never guess where plugin files are |

A store that was not written and a store that was written wrong look identical
in a report that hides errors. Never let them.
````

- [ ] **Step 2: Run the whole check suite**

Run: `npm run check`
Expected: secret scan clean, all tests pass, `StoreHand plugin is valid.`

- [ ] **Step 3: Commit**

```bash
git add skills/product-listing-writer/SKILL.md
git commit -m "feat: product-listing-writer, apply phase"
```

---

### Task 7: The write scope, and saying so out loud

`write_products` is the first scope StoreHand asks for that can change a store.
It is opt-in and it is named everywhere the read-only promise is made.

**Files:**
- Modify: `skills/storehand-setup/SKILL.md`
- Modify: `README.md`
- Modify: `shared/safety.md`

- [ ] **Step 1: Add the opt-in auth line to the setup skill**

In `skills/storehand-setup/SKILL.md`, after the existing five-scope auth block,
add:

````markdown
### If you want the listing writer

`product-listing-writer` is the only skill that changes anything, and it needs
one extra scope. Leave it off and the other skills all still work — the listing
writer will then propose, and stop at the point of applying.

```
shopify store auth --store <domain> --scopes read_orders,read_products,read_inventory,read_discounts,read_online_store_navigation,write_products
```

Even with the scope granted, nothing is written without you approving that
specific change set: the proposal file exists so you see every word first.
````

- [ ] **Step 2: Update the README scope table**

In `README.md`, under `## What StoreHand may see`, add a row after
`read_online_store_navigation`:

```markdown
| `write_products` | **Optional, opt-in.** Only for `product-listing-writer`, and only to apply a proposal you have read and edited |
```

And change the sentence above the table from "Setup requests five **read-only**
scopes and nothing else" to:

```markdown
Setup requests five **read-only** scopes. A sixth, `write_products`, is offered
separately and only if you want the listing writer — every other skill works
without it.
```

- [ ] **Step 3: Add the proposal contract to shared/safety.md**

Append to `shared/safety.md`, after the "Never write without approval" section:

```markdown
## The proposal contract

A skill that writes does it in two phases with a file in between. The file
records, per field, the value that was live when the proposal was made.

At apply time the live value is compared against that record. Identical → the
field may be written. Anything else — changed, missing, unmeasured — is skipped
and reported, never overwritten and never guessed at.

Half a proposal is never applied. A proposal file that cannot be parsed in full
stops the run, because a file understood in part is a store rewritten in part.
```

- [ ] **Step 4: Verify the docs still validate**

Run: `npm run validate`
Expected: `StoreHand plugin is valid.` — it also checks relative markdown links
between docs, so a broken link added here fails.

- [ ] **Step 5: Commit**

```bash
git add skills/storehand-setup/SKILL.md README.md shared/safety.md
git commit -m "docs: opt-in write_products scope for the listing writer"
```

---

### Task 8: Run it against a real store

Nothing ships in StoreHand until it has run against a live shop and the evidence
is in `docs/dogfood/`. This task also settles the two unverified GraphQL shapes
flagged in Task 4.

**Files:**
- Create: `docs/dogfood/2026-08-03-product-listing-writer.md`
- Modify: whichever query or mutation file the live run proves wrong

- [ ] **Step 1: Verify the query shapes against the pinned version**

Against a real store, read-only, one at a time:

```bash
printf '%s' '{"query":"handle:<a-real-handle>","first":5}' > /tmp/v.json
shopify store execute --store your-store.myshopify.com --json --version 2026-07 \
  --query-file skills/product-listing-writer/queries/products-by-handle.graphql \
  --variable-file /tmp/v.json
```

Repeat for the collection and tag queries. If `collectionByHandle` errors as
undefined, replace it with `collection(handle: $handle)` in
`products-by-collection.graphql` and re-run until it returns.

- [ ] **Step 2: Verify the mutation argument name without writing anything**

A mutation with a deliberately empty input tells you whether the argument name
is right — the API rejects an unknown argument before it does any work:

```bash
printf '%s' '{"product":{"id":"gid://shopify/Product/<real-id>"}}' > /tmp/m.json
shopify store execute --store your-store.myshopify.com --json --version 2026-07 --allow-mutations \
  --query-file skills/product-listing-writer/mutations/product-update.graphql \
  --variable-file /tmp/m.json
```

An `id`-only `productUpdate` changes no field. If the response says `product` is
not a known argument, switch the mutation to `input: ProductInput!` and re-run.
Record which one the pinned version accepted.

- [ ] **Step 3: Run the full propose phase on two real products**

Use the skill as a user would. Read the generated file end to end and note
anything awkward about it — that note is the point of the dogfood doc.

- [ ] **Step 4: Edit the proposal, then apply it**

Change at least one `VOORSTEL` by hand before applying, so the run proves the
file is really the source of truth and not the conversation.

- [ ] **Step 5: Prove the conflict detection on a live store**

The test that matters most, because it is the promise on the tin:

1. Make a proposal for a product's `title`.
2. Change that same title **in the Shopify admin**, by hand.
3. Run apply.
4. Confirm the run skips that field with `changed-in-admin`, names both values,
   and still applies the product's other fields.

- [ ] **Step 6: Write the dogfood doc**

`docs/dogfood/2026-08-03-product-listing-writer.md`, following the shape of the
existing ones: the commands run, the real output, which GraphQL shapes the live
version accepted, and what was awkward. Anonymise the store — the existing docs
name no shop, no order and no amount, and this one must not either.

- [ ] **Step 7: Commit**

```bash
git add docs/dogfood/2026-08-03-product-listing-writer.md skills/product-listing-writer/
git commit -m "docs: dogfood run for the listing writer"
```

---

### Task 9: Ship it

**Files:**
- Modify: `README.md`
- Modify: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] **Step 1: Move the roadmap row**

In `README.md`, row 3 of the roadmap table: `Designed, in build` → `**Shipped**`.

- [ ] **Step 2: Add it to the skills table**

In `## Skills that ship today`, add:

```markdown
| `product-listing-writer` | Titles, descriptions, SEO fields and image alt text in your brand voice — proposed in a file you edit, applied only on a separate command | Yes — but only what you approved, and only with `write_products` |
```

Then change the paragraph under that table: it currently says none of the three
writes anything. It is now three read-only skills plus one that writes on
approval. Say exactly that.

- [ ] **Step 3: Bump the version in all three manifests**

`0.1.0` → `0.2.0` in `package.json`, `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`. All three must match.

- [ ] **Step 4: Full check and a packaging dry run**

```bash
npm run check
npm pack --dry-run
```

Expected: everything green, and the tarball listing now includes
`skills/product-listing-writer/` with its SKILL.md, `queries/`, `mutations/`
and `scripts/`. If the scripts or mutations are absent, `files` in
`package.json` needs the directory added.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json .claude-plugin/
git commit -m "feat: ship product-listing-writer as v0.2.0"
```

---

## Open points for the human

1. **Publishing to npm and merging is Steffano's hand.** This plan stops at
   commits on a branch.
2. **Task 8 needs a real store** and cannot be done by an agent without one.
   Steps 5 in particular requires an admin edit by hand.
3. The `[?]` convention in Step 4 of the propose phase is new. If it turns out
   to be annoying in the dogfood run, the alternative is refusing to write a
   description at all when facts are missing — decide from real use, not now.
