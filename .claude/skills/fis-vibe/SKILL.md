---
name: fis:vibe
description: "Run the full delivery pipeline from issue to merge-ready request, with optional merge and post-merge CI convergence. Supports dual-stage beta-then-stable ships via --both and kongming advisory supervision via --advice. Use for GitLab issues, feature requests, bug fixes, or autonomous ship runs."
user-invocable: true
when_to_use: "Invoke when a user wants one command to take an issue or feature request from planning through implementation, review, shipping, and optional merge."
category: dev-tools
keywords: [vibe, pipeline, delivery, worktree, plan, craft, fix, ship, mr, ci, advice, kongming]
argument-hint: "[--ship] [--beta] [--both] [--advice] <issue-url | feature request>"
metadata:
  author: fis-ai-kit
  version: "1.1.0"
---

# Vibe Pipeline

Run a full autonomous delivery pipeline from request intake to MR readiness,
with optional merge and post-merge CI convergence. GitLab-first (gitlab.com
and self-hosted); GitHub repositories run the same pipeline through `gh`.

This skill orchestrates `/fis:worktree`, `/fis:plan`, `/fis:craft`, `/fis:fix`,
`/fis:code-review`, `/fis:ship`, and `/fis:review-mr`. It does NOT bypass those
skills' approval gates, tests, review blockers, branch protections, or security
policies. The issue/MR plus acceptance criteria and tests/CI stay the system of
record, exactly as `/fis:outcome` defines.
## Inputs

```bash
/fis:vibe <issue-url>
/fis:vibe --ship --beta <issue-url>
/fis:vibe --both <issue-url>
/fis:vibe --ship <feature request>
```

| Flag | Effect |
| --- | --- |
| `--beta` | Ship to beta/dev target via `/fis:ship beta`; final ready label is `ready to ship beta`. |
| `--ship` | After review/fix/reply, merge the request and watch/fix CI until success or a true external blocker. |
| `--both` | Dual-stage ship: run the full beta stage first (ship, review, merge, watch CI until green), then the stable stage (ship official, review, merge, watch CI until green). Implies `--ship` for both stages; supersedes `--beta`. |
| `--advice` | Run the whole pipeline under `kongming` advisory supervision (see Advisory supervision). Composes with any ship mode. |
| no `--beta` | Ship stable via `/fis:ship official`; final ready label is `ready to ship stable`. |
| no `--ship` | Stop after the request is reviewed, fixed, replied, and labeled ready. |

Rows describe individual flags in isolation; when `--both` is present, mode
resolution below wins. Mode resolution: `--both` > `--beta` > default stable.
If `--both` and `--beta` are given together, warn once and proceed in `both`
mode. `--advice` is orthogonal to ship mode and composes with all of them.

Provider detection, label management, issue updates, merge, and CI-watch
commands live in `references/gitlab-pipeline-commands.md`.

## Advisory supervision (`--advice`)

When `--advice` is present, run the whole pipeline under `kongming`
supervision. `kongming` is an advisory-only supervisor: it returns counsel,
never code, and the main agent stays responsible for every decision, edit, and
gate.

Spawn `kongming` at these checkpoints:

- **After each pipeline phase completes** — after the plan gates (step 3), after
  implementation (step 5), and after the local code review (step 6). Pass the
  phase goal, what changed, and the evidence; ask for a go/no-go and the next
  risk to watch before continuing.
- **When stuck** — repeated failures, a blocked step, or contradictory evidence;
  pass everything already tried and the exact obstacle.
- **Before a high-stakes decision** — a design fork, a public-contract or
  security-sensitive change, or an irreversible action (including a promotion
  merge that sweeps unrelated work); get counsel first.
