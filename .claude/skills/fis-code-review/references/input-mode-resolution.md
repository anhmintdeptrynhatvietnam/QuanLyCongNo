---
name: input-mode-resolution
description: How to parse code-review arguments and resolve merge/pull request number, commit hash, pending changes, or default context into a reviewable diff
---

# Input Mode Resolution

Resolve the installed code-review skill's arguments into a diff for the review pipeline.

## Auto-Detection Rules

Parse arguments left-to-right. First match wins.

| Pattern | Mode | Example |
|---------|------|---------|
| `#\d+` | Request | `#123`, `#45` |
| Merge/pull request URL | Request | `https://<host>/<group>/<repo>/-/merge_requests/123`, `https://github.com/org/repo/pull/123` |
| `[0-9a-f]{7,40}` | Commit | `abc1234`, full SHA |
| `--pending` | Pending | explicit flag |
| `codebase` | Codebase | existing mode |
| *(none + context)* | Default | recent changes |
| *(none + no context)* | Prompt | ask user via `ask_user capability` (the `AskUserQuestion` tool on this runtime) |

## Resolution Commands

### Request Mode (merge request / pull request)

Never assume GitHub. Detect the provider from the remote first, then use the matching CLI:

```bash
REMOTE=$(git remote get-url origin)
case "$REMOTE" in
  *github.com*) PROVIDER=gh ;;
  *)            PROVIDER=glab ;;   # gitlab.com OR any self-hosted GitLab
esac

# Extract the request number from the argument
REQ_NUM=$(echo "$ARG" | grep -oE '[0-9]+$')

if [ "$PROVIDER" = "glab" ]; then
  glab mr view "$REQ_NUM" --output json          # metadata
  glab mr diff "$REQ_NUM"                        # full diff
  glab mr diff "$REQ_NUM" --raw | grep '^diff --git'   # changed files
else
  gh pr view "$REQ_NUM" --json title,body,files,additions,deletions,baseRefName,headRefName
  gh pr diff "$REQ_NUM"
  gh pr diff "$REQ_NUM" --name-only
fi
```

For the full GitLab merge-request review flow (gates, CI, threads), hand off to
the installed provider review skill (`/fis:review-mr`) and read it for exact commands.

**Context passed to reviewers:**
- Request title and description (intent)
- Base branch (what it merges into)
- Full diff
- Changed file list for scout

### Commit Mode

```bash
# Validate commit exists
git cat-file -t "$COMMIT_HASH"

# Get commit metadata
git log -1 --format="%H%n%s%n%b" "$COMMIT_HASH"

# Get the diff
git show "$COMMIT_HASH" --stat
git show "$COMMIT_HASH" -- # full diff

# Changed files
git show "$COMMIT_HASH" --name-only --format=""
```

**Context passed to reviewers:**
- Commit message (intent)
- Parent commit (what it changed from)
- Full diff
- Changed file list for scout

### Pending Mode

```bash
# Staged changes
git diff --cached

# Unstaged changes
git diff

# Combined (staged + unstaged vs HEAD)
git diff HEAD

# Changed files
git diff HEAD --name-only

# Status overview
git status --short
```

**Context passed to reviewers:**
- No commit message yet — ask user for brief intent description
- Combined diff (staged + unstaged)
- Changed file list for scout

### Default Mode

Use recent changes already in conversation context. If no changes apparent, fall back to Prompt mode.

### Prompt Mode

When no arguments and no recent context, use `ask_user capability`:
- Header: "Review Target"
- Question: "What would you like to review?"
- Options: Pending changes, Enter request number, Enter commit hash, Full codebase scan, Parallel codebase audit

For request/commit options, follow up with a second `ask_user capability` to get the number/hash.

### Codebase Mode

Codebase modes bypass diff resolution — they scan the full codebase instead.
- `codebase` → hand off to `references/codebase-scan-workflow.md`
- `codebase parallel` → hand off to `references/parallel-review-workflow.md`

Both workflows include code quality review, always-on adversarial review, and final verification.

## Pipeline Handoff

After resolving the diff, pass to the review pipeline:

```
Resolved diff
  ├─ Changed files → Edge case scout
  ├─ Full diff → Stage 1 (Spec compliance, if plan exists)
  ├─ Full diff → Stage 2 (Code quality review)
  ├─ Full diff + findings → Stage 3 (Adversarial review)
  └─ Findings → Fix accepted issues and verify
```

## Error Handling

| Error | Action |
|-------|--------|
| Request not found | Provider `view` command fails → report "Request #N not found in this repo" |
| Provider CLI missing/unauthenticated | Fall back to `git diff <base>...<head>` on the fetched branch, note the degraded context |
| Commit not found | `git cat-file` fails → report "Commit not found — is it pushed?" |
| No pending changes | `git diff HEAD` empty → report "No pending changes to review" |
| Ambiguous input | Could be request or commit → prefer request (more common), note assumption |
