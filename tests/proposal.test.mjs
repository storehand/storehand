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

test('a value containing a line that is exactly `~~~` survives the round trip intact', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: '<p>een</p>\n~~~\n<p>twee</p>' }] }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields[0].proposed, '<p>een</p>\n~~~\n<p>twee</p>');
});

test('a value containing a line of `~~~~~` survives the round trip intact', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: '<p>een</p>\n~~~~~\n<p>twee</p>' }] }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields[0].proposed, '<p>een</p>\n~~~~~\n<p>twee</p>');
});

test('an inline run of ~~~ in the middle of a sentence does not escalate the fence', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: 'Use ~~~ inline like this.' }] }],
  };
  const text = renderProposal(source);
  assert.match(text, /VOORSTEL\n~~~\nUse ~~~ inline like this\.\n~~~/);
  const back = parseProposal(text);
  assert.equal(back.products[0].fields[0].proposed, 'Use ~~~ inline like this.');
});

test('an ordinary value renders with the plain three-tilde fence, no gratuitous escalation', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'title', current: 'a', proposed: 'b' }] }],
  });
  assert.match(text, /HUIDIG\n~~~\na\n~~~/);
  assert.match(text, /VOORSTEL\n~~~\nb\n~~~/);
});

test('a duplicated field block under one product is refused, naming the handle and the field', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'a', proposed: 'b' },
        { name: 'title', current: 'c', proposed: 'd' },
      ] }],
  });
  assert.throws(() => parseProposal(text), /title.*\bx\b|\bx\b.*title/);
});

test('a duplicate is refused even when the first occurrence was emptied and never applied', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'a', proposed: '' },
        { name: 'title', current: 'a', proposed: 'b' },
      ] }],
  });
  assert.throws(() => parseProposal(text), /title.*\bx\b|\bx\b.*title/);
});

test('a duplicated product heading (same handle twice) is refused, naming the handle', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [
      { handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID', fields: [{ name: 'title', current: 'a', proposed: 'b' }] },
      { handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID_2', fields: [{ name: 'title', current: 'c', proposed: 'd' }] },
    ],
  });
  assert.throws(() => parseProposal(text), /\bx\b/);
});

test('two different handles pointing at the same product gid are refused, naming the gid', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [
      { handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID', fields: [{ name: 'title', current: 'a', proposed: 'b' }] },
      { handle: 'y', id: 'gid://shopify/Product/PRODUCT_ID', fields: [{ name: 'title', current: 'c', proposed: 'd' }] },
    ],
  });
  assert.throws(() => parseProposal(text), /PRODUCT_ID/);
});

// A shop owner types a `~~~` divider (or pastes a snippet containing one)
// straight into VOORSTEL, exactly where the preamble tells them to edit — no
// tampering with the fence delimiter needed. fenceFor already ran when Claude
// rendered the file, so it cannot react to text the human adds afterwards.

test('a VOORSTEL value containing a bare ~~~ line is refused, naming the product and the field', () => {
  const text = `# StoreHand listing proposal

- store: \`your-store.myshopify.com\`
- created: \`t\`
- api-version: \`v\`

---

## x

<!-- product: gid://shopify/Product/PRODUCT_ID -->

### description

HUIDIG
~~~
~~~

VOORSTEL
~~~
<p>Eerste deel</p>
~~~
<p>Tweede deel</p>
~~~
`;
  assert.throws(() => parseProposal(text), /description.*\bx\b|\bx\b.*description/);
});

test('a VOORSTEL value containing a ~~~~~ line is refused the same way', () => {
  const text = `# StoreHand listing proposal

- store: \`your-store.myshopify.com\`
- created: \`t\`
- api-version: \`v\`

---

## x

<!-- product: gid://shopify/Product/PRODUCT_ID -->

### description

HUIDIG
~~~
~~~

VOORSTEL
~~~~~
<p>Eerste deel</p>
~~~~~
<p>Tweede deel</p>
~~~~~
`;
  assert.throws(() => parseProposal(text), /description.*\bx\b|\bx\b.*description/);
});

test('the equivalent inside HUIDIG is already refused — pinned down so it cannot regress', () => {
  const text = `# StoreHand listing proposal

- store: \`your-store.myshopify.com\`
- created: \`t\`
- api-version: \`v\`

---

## x

<!-- product: gid://shopify/Product/PRODUCT_ID -->

### description

HUIDIG
~~~
<p>Eerste deel</p>
~~~
<p>Tweede deel</p>
~~~

VOORSTEL
~~~
nieuw
~~~
`;
  assert.throws(() => parseProposal(text), /VOORSTEL/);
});

test('an inline ~~~ mid-sentence in VOORSTEL is still accepted and untouched', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: 'Use ~~~ inline like this, not alone on a line.' }] }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields[0].proposed, 'Use ~~~ inline like this, not alone on a line.');
});

test('an ordinary multi-line value with no tildes at all still round-trips unchanged', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: '<p>Regel een</p>\n<p>Regel twee</p>\n<p>Regel drie</p>' }] }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields[0].proposed, '<p>Regel een</p>\n<p>Regel twee</p>\n<p>Regel drie</p>');
});

test('two image.alt blocks with different media ids on one product both parse, one photo each', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Voorkant' },
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID_2', current: '', proposed: 'Achterkant' },
      ] }],
  };
  const back = parseProposal(renderProposal(source));
  assert.equal(back.products[0].fields.length, 2);
  assert.deepEqual(back.products[0].fields, source.products[0].fields);
});

test('two image.alt blocks with the same media id are refused, naming the media id', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Voorkant' },
        { name: 'image.alt', mediaId: 'gid://shopify/MediaImage/MEDIA_ID', current: '', proposed: 'Nog een keer' },
      ] }],
  });
  assert.throws(() => parseProposal(text), /MEDIA_ID/);
});

test('a duplicated non-alt field is still refused, as before', () => {
  const text = renderProposal({
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [
        { name: 'title', current: 'a', proposed: 'b' },
        { name: 'title', current: 'c', proposed: 'd' },
      ] }],
  });
  assert.throws(() => parseProposal(text), /title.*\bx\b|\bx\b.*title/);
});

test('a refused value cut in half by a tilde line says so, and says nothing else', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID',
      fields: [{ name: 'description', current: '', proposed: '<p>Eerste deel</p>' }] }],
  };
  const edited = renderProposal(source)
    .replace('<p>Eerste deel</p>', '<p>Eerste deel</p>\n~~~\n<p>Tweede deel</p>');
  assert.throws(() => parseProposal(edited), /line of only tildes/);
});

test('a stray note between two fields is refused without blaming tildes that are not there', () => {
  const source = {
    store: 'your-store.myshopify.com', createdAt: 't', apiVersion: 'v',
    products: [{ handle: 'x', id: 'gid://shopify/Product/PRODUCT_ID', fields: [
      { name: 'title', current: 'a', proposed: 'b' },
      { name: 'description', current: 'c', proposed: 'd' },
    ] }],
  };
  const edited = renderProposal(source)
    .replace('\n### description', '\n(nog even nakijken met marketing)\n\n### description');
  assert.throws(() => parseProposal(edited), (error) => {
    assert.match(error.message, /unexpected text after the VOORSTEL block/);
    assert.match(error.message, /nog even nakijken met marketing/);
    assert.doesNotMatch(error.message, /tilde/);
    return true;
  });
});
