'use strict';

/**
 * private-json-store.cjs — where session state lives, and who may read it back.
 *
 * State is filed under a derived identity rather than a session id:
 *
 *   $TMP/fis-session-v2/<user>/<runtime>/<session>/binding.json
 *   $TMP/fis-session-v2/<user>/<runtime>/<session>/<project>/live.json
 *   $TMP/fis-session-v2/<user>/<runtime>/<session>/<project>/live-revisions/
 *
 * The binding is written once, by whichever hook sees the session first, and
 * fixes the launch directory for the rest of the session. Later hooks may start
 * in a subdirectory, and without a binding each would derive a slightly different
 * identity and quietly lose the state the first one wrote.
 *
 * `live.json` is not the state. It is a flat copy for anything that only wants to
 * read the current values; the journal directory beside it is authoritative.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSessionStateContext } = require('./runtime-state-identity.cjs');
const {
  MAX_JSON_BYTES,
  readJsonFile,
  serializeJson,
  writeJsonFile: writeBoundedJsonFile,
  writeJsonFileExclusive
} = require('./bounded-json-file.cjs');
const {
  abandonRevision,
  allocateRevision,
  readHighestRevision,
  waitForPredecessor,
  writeRevision
} = require('./immutable-revision-journal.cjs');

/** Keyed by user first, so a shared temp directory cannot mix two accounts. */
function privateRoot(context) {
  if (!isSessionStateContext(context)) return null;
  if (context.storageRoot) return path.resolve(context.storageRoot);
  try {
    return path.join(fs.realpathSync.native(os.tmpdir()), 'fis-session-v2', context.userKey);
  } catch {
    return null;
  }
}

function sessionRoot(context) {
  const root = privateRoot(context);
  return root ? path.join(root, context.runtime, context.sessionKey) : null;
}

/**
 * The project key sits below the session key: one session that moves between
 * projects keeps separate state for each rather than blending them.
 */
function sessionDirectory(context) {
  const root = sessionRoot(context);
  return root ? path.join(root, context.projectKey) : null;
}

function getSessionBindingPath(context) {
  const root = sessionRoot(context);
  return root ? path.join(root, 'binding.json') : null;
}

function getSessionTempPath(context) {
  const directory = sessionDirectory(context);
  return directory ? path.join(directory, 'live.json') : null;
}

function getContextTempPath(context) {
  const directory = sessionDirectory(context);
  return directory ? path.join(directory, 'context.json') : null;
}

/**
 * Records and sequence are separate directories on purpose: reservations churn
 * on every attempt, while records are the history, and pruning one must not walk
 * the other.
 */
function sessionJournalPaths(context, name) {
  const directory = sessionDirectory(context);
  const root = privateRoot(context);
  return directory && root ? {
    root,
    records: path.join(directory, `${name}-revisions`),
    sequence: path.join(directory, `${name}-sequence`)
  } : null;
}

function bindingValue(context) {
  return {
    schemaVersion: 2,
    runtime: context.runtime,
    projectKey: context.projectKey,
    sessionKey: context.sessionKey,
    normalizedSessionId: context.normalizedSessionId,
    canonicalProjectRoot: context.canonicalProjectRoot,
    sessionLaunchRoot: context.sessionLaunchRoot
  };
}

/**
 * Everything except the launch directory must match. The launch directory is the
 * one field a binding is allowed to correct, which is the whole point of having
 * one.
 */
function bindingMatchesContext(binding, context) {
  return Boolean(
    binding && binding.schemaVersion === 2 && binding.runtime === context.runtime &&
    binding.sessionKey === context.sessionKey && binding.normalizedSessionId === context.normalizedSessionId &&
    binding.projectKey === context.projectKey && binding.canonicalProjectRoot === context.canonicalProjectRoot
  );
}

function contextFromBinding(candidate, binding) {
  if (!bindingMatchesContext(binding, candidate)) return null;
  if (candidate.sessionLaunchRoot === binding.sessionLaunchRoot) return candidate;
  const bound = { ...candidate, sessionLaunchRoot: binding.sessionLaunchRoot };
  // Re-verify: the launch root from the binding still has to sit inside the project.
  return isSessionStateContext(bound) ? bound : null;
}

/**
 * Claim the binding for this session, or adopt the one already there.
 *
 * Two hooks can reach this at once. The exclusive write means exactly one wins;
 * the loser re-reads and adopts the winner's binding, so both end up with the
 * same identity instead of one of them writing state the other cannot find.
 */
function bindSessionStateContext(candidate) {
  if (!isSessionStateContext(candidate)) return null;
  const filePath = getSessionBindingPath(candidate);
  const root = privateRoot(candidate);
  if (!filePath || !root) return null;
  const existing = readJsonFile(filePath, root);
  if (existing) return contextFromBinding(candidate, existing);
  if (!writeJsonFileExclusive({ root, filePath, value: bindingValue(candidate) })) {
    const winner = readJsonFile(filePath, root);
    return contextFromBinding(candidate, winner);
  }
  return candidate;
}

/**
 * Resolve against an existing binding without creating one. Hooks other than
 * session start use this: no binding means no session was ever initialized here,
 * and they should do nothing rather than start one.
 */
function resolveBoundSessionContext(candidate) {
  if (!isSessionStateContext(candidate)) return null;
  const root = privateRoot(candidate);
  return root ? contextFromBinding(candidate, readJsonFile(getSessionBindingPath(candidate), root)) : null;
}

