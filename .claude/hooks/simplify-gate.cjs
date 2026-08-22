#!/usr/bin/env node
/**
 * UserPromptSubmit hook: warns/blocks when ship/commit verbs appear while the
 * working tree carries a large unsimplified diff.
 *
 * Stateless: signals are computed live from `git diff HEAD` at fire time.
 * Hard-blocks ship/merge/pr/deploy/publish, soft-warns commit/finalize/release.
 * Bypass via env FIS_SIMPLIFY_DISABLED=1 or hooks.simplify-gate=false in the
 * FIS config.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { isHookEnabled, loadConfig: loadFisConfig } = require('./lib/fis-config-utils.cjs');

const DEFAULTS = {
  threshold: { locDelta: 400, fileCount: 8, singleFileLoc: 200 },
  gate: {
    enabled: false,
    hardVerbs: ['ship', 'merge', 'pr', 'deploy', 'publish'],
    softVerbs: ['commit', 'finalize', 'release']
  }
};

function readPayload() {
  const stdin = require('node:fs').readFileSync(0, 'utf8').trim();
  return stdin ? JSON.parse(stdin) : {};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a verb only where it reads as a request to act.
 *
 * A bare word match fires on "the ship sailed" and "a merge conflict", so the
 * verb has to arrive as a slash command, behind an asking phrase, or in front of
 * the thing being acted on.
 */
function buildVerbPattern(verbs) {
  if (!verbs.length) return null;
  const verbList = verbs.map(escapeRegex).join('|');
  const actionPrefix = [
    'please',
    'can\\s+you',
    'go\\s+ahead\\s+and',
    "let'?s",
    'ready\\s+to',
    'time\\s+to'
  ].join('|');
  const actionObject = [
    'it',
    'this',
    'that',
    'these',
    'the',
    'my',
    'our',
    'changes?',
    'branch',
    'pr',
    'pull\\s+request',
    'release',
    'package',
    'prod(?:uction)?',
    'staging',
    'now',
    'please',
    'to'
  ].join('|');

  return new RegExp(
    [
      `/(?:fis[:-])?(${verbList})\\b`,
      `\\b(?:${actionPrefix})\\s+(${verbList})\\b`,
      `\\b(${verbList})\\b\\s+(?:${actionObject})\\b`
    ].join('|'),
    'i'
  );
}

function matchedSeverity(prompt, hardVerbs, softVerbs) {
  const hard = buildVerbPattern(hardVerbs);
  const soft = buildVerbPattern(softVerbs);
  // Reject false positives: negated phrasing and "ship on" idioms.
  const negated = new RegExp(
    `\\b(?:don'?t|do not|never|not)\\s+(?:\\w+\\s+){0,2}?(${[...hardVerbs, ...softVerbs].map(escapeRegex).join('|')})\\b`,
    'i'
  );
  if (negated.test(prompt) || /\bship on\b/i.test(prompt)) return null;
  if (hard?.test(prompt)) return 'hard';
  if (soft?.test(prompt)) return 'soft';
  return null;
}

/** The legacy per-project file, which predates `.fis/config.yaml`. */
function readLegacySection(cwd) {
  for (const rel of [path.join('.claude', '.fisrc.json'), '.fisrc.json']) {
    try {
      return JSON.parse(require('node:fs').readFileSync(path.join(cwd, rel), 'utf8'))?.simplify || {};
    } catch { /* try next */ }
  }
  return {};
}

function loadConfig(cwd) {
  // Two sources, both still supported: `.fisrc.json` is what projects have today,
  // and the canonical `.fis/config.yaml` arrives through the shared loader, which
  // also merges the user-level file and maps its snake_case keys. The canonical
  // config wins where the two overlap.
  const legacy = readLegacySection(cwd);
  const resolved = loadFisConfig({
    cwd,
    includeProject: false,
    includeAssertions: false,
    includeLocale: false
  }).simplify || {};
  return {
    threshold: { ...DEFAULTS.threshold, ...(legacy.threshold || {}), ...(resolved.threshold || {}) },
    gate: { ...DEFAULTS.gate, ...(legacy.gate || {}), ...(resolved.gate || {}) }
  };
}

