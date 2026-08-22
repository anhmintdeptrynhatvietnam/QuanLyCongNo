#!/usr/bin/env node
/**
 * Read and check FIS AI Kit preferences.
 *
 * Usage: node .claude/scripts/fis-config.cjs <command> [options]
 *
 *   resolve [--json]   Print the merged preference tree
 *   show               Print the merged tree with the file each value came from
 *   validate           Report unknown keys, parse errors, and rejected credentials
 *   path               Print where the config files are, or would go
 *   init [--user]      Write a commented config stub if none exists
 *
 * Options:
 *   --cwd <dir>        Project directory to resolve from (default: this directory)
 *
 * This is a payload script rather than a CLI subcommand because FIS AI Kit is
 * installed by the DAI desktop app, so no `fis` binary is guaranteed to be on
 * PATH. Skills and hooks invoke it by path, which always exists.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  SUPPORTED_SCHEMA_VERSION,
  CONFIG_DIR_NAME,
  getUserConfigDir,
  findConfigFileIn,
  findProjectConfigFile,
  resolvePrefsPayload
} = require('../hooks/lib/fis-prefs-resolver.cjs');
const { findUnknownKeys } = require('../hooks/lib/fis-prefs-key-map.cjs');
const { loadConfig } = require('../hooks/lib/fis-config-utils.cjs');
const { parse: parseYaml } = require('../hooks/lib/yaml-subset-parser.cjs');

const EMPTY_PAYLOAD = {
  schema_version: SUPPORTED_SCHEMA_VERSION,
  prefs: {},
  layers: { user: null, project: null },
  sources: { user: null, project: null },
  rejected: []
};

// A commented stub is the whole point of `init`: an empty file teaches nothing,
// and a file of active defaults would silently freeze values that should track
// the kit. Every line is commented so uncommenting is the only way to opt in.
const PROJECT_TEMPLATE = `# yaml-language-server: $schema=../.claude/schemas/fis-preferences.schema.json
#
# FIS AI Kit project preferences.
#
# Everything here applies to this repository only, and overrides the same key in
# your own ~/.fis/config.yaml. Anything you leave out keeps whatever you have set
# there. Field names are snake_case; run
# \`node .claude/scripts/fis-config.cjs validate\` to check this file.
#
# This file is meant to be committed: it is how a team shares one coding level,
# one docs layout, and one set of hook toggles. For that reason it holds no
# credentials. API keys, tokens, and trust passphrases belong in your user
# config, which stays on your machine — do not add \`keys\`, \`api\`, or
# \`trust.passphrase\` here.
#
# Every line below is a commented stub. Uncomment only what this project needs.

# How much explanation you want in answers.
#   -1 disabled, 0 eli5, 1 junior, 2 mid-level, 3 senior, 4 expert, 5 architect
# coding_level: 3

# Where this project keeps its documentation and plans.
# paths:
#   docs: docs
#   plans: plans

# docs:
#   max_loc: 800

# Plan directory naming. Variables: {date}, {issue}, {slug}.
# plan:
#   naming_format: "{date}-{issue}-{slug}"
#   date_format: YYMMDD-HHmm
#   issue_prefix: GH-
#   reports_dir: reports

# Detection overrides for a repository the defaults read wrong.
# project:
#   type: auto
#   package_manager: auto
#   framework: auto

# Language for responses and for thinking. null means English / match the user.
# locale:
#   response_language: null
#   thinking_language: null

# Git platform. auto detects from the origin remote.
# git:
#   provider: auto

# Write a journal entry at the end of a workflow without asking.
# journal:
#   auto: false

# Rules enforced on matching files.
# assertions:
#   - pattern: "**/*.go"
#     rule: "table-driven tests for exported behavior"

# Per-hook toggles, keyed by the hook script's basename. A hook not listed here
# is enabled. Use this to turn one off for this repository.
# hooks:
#   simplify-gate: false

# Per-skill configuration, keyed by skill id.
# skills:
#   research:
#     use_gemini: true

# The code-simplifier gate that runs on prompt submit.
# simplify:
#   gate:
#     enabled: true

# Block reads of files that usually hold secrets (.env, credentials, keys).
# privacy_block: true

# Proof required before a workflow ships.
# workflow_artifact_gate:
#   enabled: true

# Settings this build does not model. Nothing here is validated or converted,
# and nothing is guaranteed to survive an upgrade.
# extensions: {}
`;

const USER_TEMPLATE = `# yaml-language-server: $schema=https://fis-ai-kit.local/schemas/fis-preferences.schema.json
#
# FIS AI Kit user preferences.
#
# These apply to every project on this machine. A project's own
# ./.fis/config.yaml overrides any key it sets; anything it leaves out keeps
# what you set here. Field names are snake_case.
#
# This file stays on your machine, so credentials belong here rather than in a
# project file.

