'use strict';

/**
 * file-lock.cjs — an advisory cross-process lock for a single file.
 *
 * Atomic writes (temp file plus rename) stop a reader from seeing half a
 * document. They do not stop two processes reading the same file, each editing a
 * different part, and the second write erasing the first. Parallel subagents make
 * that reachable for plan files and for the plan pointer store, so the whole
 * read-modify-write span needs guarding, not just the write.
 *
 * Lives in hooks/lib because both hooks and payload scripts need it, and payload
 * scripts may depend on hooks but not the other way round.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Tuning, matching the session-state lock in fis-config-utils.cjs. */
const LOCK_TIMEOUT_MS = 2000;
const LOCK_RETRY_MS = 15;
const LOCK_STALE_MS = 10_000;

/** Sleep without spinning a core, when the platform allows it. */
function sleepSync(ms) {
  if (ms <= 0) return;
  if (typeof SharedArrayBuffer === 'function' && typeof Atomics?.wait === 'function') {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    return;
  }
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Last-resort fallback when Atomics.wait is unavailable.
  }
}

/**
 * Where the lock for a file lives.
 *
 * In the temp directory rather than beside the file: a plan directory is repo
 * content, and a lock file appearing there would end up in someone's commit or in
 * a `git status` they have to explain. Keyed by the resolved path, so two
 * worktrees of one repo lock independently and two names for one file do not.
 *
 * @param {string} filePath - File being guarded
 * @returns {string} Lock path
 */
function getLockPath(filePath) {
  let target = path.resolve(filePath);
  try { target = fs.realpathSync(target); } catch { /* a file yet to exist locks by its resolved path */ }
  const digest = crypto.createHash('sha256').update(target).digest('hex').slice(0, 32);
  return path.join(os.tmpdir(), `fis-lock-${digest}.lock`);
}

/**
 * Run a read-modify-write while holding an exclusive lock on a file.
 *
 * A stale lock is broken after LOCK_STALE_MS so a killed process cannot wedge a
 * file permanently. On timeout the callback runs anyway: refusing to record
 * progress is worse than the remaining chance of a race, and the caller has no
 * better move available.
 *
 * @param {string} filePath - File to guard
 * @param {Function} fn - Work to run while holding the lock
 * @returns {*} Whatever fn returns
 */
function withFileLock(filePath, fn) {
  const lockPath = getLockPath(filePath);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd = null;

  while (fd === null && Date.now() <= deadline) {
    try {
      fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(fd, String(process.pid));
    } catch (err) {
      if (err?.code !== 'EEXIST') break;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lockPath);
      } catch { /* another process cleaned it up first */ }
      sleepSync(LOCK_RETRY_MS);
    }
  }

  try {
    return fn();
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }
}

module.exports = {
  LOCK_TIMEOUT_MS,
  LOCK_STALE_MS,
  getLockPath,
  withFileLock
};
