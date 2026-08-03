#!/usr/bin/env node
/*
 * Blocks sensitive data from reaching a public repository.
 *
 * Two kinds of leak matter here and they need different handling:
 *
 *   - Credentials (tokens, keys). Rare, catastrophic, easy to pattern-match.
 *   - Store identifiers (a real *.myshopify.com handle, a shop id, a customer's
 *     storefront domain). Harmless-looking, and the reason this script exists:
 *     a dogfood note named a real store and went public with it.
 *
 * Output is redacted by default. This runs in CI on a public repository, where
 * the job log is world-readable — a scanner that names the domain it found in
 * the file it found it in publishes exactly what it was meant to stop. Findings
 * carry rule, file and line only. Run locally with --reveal to see the value.
 *
 * Exits 1 and lists every finding; exits 0 when clean.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* Hostnames that are allowed to appear. Everything else with a real TLD is a
 * finding — an allowlist, because the thing we are guarding against is a domain
 * nobody thought to add to a blocklist. */
const ALLOWED_HOSTS = new Set([
  'apache.org',
  'www.apache.org',
  // StoreHand's own hosts. The rule guards against a *store's* or a customer's
  // domain slipping into the repo; our own project addresses are the whole
  // point of publishing it.
  'storehand.github.io',
  'getstorehand.com',
  'www.getstorehand.com',
  'github.com',
  'docs.github.com',
  // GitHub's asset host: the only way a README image renders both on GitHub
  // and on npm, where relative paths into `assets/` are not shipped.
  'raw.githubusercontent.com',
  // Required by every SVG file ever written — it is the namespace declaration,
  // not a link to anywhere. Without this, adding any artwork trips the scan.
  'www.w3.org',
  // Badge images in the README. A static badge CDN, never a store domain.
  'img.shields.io',
  'shopify.com',
  'shopify.dev',
  'help.shopify.com',
  'npmjs.com',
  'www.npmjs.com',
  'claude.com',
  'docs.claude.com',
  'anthropic.com',
  'example.com',
  'www.example.com',
  'example.org',
  'store.example',
  'myshopify.com',
  'localhost',
]);

/* Placeholder store handles that are meant to be in the docs. Anything else
 * ending in .myshopify.com is a real store. */
const PLACEHOLDER_STORE_LABELS = new Set([
  'your-store',
  'my-store',
  'store',
  'shop',
  'example',
  'example-store',
  '<store>',
  '*',
]);

const ALLOWED_EMAIL_PATTERNS = [
  /@users\.noreply\.github\.com$/,
  /@example\.(com|org)$/,
  /^noreply@/,
];

/* Only real TLDs, so that code like `import.meta.url` or `check-urls.test.mjs`
 * is not mistaken for a hostname. */
const TLD = '(?:com|net|org|io|dev|app|co|nl|be|de|fr|es|it|uk|eu|shop|store|online|info|biz)';