function gitOutput(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return null;
  }
}

function countFileLines(cwd, relPath) {
  try {
    const buf = require('node:fs').readFileSync(path.join(cwd, relPath), 'utf8');
    if (!buf) return 0;
    return buf.endsWith('\n') ? buf.split('\n').length - 1 : buf.split('\n').length;
  } catch {
    return 0;
  }
}

function computeSignals(cwd) {
  // Stateless: combine tracked diff (numstat) with untracked new files (line counts).
  // 1500ms timeout per git call shields against giant worktrees.
  const tracked = gitOutput(['diff', '--numstat', 'HEAD', '--ignore-all-space'], cwd);
  const untracked = gitOutput(['ls-files', '--others', '--exclude-standard'], cwd);
  if (tracked === null && untracked === null) {
    return { totalLoc: 0, fileCount: 0, maxFileLoc: 0, files: [] };
  }
  const files = new Set();
  let totalLoc = 0;
  let maxFileLoc = 0;
  for (const line of (tracked || '').split('\n')) {
    if (!line.trim()) continue;
    const [addedStr, removedStr, file] = line.split('\t');
    const added = Number(addedStr) || 0;
    const removed = Number(removedStr) || 0;
    totalLoc += added + removed;
    if (added > maxFileLoc) maxFileLoc = added;
    files.add(path.normalize(file));
  }
  for (const file of (untracked || '').split('\n')) {
    if (!file.trim()) continue;
    const added = countFileLines(cwd, file);
    totalLoc += added;
    if (added > maxFileLoc) maxFileLoc = added;
    files.add(path.normalize(file));
  }
  return { totalLoc, fileCount: files.size, maxFileLoc, files: [...files] };
}

function evaluateBreaches(signals, threshold) {
  const breaches = [];
  if (signals.totalLoc > threshold.locDelta) breaches.push(`${signals.totalLoc} LOC`);
  if (signals.fileCount > threshold.fileCount) breaches.push(`${signals.fileCount} files`);
  if (signals.maxFileLoc > threshold.singleFileLoc) breaches.push(`single file +${signals.maxFileLoc} LOC`);
  return breaches;
}

function formatMessage(signals, breaches, severity) {
  const noun = severity === 'hard' ? 'shipping' : 'committing';
  return [
    `Unsimplified diff detected: ${breaches.join(', ')}.`,
    `Run code-simplifier on the modified files before ${noun}:`,
    `  Task(subagent_type="code-simplifier", prompt="Simplify keeping behavior identical: <files>")`,
    `Bypass: set FIS_SIMPLIFY_DISABLED=1 or reply 'force' to override.`
  ].join('\n');
}

function emitSoft(message) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: message }
  }));
}

function emitHard(message) {
  console.log(JSON.stringify({ continue: false, decision: 'block', reason: message }));
}

function main() {
  if (process.env.FIS_SIMPLIFY_DISABLED === '1') process.exit(0);
  if (!isHookEnabled('simplify-gate')) process.exit(0);

  const payload = readPayload();
  const prompt = String(payload.prompt || payload.user_prompt || '').trim();
  if (!prompt) process.exit(0);

  const cwd = payload.cwd || process.cwd();
  const config = loadConfig(cwd);
  if (config.gate.enabled === false) process.exit(0);

  const severity = matchedSeverity(prompt, config.gate.hardVerbs, config.gate.softVerbs);
  if (!severity) process.exit(0);

  const signals = computeSignals(cwd);
  const breaches = evaluateBreaches(signals, config.threshold);
  if (breaches.length === 0) process.exit(0);

  const message = formatMessage(signals, breaches, severity);
  if (severity === 'hard') {
    emitHard(message);
    process.exit(2);
  }
  emitSoft(message);
  process.exit(0);
}

try { main(); } catch { process.exit(0); }
