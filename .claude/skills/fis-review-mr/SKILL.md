---
name: fis:review-mr
description: "Review GitLab merge requests (and GitHub PRs) for duplicate prior work, project standards, strategic necessity, correctness, security, breaking changes, and AI-slop patterns. Supports --fix and --reply."
user-invocable: true
when_to_use: "Invoke to review a merge or pull request by number/URL, optionally fixing findings and posting the review back."
category: dev-tools
keywords: [mr, merge-request, review, gitlab, glab, pr, fix, reply, ci, pipeline, conflicts, anti-slop]
argument-hint: "<MR iid or URL> [--fix] [--reply]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# Review Merge Request

Review a merge request end-to-end: intent, diff, mandatory gates, CI, and
mergeability. GitLab-first (gitlab.com and self-hosted); GitHub PRs are
supported through the same flow with `gh` equivalents.
## Modes

- **Review-only** (default): review the MR and print findings to chat. Do not
  edit, commit, or push the MR branch.
- **Fix loop** (`--fix`): review, fix actionable findings, resolve conflicts,
  commit + push via `/fis:git cp`, watch the MR pipeline to a terminal state,
  re-review. Repeat until no actionable findings remain and required CI is
  green, or a true external blocker remains.
- **Reply** (`--reply`): after the review (or after the fix loop converges),
  post the final review back to the MR as a note; approve when the verdict is
  Approve.

Flags compose: `/fis:review-mr 123 --fix --reply` runs the fix loop and posts
the final re-review at the end. Flag order does not matter.

## Provider and access detection

Detect the provider from the git remote (never hardcode a host):

```bash
REMOTE=$(git remote get-url origin)
case "$REMOTE" in
  *github.com*) PROVIDER=github ;;
  *)            PROVIDER=gitlab ;;   # gitlab.com OR any self-hosted GitLab
esac
```

For GitLab, resolve access in this order (details and exact commands in
`references/gitlab-review-commands.md`):

1. **`glab` ready** (installed AND authenticated) — use `glab mr ...`.
2. **REST API** — token from `GITLAB_TOKEN` or the stored git credential for
   the host (same resolution as `fis-git/scripts/gitlab-issue.sh`).
3. **Read-only local review** — fetch the MR head ref, diff against the target
   branch locally, print findings to chat only. `--fix` and `--reply` are
   unavailable in this tier; say so instead of failing silently.

For GitHub, use the `gh` command mapping table in the same reference.

## Context to collect

Accept the MR as an iid (`123`), `!123`, or a full URL
(`https://<host>/<group>/<project>/-/merge_requests/123`). Collect before
reviewing:

- MR metadata: title, description, author, source/target branches, head SHA,
  `detailed_merge_status`, `has_conflicts`, linked issues
- Full diff and changed-file list (gauge scope vs description claims)
- Latest MR pipeline status and failed job names

## Review instructions

### 1. Understand the MR

- Read the title, description, and linked issues.
- Compare stated scope against additions/deletions/changed files — a wide gap
  is itself a signal (see anti-slop reference).
- Extract 3–7 concrete search terms from title/body/changed API names/routes/
  files for the duplicate and prior-work checks.

### 2. Run mandatory gates

**Duplicate / prior implementation gate.** Check whether the same outcome was
already implemented, merged, opened, or rejected: search MRs and issues with
the extracted terms (commands in the reference), plus
`git log --all --grep="<terms>" --oneline -20`, and grep the codebase for
touched symbols, routes, or config keys. A merged MR that already satisfies
the outcome is an **Important** finding requesting close/retarget. A materially
overlapping open MR is **Important** unless this MR is clearly the chosen
successor.

**Project standards gate.** Prefer existing project docs in this order:
`CLAUDE.md`, `AGENTS.md`, `docs/code-standards.md`,
`docs/system-architecture.md`, then nearby module docs. If no standards doc
exists, scan the codebase and create a local `docs/code-standards.md`
baseline; in review-only mode leave it local and report it. Review against the
discovered standards, not generic best practices.

**Strategic necessity gate.** Review as the project owner, not only as a code
reviewer: does the MR create clear value (user outcome, roadmap alignment,
security, reliability, toil reduction, compliance)? Correct-but-unnecessary
work that adds maintenance burden is an **Important** product-risk finding.
If value depends on a business call, list it as an unresolved question.

### 3. Analyze the diff

Read every changed file; for modified files read the full file, not just the
hunk. Check the changes against the stated purpose.

