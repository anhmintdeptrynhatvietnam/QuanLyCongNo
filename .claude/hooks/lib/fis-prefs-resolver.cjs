/**
 * Resolves FIS AI Kit preferences from the two-tier config files.
 *
 * Preferences live in two places: a user file that stays on one machine, and a
 * project file that is committed so a team shares one coding level, one docs
 * layout, and one set of hook toggles. The project file wins key by key;
 * anything it leaves out keeps whatever the user file set.
 *
 * Reading happens here rather than in a CLI. FIS AI Kit is installed by the DAI
 * desktop app, so no `fis` binary is guaranteed to be on PATH — a hook that
 * shelled out for its settings would silently fall back to defaults on exactly
 * the machines that never open a terminal. The payload can always read its own
 * config files, so it does.
 *
 * There is deliberately no cache file. A generated file on disk invites hand
 * edits that silently disagree with the config it came from, so the only state
 * is memoised per process.
 *
 * Credentials are refused in the project file. That file is committed, so API
 * keys, tokens, and the trust passphrase belong in the user config only; a
 * project file carrying them has those sections dropped rather than merged.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { deepMerge, UNSAFE_KEYS } = require('./deep-merge.cjs');
const { parse: parseYaml } = require('./yaml-subset-parser.cjs');

// The payload shape this module produces. A config announcing anything else is
// treated as unreadable rather than guessed at.
const SUPPORTED_SCHEMA_VERSION = 1;

const CONFIG_DIR_NAME = '.fis';

// YAML is canonical; JSON is accepted for generators and for anyone who would
// rather not hand-write YAML. The first match in this order wins per scope.
const CONFIG_BASENAMES = Object.freeze(['config.yaml', 'config.yml', 'config.json']);

// Sections a committed project file must never carry. Each entry is a path into
// the config tree; a leaf path strips just that key.
const PROJECT_FORBIDDEN_PATHS = Object.freeze([
  ['keys'],
  ['api'],
  ['trust', 'passphrase']
]);

// Directory walk bound. Deep monorepo checkouts stay well inside this, while a
// misconfigured cwd cannot turn discovery into an unbounded climb.
const MAX_PARENT_WALK = 40;

// Keyed by the project directory the prefs were resolved for. A hook receives
// the session's directory in its payload, which is not always the directory the
// process was started in, and the project file that wins the merge is chosen by
// that directory — so one cache slot per scope, not one per process.
const cachedResults = new Map();

/**
 * Emit a diagnostic once per process, but only when explicitly asked.
 *
 * Hooks are expected to produce no output of their own: stdout is consumed as
 * model context, and stderr is asserted empty across the hook suites. A config
 * that is absent is the ordinary state, so reporting it would put a line on
 * every hook of every turn for a condition the user cannot act on mid-session.
 *
 * Set FIS_HOOK_DEBUG to trace a resolve that is not behaving.
 *
 * @param {string} message
 */
function debugOnce(message) {
  if (debugOnce.reported || !process.env.FIS_HOOK_DEBUG) return;
  debugOnce.reported = true;
  try {
    process.stderr.write(`[fis] ${message}\n`);
  } catch (e) {
    // A closed stderr must not turn a diagnostic into a crash.
  }
}

