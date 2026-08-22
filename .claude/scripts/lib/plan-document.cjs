'use strict';

/**
 * plan-document.cjs — the typed reader/writer for a plan directory.
 *
 * Plan files are the only source of truth. This module never keeps a second copy
 * of plan state; it reads `plan.md` plus the `phase-NN-*.md` files and, when it
 * writes, updates the phases table and the phase frontmatter in one operation so
 * the two cannot drift apart.
 *
 * Table geometry comes from the shared parser in
 * `skills/_shared/lib/plan-table-parser.cjs` — the read path and the write path
 * use one table implementation, not two.
 */

const fs = require('fs');
const path = require('path');

const {
  parsePlanPhases,
  normalizeStatus,
  selectPhaseTable,
  splitRow
} = require('../../skills/_shared/lib/plan-table-parser.cjs');

const {
  canonicalStatus,
  withFileLock,
  writeFileAtomic,
  readFrontmatter,
  patchFrontmatterValue,
  patchBoldStatusLine,
  readBoldStatusLine,
  listChecklistItems,
  setChecklistItem
} = require('./plan-markdown.cjs');

/** How a canonical status is written into a plan.md Status cell. */
const TABLE_STATUS_LABEL = Object.freeze({
  pending: 'Not started',
  'in-progress': 'In progress',
  completed: 'Complete',
  cancelled: 'Cancelled'
});

class PlanDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanDocumentError';
  }
}

/**
 * Read a plan directory: `plan.md`, its phases table, and the phase files.
 * @param {string} planDir - Absolute or relative plan directory
 * @returns {{planDir: string, planPath: string, content: string, frontmatter: Object,
 *   planStatus: string|null, phases: Object[], phaseFiles: string[]}}
 */
function readPlan(planDir) {
  const dir = path.resolve(planDir);
  const planPath = path.join(dir, 'plan.md');
  if (!fs.existsSync(planPath)) {
    throw new PlanDocumentError(`not a plan directory (no plan.md): ${dir}`);
  }

  const content = fs.readFileSync(planPath, 'utf8');
  const frontmatter = readFrontmatter(content);
  const planStatus = typeof frontmatter.status === 'string'
    ? frontmatter.status
    : readBoldStatusLine(content);

  const phaseFiles = fs.readdirSync(dir)
    .filter((name) => /^phase-\d+[a-z]?-.*\.md$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));

  return {
    planDir: dir,
    planPath,
    content,
    frontmatter,
    planStatus,
    phases: parsePlanPhases(content, dir),
    phaseFiles
  };
}

/**
 * Normalize a phase reference (`2`, `02`, `2b`, a filename, or a path) to a phase id.
 * @param {string|number} ref - Phase reference as given by a caller
 * @returns {string|null} Phase id like `2` or `2b`
 */
function normalizePhaseRef(ref) {
  if (ref === null || ref === undefined) return null;
  const raw = String(ref).trim();
  if (!raw) return null;
  const fromFile = /phase-(\d+)([a-z]?)/i.exec(path.basename(raw));
  const direct = /^0*(\d+)\s*([a-z]?)$/i.exec(raw);
  const match = fromFile || direct;
  if (!match) return null;
  return `${parseInt(match[1], 10)}${(match[2] || '').toLowerCase()}`;
}

/**
 * Find one phase in a plan by reference.
 * @param {Object} plan - Result of readPlan
 * @param {string|number} ref - Phase reference
 * @returns {Object} The phase object from the shared parser
 */
function findPhase(plan, ref) {
  const phaseId = normalizePhaseRef(ref);
  if (!phaseId) throw new PlanDocumentError(`not a phase reference: ${ref}`);

  const byId = plan.phases.filter((p) => p.phaseId === phaseId);
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) throw new PlanDocumentError(`plan.md lists phase ${phaseId} more than once`);

  const known = plan.phases.map((p) => p.phaseId).join(', ') || 'none';
  throw new PlanDocumentError(`plan.md has no phase ${phaseId} (has: ${known})`);
}

