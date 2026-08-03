// tests/proposal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProposal, parseProposal } from '../skills/product-listing-writer/scripts/proposal.mjs';

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