- **After the request is opened and CI is green** — this is the mandatory review
  gate described below.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`
— the `Task` tool on this runtime. Give it enough context to answer in one
reply; it does not interview.

**Mandatory post-request review gate:** once the request is opened, watch and
fix CI until every required check is green (steps 8 and 10), then spawn
`kongming` to review the whole implementation and post its assessment plus
concrete next steps as a comment directly on the request and the source issue.
In `--both` mode this gate runs per stage (after the beta request and again
after the stable request).

`--advice` adds supervision; it never bypasses this skill's approval gates,
tests, code-review blockers, branch protections, or security policy.

## Pipeline

1. **Parse and analyze the request**
   - Strip `--ship`, `--beta`, `--both`, and `--advice` from the arguments,
     then resolve ship mode (`both` > `beta` > stable). `--both` implies
     `--ship`.
   - If the remaining input is an issue URL or `#iid`, that issue is the
     source of truth — do not create a duplicate. Read its title, description,
     and notes.
   - If the input is natural language, treat it as the feature request; the
     issue is created after plan validation.
   - If the issue URL's project differs from the current repo's remote, stop
     and ask the user to switch to the matching repo/worktree.
   - Extract the concrete outcome, acceptance criteria, scope boundary,
     constraints, blockers, and likely touched surfaces.
   - Classify the route: **bugfix** (bug, regression, failing test/CI,
     incident, explicit fix/debug wording) or **feature** (net-new capability,
     enhancement, refactor, ambiguous product work).
   - Detect an existing plan in this order, verifying the resolved `plan.md`
     exists on disk before treating it as reusable: (1) a user-provided plan
     path; (2) the worktree pointer and then `node <accessor> resolve` for the
     current repo and branch; (3) a `plans/.../plan.md` linked from the issue
     body or notes, or a matching plan already in the current worktree.
     Detection runs before worktree creation, so the pointer is often unset
     here — that is expected, not a failure. On an ambiguity error, present the
     candidates and fall through to the file/issue scan rather than treating it
     as "no plan". The issue-link and worktree scan stays first-class: a
     teammate's plan may exist only as repo files plus an issue link.
   - Ask before creating the worktree only if an ambiguity would change the
     implementation; otherwise proceed.

2. **Create an isolated worktree and branch**
   - Activate `/fis:worktree` with a descriptive branch name derived from the
     issue/request.
   - Reuse an existing clean matching feature worktree/branch and record why.
   - Never work directly on `main`, `master`, `dev`, `beta`, or `develop`.

3. **Plan intake and gates**
   - Reuse a detected valid `plan.md`; otherwise activate
     `/fis:plan --tdd "<source issue or feature request>"` in the worktree and
     capture the absolute plan path.
   - Always run both gates, even for a reused plan:
     `/fis:plan validate <plan.md>` and `/fis:plan red-team <plan.md>`.
   - Do not proceed while validation failures, accepted red-team findings, or
     unresolved contradictions remain.

4. **Create or update the tracking issue**
   - Ensure the pipeline labels exist (idempotent — see reference):
     `ready to craft`, `in progress`, `ready to ship stable`,
     `ready to ship beta`.
   - Natural-language input: create the issue now — on GitLab use
     `fis-git/scripts/gitlab-issue.sh` (supports due date and time tracking);
     on GitHub use `gh issue create`.
   - Existing issue: post an execution note instead of editing the author's
     description.
   - The issue update must include: branch name, route (`feature` via
     `/fis:craft` or `bugfix` via `/fis:fix`), implementation summary, relative
     plan link, ship mode (`official`/`beta`), and the acceptance criteria from
     the plan (see the issue body template below).
   - Add `ready to craft`; remove stale `ready to ship *` labels.

5. **Implement or fix**
   - Before implementation, move the issue label from `ready to craft` to
     `in progress`. If the label update fails, stop and report the exact error
     — do not implement while the issue state is stale.
   - Bugfix route: activate `/fis:fix --auto <plan.md>` with the source
     issue, failure evidence, scope boundary, and acceptance criteria.
   - Feature route: activate `/fis:craft --tdd --auto <plan.md>`.
   - Honor every hard gate in `/fis:craft` and `/fis:fix`. If implementation
     stops on a user/business decision, post the blocker to the issue and stop.

6. **Review the local implementation**
   - Activate `/fis:code-review --pending`; fix Critical and Important
     findings before shipping; re-run relevant validation after fixes.

7. **Ship the request**
   - If `--both` is present, start with the beta stage: `/fis:ship beta`. The
     stable stage runs later, in step 10, only after beta merge and beta CI
     success.
   - Else activate `/fis:ship beta` (with `--beta`) or `/fis:ship official`.
   - Capture the request URL/iid from the output. `/fis:ship` already handles
     provider detection and the `glab`/push-option/prefilled-URL fallback
     ladder.
   - `/fis:ship` finalizes a plan-backed change as part of its pipeline: it
     writes `status: completed` to the plan files before committing, so the
     finalized files ride the ship commit. No extra action here.

8. **Review, fix, and reply on the MR**
   - Activate `/fis:review-mr <mr-url-or-iid> --fix --reply`.
   - Do not continue while actionable findings remain; the request pipeline must
     be terminal and green unless the blocker is external and recorded.
   - When `--advice` is present, after CI is terminal and green, run the
     mandatory post-request review gate: spawn `kongming` to review the whole
     implementation and post its assessment plus concrete next steps as a
     comment on the request and the source issue (see Advisory supervision).

