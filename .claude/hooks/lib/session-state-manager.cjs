/**
 * Session State Manager - Persist/restore session progress across sessions
 * Storage: always global ~/.claude/session-states/{hash}/ to avoid project dir pollution
 * Safety: Zero deps, fail-open, atomic writes, 7-day auto-expire
 * @module session-state-manager
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseTranscript } = require('./transcript-parser.cjs');
const { readSessionState, updateSessionState } = require('./fis-config-utils.cjs');
const { createEmptyActivitySnapshot, sanitizeActivitySnapshot } = require('./statusline-session-cache.cjs');
const { gitEnvironment, pathContains } = require('./runtime-state-identity.cjs');
const {
  allocateEventRevision,
  loadProjectCheckpoint,
  writeProjectCheckpoint
} = require('./project-handoff-store.cjs');

const MAX_ARCHIVES = 5;
const EXPIRY_DAYS = 7;
const EXEC_TIMEOUT_MS = 3000;
const STATE_FILENAME = 'latest.md';
const ARCHIVE_DIR = 'archive';

/**
 * A transcript is read inside a hook that has to finish quickly, and it grows
 * without limit over a long session, so only the tail is parsed and only for as
 * long as the budget allows.
 */
const TRANSCRIPT_MAX_BYTES = 4 * 1024 * 1024;
const TRANSCRIPT_MAX_LINES = 20000;
const TRANSCRIPT_BUDGET_MS = 250;
/** Enough of a Codex transcript to find the working directory it belongs to. */
const TRANSCRIPT_IDENTITY_SCAN_BYTES = 256 * 1024;
const TRANSCRIPT_IDENTITY_SCAN_LINES = 64;

function execGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS,
      cwd: cwd || undefined,
      // Inherited GIT_DIR or GIT_WORK_TREE would make git answer about another
      // repository entirely.
      env: gitEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }).trim();
  } catch {
    return '';
  }
}

/** Resolve state dir: always global ~/.claude/session-states/{hash}/ to avoid project pollution */
function getStateDir(cwd) {
  try {
    const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 12);
    const globalDir = path.join(os.homedir(), '.claude', 'session-states', hash);
    if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });
    return globalDir;
  } catch { return null; }
}

/** Load previous session state. Returns null if missing or expired (>7 days) */
function loadState(cwd) {
  try {
    const stateDir = getStateDir(cwd);
    if (!stateDir) return null;
    const statePath = path.join(stateDir, STATE_FILENAME);
    if (!fs.existsSync(statePath)) return null;
    const content = fs.readFileSync(statePath, 'utf8');
    const tsMatch = content.match(/<!-- Generated: (.+?) -->/);
    if (tsMatch) {
      const parsed = new Date(tsMatch[1]).getTime();
      if (isNaN(parsed)) return null;
      if (Date.now() - parsed > EXPIRY_DAYS * 24 * 60 * 60 * 1000) return null;
    }
    return content;
  } catch { return null; }
}

