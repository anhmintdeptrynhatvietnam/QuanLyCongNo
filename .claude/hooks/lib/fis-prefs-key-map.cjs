/**
 * Translates the `.fis/config.yaml` preference tree into the internal config shape.
 *
 * The two spellings exist for different readers. The config file uses
 * snake_case, which is the convention for the shared config schema, so a team
 * writes the same keys everywhere. Every hook, script, and statusline
 * module in this payload reads camelCase and predates that file, so the
 * translation happens once here instead of at each of the ~30 call sites.
 *
 * The map is explicit rather than a mechanical snake-to-camel conversion.
 * Sections such as `hooks` are keyed by hook basename (`simplify-gate`) and
 * `extensions` is documented as carrying whatever a build does not model, so
 * converting keys there would rewrite user data.
 */

'use strict';

const { UNSAFE_KEYS } = require('./deep-merge.cjs');

/**
 * Keys that are valid in a config file but are not preferences, so they have no
 * internal counterpart. `version` describes the file and is consumed by the
 * resolver before the tree reaches this module.
 */
const NON_PREFERENCE_KEYS = Object.freeze(['version']);

/**
 * Config-file path → internal path, both as dot-delimited strings.
 * Entries whose two sides match are listed anyway: this table doubles as the
 * definition of which keys are recognised at all.
 */
const KEY_MAP = Object.freeze([
  ['coding_level', 'codingLevel'],
  ['privacy_block', 'privacyBlock'],
  ['statusline', 'statusline'],
  ['statusline_colors', 'statuslineColors'],
  ['statusline_quota', 'statuslineQuota'],
  ['statusline_layout', 'statuslineLayout'],

  ['paths.docs', 'paths.docs'],
  ['paths.plans', 'paths.plans'],

  ['docs.max_loc', 'docs.maxLoc'],

  ['plan.naming_format', 'plan.namingFormat'],
  ['plan.date_format', 'plan.dateFormat'],
  ['plan.issue_prefix', 'plan.issuePrefix'],
  ['plan.reports_dir', 'plan.reportsDir'],
  ['plan.resolution.order', 'plan.resolution.order'],
  ['plan.resolution.branch_pattern', 'plan.resolution.branchPattern'],
  ['plan.validation.mode', 'plan.validation.mode'],
  ['plan.validation.min_questions', 'plan.validation.minQuestions'],
  ['plan.validation.max_questions', 'plan.validation.maxQuestions'],
  ['plan.validation.focus_areas', 'plan.validation.focusAreas'],

  ['project.type', 'project.type'],
  ['project.package_manager', 'project.packageManager'],
  ['project.framework', 'project.framework'],

  ['locale.response_language', 'locale.responseLanguage'],
  ['locale.thinking_language', 'locale.thinkingLanguage'],

  ['trust.enabled', 'trust.enabled'],
  ['trust.passphrase', 'trust.passphrase'],

  ['skills.research.use_gemini', 'skills.research.useGemini'],

  ['simplify.gate.enabled', 'simplify.gate.enabled'],
  ['simplify.gate.hard_verbs', 'simplify.gate.hardVerbs'],
  ['simplify.gate.soft_verbs', 'simplify.gate.softVerbs'],
  ['simplify.threshold.loc_delta', 'simplify.threshold.locDelta'],
  ['simplify.threshold.file_count', 'simplify.threshold.fileCount'],
  ['simplify.threshold.single_file_loc', 'simplify.threshold.singleFileLoc'],

  ['workflow_artifact_gate.enabled', 'workflowArtifactGate.enabled'],

  ['git.provider', 'git.provider'],

  ['journal.auto', 'journal.auto'],

  ['gemini.model', 'gemini.model']
]);

/**
 * Sections copied across whole, without touching their keys.
 *
 * `hooks` is keyed by hook basename, `assertions` is a list of records the
 * consumer reads by name, and `extensions` is by definition unmodelled.
 * `keys` and `api` hold credentials whose names come from the services they
 * address; the resolver has already removed them from a committed project
 * config by the time this runs, so what arrives here is user-scoped.
 * `skills` is keyed by skill id, and each skill owns the shape below it.
 */
