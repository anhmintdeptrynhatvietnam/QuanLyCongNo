#!/usr/bin/env node
/**
 * Generate the two hook wiring files from hooks/hook-wiring.json.
 *
 *   settings.json      native install, commands relative to the project root
 *   hooks/hooks.json   plugin manifest, paths resolved from CLAUDE_PLUGIN_ROOT
 *
 * Both describe the same wiring in different dialects, which is exactly the
 * kind of pair that drifts when maintained by hand.
 *
 * Usage:
 *   node claude/scripts/generate-hook-wiring.cjs           write both files
 *   node claude/scripts/generate-hook-wiring.cjs --check   exit 1 if stale
 */

const fs = require('fs');
const path = require('path');

const CLAUDE_DIR = path.resolve(__dirname, '..');
const WIRING_PATH = path.join(CLAUDE_DIR, 'hooks', 'hook-wiring.json');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const MANIFEST_PATH = path.join(CLAUDE_DIR, 'hooks', 'hooks.json');

function loadWiring() {
  const wiring = JSON.parse(fs.readFileSync(WIRING_PATH, 'utf8'));
  const events = wiring.events;
  if (!events || typeof events !== 'object') {
    throw new Error(`${WIRING_PATH} has no "events" map`);
  }

  for (const [event, blocks] of Object.entries(events)) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error(`Event "${event}" has no blocks`);
    }
    for (const block of blocks) {
      if (!block.matcher) throw new Error(`Event "${event}" has a block without a matcher`);
      if (!Array.isArray(block.hooks) || block.hooks.length === 0) {
        throw new Error(`Event "${event}" matcher "${block.matcher}" lists no hooks`);
      }
      for (const hook of block.hooks) {
        const hookPath = path.join(CLAUDE_DIR, 'hooks', `${hook}.cjs`);
        if (!fs.existsSync(hookPath)) {
          throw new Error(`Event "${event}" references a hook that does not exist: ${hook}.cjs`);
        }
      }
    }
  }

  return events;
}

/** Native settings: the runtime resolves the command against the project root. */
function buildSettingsHooks(events) {
  const out = {};
  for (const [event, blocks] of Object.entries(events)) {
    out[event] = blocks.map(block => ({
      matcher: block.matcher,
      hooks: block.hooks.map(hook => ({
        type: 'command',
        command: `node ".claude/hooks/${hook}.cjs"`
      }))
    }));
  }
  return out;
}

/** Plugin manifest: the path is expanded from the installed plugin root. */
function buildManifestHooks(events) {
  const out = {};
  for (const [event, blocks] of Object.entries(events)) {
    out[event] = blocks.map(block => ({
      matcher: block.matcher,
      hooks: block.hooks.map(hook => ({
        type: 'command',
        command: 'node',
        args: [`\${CLAUDE_PLUGIN_ROOT}/hooks/${hook}.cjs`]
      }))
    }));
  }
  return out;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const events = loadWiring();

  // Only the hooks block is generated; everything else in settings.json is
  // hand-maintained and has to survive a regeneration untouched.
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  settings.hooks = buildSettingsHooks(events);
  const nextSettings = serialize(settings);

  const nextManifest = serialize({
    $comment: 'Generated from hooks/hook-wiring.json. Do not edit by hand.',
    hooks: buildManifestHooks(events)
  });

  const targets = [
    { label: 'settings.json', file: SETTINGS_PATH, next: nextSettings },
    { label: 'hooks/hooks.json', file: MANIFEST_PATH, next: nextManifest }
  ];

  const stale = targets.filter(({ file, next }) => {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    return current !== next;
  });

  if (check) {
    if (stale.length === 0) {
      console.log('Hook wiring is up to date.');
      return 0;
    }
    for (const { label } of stale) {
      console.error(`Stale: ${label} does not match hooks/hook-wiring.json`);
    }
    console.error('Run: node claude/scripts/generate-hook-wiring.cjs');
    return 1;
  }

  for (const { label, file, next } of targets) {
    fs.writeFileSync(file, next);
    console.log(`Wrote ${label}`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`generate-hook-wiring: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildSettingsHooks, buildManifestHooks, loadWiring, WIRING_PATH, SETTINGS_PATH, MANIFEST_PATH };
