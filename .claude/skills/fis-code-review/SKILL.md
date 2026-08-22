---
name: fis:code-review
description: "Review code quality with evidence-based adversarial rigor. Supports input modes: pending changes, merge/pull request, commit hash, codebase scan. Focuses on bugs, regressions, maintainability, reliability, verification gaps, plus always-on red-team analysis."
user-invocable: true
when_to_use: "Invoke to review diffs, merge/pull requests, commits, or full codebases."
category: utilities
keywords: [review, quality, red-team, verification]
argument-hint: "[#123 | COMMIT | --pending | codebase [parallel]] [--yagni]"
metadata:
  author: fis-ai-kit
  version: "2.1.0"
---

# Code Review

Production-readiness code review with technical rigor, evidence-based claims, and verification over performative responses. Reviews focus on production risks, regression paths, and whether the implementation matches the requested change. Every review includes red-team analysis that actively tries to break the code.

## Input Modes

Auto-detect from arguments. If ambiguous or no arguments, prompt via `ask_user capability` (the `AskUserQuestion` tool on this runtime).

| Input | Mode | What Gets Reviewed |
|-------|------|--------------------|
| `#123` or request URL | **Request** | Full merge/pull request diff via the provider CLI |
| `abc1234` (7+ hex chars) | **Commit** | Single commit diff via `git show` |
| `--pending` | **Pending** | Staged + unstaged changes via `git diff` |
| *(no args, recent changes)* | **Default** | Recent changes in context |
| `codebase` | **Codebase** | Full codebase scan |
| `codebase parallel` | **Codebase+** | Parallel multi-reviewer audit |

**Git provider is never assumed.** Resolve the repository's provider from the git remote first, then use the installed review capability for that provider — merge request on GitLab (`glab`; the kit ships `/fis:review-mr` for the full MR flow), pull request on GitHub (`gh`). Read that skill for the exact commands.

**Resolution details:** `references/input-mode-resolution.md`

### No Arguments

If invoked WITHOUT arguments and no recent changes in context, use `ask_user capability` with header "Review Target", question "What would you like to review?":

| Option | Description |
|--------|-------------|
| Pending changes | Review staged/unstaged git diff |
| Enter request number | Fetch and review a specific merge/pull request |
| Enter commit hash | Review a specific commit |
| Full codebase scan | Deep codebase analysis |
| Parallel codebase audit | Multi-reviewer codebase scan |

## Core Principle

**KISS**, **DRY** always. Requested scope is a constraint, not a finding — do not recommend cutting what the user asked for. If requested scope is genuinely unsafe, broken, or duplicates something that already exists, raise it as a question with the evidence, not as a cut. Flag speculative and unrequested code with its concrete cost. With `--yagni`, scope-cut findings are also in scope. Technical correctness over social comfort.
**Be honest, be brutal, straight to the point, and be concise.**

Scope findings resolve one way only: "unrequested scope added beyond the task" is a violation; "did not apply YAGNI" is not a violation unless `--yagni` was passed.

Default assumption: reviewed code may be AI-assisted. Do not trust polished shape, confident comments, or happy-path tests. Verify behavior, project-rule compliance, and scope discipline from evidence.

No rubber-stamp reviews. The reviewer is not trying to please the author or preserve momentum; the reviewer enforces the rulebook and blocks defects, regressions, hidden scope drift, and AI-slop patterns.

Verify before implementing. Ask before assuming. Evidence before claims.

## Practices

| Practice | When | Reference |
|----------|------|-----------|
| **Spec compliance** | After implementing from plan/spec, BEFORE quality review | `references/spec-compliance-review.md` |
| **Adversarial review** | Always-on Stage 3 — actively tries to break the code | `references/adversarial-review.md` |
| Receiving feedback | Unclear feedback, external reviewers, needs prioritization | `references/code-review-reception.md` |
| Requesting review | After tasks, before merge, stuck on problem | `references/requesting-code-review.md` |
| Verification gates | Before any completion claim, commit, merge/pull request | `references/verification-before-completion.md` |
| Edge case scouting | After implementation, before review | `references/edge-case-scouting.md` |
| **Checklist review** | Pre-landing, the installed ship skill pipeline, security audit | `references/checklist-workflow.md` |
| **Tracked reviews** | Multi-file features (3+ files), parallel reviewers, fix cycles | `references/task-management-reviews.md` |

## Quick Decision Tree

```
SITUATION?
│
├─ Input mode? → Resolve diff (references/input-mode-resolution.md)
│   ├─ #request / URL → resolve provider → fetch request diff
│   ├─ commit hash → git show
│   ├─ --pending → git diff (staged + unstaged)
│   ├─ codebase → full scan (references/codebase-scan-workflow.md)
│   ├─ codebase parallel → parallel audit (references/parallel-review-workflow.md)
│   └─ default → recent changes in context
│
├─ Received feedback → STOP if unclear, verify if external, implement if human partner
├─ Completed work from plan/spec:
│   ├─ Stage 1: Spec compliance review (references/spec-compliance-review.md)
│   │   └─ PASS? → Stage 2 │ FAIL? → Fix → Re-review Stage 1
│   ├─ Stage 2: Code quality review (code-reviewer subagent)
│   │   └─ Scout edge cases → Review standards, performance
│   ├─ Stage 3: Adversarial review (references/adversarial-review.md) [ALWAYS-ON]
│   │   └─ Red-team the code → Adjudicate → Accept/Reject findings
│   └─ Verification gate → Run required tests/builds before claims
├─ Completed work (no plan) → Scout → Code quality → Adversarial → Verification
├─ Pre-landing / ship → Load checklists → Two-pass review → Adversarial → Verification
├─ Multi-file feature (3+ files) → Track review pipeline (scout→review→adversarial→fix→verify)
└─ About to claim status → RUN verification command FIRST
```