/** Directory holding the user-level config, overridable for tests and sandboxes. */
function getUserConfigDir() {
  const override = process.env.FIS_HOME;
  if (override && path.isAbsolute(override)) return override;
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * First existing config file in a directory, in CONFIG_BASENAMES order.
 * @param {string} dir - Directory expected to hold the config files
 * @returns {string|null} Absolute path or null
 */
function findConfigFileIn(dir) {
  for (const basename of CONFIG_BASENAMES) {
    const candidate = path.join(dir, basename);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch (e) {
      // An unreadable candidate is simply not the config.
    }
  }
  return null;
}

/**
 * Locate the project config by walking up from a starting directory.
 *
 * A hook can run from any subdirectory of a checkout, so discovery climbs until
 * it finds a `.fis/` config or runs out of parents. The walk stops at a
 * directory holding `.git`, which keeps a project inside a monorepo from
 * picking up a sibling repository's settings.
 *
 * @param {string} startDir - Directory to start from
 * @returns {string|null} Absolute path to the project config, or null
 */
function findProjectConfigFile(startDir) {
  let current = path.resolve(startDir);

  for (let depth = 0; depth < MAX_PARENT_WALK; depth += 1) {
    const found = findConfigFileIn(path.join(current, CONFIG_DIR_NAME));
    if (found) return found;

    // A repository boundary ends the search whether or not it held a config.
    try {
      if (fs.existsSync(path.join(current, '.git'))) return null;
    } catch (e) {
      // Treat an unreadable .git probe as "not a boundary" and keep climbing.
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Read and parse one config file.
 * @param {string} filePath - Absolute path to a YAML or JSON config
 * @returns {Object|null} Parsed mapping, or null when absent or malformed
 */
function readConfigFile(filePath) {
  if (!filePath) return null;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }

  try {
    const parsed = filePath.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      debugOnce(`${filePath} is not a mapping; ignoring it.`);
      return null;
    }
    return sanitizeKeys(parsed, filePath);
  } catch (e) {
    debugOnce(`${filePath} could not be parsed (${e.message}); ignoring it.`);
    return null;
  }
}

/**
 * Rebuild a parsed tree without keys that would reach `Object.prototype`.
 *
 * `JSON.parse` makes `__proto__` a real own property, so a committed
 * `.fis/config.json` could otherwise smuggle a section past the credential
 * strip — that check reads own properties — and have it reappear through the
 * prototype once merged. Dropping the keys at the boundary means no later stage
 * has to know about them.
 */
function sanitizeKeys(node, filePath, dropped = []) {
  if (Array.isArray(node)) return node.map((item) => sanitizeKeys(item, filePath, dropped));
  if (node === null || typeof node !== 'object') return node;

  const result = {};
  for (const key of Object.keys(node)) {
    if (UNSAFE_KEYS.has(key)) {
      dropped.push(key);
      continue;
    }
    result[key] = sanitizeKeys(node[key], filePath, dropped);
  }

  if (dropped.length > 0) {
    debugOnce(`${filePath} contains reserved keys (${dropped.join(', ')}); they were dropped.`);
  }
  return result;
}

/**
 * Remove credential sections from a committed project config.
 *
 * Returns a copy so the caller's parsed tree is untouched, plus the list of
 * paths that were dropped for `fis-config.cjs` and DAI to report.
 *
 * @param {Object} config - Parsed project config
 * @returns {{ config: Object, rejected: string[] }}
 */
function stripProjectCredentials(config) {
  const result = JSON.parse(JSON.stringify(config));
  const rejected = [];

  for (const keyPath of PROJECT_FORBIDDEN_PATHS) {
    let parent = result;
    for (let i = 0; i < keyPath.length - 1; i += 1) {
      const segment = keyPath[i];
      if (!parent || typeof parent !== 'object') {
        parent = null;
        break;
      }
      parent = parent[segment];
    }

    const leaf = keyPath[keyPath.length - 1];
    if (parent && typeof parent === 'object' && Object.hasOwn(parent, leaf)) {
      delete parent[leaf];
      rejected.push(keyPath.join('.'));
    }
  }

  return { config: result, rejected };
}

/**
 * Resolve the preference tree for a project directory.
 *
 * Every failure — no config files, malformed YAML, unsupported schema version —
 * leaves the corresponding layer out, and a resolve with no readable layer at
 * all returns null so the caller falls back to its own defaults. The result is
 * remembered for the life of the process, including the failure.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] Project directory whose config participates in
 *   the merge. Defaults to the process directory.
 * @returns {{
 *   schema_version: number,
 *   prefs: Object,
 *   sources: { user: string|null, project: string|null },
 *   rejected: string[]
 * }|null} Resolution result, or null when nothing could be read.
 */
function resolvePrefsPayload(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (cachedResults.has(cwd)) return cachedResults.get(cwd);
  cachedResults.set(cwd, null);

  const userPath = findConfigFileIn(getUserConfigDir());
  const projectPath = findProjectConfigFile(cwd);

  const userConfig = readConfigFile(userPath);
  const rawProjectConfig = readConfigFile(projectPath);

  if (!userConfig && !rawProjectConfig) return null;

  let projectConfig = rawProjectConfig;
  let rejected = [];
  if (rawProjectConfig) {
    const stripped = stripProjectCredentials(rawProjectConfig);
    projectConfig = stripped.config;
    rejected = stripped.rejected;
    if (rejected.length > 0) {
      debugOnce(
        `${projectPath} carries credential keys (${rejected.join(', ')}); ` +
        'they were ignored. Move them to your user config.'
      );
    }
  }

  // A file may pin the schema it was written against. An unknown version means
  // the keys cannot be trusted, so that layer is dropped rather than guessed at.
  const usableUser = hasSupportedVersion(userConfig, userPath) ? userConfig : null;
  const usableProject = hasSupportedVersion(projectConfig, projectPath) ? projectConfig : null;
  if (!usableUser && !usableProject) return null;

  let prefs = {};
  if (usableUser) prefs = deepMerge(prefs, usableUser);
  if (usableProject) prefs = deepMerge(prefs, usableProject);

  // `version` describes the file, not a preference.
  delete prefs.version;

  const payload = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    prefs,
    // Pre-merge trees, so a caller that also loads legacy config files can
    // interleave them and keep project scope ranked above user scope.
    layers: {
      user: usableUser ? stripVersion(usableUser) : null,
      project: usableProject ? stripVersion(usableProject) : null
    },
    sources: {
      user: usableUser ? userPath : null,
      project: usableProject ? projectPath : null
    },
    rejected
  };

  cachedResults.set(cwd, payload);
  return payload;
}

/** Copy a config without the `version` key, which describes the file, not a preference. */
function stripVersion(config) {
  const { version, ...rest } = config;
  return rest;
}

/**
 * Whether a parsed config declares a schema version this build understands.
 * A file with no `version` key is accepted as the current version.
 *
 * @param {Object|null} config - Parsed config
 * @param {string|null} source - Path used for the diagnostic
 * @returns {boolean}
 */
function hasSupportedVersion(config, source) {
  if (!config) return false;
  if (config.version == null || config.version === SUPPORTED_SCHEMA_VERSION) return true;

  debugOnce(`${source} uses an unsupported format (version ${config.version}); ignoring it.`);
  return false;
}

/**
 * Read the merged preference tree.
 *
 * @param {object} [options] Forwarded to resolvePrefsPayload.
 * @returns {Object|null} The `prefs` tree, or null when it cannot be read.
 */
function resolvePrefs(options) {
  const payload = resolvePrefsPayload(options);
  return payload ? payload.prefs : null;
}

/**
 * Read one preference section, or an empty object when it is absent or is not a
 * map. Callers merge it over their own defaults, so an unreadable host and an
 * unset section reach the same place.
 *
 * @param {string} name Section key, in the spelling the config file uses.
 * @param {object} [options] Forwarded to resolvePrefs.
 * @returns {Object}
 */
function resolvePrefsSection(name, options) {
  const prefs = resolvePrefs(options);
  const section = prefs ? prefs[name] : null;
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

/** Clear the memoised payloads. Exposed for tests. */
function resetPrefsCache() {
  cachedResults.clear();
  debugOnce.reported = false;
}

module.exports = {
  SUPPORTED_SCHEMA_VERSION,
  CONFIG_DIR_NAME,
  CONFIG_BASENAMES,
  PROJECT_FORBIDDEN_PATHS,
  getUserConfigDir,
  findConfigFileIn,
  findProjectConfigFile,
  readConfigFile,
  stripProjectCredentials,
  resolvePrefsPayload,
  resolvePrefs,
  resolvePrefsSection,
  resetPrefsCache
};
