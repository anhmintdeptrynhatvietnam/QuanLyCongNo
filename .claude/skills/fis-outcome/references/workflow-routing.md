# Outcome Workflow Routing

Nucleus sequencing for `/fis:outcome`: which steps run, in what order, and which
gates the risk level makes mandatory.

General workflow routing lives in `.claude/rules/skill-workflow-routing.md`,
which is always loaded. Resolve every capability below against the runtime's
live skill catalog; the skills named here are the ones this kit installs today,
not a guarantee that they are present.

## Standard Nucleus Sequence

```text
[frame] -> [plan] -> [scout] -> [implement or fix] -> [test] -> [review] -> [ship]
```

| Step | Capability | Skill today | When required |
|------|------------|-------------|---------------|
| Frame | Outcome framing | `/fis:outcome` | Always — sets acceptance criteria |
| Plan | Planning | `/fis:plan` | Always — scoped phased plan |
| Scout | File scouting | `/fis:scout` | When unfamiliar with affected code |
| Implement | Implementation | `/fis:craft` | Feature work / new capability |
| Fix | Bug fixing | `/fis:fix` | Bug, regression, CI failure |
| Test | Testing | `/fis:test` | Always — validates acceptance criteria |
| Review | Code review | `/fis:code-review` | Always — quality gate |
| Ship | Release | `/fis:ship` | Always — merge and close |

## Mode Behavior

| Mode | Effect on sequence |
|------|--------------------|
| default | Full nucleus. All "Always" steps run. |
| `--fast` | Frame → Implement → Test → Ship. Plan collapses to a 3-line inline note in the issue/PR. Scout runs only if the code is unfamiliar. Review folds into Test as a self-review. **Only valid for R1–R2 with ≤3 acceptance criteria and no public API / data migration / security surface.** |
| `--parallel` | Requires a full plan first. Implement runs `/fis:craft --parallel` (or `/fis:team`) across 3+ independent phases with no shared file ownership. |

`--fast` and `--parallel` are mutually exclusive. If a `--fast` outcome is discovered to be R3+ mid-flight, abort fast mode and restart in default mode from the Plan step.

## Risk → Gate

The `Risk level` from Step 1 decides which optional gates become mandatory. Do not skip a gate that risk makes mandatory; do not force a gate that risk makes optional.

| Risk | Scout | Architecture / ADR | Security scan | Review depth | DRI pre-approval of AC before Implement |
|------|-------|--------------------|---------------|--------------|-----------------------------------------|
| R1 | optional | no | no | light / self-review | no |
| R2 | if unfamiliar | no | no | standard `/fis:code-review` | no |
| R3 | required | if a cross-service contract changes | if handling sensitive data | deep `/fis:code-review` | recommended |
| R4 | required | required (`/fis:architecture`, ADR) | required (`/fis:security-scan`) | deep review + second pass | required — DRI signs off criteria before any code |

## Deviation Conditions

**Skip Scout:** Outcome touches only files you just wrote or reviewed in this session.

**Use `/fis:fix` instead of `/fis:craft`:** Outcome is a bug fix or regression rather than a new capability.

**Add `/fis:debug` before `/fis:fix`:** Root cause is unknown. Run debug first to identify it.

**Add `/fis:brainstorm` before `/fis:plan`:** Multiple implementation approaches exist and the trade-offs are significant.

**Use `--parallel` on `/fis:craft`:** Plan has 3+ independent phases with no shared file ownership.

## System of Record

The issue or PR is the system of record. Update it at each step:
- **After Step 1:** Write acceptance criteria into the issue / PR description.
- **After Step 4:** Attach test run evidence (CI link or log excerpt).
- **After Step 5:** Note review score and any critical findings.
- **After Step 6:** Close the issue / merge the PR.

## Failure Loop and Escalation

Loop back to the narrowest fixing step. Never silently retry the same failing action.

| Failure | Loop back to | Notes |
|---------|--------------|-------|
| Test fails, cause known | `/fis:fix` → re-test | |
| Test fails, cause unknown | `/fis:debug` → `/fis:fix` → re-test | Identify root cause before changing behavior |
| Review: critical findings | `/fis:craft` or `/fis:fix` (findings only) → re-review | Do not widen scope |
| Ship / CI fails | `/fis:fix` on the CI failure → re-run | Flaky/infra → escalate, do not blind-retry |
| Scope change requested mid-flight | Step 1 — Frame | Re-confirm acceptance criteria with the DRI |

**Iteration cap:** max **3** fix attempts on the same failure. After that, or when blocked by an external decision/dependency, stop and escalate to the DRI with: what was attempted, current evidence (logs/CI link), and the suspected cause. Escalation is a step, not a failure.

## Completion Contract

An outcome is done when ALL of the following are true:
1. Every acceptance criterion is checked off in the issue / PR.
2. Every acceptance criterion maps to at least one passing test (or has a DRI-signed untestable note).
3. All tests pass in CI.
4. Code review at the depth required by the risk level has approved the implementation.
5. The PR is merged and the issue is closed.

No additional artifact chain is required.
