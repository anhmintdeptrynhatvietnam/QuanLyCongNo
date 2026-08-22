'use strict';

/**
 * plan-markdown.cjs — line-level markdown primitives for plan files.
 *
 * Everything here works on text, knows nothing about plans as a whole, and never
 * reformats a document: edits replace the single line they target so a plan stays
 * hand-editable and diffs stay reviewable.
 *
 * Writes go through writeFileAtomic so a crash cannot leave a half-written plan.
 */

const fs = require('fs');
const path = require('path');

const { parse: parseYamlSubset } = require('../../hooks/lib/yaml-subset-parser.cjs');
const { getLockPath, withFileLock } = require('../../hooks/lib/file-lock.cjs');

/** Canonical phase/plan status values, in lifecycle order. */
const STATUS_VALUES = Object.freeze(['pending', 'in-progress', 'completed', 'cancelled']);

/** Words a human might type, mapped to a canonical status. */
const STATUS_ALIASES = Object.freeze({
  'not started': 'pending',
  'not-started': 'pending',
  todo: 'pending',
  pending: 'pending',
  wip: 'in-progress',
  active: 'in-progress',
  'in progress': 'in-progress',
  'in-progress': 'in-progress',
  inprogress: 'in-progress',
  done: 'completed',
  complete: 'completed',
  completed: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  abandoned: 'cancelled'
});

/**
 * Map a user-supplied status word onto a canonical value.
 * @param {string} raw - Status as typed
 * @returns {string|null} Canonical status, or null when unrecognized
 */
function canonicalStatus(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[_]+/g, '-');
  return STATUS_ALIASES[key] || STATUS_ALIASES[key.replace(/-/g, ' ')] || null;
}

/**
 * Write a file by rename so readers never observe a partial document.
 *
 * The rename target is the real file, so a plan symlinked into place keeps
 * being a symlink, and the original mode is restored — an atomic write should
 * change a file's content and nothing else about it.
 *
 * @param {string} filePath - Destination path
 * @param {string} content - Full file content
 */
function writeFileAtomic(filePath, content) {
  let target = filePath;
  let mode;
  try {
    target = fs.realpathSync(filePath);
    mode = fs.statSync(target).mode;
  } catch {
    // A file that does not exist yet has no mode to preserve
  }

  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
    throw err;
  }
}

/**
 * Split a document into lines, remembering how each one was terminated.
 *
 * Two reasons the terminator cannot stay attached to the line text: `\r` is a
 * line terminator to a JavaScript regex, so it breaks every `$` anchor these
 * editors use; and rejoining with a single document-wide EOL would rewrite the
 * line endings of a mixed file, which is the reformatting this module promises
 * not to do. `join` puts each line's own terminator back.
 *
 * @param {string} content - File content
 * @returns {{lines: string[], eols: string[], eol: string, join: (lines: string[]) => string}}
 */
function splitLines(content) {
  const text = content || '';
  const lines = [];
  const eols = [];
  const pattern = /\r\n|\n|\r/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    lines.push(text.slice(cursor, match.index));
    eols.push(match[0]);
    cursor = pattern.lastIndex;
  }
  // The text after the last terminator is a line too, and it ends the document.
  lines.push(text.slice(cursor));
  eols.push('');

  return {
    lines,
    eols,
    eol: /\r\n/.test(text) ? '\r\n' : '\n',
    join: (edited) => edited.map((line, i) => line + (eols[i] ?? '')).join('')
  };
}

/**
 * Split a document into its YAML frontmatter block and body.
 * @param {string} content - File content
 * @returns {{hasFrontmatter: boolean, startLine: number, endLine: number, lines: string[], eol: string}}
 *   Line indices are into `lines`; endLine is the closing `---`.
 */
function locateFrontmatter(content) {
  const { lines, eol, join } = splitLines(content);
  if (lines[0]?.trim() !== '---') {
    return { hasFrontmatter: false, startLine: -1, endLine: -1, lines, eol, join };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') {
      return { hasFrontmatter: true, startLine: 0, endLine: i, lines, eol, join };
    }
  }
  return { hasFrontmatter: false, startLine: -1, endLine: -1, lines, eol, join };
}

/**
 * Read frontmatter as a plain object, tolerating YAML this kit cannot parse.
 * @param {string} content - File content
 * @returns {Object} Parsed frontmatter, or {} when absent or unparseable
 */
