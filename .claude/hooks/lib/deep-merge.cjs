/**
 * Deep merge shared by the preference resolver and the hook config loader.
 *
 * Extracted so both can use one implementation without a require cycle:
 * `fis-config-utils.cjs` loads the resolver, and the resolver merges the
 * project config over the user config before the loader ever sees it.
 */

'use strict';

/**
 * Keys that reach `Object.prototype` instead of the object being built.
 * Config files are committed and can arrive through a merge request, so a
 * plain assignment of one of these would let a config change the prototype of
 * every object that shares it.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep merge objects (source values override target, nested objects merged recursively)
 * Arrays are replaced entirely (not concatenated) to avoid duplicate entries
 *
 * IMPORTANT: Empty objects {} are treated as "inherit from parent", not "replace with empty".
 * This allows global config to set hooks.foo: false and have it persist even when
 * local config has hooks: {} (empty = inherit, not reset to defaults).
 *
 * @param {Object} target - Base object
 * @param {Object} source - Object to merge (takes precedence)
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue;

    const sourceVal = source[key];
    const targetVal = target[key];

    // Arrays: replace entirely (don't concatenate)
    if (Array.isArray(sourceVal)) {
      result[key] = [...sourceVal];
    }
    // Objects: recurse (but not null)
    // SKIP empty objects - treat {} as "inherit from parent"
    else if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      // Empty object = inherit (don't override parent values)
      if (Object.keys(sourceVal).length === 0) {
        // Keep target value unchanged - empty source means "no override"
        continue;
      }
      result[key] = deepMerge(targetVal || {}, sourceVal);
    }
    // Primitives: source wins
    else {
      result[key] = sourceVal;
    }
  }
  return result;
}

module.exports = { deepMerge, UNSAFE_KEYS };
