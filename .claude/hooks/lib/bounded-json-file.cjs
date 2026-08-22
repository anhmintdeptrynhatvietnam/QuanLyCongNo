'use strict';

/**
 * bounded-json-file.cjs — JSON reads and writes for state a hook must not trust.
 *
 * Session state lives in a shared temp directory, so anything under it may have
 * been created, replaced, or symlinked by another process before this one arrives.
 * Every read is therefore bounded and shape-checked instead of parsed and
 * believed, and every write refuses to follow a symlink or to touch a path whose
 * ownership or permissions let someone else read it.
 *
 * The limits exist so a corrupt or hostile file cannot exhaust memory inside a
 * hook that has to finish in milliseconds.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_JSON_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ITEMS = 1000;

/**
 * State is private per user. On POSIX that means owned by this user with no group
 * or other bits set; Windows has no comparable cheap check, so it is skipped.
 */
function privateOwnershipIsSafe(info, platform = process.platform, userId = typeof process.getuid === 'function' ? process.getuid() : null) {
  if (platform === 'win32' || userId == null) return true;
  return info?.uid === userId && (info.mode & 0o077) === 0;
}

function assertPrivateOwnership(info, kind) {
  if (!privateOwnershipIsSafe(info)) throw new Error(`unsafe ${kind} owner or permissions`);
}

function secureDirectory(directory) {
  const info = fs.lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('unsafe state directory');
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
  const secured = fs.lstatSync(directory);
  assertPrivateOwnership(secured, 'state directory');
}

/**
 * Create a directory tree under an anchor, checking every level on the way down.
 * `mkdir -p` in one call would happily walk through a symlink planted midway, so
 * each segment is created and re-checked individually.
 */
function ensurePrivateDirectory(directory, anchor) {
  const absoluteAnchor = path.resolve(anchor);
  const absoluteDirectory = path.resolve(directory);
  const relative = path.relative(absoluteAnchor, absoluteDirectory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('state path escapes private root');

  let current = absoluteAnchor;
  fs.mkdirSync(current, { recursive: true, mode: 0o700 });
  secureDirectory(current);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('unsafe state directory');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      fs.mkdirSync(current, { mode: 0o700 });
    }
    secureDirectory(current);
  }
}

/**
 * Walk a path from the root down, refusing a symlink or a foreign owner at any
 * level. Checking only the final component would miss a swapped parent directory.
 */
function privatePathIsSafe(target, root, expectedType) {
  if (!root) return false;
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;

  try {
    const segments = relative.split(path.sep).filter(Boolean);
    let current = absoluteRoot;
    for (let index = 0; index <= segments.length; index += 1) {
      if (index > 0) current = path.join(current, segments[index - 1]);
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || !privateOwnershipIsSafe(info)) return false;
      const final = index === segments.length;
      if ((!final || expectedType === 'directory') && !info.isDirectory()) return false;
      if (final && expectedType === 'file' && !info.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function privateDirectoryIsSafe(directory, root) {
  return privatePathIsSafe(directory, root, 'directory');
}

function privateFileIsSafe(filePath, root) {
  return privatePathIsSafe(filePath, root, 'file');
}

/**
 * Bound the parsed value by depth, item count, and string size. JSON.parse alone
 * accepts structures that are cheap to write and expensive to walk afterwards.
 */
function validateJsonShape(value, depth = 0, budget = { items: 0 }) {
  if (depth > MAX_JSON_DEPTH) return false;
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return true;
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') <= MAX_JSON_BYTES;
  if (typeof value !== 'object') return false;
  const values = Array.isArray(value) ? value : Object.values(value);
  budget.items += values.length;
  if (budget.items > MAX_JSON_ITEMS) return false;
  return values.every(entry => validateJsonShape(entry, depth + 1, budget));
}

function readJsonFile(filePath, root) {
  try {
    if (!privateFileIsSafe(filePath, root)) return null;
    const info = fs.lstatSync(filePath);
    if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_JSON_BYTES) return null;
    const data = fs.readFileSync(filePath, 'utf8');
    if (Buffer.byteLength(data, 'utf8') > MAX_JSON_BYTES) return null;
    const value = JSON.parse(data);
    return validateJsonShape(value) ? value : null;
  } catch {
    return null;
  }
}

function serializeJson(value) {
  if (!validateJsonShape(value)) return null;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  return Buffer.byteLength(data, 'utf8') <= MAX_JSON_BYTES ? data : null;
}

/**
 * Replace a file's contents atomically.
 *
 * `verify` runs after the temp file is durable but before the rename, which is
 * the last moment a caller can abandon the write — it is how the journal checks
 * that nothing else advanced the state while this write was being prepared.
 */
function writeJsonFile({ root, filePath, value, verify = null }) {
  const serialized = serializeJson(value);
  if (!root || !serialized) return false;
  let temporaryPath = null;
  let descriptor = null;
  try {
    ensurePrivateDirectory(path.dirname(filePath), root);
    try {
      const current = fs.lstatSync(filePath);
      if (current.isSymbolicLink() || !current.isFile()) return false;
    } catch (error) {
      if (error?.code !== 'ENOENT') return false;
    }
    temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    if (verify && !verify()) return false;
    fs.renameSync(temporaryPath, filePath);
    temporaryPath = null;
    if (process.platform !== 'win32') fs.chmodSync(filePath, 0o600);
    assertPrivateOwnership(fs.lstatSync(filePath), 'state file');
    return true;
  } catch {
    return false;
  } finally {
    if (descriptor != null) try { fs.closeSync(descriptor); } catch { /* the write already failed */ }
    if (temporaryPath) try { fs.unlinkSync(temporaryPath); } catch { /* nothing to clean up */ }
  }
}

/**
 * Create a file only if it does not exist yet, via `link`, which fails rather
 * than overwriting. Used for the first writer to claim a name — a plain rename
 * would silently replace a file another process had just created.
 */
function writeJsonFileExclusive({ root, filePath, value }) {
  const serialized = serializeJson(value);
  if (!root || !serialized) return false;
  let temporaryPath = null;
  let descriptor = null;
  try {
    ensurePrivateDirectory(path.dirname(filePath), root);
    temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.candidate`;
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.linkSync(temporaryPath, filePath);
    if (process.platform !== 'win32') fs.chmodSync(filePath, 0o600);
    assertPrivateOwnership(fs.lstatSync(filePath), 'state file');
    return true;
  } catch {
    return false;
  } finally {
    if (descriptor != null) try { fs.closeSync(descriptor); } catch { /* the write already failed */ }
    if (temporaryPath) try { fs.unlinkSync(temporaryPath); } catch { /* nothing to clean up */ }
  }
}

module.exports = {
  MAX_JSON_BYTES,
  ensurePrivateDirectory,
  privateDirectoryIsSafe,
  privateFileIsSafe,
  privateOwnershipIsSafe,
  readJsonFile,
  serializeJson,
  validateJsonShape,
  writeJsonFile,
  writeJsonFileExclusive
};
