/**
 * Tests for plan resolution and the fis-plan accessor
 * Run: node .claude/scripts/lib/__tests__/plan-resolver.test.cjs
 *
 * Resolution depends on the git worktree, the pointer store, session state, and
 * the branch name, so every case runs the real accessor in a child process
 * against a real repository on disk.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ACCESSOR = path.resolve(__dirname, '..', '..', 'fis-plan.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  // Real path, not the symlinked one: on macOS os.tmpdir() is /var → /private/var,
  // and the accessor reports the paths git does.
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fis-plan-resolver-test-')));
  const home = path.join(sandbox, 'home');
  fs.mkdirSync(home, { recursive: true });

  try {
    fn({ sandbox, fisHome: path.join(home, '.fis') });
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

function assertContains(haystack, needle, msg = '') {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${msg}\n  Expected to contain: ${needle}\n  Actual: ${haystack}`);
  }
}

/**
 * Run the accessor. Returns { code, stdout, stderr } rather than throwing, so a
 * test can assert on a failure path.
 */
function plan(ctx, cwd, args, extraEnv = {}) {
  const env = { ...process.env, FIS_HOME: ctx.fisHome, ...extraEnv };
  delete env.FIS_SESSION_ID;
  Object.assign(env, extraEnv);

  try {
    const stdout = execFileSync(process.execPath, [ACCESSOR, ...args], { cwd, encoding: 'utf8', env });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

/** Run the accessor with --json and parse the result. */
function planJson(ctx, cwd, args, extraEnv = {}) {
  const result = plan(ctx, cwd, [...args, '--json'], extraEnv);
  if (result.code !== 0) throw new Error(`accessor failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return JSON.parse(result.stdout);
}

const PLAN_MD = `# {name}

**Status:** In progress

| Phase | Name | Status |
|---|---|---|
| 01 | [Groundwork](phase-01-groundwork.md) | Not started |
`;

/** Create a git repo holding one or more plans. */
function makeRepo(root, { branch = 'main', plans = ['260101-0000-first-plan'] } = {}) {
  fs.mkdirSync(root, { recursive: true });
  execFileSync('git', ['init', '-q', '--initial-branch', branch], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });

  const dirs = plans.map((slug) => {
    const dir = path.join(root, 'plans', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan.md'), PLAN_MD.replace('{name}', slug));
    fs.writeFileSync(path.join(dir, 'phase-01-groundwork.md'), '---\nphase: 1\nstatus: pending\n---\n\n## Success Criteria\n- [ ] Ships\n');
    return dir;
  });

  fs.writeFileSync(path.join(root, 'README.md'), '# repo\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: root });

  return dirs;
}

/** Write the session state file the hooks read, as set-active-plan.cjs would. */
function writeSessionState(sessionId, state) {
  fs.writeFileSync(path.join(os.tmpdir(), `fis-session-${sessionId}.json`), JSON.stringify(state));
}

console.log('\n=== resolution order ===\n');

test('with nothing set, resolution misses and lists the candidates', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo, { plans: ['260101-0000-first-plan', '260202-0000-second-plan'] });

  const result = plan(ctx, repo, ['resolve']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'no active plan');
  assertContains(result.stderr, '260202-0000-second-plan');
});

test('an explicit --plan wins over everything', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first, second] = makeRepo(repo, { plans: ['260101-0000-first-plan', '260202-0000-second-plan'] });
  plan(ctx, repo, ['use', first]);

  const resolved = planJson(ctx, repo, ['resolve', '--plan', second]);
  assertEquals(resolved.planDir, second);
  assertEquals(resolved.resolvedBy, 'explicit');
});

test('the pointer resolves the plan once it is pinned', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);

  plan(ctx, repo, ['use', '260101-0000-first-plan']);
  const resolved = planJson(ctx, repo, ['resolve']);

  assertEquals(resolved.planDir, first);
  assertEquals(resolved.resolvedBy, 'pointer');
  assertEquals(resolved.directive, true);
});

test('session state outranks the pointer', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first, second] = makeRepo(repo, { plans: ['260101-0000-first-plan', '260202-0000-second-plan'] });
  plan(ctx, repo, ['use', first]);

  const sessionId = `test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeSessionState(sessionId, { activePlan: second, sessionOrigin: repo });
  try {
    const resolved = planJson(ctx, repo, ['resolve'], { FIS_SESSION_ID: sessionId });
    assertEquals(resolved.planDir, second);
    assertEquals(resolved.resolvedBy, 'session');
  } finally {
    fs.rmSync(path.join(os.tmpdir(), `fis-session-${sessionId}.json`), { force: true });
  }
});

test('a branch name matching a plan slug resolves as a suggestion, not as active', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  execFileSync('git', ['checkout', '-qb', 'feat/first-plan'], { cwd: repo });

  const resolved = planJson(ctx, repo, ['resolve']);
  assertEquals(resolved.planDir, first);
  assertEquals(resolved.resolvedBy, 'branch');
  assertEquals(resolved.directive, false);
});

test('a pointer at a plan that was deleted falls through instead of returning a dead path', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  plan(ctx, repo, ['use', first]);
  fs.rmSync(first, { recursive: true, force: true });

  const result = plan(ctx, repo, ['resolve']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'no active plan');
});