const RULES = [
  {
    id: 'shopify-token',
    description: 'Shopify access, storefront, private-app or refresh token',
    pattern: /\bshp(?:at|ss|pa|ca|rt)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'github-token',
    description: 'GitHub personal access token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    id: 'aws-key',
    description: 'AWS access key id',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'private-key',
    description: 'PEM private key block',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'generic-secret-assignment',
    description: 'A secret-looking value assigned to a secret-looking name',
    pattern:
      /\b(?:api[_-]?key|secret|passwd|password|client[_-]?secret|auth[_-]?token|access[_-]?token)\b\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}["']?/gi,
  },
  {
    id: 'store-handle',
    description: 'Real *.myshopify.com store handle',
    pattern: /([A-Za-z0-9<>*][A-Za-z0-9<>*-]*)\.myshopify\.com\b/g,
    /* Placeholders are written several ways — <store>, *, your-store. Strip the
     * punctuation before deciding, so `<store>` is not read as the label
     * `store>` and reported as a real handle. */
    allow: (match) => {
      const label = match[1].toLowerCase().replace(/[<>*]/g, '');
      /* Nothing left after stripping means the label was pure punctuation
       * (`*.myshopify.com`) — a wildcard, not somebody's store. */
      return label === '' || PLACEHOLDER_STORE_LABELS.has(label);
    },
  },
  {
    id: 'shop-id',
    description: 'Numeric Shopify shop id in a URL',
    pattern: /shopify\.com\/\d{6,}/g,
  },
  {
    id: 'shopify-gid',
    description: 'Shopify global id of a real object',
    pattern: /gid:\/\/shopify\/[A-Za-z]+\/\d+/g,
  },
  {
    id: 'email',
    description: 'Email address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    allow: (match) => ALLOWED_EMAIL_PATTERNS.some((allowed) => allowed.test(match[0])),
  },
  {
    id: 'iban',
    description: 'Bank account number (IBAN)',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b/g,
  },
  {
    id: 'network-address',
    description: 'IP address — someone\'s machine, VPN node or private network',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    allow: (match) => {
      const ip = match[0];
      const octets = ip.split('.').map(Number);
      if (octets.some((o) => o > 255)) return true; /* a version number, not an address */
      /* Loopback is documentation, not disclosure: the Shopify CLI's callback
       * is 127.0.0.1 for every user on earth. Everything else — a LAN address,
       * a VPN node, a public host — names a real machine. */
      return octets[0] === 127 || ip === '0.0.0.0';
    },
  },
  {
    id: 'ssh-target',
    description: 'SSH target naming a real host or user',
    /* Anything user@host on a line that runs ssh. Deliberately not
     * `ssh <flags> user@host`: real invocations carry flags with arguments
     * (`-L 13387:127.0.0.1:13387`) and a tighter pattern silently matches
     * nothing at all on exactly the lines that matter. */
    pattern: /\bssh\b[^\n]*?\b([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)/g,
    allow: (match) => {
      const user = match[1].toLowerCase();
      const host = match[2].toLowerCase();
      const placeholders = new Set(['user', 'youruser', 'your-user', 'me', 'username']);
      const hostPlaceholders = new Set(['your-server', 'host', 'your-host', 'server', 'example.com']);
      return placeholders.has(user) && hostPlaceholders.has(host);
    },
  },
  {
    id: 'unknown-host',
    description: 'Hostname that is not on the allowlist — a real store or customer domain?',
    pattern: new RegExp(String.raw`\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+${TLD}\b`, 'gi'),
    allow: (match) => {
      const host = match[0].toLowerCase();
      if (ALLOWED_HOSTS.has(host)) return true;
      /* A subdomain of an allowed host is allowed: docs.shopify.dev rides on
       * shopify.dev. Matching on the suffix boundary, not on `includes`. */
      for (const allowed of ALLOWED_HOSTS) {
        if (host.endsWith(`.${allowed}`)) return true;
      }
      /* store-handle already reports real myshopify handles; do not double-report. */
      return host.endsWith('.myshopify.com');
    },
  },
];

/* Paths that must never be committed at all, whatever is in them. */
const FORBIDDEN_PATHS = [
  { id: 'store-profile', pattern: /(^|\/)\.storehand\// , description: 'A store profile belongs in the user working directory, never in the repo' },
  { id: 'env-file', pattern: /(^|\/)\.env(\.|$)/, description: 'Environment file' },
  { id: 'cli-session', pattern: /shopify-cli.*config\.json$/, description: 'Shopify CLI session file' },
];

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', '.cache']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.mp4']);

/** Masks a value so a finding can be reported without republishing it. */
export function mask(value) {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}

/**
 * Scans one file's text. Returns findings as
 * { rule, description, line, value } — callers decide whether to reveal value.
 * A line ending in `storehand-allow-secret: <rule>[, <rule>…]` is exempt for
 * those rules only, so a documented example can stay without switching the
 * whole scanner off. Naming each rule keeps the exemption narrow: a line
 * excused for `store-handle` still gets checked for tokens.
 */
export function scanText(text, rules = RULES) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const exemption = /storehand-allow-secret:\s*([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*$/.exec(line);
    const excused = new Set(exemption ? exemption[1].split(',').map((r) => r.trim()) : []);
    for (const rule of rules) {
      if (excused.has(rule.id)) continue;
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        if (rule.allow && rule.allow(match)) continue;
        findings.push({
          rule: rule.id,
          description: rule.description,
          line: index + 1,
          value: match[0],
        });
      }
    }
  });
  return findings;
}

/** Files git would publish. Falls back to a walk when git is unavailable. */
export function listFiles(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean);
  } catch {
    const found = [];
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
        else found.push(rel);
      }
    };
    walk(root, '');
    return found;
  }
}

/** Scans a working tree. Returns { file, rule, description, line, value }[]. */
export function scanRepo(root = '.', files = listFiles(root)) {
  const findings = [];
  for (const file of files) {
    for (const forbidden of FORBIDDEN_PATHS) {
      if (forbidden.pattern.test(file)) {
        findings.push({ file, rule: forbidden.id, description: forbidden.description, line: 0, value: file });
      }
    }
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const absolute = path.join(root, file);
    let text;
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    for (const finding of scanText(text)) findings.push({ file, ...finding });
  }
  return findings;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const reveal = args.includes('--reveal');
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const findings = scanRepo(root);
  if (findings.length === 0) {
    console.log('No sensitive data found.');
  } else {
    console.error(`Sensitive data found — ${findings.length} finding(s):`);
    for (const f of findings) {
      const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
      const shown = reveal ? f.value : mask(f.value);
      console.error(`  - [${f.rule}] ${where} — ${f.description} (${shown})`);
    }
    if (!reveal) {
      console.error('\nValues are masked: this log may be public. Run locally with --reveal to see them.');
    }
    console.error('If a match is a deliberate example, end that line with: storehand-allow-secret: <rule-id>');
    process.exit(1);
  }
}
