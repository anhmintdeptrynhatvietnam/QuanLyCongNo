#!/usr/bin/env node
/**
 * Session State Hook - Persist/restore session progress across sessions
 *
 * Fires on:
 * - PostToolUse (task/todo tools) -> refresh statusline activity cache
 * - SubagentStop -> refresh statusline cache + append the agent result
 * - Stop -> the above, plus a project checkpoint the next session can inherit
 * - SessionStart (legacy safety path only) -> load previous state text
 *
 * Exit Codes:
 *   0 - Always (fail-open, non-blocking)
 */

try {
  const fs = require('fs');
  const { createSessionStateContext, isHookEnabled } = require('./lib/fis-config-utils.cjs');

  if (!isHookEnabled('session-state')) process.exit(0);

  const {
    loadState,
    persistState,
    persistProjectCheckpoint,
    refreshStatuslineSnapshot
  } = require('./lib/session-state-manager.cjs');

  const TRACKED_POST_TOOL_EVENTS = new Set(['Agent', 'Task', 'TaskCreate', 'TaskUpdate', 'TodoWrite']);

  async function main() {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const eventType = data.hook_event_name || null;

    // A bound session gets the identity-keyed store and, on Stop, a checkpoint the
    // next session can inherit. A session that was never bound (started before
    // this upgrade, or without SessionStart) still refreshes through the legacy
    // session-id path, so activity tracking does not simply stop.
    const context = createSessionStateContext({
      sessionId: data.session_id,
      cwd: process.env.FIS_PROJECT_ROOT || data.cwd || process.cwd(),
      requireBinding: true
    });
    const refresh = () => (context
      ? refreshStatuslineSnapshot(context, data)
      : refreshStatuslineSnapshot(data));

    if (eventType === 'PostToolUse') {
      const toolName = data.tool_name || '';
      if (TRACKED_POST_TOOL_EVENTS.has(toolName)) {
        await refresh();
      }
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }

    if (eventType === 'Stop' || eventType === 'SubagentStop') {
      await refresh();
      // A checkpoint records the end of a whole session, so it belongs to Stop
      // only; a finishing subagent just refreshes the snapshot.
      if (eventType === 'Stop' && context) {
        await persistProjectCheckpoint(context, data);
      }
      persistState(data, { eventType });
      process.exit(0);
    }

    // Legacy safety path: keep previous SessionStart behavior if hook is still wired.
    if (!eventType) {
      const isCompact = data.source === 'compact';
      if (data.source && data.source !== 'startup' && !isCompact) process.exit(0);

      const state = loadState(process.cwd());
      if (state) {
        if (isCompact) {
          console.log('\n--- Session State (Post-Compaction Recovery) ---');
          console.log(state);
          console.log('--- End Session State ---\n');
          console.log('Context was compacted. Above is your last saved progress. Resume from where you left off.');
          console.log('IMPORTANT: Re-read active plan files and todo list. Do NOT re-do completed work.');
        } else {
          console.log('\n--- Previous Session State ---');
          console.log(state);
          console.log('--- End Session State ---\n');
          console.log('Review above state from your last session. Continue where you left off or start fresh.');
        }
      }
      process.exit(0);
    }

    process.exit(0);
  }

  main().catch(() => {
    process.exit(0);
  });
} catch (e) {
  try {
    const fs = require('fs');
    const p = require('path');
    const logDir = p.join(__dirname, '.logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      p.join(logDir, 'hook-log.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        hook: 'session-state',
        status: 'crash',
        error: e.message
      }) + '\n'
    );
  } catch (_) {}
  process.exit(0);
}
