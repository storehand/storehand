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

const USER_AGENT = 'StoreHand health check (+https://github.com/storehand/storehand)';
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_URLS = 200;
const DEFAULT_CONCURRENCY = 4;

export async function checkUrl(base, url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const baseHost = new URL(base).host;
  let current = new URL(url, base).toString();
  const redirects = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
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
      const target = new URL(location, current);
      redirects.push(target.toString());
      if (target.pathname === '/password') {
        return { url, finalUrl: target.toString(), redirects, passwordPage: true };
      }
      if (target.host !== baseHost) {
        return { url, finalUrl: target.toString(), redirects, offDomain: true };
      }
      current = target.toString();
      continue;
    }
    return { url, finalUrl: current, redirects, status: response.status };
  }
  return { url, finalUrl: current, redirects, error: `more than ${MAX_REDIRECTS} redirects` };
}

export async function checkUrls({
  base, urls,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxUrls = DEFAULT_MAX_URLS,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  const list = urls.slice(0, maxUrls);
  const results = new Array(list.length);
  let next = 0;
  // Eén teller over meerdere workers is hier veilig: Node is single-threaded
  // en tussen lezen en ophogen van `next` zit geen await.
  async function worker() {
    while (next < list.length) {
      const index = next++;
      results[index] = await checkUrl(base, list[index], { timeoutMs });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) || 1 }, worker));
  return { base, checked: results, truncated: urls.length > list.length };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
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
  checkUrls(input).then((report) => {
    console.log(JSON.stringify(report, null, 2));
  });
}
