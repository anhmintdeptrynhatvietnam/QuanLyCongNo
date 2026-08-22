---
name: fis:ship
description: "Ship pipeline: merge main, test, review, commit, push, PR. Single command from feature branch to PR URL. Use for shipping official releases to main/master or beta releases to dev/beta branches."
user-invocable: true
when_to_use: "Invoke when a completed branch needs the merge/pull request shipping workflow."
category: dev-tools
keywords: [ship, PR, merge, push, release]
argument-hint: "[official|beta] [--skip-tests] [--skip-review] [--skip-journal] [--skip-docs] [--dry-run]"
license: MIT
metadata:
  author: fis-ai-kit
  version: "2.2.0"
---

# Ship: Unified Ship Pipeline

Single command to ship a feature branch. Fully automated — only stops for test failures, critical review issues, or major version bumps.

**Inspired by:** gstack `/ship` by Garry Tan. Adapted for framework-agnostic, multi-language support.

## Arguments

| Flag | Effect |
|------|--------|
| `official` | Ship to default branch (main/master). Full pipeline with docs + journal |
| `beta` | Ship to dev/beta branch. Lighter pipeline, skip docs update |
| (none) | Auto-detect: if base branch is main/master → official, else → beta |
| `--skip-tests` | Skip test step (use when tests already passed) |
| `--skip-review` | Skip pre-landing review step |
| `--skip-journal` | Skip journal writing step (also honors `journal.auto=false` config preference) |
| `--skip-docs` | Skip docs update step |
| `--dry-run` | Show what would happen without executing |

## Ship Mode Detection

```
If argument = "official" → target = main/master (auto-detect default branch)
If argument = "beta"     → target = dev/beta (auto-detect dev branch)
If no argument           → infer from current branch naming:
  - feature/* hotfix/* bugfix/* → official (target main)
  - dev/* beta/* experiment/*  → beta (target dev/beta)
  - unclear                    → ask_user capability
```

## When to Stop (blocking)

- On target branch already → abort
- Merge conflicts that can't be auto-resolved → stop, show conflicts
- Test failures → stop, show failures
- Critical review issues → `ask_user capability` (the `AskUserQuestion` tool on this runtime) per issue
- Major/minor version bump needed → `ask_user capability`

## When NOT to Stop

- Uncommitted changes → always include them
- Patch version bump → auto-decide
- Changelog content → auto-generate
- Commit message → auto-compose
- No version file → skip version step silently
- No changelog → skip changelog step silently

## Pipeline

```
Step 1:  Pre-flight      → Branch check, mode detection, status, diff analysis
Step 2:  Link Issues      → Find/create related issues on the detected forge
Step 3:  Merge target     → Fetch + merge origin/<target-branch>
Step 4:  Run tests        → Auto-detect test runner, run, check results
Step 5:  Review           → Two-pass checklist review (critical + informational)
Step 6:  Version bump     → Auto-detect version file, bump patch/minor
Step 7:  Changelog        → Auto-generate from commits + diff
Step 8:  Journal          → Write technical journal via /fis:journal (see the shared "Journal step — opt-out" contract: --skip-journal flag or journal.auto config skips)
Step 9:  Docs update      → Update project docs via /fis:docs update (official only)
Step 9b: Finalize plan    → node <accessor> update --status completed (plan-backed; foreground, staged by Step 10)
Step 10: Commit           → Conventional commit with version/changelog
Step 11: Push             → git push -u origin <branch>
Step 12: Create PR/MR     → glab mr create (GitLab, incl. self-hosted) or gh pr create (GitHub), auto-detected from remote
Step 12b: Link plan       → record the request URL in the plan body as a non-authoritative breadcrumb
```

**Detailed steps:** Load `references/ship-workflow.md`
**Auto-detection:** Load `references/auto-detect.md`
**PR template:** Load `references/pr-template.md`
**Writing language:** Load `../fis-review-mr/references/writing-language.md`
**Request body contract:** Load `../fis-review-mr/references/request-body-contract.md`
**Plan state model:** Load `../fis-craft/references/plan-state-files-first.md`

## Writing language + request body

