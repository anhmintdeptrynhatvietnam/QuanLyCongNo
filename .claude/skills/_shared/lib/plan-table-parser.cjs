'use strict';

/**
 * plan-table-parser.cjs — the one place that understands the geometry of a
 * `plan.md` phases table.
 *
 * `plan-document.cjs` reads and writes through this module, so the read path and
 * the write path can never disagree about which table, which row, or which
 * column carries a phase status. A plan is hand-editable Markdown; everything
 * here tolerates the shapes a human actually types and refuses — rather than
 * guesses at — the ones it cannot place.
 *
 * Line indices returned here index `content.split('\n')`, the same split the
 * writer uses, so a CRLF document keeps its terminators when a row is rebuilt:
 * the `\r` rides along at the end of the final cell.
 */

const path = require('path');

// Status *meaning* has one owner. This module decides where a status sits in a
// document; plan-markdown decides what the word means.
const { canonicalStatus } = require('../../../scripts/lib/plan-markdown.cjs');

/**
 * Status phrases to look for inside a cell that is not a bare status word,
 * longest first so `not started` wins over a shorter accidental match.
 *
 * This is scan order only — `canonicalStatus` still resolves every hit, so the
 * alias table stays the single authority on what a word means.
 */
const STATUS_PHRASES = Object.freeze([
  'not started', 'not-started', 'in progress', 'in-progress', 'inprogress',
  'completed', 'cancelled', 'abandoned', 'canceled', 'complete',
  'pending', 'active', 'done', 'todo', 'wip'
].sort((a, b) => b.length - a.length));

/** A phase id in a table cell or a heading: `1`, `01`, `2b`. */
const PHASE_CELL = /^0*(\d+)\s*([a-z]?)$/i;

/** `### Phase 2b: Name`, `## Phase 3 — Name` — the prose form of a phases list. */
const PHASE_HEADING = /^#{1,6}\s*phase\s*0*(\d+)\s*([a-z]?)\s*[:\-—–]?\s*(.*)$/i;

/** A markdown table delimiter row: `|---|:--:|---:|`. */
const DELIMITER_ROW = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/;

/**
 * Split a markdown table row into its cells.
 *
 * Splits on unescaped pipes only, so `01 \| 01b` stays one cell and cannot shift
 * the status column. The framing empties a row picks up from its outer pipes are
 * dropped, which makes cell index N of this result the same column as index N of
 * the header — and makes `cells[N + 1]` the matching entry in a caller's own raw
 * `split('|')`.
 *
 * @param {string} line - One table row, terminator included or not
 * @returns {string[]} Cells, untrimmed, in column order
 */
function splitRow(line) {
  const cells = String(line ?? '').split(/(?<!\\)\|/);
  // Trailing first: on a CRLF document the last element is `\r`, not `''`.
  if (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();
  if (cells.length > 1 && cells[0].trim() === '') cells.shift();
  return cells;
}

/** Strip the markdown that decorates a cell without carrying meaning. */
function plainText(cell) {
  return String(cell ?? '')
    .replace(/\r/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|[*_~]/g, '')
    .trim();
}

/**
 * Resolve a status cell onto a canonical status.
 *
 * A status cell in a real plan is rarely a bare word — people append an emoji, a
 * blocker, a ticket link. The whole cell is tried first; only then does the scan
 * look for a status phrase inside it, so annotated cells still read correctly
 * instead of dropping to "unknown".
 *
 * @param {string} raw - Cell text, or a frontmatter status value
 * @returns {string|null} Canonical status, or null when nothing matches
 */
function normalizeStatus(raw) {
  const text = plainText(raw);
  if (!text) return null;

  const direct = canonicalStatus(text);
  if (direct) return direct;

  const haystack = text.toLowerCase();
  for (const phrase of STATUS_PHRASES) {
    if (haystack.includes(phrase)) return canonicalStatus(phrase);
  }
  return null;
}

/** The first markdown link in a row, as `{text, target}`, or null. */
function firstLink(text) {
  const match = /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/.exec(String(text ?? ''));
  return match ? { text: match[1].trim(), target: match[2].trim() } : null;
}

/**
 * Index the header of a markdown table.
 * @param {string} headerLine - The header row
 * @returns {{cells: string[], phaseCol: number, nameCol: number, statusCol: number}}
 */
function indexHeader(headerLine) {
  const cells = splitRow(headerLine).map((cell) => plainText(cell).toLowerCase());
  const find = (pattern) => cells.findIndex((cell) => pattern.test(cell));
  return {
    cells,
    phaseCol: find(/^#?\s*phase\b/),
    nameCol: find(/^(name|title|phase name)\b/),
    statusCol: find(/^status\b/)
  };
}

/**
 * Locate the phases table in a plan document.
 *
 * Fenced blocks are skipped: a plan that documents its own table format carries a
 * sample table, and writing a status into the sample would leave the real row
 * stale while reporting success.
 *
 * @param {string} content - Full `plan.md` text
 * @returns {{headerLine: number, headerCells: number, phaseCol: number, nameCol: number,
 *   statusCol: number, rows: Array<{line: number, phaseId: string, phase: number, cells: string[]}>}|null}
 *   Null when the document has no table carrying both a Phase and a Status column.
 */
function selectPhaseTable(content) {
  const lines = String(content ?? '').split('\n');
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;

    if (!lines[i].includes('|')) continue;
    if (!DELIMITER_ROW.test(lines[i + 1] || '')) continue;

    const header = indexHeader(lines[i]);
    // Both columns are load-bearing: without Phase there is no row to find, and
    // without Status there is nothing this accessor can rewrite.
    if (header.phaseCol === -1 || header.statusCol === -1) continue;

    const rows = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      if (!lines[j].includes('|') || plainText(lines[j]) === '') break;
      const cells = splitRow(lines[j]);
      const match = PHASE_CELL.exec(plainText(cells[header.phaseCol]));
      // A "Total" or notes row is part of the table but is not a phase.
      if (!match) continue;
      rows.push({
        line: j,
        phase: parseInt(match[1], 10),
        phaseId: `${parseInt(match[1], 10)}${(match[2] || '').toLowerCase()}`,
        cells
      });
    }

    if (rows.length > 0) {
      return {
        headerLine: i,
        headerCells: splitRow(lines[i]).length,
        phaseCol: header.phaseCol,
        nameCol: header.nameCol,
        statusCol: header.statusCol,
        rows
      };
    }
  }

  return null;
}

