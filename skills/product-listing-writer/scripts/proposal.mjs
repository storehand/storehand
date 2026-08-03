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
 * This can still close early: `fenceFor` only sees the value at render time,
 * so it cannot react to a `~~~` divider (or a pasted snippet containing one)
 * the shop owner later types straight into VOORSTEL — no tampering with the
 * delimiter line required, just editing the text the preamble tells them to
 * edit. `readBlock` alone cannot tell early-close-with-leftovers apart from a
 * clean close, since both look identical from here: a value, then a matching
 * fence line. What makes it detectable is what comes *after* — a real close
 * is always followed by the next literal token the format expects (VOORSTEL
 * after HUIDIG, a heading after VOORSTEL), while a false close leaves the
 * rest of the value sitting where that token should be. HUIDIG gets this for
 * free, because `readBlock`'s own next call demands the literal "VOORSTEL" —
 * leftover content practically never matches that. VOORSTEL has no such
 * built-in next call, so its caller checks explicitly for a boundary; see
 * that check in `parseProposal`.
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
  // Tracks every field's dedupe key seen for the current product (see
  // `dedupeKey` below), independent of `product.fields` — a duplicate is a
  // document error even when the first occurrence was emptied and so never
  // made it into `fields`.
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

      let mediaId;
      let cursor = i + 1;
      if (name === 'image.alt') {
        while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
        const comment = lines[cursor]?.match(/<!-- media: (\S+) -->/);
        if (!comment) fail(`${where}: no media gid comment — StoreHand cannot tell which image to update`);
        mediaId = comment[1];
        cursor += 1;
      }

      // A product can carry up to ten photos, one alt proposal each, so
      // image.alt is keyed by field name *and* media id — two different
      // images are two different fields. Every other field name is unique
      // per product, so the name alone is the key. Either way, two blocks
      // for the same key leave no unambiguous way to pick a winner.
      const dedupeKey = mediaId ? `${name}:${mediaId}` : name;
      if (seenFields.has(dedupeKey)) {
        const detail = mediaId ? ` for media "${mediaId}"` : '';
        fail(`${where}: "${name}"${detail} appears twice for product "${product.handle}"`);
      }
      seenFields.add(dedupeKey);

      const [current, afterCurrent] = readBlock(lines, cursor, 'HUIDIG', where);
      const [proposed, afterProposed] = readBlock(lines, afterCurrent, 'VOORSTEL', where);

      // A clean VOORSTEL close is always followed by blank lines and then the
      // next heading, or the end of the file. Anything else means the fence
      // closed somewhere the format does not allow — almost certainly because
      // the value itself contains a line of only `~` that matched the opening
      // fence, and the rest of the value fell out here as stray text that the
      // main loop would otherwise silently step over.
      let boundary = afterProposed;
      while (boundary < lines.length && lines[boundary].trim() === '') boundary += 1;
      if (boundary < lines.length && !/^(?:## |### )/.test(lines[boundary])) {
        fail(`${where}: VOORSTEL closed somewhere the format does not allow — the value likely contains a line of tildes that was mistaken for the closing fence`);
      }

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
