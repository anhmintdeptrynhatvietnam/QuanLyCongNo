/**
 * Worktree-persistent current-plan pointer.
 *
 * FIS already pins a plan for the duration of a Claude session: the session
 * state file that `set-active-plan.cjs` writes and the hooks read. That pointer
 * dies with the session, so the next session falls back to guessing from the
 * branch name.
 *
 * This is the second, complementary pointer — the one that survives a restart.
 * It is keyed by worktree and branch, so two worktrees of the same repository on
 * different branches pin different plans, and it lives under the user directory
 * rather than in the checkout: the pointer is a per-machine convenience, and
 * committing it would make one developer's cursor everyone's.
 *
 * It holds nothing but a path. The plan files are the plan, so a lost or deleted
 * pointer file costs a resolution shortcut and no state — anything here can be
 * re-established by pointing at the plan directory again.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getUserConfigDir } = require('./fis-prefs-resolver.cjs');
const { getGitRoot, getGitBranch } = require('./fis-config-utils.cjs');
const { withFileLock } = require('./file-lock.cjs');

const POINTER_BASENAME = 'plan-pointers.json';

/** Schema version of the pointer store, so a future shape change is detectable. */
const POINTER_STORE_VERSION = 1;

/**
 * Entries kept per store. The pointer is a convenience, so an unbounded file
 * that accumulates one entry per branch anyone ever checked out is worse than
 * forgetting the least recently used ones.
 */
const MAX_ENTRIES = 200;

/** Absolute path to the pointer store. */
function getPointerStorePath() {
  return path.join(getUserConfigDir(), POINTER_BASENAME);
}

/**
 * Identify the worktree and branch a pointer belongs to.
 *
 * `git rev-parse --show-toplevel` reports the *worktree* root rather than the
 * shared repository, which is what makes two worktrees of one repository
 * independent. Outside a repository the starting directory stands in, so the
 * pointer still works in a plain directory.
 *
 * @param {string} startDir - Directory to identify from
 * @returns {{ worktree: string, branch: string|null, key: string }}
 */
function identifyScope(startDir) {
  const cwd = realPath(startDir || process.cwd());
  const toplevel = getGitRoot(cwd);
  // `git rev-parse` already reports a real path, so resolving symlinks here too
  // keeps one worktree from occupying two slots when it is reached through one.
  const worktree = toplevel ? realPath(toplevel) : cwd;
  const branch = getGitBranch(cwd) || null;

  return { worktree, branch, key: pointerKey(worktree, branch) };
}

/** Resolve symlinks, falling back to a plain resolve for a path that is gone. */
function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch (e) {
    return path.resolve(target);
  }
}

/**
 * Compose the store key. A detached HEAD has no branch, so those pointers share
 * one slot per worktree rather than being unaddressable.
 */
function pointerKey(worktree, branch) {
  return `${worktree}\u0000${branch || ''}`;
}

/** Read the store, treating any unreadable or foreign-shaped file as empty. */
function readStore() {
  const storePath = getPointerStorePath();

  let raw;
  try {
    raw = fs.readFileSync(storePath, 'utf8');
  } catch (e) {
    return { version: POINTER_STORE_VERSION, pointers: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    const pointers = parsed?.pointers;
    if (parsed?.version !== POINTER_STORE_VERSION || !pointers || typeof pointers !== 'object') {
      return { version: POINTER_STORE_VERSION, pointers: {} };
    }
    // Rebuilt rather than reused: JSON.parse makes `__proto__` an own property,
    // and this object is indexed by keys derived from paths.
    const safe = Object.create(null);
    for (const key of Object.keys(pointers)) {
      if (key === '__proto__') continue;
      const entry = pointers[key];
      if (entry && typeof entry === 'object' && typeof entry.planDir === 'string') {
        safe[key] = { planDir: entry.planDir, updatedAt: Number(entry.updatedAt) || 0 };
      }
    }
    return { version: POINTER_STORE_VERSION, pointers: safe };
  } catch (e) {
    return { version: POINTER_STORE_VERSION, pointers: {} };
  }
}

/**
 * Write the store atomically.
 *
 * A half-written pointer file would be discarded on the next read, which is
 * recoverable — but it would also be discarded *silently*, taking every other
 * worktree's pointer with it. Temp plus rename keeps one interrupted write from
 * costing unrelated entries.
 *
 * @returns {boolean} Whether the write landed
 */
function writeStore(store) {
  const storePath = getPointerStorePath();
  const tmpPath = `${storePath}.${process.pid}.${Math.random().toString(36).slice(2)}`;

  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    // 0600: the store holds the filesystem paths this user is working in, and it
    // lives in a home directory that may be shared or synced.
    fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmpPath, storePath);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* the temp file may not exist */ }
    return false;
  }
}

