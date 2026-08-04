/*
 * The plugin-root snippet is copied into all four SKILL.md files, because a
 * skill has to be readable on its own. Copies drift, so these tests hold them
 * to one byte-identical version and then run that version for real.
 *
 * Background: shared/plugin-root.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.join(import.meta.dirname, '..');
const SKILLS = fs.readdirSync(path.join(REPO, 'skills'));

/** The one fenced bash block that starts by assigning ROOT, or null. */
function extractSnippet(markdown) {
  const match = /```bash\n(ROOT=\$\([\s\S]*?)```/.exec(markdown);
  return match ? match[1] : null;
}

function skillText(name) {
  return fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
}

test('every skill ships the plugin-root snippet', () => {
  assert.ok(SKILLS.length >= 4, 'expected at least four skills');
  for (const name of SKILLS) {
    assert.ok(extractSnippet(skillText(name)), `skills/${name}/SKILL.md has no plugin-root snippet`);
  }
});

test('all copies of the snippet are byte-identical', () => {
  const [first, ...rest] = SKILLS;
  const reference = extractSnippet(skillText(first));
  for (const name of rest) {
    assert.equal(
      extractSnippet(skillText(name)),
      reference,
      `skills/${name}/SKILL.md has drifted from skills/${first}/SKILL.md — update all four together`
    );
  }
});

test('the documented snippet matches the one the skills ship', () => {
  const documented = extractSnippet(fs.readFileSync(path.join(REPO, 'shared', 'plugin-root.md'), 'utf8'));
  assert.equal(documented, extractSnippet(skillText(SKILLS[0])), 'shared/plugin-root.md is out of date');
});

test('no skill still tells the reader to stop when the variable is empty', () => {
  // The instruction that halted every skill at step one until 2026-08-04.
  for (const name of SKILLS) {
    assert.doesNotMatch(
      skillText(name),
      /If `\$CLAUDE_PLUGIN_ROOT` is empty, say so and\s+stop/,
      `skills/${name}/SKILL.md still carries the broken instruction`
    );
  }
});

// The snippet shells out to node, so the node running these tests has to be
// reachable from the stripped-down PATH below. Hardcoding /usr/bin would pass
// here and fail wherever node is installed elsewhere — CI included.
const NODE_DIR = path.dirname(process.execPath);

/** Runs the shipped snippet with a controlled environment. */
function runSnippet({ home, extraPath = '', pluginRoot = '' }) {
  const snippet = extractSnippet(skillText(SKILLS[0]));
  return execFileSync('bash', ['-c', snippet], {
    encoding: 'utf8',
    env: { HOME: home, PATH: `${NODE_DIR}:/usr/bin:/bin${extraPath}`, CLAUDE_PLUGIN_ROOT: pluginRoot },
  }).trim();
}

/** A plugin directory that passes the snippet's own verification check. */
function fakeInstall(home, version = '0.3.0') {
  const dir = path.join(home, '.claude', 'plugins', 'cache', 'somemarket', 'storehand', version);
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shared', 'api-version.md'), 'Pinned: 2026-07\n');
  return dir;
}

function emptyHome() {
  // A space in the path on purpose: the classic way a snippet like this breaks
  // on someone else's machine and never on yours.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storehand home '));
}

test('the snippet finds the plugin through the install register', () => {
  const home = emptyHome();
  const installed = fakeInstall(home);
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'storehand@somemarket': [{ installPath: installed }] } })
  );

  assert.equal(runSnippet({ home }), `StoreHand plugin root: ${installed}`);
});

test('the snippet finds the plugin through PATH when the register is absent', () => {
  const home = emptyHome();
  const installed = fakeInstall(home);

  assert.equal(runSnippet({ home, extraPath: `:${installed}/bin` }), `StoreHand plugin root: ${installed}`);
});

test('$CLAUDE_PLUGIN_ROOT wins when it is set and valid', () => {
  const home = emptyHome();
  const installed = fakeInstall(home);
  const preferred = fakeInstall(home, '9.9.9');

  const output = runSnippet({ home, extraPath: `:${installed}/bin`, pluginRoot: preferred });
  assert.equal(output, `StoreHand plugin root: ${preferred}`);
});

test('a candidate that is not a StoreHand install is discarded, not used', () => {
  const home = emptyHome();
  const installed = fakeInstall(home);
  const decoy = path.join(home, 'work', 'storehand', 'notes');
  fs.mkdirSync(path.join(decoy, 'bin'), { recursive: true });

  // The decoy sits earlier on PATH and matches the shape; only the missing
  // shared/api-version.md tells them apart.
  const output = runSnippet({ home, extraPath: `:${decoy}/bin:${installed}/bin` });
  assert.equal(output, `StoreHand plugin root: ${installed}`);
});

test('it says NOT FOUND rather than guessing when nothing resolves', () => {
  assert.equal(runSnippet({ home: emptyHome() }), 'StoreHand plugin root NOT FOUND');
});
