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

test('a live null and a recorded empty string count as a match, and the field is applied', () => {
  const plan = planApply(
    proposal([{ name: 'seo.description', current: '', proposed: 'Ongevoerde linnen blazer.' }]),
    live({ 'seo.description': null }),
  );
  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.apply[0].productInput, { seo: { description: 'Ongevoerde linnen blazer.' } });
});

test('a live null where the proposal recorded actual text is still changed-in-admin', () => {
  const plan = planApply(
    proposal([{ name: 'seo.description', current: 'Al ingevuld', proposed: 'Nieuwe tekst' }]),
    live({ 'seo.description': null }),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.skipped, [{
    handle: 'linnen-blazer', field: 'seo.description', reason: 'changed-in-admin',
    wasInProposal: 'Al ingevuld', isNow: null,
  }]);
});

test('an image.alt that is null on live media and empty string in the proposal is applied', () => {
  const plan = planApply(
    proposal([{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Alt' }]),
    live({}, [{ id: 'gid://shopify/MediaImage/MEDIA_ID', alt: null }]),
  );
  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.apply[0].files, [{ id: 'gid://shopify/MediaImage/MEDIA_ID', alt: 'Alt' }]);
});

test('a media object with no alt key at all reports not-measured, not a match', () => {
  const plan = planApply(
    proposal([{ name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Alt' }]),
    live({}, [{ id: 'gid://shopify/MediaImage/MEDIA_ID' }]),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.skipped, [{
    handle: 'linnen-blazer', field: 'image.alt', reason: 'not-measured',
    wasInProposal: '', isNow: null,
  }]);
});

test('a field genuinely absent from values still reports not-measured', () => {
  const plan = planApply(
    proposal([{ name: 'title', current: 'Oud', proposed: 'Nieuw' }]),
    live({}),
  );
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(plan.skipped, [{
    handle: 'linnen-blazer', field: 'title', reason: 'not-measured',
    wasInProposal: 'Oud', isNow: null,
  }]);
});
