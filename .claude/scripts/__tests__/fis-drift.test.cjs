#!/usr/bin/env node
/**
 * fis-drift decides whether an installation still matches what shipped, and DAI
 * renders that decision. These tests pin the distinctions DAI depends on: a
 * user-edited file is a warning it must not overwrite, a missing one is an error
 * it should reinstall, and an unreadable baseline is neither — it is exit 2.
 *
 * Run: node --test claude/scripts/__tests__/fis-drift.test.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { check, DriftError } = require('../fis-drift.cjs');
const {
  SCHEMA_VERSION,
  buildAllBaselines,
  serialize,
} = require('../lib/kit-baseline-builder.cjs');

const REPO_CLAUDE_DIR = path.resolve(__dirname, '..', '..');
const CHECKER = path.join(REPO_CLAUDE_DIR, 'scripts', 'fis-drift.cjs');

let fixture;

/**
 * A miniature installation: two wired hooks and two skill files, with baselines
 * that describe exactly that. Every test mutates a copy and asks what changed.
 */
function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fis-drift-test-'));

  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'fis-craft'), { recursive: true });

  write(dir, 'hooks/session-init.cjs', '// session-init\n');
  write(dir, 'hooks/simplify-gate.cjs', '// simplify-gate\n');
  write(dir, 'skills/fis-craft/SKILL.md', '# craft\n');
  write(dir, 'skills/fis-craft/references/steps.md', '# steps\n');

  writeSettings(dir, {
    SessionStart: [block('*', ['session-init'])],
    UserPromptSubmit: [block('*', ['simplify-gate', 'session-init'])],
  });

  write(dir, 'native-hook-expectations.json', serialize({
    kitBaselineSchema: SCHEMA_VERSION,
    generatedFrom: 'hooks/hook-wiring.json',
    wiringSha256: 'a'.repeat(64),
    events: {
      SessionStart: [{ matcher: '*', hooks: ['session-init'] }],
      UserPromptSubmit: [{ matcher: '*', hooks: ['simplify-gate', 'session-init'] }],
    },
    hookFiles: {
      'session-init': 'hooks/session-init.cjs',
      'simplify-gate': 'hooks/simplify-gate.cjs',
    },
  }));

  write(dir, 'native-skill-hashes.json', serialize({
    kitBaselineSchema: SCHEMA_VERSION,
    algorithm: 'sha256',
    files: {
      'skills/fis-craft/SKILL.md': sha256(path.join(dir, 'skills/fis-craft/SKILL.md')),
      'skills/fis-craft/references/steps.md': sha256(path.join(dir, 'skills/fis-craft/references/steps.md')),
    },
  }));

  write(dir, 'kit-baseline.json', serialize({
    kitBaselineSchema: SCHEMA_VERSION,
    kitVersion: '0.0.0-test',
    generatedAt: '2026-01-01',
    baselines: {
      hookExpectations: 'native-hook-expectations.json',
      skillHashes: 'native-skill-hashes.json',
    },
    checker: 'scripts/fis-drift.cjs',
  }));

  return dir;
}

function block(matcher, hooks) {
  return {
    matcher,
    hooks: hooks.map(hook => ({ type: 'command', command: `node ".claude/hooks/${hook}.cjs"` })),
  };
}

function writeSettings(dir, hooks) {
  write(dir, 'settings.json', `${JSON.stringify({ hooks }, null, 2)}\n`);
}

function write(dir, rel, contents) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function sha256(absPath) {
  return require('node:crypto').createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function readSettings(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
}

function findingsOf(report, kind) {
  return report.findings.filter(finding => finding.kind === kind);
}

beforeEach(() => {
  fixture = createFixture();
});

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true });
});

