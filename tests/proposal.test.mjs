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