Before Step 12, resolve the writing language with
`node scripts/fis-config.cjs resolve --json | jq -r '.prefs.locale.response_language // "en"'`
(run from the kit directory the plan accessor resolves from) and author the
request body in that language. Titles stay English conventional commits. The
body must include the seven evidence sections plus Linked Issues and Ship Mode.
Prefer honest `None` / `Not run` / `Unavailable` over invented narrative.

## Journal step — opt-out

Skip the automatic `/fis:journal` step (Step 8) when either applies:
- The invocation includes the `--skip-journal` flag, OR
- `node scripts/fis-config.cjs resolve --json | jq -r 'if .prefs.journal.auto == false then "false" else "true" end'` returns `false`. If the command errors or prints anything other than the exact string `false`, treat as `true` (default) — corrupt or missing config never suppresses the automatic journal.

Precedence: flag > project config > user config > default (`true`).
When skipped, print one line:
- `journal skipped by --skip-journal` (flag), or
- `journal skipped by preference` (config).

Explicit `/fis:journal` invocation is unaffected.

## Plan finalization (Step 9b)

When the branch is plan-backed, finalize the plan files before the ship commit
so `status: completed` reaches the target branch in the same merge as the code
it describes:

1. Resolve the active plan (`node <accessor> resolve`). A resolve-miss means no
   active plan — skip finalization silently; most ships carry no plan.
2. Verify checkboxes against the diff (`node <accessor> status`); tick proven
   items with `check`. If work is genuinely partial,
   `node <accessor> update --status in-progress` and stop — never
   blind-complete a half-done plan.
3. When complete, `node <accessor> update --status completed`.

Run it in the foreground so Step 10 stages the result. If the accessor is
unavailable, report the plan-dir path and continue with a warning — never
hand-edit a status line.

## Token Efficiency Rules

- Steps 4 (tests) and 5 (review): delegate to `tester` and `code-reviewer` subagents — don't inline
- Steps 8 (journal) and 9 (docs): run in **background** — don't block pipeline
- Step 2 (issues): use single `gh` command batch — avoid multiple API calls
- Skip steps early via flags to save tokens on unnecessary work
- Beta mode auto-skips: docs update (Step 9)
- Capture step outputs inline — don't re-read files already in context

## Quick Start

User says `/fis:ship` → run full pipeline → output request URL.
User says `/fis:ship beta` → ship to dev branch with lighter pipeline.
User says `/fis:ship official` → ship to main with full docs + journal.

## Output Format

```
✓ Pre-flight: branch feature/foo, 5 commits, +200/-50 lines (mode: official)
✓ Issues: linked #42, created #43
✓ Merged: origin/main (up to date)
✓ Tests: 42 passed, 0 failed
✓ Review: 0 critical, 2 informational
✓ Version: 1.2.3 → 1.2.4
✓ Changelog: updated
✓ Journal: written (background) / skipped (opt-out via --skip-journal or journal.auto)
✓ Docs: updated (background)
✓ Committed: feat(auth): add OAuth2 login flow
✓ Pushed: origin/feature/foo
✓ PR: https://github.com/org/repo/pull/123 (linked: #42, #43)
```

## Important Rules

- **Never skip tests** (unless `--skip-tests`). If tests fail, stop.
- **Never force push.** Regular `git push` only.
- **FIS QMS golive reminder.** In `official` mode, if the project is under FIS QMS (08-QD), remind that the PQA/CSC Quality Gate (SonarQube/Coverity/Black Duck/ZAP) must pass before golive — see `fis-security-scan` `references/fis-quality-gate.md`. Reminder only; never block or bypass on the project's behalf.
- **Never ask for confirmation** except for critical review issues and major/minor version bumps.
- **Auto-detect everything.** Test runner, version file, changelog format, target branch — detect from project files.
- **Framework-agnostic.** Works for Node, Python, Rust, Go, Ruby, Java, or any project with a test command.
- **Subagent delegation.** Use `tester` for tests, `code-reviewer` for review, `journal-writer` for journal, `docs-manager` for docs. Don't inline.
- **Background tasks.** Journal and docs run in background to not block the pipeline.

## Workflow Position

**Typically follows:** the installed code-review capability (ship after review passes)
**Typically precedes:** `/fis:journal` (document after shipping)
**Related:** the installed code-review capability (review before shipping), the installed test capability (test before shipping)
