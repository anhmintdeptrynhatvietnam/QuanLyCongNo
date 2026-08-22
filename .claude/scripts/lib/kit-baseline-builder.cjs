#!/usr/bin/env node
'use strict';

/**
 * Builds the drift baselines DAI reads. See docs/reference/dai-drift-contract.md.
 *
 * This lives in the payload rather than in repo-side scripts/ because both
 * callers need identical logic and only one of them ships: the repo generator
 * (scripts/generate-plugin-manifests.cjs) writes the baselines, and the shipped
 * checker (claude/scripts/fis-drift.cjs) reads them back. An installed project
 * has no scripts/ directory, so the shared code has to sit under claude/.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { loadWiring } = require('../generate-hook-wiring.cjs');

/**
 * The payload root this module ships inside. loadWiring() reads the wiring from
 * its own tree, so every path here resolves against the same tree rather than
 * one a caller passes in.
 */
const CLAUDE_DIR = path.resolve(__dirname, '..', '..');

/** Bump only on a breaking change; see the compatibility policy in the contract. */
const SCHEMA_VERSION = 1;

const HASH_ALGORITHM = 'sha256';

/** Directory that the skill-hash baseline covers, relative to claude/. */
const SKILLS_DIR = 'skills';

const HOOKS_DIR = 'hooks';

const WIRING_FILE = 'hooks/hook-wiring.json';

const CHECKER_PATH = 'scripts/fis-drift.cjs';

const HOOK_EXPECTATIONS_FILE = 'native-hook-expectations.json';
const SKILL_HASHES_FILE = 'native-skill-hashes.json';
const KIT_BASELINE_FILE = 'kit-baseline.json';

/**
 * Editor, VCS, and interpreter droppings. Hashing these would make the baseline
 * depend on whoever ran the generator, so a colleague's Finder would show up as
 * CI drift.
 */
const SKIPPED_NAMES = new Set([
  '.DS_Store',
  '.cache',
  '.git',
  '.venv',
  '__pycache__',
  'node_modules',
  'venv',
]);

const SKIPPED_EXTENSIONS = new Set(['.pyc', '.pyo']);

function isSkipped(name) {
  return SKIPPED_NAMES.has(name) || SKIPPED_EXTENSIONS.has(path.extname(name));
}

/**
 * List every baseline-tracked file under `claudeDir/subdir`, as project-relative
 * POSIX paths sorted for a stable diff. Symlinks are skipped: their target lives
 * outside the payload, so hashing them would record something the kit does not
 * ship.
 */
function listBaselineFiles(claudeDir = CLAUDE_DIR, subdir = SKILLS_DIR) {
  const found = [];

  const walk = absDir => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isSkipped(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) found.push(toRelativePosix(claudeDir, abs));
    }
  };

  walk(path.join(claudeDir, subdir));
  return found.sort();
}

/** Absolute path to a POSIX path relative to claude/, the form the contract requires. */
function toRelativePosix(claudeDir, absPath) {
  return path.relative(claudeDir, absPath).split(path.sep).join('/');
}

function hashBytes(buffer) {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest('hex');
}

function hashFile(absPath) {
  return hashBytes(fs.readFileSync(absPath));
}

/**
 * The phase 03 wiring table as data, plus a hash of the source it came from so a
 * reader can tell a regenerated baseline from an edited one.
 */
function buildHookExpectations(claudeDir = CLAUDE_DIR) {
  const events = loadWiring();
  const hookFiles = {};

  const orderedEvents = {};
  for (const eventName of Object.keys(events).sort()) {
    orderedEvents[eventName] = events[eventName].map(block => ({
      matcher: block.matcher,
      hooks: [...block.hooks],
    }));
    for (const block of events[eventName]) {
      for (const hook of block.hooks) {
        hookFiles[hook] = `${HOOKS_DIR}/${hook}.cjs`;
      }
    }
  }

  return {
    kitBaselineSchema: SCHEMA_VERSION,
    generatedFrom: WIRING_FILE,
    wiringSha256: hashFile(path.join(claudeDir, WIRING_FILE)),
    events: orderedEvents,
    hookFiles: sortedByKey(hookFiles),
  };
}