/**
 * Whether a path stays inside the plan directory.
 *
 * A phase link is repo content — it arrives from a template, a pull request, or
 * another agent — so `[x](../../../etc/something.md)` must not become a file this
 * accessor reads or writes.
 *
 * Checked after resolving symlinks: writeFileAtomic deliberately writes through a
 * symlink to preserve one, which would otherwise let a phase file that is a link
 * pass a purely textual check and redirect the write outside the plan.
 *
 * @param {string} planDir - Plan directory
 * @param {string} candidate - Path from the plan document
 * @returns {boolean} Whether the candidate is contained
 */
function isInsidePlanDir(planDir, candidate) {
  const real = (target) => {
    try { return fs.realpathSync(target); } catch { return path.resolve(target); }
  };
  const relative = path.relative(real(planDir), real(candidate));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolve the file a phase lives in, falling back to a filename match when the
 * phases table carries no link.
 * @param {Object} plan - Result of readPlan
 * @param {Object} phase - Phase object
 * @returns {string|null} Absolute phase file path, or null when the phase has no file
 * @throws {PlanDocumentError} When two files could be the phase's file
 */
function resolvePhaseFile(plan, phase) {
  if (phase.file && isInsidePlanDir(plan.planDir, phase.file) && fs.existsSync(phase.file)) return phase.file;

  const padded = String(phase.phase).padStart(2, '0');
  const prefixes = [`phase-${padded}${phase.phaseId.replace(/^\d+/, '')}-`, `phase-${phase.phase}${phase.phaseId.replace(/^\d+/, '')}-`];
  // Containment applies to the filename fallback as well: a file in the plan
  // directory may still be a symlink pointing out of it, and this path would
  // otherwise reach what the link check above just refused.
  const hits = plan.phaseFiles.filter((file) =>
    prefixes.some((prefix) => path.basename(file).toLowerCase().startsWith(prefix))
    && isInsidePlanDir(plan.planDir, file));

  // Guessing between `phase-02-a.md` and `phase-2-b.md` would write to one and
  // leave the other stale. Same stance as an ambiguous checklist query.
  if (hits.length > 1) {
    throw new PlanDocumentError(
      `phase ${phase.phaseId} matches more than one file (${hits.map((f) => path.basename(f)).join(', ')}); ` +
      'link the intended one from the phases table'
    );
  }
  return hits[0] || null;
}

/**
 * Set a phase status in `plan.md` and in the phase file's frontmatter.
 *
 * Both writes happen after both documents are prepared, so a failure leaves the
 * plan untouched rather than half-updated.
 *
 * @param {string} planDir - Plan directory
 * @param {string|number} ref - Phase reference
 * @param {string} status - Status as typed by the caller
 * @returns {{phaseId: string, status: string, previous: string|null, discarded: string|null,
 *   tableUpdated: boolean, phaseFile: string|null, frontmatterUpdated: boolean,
 *   frontmatterStatusField: boolean|null}} `frontmatterStatusField` is null when the
 *   phase has no file, false when that file carries no `status:` key.
 */
function setPhaseStatus(planDir, ref, status) {
  const canonical = canonicalStatus(status);
  if (!canonical) throw new PlanDocumentError(`unknown status "${status}" (use pending, in-progress, completed, or cancelled)`);

  // The lock spans the read as well as the write. Two accessors updating
  // different phases of one plan would otherwise each read the original file and
  // the second write would erase the first — while its phase file kept the new
  // status, producing the drift this module exists to prevent.
  return withFileLock(path.join(path.resolve(planDir), 'plan.md'), () =>
    setPhaseStatusLocked(planDir, ref, canonical));
}

function setPhaseStatusLocked(planDir, ref, canonical) {
  const plan = readPlan(planDir);
  const phase = findPhase(plan, ref);

  // The same table the reader read. Picking a different one would update a
  // status nobody reads and leave the authoritative table behind.
  const table = selectPhaseTable(plan.content);
  const row = table?.rows.find((r) => r.phaseId === phase.phaseId);
  if (!row) {
    throw new PlanDocumentError(
      `plan.md lists phase ${phase.phaseId} in a format this accessor cannot rewrite; ` +
      'use a phases table with a Status column'
    );
  }

  const lines = plan.content.split('\n');
  const cells = lines[row.line].split(/(?<!\\)\|/);
  // splitRow drops the leading empty cell, so table column N is cells[N + 1].
  const cellIndex = table.statusCol + 1;
  if (cellIndex >= cells.length) throw new PlanDocumentError(`plan.md row for phase ${phase.phaseId} has no Status cell`);

  // The cell about to be overwritten must be the one the reader took the status
  // from. When it is not, the row does not line up with its header and the write
  // would land on another column, destroying its content.
  const previousCell = cells[cellIndex];
  if (normalizeStatus(previousCell) !== phase.status || splitRow(lines[row.line]).length !== table.headerCells) {
    throw new PlanDocumentError(
      `plan.md row for phase ${phase.phaseId} does not line up with its header ` +
      `(the cell under Status reads "${previousCell.trim()}"); fix the row or set the status by hand`
    );
  }

  const label = TABLE_STATUS_LABEL[canonical];
  const leading = /^\s*/.exec(previousCell)[0] || ' ';
  const trailing = /\s*$/.exec(previousCell)[0] || ' ';
  cells[cellIndex] = `${leading}${label}${trailing}`;
  lines[row.line] = cells.join('|');

  const tableUpdated = previousCell.trim() !== label;
  const planContent = lines.join('\n');

  const phaseFile = resolvePhaseFile(plan, phase);
  let phasePatch = null;
  if (phaseFile) {
    const phaseContent = fs.readFileSync(phaseFile, 'utf8');
    phasePatch = patchFrontmatterValue(phaseContent, 'status', canonical);
  }

  // plan.md first: it is the file every reader starts from, so if the second
  // write fails the drift is visible in `status` rather than silent.
  if (tableUpdated) writeFileAtomic(plan.planPath, planContent);
  if (phasePatch?.changed) {
    try {
      writeFileAtomic(phaseFile, phasePatch.content);
    } catch (e) {
      throw new PlanDocumentError(
        `plan.md now reads ${canonical} for phase ${phase.phaseId}, but ${path.basename(phaseFile)} ` +
        `could not be written (${e.message}); re-run once it is writable`
      );
    }
  }

  const previousText = previousCell.trim();
  // Replacing the cell drops whatever else it held — an emoji, a note, a link.
  // Reported so the caller can put it back rather than discover it in a diff.
  const wasPlainLabel = Object.values(TABLE_STATUS_LABEL).some((known) => known.toLowerCase() === previousText.toLowerCase());

  return {
    phaseId: phase.phaseId,
    status: canonical,
    previous: previousText || null,
    discarded: tableUpdated && previousText && !wasPlainLabel ? previousText : null,
    tableUpdated,
    phaseFile,
    // Distinguishes "already current" from "this file has no status field",
    // which would otherwise look synced while never being written.
    frontmatterUpdated: Boolean(phasePatch?.changed),
    frontmatterStatusField: phasePatch ? phasePatch.previous !== null : null
  };
}

/**
 * Set the plan-level status, writing frontmatter when present and the
 * `**Status:**` line otherwise.
 * @param {string} planDir - Plan directory
 * @param {string} status - Status as typed
 * @returns {{status: string, previous: string|null, changed: boolean, target: string}}
 */
function setPlanStatus(planDir, status) {
  const canonical = canonicalStatus(status);
  if (!canonical) throw new PlanDocumentError(`unknown status "${status}" (use pending, in-progress, completed, or cancelled)`);

  return withFileLock(path.join(path.resolve(planDir), 'plan.md'), () => {
    const plan = readPlan(planDir);
    const asFrontmatter = patchFrontmatterValue(plan.content, 'status', canonical);
    if (asFrontmatter.previous !== null) {
      if (asFrontmatter.changed) writeFileAtomic(plan.planPath, asFrontmatter.content);
      return { status: canonical, previous: asFrontmatter.previous, changed: asFrontmatter.changed, target: 'frontmatter' };
    }

    const asLine = patchBoldStatusLine(plan.content, TABLE_STATUS_LABEL[canonical]);
    if (asLine.previous === null) {
      throw new PlanDocumentError('plan.md carries no status: add frontmatter `status:` or a `**Status:**` line');
    }
    if (asLine.changed) writeFileAtomic(plan.planPath, asLine.content);
    return { status: canonical, previous: asLine.previous, changed: asLine.changed, target: 'status-line' };
  });
}

/**
 * Tick or untick a checklist item inside a phase file.
 * @param {string} planDir - Plan directory
 * @param {string|number} ref - Phase reference
 * @param {string} query - Checkbox index or substring
 * @param {boolean} checked - Desired state
 * @returns {{phaseId: string, phaseFile: string, item: Object, changed: boolean, progress: Object}}
 */
function setPhaseChecklistItem(planDir, ref, query, checked) {
  const plan = readPlan(planDir);
  const phase = findPhase(plan, ref);
  const phaseFile = resolvePhaseFile(plan, phase);
  if (!phaseFile) throw new PlanDocumentError(`phase ${phase.phaseId} has no phase file to edit`);

  // Locked on the phase file, which is the one being rewritten. Two ticks against
  // one phase file otherwise race; ticks in different phases never conflict.
  return withFileLock(phaseFile, () => {
    const before = fs.readFileSync(phaseFile, 'utf8');
    const result = setChecklistItem(before, query, checked);
    if (result.error) throw new PlanDocumentError(`phase ${phase.phaseId}: ${result.error}`);
    if (result.changed) writeFileAtomic(phaseFile, result.content);

    const items = listChecklistItems(result.content);
    return {
      phaseId: phase.phaseId,
      phaseFile,
      item: result.item,
      changed: result.changed,
      progress: { done: items.filter((i) => i.checked).length, total: items.length }
    };
  });
}

/**
 * Progress summary across every phase, including table/frontmatter drift.
 * @param {string} planDir - Plan directory
 * @returns {{planDir: string, planStatus: string|null, phases: Object[], totals: Object, drift: Object[]}}
 */
function summarize(planDir) {
  const plan = readPlan(planDir);
  const drift = [];

  const phases = plan.phases.map((phase) => {
    const phaseFile = resolvePhaseFile(plan, phase);
    let frontmatterStatus = null;
    let items = [];
    if (phaseFile) {
      const content = fs.readFileSync(phaseFile, 'utf8');
      const fm = readFrontmatter(content);
      frontmatterStatus = typeof fm.status === 'string' ? normalizeStatus(fm.status) : null;
      items = listChecklistItems(content);
    }
    if (frontmatterStatus && frontmatterStatus !== phase.status) {
      drift.push({ phaseId: phase.phaseId, table: phase.status, frontmatter: frontmatterStatus });
    }
    return {
      phaseId: phase.phaseId,
      name: phase.name,
      status: phase.status,
      frontmatterStatus,
      file: phaseFile,
      checklist: { done: items.filter((i) => i.checked).length, total: items.length }
    };
  });

  // One bucket per canonical status, so the buckets always sum to `phases` and a
  // cancelled phase is not silently missing from the count.
  const totals = {
    phases: phases.length,
    completed: phases.filter((p) => p.status === 'completed').length,
    inProgress: phases.filter((p) => p.status === 'in-progress').length,
    pending: phases.filter((p) => p.status === 'pending').length,
    cancelled: phases.filter((p) => p.status === 'cancelled').length,
    checklistDone: phases.reduce((sum, p) => sum + p.checklist.done, 0),
    checklistTotal: phases.reduce((sum, p) => sum + p.checklist.total, 0)
  };

  return { planDir: plan.planDir, planStatus: plan.planStatus, phases, totals, drift };
}

module.exports = {
  PlanDocumentError,
  TABLE_STATUS_LABEL,
  readPlan,
  normalizePhaseRef,
  findPhase,
  resolvePhaseFile,
  setPhaseStatus,
  setPlanStatus,
  setPhaseChecklistItem,
  summarize
};