const VERBATIM_SECTIONS = Object.freeze([
  'hooks',
  'assertions',
  'extensions',
  'keys',
  'api',
  'skills'
]);

/** Read a dot-delimited path, returning undefined when any segment is missing. */
function getPath(source, dottedPath) {
  let current = source;
  for (const segment of dottedPath.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Write a dot-delimited path, creating intermediate objects as needed.
 * Paths come from KEY_MAP rather than from a config file, so they are trusted;
 * the guard is here so that stays true if the map ever becomes data-driven.
 */
function setPath(target, dottedPath, value) {
  const segments = dottedPath.split('.');
  if (segments.some((segment) => UNSAFE_KEYS.has(segment))) return;

  let current = target;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (current[segment] === null || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
}

/** Remove a dot-delimited path, leaving any intermediate objects in place. */
function deletePath(target, dottedPath) {
  const segments = dottedPath.split('.');
  let current = target;

  for (let i = 0; i < segments.length - 1; i += 1) {
    current = current[segments[i]];
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return;
  }

  delete current[segments[segments.length - 1]];
}

/**
 * Convert a resolved preference tree into the internal camelCase config shape.
 *
 * Only recognised keys carry over. An unknown key is dropped rather than passed
 * through, so a typo in a config file cannot masquerade as a setting that the
 * merge would then rank above a correctly spelled one.
 *
 * @param {Object|null} prefs - Tree from the preference resolver
 * @returns {Object} Partial config in internal spelling; `{}` when prefs is empty
 */
function toInternalConfig(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return {};

  const result = {};

  // Verbatim first, so a mapped key inside one of these sections — such as
  // `skills.research.use_gemini` — lands as an addition rather than being
  // overwritten by the untranslated copy.
  for (const section of VERBATIM_SECTIONS) {
    const value = prefs[section];
    // Copied, not referenced: the resolver memoises its tree, and the KEY_MAP
    // pass below writes into these sections.
    if (value !== undefined) result[section] = structuredClone(value);
  }

  for (const [filePath, internalPath] of KEY_MAP) {
    const value = getPath(prefs, filePath);
    if (value === undefined) continue;

    setPath(result, internalPath, value);

    // A mapped key inside a verbatim section arrived twice: once in the copy
    // above under its file spelling, once here under its internal one. Drop the
    // file spelling so consumers see a single source of truth.
    if (filePath !== internalPath && VERBATIM_SECTIONS.includes(filePath.split('.')[0])) {
      deletePath(result, filePath);
    }
  }

  return result;
}

/**
 * List the config-file keys present in a tree that this build does not model.
 * `fis-config.cjs` reports these so a typo surfaces instead of being silently
 * ignored. Verbatim sections are skipped because their keys are user data.
 *
 * @param {Object|null} prefs - Tree from the preference resolver
 * @returns {string[]} Dot-delimited unknown paths, sorted
 */
function findUnknownKeys(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return [];

  const known = new Set(KEY_MAP.map(([filePath]) => filePath));
  const prefixes = new Set();
  for (const filePath of known) {
    const segments = filePath.split('.');
    for (let i = 1; i < segments.length; i += 1) {
      prefixes.add(segments.slice(0, i).join('.'));
    }
  }

  const unknown = [];

  const walk = (node, trail) => {
    for (const key of Object.keys(node)) {
      const dotted = trail ? `${trail}.${key}` : key;
      if (
        VERBATIM_SECTIONS.includes(dotted)
        || NON_PREFERENCE_KEYS.includes(dotted)
        || known.has(dotted)
      ) continue;

      const value = node[key];
      const isMap = value !== null && typeof value === 'object' && !Array.isArray(value);
      if (isMap && prefixes.has(dotted)) {
        walk(value, dotted);
      } else {
        unknown.push(dotted);
      }
    }
  };

  walk(prefs, '');
  return unknown.sort();
}

module.exports = {
  KEY_MAP,
  VERBATIM_SECTIONS,
  toInternalConfig,
  findUnknownKeys
};