### 4. Check for issues

- **Correctness**: logic errors, off-by-one, null dereference, swallowed
  errors, race conditions, unhandled edge cases.
- **Security**: injection (SQL/XSS/command/SSRF/path traversal), hardcoded
  secrets, missing validation at system boundaries, authz gaps.
- **Breaking changes**: API contract changes, schema changes without
  migrations, config format changes, removed/renamed public exports.
- **Code quality / AI slop**: load `references/anti-ai-slop.md` when the diff
  adds >300 lines, two or more slop signals fire, or the MR creates multiple
  new files in dumping-ground directories. Severity rule: structural slop →
  **Important**; micro slop → **Suggestion**.
- **Testing**: new paths covered, no phantom assertions, no skipped
  previously-passing tests.

### 5. Summarize findings

Report:

- **Summary** — 1–2 sentences on what the MR does.
- **Risk level** — Low / Medium / High.
- **Mandatory gates** — duplicate: clear|overlap|duplicate; standards:
  found|generated|missing; necessity: clear|questionable|not justified.
- **Findings** by severity: **Critical** (must fix before merge), **Important**
  (should fix), **Suggestion** (nice to have).
- **Verdict** — **Approve** | **Request changes** | **Comment**.

## Fix loop (`--fix`)

Do not stop at "code review clean" while merge conflicts or failing/pending
pipelines remain.

1. **Build the blocking set**: gate blockers, Critical + Important findings
   (plus concrete low-risk Suggestions in scope), merge conflicts or stale
   branch from MR metadata, failing/pending pipeline jobs with exact log
   evidence.
2. **Check out the MR head** (`glab mr checkout` or the MR head ref — see
   reference). Verify `git rev-parse HEAD` matches the MR head SHA before
   editing. A fork head without write access is an external blocker.
3. **Fix blockers** by activating `/fis:fix --auto` with the full blocking set:
   MR reference, branches, head SHA, each finding with severity/file/expected/
   actual, each failing job with its exact error, and the constraint to
   preserve MR scope. Honor every hard gate in `/fis:fix`.
4. **Resolve conflicts**: fetch, then merge or rebase the MR head against the
   target branch per repository convention; resolve in real files; run
   relevant tests. Never mark the loop complete while the MR still reports
   conflicts.
5. **Commit, push, watch CI**: use `/fis:git cp`, then watch the MR pipeline
   until every job is terminal (30-minute ceiling per head SHA unless the repo
   has a known longer CI duration). Retry only clearly transient
   infrastructure failures. Missing secrets, unavailable services, or required
   human approvals are external blockers — never weaken tests to get green.
6. **Re-review** from step 1. Stop successfully only when no actionable
   findings remain, no conflicts remain, and required CI is green. Stop
   blocked when an external blocker remains or the same blocker survives 3
   consecutive fix attempts.

## Reply (`--reply`)

- Build the review body: summary, gates, risk, findings by severity, verdict,
  and the footer `*Posted by /fis:review-mr at <ISO-8601 UTC timestamp>*`.
- **GitLab**: post the body as an MR note. When the verdict is Approve, also
  approve the MR; if the project forbids self-approval or approval fails, keep
  the note and report the downgrade. Never auto-merge from this skill.
- **GitHub**: map the verdict to `gh pr review --approve|--request-changes|--comment`;
  on a self-approval rejection, retry as `--comment`.
- If the CLI and API are both unavailable, print the review locally and say
  why posting was skipped — never fail the whole skill on a posting error.
- In `--fix --reply` mode, post only the final re-review after the loop stops;
  if the loop stopped on a blocker, include the blocker so a human can take
  over.

## Security

- Never write secrets, tokens, customer data, or private env values into MRs,
  notes, or logs; redact command output before posting.
- Never force push; never push to protected branches.
- If credentials lack a needed capability (approve, push, merge), stop and
  report the exact missing capability.

## Final output

- Verdict and the three gate results
- Iteration count and commits pushed (when `--fix` ran)
- Merge/conflict state and CI state with failed job links
- Whether `--reply` posted, downgraded, or printed locally
- Remaining findings and blockers; unresolved questions at the end

## Workflow position

**Typically follows:** `/fis:ship` (MR exists) — or reviews someone else's MR.
**Typically precedes:** merge (human or `/fis:vibe --ship`).
**Related:** `/fis:code-review` (local pending changes), `/fis:fix` (fix engine),
`/fis:git` (commit/push conventions).