function buildSkillHashes(claudeDir = CLAUDE_DIR) {
  const files = {};
  for (const rel of listBaselineFiles(claudeDir, SKILLS_DIR)) {
    files[rel] = hashFile(path.join(claudeDir, rel));
  }
  return {
    kitBaselineSchema: SCHEMA_VERSION,
    algorithm: HASH_ALGORITHM,
    files,
  };
}

function buildKitBaseline({ kitVersion, generatedAt }) {
  return {
    kitBaselineSchema: SCHEMA_VERSION,
    kitVersion,
    generatedAt,
    baselines: {
      hookExpectations: HOOK_EXPECTATIONS_FILE,
      skillHashes: SKILL_HASHES_FILE,
    },
    checker: CHECKER_PATH,
  };
}

function sortedByKey(record) {
  const out = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The date the payload last changed, not the date the generator last ran.
 * Restamping on every run would make `--check` fail the day after any commit,
 * so the previous date is kept while the substantive content is unchanged.
 */
function resolveGeneratedAt(claudeDir, hookExpectations, skillHashes) {
  const existingPath = path.join(claudeDir, KIT_BASELINE_FILE);
  if (!fs.existsSync(existingPath)) return todayIso();

  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  } catch {
    return todayIso();
  }
  if (typeof previous.generatedAt !== 'string') return todayIso();

  const unchanged =
    matchesCommitted(claudeDir, HOOK_EXPECTATIONS_FILE, hookExpectations) &&
    matchesCommitted(claudeDir, SKILL_HASHES_FILE, skillHashes);

  return unchanged ? previous.generatedAt : todayIso();
}

function matchesCommitted(claudeDir, relFile, value) {
  const file = path.join(claudeDir, relFile);
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8') === serialize(value);
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Every baseline the kit publishes, as `[relative path, content]` pairs ready to
 * write or compare. Callers do not decide what a baseline contains.
 */
function buildAllBaselines(kitVersion, claudeDir = CLAUDE_DIR) {
  const hookExpectations = buildHookExpectations(claudeDir);
  const skillHashes = buildSkillHashes(claudeDir);
  const generatedAt = resolveGeneratedAt(claudeDir, hookExpectations, skillHashes);

  const baselines = [
    [HOOK_EXPECTATIONS_FILE, hookExpectations],
    [SKILL_HASHES_FILE, skillHashes],
    [KIT_BASELINE_FILE, buildKitBaseline({ kitVersion, generatedAt })],
  ];

  assertRelativePaths(baselines);
  return baselines;
}

/**
 * An absolute path in a baseline breaks the moment the project is cloned or
 * moved. Fail the build rather than ship that.
 */
function assertRelativePaths(baselines) {
  const offenders = [];
  const check = (label, value) => {
    if (typeof value !== 'string') return;
    if (path.isAbsolute(value) || value.includes('\\') || value.includes('..')) {
      offenders.push(`${label}: ${value}`);
    }
  };

  for (const [file, content] of baselines) {
    for (const key of Object.keys(content.files || {})) check(`${file} files`, key);
    for (const [hook, hookPath] of Object.entries(content.hookFiles || {})) {
      check(`${file} hookFiles.${hook}`, hookPath);
    }
    check(`${file} generatedFrom`, content.generatedFrom);
    check(`${file} checker`, content.checker);
    for (const value of Object.values(content.baselines || {})) check(`${file} baselines`, value);
  }

  if (offenders.length > 0) {
    throw new Error(`Baseline paths must be project-relative:\n  ${offenders.join('\n  ')}`);
  }
}

module.exports = {
  CLAUDE_DIR,
  SCHEMA_VERSION,
  HASH_ALGORITHM,
  SKILLS_DIR,
  HOOKS_DIR,
  HOOK_EXPECTATIONS_FILE,
  SKILL_HASHES_FILE,
  KIT_BASELINE_FILE,
  buildAllBaselines,
  buildHookExpectations,
  buildSkillHashes,
  buildKitBaseline,
  listBaselineFiles,
  toRelativePosix,
  hashFile,
  hashBytes,
  serialize,
};
