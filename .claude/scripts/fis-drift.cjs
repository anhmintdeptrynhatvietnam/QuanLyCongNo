#!/usr/bin/env node
'use strict';

/**
 * fis-drift — does this installation still match what the kit shipped?
 *
 * DAI renders the answer; this script decides it. Keeping the comparison in one
 * shipped place is the point: DAI, CI, and an agent inspecting the repo all get
 * the same verdict instead of three implementations that disagree at the edges.
 *
 * Usage:
 *   node .claude/scripts/fis-drift.cjs check           human-readable report
 *   node .claude/scripts/fis-drift.cjs check --json    one JSON object on stdout
 *
 * Exit codes: 0 no drift, 1 drift found, 2 could not run the comparison.
 * Exit 2 is not "clean" — it means the question could not be asked.
 *
 * Contract: docs/reference/dai-drift-contract.md
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  CLAUDE_DIR,
  SCHEMA_VERSION,
  SKILLS_DIR,
  KIT_BASELINE_FILE,
  listBaselineFiles,
  hashFile,
} = require('./lib/kit-baseline-builder.cjs');

const EXIT_CLEAN = 0;
const EXIT_DRIFT = 1;
const EXIT_ERROR = 2;

const SEVERITY_RANK = { error: 3, warning: 2, info: 1 };

/** Info findings are reported but do not by themselves make an install drifted. */
const DRIFT_SEVERITIES = new Set(['error', 'warning']);

const SETTINGS_FILE = 'settings.json';

/** Matches the hook script in a native settings command, whatever quoting it uses. */
const HOOK_COMMAND_PATTERN = /hooks[/\\]([A-Za-z0-9._-]+)\.cjs/;

class DriftError extends Error {}

// ── Loading ─────────────────────────────────────────────────────────────────

