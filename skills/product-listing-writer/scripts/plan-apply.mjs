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

      // liveProduct.values may be entirely absent (a partial or failed fetch),
      // not just missing the one key — optional chaining covers both, and
      // either way an unmeasured field must never read as a match.
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
