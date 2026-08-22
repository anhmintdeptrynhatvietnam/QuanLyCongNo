/**
 * Minimal YAML-subset parser for FIS AI Kit config files.
 *
 * Hooks run as bare Node from the installed payload, where no `node_modules`
 * is available, so the `yaml` package the CLI uses cannot be required here.
 * This parser covers exactly the syntax `.fis/config.yaml` needs and rejects
 * everything else with a line-numbered error rather than guessing.
 *
 * Supported:
 *   - `#` comments, full-line and trailing
 *   - nested block mappings by indentation
 *   - block sequences, including sequences of mappings
 *   - scalars: null (`null`, `~`, empty), booleans, integers, floats,
 *     single/double quoted strings, plain strings
 *   - empty flow collections `{}` and `[]`
 *   - single-level flow collections with scalar values
 *
 * Rejected (throws):
 *   - tabs for indentation
 *   - anchors, aliases, tags, multi-document streams
 *   - block scalars (`|`, `>`)
 *   - nested flow collections
 *   - `__proto__`, `constructor`, and `prototype` as keys
 *
 * Error messages carry a line number and never quote the offending source back:
 * a config file holds credentials, and these messages reach `fis doctor` output.
 */

'use strict';

class YamlSubsetError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.name = 'YamlSubsetError';
    this.line = line || null;
  }
}

// Keys that would be assigned onto a plain object's prototype rather than the
// object itself, so the value would silently disappear.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Characters that can precede the start of a scalar. A quote is only an
// indicator in that position; anywhere else it is an ordinary character, so
// `issue_prefix: team's-` is a plain scalar and not an unterminated string.
const VALUE_START_CHARS = new Set([':', ',', '-', '[', '{', '?']);

/**
 * Whether the quote at `index` opens a quoted scalar rather than sitting inside
 * a plain one.
 */
function opensQuotedScalar(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t') continue;
    return VALUE_START_CHARS.has(ch);
  }
  return true;
}

/**
 * Remove an unquoted trailing comment from a line.
 * A `#` only starts a comment at the start of the content or after whitespace,
 * so values like `issue_prefix: GH-#1` stay intact.
 */
function stripComment(text) {
  let quote = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quote) {
      if (ch === '\\' && quote === '"') {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if ((ch === '"' || ch === "'") && opensQuotedScalar(text, i)) {
      // An unterminated quote means this was not a quoted scalar after all, so
      // the rest of the line is plain text and its comment must still be cut.
      if (findClosingQuote(text, i) === -1) continue;
      quote = ch;
      continue;
    }

    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i);
    }
  }

  return text;
}

/** Index of the quote closing the one at `start`, or -1. */
function findClosingQuote(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\' && quote === '"') {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

const DOUBLE_QUOTE_ESCAPES = Object.freeze({
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  0: '\0',
  '"': '"',
  '/': '/',
  '\\': '\\'
});

/**
 * Decode a double-quoted scalar body in one pass.
 *
 * A chain of sequential `.replace` calls cannot do this: replacing `\n` before
 * `\\` rewrites the second backslash of an escaped pair, so `"\\n"` — a
 * backslash followed by the letter n, which is what a regex config value needs
 * — would come out as a real newline.
 *
 * @param {string} body - Text between the quotes
 * @param {number} lineNo - Line number for errors
 * @returns {string} Decoded value
 */
function decodeDoubleQuoted(body, lineNo) {
  let result = '';

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') {
      result += body[i];
      continue;
    }

    const next = body[i + 1];
    if (next === undefined) {
      throw new YamlSubsetError('Trailing backslash in double-quoted string', lineNo);
    }

    if (next === 'u') {
      const hex = body.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new YamlSubsetError(`Malformed \\u escape in double-quoted string`, lineNo);
      }
      result += String.fromCharCode(Number.parseInt(hex, 16));
      i += 5;
      continue;
    }

    if (!Object.hasOwn(DOUBLE_QUOTE_ESCAPES, next)) {
      throw new YamlSubsetError(`Unsupported escape \\${next} in double-quoted string`, lineNo);
    }
    result += DOUBLE_QUOTE_ESCAPES[next];
    i += 1;
  }

  return result;
}