/**
 * Every phase a plan declares, from its phases table when it has one and from
 * `### Phase N:` headings when it does not.
 *
 * The prose fallback exists so a plan written without a table still resolves its
 * phases by reference — the caller can then refuse the *write* with an accurate
 * "cannot rewrite this format" rather than a misleading "no such phase".
 *
 * @param {string} content - Full `plan.md` text
 * @param {string} planDir - Directory the plan lives in, for resolving phase links
 * @returns {Array<{phase: number, phaseId: string, name: string, status: string|null, file: string|null}>}
 */
function parsePlanPhases(content, planDir) {
  const dir = planDir ? path.resolve(planDir) : null;
  const resolve = (target) => (dir && target ? path.resolve(dir, target) : null);

  const table = selectPhaseTable(content);
  if (table) {
    return table.rows.map((row) => {
      const nameCell = table.nameCol >= 0 ? row.cells[table.nameCol] : undefined;
      const link = firstLink(nameCell) || firstLink(row.cells.join('|'));
      return {
        phase: row.phase,
        phaseId: row.phaseId,
        name: (link?.text) || plainText(nameCell) || `Phase ${row.phaseId}`,
        status: normalizeStatus(row.cells[table.statusCol]),
        file: link && /\.md$/i.test(link.target) ? resolve(link.target) : null
      };
    });
  }

  return parseProsePhases(content, resolve);
}

/** Phases declared as headings, with a nearby `Status:` line when one follows. */
function parseProsePhases(content, resolve) {
  const lines = String(content ?? '').split('\n');
  const phases = [];
  let fence = null;

  lines.forEach((line, i) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence !== null) return;

    const match = PHASE_HEADING.exec(line);
    if (!match) return;

    // Status lives in the lines under the heading, up to the next heading.
    let status = null;
    let file = null;
    for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j]); j += 1) {
      if (!status) {
        const statusLine = /^\s*(?:[-*+]\s*)?\*{0,2}status\*{0,2}\s*:\s*(.+)$/i.exec(lines[j]);
        if (statusLine) status = normalizeStatus(statusLine[1]);
      }
      if (!file) {
        const link = firstLink(lines[j]);
        if (link && /\.md$/i.test(link.target)) file = resolve(link.target);
      }
    }

    const headingLink = firstLink(match[3]);
    phases.push({
      phase: parseInt(match[1], 10),
      phaseId: `${parseInt(match[1], 10)}${(match[2] || '').toLowerCase()}`,
      name: (headingLink?.text) || plainText(match[3]) || `Phase ${match[1]}`,
      status,
      file: headingLink && /\.md$/i.test(headingLink.target) ? resolve(headingLink.target) : file
    });
  });

  return phases;
}

module.exports = {
  STATUS_PHRASES,
  splitRow,
  normalizeStatus,
  selectPhaseTable,
  parsePlanPhases
};
