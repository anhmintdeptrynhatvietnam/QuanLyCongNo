/**
 * Tests for the fis-config payload script
 * Run: node .claude/scripts/fis-config.test.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, 'fis-config.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fis-config-script-test-'));
  const home = path.join(sandbox, 'home');
  const project = path.join(sandbox, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  try {
    fn({ sandbox, home, project });
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

function assertEquals(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack, needle, msg = '') {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg}\n  Expected output to contain: ${needle}\n  Actual: ${haystack}`);
  }
}

function assertOmits(haystack, needle, msg = '') {
  if (haystack.includes(needle)) {
    throw new Error(`${msg}\n  Expected output NOT to contain: ${needle}\n  Actual: ${haystack}`);
  }
}

/** Run the script, capturing stdout and the exit code. */
function run(args, { home, project }) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      cwd: project,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FIS_HOME: path.join(home, '.fis')
      }
    });
    return { stdout, code: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status };
  }
}

function writeYaml(dir, contents) {
  const configDir = path.join(dir, '.fis');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'config.yaml'), contents);
}

console.log('\n=== init ===\n');

test('init creates a commented stub', (ctx) => {
  const result = run(['init', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 0);

  const written = fs.readFileSync(path.join(ctx.project, '.fis', 'config.yaml'), 'utf8');
  assertContains(written, '# coding_level: 3', 'stub documents coding_level');
  assertContains(written, 'snake_case', 'stub states the key convention');

  // Every non-blank line must be a comment, or `init` would freeze defaults.
  for (const line of written.split('\n')) {
    if (line.trim() !== '' && !line.trim().startsWith('#')) {
      throw new Error(`stub has an active setting: ${line}`);
    }
  }
});

test('the generated stub parses and validates', (ctx) => {
  run(['init', '--cwd', ctx.project], ctx);
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 0, 'a fresh stub must be valid');
  assertContains(result.stdout, '✓ project:');
});

test('init does not overwrite an existing config', (ctx) => {
  writeYaml(ctx.project, 'coding_level: 2');
  const result = run(['init', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 0);
  assertContains(result.stdout, 'already exists');
  assertEquals(
    fs.readFileSync(path.join(ctx.project, '.fis', 'config.yaml'), 'utf8'),
    'coding_level: 2'
  );
});

test('init --user writes to the user config dir', (ctx) => {
  const result = run(['init', '--user', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 0);
  const written = fs.readFileSync(path.join(ctx.home, '.fis', 'config.yaml'), 'utf8');
  assertContains(written, 'user preferences');
  assertEquals(fs.existsSync(path.join(ctx.project, '.fis', 'config.yaml')), false);
});

console.log('\n=== validate ===\n');

test('no config is not an error', (ctx) => {
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 0);
  assertContains(result.stdout, 'No config file found');
});

test('a valid config exits 0', (ctx) => {
  writeYaml(ctx.project, 'coding_level: 3\npaths:\n  plans: roadmaps');
  assertEquals(run(['validate', '--cwd', ctx.project], ctx).code, 0);
});

test('an unknown key exits 1 and names the key', (ctx) => {
  writeYaml(ctx.project, 'coding_levl: 3');
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stdout, 'unknown key: coding_levl');
});

test('a nested unknown key is reported with its path', (ctx) => {
  writeYaml(ctx.project, 'plan:\n  reports_dirr: x');
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stdout, 'unknown key: plan.reports_dirr');
});

test('a parse error is reported against the file, with a line number', (ctx) => {
  writeYaml(ctx.project, 'plan:\n\treports_dir: reports');
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stdout, 'Tab indentation');
  assertContains(result.stdout, 'line 2');
});

test('credentials in a project file are reported as ignored', (ctx) => {
  writeYaml(ctx.project, 'trust:\n  passphrase: nope');
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stdout, 'ignored: trust.passphrase');
});

test('a credential section in a project file is not called an unknown key', (ctx) => {
  // `keys` is a real section — valid in a user config — so reporting it as a
  // typo would send the user looking for a misspelling that is not there.
  writeYaml(ctx.project, 'keys:\n  anthropic: sk-nope');
  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertOmits(result.stdout, 'unknown key: keys');
  assertContains(result.stdout, 'ignored: keys');
});

test('credentials in the user config are valid', (ctx) => {
  writeYaml(ctx.home, 'trust:\n  passphrase: fine\nkeys:\n  anthropic: sk-fine');
  assertEquals(run(['validate', '--cwd', ctx.project], ctx).code, 0);
});

console.log('\n=== unsupported version ===\n');

test('an unsupported version fails validation instead of reporting clean', (ctx) => {
  // The regression: the resolver drops a file it cannot read, so `validate`
  // found nothing wrong and printed ✓ — for a file applying none of its settings.
  writeYaml(ctx.project, 'version: 2\ncoding_level: 5\n');

  const result = run(['validate', '--cwd', ctx.project], ctx);
  assertEquals(result.code > 0, true, 'must not report clean');
  assertContains(result.stdout, 'version 2 is not supported');
  assertContains(result.stdout, 'ignored entirely');
});

test('show marks an ignored file rather than calling it absent', (ctx) => {
  writeYaml(ctx.project, 'version: 2\ncoding_level: 5\n');

  const { stdout } = run(['show', '--cwd', ctx.project], ctx);
  assertContains(stdout, 'config.yaml (ignored', 'the file is named');
  assertOmits(stdout, 'project: (none)');
});

test('show marks an unparseable file as ignored', (ctx) => {
  writeYaml(ctx.project, 'coding_level: [\n');

  const { stdout } = run(['show', '--cwd', ctx.project], ctx);
  assertContains(stdout, 'config.yaml (ignored');
});