/** Split a quoted or plain scalar into its JavaScript value. */
function parseScalar(raw, lineNo) {
  const text = raw.trim();

  if (text === '' || text === 'null' || text === '~' || text === 'Null' || text === 'NULL') {
    return null;
  }

  if (text.startsWith('"')) {
    if (text.length < 2 || !text.endsWith('"')) {
      throw new YamlSubsetError('Unterminated double-quoted string', lineNo);
    }
    return decodeDoubleQuoted(text.slice(1, -1), lineNo);
  }

  if (text.startsWith("'")) {
    if (text.length < 2 || !text.endsWith("'")) {
      throw new YamlSubsetError('Unterminated single-quoted string', lineNo);
    }
    return text.slice(1, -1).replace(/''/g, "'");
  }

  if (text === 'true' || text === 'True' || text === 'TRUE') return true;
  if (text === 'false' || text === 'False' || text === 'FALSE') return false;

  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);

  if (text.startsWith('|') || text.startsWith('>')) {
    throw new YamlSubsetError('Block scalars are not supported', lineNo);
  }
  if (text.startsWith('&') || text.startsWith('*') || text.startsWith('!')) {
    throw new YamlSubsetError('Anchors, aliases, and tags are not supported', lineNo);
  }

  return text;
}

/** Split a flow collection body on commas that are not inside quotes. */
function splitFlowItems(body, lineNo) {
  const items = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') {
        current += body[i + 1] ?? '';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[') {
      throw new YamlSubsetError('Nested flow collections are not supported', lineNo);
    }
    if (ch === ',') {
      items.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  items.push(current);

  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** Normalize a mapping key, allowing quoted keys such as `"session-init"`. */
function parseKey(raw, lineNo) {
  const text = raw.trim();
  if (!text) {
    throw new YamlSubsetError('Empty mapping key', lineNo);
  }
  const key = (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
    ? text.slice(1, -1)
    : text;

  if (RESERVED_KEYS.has(key)) {
    // Assigning one of these onto a plain object changes its prototype instead
    // of adding a property, so the value would silently disappear. Callers strip
    // them anyway; raising means the writer finds out rather than wondering why
    // a whole section had no effect.
    throw new YamlSubsetError(`"${key}" cannot be used as a key`, lineNo);
  }

  return key;
}

/** Parse `{ a: 1, b: 2 }` or `[a, b]`; returns undefined when not flow syntax. */
function parseFlow(raw, lineNo) {
  const text = raw.trim();

  if (text.startsWith('{')) {
    if (!text.endsWith('}')) {
      throw new YamlSubsetError('Unterminated flow mapping', lineNo);
    }
    const result = {};
    for (const item of splitFlowItems(text.slice(1, -1), lineNo)) {
      const idx = item.indexOf(':');
      if (idx === -1) {
        throw new YamlSubsetError("Flow mapping entry missing ':'", lineNo);
      }
      result[parseKey(item.slice(0, idx), lineNo)] = parseScalar(item.slice(idx + 1), lineNo);
    }
    return result;
  }

  if (text.startsWith('[')) {
    if (!text.endsWith(']')) {
      throw new YamlSubsetError('Unterminated flow sequence', lineNo);
    }
    return splitFlowItems(text.slice(1, -1), lineNo).map((item) => parseScalar(item, lineNo));
  }

  return undefined;
}

/** Find the `:` that separates a mapping key from its value, ignoring quotes. */
function findKeySeparator(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      return i;
    }
  }
  return -1;
}

/** Turn raw text into significant lines carrying indent and 1-based line number. */
function toSignificantLines(text) {
  const lines = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNo = index + 1;

    if (rawLine.trim() === '---' || rawLine.trim() === '...') {
      throw new YamlSubsetError('Multi-document streams are not supported', lineNo);
    }

    const withoutComment = stripComment(rawLine);
    if (withoutComment.trim() === '') return;

    const indent = withoutComment.match(/^[ \t]*/)[0];
    if (indent.includes('\t')) {
      throw new YamlSubsetError('Tab indentation is not supported; use spaces', lineNo);
    }

    lines.push({ indent: indent.length, content: withoutComment.trim(), lineNo });
  });

  return lines;
}

/**
 * Parse a block at the given indent level.
 * @returns {{ value: any, next: number }} Parsed value and the next line index
 */