/** Drop the oldest entries once the store exceeds its cap. */
function evictOldest(pointers) {
  const keys = Object.keys(pointers);
  if (keys.length <= MAX_ENTRIES) return pointers;

  const kept = keys
    .sort((a, b) => (pointers[b].updatedAt || 0) - (pointers[a].updatedAt || 0))
    .slice(0, MAX_ENTRIES);

  const trimmed = Object.create(null);
  for (const key of kept) trimmed[key] = pointers[key];
  return trimmed;
}

/**
 * Pin a plan directory for the current worktree and branch.
 *
 * @param {string} planDir - Plan directory, absolute or relative to `cwd`
 * @param {object} [options]
 * @param {string} [options.cwd] - Directory identifying the worktree
 * @returns {{ ok: boolean, scope: object, planDir: string }}
 */
function setPointer(planDir, options = {}) {
  const cwd = options.cwd || process.cwd();
  const scope = identifyScope(cwd);
  const absolute = path.resolve(cwd, planDir);

  // One store file holds every worktree's pin, so two worktrees pinning at once
  // would each read the store and the second write would drop the other's entry.
  const ok = withFileLock(getPointerStorePath(), () => {
    const store = readStore();
    store.pointers[scope.key] = { planDir: absolute, updatedAt: Date.now() };
    store.pointers = evictOldest(store.pointers);
    return writeStore(store);
  });

  return { ok, scope, planDir: absolute };
}

/**
 * Read the pinned plan directory for the current worktree and branch.
 *
 * A pointer at a directory that no longer holds a `plan.md` is reported as a
 * miss rather than returned: the plan was deleted, renamed, or belongs to a
 * branch that has since been rebuilt, and resolution should fall through to the
 * branch match instead of handing back a path that cannot be read.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Directory identifying the worktree
 * @returns {{ planDir: string|null, scope: object, stale: boolean }}
 */
function getPointer(options = {}) {
  const cwd = options.cwd || process.cwd();
  const scope = identifyScope(cwd);
  const entry = readStore().pointers[scope.key];

  if (!entry) return { planDir: null, scope, stale: false };

  try {
    if (!fs.existsSync(path.join(entry.planDir, 'plan.md'))) {
      return { planDir: null, scope, stale: true };
    }
  } catch (e) {
    return { planDir: null, scope, stale: true };
  }

  return { planDir: entry.planDir, scope, stale: false };
}

/**
 * Remove the pointer for the current worktree and branch.
 * @returns {{ ok: boolean, existed: boolean, scope: object }}
 */
function clearPointer(options = {}) {
  const scope = identifyScope(options.cwd || process.cwd());

  return withFileLock(getPointerStorePath(), () => {
    const store = readStore();
    const existed = Object.hasOwn(store.pointers, scope.key);
    if (!existed) return { ok: true, existed: false, scope };

    delete store.pointers[scope.key];
    return { ok: writeStore(store), existed: true, scope };
  });
}

/**
 * Every pointer in the store, newest first. Used by `list` to show which plans
 * are pinned elsewhere, and by the tests to assert eviction.
 *
 * @returns {Array<{ worktree: string, branch: string|null, planDir: string, updatedAt: number }>}
 */
function listPointers() {
  const { pointers } = readStore();

  return Object.keys(pointers)
    .map((key) => {
      const [worktree, branch] = key.split('\u0000');
      return { worktree, branch: branch || null, ...pointers[key] };
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

module.exports = {
  POINTER_STORE_VERSION,
  MAX_ENTRIES,
  getPointerStorePath,
  identifyScope,
  pointerKey,
  setPointer,
  getPointer,
  clearPointer,
  listPointers
};
