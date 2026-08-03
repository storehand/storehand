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
