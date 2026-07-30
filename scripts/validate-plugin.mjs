#!/usr/bin/env node
/*
 * Validates that the StoreHand plugin is internally consistent.
 * Exits 1 and lists every problem found; exits 0 when clean.
 */
import fs from 'node:fs';
import path from 'node:path';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const QUERY_FILE_REF = /--query-file\s+(\S+)/g;
const MARKDOWN_LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const BLOCK_SCALAR = /^[>|][-+]?\d*$/;
const PLUGIN_ROOT_VAR = /^\$\{?CLAUDE_PLUGIN_ROOT\}?\//;
const EXTERNAL_LINK = /^(https?:|mailto:|#|\/)/;

/**
 * Turns a path as written in a skill into a real path, or null when it depends
 * on something we cannot know. Quotes are stripped and $CLAUDE_PLUGIN_ROOT is
 * resolved against the plugin root; any other variable is unresolvable.
 */
function resolveSkillPath(reference, root, skillDir) {
  const bare = reference.replace(/^["']|["']$/g, '');
  if (PLUGIN_ROOT_VAR.test(bare)) {
    return path.join(root, bare.replace(PLUGIN_ROOT_VAR, ''));
  }
  if (bare.includes('$')) return null;
  return path.join(skillDir, bare);
}

/** Returns { name, description, ... } or null when there is no frontmatter. */
export function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${file}: not valid JSON — ${error.message}`);
    return null;
  }
}

function checkSkill(skillDir, root, errors) {
  const name = path.basename(skillDir);
  const skillFile = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillFile)) {
    errors.push(`skills/${name}: missing SKILL.md`);
    return;
  }

  const text = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = parseFrontmatter(text);

  if (!frontmatter) {
    errors.push(`skills/${name}/SKILL.md: missing YAML frontmatter`);
    return;
  }
  if (!frontmatter.name) {
    errors.push(`skills/${name}/SKILL.md: frontmatter has no name`);
  } else if (frontmatter.name !== name) {
    errors.push(
      `skills/${name}/SKILL.md: frontmatter name "${frontmatter.name}" does not match directory "${name}"`
    );
  }
  if (!frontmatter.description) {
    errors.push(`skills/${name}/SKILL.md: frontmatter has no description`);
  } else if (BLOCK_SCALAR.test(frontmatter.description)) {
    errors.push(
      `skills/${name}/SKILL.md: description uses a YAML block scalar, which this parser does not read — put it on one line`
    );
  }

  for (const [, ref] of text.matchAll(QUERY_FILE_REF)) {
    const target = resolveSkillPath(ref, root, skillDir);
    if (target === null) {
      errors.push(
        `skills/${name}/SKILL.md: references ${ref}, which cannot be resolved — anchor query paths on $CLAUDE_PLUGIN_ROOT`
      );
    } else if (!fs.existsSync(target)) {
      errors.push(`skills/${name}/SKILL.md: references ${ref}, which does not exist`);
    }
  }
}

/** Every .md file in the plugin, ignoring dependency and VCS directories. */
function markdownFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (fs.statSync(full).isDirectory()) markdownFiles(full, found);
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

function checkMarkdownLinks(root, errors) {
  for (const file of markdownFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(MARKDOWN_LINK)) {
      if (EXTERNAL_LINK.test(target)) continue;
      const resolved = path.join(path.dirname(file), target.split('#')[0]);
      if (!fs.existsSync(resolved)) {
        errors.push(`${path.relative(root, file)}: links to ${target}, which does not exist`);
      }
    }
  }
}

/** Returns an array of human-readable problems. Empty means valid. */
export function validatePlugin(root) {
  const errors = [];

  const pluginJson = path.join(root, '.claude-plugin', 'plugin.json');
  const marketplaceJson = path.join(root, '.claude-plugin', 'marketplace.json');

  for (const file of [pluginJson, marketplaceJson]) {
    if (!fs.existsSync(file)) {
      errors.push(`${path.relative(root, file)}: missing`);
    }
  }
  if (errors.length > 0) return errors;

  readJson(pluginJson, errors);
  const marketplace = readJson(marketplaceJson, errors);

  if (marketplace) {
    for (const entry of marketplace.plugins ?? []) {
      const source = entry.source ?? './';
      if (!fs.existsSync(path.join(root, source))) {
        errors.push(`marketplace.json: plugin "${entry.name}" points at ${source}, which does not exist`);
      }
    }
  }

  const skillsDir = path.join(root, 'skills');
  let skillCount = 0;
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      const full = path.join(skillsDir, entry.name);
      // statSync follows symlinks; readdir's own isDirectory() does not, and a
      // symlinked skill would otherwise be skipped without a word.
      if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) continue;
      skillCount += 1;
      checkSkill(full, root, errors);
    }
  }
  if (skillCount === 0) {
    errors.push('skills/: no skills found — a plugin with no skills does nothing');
  }

  checkMarkdownLinks(root, errors);

  return errors;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const root = process.argv[2] ?? '.';
  const errors = validatePlugin(root);
  if (errors.length === 0) {
    console.log('StoreHand plugin is valid.');
  } else {
    console.error(`StoreHand plugin has ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}