function readJson(absPath, label) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    throw new DriftError(`Cannot read ${label}: ${absPath}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new DriftError(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertSupportedSchema(baseline, label) {
  if (baseline.kitBaselineSchema !== SCHEMA_VERSION) {
    throw new DriftError(
      `${label} declares schema ${JSON.stringify(baseline.kitBaselineSchema)}, ` +
        `this checker understands ${SCHEMA_VERSION}`
    );
  }
}

function loadBaselines(claudeDir) {
  const index = readJson(path.join(claudeDir, KIT_BASELINE_FILE), KIT_BASELINE_FILE);
  assertSupportedSchema(index, KIT_BASELINE_FILE);

  const refs = index.baselines || {};
  for (const key of ['hookExpectations', 'skillHashes']) {
    if (typeof refs[key] !== 'string') {
      throw new DriftError(`${KIT_BASELINE_FILE} is missing baselines.${key}`);
    }
  }

  const hookExpectations = readJson(path.join(claudeDir, refs.hookExpectations), refs.hookExpectations);
  assertSupportedSchema(hookExpectations, refs.hookExpectations);

  const skillHashes = readJson(path.join(claudeDir, refs.skillHashes), refs.skillHashes);
  assertSupportedSchema(skillHashes, refs.skillHashes);

  return { index, hookExpectations, skillHashes };
}

// ── Hook wiring ─────────────────────────────────────────────────────────────

/**
 * Reduce a wiring block list to `[{ matcher, hook }]` in execution order, so the
 * baseline's plain hook names and settings.json's command objects can be
 * compared as the same thing.
 */
function flattenBlocks(blocks, extractHook) {
  const pairs = [];
  if (!Array.isArray(blocks)) return pairs;
  for (const block of blocks) {
    const hooks = Array.isArray(block?.hooks) ? block.hooks : [];
    for (const entry of hooks) {
      const hook = extractHook(entry);
      if (hook) pairs.push({ matcher: String(block.matcher ?? ''), hook });
    }
  }
  return pairs;
}

function hookNameFromCommand(entry) {
  const source = [entry?.command, ...(Array.isArray(entry?.args) ? entry.args : [])]
    .filter(value => typeof value === 'string')
    .join(' ');
  const match = HOOK_COMMAND_PATTERN.exec(source);
  return match ? match[1] : null;
}

/** Matchers a hook is wired under, in order, keyed by hook name. */
function groupMatchersByHook(pairs) {
  const byHook = new Map();
  for (const { matcher, hook } of pairs) {
    if (!byHook.has(hook)) byHook.set(hook, []);
    byHook.get(hook).push(matcher);
  }
  return byHook;
}

function compareHookWiring(claudeDir, hookExpectations, findings) {
  const settingsPath = path.join(claudeDir, SETTINGS_FILE);
  const settings = readJson(settingsPath, SETTINGS_FILE);
  const liveEvents = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  const baselineEvents = hookExpectations.events || {};

  const eventNames = new Set([...Object.keys(baselineEvents), ...Object.keys(liveEvents)]);

  for (const event of [...eventNames].sort()) {
    const expected = flattenBlocks(baselineEvents[event], hook => (typeof hook === 'string' ? hook : null));
    const live = flattenBlocks(liveEvents[event], hookNameFromCommand);

    const expectedByHook = groupMatchersByHook(expected);
    const liveByHook = groupMatchersByHook(live);

    for (const [hook, matchers] of expectedByHook) {
      const liveMatchers = liveByHook.get(hook);
      if (!liveMatchers) {
        findings.push({
          kind: 'hook-missing',
          severity: 'error',
          path: SETTINGS_FILE,
          subject: `${event}:${hook}`,
          detail: `${event} no longer runs ${hook} (expected matcher ${matchers.join(', ')})`,
        });
      } else if (!sameSequence(matchers, liveMatchers)) {
        findings.push({
          kind: 'hook-matcher-changed',
          severity: 'error',
          path: SETTINGS_FILE,
          subject: `${event}:${hook}`,
          detail: `${event} runs ${hook} under ${liveMatchers.join(', ')}, expected ${matchers.join(', ')}`,
        });
      }
    }

    for (const hook of liveByHook.keys()) {
      if (expectedByHook.has(hook)) continue;
      findings.push({
        kind: 'hook-unexpected',
        severity: 'warning',
        path: SETTINGS_FILE,
        subject: `${event}:${hook}`,
        detail: `${event} runs ${hook}, which the kit does not wire`,
      });
    }

    const expectedOrder = expected.map(pair => pair.hook);
    const liveOrder = live.map(pair => pair.hook);
    if (!sameSequence(expectedOrder, liveOrder) && sameMultiset(expectedOrder, liveOrder)) {
      findings.push({
        kind: 'hook-order-changed',
        severity: 'warning',
        path: SETTINGS_FILE,
        subject: `${event}:order`,
        detail: `${event} runs ${liveOrder.join(' → ')}, expected ${expectedOrder.join(' → ')}`,
      });
    }
  }

  for (const [hook, relPath] of Object.entries(hookExpectations.hookFiles || {})) {
    if (fs.existsSync(path.join(claudeDir, relPath))) continue;
    findings.push({
      kind: 'hook-script-missing',
      severity: 'error',
      path: relPath,
      subject: relPath,
      detail: `wiring references ${hook}, but ${relPath} is not installed`,
    });
  }
}

function sameSequence(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameMultiset(a, b) {
  return sameSequence([...a].sort(), [...b].sort());
}

// ── Shipped files ───────────────────────────────────────────────────────────

function compareSkillFiles(claudeDir, skillHashes, findings) {
  const expected = skillHashes.files || {};

  for (const [rel, expectedHash] of Object.entries(expected)) {
    const abs = path.join(claudeDir, rel);
    if (!fs.existsSync(abs)) {
      findings.push({
        kind: 'file-missing',
        severity: 'error',
        path: rel,
        subject: rel,
        detail: 'shipped file is not installed',
      });
      continue;
    }
    if (hashFile(abs) === expectedHash) continue;
    findings.push({
      kind: 'file-modified',
      severity: 'warning',
      path: rel,
      subject: rel,
      // A user edit is a legitimate state, not a fault. Never escalate this to
      // an error: an updater reads it as "do not overwrite".
      detail: 'content differs from the shipped baseline (user edit — do not overwrite)',
    });
  }

  for (const rel of listBaselineFiles(claudeDir, SKILLS_DIR)) {
    if (Object.hasOwn(expected, rel)) continue;
    findings.push({
      kind: 'file-unexpected',
      severity: 'info',
      path: rel,
      subject: rel,
      detail: 'present on disk with no baseline entry (local addition or stale file)',
    });
  }
}

// ── Reporting ───────────────────────────────────────────────────────────────

/** One finding per subject: the most severe wins, the rest are noise. */
function collapseBySubject(findings) {
  const bySubject = new Map();
  for (const finding of findings) {
    const current = bySubject.get(finding.subject);
    if (!current || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity]) {
      bySubject.set(finding.subject, finding);
    }
  }
  return [...bySubject.values()]
    .map(({ subject, ...rest }) => rest)
    .sort((a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.kind.localeCompare(b.kind) ||
      a.path.localeCompare(b.path)
    );
}

function check(claudeDir = CLAUDE_DIR) {
  const { hookExpectations, skillHashes } = loadBaselines(claudeDir);
  const findings = [];
  compareHookWiring(claudeDir, hookExpectations, findings);
  compareSkillFiles(claudeDir, skillHashes, findings);

  const collapsed = collapseBySubject(findings);
  const drifted = collapsed.some(finding => DRIFT_SEVERITIES.has(finding.severity));

  return {
    kitBaselineSchema: SCHEMA_VERSION,
    status: drifted ? 'drift' : 'clean',
    findings: collapsed,
  };
}

function renderText(report) {
  if (report.status === 'error') return `fis-drift: ${report.error}`;
  if (report.findings.length === 0) return 'No drift: installation matches the shipped baselines.';

  const lines = report.findings.map(
    finding => `  [${finding.severity}] ${finding.kind} ${finding.path}\n      ${finding.detail}`
  );
  const headline =
    report.status === 'drift'
      ? `Drift found (${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}):`
      : `No drift; ${report.findings.length} informational finding(s):`;
  return [headline, ...lines].join('\n');
}

function main(argv) {
  const asJson = argv.includes('--json');
  const command = argv.find(arg => !arg.startsWith('--')) || 'check';

  if (command !== 'check') {
    process.stderr.write(`fis-drift: unknown command "${command}" (expected: check)\n`);
    return EXIT_ERROR;
  }

  let report;
  try {
    report = check();
  } catch (error) {
    report = {
      kitBaselineSchema: SCHEMA_VERSION,
      status: 'error',
      error: error instanceof DriftError ? error.message : String(error && error.message),
      findings: [],
    };
    process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : `${renderText(report)}\n`);
    return EXIT_ERROR;
  }

  process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : `${renderText(report)}\n`);
  return report.status === 'drift' ? EXIT_DRIFT : EXIT_CLEAN;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { check, main, collapseBySubject, hookNameFromCommand, DriftError };
