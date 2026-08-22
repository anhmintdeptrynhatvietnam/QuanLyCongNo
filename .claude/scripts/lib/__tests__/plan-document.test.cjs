/**
 * Tests for the plan document reader/writer
 * Run: node .claude/scripts/lib/__tests__/plan-document.test.cjs
 *
 * The invariant under test is that plan.md and the phase files move together and
 * that a malformed or unusual plan is refused rather than mangled.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const doc = require('../plan-document.cjs');
const { listChecklistItems, canonicalStatus } = require('../plan-markdown.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fis-plan-doc-test-'));
  try {
    fn(sandbox);
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message.split('\n').join('\n  ')}`);
    failed++;
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

function assertEquals(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, needle, msg = '') {
  try {
    fn();
  } catch (e) {
    if (needle && !e.message.includes(needle)) {
      throw new Error(`${msg}\n  Expected error containing: ${needle}\n  Actual: ${e.message}`);
    }
    return e;
  }
  throw new Error(`${msg}\n  Expected a throw, got none`);
}

const PLAN_MD = `# Test plan

**Status:** In progress
**Created:** 2026-01-01

## Phases

| Phase | Name | Depends on | Status |
|---|---|---|---|
| 01 | [Groundwork](phase-01-groundwork.md) | — | Complete |
| 02 | [Delivery](phase-02-delivery.md) | 01 | Not started |
| 02b | [Delivery follow-up](phase-02b-delivery-follow-up.md) | 02 | Not started |

## Acceptance criteria

1. It works.
`;

const PHASE_02 = `---
phase: 2
title: "Delivery"
status: pending
priority: P2
dependencies: [1]
---

# Phase 02: Delivery

## Success Criteria
- [ ] Ships the thing
- [ ] Documents the thing
- [x] Names the thing
`;

/** Build a plan directory with a phases table and three phase files. */
function makePlan(root, { planMd = PLAN_MD } = {}) {
  const dir = path.join(root, 'plans', '260101-0000-test-plan');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.md'), planMd);
  fs.writeFileSync(path.join(dir, 'phase-01-groundwork.md'), '---\nphase: 1\nstatus: completed\n---\n\n# Phase 01\n');
  fs.writeFileSync(path.join(dir, 'phase-02-delivery.md'), PHASE_02);
  fs.writeFileSync(path.join(dir, 'phase-02b-delivery-follow-up.md'), '---\nphase: 2\nstatus: pending\n---\n\n# Phase 02b\n');
  return dir;
}

console.log('\n=== reading ===\n');

test('a plan directory reads its phases, status, and phase files', (sandbox) => {
  const dir = makePlan(sandbox);
  const plan = doc.readPlan(dir);

  assertEquals(plan.phases.length, 3);
  assertEquals(plan.planStatus, 'In progress');
  assertEquals(plan.phases[0].status, 'completed');
  assertEquals(plan.phases[1].status, 'pending');
  assertEquals(plan.phaseFiles.length, 3);
});

test('a directory without plan.md is refused, not treated as an empty plan', (sandbox) => {
  assertThrows(() => doc.readPlan(sandbox), 'not a plan directory');
});

test('a phase reference is accepted as a number, a zero-padded id, or a filename', () => {
  assertEquals(doc.normalizePhaseRef('2'), '2');
  assertEquals(doc.normalizePhaseRef('02'), '2');
  assertEquals(doc.normalizePhaseRef('2b'), '2b');
  assertEquals(doc.normalizePhaseRef('phase-02b-delivery-follow-up.md'), '2b');
  assertEquals(doc.normalizePhaseRef('plans/x/phase-01-groundwork.md'), '1');
  assertEquals(doc.normalizePhaseRef('nonsense'), null);
});

test('phase 2 and phase 2b are different phases', (sandbox) => {
  const dir = makePlan(sandbox);
  const plan = doc.readPlan(dir);

  assertEquals(doc.findPhase(plan, '2').phaseId, '2');
  assertEquals(doc.findPhase(plan, '2b').phaseId, '2b');
});

test('an unknown phase names the phases the plan does have', (sandbox) => {
  const dir = makePlan(sandbox);
  const plan = doc.readPlan(dir);
  assertThrows(() => doc.findPhase(plan, '9'), 'has: 1, 2, 2b');
});