# How much explanation you want in answers.
#   -1 disabled, 0 eli5, 1 junior, 2 mid-level, 3 senior, 4 expert, 5 architect
# coding_level: 3

# Language for responses and for thinking. null means English / match the user.
# locale:
#   response_language: null
#   thinking_language: null

# Statusline: full | compact | minimal | none
# statusline: full

# Trust mode. The passphrase is only ever read from this file.
# trust:
#   enabled: false
#   passphrase: null

# Credentials. Only read from this file, never from a project config.
# keys: {}
`;

/** Parse argv into a command and flags. */
function parseArgs(argv) {
  const [command = 'show', ...rest] = argv;
  const flags = { json: false, user: false, cwd: process.cwd() };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--user') flags.user = true;
    else if (arg === '--cwd') {
      const value = rest[i + 1];
      if (!value) fail('--cwd needs a directory');
      flags.cwd = path.resolve(value);
      i += 1;
    } else {
      fail(`unknown option: ${arg}`);
    }
  }

  return { command, flags };
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Print the resolved payload as JSON.
 *
 * Output is always JSON: this command exists to be read by another program, so
 * `--json` is accepted for symmetry but changes nothing. A host with no config
 * gets the empty payload rather than nothing, so a caller can parse
 * unconditionally.
 *
 * Secret values are replaced with a placeholder, and the paths that were
 * replaced are listed under `redacted`. Nothing loses a capability by this:
 * hooks read credentials through the resolver directly, and a caller of this
 * command only needs to know which ones are set.
 */
function commandResolve(flags) {
  const payload = resolvePrefsPayload({ cwd: flags.cwd }) || EMPTY_PAYLOAD;
  const redacted = [];

  // The per-scope layers carry the same values as the merged tree, so both have
  // to be masked; only the merged paths are reported, to keep the list readable.
  const prefs = redactSecrets(payload.prefs, '', redacted);
  const layers = {
    user: redactSecrets(payload.layers.user, '', []),
    project: redactSecrets(payload.layers.project, '', [])
  };

  console.log(JSON.stringify({ ...payload, prefs, layers, redacted }, null, 2));
}

/** Copy a tree with secret leaf values replaced, collecting the paths touched. */
function redactSecrets(node, trail, collected) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;

  const result = {};
  for (const key of Object.keys(node)) {
    const dotted = trail ? `${trail}.${key}` : key;
    const value = node[key];

    // Checked before recursing, so a secret written as a map is replaced whole
    // rather than walked into.
    if (isSecretPath(dotted)) {
      if (value === null) {
        result[key] = null;
      } else {
        result[key] = REDACTED_PLACEHOLDER;
        collected.push(dotted);
      }
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSecrets(value, dotted, collected);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Describe a config file's contribution to the merge.
 *
 * A file the resolver dropped — unparseable, or pinned to a version this build
 * does not read — must not be reported the same way as a file that is simply
 * absent: in both cases nothing is applied, but only one of them is a mistake.
 */
function describeSource(usedPath, foundPath) {
  if (usedPath) return usedPath;
  if (foundPath) return `${foundPath} (ignored — run \`validate\`)`;
  return '(none)';
}

function commandShow(flags) {
  const payload = resolvePrefsPayload({ cwd: flags.cwd });

  console.log('Preference files');
  console.log(`  user:    ${describeSource(payload?.sources.user, findConfigFileIn(getUserConfigDir()))}`);
  console.log(`  project: ${describeSource(payload?.sources.project, findProjectConfigFile(flags.cwd))}`);

  if (payload?.rejected.length) {
    console.log('');
    console.log('Ignored in the project file (credentials belong in your user config):');
    for (const key of payload.rejected) console.log(`  ${key}`);
  }

  console.log('');
  console.log('Merged preferences');
  const prefs = payload?.prefs || {};
  if (Object.keys(prefs).length === 0) {
    console.log('  (none set — the kit defaults apply)');
  } else {
    for (const line of flatten(prefs)) console.log(`  ${line}`);
  }

  // The effective config is what hooks actually read: preferences merged over
  // the kit defaults and the legacy .fisrc.json files.
  const effective = loadConfig({ cwd: flags.cwd });
  console.log('');
  console.log('Effective settings hooks will use');
  console.log(`  coding level:  ${effective.codingLevel}`);
  console.log(`  docs path:     ${effective.paths.docs}`);
  console.log(`  plans path:    ${effective.paths.plans}`);
  console.log(`  plan naming:   ${effective.plan.namingFormat}`);
  console.log(`  statusline:    ${effective.statusline}`);
}

// Values printed as a placeholder rather than in full. `show` is run in a
// terminal that gets scrolled back, pasted into issues, and captured by CI logs,
// so a secret must not be readable just because someone asked what is set.
// Matched by equality or as a prefix, so a section written as a bare scalar is
// covered as well as the documented map shape.
const SECRET_ROOTS = Object.freeze(['keys', 'api', 'trust.passphrase']);
const REDACTED_PLACEHOLDER = '(redacted)';