/** Persist session state. SubagentStop appends, Stop finalizes + archives */
function persistState(stdinData, options) {
  try {
    const cwd = stdinData.cwd || process.cwd();
    const stateDir = getStateDir(cwd);
    if (!stateDir) return { success: false, path: null };
    const statePath = path.join(stateDir, STATE_FILENAME);

    if (options.eventType === 'SubagentStop') {
      const agentSection = buildAgentSection(stdinData);
      const existing = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : '';
      let updated;
      if (existing) {
        updated = existing.replace(/(\n## Key Files Modified)/, `\n${agentSection}$1`);
        // Fallback: if heading not found, append to end
        if (updated === existing) updated = existing.trimEnd() + '\n' + agentSection;
      } else {
        updated = buildStateContent(extractSessionData(stdinData)) + '\n' + agentSection;
      }
      writeAtomic(statePath, updated);
      return { success: true, path: statePath };
    }

    if (options.eventType === 'Stop') {
      const data = extractSessionData(stdinData);
      let content = buildStateContent(data);
      if (fs.existsSync(statePath)) {
        const existing = fs.readFileSync(statePath, 'utf8');
        const agentSections = extractAgentSections(existing);
        if (agentSections) {
          content = content.replace(/(\n## Key Files Modified)/, `\n${agentSections}$1`);
        }
      }
      writeAtomic(statePath, content);
      archiveState(stateDir);
      return { success: true, path: statePath };
    }
    return { success: false, path: null };
  } catch { return { success: false, path: null }; }
}

/** Archive current state, rotate old archives (keep last 5) */
function archiveState(stateDir) {
  try {
    const statePath = path.join(stateDir, STATE_FILENAME);
    if (!fs.existsSync(statePath)) return;
    const archiveDir = path.join(stateDir, ARCHIVE_DIR);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const now = new Date();
    const ts = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`;
    fs.copyFileSync(statePath, path.join(archiveDir, `${ts}.md`));
    const entries = fs.readdirSync(archiveDir).filter(f => f.endsWith('.md')).sort();
    while (entries.length > MAX_ARCHIVES) {
      try { fs.unlinkSync(path.join(archiveDir, entries.shift())); } catch { /* ignore */ }
    }
  } catch { /* fail-open */ }
}

/**
 * Where the runtime keeps its own files. A transcript is only trusted when it
 * lives here, so this is the anchor for the ownership check below.
 */
function providerHome(context, environment = process.env) {
  const home = environment.HOME || environment.USERPROFILE || os.homedir();
  const candidate = context.runtime === 'codex'
    ? environment.CODEX_HOME || path.join(home, '.codex')
    : environment.FIS_CLAUDE_HOME || path.join(home, '.claude');
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return null;
  }
}

/** Claude Code names a project directory after its path, flattened. */
function claudeProjectSlug(projectRoot) {
  return projectRoot.replace(/\\/g, '/').replace(/:/g, '-').replace(/\//g, '-');
}

function pathsEqual(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

/**
 * Codex transcript filenames do not encode the project, so the file itself is
 * checked: the head of it records the working directory the session ran in.
 */
function codexTranscriptMatchesProject(context, transcriptPath) {
  try {
    const descriptor = fs.openSync(transcriptPath, 'r');
    try {
      const buffer = Buffer.alloc(TRANSCRIPT_IDENTITY_SCAN_BYTES);
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
      const lines = buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/).slice(0, TRANSCRIPT_IDENTITY_SCAN_LINES);
      for (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const candidates = [
          record?.payload?.cwd,
          record?.payload?.environment_context?.cwd,
          record?.cwd
        ].filter(value => typeof value === 'string' && value.trim());
        for (const candidate of candidates) {
          let canonical;
          try { canonical = fs.realpathSync.native(path.resolve(candidate)); } catch { continue; }
          if (pathContains(context.canonicalProjectRoot, canonical)) return true;
        }
      }
      return false;
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return false;
  }
}

/**
 * Accept a transcript path only if it is the one this session owns.
 *
 * The path arrives from the runtime on stdin, and whatever it points at gets
 * parsed and folded into state that is later rendered into a prompt. Checking
 * only that the file exists would let any readable file take that route, so the
 * path must resolve inside the runtime's own directory and carry this session's
 * id in the place that runtime puts it.
 *
 * @returns {{path: string, size: number}|null}
 */
function ownedTranscriptPath(context, candidate, environment = process.env) {
  if (!context || typeof candidate !== 'string' || !candidate.trim()) return null;
  try {
    const info = fs.lstatSync(candidate);
    if (!info.isFile() || info.isSymbolicLink()) return null;
    const resolved = fs.realpathSync.native(candidate);
    const root = providerHome(context, environment);
    if (!root || !pathContains(root, resolved)) return null;

    const basename = path.basename(resolved);
    if (context.runtime === 'codex') {
      const sessionsRoot = path.join(root, 'sessions');
      const expectedSuffix = `-${context.normalizedSessionId}.jsonl`;
      if (!pathContains(sessionsRoot, resolved)) return null;
      if (basename !== `${context.normalizedSessionId}.jsonl` && !basename.endsWith(expectedSuffix)) return null;
      if (!codexTranscriptMatchesProject(context, resolved)) return null;
    } else {
      const expectedDirectory = path.join(root, 'projects', claudeProjectSlug(context.sessionLaunchRoot));
      if (!pathsEqual(path.dirname(resolved), expectedDirectory)) return null;
      if (basename !== `${context.normalizedSessionId}.jsonl`) return null;
    }
    return { path: resolved, size: info.size };
  } catch {
    return null;
  }
}

/**
 * Pick the transcript to read. When the incoming path and the remembered one are
 * both valid but different, neither is used: two owned transcripts for one
 * session means something is wrong, and guessing would mix two histories.
 */
function resolveOwnedTranscript(context, stdinData, existingState, environment = process.env) {
  const direct = ownedTranscriptPath(context, stdinData.transcript_path, environment);
  const cached = ownedTranscriptPath(context, existingState.lastTranscriptPath, environment);
  if (direct && cached && direct.path !== cached.path) return null;
  return direct || cached;
}

/**
 * Context-aware snapshot refresh: same job as the session-id version below, but
 * the transcript must be one this session owns, and only its tail is read.
 */
async function refreshStatuslineSnapshotWithContext(context, stdinData, options = {}) {
  try {
    if (!context) return { success: false, reason: 'missing-session-context' };
    const now = new Date(options.now || Date.now()).toISOString();
    const existingState = readSessionState(context) || {};
    const transcriptSource = resolveOwnedTranscript(context, stdinData, existingState, options.environment);

    if (!transcriptSource) {
      // A checkpoint must describe real work, so it insists on a transcript.
      if (options.requireOwnedTranscript) {
        return { success: false, reason: 'missing-owned-transcript' };
      }
      const success = updateSessionState(context, state => ({
        ...state,
        statusline: sanitizeActivitySnapshot(
          applyStatuslineEvent(state.statusline || createEmptyActivitySnapshot(), stdinData, now)
        )
      }));
      const current = success ? readSessionState(context) : null;
      return current
        ? { success: true, warmed: Boolean(current.statusline?.warmed), snapshotRevision: current.stateRevision }
        : { success: false, reason: 'write-failed' };
    }

    const start = Math.max(0, transcriptSource.size - TRANSCRIPT_MAX_BYTES);
    const transcript = await parseTranscript(transcriptSource.path, {
      start,
      end: transcriptSource.size > 0 ? transcriptSource.size - 1 : undefined,
      maxLines: TRANSCRIPT_MAX_LINES,
      deadline: Date.now() + TRANSCRIPT_BUDGET_MS
    });

    const success = updateSessionState(context, state => {
      const currentSnapshot = state.statusline || createEmptyActivitySnapshot();
      const parsedSnapshot = applyStatuslineEvent({
        sessionStart: transcript.sessionStart
          ? new Date(transcript.sessionStart).toISOString()
          : currentSnapshot.sessionStart || now,
        updatedAt: now,
        warmed: true,
        agents: transcript.agents || [],
        todos: transcript.todos || []
      }, stdinData, now);
      const preserve = shouldPreserveExistingSnapshot(currentSnapshot, parsedSnapshot, transcript);
      return {
        ...state,
        statusline: sanitizeActivitySnapshot(preserve ? applyStatuslineEvent(currentSnapshot, stdinData, now) : parsedSnapshot),
        lastTranscriptPath: preserve && state.lastTranscriptPath ? state.lastTranscriptPath : transcriptSource.path
      };
    });

    const current = success ? readSessionState(context) : null;
    return current
      ? { success: true, warmed: true, snapshotRevision: current.stateRevision }
      : { success: false, reason: 'write-failed' };
  } catch {
    return { success: false, reason: 'snapshot-refresh-failed' };
  }
}

/**
 * Gather the fields a checkpoint carries to the next session. Read from stored
 * state and git rather than from stdin, so a checkpoint reflects what actually
 * happened rather than what the current event claims.
 */
function extractCheckpointData(context) {
  const state = readSessionState(context);
  if (!state) return null;
  const cwd = context.canonicalProjectRoot;
  const modified = execGit(['diff', '--name-only', 'HEAD'], cwd);
  return {
    branch: execGit(['branch', '--show-current'], cwd),
    activePlan: typeof state.activePlan === 'string' ? state.activePlan : null,
    todos: Array.isArray(state.statusline?.todos) ? state.statusline.todos : [],
    modifiedFiles: modified ? modified.split('\n').filter(Boolean).slice(0, 20) : []
  };
}

/**
 * Record what this session leaves for the next one.
 *
 * The revision is reserved first so the checkpoint has a slot no other writer can
 * take, then the snapshot is refreshed so the stored todos are current, and only
 * then is the checkpoint written. Each step returns a reason on failure because
 * this runs on Stop, where there is no one left to ask.
 */
async function persistProjectCheckpoint(context, stdinData, options = {}) {
  const generatedAt = new Date(options.generatedAt || Date.now()).toISOString();
  const eventRevision = allocateEventRevision(context, options);
  if (!eventRevision) return { success: false, reason: 'revision-allocation-failed' };

  const refresh = await refreshStatuslineSnapshotWithContext(context, stdinData, {
    ...options,
    requireOwnedTranscript: true
  });
  if (!refresh.success || !refresh.snapshotRevision) {
    return { success: false, reason: refresh.reason || 'refresh-failed' };
  }

  const data = extractCheckpointData(context);
  if (!data) return { success: false, reason: 'missing-fresh-state' };

  const success = writeProjectCheckpoint(context, data, {
    ...options,
    generatedAt,
    eventRevision,
    snapshotRevision: refresh.snapshotRevision
  });
  return success ? { success: true, eventRevision } : { success: false, reason: 'checkpoint-write-failed' };
}

/** A context, as opposed to the stdin payload the legacy signature takes. */
function isSessionContext(value) {
  return Boolean(value && typeof value === 'object' && value.schemaVersion === 2 && typeof value.sessionKey === 'string');
}

/**
 * Refresh cached statusline activity from the transcript.
 *
 * Accepts either form while hooks migrate: `(context, stdinData, options)` uses
 * the identity-keyed store and verifies transcript ownership, `(stdinData)` keeps
 * the original session-id behavior.
 */
async function refreshStatuslineSnapshot(contextOrStdin, stdinData, options = {}) {
  if (isSessionContext(contextOrStdin)) {
    return refreshStatuslineSnapshotWithContext(contextOrStdin, stdinData || {}, options);
  }
  return refreshStatuslineSnapshotBySessionId(contextOrStdin || {});
}

/** Refresh cached statusline activity from transcript (off startup path) */
async function refreshStatuslineSnapshotBySessionId(stdinData) {
  try {
    const sessionId = stdinData.session_id || process.env.FIS_SESSION_ID || '';
    if (!sessionId) return { success: false, reason: 'missing-session-id' };

    const now = new Date().toISOString();
    const existingState = readSessionState(sessionId) || {};
    const transcriptPath = resolveTranscriptPath(stdinData, existingState);

    if (!transcriptPath) {
      const success = updateSessionState(sessionId, (state) => {
        const currentSnapshot = state.statusline || createEmptyActivitySnapshot();
        return {
          ...state,
          statusline: sanitizeActivitySnapshot(applyStatuslineEvent(currentSnapshot, stdinData, now))
        };
      });

      return success
        ? { success: true, warmed: Boolean(existingState.statusline?.warmed) }
        : { success: false, reason: 'write-failed' };
    }

    const transcript = await parseTranscript(transcriptPath);
    const success = updateSessionState(sessionId, (state) => {
      const currentSnapshot = state.statusline || createEmptyActivitySnapshot();
      const parsedSnapshot = applyStatuslineEvent({
        sessionStart: transcript.sessionStart
          ? new Date(transcript.sessionStart).toISOString()
          : currentSnapshot.sessionStart || now,
        updatedAt: now,
        warmed: true,
        agents: transcript.agents || [],
        todos: transcript.todos || []
      }, stdinData, now);
      const preserveCurrent = shouldPreserveExistingSnapshot(currentSnapshot, parsedSnapshot, transcript);
      const nextSnapshot = preserveCurrent
        ? applyStatuslineEvent(currentSnapshot, stdinData, now)
        : parsedSnapshot;
      const currentTranscriptPath = typeof state.lastTranscriptPath === 'string'
        ? state.lastTranscriptPath
        : '';

      return {
        ...state,
        statusline: sanitizeActivitySnapshot(nextSnapshot),
        lastTranscriptPath: preserveCurrent && currentTranscriptPath
          ? currentTranscriptPath
          : transcriptPath
      };
    });

    if (!success) {
      return { success: false, reason: 'write-failed' };
    }

    return { success: true, warmed: true };
  } catch {
    return { success: false, reason: 'snapshot-refresh-failed' };
  }
}

function resolveTranscriptPath(stdinData, existingState) {
  const directPath = typeof stdinData.transcript_path === 'string'
    ? stdinData.transcript_path
    : '';
  if (directPath && fs.existsSync(directPath)) return directPath;

  const cachedPath = typeof existingState.lastTranscriptPath === 'string'
    ? existingState.lastTranscriptPath
    : '';
  if (cachedPath && fs.existsSync(cachedPath)) return cachedPath;

  return '';
}

function applyStatuslineEvent(snapshot, stdinData, now) {
  const eventType = stdinData.hook_event_name || null;
  const normalized = sanitizeActivitySnapshot({
    ...snapshot,
    updatedAt: now
  });

  if (eventType !== 'SubagentStop') {
    return normalized;
  }

  const agentId = stdinData.agent_id != null ? String(stdinData.agent_id) : null;
  const agentType = typeof stdinData.agent_type === 'string' ? stdinData.agent_type : null;
  if (!agentId && !agentType) {
    return normalized;
  }

  const agents = normalized.agents.map(agent => ({ ...agent }));
  let matched = false;

  if (agentId) {
    matched = markMatchingAgentCompleted(agents, agent => agent.id === agentId, now);
  }

  if (!matched && agentType) {
    matched = markMatchingAgentCompleted(
      agents,
      agent => agent.status === 'running' && agent.type === agentType,
      now
    );
  }

  return matched
    ? { ...normalized, agents, updatedAt: now }
    : normalized;
}

function shouldPreserveExistingSnapshot(existingSnapshot, parsedSnapshot, transcript) {
  if (!hasSnapshotActivity(existingSnapshot)) return false;
  if (!existingSnapshot || existingSnapshot.warmed !== true) return false;
  const existingUpdatedAt = Date.parse(existingSnapshot.updatedAt || '');
  const transcriptUpdatedAt = Date.parse(transcript?.lastActivityAt || transcript?.lastValidEntryAt || '');

  if (Number.isFinite(existingUpdatedAt) && Number.isFinite(transcriptUpdatedAt) && existingUpdatedAt >= transcriptUpdatedAt) {
    return true;
  }

  const transcriptIsIncomplete = Boolean(transcript && transcript.invalidLineCount > 0);

  if (!transcriptIsIncomplete) {
    if (hasSnapshotActivity(parsedSnapshot)) return false;
    return !transcript || transcript.statuslineActivityCount === 0;
  }

  if (!Number.isFinite(existingUpdatedAt) || !Number.isFinite(transcriptUpdatedAt)) {
    return true;
  }

  return existingUpdatedAt >= transcriptUpdatedAt;
}

function hasSnapshotActivity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  return (
    (Array.isArray(snapshot.agents) && snapshot.agents.length > 0) ||
    (Array.isArray(snapshot.todos) && snapshot.todos.length > 0)
  );
}

function markMatchingAgentCompleted(agents, predicate, now) {
  for (let index = agents.length - 1; index >= 0; index -= 1) {
    if (!predicate(agents[index])) continue;
    agents[index].status = 'completed';
    agents[index].endTime = agents[index].endTime || now;
    return true;
  }
  return false;
}

/** Extract todos from transcript + env vars + git diff */
function extractSessionData(stdinData) {
  const data = {
    timestamp: new Date().toISOString(),
    branch: process.env.FIS_GIT_BRANCH || '',
    plan: process.env.FIS_ACTIVE_PLAN || '',
    todos: [], modifiedFiles: []
  };
  const sessionId = stdinData.session_id || process.env.FIS_SESSION_ID || '';
  const cachedSnapshot = sessionId ? readSessionState(sessionId)?.statusline : null;
  if (cachedSnapshot && Array.isArray(cachedSnapshot.todos) && cachedSnapshot.todos.length > 0) {
    data.todos = cachedSnapshot.todos;
  }
  // Extract todos from transcript JSONL
  if (data.todos.length === 0 && stdinData.transcript_path) {
    try {
      const lines = fs.readFileSync(stdinData.transcript_path, 'utf8').split('\n').filter(Boolean);
      const latest = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const blocks = entry.message?.content;
          if (!Array.isArray(blocks)) continue;
          for (const block of blocks) {
            if (block.type === 'tool_use' && block.name === 'TodoWrite' && Array.isArray(block.input?.todos)) {
              latest.length = 0;
              latest.push(...block.input.todos);
            }
          }
        } catch { /* skip */ }
      }
      data.todos = latest;
    } catch { /* transcript unavailable */ }
  }
  // Modified files via git
  try {
    const diff = execGit(['diff', '--name-only', 'HEAD'], stdinData.cwd || process.cwd());
    if (diff) data.modifiedFiles = diff.split('\n').slice(0, 20);
  } catch { /* no git */ }
  return data;
}

/** Build structured markdown state from session data */
function buildStateContent(data) {
  const completed = data.todos.filter(t => t.status === 'completed');
  const pending = data.todos.filter(t => t.status !== 'completed');
  const lines = [
    '# Session State',
    `<!-- Generated: ${data.timestamp} -->`,
    `<!-- Branch: ${data.branch || 'unknown'} -->`,
    `<!-- Plan: ${data.plan || 'none'} -->`,
    '',
    '## What Worked (Verified)',
    ...(completed.length ? completed.map(t => `- ${t.content}`) : ['- (No completed tasks recorded)']),
    '',
    "## What's Left",
    ...(pending.length ? pending.map(t => `- [ ] ${t.content}`) : ['- (All tasks completed)']),
    ''
  ];
  if (data.plan) lines.push('## Active Plan', data.plan, '');
  lines.push('## Key Files Modified',
    ...(data.modifiedFiles.length ? data.modifiedFiles.map(f => `- ${f}`) : ['- (No file changes detected)']),
    '');
  return lines.join('\n');
}

/** Build markdown section for a completed subagent */
function buildAgentSection(stdinData) {
  const type = stdinData.agent_type || 'unknown';
  const ts = new Date().toISOString().slice(11, 19);
  return `\n## Agent Result: ${type} (${ts})\n- Completed at ${ts}\n`;
}

/** Extract agent result sections from existing state content */
function extractAgentSections(content) {
  const matches = content.match(/## Agent Result:.+?(?=\n## |$)/gs);
  return matches ? matches.join('\n') : null;
}

/** Atomic write: temp file + rename */
function writeAtomic(filePath, content) {
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function p2(n) { return String(n).padStart(2, '0'); }

module.exports = {
  TRANSCRIPT_BUDGET_MS,
  TRANSCRIPT_MAX_BYTES,
  TRANSCRIPT_MAX_LINES,
  getStateDir,
  loadState,
  persistState,
  archiveState,
  refreshStatuslineSnapshot,
  extractSessionData,
  buildStateContent,
  buildAgentSection,
  writeAtomic,
  extractCheckpointData,
  loadProjectCheckpoint,
  ownedTranscriptPath,
  persistProjectCheckpoint,
  shouldPreserveExistingSnapshot
};
