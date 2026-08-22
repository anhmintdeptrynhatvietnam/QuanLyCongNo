#!/usr/bin/env node
/**
 * Resolve and progress plans. One accessor, so plan.md and the phase files
 * cannot drift apart.
 *
 * Usage: node .claude/scripts/fis-plan.cjs <command> [options]
 *
 *   use <plan>              Pin a plan for this worktree and branch
 *   unuse                   Remove the pin
 *   resolve                 Print the resolved plan and how it was resolved
 *   list                    Plans in the plans dir, with progress
 *   show [phase]            Print plan.md, or a phase file
 *   status                  Progress across every phase
 *   check <phase> <item>    Tick a checklist item in a phase file
 *   uncheck <phase> <item>  Untick it
 *   update <phase> --status <s>   Set a phase status in plan.md and the phase file
 *   update --status <s>     Set the plan's own status
 *
 * Options:
 *   --plan <path>   Act on this plan instead of the resolved one
 *   --cwd <dir>     Directory to resolve the project and worktree from
 *   --json          Machine-readable output (read commands and mutations)
 *
 * `<item>` is a checkbox number within the phase file, or text to match.
 *
 * This is a payload script rather than a CLI subcommand because FIS AI Kit is
 * installed by the DAI desktop app, so no `fis` binary is guaranteed to be on
 * PATH. Skills and hooks invoke it by path, which always exists.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { setPointer, getPointer, clearPointer } = require('../hooks/lib/plan-pointer.cjs');
const { loadConfig } = require('../hooks/lib/fis-config-utils.cjs');
const {
  PlanResolutionError,
  findProjectRoot,
  listPlanDirs,
  getPlansDir,
  resolvePlan,
  resolveExplicit
} = require('./lib/plan-resolver.cjs');
const {
  PlanDocumentError,
  readPlan,
  findPhase,
  resolvePhaseFile,
  setPhaseStatus,
  setPlanStatus,
  setPhaseChecklistItem,
  summarize
} = require('./lib/plan-document.cjs');

const USAGE = 'Usage: node .claude/scripts/fis-plan.cjs <use|unuse|resolve|list|show|status|check|uncheck|update> [--plan <path>] [--cwd <dir>] [--json]';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Parse argv into a command, positional arguments, and flags. */
function parseArgs(argv) {
  const [command = 'resolve', ...rest] = argv;
  const flags = { json: false, cwd: process.cwd(), plan: null, status: null };
  const positional = [];

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--cwd' || arg === '--plan' || arg === '--status') {
      const value = rest[i + 1];
      // A following flag is a missing value, not the value. `update 2 --status
      // --json` should say so rather than try to set the status to "--json".
      if (!value || value.startsWith('--')) fail(`${arg} needs a value`);
      if (arg === '--cwd') flags.cwd = path.resolve(value);
      else if (arg === '--plan') flags.plan = value;
      else flags.status = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      fail(`unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

/** Emit JSON or fall back to a line-oriented printer. */
function emit(flags, payload, print) {
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  print(payload);
}

/** Resolve the plan a command should act on, honoring --plan. */
function planFor(flags) {
  return resolvePlan({ explicit: flags.plan, cwd: flags.cwd });
}

function commandUse(positional, flags) {
  const ref = positional[0] || flags.plan;
  if (!ref) fail('use needs a plan path or name');

  const planDir = resolveExplicit(ref, { cwd: flags.cwd });
  const result = setPointer(planDir, { cwd: flags.cwd });
  if (!result.ok) fail(`could not write the pointer store for ${planDir}`);

  // A config that pins its own resolution order may not list `pointer`, in which
  // case this pin is written and never read. Reported rather than overridden:
  // the order is the user's setting to make.
  const order = loadConfig({ cwd: flags.cwd })?.plan?.resolution?.order;
  const ignored = Array.isArray(order) && !order.includes('pointer');

  emit(flags, { planDir, scope: result.scope, ignoredByConfig: ignored }, (payload) => {
    console.log(`Pinned ${payload.planDir}`);
    console.log(`  worktree: ${payload.scope.worktree}`);
    console.log(`  branch:   ${payload.scope.branch || '(no branch)'}`);
    if (payload.ignoredByConfig) {
      console.log(`  warning: plan.resolution.order is [${order.join(', ')}] — add "pointer" for this pin to be used`);
    }
  });
}

function commandUnuse(flags) {
  const result = clearPointer({ cwd: flags.cwd });
  if (!result.ok) fail('could not write the pointer store');

  emit(flags, { existed: result.existed, scope: result.scope }, (payload) => {
    console.log(payload.existed ? 'Pin removed' : 'No pin was set for this worktree and branch');
  });
}

function commandResolve(flags) {
  const resolved = planFor(flags);
  const pointer = getPointer({ cwd: flags.cwd });

  // A plan outside the project is legitimate, but `use` turns one explicit path
  // into every later session's default, and reports then get written beside it.
  // Said out loud so the provenance survives the act that set it.
  const projectRoot = findProjectRoot(flags.cwd);
  const outsideProject = path.relative(projectRoot, resolved.planDir).startsWith('..');

  emit(flags, { ...resolved, pointerStale: pointer.stale, outsideProject }, (payload) => {
    console.log(payload.planDir);
    console.log(`  resolved by: ${payload.resolvedBy}${payload.directive ? '' : ' (suggestion)'}`);
    if (payload.outsideProject) console.log(`  note: outside ${projectRoot} — reports will be written beside the plan`);
    if (payload.pointerStale) console.log('  note: the pinned plan is gone — re-run `use`');
  });
}

function commandList(flags) {
  const dirs = listPlanDirs({ cwd: flags.cwd });
  const active = (() => {
    try {
      return planFor(flags).planDir;
    } catch {
      return null;
    }
  })();

  const plans = dirs.map((dir) => {
    const entry = { planDir: dir, name: path.basename(dir), active: dir === active };
    try {
      const view = summarize(dir);
      return { ...entry, status: view.planStatus, phases: view.totals.phases, completed: view.totals.completed };
    } catch (e) {
      // One unreadable plan must not hide the rest of the list.
      return { ...entry, status: null, phases: 0, completed: 0, error: e.message };
    }
  });

  emit(flags, { plansDir: getPlansDir({ cwd: flags.cwd }), plans }, (payload) => {
    if (payload.plans.length === 0) {
      console.log(`No plans under ${payload.plansDir}`);
      return;
    }
    for (const plan of payload.plans) {
      const marker = plan.active ? '*' : ' ';
      const detail = plan.error ? `unreadable — ${plan.error}` : `${plan.status || 'no status'}${plan.phases ? ` ${plan.completed}/${plan.phases} phases` : ''}`;
      console.log(`${marker} ${plan.name} — ${detail}`);
    }
  });
}

function commandShow(positional, flags) {
  const { planDir } = planFor(flags);
  const plan = readPlan(planDir);

  if (positional.length === 0) {
    if (flags.json) {
      console.log(JSON.stringify({ planDir, file: plan.planPath, content: plan.content }, null, 2));
      return;
    }
    process.stdout.write(plan.content);
    return;
  }

  const phase = findPhase(plan, positional[0]);
  const file = resolvePhaseFile(plan, phase);
  if (!file) fail(`phase ${phase.phaseId} has no phase file`);

  const content = fs.readFileSync(file, 'utf8');
  if (flags.json) {
    console.log(JSON.stringify({ planDir, phaseId: phase.phaseId, file, content }, null, 2));
    return;
  }
  process.stdout.write(content);
}

function commandStatus(flags) {
  const { planDir, resolvedBy } = planFor(flags);
  const view = summarize(planDir);

  emit(flags, { ...view, resolvedBy }, (payload) => {
    console.log(`${path.basename(payload.planDir)} — ${payload.planStatus || 'no status'}`);
    for (const phase of payload.phases) {
      const checklist = phase.checklist.total ? ` [${phase.checklist.done}/${phase.checklist.total}]` : '';
      console.log(`  ${phase.phaseId}. ${phase.name} — ${phase.status}${checklist}`);
    }
    const { completed, phases, checklistDone, checklistTotal } = payload.totals;
    console.log(`  ${completed}/${phases} phases complete, ${checklistDone}/${checklistTotal} items checked`);
    for (const drift of payload.drift) {
      console.log(`  ! phase ${drift.phaseId}: plan.md says ${drift.table}, the phase file says ${drift.frontmatter}`);
    }
  });
}

function commandCheck(positional, flags, checked) {
  const [phaseRef, ...itemParts] = positional;
  if (!phaseRef) fail(`${checked ? 'check' : 'uncheck'} needs a phase`);
  const item = itemParts.join(' ').trim();
  if (!item) fail(`${checked ? 'check' : 'uncheck'} needs a checkbox number or text to match`);

  const { planDir } = planFor(flags);
  const result = setPhaseChecklistItem(planDir, phaseRef, item, checked);

  emit(flags, { planDir, ...result }, (payload) => {
    const verb = payload.changed ? (checked ? 'Checked' : 'Unchecked') : 'Already';
    console.log(`${verb}: ${payload.item.text}`);
    console.log(`  ${path.basename(payload.phaseFile)} — ${payload.progress.done}/${payload.progress.total} items`);
  });
}

function commandUpdate(positional, flags) {
  if (!flags.status) fail('update needs --status <pending|in-progress|completed|cancelled>');
  const { planDir } = planFor(flags);

  if (positional.length === 0) {
    const result = setPlanStatus(planDir, flags.status);
    emit(flags, { planDir, scope: 'plan', ...result }, (payload) => {
      console.log(payload.changed
        ? `Plan status: ${payload.previous} → ${payload.status}`
        : `Plan status already ${payload.status}`);
    });
    return;
  }

  const result = setPhaseStatus(planDir, positional[0], flags.status);
  emit(flags, { planDir, scope: 'phase', ...result }, (payload) => {
    console.log(`Phase ${payload.phaseId}: ${payload.previous || 'unset'} → ${payload.status}`);
    console.log(`  plan.md ${payload.tableUpdated ? 'updated' : 'already current'}`);
    // The status cell is replaced whole, so anything else it carried is gone.
    if (payload.discarded) console.log(`  dropped from the Status cell: ${payload.discarded}`);
    if (payload.phaseFile) {
      const state = payload.frontmatterStatusField === false
        ? 'has no status field'
        : (payload.frontmatterUpdated ? 'updated' : 'already current');
      console.log(`  ${path.basename(payload.phaseFile)} ${state}`);
    }
  });
}

function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case 'use': commandUse(positional, flags); break;
      case 'unuse': commandUnuse(flags); break;
      case 'resolve': commandResolve(flags); break;
      case 'list': commandList(flags); break;
      case 'show': commandShow(positional, flags); break;
      case 'status': commandStatus(flags); break;
      case 'check': commandCheck(positional, flags, true); break;
      case 'uncheck': commandCheck(positional, flags, false); break;
      case 'update': commandUpdate(positional, flags); break;
      case 'help':
      case '--help':
      case '-h':
        console.log(USAGE);
        break;
      default:
        fail(`unknown command: ${command}\n${USAGE}`);
    }
  } catch (e) {
    // A resolution miss or a malformed plan is a normal outcome for a caller to
    // handle, so it reports as a message and exit 1 rather than a stack trace.
    if (e instanceof PlanResolutionError || e instanceof PlanDocumentError) fail(e.message);
    throw e;
  }
}

main();