function writeJsonFile(context, filePath, value, verify = null) {
  const root = privateRoot(context);
  return Boolean(root && writeBoundedJsonFile({ root, filePath, value, verify }));
}

/**
 * State carries its own identity so a file found in the right place is still
 * checked against the reader's context before it is used.
 */
function stateMatchesContext(state, context, revision = state?.stateRevision) {
  return Boolean(
    state && state.schemaVersion === 2 && state.runtime === context.runtime &&
    state.projectKey === context.projectKey && state.sessionKey === context.sessionKey &&
    state.canonicalProjectRoot === context.canonicalProjectRoot &&
    state.sessionLaunchRoot === context.sessionLaunchRoot &&
    Number.isSafeInteger(state.stateRevision) && state.stateRevision === revision
  );
}

/** The flat copy must be a real file or absent; a symlink there is refused. */
function safeCompatibilityPath(filePath) {
  try {
    const info = fs.lstatSync(filePath);
    return info.isFile() && !info.isSymbolicLink();
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

function readSessionState(context) {
  if (!isSessionStateContext(context)) return null;
  const paths = sessionJournalPaths(context, 'live');
  if (!paths) return null;
  const latest = readHighestRevision(paths.records, Number.MAX_SAFE_INTEGER, paths.root);
  return latest && stateMatchesContext(latest.value, context, latest.revision) ? latest.value : null;
}

/**
 * Read the current state, let the caller modify it, and append the result as the
 * next revision.
 *
 * The read happens after the revision is claimed and after waiting for earlier
 * writers, so the caller modifies the newest state rather than whatever was
 * current when it started. A claim that cannot be honored is abandoned, which
 * tells later readers the gap is closed.
 */
function commitSessionState(context, buildState) {
  if (!isSessionStateContext(context) || !safeCompatibilityPath(getSessionTempPath(context))) return false;
  const paths = sessionJournalPaths(context, 'live');
  if (!paths) return false;
  const revision = allocateRevision({ root: paths.root, directory: paths.sequence });
  if (!revision) return false;
  if (!waitForPredecessor(paths.records, paths.sequence, revision, paths.root)) {
    abandonRevision({
      root: paths.root,
      directory: paths.records,
      revision,
      blockedByRevision: revision - 1
    });
    return false;
  }
  const currentEntry = readHighestRevision(paths.records, revision, paths.root);
  const current = currentEntry && stateMatchesContext(currentEntry.value, context, currentEntry.revision)
    ? currentEntry.value
    : {};
  const updated = buildState({ ...current });
  if (!updated || typeof updated !== 'object') {
    abandonRevision({ root: paths.root, directory: paths.records, revision });
    return false;
  }
  const next = {
    ...updated,
    schemaVersion: 2,
    runtime: context.runtime,
    projectKey: context.projectKey,
    sessionKey: context.sessionKey,
    canonicalProjectRoot: context.canonicalProjectRoot,
    sessionLaunchRoot: context.sessionLaunchRoot,
    stateRevision: revision
  };
  // Identity comes from the context now; a stored origin would let it drift.
  delete next.sessionOrigin;
  if (!writeRevision({ root: paths.root, directory: paths.records, revision, value: next })) {
    abandonRevision({ root: paths.root, directory: paths.records, revision });
    return false;
  }
  // The flat copy is a convenience; failing to refresh it does not fail the commit.
  writeJsonFile(context, getSessionTempPath(context), next);
  return true;
}

function writeSessionState(context, state) {
  if (!state || typeof state !== 'object') return false;
  return commitSessionState(context, () => ({ ...state }));
}

function updateSessionState(context, updater) {
  return commitSessionState(context, current => (
    typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) }
  ));
}

function readContextState(context) {
  if (!isSessionStateContext(context)) return null;
  const paths = sessionJournalPaths(context, 'context');
  return paths ? readHighestRevision(paths.records, Number.MAX_SAFE_INTEGER, paths.root)?.value || null : null;
}

function writeContextState(context, value) {
  if (!isSessionStateContext(context) || !value || typeof value !== 'object' ||
      !safeCompatibilityPath(getContextTempPath(context))) return false;
  const paths = sessionJournalPaths(context, 'context');
  if (!paths) return false;
  const revision = allocateRevision({ root: paths.root, directory: paths.sequence });
  if (!revision) return false;
  if (!waitForPredecessor(paths.records, paths.sequence, revision, paths.root)) {
    abandonRevision({
      root: paths.root,
      directory: paths.records,
      revision,
      blockedByRevision: revision - 1
    });
    return false;
  }
  if (!writeRevision({ root: paths.root, directory: paths.records, revision, value })) {
    abandonRevision({ root: paths.root, directory: paths.records, revision });
    return false;
  }
  writeJsonFile(context, getContextTempPath(context), value);
  return true;
}

module.exports = {
  MAX_JSON_BYTES,
  bindSessionStateContext,
  getContextTempPath,
  getSessionBindingPath,
  getSessionTempPath,
  privateRoot,
  readContextState,
  readJsonFile,
  readSessionState,
  resolveBoundSessionContext,
  serializeJson,
  sessionDirectory,
  updateSessionState,
  writeContextState,
  writeJsonFile,
  writeSessionState
};
