#!/usr/bin/env node
/**
 * Activate a plan for this session and for this worktree.
 *
 * Usage: node .claude/scripts/set-active-plan.cjs <plan-path>
 *
 * Two pointers, one act. The session temp file (/tmp/fis-session-{id}.json) is
 * what subagents read through the SubagentStart hook, and it dies with the
 * session. The worktree pointer under ~/.fis survives a restart, so the next
 * session resumes on the same plan instead of guessing from the branch name.
 * Env vars ($FIS_ACTIVE_PLAN) are just the initial snapshot from session start.
 *
 * Kept as a thin front end for `fis-plan.cjs use`, which every skill can call
 * for the rest of the plan surface (resolve, status, check, update).
 */

const path = require('path');
const { updateSessionState } = require('../hooks/lib/fis-config-utils.cjs');
const { setPointer } = require('../hooks/lib/plan-pointer.cjs');
const { resolveExplicit, PlanResolutionError } = require('./lib/plan-resolver.cjs');

const sessionId = process.env.FIS_SESSION_ID;
const newPlan = process.argv[2];

if (!newPlan) {
  console.error('Error: Plan path required');
  console.log('Usage: node .claude/scripts/set-active-plan.cjs <plan-path>');
  console.log('Example: node .claude/scripts/set-active-plan.cjs plans/251207-1030-feature-name');
  process.exit(1);
}

// Issue #335: Resolve to absolute path to support brownfield/subdirectory workflows
// When agent navigates away from session origin, relative paths become invalid.
// A directory that actually holds a plan.md wins, so a bare plan name works too;
// anything else is taken at face value rather than refused, because activating a
// plan that is about to be written is a normal ordering.
let absolutePlan;
try {
  absolutePlan = resolveExplicit(newPlan);
} catch (e) {
  if (!(e instanceof PlanResolutionError)) throw e;
  absolutePlan = path.resolve(newPlan);
}

const pinned = setPointer(absolutePlan);
if (!pinned.ok) {
  console.warn('Warning: could not persist the worktree pointer - only this session will remember');
}

if (!sessionId) {
  console.warn('Warning: FIS_SESSION_ID not set - session state will not persist');
  console.log(`Active plan set to: ${absolutePlan}`);
  process.exit(0);
}

const success = updateSessionState(sessionId, (current) => ({
  ...current,
  activePlan: absolutePlan,
  timestamp: Date.now()
}));

if (success) {
  console.log(`Active plan set to: ${absolutePlan}`);
} else {
  console.error('Failed to update session state');
  process.exit(1);
}
