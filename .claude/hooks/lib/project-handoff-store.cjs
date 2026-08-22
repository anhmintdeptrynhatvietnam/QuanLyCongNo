'use strict';

/**
 * project-handoff-store.cjs — what one session leaves behind for the next.
 *
 * Session state lives in a temp directory and dies with the machine's next
 * cleanup. A checkpoint is the durable part: the branch, active plan, todos, and
 * modified files a finished session hands to whatever session opens the project
 * afterwards. It lives under `~/.fis`, keyed by project rather than by session.
 *
 * A checkpoint is read back into a prompt, so it is validated field by field on
 * the way in and on the way out. The stored file is the boundary between two
 * sessions, and a checkpoint that grew a field nobody expected is treated as
 * unusable rather than rendered.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSessionStateContext, pathContains } = require('./runtime-state-identity.cjs');
const { privateFileIsSafe } = require('./bounded-json-file.cjs');
const {
  allocateRevision,
  readHighestRevision,
  revisionName,
  writeRevision
} = require('./immutable-revision-journal.cjs');

/** A handoff older than this is stale advice, not context. */
const EXPIRY_DAYS = 7;

/**
 * Resolve a directory to its real path, tolerating one that does not exist yet by
 * resolving its parent. A symlink is refused outright: the store must not be
 * redirectable by planting a link where it expects a directory.
 */
function canonicalCandidate(candidate) {
  const absolute = path.resolve(candidate);
  try {
    const info = fs.lstatSync(absolute);
    if (info.isSymbolicLink() || !info.isDirectory()) return null;
    return fs.realpathSync.native(absolute);
  } catch (error) {
    if (error?.code !== 'ENOENT') return null;
    try {
      return path.join(fs.realpathSync.native(path.dirname(absolute)), path.basename(absolute));
    } catch {
      return null;
    }
  }
}

/**
 * Resolve a runtime's home for comparison only, following a symlink instead of
 * refusing it. `canonicalCandidate` rejects a symlink because the store must not
 * be redirectable, but a runtime directory is frequently a link to somewhere else,
 * and dropping it from the comparison would silently stop the guard below from
 * guarding anything.
 */
function canonicalProviderDirectory(candidate) {
  const absolute = path.resolve(candidate);
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(absolute)), path.basename(absolute));
    } catch {
      return null;
    }
  }
}

function homeDirectory(environment) {
  return environment.HOME || environment.USERPROFILE || os.homedir();
}

/**
 * Locate `~/.fis`, refusing any location inside a runtime's own home.
 *
 * A runtime directory such as `~/.claude` is managed by that tool: it gets synced,
 * reset, and rewritten by installs. Cross-session handoffs kept there would
 * vanish without explanation, so an override pointing inside one is rejected
 * rather than honored.
 */
function resolveFisHome(environment = process.env) {
  const home = homeDirectory(environment);
  const candidate = canonicalCandidate(environment.FIS_HOME || path.join(home, '.fis'));
  if (!candidate) return null;
  const providerCandidates = [
    environment.FIS_CLAUDE_HOME,
    environment.CODEX_HOME,
    path.join(home, '.claude'),
    path.join(home, '.codex'),
    path.join(home, '.cursor')
  ].filter(Boolean).map(canonicalProviderDirectory).filter(Boolean);
  return providerCandidates.some(provider => pathContains(provider, candidate)) ? null : candidate;
}

function projectStatePaths(context, environment = process.env) {
  const root = resolveFisHome(environment);
  if (!root || !isSessionStateContext(context)) return null;
  const directory = path.join(root, 'session-states', 'v2', context.runtime, context.projectKey);
  return {
    root,
    directory,
    checkpoints: path.join(directory, 'checkpoints'),
    revisions: path.join(directory, 'revisions')
  };
}

/**
 * Accept only the exact shape a checkpoint is allowed to have.
 *
 * The allow-list is deliberate: an unknown field means the file was written by
 * something else, or by a future version whose meaning this code cannot know, and
 * either way it should not reach a prompt. The size caps bound what a project can
 * inject through a branch name, a todo, or a path.
 */
