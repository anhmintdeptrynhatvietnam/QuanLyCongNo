# AI-Generated Code Checklist

Always loaded alongside `base.md` — diffs produced through this kit are AI-assisted by definition.
Covers the AI-specific risk items of FIS QMS checklist 04.05-BM/PM/HDCV/FPTIS (AI appendix). Same two-pass model and output format as `base.md`.

---

## Pass 1 — CRITICAL (blocking)

### Hallucinated Dependencies
- New packages that do not exist on the official registry, or near-miss names of popular packages (typosquatting). Verify exact name + version before accepting.
- Dependencies added for functionality the standard library or an existing project dependency already provides.

### Hallucinated APIs
- Calls to functions/methods/options that do not exist in the dependency versions this project actually uses (check lockfile/manifest version, not latest docs).
- Config keys or CLI flags invented by pattern-matching from other tools.

### Fake or Weakened Tests
- Tests that assert tautologies (`expect(true)`, asserting the mock returns the mock)
- Mocking the unit under test itself so the test can never fail
- Tests skipped, loosened, or deleted to make the suite pass

### Secrets & Data Echo
- Secrets, tokens, connection strings, or customer data copied by the AI from context into code, config, tests, or log statements

### License Contamination
- Code blocks reproduced verbatim from open-source projects with copyleft licenses (GPL family). If in doubt, flag for SCA (Black Duck) verification.

### Error & Resource Handling (04.05 core)
- Errors swallowed on function returns; exceptions caught without handling or notification to the caller
- Resources (DB connections, sockets, file handles) not released on error paths

---

## Pass 2 — INFORMATIONAL (non-blocking)

### Over-Generation (unrequested scope)
- Helpers, abstractions, options, or config beyond what the request needs
- Dead code: unused exports, unreachable branches, placeholder functions

### Repo Consistency
- Generic AI patterns where the repo has an established convention (naming, error handling, folder layout, existing utilities)
- Reimplementing a utility that already exists in the codebase

### Comment Noise
- Narrating comments that restate the code ("// increment counter"). Comments must explain why, not how (04.05)

### Structure (04.05 core)
- Functions doing more than one job — split when it genuinely simplifies
- Loop bounds unverified; possible unintended infinite loops
- Shared mutable state without synchronization (deep check lives in `base.md` critical)

### Explainability
- The human owner (DRI) must be able to explain every change. If a hunk cannot be explained, it must be simplified or rewritten before merge — note it in the review output.

---

## Suppressions

Inherit all suppressions from `base.md`. Additionally, do NOT flag:

- Code style choices already enforced by the project's linter/formatter
- AI-typical verbosity that a human explicitly asked to keep