console.log('\n=== phase status ===\n');

test('setting a phase status writes both plan.md and the phase frontmatter', (sandbox) => {
  const dir = makePlan(sandbox);
  const result = doc.setPhaseStatus(dir, '2', 'in-progress');

  assertEquals(result.tableUpdated, true);
  assertEquals(result.frontmatterUpdated, true);

  const plan = doc.readPlan(dir);
  assertEquals(doc.findPhase(plan, '2').status, 'in-progress');

  const phaseText = fs.readFileSync(path.join(dir, 'phase-02-delivery.md'), 'utf8');
  assertEquals(/^status: in-progress$/m.test(phaseText), true, 'phase frontmatter should carry the new status');
});

test('the table and the phase file cannot end up disagreeing', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'completed');

  const view = doc.summarize(dir);
  assertEquals(view.drift.length, 0, `expected no drift, got ${JSON.stringify(view.drift)}`);
});

test('a hand-edited phase file that disagrees with plan.md is reported as drift', (sandbox) => {
  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.writeFileSync(phaseFile, fs.readFileSync(phaseFile, 'utf8').replace('status: pending', 'status: completed'));

  const view = doc.summarize(dir);
  assertEquals(view.drift.length, 1);
  assertEquals(view.drift[0].phaseId, '2');
  assertEquals(view.drift[0].table, 'pending');
  assertEquals(view.drift[0].frontmatter, 'completed');
});

test('setting the same status twice writes nothing the second time', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'completed');
  const afterFirst = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');

  const second = doc.setPhaseStatus(dir, '2', 'completed');
  assertEquals(second.tableUpdated, false);
  assertEquals(second.frontmatterUpdated, false);
  assertEquals(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'), afterFirst);
});

test('only the status cell of the targeted row changes', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'completed');

  const after = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8').split('\n');
  const before = PLAN_MD.split('\n');
  const differing = before.map((line, i) => (line === after[i] ? null : i)).filter((i) => i !== null);

  assertEquals(differing.length, 1, `expected one changed line, changed: ${JSON.stringify(differing)}`);
  assertEquals(after[differing[0]].includes('Delivery'), true);
  assertEquals(after[differing[0]].includes('Complete'), true);
  assertEquals(after.length, before.length, 'line count must not change');
});

test('a status word the accessor does not know is refused', (sandbox) => {
  const dir = makePlan(sandbox);
  assertThrows(() => doc.setPhaseStatus(dir, '2', 'nearly-there'), 'unknown status');
});

test('common status synonyms map onto the canonical values', () => {
  assertEquals(canonicalStatus('Done'), 'completed');
  assertEquals(canonicalStatus('WIP'), 'in-progress');
  assertEquals(canonicalStatus('not started'), 'pending');
  assertEquals(canonicalStatus('Not-Started'), 'pending');
  assertEquals(canonicalStatus('abandoned'), 'cancelled');
  assertEquals(canonicalStatus('almost'), null);
});

test('cancelled round-trips instead of being rewritten every call', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'cancelled');

  const second = doc.setPhaseStatus(dir, '2', 'cancelled');
  assertEquals(second.previous, 'Cancelled');
  assertEquals(second.tableUpdated, false, 'the second call should write nothing');
  assertEquals(doc.summarize(dir).drift.length, 0, 'cancelled must not read back as drift');
});

test('an escaped pipe in a cell does not shift the status column', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: PLAN_MD.replace('| 02 | [Delivery](phase-02-delivery.md) | 01 | Not started |',
      '| 02 | [Delivery](phase-02-delivery.md) | 01 \\| 01b | Not started |')
  });

  doc.setPhaseStatus(dir, '2', 'completed');

  const row = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8')
    .split('\n').find((line) => line.includes('[Delivery]'));
  assertEquals(row.includes('01 \\| 01b'), true, `the dependency cell survived: ${row}`);
  assertEquals(row.trimEnd().endsWith('| Complete |'), true, `status cell: ${row}`);
});