function isSecretPath(dottedPath) {
  return SECRET_ROOTS.some((root) => dottedPath === root || dottedPath.startsWith(`${root}.`));
}

/** Render a nested tree as sorted `a.b.c = value` lines, masking secrets. */
function flatten(node, trail = '') {
  const lines = [];
  for (const key of Object.keys(node).sort()) {
    const dotted = trail ? `${trail}.${key}` : key;
    const value = node[key];

    // Checked before recursing: a secret written as a map must not be walked
    // into and printed leaf by leaf.
    if (isSecretPath(dotted)) {
      lines.push(`${dotted} = ${value === null ? 'null' : '(set)'}`);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(...flatten(value, dotted));
    } else {
      lines.push(`${dotted} = ${JSON.stringify(value)}`);
    }
  }
  return lines;
}

function commandValidate(flags) {
  const userPath = findConfigFileIn(getUserConfigDir());
  const projectPath = findProjectConfigFile(flags.cwd);
  let problems = 0;

  if (!userPath && !projectPath) {
    console.log('No config file found. The kit defaults apply.');
    console.log('Run `node .claude/scripts/fis-config.cjs init` to create one.');
    return 0;
  }

  for (const [label, filePath] of [['user', userPath], ['project', projectPath]]) {
    if (!filePath) continue;

    // Re-read directly so a parse error names the file rather than being
    // swallowed by the resolver's fall-back-to-defaults behaviour.
    const parsed = readConfigFileVerbose(filePath);
    if (!parsed.ok) {
      console.log(`✗ ${label}: ${filePath}`);
      console.log(`    ${parsed.error}`);
      problems += 1;
      continue;
    }

    // A version this build does not understand makes the whole file inert, so
    // it is reported ahead of the key check: every key below is moot, and a
    // clean report would be worse than no report.
    const version = parsed.config.version;
    if (version != null && version !== SUPPORTED_SCHEMA_VERSION) {
      console.log(`✗ ${label}: ${filePath}`);
      console.log(`    version ${JSON.stringify(version)} is not supported — this file is ignored entirely`);
      console.log(`    this build reads version ${SUPPORTED_SCHEMA_VERSION}`);
      problems += 1;
      continue;
    }

    const unknown = findUnknownKeys(parsed.config);
    if (unknown.length === 0) {
      console.log(`✓ ${label}: ${filePath}`);
      continue;
    }

    console.log(`✗ ${label}: ${filePath}`);
    for (const key of unknown) {
      console.log(`    unknown key: ${key}`);
    }
    problems += unknown.length;
  }

  const payload = resolvePrefsPayload({ cwd: flags.cwd });
  if (payload?.rejected.length) {
    console.log('');
    console.log('Credentials are not read from a committed project file:');
    for (const key of payload.rejected) console.log(`    ignored: ${key}`);
    problems += payload.rejected.length;
  }

  return problems;
}

/** Read a config file, returning the parse error instead of swallowing it. */
function readConfigFileVerbose(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { ok: false, error: `could not be read (${e.code || e.message})` };
  }

  try {
    const config = filePath.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false, error: 'is not a mapping of settings' };
    }
    return { ok: true, config };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function commandPath(flags) {
  const userDir = getUserConfigDir();
  const userPath = findConfigFileIn(userDir);
  const projectPath = findProjectConfigFile(flags.cwd);

  console.log(`user:    ${userPath || path.join(userDir, 'config.yaml') + ' (not created)'}`);
  console.log(`project: ${projectPath || path.join(flags.cwd, CONFIG_DIR_NAME, 'config.yaml') + ' (not created)'}`);
}

function commandInit(flags) {
  const targetDir = flags.user ? getUserConfigDir() : path.join(flags.cwd, CONFIG_DIR_NAME);
  const existing = findConfigFileIn(targetDir);

  if (existing) {
    console.log(`Config already exists: ${existing}`);
    console.log('Leaving it untouched.');
    return;
  }

  const target = path.join(targetDir, 'config.yaml');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(target, flags.user ? USER_TEMPLATE : PROJECT_TEMPLATE);
  console.log(`Created ${target}`);
  console.log('Every setting is commented out. Uncomment what this project needs.');
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'resolve':
      commandResolve(flags);
      break;
    case 'show':
      commandShow(flags);
      break;
    case 'validate': {
      const problems = commandValidate(flags);
      if (problems > 0) process.exit(1);
      break;
    }
    case 'path':
      commandPath(flags);
      break;
    case 'init':
      commandInit(flags);
      break;
    case '--help':
    case '-h':
    case 'help':
      console.log('Usage: node .claude/scripts/fis-config.cjs <resolve|show|validate|path|init> [--cwd <dir>] [--user] [--json]');
      break;
    default:
      fail(`unknown command: ${command}`);
  }
}

main();
