#!/usr/bin/env node
/**
 * Development Rules Reminder - UserPromptSubmit Hook (Optimized)
 *
 * Injects context: session info, rules, modularization reminders, and Plan Context.
 * Static env info (Node, Python, OS) now comes from SessionStart env vars.
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 *
 * Core logic extracted to lib/context-builder.cjs for OpenCode plugin reuse.
 */

// Crash wrapper
try {
  const fs = require('fs');
  const { createHookTimer, logHookCrash } = require('./lib/hook-logger.cjs');

  // Import shared context building logic
  const {
    buildReminderContext,
    buildInjectionScopeKey,
    reserveInjectionScope,
    markRecentlyInjected,
    clearPendingInjection
  } = require('./lib/context-builder.cjs');
  const { createSessionStateContext, isHookEnabled } = require('./lib/fis-config-utils.cjs');

  // Early exit if hook disabled in config
  if (!isHookEnabled('dev-rules-reminder')) {
    process.exit(0);
  }

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const timer = createHookTimer('dev-rules-reminder', { event: 'UserPromptSubmit' });
  let stateTarget = null;
  let scopeKey = 'session';
  let reservedScope = false;

  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) {
      timer.end({ status: 'skip', exit: 0, note: 'empty-input' });
      process.exit(0);
    }

    const payload = JSON.parse(stdin);
    const sessionId = payload.session_id || process.env.FIS_SESSION_ID || null;
    const baseDir = payload.cwd || process.cwd();

    // A bound session keys dedup on identity rather than a reusable session id,
    // so a second session in the same directory cannot suppress the reminder.
    const sessionContext = createSessionStateContext({
      sessionId,
      cwd: process.env.FIS_PROJECT_ROOT || baseDir,
      requireBinding: true
    });
    stateTarget = sessionContext || sessionId;

    // Issue #327: Use CWD as base for subdirectory workflow support
    // The baseDir is passed to buildReminderContext for absolute path resolution
    scopeKey = buildInjectionScopeKey({
      baseDir: sessionContext?.sessionLaunchRoot || baseDir
    });

    const reservation = reserveInjectionScope(stateTarget, scopeKey, payload.transcript_path || null);
    reservedScope = reservation.reserved;
    if (!reservation.shouldInject) {
      timer.end({ status: 'skip', exit: 0, note: 'recently-injected' });
      process.exit(0);
    }

    // Use shared context builder with baseDir for absolute paths
    const { content } = buildReminderContext({ sessionId: stateTarget, baseDir });

    console.log(content);
    markRecentlyInjected(stateTarget, scopeKey);
    timer.end({ status: 'ok', exit: 0, note: 'context-injected' });
    process.exit(0);
  } catch (error) {
    if (reservedScope) {
      clearPendingInjection(stateTarget, scopeKey);
    }
    console.error(`Dev rules hook error: ${error.message}`);
    logHookCrash('dev-rules-reminder', error, { event: 'UserPromptSubmit' });
    process.exit(0);
  }
  }

  main();
} catch (e) {
  try {
    const { logHookCrash } = require('./lib/hook-logger.cjs');
    logHookCrash('dev-rules-reminder', e, { event: 'UserPromptSubmit' });
  } catch (_) {}
  process.exit(0); // fail-open
}