### Review Protocol

**Stage 1 — Spec Compliance** (load `references/spec-compliance-review.md`)
- Does code match what was requested?
- Any missing requirements? Any unjustified extras?
- MUST pass before Stage 2

**Stage 2 — Code Quality** (code-reviewer subagent)
- Only runs AFTER spec compliance passes
- Standards, security, performance, edge cases

**Stage 3 — Adversarial Review** (load `references/adversarial-review.md`)
- Runs AFTER Stage 2 passes, subject to scope gate (skip if <=2 files, <=30 lines, no security files)
- Spawn adversarial reviewer with context anchoring (runtime, framework, context files)
- Find: security holes, false assumptions, resource exhaustion, race conditions, supply chain, observability gaps
- Output: Accept (must fix) / Reject (false positive) / Defer (tracked issue on the repository's provider) verdicts per finding
- Critical findings block merge; re-reviews use fix-diff-only optimization

**Final Verification**
- Runs AFTER Stage 3 passes
- Re-run the relevant tests, build, lint, or manual reproduction
- Verify accepted findings are fixed and no new regression is introduced
- Critical findings block merge until fixed and re-verified

## Receiving Feedback

**Pattern:** READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT
No performative agreement. Verify before implementing. Push back if wrong.

**Full protocol:** `references/code-review-reception.md`

## Requesting Review

**When:** After each task, major features, before merge

**Process:**
1. **Scout edge cases first** (see below)
2. Get SHAs: `BASE_SHA=$(git rev-parse HEAD~1)` and `HEAD_SHA=$(git rev-parse HEAD)`
3. Dispatch code-reviewer via `delegate_agent capability` (the `Task` tool on this runtime) with: WHAT, PLAN, BASE_SHA, HEAD_SHA, DESCRIPTION
4. Fix Critical immediately, Important before proceeding

**Full protocol:** `references/requesting-code-review.md`

## Edge Case Scouting

**When:** After implementation, before requesting code-reviewer

**Process:**
1. Invoke `/fis:scout` with edge-case-focused prompt
2. Scout analyzes: affected files, data flows, error paths, boundary conditions
3. Review scout findings for potential issues
4. Address critical gaps before code review

**Full protocol:** `references/edge-case-scouting.md`

## Tracked Review Pipeline

**When:** Multi-file features (3+ changed files), parallel code-reviewer scopes, review cycles with Critical fix iterations.

Discover the live task-management surface at runtime and use it when available
(`TaskCreate`/`TaskUpdate`/`TodoWrite` on this runtime). If available, represent
the `scout → review → adversarial → fix → verify` dependency chain there.
Otherwise, record the same states in the active plan and run the chain
sequentially. Plan files are the durable source of truth; runtime tracking is
only a working view. Review quality is identical either way.

**Parallel reviews:** Spawn scoped code-reviewer subagents for independent file groups (e.g., backend + frontend). Fix step blocks on all reviewers completing.

**Re-review cycles:** If fixes introduce new issues, add another review cycle. Limit 3 cycles, then escalate to the user.

**Full protocol:** `references/task-management-reviews.md`

## Verification Gates

**Iron Law:** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

**Gate:** IDENTIFY command → RUN full → READ output → VERIFY confirms → THEN claim

**Requirements:**
- Tests pass: Output shows 0 failures
- Build succeeds: Exit 0
- Bug fixed: Original symptom passes
- Requirements met: Checklist verified

**Red Flags:** "should"/"probably"/"seems to", satisfaction before verification, trusting agent reports

**Full protocol:** `references/verification-before-completion.md`

## Integration with Workflows

- **Subagent-Driven:** Scout → Review → Adversarial → Verify before next task
- **Merge/Pull Requests:** Scout → Code quality → Adversarial → Verify → Merge
- **Tracked Pipeline:** Record dependencies → advance only when prerequisites complete
- **Craft Handoff:** Craft completes phase → review pipeline completes (incl. adversarial) → craft proceeds
- **Request Review:** `/fis:code-review #123` → resolve provider → fetch request diff → full pipeline on the request changes
- **Commit Review:** `/fis:code-review abc1234` → review specific commit with full pipeline

## Codebase Analysis Subcommands

| Subcommand | Reference | Purpose |
|------------|-----------|---------|
| `/fis:code-review codebase` | `references/codebase-scan-workflow.md` | Scan & analyze the codebase |
| `/fis:code-review codebase parallel` | `references/parallel-review-workflow.md` | Ultrathink edge cases, then parallel verify |

## Bottom Line

1. Resolve input mode first — know WHAT you're reviewing
2. Technical rigor over social performance
3. Scout edge cases before review
4. Adversarial review on EVERY review — no exceptions
5. Evidence before claims

Verify. Scout. Red-team. Question. Then implement. Evidence. Then claim.

## Workflow Position

**Typically follows:** the installed implementation skill (`/fis:craft`, review after implementation), the installed fix skill (`/fis:fix`, review after bug fix)
**Typically precedes:** the installed ship skill (ship after review passes)
**Related:** `/fis:scout` (scout before reviewing), the installed test skill (test before reviewing), the installed provider review skill (`/fis:review-mr` for GitLab merge requests)