function parseBlock(lines, start, indent) {
  if (start >= lines.length) return { value: null, next: start };

  return lines[start].content.startsWith('- ') || lines[start].content === '-'
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
}

function parseSequence(lines, start, indent) {
  const result = [];
  let i = start;

  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    if (!line.content.startsWith('- ') && line.content !== '-') break;

    // The item's own content starts after the dash and its padding, so the
    // column it sits at depends on how many spaces the author used. Assuming
    // exactly one would misplace every continuation key of `-  key: value`.
    const dashPadding = line.content === '-' ? 0 : line.content.match(/^-( +)/)[1].length;
    const itemIndent = indent + 1 + dashPadding;
    const inline = line.content === '-' ? '' : line.content.slice(1 + dashPadding);
    i += 1;

    if (inline === '') {
      // A dash with nothing after it takes the block below as its value, but
      // only if that block is indented past the dash; otherwise the item is null.
      const next = i < lines.length ? lines[i] : null;
      if (!next || next.indent <= indent) {
        result.push(null);
        continue;
      }
      const nested = parseBlock(lines, i, next.indent);
      result.push(nested.value);
      i = nested.next;
      continue;
    }

    const flow = parseFlow(inline, line.lineNo);
    if (flow !== undefined) {
      result.push(flow);
      continue;
    }

    // `- key: value` starts a mapping whose remaining keys line up with the
    // first one, at the column just past the dash.
    if (findKeySeparator(inline) !== -1) {
      const synthetic = [{ indent: itemIndent, content: inline.trim(), lineNo: line.lineNo }];
      while (i < lines.length && lines[i].indent >= itemIndent) {
        synthetic.push(lines[i]);
        i += 1;
      }

      const mapping = parseMapping(synthetic, 0, itemIndent);
      if (mapping.next < synthetic.length) {
        throw new YamlSubsetError(
          `Inconsistent indentation inside a list item — expected ${itemIndent} spaces`,
          synthetic[mapping.next].lineNo
        );
      }
      result.push(mapping.value);
      continue;
    }

    result.push(parseScalar(inline, line.lineNo));
  }

  return { value: result, next: i };
}

function parseMapping(lines, start, indent) {
  const result = {};
  let i = start;

  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    if (line.content.startsWith('- ')) break;

    const sep = findKeySeparator(line.content);
    if (sep === -1) {
      // The offending text is deliberately not quoted back: a config file holds
      // API keys, and these messages travel into `fis doctor` output and CI logs.
      // The line number locates it without copying it.
      throw new YamlSubsetError("Expected 'key: value'", line.lineNo);
    }

    const key = parseKey(line.content.slice(0, sep), line.lineNo);
    const rest = line.content.slice(sep + 1).trim();
    i += 1;

    if (rest !== '') {
      const flow = parseFlow(rest, line.lineNo);
      result[key] = flow !== undefined ? flow : parseScalar(rest, line.lineNo);
      continue;
    }

    // Empty value: a nested block below, a sequence that YAML allows to sit at
    // the parent's own indent, or an explicit null.
    const next = i < lines.length ? lines[i] : null;
    const nextStartsSequence = next && (next.content.startsWith('- ') || next.content === '-');

    if (next && (next.indent > indent || (next.indent === indent && nextStartsSequence))) {
      const nested = parseBlock(lines, i, next.indent);
      result[key] = nested.value;
      i = nested.next;
    } else {
      result[key] = null;
    }
  }

  return { value: result, next: i };
}

/**
 * Parse a YAML-subset document into a plain object.
 * @param {string} text - Document source
 * @returns {Object} Parsed mapping; an empty document yields `{}`
 * @throws {YamlSubsetError} On unsupported or malformed syntax
 */
function parse(text) {
  if (typeof text !== 'string') {
    throw new YamlSubsetError('Input must be a string');
  }

  const lines = toSignificantLines(text);
  if (lines.length === 0) return {};

  const baseIndent = lines[0].indent;
  const { value, next } = parseBlock(lines, 0, baseIndent);

  if (next < lines.length) {
    throw new YamlSubsetError(
      `Inconsistent indentation — expected ${baseIndent} spaces`,
      lines[next].lineNo
    );
  }

  return value === null ? {} : value;
}

module.exports = { parse, YamlSubsetError };
