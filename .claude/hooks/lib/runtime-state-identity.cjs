'use strict';

/**
 * runtime-state-identity.cjs — identity for a session's state, derived rather
 * than trusted.
 *
 * Session state used to be keyed on the session id alone, which meant a state
 * file could be read from a different project, a different worktree, or another
 * user's temp directory as long as the id matched. This derives a context from
 * four things instead — runtime, canonical project root, launch directory, and
 * the operating-system user — so state written by one session can only be read
 * back by a session that genuinely belongs to the same place.
 *
 * Every value is normalized before it is hashed, because on macOS `/var` is a
 * symlink to `/private/var` and on Windows drive letters and separators vary, so
 * two spellings of one directory would otherwise produce two identities.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_SESSION_ID_LENGTH = 200;
/** A session id becomes part of a filename, so it may not traverse or hide. */
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const RUNTIME_MARKER_MAX_BYTES = 4096;

/**
 * The installer stamps this beside the hooks to record which runtime the payload
 * was installed for. FIS ships one payload that DAI can install for Claude Code,
 * Codex, or Cursor, and state from one must not be read by another.
 */
const RUNTIME_MARKER_FILE = '.fis-runtime.json';
const SUPPORTED_RUNTIMES = new Set(['claude-code', 'codex', 'cursor']);

/**
 * Claude Code is assumed when the marker is missing. Only Claude Code executes
 * these hooks today, and existing installs have no marker: treating its absence
 * as "unknown" would silently disable session state everywhere until DAI writes
 * the file. The marker still wins whenever it is present.
 */
const DEFAULT_RUNTIME = 'claude-code';