function validCheckpoint(value, context) {
  if (!value || value.schemaVersion !== 2 || value.runtime !== context.runtime || value.projectKey !== context.projectKey) return false;
  const allowedFields = new Set([
    'schemaVersion', 'runtime', 'projectKey', 'sourceSessionKey', 'eventRevision',
    'snapshotRevision', 'generatedAt', 'expiresAt', 'branch', 'activePlan',
    'todos', 'modifiedFiles'
  ]);
  if (Object.keys(value).some(key => !allowedFields.has(key))) return false;
  if (!/^[a-f0-9]{64}$/.test(value.sourceSessionKey || '')) return false;
  if (!Number.isSafeInteger(value.eventRevision) || value.eventRevision < 1) return false;
  if (!Number.isSafeInteger(value.snapshotRevision) || value.snapshotRevision < 1) return false;
  if (!Number.isFinite(Date.parse(value.generatedAt || '')) || !Number.isFinite(Date.parse(value.expiresAt || ''))) return false;
  if (typeof value.branch !== 'string' || Buffer.byteLength(value.branch, 'utf8') > 512) return false;
  if (value.activePlan != null && (typeof value.activePlan !== 'string' || Buffer.byteLength(value.activePlan, 'utf8') > 4096)) return false;
  if (!Array.isArray(value.todos) || value.todos.length > 200 || !value.todos.every(todo => (
    todo && typeof todo === 'object' && typeof todo.content === 'string' &&
    Buffer.byteLength(todo.content, 'utf8') <= 4096 && typeof todo.status === 'string'
  ))) return false;
  return Array.isArray(value.modifiedFiles) && value.modifiedFiles.length <= 100 &&
    value.modifiedFiles.every(file => typeof file === 'string' && Buffer.byteLength(file, 'utf8') <= 4096);
}

/**
 * Load the newest usable checkpoint, or null.
 *
 * A checkpoint written by this same session is skipped: the point is to inherit
 * another session's work, and re-reading your own would echo state you already
 * have back into your prompt.
 */
function loadProjectCheckpoint(context, options = {}) {
  const paths = projectStatePaths(context, options.environment);
  if (!paths) return null;
  const latest = readHighestRevision(paths.checkpoints, Number.MAX_SAFE_INTEGER, paths.root);
  const value = latest?.value;
  if (!value || value.eventRevision !== latest.revision || !validCheckpoint(value, context) ||
      Date.parse(value.expiresAt) <= (options.now || Date.now())) return null;
  if (value.sourceSessionKey === context.sessionKey) return null;
  return value;
}

function allocateEventRevision(context, options = {}) {
  const paths = projectStatePaths(context, options.environment);
  return paths ? allocateRevision({ root: paths.root, directory: paths.revisions }) : null;
}

function hasRevisionReservation(paths, revision) {
  return privateFileIsSafe(path.join(paths.revisions, `${revisionName(revision)}.reserve`), paths.root);
}

/**
 * Write a checkpoint at a revision this process already reserved.
 *
 * Requiring the reservation is what stops a caller from writing at an arbitrary
 * number and overwriting a checkpoint it never coordinated on. If the revision
 * turns out to be filled already, an existing valid checkpoint counts as success
 * — the state is recorded, which is all the caller wanted.
 */
function writeProjectCheckpoint(context, data, options = {}) {
  const paths = projectStatePaths(context, options.environment);
  if (!paths || !Number.isSafeInteger(options.eventRevision) || !Number.isSafeInteger(options.snapshotRevision) ||
      !hasRevisionReservation(paths, options.eventRevision)) return false;
  const generatedAt = new Date(options.generatedAt || Date.now()).toISOString();
  const checkpoint = {
    schemaVersion: 2,
    runtime: context.runtime,
    projectKey: context.projectKey,
    sourceSessionKey: context.sessionKey,
    eventRevision: options.eventRevision,
    snapshotRevision: options.snapshotRevision,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + EXPIRY_DAYS * 86400000).toISOString(),
    branch: typeof data.branch === 'string' ? data.branch : '',
    activePlan: typeof data.activePlan === 'string' ? data.activePlan : null,
    todos: Array.isArray(data.todos) ? data.todos.map(todo => ({
      content: String(todo?.content || ''),
      status: String(todo?.status || 'pending')
    })) : [],
    modifiedFiles: Array.isArray(data.modifiedFiles) ? data.modifiedFiles.map(String) : []
  };
  if (!validCheckpoint(checkpoint, context)) return false;
  const existing = readHighestRevision(paths.checkpoints, options.eventRevision + 1, paths.root);
  if (existing?.revision === options.eventRevision) return validCheckpoint(existing.value, context);
  return writeRevision({
    root: paths.root,
    directory: paths.checkpoints,
    revision: options.eventRevision,
    value: checkpoint
  });
}

module.exports = {
  EXPIRY_DAYS,
  allocateEventRevision,
  loadProjectCheckpoint,
  projectStatePaths,
  resolveFisHome,
  validCheckpoint,
  writeProjectCheckpoint
};