test('the supported version still validates', (ctx) => {
  writeYaml(ctx.project, 'version: 1\ncoding_level: 3\n');
  assertEquals(run(['validate', '--cwd', ctx.project], ctx).code, 0);
});

console.log('\n=== secret handling ===\n');

test('resolve prints no raw secret, from either layer', (ctx) => {
  writeYaml(ctx.home, 'trust:\n  passphrase: user-secret\nkeys:\n  anthropic: sk-user-key');
  writeYaml(ctx.project, 'coding_level: 2');

  const { stdout } = run(['resolve', '--cwd', ctx.project], ctx);
  // The regression guarded here: the merged tree was masked while the per-scope
  // `layers` copy of the same values was printed in full.
  assertOmits(stdout, 'user-secret', 'merged tree and layers must both be masked');
  assertOmits(stdout, 'sk-user-key');
  assertContains(stdout, '(redacted)');

  const payload = JSON.parse(stdout);
  assertEquals(payload.prefs.trust.passphrase, '(redacted)');
  assertEquals(payload.layers.user.trust.passphrase, '(redacted)');
  assertEquals(payload.redacted.includes('trust.passphrase'), true);
  // A credential section is replaced as a whole, so the report names the
  // section rather than each service under it.
  assertEquals(payload.prefs.keys, '(redacted)');
  assertEquals(payload.redacted.includes('keys'), true);
});

test('a credential section written as a scalar is still redacted', (ctx) => {
  // The regression: masking keyed off the leaf name, so `keys` holding a map was
  // walked into and `keys` holding a string was printed as an ordinary value.
  writeYaml(ctx.home, 'keys: sk-flat-secret\napi: tok-flat-secret');

  const { stdout } = run(['resolve', '--cwd', ctx.project], ctx);
  assertOmits(stdout, 'sk-flat-secret');
  assertOmits(stdout, 'tok-flat-secret');
});

test('a passphrase written as a map is not walked into', (ctx) => {
  writeYaml(ctx.home, 'trust:\n  passphrase:\n    value: nested-secret');

  const { stdout } = run(['resolve', '--cwd', ctx.project], ctx);
  assertOmits(stdout, 'nested-secret');
  assertEquals(JSON.parse(stdout).prefs.trust.passphrase, '(redacted)');
});

test('show masks a credential section written as a scalar', (ctx) => {
  writeYaml(ctx.home, 'keys: sk-flat-secret');
  const { stdout } = run(['show', '--cwd', ctx.project], ctx);
  assertOmits(stdout, 'sk-flat-secret');
  assertContains(stdout, 'keys = (set)');
});

test('a parse error names the line without quoting it back', (ctx) => {
  // The regression: the message echoed the offending source line, and doctor
  // forwards these into CI logs — so a malformed credential line leaked.
  writeYaml(ctx.home, 'keys:\n  openai sk-leaked-secret\n');

  const { stdout } = run(['validate', '--cwd', ctx.project], ctx);
  assertOmits(stdout, 'sk-leaked-secret', 'the source line must not be echoed');
  assertContains(stdout, 'line 2', 'the line number locates it instead');
});

test('show masks secrets but confirms they are set', (ctx) => {
  writeYaml(ctx.home, 'trust:\n  passphrase: user-secret');
  const { stdout } = run(['show', '--cwd', ctx.project], ctx);
  assertOmits(stdout, 'user-secret');
  assertContains(stdout, 'trust.passphrase = (set)');
});

test('an unset secret is not reported as set', (ctx) => {
  writeYaml(ctx.home, 'trust:\n  passphrase: null');
  const { stdout } = run(['show', '--cwd', ctx.project], ctx);
  assertContains(stdout, 'trust.passphrase = null');
});

test('non-secret values are still printed in full', (ctx) => {
  writeYaml(ctx.project, 'paths:\n  plans: roadmaps');
  assertContains(run(['show', '--cwd', ctx.project], ctx).stdout, 'paths.plans = "roadmaps"');
});

console.log('\n=== resolve contract ===\n');

test('resolve emits a parseable payload when no config exists', (ctx) => {
  const { stdout, code } = run(['resolve', '--cwd', ctx.project], ctx);
  assertEquals(code, 0);
  const payload = JSON.parse(stdout);
  assertEquals(payload.schema_version, 1);
  assertEquals(payload.sources.user, null);
  assertEquals(payload.sources.project, null);
});

test('resolve reports which file each layer came from', (ctx) => {
  writeYaml(ctx.home, 'coding_level: 4');
  writeYaml(ctx.project, 'coding_level: 2');

  const payload = JSON.parse(run(['resolve', '--cwd', ctx.project], ctx).stdout);
  assertEquals(payload.prefs.coding_level, 2, 'project wins');
  assertEquals(payload.layers.user.coding_level, 4);
  assertEquals(payload.layers.project.coding_level, 2);
  assertContains(payload.sources.project, path.join('project', '.fis', 'config.yaml'));
});

console.log('\n=== path and errors ===\n');

test('path names both files even when absent', (ctx) => {
  const { stdout } = run(['path', '--cwd', ctx.project], ctx);
  assertContains(stdout, '(not created)');
  assertContains(stdout, path.join('.fis', 'config.yaml'));
});

test('unknown command exits 1', (ctx) => {
  const result = run(['nonsense', '--cwd', ctx.project], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'unknown command');
});

test('unknown option exits 1', (ctx) => {
  const result = run(['show', '--nonsense'], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stderr, 'unknown option');
});

test('--cwd without a value exits 1', (ctx) => {
  const result = run(['show', '--cwd'], ctx);
  assertEquals(result.code, 1);
  assertContains(result.stderr, '--cwd needs a directory');
});

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