console.log('\n=== scope ===\n');

test('two branches of one worktree pin different plans', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first, second] = makeRepo(repo, { plans: ['260101-0000-first-plan', '260202-0000-second-plan'] });

  plan(ctx, repo, ['use', first]);
  execFileSync('git', ['checkout', '-qb', 'other'], { cwd: repo });
  plan(ctx, repo, ['use', second]);

  assertEquals(planJson(ctx, repo, ['resolve']).planDir, second);
  execFileSync('git', ['checkout', '-q', 'main'], { cwd: repo });
  assertEquals(planJson(ctx, repo, ['resolve']).planDir, first);
});

test('the accessor resolves the project plan from a nested subdirectory', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  const nested = path.join(repo, 'src', 'deep', 'nested');
  fs.mkdirSync(nested, { recursive: true });

  plan(ctx, nested, ['use', '260101-0000-first-plan']);
  const resolved = planJson(ctx, nested, ['resolve']);

  assertEquals(resolved.planDir, first, 'a subdirectory must resolve the same plan as the repo root');
  assertEquals(planJson(ctx, repo, ['resolve']).planDir, first, 'and the root must agree');
});

test('--cwd resolves a different project than the process directory', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  const elsewhere = path.join(ctx.sandbox, 'elsewhere');
  fs.mkdirSync(elsewhere, { recursive: true });

  plan(ctx, elsewhere, ['use', first, '--cwd', repo]);
  assertEquals(planJson(ctx, elsewhere, ['resolve', '--cwd', repo]).planDir, first);
});

test('a plan reference is accepted as a name, a relative path, or a plan.md path', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);

  for (const ref of ['260101-0000-first-plan', 'plans/260101-0000-first-plan', 'plans/260101-0000-first-plan/plan.md', first]) {
    plan(ctx, repo, ['unuse']);
    const used = planJson(ctx, repo, ['use', ref]);
    assertEquals(used.planDir, first, `reference "${ref}" should resolve to the plan directory`);
  }
});

test('pinning something that is not a plan is refused', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo);
  fs.mkdirSync(path.join(repo, 'plans', 'not-a-plan'), { recursive: true });

  const result = plan(ctx, repo, ['use', 'not-a-plan']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'no plan at');
});

console.log('\n=== commands ===\n');

test('list marks the resolved plan and reports phase progress', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo, { plans: ['260101-0000-first-plan', '260202-0000-second-plan'] });
  plan(ctx, repo, ['use', first]);

  const listed = planJson(ctx, repo, ['list']);
  const active = listed.plans.filter((p) => p.active);
  assertEquals(active.length, 1);
  assertEquals(active[0].planDir, first);
  assertEquals(listed.plans.length, 2);
  assertEquals(listed.plans[0].name, '260202-0000-second-plan', 'newest first');
});

test('show prints plan.md, and show <phase> prints the phase file', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo);
  plan(ctx, repo, ['use', '260101-0000-first-plan']);

  assertContains(plan(ctx, repo, ['show']).stdout, '260101-0000-first-plan');
  assertContains(plan(ctx, repo, ['show', '1']).stdout, '## Success Criteria');
});

test('update moves a phase in plan.md and in the phase file together', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  plan(ctx, repo, ['use', first]);

  const result = planJson(ctx, repo, ['update', '1', '--status', 'completed']);
  assertEquals(result.status, 'completed');
  assertEquals(result.tableUpdated, true);
  assertEquals(result.frontmatterUpdated, true);

  assertContains(fs.readFileSync(path.join(first, 'plan.md'), 'utf8'), '| Complete |');
  assertContains(fs.readFileSync(path.join(first, 'phase-01-groundwork.md'), 'utf8'), 'status: completed');
});

test('check ticks an item and status reflects it', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  plan(ctx, repo, ['use', first]);

  planJson(ctx, repo, ['check', '1', 'Ships']);
  const status = planJson(ctx, repo, ['status']);

  assertEquals(status.totals.checklistDone, 1);
  assertEquals(status.totals.checklistTotal, 1);
});

test('a mutation without a resolved plan refuses rather than guessing', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo);

  const result = plan(ctx, repo, ['update', '1', '--status', 'completed']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'no active plan');
});

test('update without --status says what it needs', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  const [first] = makeRepo(repo);
  plan(ctx, repo, ['use', first]);

  const result = plan(ctx, repo, ['update', '1']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, '--status');
});

test('an unknown command exits non-zero with usage', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo);

  const result = plan(ctx, repo, ['frobnicate']);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'unknown command');
  assertContains(result.stderr, 'Usage:');
});

test('the pointer store never lands inside the checkout', (ctx) => {
  const repo = path.join(ctx.sandbox, 'repo');
  makeRepo(repo);
  plan(ctx, repo, ['use', '260101-0000-first-plan']);

  const tracked = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
  assertEquals(tracked, '', `pinning must not change the working tree, saw:\n${tracked}`);
  assertEquals(fs.existsSync(path.join(ctx.fisHome, 'plan-pointers.json')), true, 'the store belongs under the user directory');
});

console.log('\n========================================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