function readFrontmatter(content) {
  const fm = locateFrontmatter(content);
  if (!fm.hasFrontmatter) return {};
  const block = fm.lines.slice(1, fm.endLine).join('\n');
  // The parser reads a subset of YAML; `\r` is already gone because splitLines
  // stripped it, so the block below is plain LF regardless of the file.
  try {
    const parsed = parseYamlSubset(block);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // A phase file may carry YAML richer than the subset parser supports. Fall
    // back to the scalar keys this module actually needs.
    const shallow = {};
    for (const line of fm.lines.slice(1, fm.endLine)) {
      const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (match) shallow[match[1]] = match[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    }
    return shallow;
  }
}

/**
 * Replace a scalar frontmatter value, preserving the trailing comment.
 *
 * Anchored at column 0: an indented `status:` belongs to a nested mapping, and
 * patching that one would report success while the real key kept its old value.
 *
 * @param {string} content - File content
 * @param {string} key - Top-level frontmatter key
 * @param {string} value - New scalar value
 * @returns {{content: string, changed: boolean, previous: string|null}}
 */
function patchFrontmatterValue(content, key, value) {
  const fm = locateFrontmatter(content);
  if (!fm.hasFrontmatter) return { content, changed: false, previous: null };

  const pattern = new RegExp(`^(${escapeRegExp(key)}\\s*:\\s*)([^#]*?)(\\s*#.*)?$`);
  for (let i = fm.startLine + 1; i < fm.endLine; i += 1) {
    const match = pattern.exec(fm.lines[i]);
    if (!match) continue;
    const previous = match[2].trim().replace(/^["']|["']$/g, '');
    if (previous === value) return { content, changed: false, previous };
    fm.lines[i] = `${match[1]}${value}${match[3] || ''}`;
    return { content: fm.join(fm.lines), changed: true, previous };
  }
  return { content, changed: false, previous: null };
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace a `**Status:** …` line, the plan-level status FIS plans use outside
 * frontmatter.
 * @param {string} content - File content
 * @param {string} value - New status text
 * @returns {{content: string, changed: boolean, previous: string|null}}
 */
function patchBoldStatusLine(content, value) {
  const { lines, join } = splitLines(content);
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*\*\*Status:?\*\*:?\s*)(.*)$/.exec(lines[i]);
    if (!match) continue;
    const previous = match[2].trim();
    if (previous === value) return { content, changed: false, previous };
    lines[i] = `${match[1]}${value}`;
    return { content: join(lines), changed: true, previous };
  }
  return { content, changed: false, previous: null };
}

/**
 * Read the plan-level status from a `**Status:** …` line.
 * @param {string} content - File content
 * @returns {string|null} Raw status text, or null when the line is absent
 */
function readBoldStatusLine(content) {
  const { lines } = splitLines(content);
  for (const line of lines) {
    const match = /^\s*\*\*Status:?\*\*:?\s*(.*)$/.exec(line);
    if (match) return match[1].trim() || null;
  }
  return null;
}

/**
 * Every markdown checkbox in a document, in order.
 *
 * Fenced blocks are skipped: phase files routinely show example markdown, and a
 * checkbox in a code sample is documentation, not a task. Counting it would
 * shift every real item's number.
 *
 * @param {string} content - File content
 * @returns {Array<{line: number, checked: boolean, text: string, raw: string}>}
 */
function listChecklistItems(content) {
  const { lines } = splitLines(content);
  const items = [];
  let fence = null;

  lines.forEach((raw, line) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      // A closing fence must be at least as long as the one that opened it, so a
      // ```` block can contain ``` lines.
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence !== null) return;

    const match = /^(\s*(?:[-*+]|\d+[.)])\s*\[)([ xX])(\]\s*)(.*)$/.exec(raw);
    if (match) items.push({ line, checked: match[2].toLowerCase() === 'x', text: match[4].trim(), raw });
  });

  return items;
}

/**
 * Tick or untick one checkbox.
 *
 * `query` selects by 1-based checkbox index or by case-insensitive substring; a
 * substring matching several items is an error rather than a guess.
 *
 * @param {string} content - File content
 * @param {string} query - Index or substring
 * @param {boolean} checked - Desired state
 * @returns {{content: string, changed: boolean, item: Object|null, error: string|null}}
 */
function setChecklistItem(content, query, checked) {
  const items = listChecklistItems(content);
  if (items.length === 0) return { content, changed: false, item: null, error: 'no checklist items found' };

  const asIndex = /^\d+$/.test(String(query).trim()) ? parseInt(String(query).trim(), 10) : null;
  let matches;
  if (asIndex !== null) {
    const item = items[asIndex - 1];
    if (!item) return { content, changed: false, item: null, error: `no checklist item ${asIndex} (${items.length} present)` };
    matches = [item];
  } else {
    const needle = String(query).toLowerCase();
    matches = items.filter((item) => item.text.toLowerCase().includes(needle));
    if (matches.length === 0) return { content, changed: false, item: null, error: `no checklist item matches "${query}"` };
    if (matches.length > 1) {
      const preview = matches.slice(0, 5).map((m) => `  ${items.indexOf(m) + 1}. ${m.text}`).join('\n');
      return { content, changed: false, item: null, error: `"${query}" matches ${matches.length} items:\n${preview}` };
    }
  }

  const item = matches[0];
  const { lines, join } = splitLines(content);
  const box = checked ? 'x' : ' ';
  lines[item.line] = lines[item.line].replace(/^(\s*(?:[-*+]|\d+[.)])\s*\[)[ xX](\])/, `$1${box}$2`);
  const changed = item.checked !== checked;

  return {
    content: changed ? join(lines) : content,
    changed,
    item: { ...item, index: items.indexOf(item) + 1, checked },
    error: null
  };
}

module.exports = {
  STATUS_VALUES,
  canonicalStatus,
  getLockPath,
  withFileLock,
  writeFileAtomic,
  splitLines,
  locateFrontmatter,
  readFrontmatter,
  patchFrontmatterValue,
  patchBoldStatusLine,
  readBoldStatusLine,
  listChecklistItems,
  setChecklistItem
};