test('a row with fewer columns than its header is refused', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: PLAN_MD.replace('| 02 | [Delivery](phase-02-delivery.md) | 01 | Not started |',
      '| 02 | [Delivery](phase-02-delivery.md) | Not started |')
  });

  assertThrows(() => doc.setPhaseStatus(dir, '2', 'completed'), 'does not line up');
  assertEquals(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8').includes('| Not started |'), true, 'plan.md untouched');
});

test('a plan whose phases are not in a table is refused rather than rewritten', (sandbox) => {
  const dir = path.join(sandbox, 'plans', '260101-0000-prose-plan');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.md'), '# Prose plan\n\n### Phase 1: Do it\n- Status: pending\n');

  assertThrows(() => doc.setPhaseStatus(dir, '1', 'completed'), 'cannot rewrite');
});

console.log('\n=== plan status ===\n');

test('a plan with a **Status:** line has that line updated', (sandbox) => {
  const dir = makePlan(sandbox);
  const result = doc.setPlanStatus(dir, 'completed');

  assertEquals(result.target, 'status-line');
  assertEquals(result.changed, true);
  assertEquals(/^\*\*Status:\*\* Complete$/m.test(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8')), true);
});

test('a plan with frontmatter has its frontmatter updated instead', (sandbox) => {
  const dir = makePlan(sandbox, { planMd: `---\nstatus: in-progress\n---\n\n# Plan\n\n${PLAN_MD}` });
  const result = doc.setPlanStatus(dir, 'completed');

  assertEquals(result.target, 'frontmatter');
  const text = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assertEquals(/^status: completed$/m.test(text), true);
  assertEquals(text.includes('**Status:** In progress'), true, 'the prose line is left alone when frontmatter owns status');
});

test('a plan carrying no status at all says so instead of inventing one', (sandbox) => {
  const dir = makePlan(sandbox, { planMd: '# Plan\n\n| Phase | Name | Status |\n|---|---|---|\n| 01 | Work | Not started |\n' });
  assertThrows(() => doc.setPlanStatus(dir, 'completed'), 'carries no status');
});

console.log('\n=== checklists ===\n');

test('a checklist item can be ticked by position', (sandbox) => {
  const dir = makePlan(sandbox);
  const result = doc.setPhaseChecklistItem(dir, '2', '1', true);

  assertEquals(result.changed, true);
  assertEquals(result.item.text, 'Ships the thing');
  assertEquals(result.progress.done, 2);
  assertEquals(result.progress.total, 3);
});

test('a checklist item can be ticked by text', (sandbox) => {
  const dir = makePlan(sandbox);
  const result = doc.setPhaseChecklistItem(dir, '2', 'documents', true);
  assertEquals(result.item.text, 'Documents the thing');
});

test('ambiguous text lists the matches instead of picking one', (sandbox) => {
  const dir = makePlan(sandbox);
  assertThrows(() => doc.setPhaseChecklistItem(dir, '2', 'the thing', true), 'matches 3 items');
});

test('text matching nothing is an error, not a silent no-op', (sandbox) => {
  const dir = makePlan(sandbox);
  assertThrows(() => doc.setPhaseChecklistItem(dir, '2', 'refactor', true), 'no checklist item matches');
});

test('ticking an already ticked item is a no-op that still reports progress', (sandbox) => {
  const dir = makePlan(sandbox);
  const before = fs.readFileSync(path.join(dir, 'phase-02-delivery.md'), 'utf8');

  const result = doc.setPhaseChecklistItem(dir, '2', 'Names', true);
  assertEquals(result.changed, false);
  assertEquals(result.progress.done, 1);
  assertEquals(fs.readFileSync(path.join(dir, 'phase-02-delivery.md'), 'utf8'), before);
});

test('unchecking is the inverse of checking', (sandbox) => {
  const dir = makePlan(sandbox);
  const before = fs.readFileSync(path.join(dir, 'phase-02-delivery.md'), 'utf8');

  doc.setPhaseChecklistItem(dir, '2', 'Ships', true);
  doc.setPhaseChecklistItem(dir, '2', 'Ships', false);

  assertEquals(fs.readFileSync(path.join(dir, 'phase-02-delivery.md'), 'utf8'), before);
});

test('a checkbox out of range names how many there are', (sandbox) => {
  const dir = makePlan(sandbox);
  assertThrows(() => doc.setPhaseChecklistItem(dir, '2', '9', true), '3 present');
});

test('a phase with no checkboxes says so', (sandbox) => {
  const dir = makePlan(sandbox);
  assertThrows(() => doc.setPhaseChecklistItem(dir, '1', '1', true), 'no checklist items');
});

test('checkbox scanning ignores prose that merely looks like a list', () => {
  const items = listChecklistItems('- [ ] real\ntext [ ] not a box\n1. [x] numbered\n  - [X] indented\n');
  assertEquals(items.length, 3);
  assertEquals(items[1].checked, true);
  assertEquals(items[2].checked, true);
});

console.log('\n=== crash safety ===\n');

test('a failed write leaves the original plan intact', (sandbox) => {
  const dir = makePlan(sandbox);
  const planPath = path.join(dir, 'plan.md');
  const before = fs.readFileSync(planPath, 'utf8');

  // Read-only directory: the temp file cannot be created, so the rename never runs.
  fs.chmodSync(dir, 0o500);
  try {
    assertThrows(() => doc.setPhaseStatus(dir, '2', 'completed'), null, 'a blocked write should throw');
    assertEquals(fs.readFileSync(planPath, 'utf8'), before, 'plan.md must be unchanged');
  } finally {
    fs.chmodSync(dir, 0o700);
  }
});

test('no temp files are left behind after a successful write', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'completed');

  const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.tmp'));
  assertEquals(leftovers.length, 0, `leftovers: ${JSON.stringify(leftovers)}`);
});

