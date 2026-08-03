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
