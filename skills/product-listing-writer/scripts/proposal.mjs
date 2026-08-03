// The proposal file format, in both directions. Render and parse live in one
// file on purpose: if they drift, a proposal StoreHand wrote becomes a proposal
// StoreHand cannot read back, and the apply phase refuses the whole file.

export const FIELD_NAMES = ['title', 'description', 'seo.title', 'seo.description', 'image.alt'];

const FENCE = '~~~';

const PREAMBLE = `Edit the text inside the VOORSTEL blocks. Delete a \`###\` field block to leave
that field alone. Do not touch the HUIDIG blocks — they are what protects your
admin edits.`;

/*
 * Markdown's own rule: a longer fence wins. A value line that is itself a run
 * of only `~` characters would otherwise be indistinguishable from the block's
 * closing fence — the parser would stop early and silently truncate the rest
 * of the value. So the fence is chosen per block: longer than any all-tilde
 * line the value contains, never shorter than FENCE.
 */
function fenceFor(value) {
  let longestRun = 0;
  for (const line of value === '' ? [] : value.split('\n')) {
    const trimmed = line.trim();
    if (/^~+$/.test(trimmed)) longestRun = Math.max(longestRun, trimmed.length);
  }
  return '~'.repeat(Math.max(FENCE.length, longestRun + 1));
}

function block(label, value) {
  const fence = fenceFor(value);
  return `${label}\n${fence}\n${value === '' ? '' : `${value}\n`}${fence}`;
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

class ProposalError extends Error {}

function fail(message) {
  throw new ProposalError(`proposal file: ${message}`);
}

const FENCE_LINE = /^~{3,}$/;

/**
 * Reads a `LABEL` line followed by a fence of three or more `~`. The opening
 * fence's exact length is what closes the block — never the constant FENCE —
 * so a shorter or longer run of `~` inside the value is ordinary content, not
 * a premature close. Returns [value, nextIndex].
 *
 * Residual, deliberately unfixed: this trusts the opening fence line itself,
 * not a recomputed one. A human who hand-shortens that exact line to a length
 * that collides with an all-tilde line already inside the value would still
 * get a silent early close — the fence escalation above only protects against
 * collisions the renderer itself could produce, not ones introduced by
 * editing the delimiter. Markdown's own code fences carry the identical edge
 * case; closing it needs escaping, which this format does not attempt.
 */
function readBlock(lines, start, label, where) {
  let i = start;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (lines[i]?.trim() !== label) fail(`${where}: expected a ${label} block`);
  i += 1;
  const openFence = lines[i]?.trim();
  if (!openFence || !FENCE_LINE.test(openFence)) {
    fail(`${where}: ${label} is not followed by a fence of three or more ~`);
  }
  i += 1;
  const value = [];
  while (i < lines.length && lines[i].trim() !== openFence) {
    value.push(lines[i]);
    i += 1;
  }
  if (i >= lines.length) fail(`${where}: unterminated ${label} block — no closing ${openFence}`);
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
  // Tracks every field name seen for the current product, independent of
  // `product.fields` — a duplicate is a document error even when the first
  // occurrence was emptied and so never made it into `fields`.
  let seenFields = null;
  // Tracks every handle and every product gid seen across the whole file. A
  // second block with the same handle, or a different handle pointing at the
  // same gid, is the same "no way to pick a winner" problem as a duplicate
  // field — just one level up, and worse, because it becomes two conflicting
  // writes to one store object.
  const seenHandles = new Set();
  const seenProductIds = new Set();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const isProduct = line.match(/^## (.+)$/);
    if (isProduct) {
      const handle = isProduct[1].trim();
      const gid = lines.slice(i + 1, i + 4).join('\n').match(/<!-- product: (\S+) -->/);
      if (!gid) fail(`product "${handle}": no product gid comment under the heading`);
      const productId = gid[1];
      if (seenHandles.has(handle)) {
        fail(`product "${handle}": this handle appears twice in the file`);
      }
      if (seenProductIds.has(productId)) {
        fail(`product "${handle}": its gid ${productId} already appears under a different heading`);
      }
      seenHandles.add(handle);
      seenProductIds.add(productId);
      product = { handle, id: productId, fields: [] };
      seenFields = new Set();
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
      // Two blocks for the same field leave no unambiguous way to pick a winner.
      if (seenFields.has(name)) {
        fail(`${where}: "${name}" appears twice for product "${product.handle}"`);
      }
      seenFields.add(name);

      let mediaId;
      let cursor = i + 1;
      if (name === 'image.alt') {
        while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
        const comment = lines[cursor]?.match(/<!-- media: (\S+) -->/);
        if (!comment) fail(`${where}: no media gid comment — StoreHand cannot tell which image to update`);
        mediaId = comment[1];
        cursor += 1;
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