console.log('\n=== summary ===\n');

test('the summary counts phases and checklist items across the plan', (sandbox) => {
  const dir = makePlan(sandbox);
  const view = doc.summarize(dir);

  assertEquals(view.totals.phases, 3);
  assertEquals(view.totals.completed, 1);
  assertEquals(view.totals.pending, 2);
  assertEquals(view.totals.checklistTotal, 3);
  assertEquals(view.totals.checklistDone, 1);
});

test('a phase file found by name is used when the table carries no link', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: '# Plan\n\n**Status:** In progress\n\n| Phase | Name | Status |\n|---|---|---|\n| 02 | Delivery | Not started |\n'
  });

  const view = doc.summarize(dir);
  assertEquals(path.basename(view.phases[0].file), 'phase-02-delivery.md');
  assertEquals(view.phases[0].checklist.total, 3);
});

console.log('\n=== unusual documents ===\n');

test('a CRLF plan stays CRLF and its status still updates', (sandbox) => {
  const dir = makePlan(sandbox, { planMd: PLAN_MD.replace(/\n/g, '\r\n') });
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.writeFileSync(phaseFile, PHASE_02.replace(/\n/g, '\r\n'));

  const result = doc.setPhaseStatus(dir, '2', 'in-progress');
  assertEquals(result.tableUpdated, true, 'plan.md should have been rewritten');
  assertEquals(result.frontmatterUpdated, true, 'the phase file should have been rewritten');

  const planText = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assertEquals(/\| 02 \| \[Delivery\]\(phase-02-delivery\.md\) \| 01 \| In progress \|/.test(planText), true, 'status cell');
  assertEquals(planText.includes('\r\n'), true, 'plan.md kept CRLF');
  assertEquals(/[^\r]\n/.test(planText), false, 'plan.md gained no bare LF');

  const phaseText = fs.readFileSync(phaseFile, 'utf8');
  assertEquals(/^status: in-progress$/m.test(phaseText.replace(/\r/g, '')), true, 'frontmatter status');
  assertEquals(/[^\r]\n/.test(phaseText), false, 'the phase file gained no bare LF');
});

test('a CRLF phase file can still have a checkbox ticked', (sandbox) => {
  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.writeFileSync(phaseFile, PHASE_02.replace(/\n/g, '\r\n'));

  const result = doc.setPhaseChecklistItem(dir, '2', 'Ships', true);
  assertEquals(result.changed, true);
  assertEquals(result.item.text, 'Ships the thing');

  const text = fs.readFileSync(phaseFile, 'utf8');
  assertEquals(text.includes('- [x] Ships the thing'), true, 'ticked');
  assertEquals(/[^\r]\n/.test(text), false, 'kept CRLF');
});

