#!/usr/bin/env node
/*
 * Validates that the StoreHand plugin is internally consistent.
 * Exits 1 and lists every problem found; exits 0 when clean.
 */
import fs from 'node:fs';
import path from 'node:path';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const QUERY_FILE_REF = /--query-file\s+(\S+)/g;

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

function checkSkill(skillDir, errors) {
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
  }

  for (const [, ref] of text.matchAll(QUERY_FILE_REF)) {
    const target = path.join(skillDir, ref);
    if (!fs.existsSync(target)) {
      errors.push(`skills/${name}/SKILL.md: references ${ref}, which does not exist`);
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
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) checkSkill(path.join(skillsDir, entry.name), errors);
    }
  }

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