describe('fis-drift check', () => {
  it('reports no drift when the installation matches the baselines', () => {
    const report = check(fixture);
    assert.equal(report.status, 'clean');
    assert.deepEqual(report.findings, []);
  });

  it('reports a removed hook as an error', () => {
    const settings = readSettings(fixture);
    settings.hooks.SessionStart = [];
    writeSettings(fixture, settings.hooks);

    const report = check(fixture);
    assert.equal(report.status, 'drift');
    const [finding] = findingsOf(report, 'hook-missing');
    assert.ok(finding, 'expected a hook-missing finding');
    assert.equal(finding.severity, 'error');
    assert.match(finding.detail, /SessionStart.*session-init/);
  });

  it('reports a changed matcher without claiming the hook is gone', () => {
    const settings = readSettings(fixture);
    settings.hooks.SessionStart[0].matcher = 'Write';
    writeSettings(fixture, settings.hooks);

    const report = check(fixture);
    assert.equal(report.status, 'drift');
    assert.equal(findingsOf(report, 'hook-matcher-changed').length, 1);
    assert.equal(findingsOf(report, 'hook-missing').length, 0);
  });

  it('reports a reordered block as a warning, not a missing hook', () => {
    const settings = readSettings(fixture);
    settings.hooks.UserPromptSubmit[0].hooks.reverse();
    writeSettings(fixture, settings.hooks);

    const report = check(fixture);
    assert.equal(report.status, 'drift');
    const [finding] = findingsOf(report, 'hook-order-changed');
    assert.ok(finding, 'expected a hook-order-changed finding');
    assert.equal(finding.severity, 'warning');
    assert.equal(findingsOf(report, 'hook-missing').length, 0);
    assert.equal(findingsOf(report, 'hook-unexpected').length, 0);
  });

  it('reports a hook the kit does not wire as a warning, not an error', () => {
    const settings = readSettings(fixture);
    settings.hooks.SessionStart.push(block('*', ['local-extra']));
    writeSettings(fixture, settings.hooks);

    const [finding] = findingsOf(check(fixture), 'hook-unexpected');
    assert.ok(finding, 'expected a hook-unexpected finding');
    assert.equal(finding.severity, 'warning');
  });

  it('reports wiring that points at an uninstalled hook script', () => {
    fs.rmSync(path.join(fixture, 'hooks', 'simplify-gate.cjs'));

    const [finding] = findingsOf(check(fixture), 'hook-script-missing');
    assert.ok(finding, 'expected a hook-script-missing finding');
    assert.equal(finding.severity, 'error');
    assert.equal(finding.path, 'hooks/simplify-gate.cjs');
  });

  it('reports a user-edited file as modified, never as missing', () => {
    write(fixture, 'skills/fis-craft/SKILL.md', '# craft, with my own notes\n');

    const report = check(fixture);
    const [finding] = findingsOf(report, 'file-modified');
    assert.ok(finding, 'expected a file-modified finding');
    assert.equal(finding.severity, 'warning', 'a user edit must never be an error');
    assert.equal(finding.path, 'skills/fis-craft/SKILL.md');
    assert.equal(findingsOf(report, 'file-missing').length, 0);
  });

  it('distinguishes a deleted shipped file from an edited one', () => {
    fs.rmSync(path.join(fixture, 'skills/fis-craft/references/steps.md'));

    const report = check(fixture);
    const [finding] = findingsOf(report, 'file-missing');
    assert.ok(finding, 'expected a file-missing finding');
    assert.equal(finding.severity, 'error');
    assert.equal(findingsOf(report, 'file-modified').length, 0);
  });

  it('treats a local addition as informational and stays clean', () => {
    write(fixture, 'skills/fis-local/SKILL.md', '# mine\n');

    const report = check(fixture);
    const [finding] = findingsOf(report, 'file-unexpected');
    assert.ok(finding, 'expected a file-unexpected finding');
    assert.equal(finding.severity, 'info');
    assert.equal(report.status, 'clean', 'info findings alone are not drift');
  });

  it('ignores editor and interpreter droppings so the verdict is machine-independent', () => {
    write(fixture, 'skills/.DS_Store', 'finder\n');
    write(fixture, 'skills/fis-craft/__pycache__/mod.cpython-314.pyc', 'bytecode\n');

    assert.deepEqual(check(fixture).findings, []);
  });

  it('refuses to answer when a baseline is missing', () => {
    fs.rmSync(path.join(fixture, 'native-skill-hashes.json'));
    assert.throws(() => check(fixture), DriftError);
  });

  it('refuses to answer when a baseline declares an unknown schema version', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(fixture, 'kit-baseline.json'), 'utf8'));
    baseline.kitBaselineSchema = SCHEMA_VERSION + 1;
    write(fixture, 'kit-baseline.json', serialize(baseline));

    assert.throws(() => check(fixture), /schema/);
  });
});

describe('fis-drift baselines', () => {
  it('stores only project-relative paths so a clone still resolves them', () => {
    for (const [, content] of buildAllBaselines('0.0.0-test')) {
      const paths = [
        ...Object.keys(content.files || {}),
        ...Object.values(content.hookFiles || {}),
        ...Object.values(content.baselines || {}),
        content.generatedFrom,
        content.checker,
      ].filter(value => typeof value === 'string');

      for (const value of paths) {
        assert.ok(!path.isAbsolute(value), `absolute path in baseline: ${value}`);
        assert.ok(!value.includes('..'), `parent traversal in baseline: ${value}`);
      }
      assert.ok(paths.length > 0, 'baseline carried no paths to check');
    }
  });

  it('exits 0 on the shipped tree and 1 once a hook is unwired', () => {
    const clean = spawnSync(process.execPath, [CHECKER, 'check', '--json'], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.equal(JSON.parse(clean.stdout).status, 'clean');

    const settingsPath = path.join(REPO_CLAUDE_DIR, 'settings.json');
    const original = fs.readFileSync(settingsPath, 'utf8');
    try {
      const settings = JSON.parse(original);
      delete settings.hooks.SessionStart;
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

      const drifted = spawnSync(process.execPath, [CHECKER, 'check', '--json'], { encoding: 'utf8' });
      assert.equal(drifted.status, 1, 'drift must exit 1');
      assert.equal(JSON.parse(drifted.stdout).status, 'drift');
    } finally {
      fs.writeFileSync(settingsPath, original);
    }
  });

  it('exits 2 when the comparison cannot be run at all', () => {
    const baselinePath = path.join(REPO_CLAUDE_DIR, 'kit-baseline.json');
    const original = fs.readFileSync(baselinePath, 'utf8');
    try {
      fs.writeFileSync(baselinePath, 'not json\n');
      const result = spawnSync(process.execPath, [CHECKER, 'check', '--json'], { encoding: 'utf8' });
      assert.equal(result.status, 2, 'an unreadable baseline is exit 2, not clean');
      assert.equal(JSON.parse(result.stdout).status, 'error');
    } finally {
      fs.writeFileSync(baselinePath, original);
    }
  });
});