test('checkboxes inside a fenced block are neither counted nor toggled', (sandbox) => {
  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.writeFileSync(phaseFile, [
    '---', 'phase: 2', 'status: pending', '---', '',
    '## Success Criteria',
    '- [ ] Real item',
    '',
    'Write it like this:',
    '',
    '```markdown',
    '- [ ] Example item',
    '- [x] Another example',
    '```',
    '',
    '- [ ] Second real item',
    ''
  ].join('\n'));

  const items = listChecklistItems(fs.readFileSync(phaseFile, 'utf8'));
  assertEquals(items.length, 2, `items: ${JSON.stringify(items.map((i) => i.text))}`);

  const result = doc.setPhaseChecklistItem(dir, '2', '2', true);
  assertEquals(result.item.text, 'Second real item');
  assertEquals(fs.readFileSync(phaseFile, 'utf8').includes('- [ ] Example item'), true, 'the sample is untouched');
});

test('a nested status key is not mistaken for the phase status', (sandbox) => {
  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.writeFileSync(phaseFile, [
    '---', 'phase: 2', 'meta:', '  status: draft', 'status: pending', '---', '', '# Phase 02', ''
  ].join('\n'));

  doc.setPhaseStatus(dir, '2', 'completed');

  const text = fs.readFileSync(phaseFile, 'utf8');
  assertEquals(/^ {2}status: draft$/m.test(text), true, 'the nested key is untouched');
  assertEquals(/^status: completed$/m.test(text), true, 'the top-level key moved');
});

test('a phase link pointing outside the plan directory is ignored', (sandbox) => {
  const outside = path.join(sandbox, 'outside.md');
  fs.writeFileSync(outside, '---\nstatus: pending\n---\n\n# Not a phase\n');

  const dir = makePlan(sandbox, {
    planMd: '# Plan\n\n| Phase | Name | Status |\n|---|---|---|\n| 09 | [Escape](../../outside.md) | Not started |\n'
  });

  const result = doc.setPhaseStatus(dir, '9', 'completed');
  assertEquals(result.phaseFile, null, 'no phase file should be resolved');
  assertEquals(fs.readFileSync(outside, 'utf8').includes('status: pending'), true, 'the outside file is untouched');
});

test('an atomic write keeps the file mode and follows a symlink', (sandbox) => {
  const dir = makePlan(sandbox);
  const real = path.join(sandbox, 'real-plan.md');
  fs.renameSync(path.join(dir, 'plan.md'), real);
  fs.chmodSync(real, 0o640);
  fs.symlinkSync(real, path.join(dir, 'plan.md'));

  doc.setPhaseStatus(dir, '2', 'completed');

  assertEquals(fs.lstatSync(path.join(dir, 'plan.md')).isSymbolicLink(), true, 'still a symlink');
  assertEquals((fs.statSync(real).mode & 0o777).toString(8), '640', 'mode preserved');
  assertEquals(fs.readFileSync(real, 'utf8').includes('| 01 | Complete |') || fs.readFileSync(real, 'utf8').includes('Complete |'), true, 'content written through the link');
});

test('text dropped from a status cell is reported', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: PLAN_MD.replace('| 02 | [Delivery](phase-02-delivery.md) | 01 | Not started |',
      '| 02 | [Delivery](phase-02-delivery.md) | 01 | In progress 🔄 blocked on #12 |')
  });

  const result = doc.setPhaseStatus(dir, '2', 'completed');
  assertEquals(result.discarded, 'In progress 🔄 blocked on #12');
});

test('a plain label replaced by another reports nothing dropped', (sandbox) => {
  const dir = makePlan(sandbox);
  const result = doc.setPhaseStatus(dir, '2', 'completed');
  assertEquals(result.discarded, null, `discarded: ${result.discarded}`);
});