function normalizeSessionId(sessionId) {
  if (typeof sessionId !== 'string') return null;
  const normalized = sessionId.trim();
  if (!normalized || normalized.length > MAX_SESSION_ID_LENGTH) return null;
  if (normalized === '.' || normalized === '..') return null;
  return SAFE_SESSION_ID_PATTERN.test(normalized) ? normalized : null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Case and separators only matter on Windows; elsewhere paths stay verbatim. */
function normalizeProjectPath(value, platform = process.platform) {
  let normalized = path.normalize(value);
  if (platform === 'win32') {
    normalized = normalized.replace(/\\/g, '/').toLowerCase();
  }
  return normalized;
}

function pathContains(parent, child, platform = process.platform) {
  const normalizedParent = normalizeProjectPath(parent, platform);
  const normalizedChild = normalizeProjectPath(child, platform);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Strip GIT_* from the environment before running git. A caller inside a hook may
 * have inherited GIT_DIR or GIT_WORK_TREE from an outer git command, which would
 * make `rev-parse` answer about that repository instead of this directory.
 */
function gitEnvironment(environment = process.env) {
  const clean = { ...environment };
  for (const key of Object.keys(clean)) {
    if (key === 'GIT_CONFIG_COUNT' || key.startsWith('GIT_')) delete clean[key];
  }
  return clean;
}

/**
 * Resolve the directory that identifies the project: the git worktree root when
 * there is one, otherwise the working directory itself.
 *
 * The git root is only adopted when it contains the working directory. A
 * redirected root — a `.git` file pointing elsewhere, or a repository mounted
 * from outside — would otherwise let two unrelated projects share one identity.
 */
function resolveCanonicalProjectRoot(cwd, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const realpath = dependencies.realpath || fs.realpathSync.native;
  const runGit = dependencies.runGit || ((workingDirectory) => execFileSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    {
      cwd: workingDirectory,
      env: gitEnvironment(),
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    }
  ).trim());

  try {
    const canonicalCwd = realpath(path.resolve(cwd));
    let candidate = canonicalCwd;
    try {
      const gitRoot = runGit(canonicalCwd);
      if (gitRoot) {
        const canonicalGitRoot = realpath(path.resolve(gitRoot));
        if (pathContains(canonicalGitRoot, canonicalCwd, platform)) candidate = canonicalGitRoot;
      }
    } catch {
      // Not a git repository, or git is unavailable: the working directory stands.
    }
    return normalizeProjectPath(candidate, platform);
  } catch {
    return null;
  }
}

/** The marker sits one level above this module, beside the hook scripts. */
function defaultRuntimeMarkerPath(moduleDirectory = __dirname) {
  return path.join(moduleDirectory, '..', RUNTIME_MARKER_FILE);
}

/**
 * Read the runtime marker, or return null when it is absent or untrustworthy.
 * A symlink is refused rather than followed: the marker decides which runtime's
 * state this payload may touch, so it must be a real file the installer wrote.
 */
function readRuntimeMarker(markerPath = defaultRuntimeMarkerPath()) {
  try {
    const info = fs.lstatSync(markerPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > RUNTIME_MARKER_MAX_BYTES) return null;
    const data = fs.readFileSync(markerPath, 'utf8');
    if (Buffer.byteLength(data, 'utf8') > RUNTIME_MARKER_MAX_BYTES) return null;
    const parsed = JSON.parse(data);
    if (parsed?.schemaVersion !== 1 || !SUPPORTED_RUNTIMES.has(parsed.runtime)) return null;
    return parsed.runtime;
  } catch {
    return null;
  }
}

/**
 * Identify the user, so two accounts on one machine cannot read each other's
 * session state out of a shared temp directory.
 */
function currentUserKey() {
  if (typeof process.getuid === 'function') return `uid-${process.getuid()}`;
  try {
    return `user-${stableHash(os.userInfo().username).slice(0, 24)}`;
  } catch {
    return null;
  }
}

/**
 * Build a session context, or return null when any part of the identity is
 * missing. Returning null is the normal outcome outside a real session — callers
 * treat it as "no state available" and carry on rather than failing.
 */
function createCandidateSessionStateContext(options = {}) {
  const sessionId = normalizeSessionId(options.sessionId);
  const runtime = options.runtime || readRuntimeMarker(options.markerPath) || DEFAULT_RUNTIME;
  let sessionLaunchRoot = null;
  try {
    const realpath = options.dependencies?.realpath || fs.realpathSync.native;
    sessionLaunchRoot = normalizeProjectPath(
      realpath(path.resolve(options.cwd || process.cwd())),
      options.dependencies?.platform
    );
  } catch {
    // The launch directory is gone or unreadable; there is no identity to build.
  }
  const canonicalProjectRoot = sessionLaunchRoot
    ? resolveCanonicalProjectRoot(sessionLaunchRoot, options.dependencies)
    : null;
  const userKey = options.userKey || currentUserKey();
  if (!sessionId || !SUPPORTED_RUNTIMES.has(runtime) || !canonicalProjectRoot || !sessionLaunchRoot || !userKey) return null;

  return Object.freeze({
    schemaVersion: 2,
    runtime,
    canonicalProjectRoot,
    sessionLaunchRoot,
    projectKey: stableHash(canonicalProjectRoot),
    normalizedSessionId: sessionId,
    sessionKey: stableHash(sessionId),
    userKey,
    storageRoot: options.storageRoot ? path.resolve(options.storageRoot) : null
  });
}

/**
 * Re-verify a context rather than trusting its shape. A context can arrive from
 * a stored binding, so the hashes are recomputed and the launch directory is
 * re-checked against the project root before it is honored.
 */
function isSessionStateContext(value) {
  return Boolean(
    value && value.schemaVersion === 2 && SUPPORTED_RUNTIMES.has(value.runtime) &&
    typeof value.canonicalProjectRoot === 'string' &&
    typeof value.sessionLaunchRoot === 'string' &&
    pathContains(value.canonicalProjectRoot, value.sessionLaunchRoot) &&
    value.projectKey === stableHash(value.canonicalProjectRoot) &&
    normalizeSessionId(value.normalizedSessionId) === value.normalizedSessionId &&
    value.sessionKey === stableHash(value.normalizedSessionId) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(value.userKey || '')
  );
}

module.exports = {
  DEFAULT_RUNTIME,
  RUNTIME_MARKER_FILE,
  SUPPORTED_RUNTIMES,
  createCandidateSessionStateContext,
  defaultRuntimeMarkerPath,
  gitEnvironment,
  isSessionStateContext,
  normalizeProjectPath,
  normalizeSessionId,
  pathContains,
  readRuntimeMarker,
  resolveCanonicalProjectRoot,
  stableHash
};
