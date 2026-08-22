#!/usr/bin/env node
/**
 * Regression tests for scan_skills.py catalog generation.
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(__dirname, 'scan_skills.py');
const GUIDE_YAML_PATH = path.join(REPO_ROOT, 'guide', 'SKILLS.yaml');
const GUIDE_MD_PATH = path.join(REPO_ROOT, 'guide', 'SKILLS.md');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertMatch(content, pattern, message) {
  assert(pattern.test(content), message);
}

console.log('\n📚 scan_skills.py Regression Tests');

execSync(`python3 "${SCRIPT_PATH}" --check`, {
  cwd: REPO_ROOT,
  stdio: 'pipe',
  encoding: 'utf-8',
});

const manifest = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'claude', 'skill-tiers.json'), 'utf-8'),
);
// claude/skill-tiers.json owns the catalog sizes; assert the generated views
// against it rather than restating the numbers here.
const EXPECTED_STANDARD = manifest.tiers.tier1.length + manifest.tiers.tier2.length;
const EXPECTED_OPTIONAL = manifest.optional.length;
const EXPECTED_TOTAL = Object.keys(manifest.skills).length;

const guideYaml = fs.readFileSync(GUIDE_YAML_PATH, 'utf-8');
const guideMarkdown = fs.readFileSync(GUIDE_MD_PATH, 'utf-8');

test('mcp-builder stays in dev-tools', () => {
  assertMatch(
    guideYaml,
    /- id: "fis-mcp-builder"[\s\S]*?category: "dev-tools"/,
    'fis-mcp-builder should retain directory identity and dev-tools category',
  );
});

test('document skills preserve identity, display, and category', () => {
  assertMatch(
    guideYaml,
    /- id: "docx"\s+display: "fis:docx"[\s\S]*?category: "multimedia"/,
    'docx should keep directory identity, separate display label, and multimedia category',
  );
});

test('block frontmatter descriptions are flattened', () => {
  assert(!guideYaml.includes('description: ">-"'), 'guide catalog should not emit raw block markers');
  assertMatch(
    guideYaml,
    /id: "fis-context-engineering"[\s\S]*?description: "Check context usage limits,/,
    'fis-context-engineering description should be flattened',
  );
  assertMatch(
    guideYaml,
    /id: "fis-excalidraw"[\s\S]*?description: "Create Excalidraw diagrams/,
    'fis-excalidraw description should be flattened',
  );
});

test('catalog metadata reports the manifest standard, optional, and total counts', () => {
  assertMatch(
    guideYaml,
    new RegExp(`standard_count: ${EXPECTED_STANDARD}\\b`),
    `standard_count must be ${EXPECTED_STANDARD}`,
  );
  assertMatch(
    guideYaml,
    new RegExp(`optional_count: ${EXPECTED_OPTIONAL}\\b`),
    `optional_count must be ${EXPECTED_OPTIONAL}`,
  );
  assertMatch(
    guideYaml,
    new RegExp(`total_count: ${EXPECTED_TOTAL}\\b`),
    `total_count must be ${EXPECTED_TOTAL}`,
  );
  assert(
    !new RegExp(`\\*\\*Total(?: Skills)?\\*\\*:\\s*${EXPECTED_STANDARD}\\b`).test(guideMarkdown),
    'markdown catalog must not claim that the standard count is the total inventory',
  );
});

test('catalog emits view sizes matching the manifest', () => {
  const standard = guideYaml.match(/standard_active:\n([\s\S]*?)\n# ── Inactive Optional Packs/)?.[1] || '';
  const optional = guideYaml.match(/optional_packs:\n([\s\S]*?)\n# ── Full Canonical Inventory/)?.[1] || '';
  const full = guideYaml.match(/full_inventory:\n([\s\S]*)$/)?.[1] || '';

  assert(
    (standard.match(/^\s+- id:/gm) || []).length === EXPECTED_STANDARD,
    `standard_active must contain ${EXPECTED_STANDARD} skills`,
  );
  assert(
    (optional.match(/^\s+- id:/gm) || []).length === EXPECTED_OPTIONAL,
    `optional_packs must contain ${EXPECTED_OPTIONAL} skills`,
  );
  assert(
    (full.match(/^\s+- id:/gm) || []).length === EXPECTED_TOTAL,
    `full_inventory must contain ${EXPECTED_TOTAL} skills`,
  );
});

test('fis-design keeps directory identity and frontmatter display separately', () => {
  assertMatch(
    guideYaml,
    /- id: "fis-design"\s+display: "fis:design-md"/,
    'guide catalog must keep fis-design identity separate from display',
  );
  assertMatch(
    guideYaml,
    /- id: "fis-design"\s+display: "fis:design-md"/,
    'fis-design identity must remain separate from fis:design-md display',
  );
  assert(guideMarkdown.includes('`/fis:design`'), 'markdown catalog must use /fis:design');
  assert(guideMarkdown.includes('`fis:design-md`'), 'markdown catalog must show fis:design-md');
});

test('strict parser fails closed on invalid required metadata and unsupported syntax', () => {
  const checkScript = `
import importlib.util
import pathlib
import sys

script_path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("scan_skills_strict_test", script_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
cases = [
    "---\\nname: valid\\ndescription: [not, a, scalar]\\n---\\n",
    "---\\nname: valid\\ndescription: *yaml-alias\\n---\\n",
    "---\\nname: one\\nname: two\\ndescription: valid description\\n---\\n",
]
for content in cases:
    try:
        parsed = module.extract_frontmatter(content)
        module.validate_catalog_frontmatter(parsed, pathlib.Path("fixture/SKILL.md"))
    except module.FrontmatterParseError:
        continue
    raise SystemExit("invalid frontmatter was accepted")
`;
  execFileSync('python3', ['-c', checkScript, SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
});

test('catalog bytes ignore whether yaml import is available or blocked', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-skills-yaml-env-'));
  const available = path.join(fixture, 'available');
  const blocked = path.join(fixture, 'blocked');
  const importedMarker = path.join(available, 'yaml-imported');
  fs.mkdirSync(available);
  fs.mkdirSync(blocked);
  fs.writeFileSync(
    path.join(available, 'yaml.py'),
    `from pathlib import Path
Path(__file__).with_name("yaml-imported").write_text("imported", encoding="utf-8")
def safe_load(_value):
    raise RuntimeError("environment-dependent yaml parser was used")
`,
  );
  fs.writeFileSync(
    path.join(blocked, 'sitecustomize.py'),
    `import builtins
_original_import = builtins.__import__
def _block_yaml(name, *args, **kwargs):
    if name == "yaml" or name.startswith("yaml."):
        raise ImportError("yaml intentionally blocked")
    return _original_import(name, *args, **kwargs)
builtins.__import__ = _block_yaml
`,
  );

  const expected = {
    markdown: fs.readFileSync(GUIDE_MD_PATH),
    yaml: fs.readFileSync(GUIDE_YAML_PATH),
  };
  try {
    for (const pythonPath of [available, blocked]) {
      execFileSync('python3', [SCRIPT_PATH, '--check'], {
        cwd: REPO_ROOT,
        env: { ...process.env, PYTHONPATH: pythonPath },
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      assert(
        fs.readFileSync(GUIDE_MD_PATH).equals(expected.markdown),
        'SKILLS.md bytes must be parser-environment independent',
      );
      assert(
        fs.readFileSync(GUIDE_YAML_PATH).equals(expected.yaml),
        'SKILLS.yaml bytes must be parser-environment independent',
      );
    }
    assert(!fs.existsSync(importedMarker), 'scan_skills.py must not import an available yaml module');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('catalog check detects drift without self-healing', () => {
  const original = fs.readFileSync(GUIDE_MD_PATH);
  try {
    fs.appendFileSync(GUIDE_MD_PATH, '\n<!-- injected catalog drift -->\n');
    let failedAsExpected = false;
    try {
      execSync(`python3 "${SCRIPT_PATH}" --check`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (error) {
      failedAsExpected = error.status === 1;
    }
    assert(failedAsExpected, 'catalog --check must fail before the original bytes are restored');
  } finally {
    fs.writeFileSync(GUIDE_MD_PATH, original);
  }
});

test('catalog checks are deterministic and non-mutating', () => {
  const first = {
    markdown: fs.readFileSync(GUIDE_MD_PATH, 'utf-8'),
    yaml: fs.readFileSync(GUIDE_YAML_PATH, 'utf-8'),
  };

  execSync(`python3 "${SCRIPT_PATH}" --check`, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  execSync(`python3 "${SCRIPT_PATH}" --check`, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  assert(fs.readFileSync(GUIDE_MD_PATH, 'utf-8') === first.markdown, 'SKILLS.md must be deterministic');
  assert(fs.readFileSync(GUIDE_YAML_PATH, 'utf-8') === first.yaml, 'SKILLS.yaml must be deterministic');
});

if (failed > 0) {
  console.log(`\n❌ Test Results: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\n✅ Test Results: ${passed} passed, ${failed} failed`);