test('a status write goes to the real table, not one in a code sample', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: [
      '# Plan',
      '',
      'Format:',
      '',
      '```markdown',
      '| Phase | Name | Status |',
      '|---|---|---|',
      '| 02 | [Delivery](phase-02-delivery.md) | Not started |',
      '```',
      '',
      '## Phases',
      '',
      '| Phase | Name | Status |',
      '|---|---|---|',
      '| 02 | [Delivery](phase-02-delivery.md) | Not started |',
      ''
    ].join('\n')
  });

  doc.setPhaseStatus(dir, '2', 'completed');

  const lines = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8').split('\n');
  const rows = lines.filter((line) => line.includes('[Delivery]'));
  assertEquals(rows.length, 2, 'both rows are still present');
  assertEquals(rows[0].includes('Not started'), true, `the sample is untouched: ${rows[0]}`);
  assertEquals(rows[1].includes('Complete'), true, `the real row moved: ${rows[1]}`);
});

test('a phase symlinked out of the plan directory is not written through', (sandbox) => {
  const outside = path.join(sandbox, 'outside.md');
  fs.writeFileSync(outside, '---\nstatus: pending\n---\n\n# Elsewhere\n');

  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  fs.rmSync(phaseFile);
  fs.symlinkSync(outside, phaseFile);

  const result = doc.setPhaseStatus(dir, '2', 'completed');
  assertEquals(result.phaseFile, null, 'the linked file must not be adopted');
  assertEquals(fs.readFileSync(outside, 'utf8').includes('status: pending'), true, 'the outside file is untouched');
});

test('two files that could both be a phase is an error, not a guess', (sandbox) => {
  const dir = makePlan(sandbox, {
    planMd: '# Plan\n\n| Phase | Name | Status |\n|---|---|---|\n| 02 | Delivery | Not started |\n'
  });
  fs.writeFileSync(path.join(dir, 'phase-2-delivery-alt.md'), '---\nstatus: pending\n---\n');

  assertThrows(() => doc.setPhaseStatus(dir, '2', 'completed'), 'more than one file');
});

test('a cancelled phase has its own bucket in the totals', (sandbox) => {
  const dir = makePlan(sandbox);
  doc.setPhaseStatus(dir, '2', 'cancelled');

  const totals = doc.summarize(dir).totals;
  assertEquals(totals.cancelled, 1);
  assertEquals(totals.completed + totals.inProgress + totals.pending + totals.cancelled, totals.phases,
    `buckets must sum to the phase count: ${JSON.stringify(totals)}`);
});

test('a mixed-EOL phase file keeps every line ending it had', (sandbox) => {
  const dir = makePlan(sandbox);
  const phaseFile = path.join(dir, 'phase-02-delivery.md');
  // CRLF frontmatter, LF body — what a file touched by two editors looks like.
  fs.writeFileSync(phaseFile, '---\r\nphase: 2\r\nstatus: pending\r\n---\r\n\n# Phase 02\n- [ ] Ship it\n');

  doc.setPhaseStatus(dir, '2', 'completed');

  const after = fs.readFileSync(phaseFile, 'utf8');
  assertEquals((after.match(/\r\n/g) || []).length, 4, `CRLF count: ${JSON.stringify(after)}`);
  assertEquals(after.includes('status: completed'), true, 'the status still moved');
  assertEquals(after.includes('- [ ] Ship it\n'), true, 'the LF body is untouched');
});

console.log('\n=== concurrency ===\n');

test('two concurrent updates both land, and nothing drifts', (sandbox) => {
  const dir = makePlan(sandbox);
  const accessor = path.resolve(__dirname, '..', '..', 'fis-plan.cjs');

  // Spawned rather than simulated: the lost update needs two processes, which is
  // exactly the parallel-subagent case.
  const runs = ['1', '2'].map((phase) => `node ${JSON.stringify(accessor)} update ${phase} --status completed --plan ${JSON.stringify(dir)}`);
  const { execSync } = require('child_process');
  execSync(`(${runs[0]}) & (${runs[1]}) & wait`, { shell: '/bin/bash', stdio: 'pipe' });

  const view = doc.summarize(dir);
  const statuses = view.phases.map((p) => `${p.phaseId}:${p.status}`).join(' ');
  assertEquals(statuses.includes('1:completed'), true, `phase 1 lost its write: ${statuses}`);
  assertEquals(statuses.includes('2:completed'), true, `phase 2 lost its write: ${statuses}`);
  assertEquals(view.drift.length, 0, `expected no drift, got ${JSON.stringify(view.drift)}`);
});

console.log('\n========================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
