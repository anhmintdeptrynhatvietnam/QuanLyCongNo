'use strict';

/**
 * plan-resolver.cjs — answer "which plan am I working on?" the same way a hook does.
 *
 * The order is deliberately the config's `plan.resolution.order`, read through the
 * same `resolvePlanPath` the session and subagent hooks use, so the accessor and
 * the injected context can never disagree about the active plan. This module adds
 * only what a command line needs on top: an explicit path argument, plans-dir
 * discovery for listing candidates, and a resolution miss that explains itself.
 */

const fs = require('fs');
const path = require('path');

const {
  loadConfig,
  resolvePlanPath,
  isDirectivePlan,
  normalizePath,
  getGitRoot
} = require('../../hooks/lib/fis-config-utils.cjs');

class PlanResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanResolutionError';
  }
}

/**
 * Resolve symlinks so one plan directory is always one string.
 *
 * `git rev-parse` reports real paths while a shell can hand us a symlinked one
 * (`/var` and `/private/var` on macOS, or a symlinked checkout). Without this,
 * the same plan pinned one way and listed the other way compares unequal.
 *
 * @param {string} target - Path to canonicalize
 * @returns {string} Real path, or the input when it does not exist
 */
function canonical(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Find the project root the way payload scripts must: the caller's directory
 * wins, then the git worktree, then the process directory.
 * @param {string} [cwd] - Starting directory
 * @returns {string} Project root
 */
function findProjectRoot(cwd) {
  const start = canonical(cwd || process.cwd());
  const gitRoot = getGitRoot(start);
  return gitRoot ? canonical(gitRoot) : start;
}

/**
 * Absolute plans directory for a project, honoring `paths.plans`.
 * @param {object} [options]
 * @param {string} [options.cwd] - Directory to resolve the project from
 * @param {object} [options.config] - Pre-loaded config
 * @returns {string} Absolute plans directory
 */
function getPlansDir(options = {}) {
  // Config comes from the project being asked about, not the process's own. With
  // --cwd pointing at another project, loading this one's config would list its
  // `paths.plans` against the other project's root.
  const config = options.config || loadConfig({ cwd: options.cwd || process.cwd() });
  const configured = normalizePath(config?.paths?.plans) || 'plans';
  if (path.isAbsolute(configured)) return configured;
  return path.join(findProjectRoot(options.cwd), configured);
}

/** A directory is a plan when it holds a plan.md. Nothing else counts. */
function isPlanDir(dir) {
  try {
    return fs.statSync(path.join(dir, 'plan.md')).isFile();
  } catch {
    return false;
  }
}

/**
 * Every plan directory under the plans dir, newest name first.
 *
 * Plan directories are named `<timestamp>-<slug>`, so a reverse lexical sort is
 * also reverse chronological — no stat call per directory.
 *
 * @param {object} [options] - Same options as getPlansDir
 * @returns {string[]} Absolute plan directories
 */
function listPlanDirs(options = {}) {
  const plansDir = getPlansDir(options);
  let entries;
  try {
    entries = fs.readdirSync(plansDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(plansDir, entry.name))
    .filter(isPlanDir)
    .map(canonical)
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}

/**
 * Interpret an explicit plan argument: an absolute path, a path relative to the
 * caller, a path relative to the project, or a bare plan directory name.
 *
 * @param {string} ref - Plan reference as typed
 * @param {object} [options]
 * @param {string} [options.cwd] - Caller's directory
 * @param {object} [options.config] - Pre-loaded config
 * @returns {string} Absolute plan directory
 */
function resolveExplicit(ref, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const projectRoot = findProjectRoot(cwd);
  const plansDir = getPlansDir({ ...options, cwd });

  // A file argument (plans/x/plan.md, or a phase file) means its plan directory.
  const trimmed = String(ref).trim().replace(/[/\\]+$/, '');
  const candidates = [
    path.resolve(cwd, trimmed),
    path.resolve(projectRoot, trimmed),
    path.join(plansDir, trimmed)
  ];

  for (const candidate of candidates) {
    const dir = /\.md$/i.test(candidate) ? path.dirname(candidate) : candidate;
    if (isPlanDir(dir)) return canonical(dir);
  }

  const searched = [...new Set(candidates.map((candidate) => path.dirname(candidate)))];
  throw new PlanResolutionError(`no plan at "${ref}" (looked under ${searched.join(', ')})`);
}

/**
 * Resolve the plan to act on.
 *
 * @param {object} [options]
 * @param {string} [options.explicit] - Plan path or name given on the command line
 * @param {string} [options.cwd] - Caller's directory
 * @param {string} [options.sessionId] - Session id, defaults to FIS_SESSION_ID
 * @param {object} [options.config] - Pre-loaded config
 * @returns {{planDir: string, resolvedBy: 'explicit'|'session'|'pointer'|'branch',
 *   directive: boolean}}
 */
function resolvePlan(options = {}) {
  const cwd = canonical(options.cwd || process.cwd());

  if (options.explicit) {
    return { planDir: resolveExplicit(options.explicit, options), resolvedBy: 'explicit', directive: true };
  }

  const config = options.config || loadConfig({ cwd });
  const sessionId = options.sessionId ?? process.env.FIS_SESSION_ID ?? null;
  const resolved = resolvePlanPath(sessionId, config, { cwd });

  if (resolved.path) {
    // A resolved path that no longer holds a plan.md is a miss, not a hit: the
    // plan was renamed, archived, or deleted since it was pinned.
    const absolute = path.isAbsolute(resolved.path) ? resolved.path : path.join(findProjectRoot(cwd), resolved.path);
    if (isPlanDir(absolute)) {
      return {
        planDir: canonical(absolute),
        resolvedBy: resolved.resolvedBy,
        directive: isDirectivePlan(resolved.resolvedBy)
      };
    }
  }

  const candidates = listPlanDirs({ cwd, config });
  const hint = candidates.length
    ? `\nCandidates:\n${candidates.slice(0, 10).map((dir) => `  ${path.basename(dir)}`).join('\n')}`
    : `\nNo plans found under ${getPlansDir({ cwd, config })}`;

  throw new PlanResolutionError(`no active plan for this worktree and branch${hint}`);
}

module.exports = {
  PlanResolutionError,
  canonical,
  findProjectRoot,
  getPlansDir,
  isPlanDir,
  listPlanDirs,
  resolveExplicit,
  resolvePlan
};
