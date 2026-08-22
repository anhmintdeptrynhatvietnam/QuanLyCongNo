#!/usr/bin/env node
/**
 * Stop Hook - Next Step Reminder After Planning
 *
 * Presents user-choice next steps once a plan is on the table, rather than
 * assuming implementation follows. Also emits the full absolute path so a new
 * session (after /clear, or in another worktree) can find the plan.
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 */

// Crash wrapper
try {
  const fs = require('fs');
  const path = require('path');
  const {
    createSessionStateContext,
    isHookEnabled,
    readSessionState,
    toDisplayPath
  } = require('./lib/fis-config-utils.cjs');

  // Early exit if hook disabled in config
  if (!isHookEnabled('craft-after-plan-reminder')) {
    process.exit(0);
  }

  const { safeDisplayValue } = require('./lib/session-state-renderer.cjs');

  async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) process.exit(0);
    let payload = {};
    try {
      payload = JSON.parse(stdin);
    } catch (_) {
      payload = {};
    }

    // Get active plan path from the explicit hook ownership context.
    const sessionContext = createSessionStateContext({
      sessionId: payload.session_id,
      cwd: process.env.FIS_PROJECT_ROOT || payload.cwd || process.cwd(),
      requireBinding: true
    });
    let planPath = null;

    if (sessionContext) {
      const state = readSessionState(sessionContext);
      if (state?.activePlan) {
        planPath = state.activePlan;
        // Ensure it's absolute
        if (!path.isAbsolute(planPath) && state.sessionLaunchRoot) {
          planPath = path.resolve(state.sessionLaunchRoot, planPath);
        }
      }
    }

    // Relevance gate. On `Stop` the matcher is a wildcard, so this fires on every
    // main-loop turn, not only after planning. With no active plan bound there is
    // nothing to remind about, so exit silently rather than repeating the reminder
    // all session. A `SubagentStop:Plan` registration is already scoped by its
    // matcher and is intentionally left ungated, so it still fires (with the
    // fallback line) even when the plan path cannot be resolved.
    if (payload.hook_event_name === 'Stop' && !planPath) {
      process.exit(0);
    }

    const lines = [
      'Planning complete. Stop here and ask the user which next step they want: implement, validate, red-team, revise, or end.'
    ];
    if (planPath) {
      // This lands inside a command the model runs verbatim and unquoted, so a
      // backslash path would lose its separators the moment it reaches a shell.
      // path.join hands back native separators; render it before interpolating.
      const planMdPath = toDisplayPath(path.join(planPath, 'plan.md'));
      lines.push(`Optional implementation command after user approval: /fis:craft ${safeDisplayValue(planMdPath)}`);
    } else {
      // Fallback when plan path unavailable
      lines.push('Optional implementation command after user approval: /fis:craft {full-absolute-path-to-plan.md}');
    }
    lines.push('Add --auto only if the user explicitly asks for autonomous implementation.');

    // A Stop hook that exits 0 with plain-text stdout is invalid on runtimes that
    // parse this wire as JSON, so the non-blocking shape is emitted
    // unconditionally rather than gated on a runtime discriminator: any path to a
    // plain-text branch (a stale installed hook, or a stdin parse failure leaving
    // the payload empty) would produce contract-invalid output. Only `continue`
    // and `systemMessage` are emitted, since the wire rejects unknown fields, and
    // `continue: true` is a no-op.
    process.stdout.write(JSON.stringify({
      continue: true,
      systemMessage: lines.join('\n')
    }));

    process.exit(0);
  } catch (error) {
    // Silent fail - non-blocking
    process.exit(0);
  }
  }

  main();
} catch (e) {
  // Minimal crash logging (zero deps — only Node builtins)
  try {
    const fs = require('fs');
    const p = require('path');
    const logDir = p.join(__dirname, '.logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(p.join(logDir, 'hook-log.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), hook: p.basename(__filename, '.cjs'), status: 'crash', error: e.message }) + '\n');
  } catch (_) {}
  process.exit(0); // fail-open
}