9. **Apply the ready label**
   - Beta mode: add `ready to ship beta`.
   - Both mode: add `ready to ship beta` now; `ready to ship stable` is added in
     step 10 when the stable-stage request passes review.
   - Otherwise: add `ready to ship stable`.
   - Apply to the issue and, where supported, the request.
   - Remove `ready to craft` and `in progress`.

10. **Optional merge and CI convergence** (only with `--ship` or `--both`)
    - Merge via the provider's convention and branch protection. Prefer
      auto-merge when required checks are still pending (GitLab:
      `glab mr merge --auto-merge`; GitHub: `gh pr merge --auto`).
    - Never force push. Never direct-push to protected target branches.
    - After merge, watch the target-branch pipeline for the merge commit.
    - On a deterministic repo-fixable CI failure: inspect the failed job log,
      create a follow-up fix branch/worktree from the target branch, activate
      `/fis:fix --auto` with the exact failing command and error, ship the
      follow-up in the same mode, run `/fis:review-mr --fix --reply`, merge,
      and watch again.
    - Stop only when the target-branch CI succeeds, an external blocker
      remains, or the same blocker survives 3 fix attempts.
    - **Dual-stage (`--both`) sequence:**
      1. **Beta stage:** merge the beta request and watch beta/dev-branch CI to
         green using the merge and fix loop above.
      2. Do not start the stable stage while beta CI is red, pending, or
         blocked. If the beta stage ends on an external blocker or exhausts fix
         attempts, stop, report, and mark the stable stage as skipped.
      3. **Stable stage:** after beta CI is green, ship stable. Pick the path
         from how the beta merge landed:
         - If the feature is already merged into the beta/dev branch and the
           repository promotes beta/dev into stable by convention (a promotion
           request from dev to main), follow that convention. Before merging a
           promotion request, list the commits it carries; if it sweeps
           unrelated work beyond this issue, stop and ask the user instead of
           merging silently.
         - If the feature branch is still independent of the stable target,
           activate `/fis:ship official` from the feature branch.
      4. Capture the stable request, then activate
         `/fis:review-mr <stable-request> --fix --reply`, apply
         `ready to ship stable` to the source issue and stable request, and
         remove `ready to ship beta`. When `--advice` is present, run the
         mandatory post-request review gate for the stable request too.
      5. Merge the stable request and watch stable-branch CI to green with the
         same merge and fix loop. The run is complete only when stable CI
         succeeds or a documented external blocker remains.

## Issue body template

Use when creating a new issue or posting the execution note:

```markdown
## Outcome
<user-visible outcome>

## Implementation
- Branch: `<branch-name>`
- Plan: `<relative/path/to/plan.md>`
- Mode: `<official|beta|both>`
- Route: `<feature|bugfix>`
- MR: `<url once created>`
- Stable MR: `<url once created, only when --both>`

## Acceptance Criteria
- [ ] <criterion from plan>

## Pipeline State
- [x] Worktree and branch created
- [x] Plan created or reused, validated, red-teamed
- [x] Issue labeled `in progress` before implementation
- [ ] Implementation complete
- [ ] MR reviewed and fixed
- [ ] Merged and CI green (only when --ship)
- [ ] Beta merged and beta CI green (only when --both)
- [ ] Stable merged and stable CI green (only when --both)
```

## Security

- Never write secrets, tokens, customer data, or private env values into
  issues, MRs, notes, plans, or logs; redact sensitive command output first.
- If credentials lack a needed capability (labels, issues, MRs, approvals,
  merges), stop and report the exact missing capability.
- If CI fails on missing secrets, unavailable services, or required human
  approval, record an external blocker. Do not weaken tests or hide failures.

## Completion report

End with:

```markdown
**Vibe Result**
- Source: <issue/request>
- Branch/worktree: <branch> | <path>
- Plan: <relative path>
- Issue: <url>
- MR: <url> (beta-stage request when --both)
- Stable MR: <url|n/a> (only when --both)
- Mode: official|beta|both
- Route: feature|bugfix
- Review: <verdict + fix iterations>
- Merge: skipped|merged|blocked (per stage when --both, e.g. `beta: merged / stable: merged`)
- CI: green|failed|blocked (per stage when --both, e.g. `beta: green / stable: green`)

Unresolved questions:
- None
```

## Workflow position

**Alternative to:** running `/fis:outcome` steps manually when the outcome is a
well-framed issue and autonomous delivery is acceptable.
**Composes:** `/fis:worktree` → `/fis:plan` → `/fis:craft`|`/fis:fix` →
`/fis:code-review` → `/fis:ship` → `/fis:review-mr`.
