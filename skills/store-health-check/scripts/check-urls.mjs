#!/usr/bin/env node
/*
 * Checks a list of storefront URLs and reports what each one really returns.
 * Redirects are followed by hand (max 5) so two Shopify cases can be flagged
 * instead of silently followed: a redirect to /password (store is locked) and
 * a redirect off the store's own domain. Read-only: GET with a StoreHand
 * User-Agent, small concurrency, per-request timeout, hard cap on the list.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'StoreHand health check (+https://github.com/storehand/storehand)';
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_URLS = 200;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const MAX_PROBE_FAMILIES = 3;
const NOT_FOUND_STATUSES = new Set([404, 410]);

export async function checkUrl(base, url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let baseHost;
  try {
    baseHost = new URL(base).host;
  } catch {
    return { url, finalUrl: null, redirects: [], error: `invalid base url: ${base}` };
  }
  let current;
  try {
    current = new URL(url, base).toString();
  } catch {
    return { url, finalUrl: null, redirects: [], error: `invalid url: ${url}` };
  }
  const redirects = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Non-HTTP schemes (mailto:, tel:, …) show up here because Shopify menu
    // URLs get fed into this script unfiltered. Skip instead of fetching —
    // a real fetch would just fail with a confusing "fetch failed" error.
    const scheme = new URL(current).protocol;
    if (scheme !== 'http:' && scheme !== 'https:') {
      return { url, finalUrl: current, redirects, skipped: true };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT },
      });
    } catch (error) {
      return {
        url, finalUrl: current, redirects,
        error: controller.signal.aborted ? 'timeout' : error.message,
      };
    } finally {
      clearTimeout(timer);
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      let target;
      try {
        target = new URL(location, current);
      } catch {
        await response.body?.cancel();
        return { url, finalUrl: current, redirects, error: `invalid redirect target: ${location}` };
      }
      redirects.push(target.toString());
      if (target.pathname === '/password') {
        await response.body?.cancel();
        return { url, finalUrl: target.toString(), redirects, passwordPage: true };
      }
      // Assumes `base` is the storefront's primary domain: a *.myshopify.com
      // base would make every URL "off-domain" via Shopify's canonical redirect.
      if (target.host !== baseHost) {
        await response.body?.cancel();
        return { url, finalUrl: target.toString(), redirects, offDomain: true };
      }
      current = target.toString();
      await response.body?.cancel();
      continue;
    }
    await response.body?.cancel();
    return { url, finalUrl: current, redirects, status: response.status };
  }
  return { url, finalUrl: current, redirects, error: `more than ${MAX_REDIRECTS} redirects` };
}

/*
 * Calibrates the check before trusting a single 200. A theme that renders its
 * "page not found" view with HTTP 200 (a soft 404) would make every URL pass,
 * and the report would say "no broken links" having measured nothing. So ask
 * the storefront for a page that cannot exist and see whether it says 404.
 *
 * One probe per URL family (the first path segment), because a theme can get
 * /products right and /pages wrong. Verdict is deliberately three-valued:
 * false only when every probe gave a real not-found, true when any family
 * answered 200, and null when a probe could not complete — an unreachable
 * probe is not a clean bill of health.
 */
function probeFamilies(urls) {
  const families = [];
  for (const url of urls) {
    let segment;
    try {
      segment = new URL(url, 'https://placeholder.invalid').pathname.split('/').filter(Boolean)[0];
    } catch {
      continue;
    }
    if (!segment || families.includes(segment)) continue;
    families.push(segment);
    if (families.length >= MAX_PROBE_FAMILIES) break;
  }
  return families;
}

export async function probeNotFound(base, urls, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const families = probeFamilies(urls);
  if (families.length === 0) {
    return { checked: [], soft404: null, soft404Families: [] };
  }
  const nonce = crypto.randomUUID().slice(0, 8);
  const checked = await Promise.all(families.map(async (family) => {
    const probePath = `/${family}/storehand-missing-probe-${nonce}`;
    const result = await checkUrl(base, probePath, { timeoutMs })
      .catch((error) => ({ error: error.message }));
    return { family, path: probePath, status: result.status, error: result.error };
  }));

  const soft404Families = checked.filter((p) => p.status === 200).map((p) => p.family);
  const allConclusive = checked.every((p) => p.status === 200 || NOT_FOUND_STATUSES.has(p.status));
  let soft404 = null;
  if (soft404Families.length > 0) soft404 = true;
  else if (allConclusive) soft404 = false;
  return { checked, soft404, soft404Families };
}

export async function checkUrls({
  base, urls,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxUrls = DEFAULT_MAX_URLS,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  const list = urls.slice(0, maxUrls);
  const results = new Array(list.length);
  const clampedConcurrency = Math.max(1, Math.min(concurrency, MAX_CONCURRENCY));
  let next = 0;
  // One shared counter across workers is safe here: Node is single-threaded
  // and there is no await between reading and incrementing `next`.
  async function worker() {
    while (next < list.length) {
      const index = next++;
      results[index] = await checkUrl(base, list[index], { timeoutMs })
        .catch((error) => ({ url: list[index], finalUrl: null, redirects: [], error: error.message }));
    }
  }
  const probe = await probeNotFound(base, list, { timeoutMs });
  await Promise.all(Array.from({ length: Math.min(clampedConcurrency, list.length) || 1 }, worker));
  return { base, checked: results, truncated: urls.length > list.length, probe };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('usage: node check-urls.mjs <input.json>');
    console.error('input: { "base": "https://…", "urls": ["/collections/x", …] }');
    process.exit(1);
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (error) {
    console.error(`could not read ${inputFile}: ${error.message}`);
    process.exit(1);
  }
  if (typeof input.base !== 'string' || !Array.isArray(input.urls)) {
    console.error('input must be an object with "base" (string) and "urls" (array)');
    process.exit(1);
  }
  try {
    new URL(input.base);
  } catch {
    console.error(`"base" is not a valid URL: ${input.base}`);
    process.exit(1);
  }
  checkUrls(input).then(
    (report) => console.log(JSON.stringify(report, null, 2)),
    (error) => { console.error(`check failed: ${error.message}`); process.exit(1); },
  );
}
