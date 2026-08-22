---
name: fis:git
description: "Git operations with conventional commits. Use for staging, committing, pushing, PRs, merges. Auto-splits commits by type/scope. Security scans for secrets."
user-invocable: true
when_to_use: "Invoke for commits, merge/pull requests, branch hygiene, or release git steps."
category: dev-tools
keywords: [git, commits, staging, PR, merge]
argument-hint: "cm|cp|pr|merge [args]"
metadata:
  author: fis-ai-kit
  version: "1.1.0"
---

# Git Operations

## Default (No Arguments)

If invoked without arguments, use `AskUserQuestion` to present available git operations:

| Operation | Description |
|-----------|-------------|
| `cm` | Stage files & create commits |
| `cp` | Stage files, create commits and push |
| `pr` | Create Pull Request |
| `merge` | Merge branches |

Present as options via `AskUserQuestion` with header "Git Operation", question "What would you like to do?".

Execute git workflows via `git-manager` subagent to isolate verbose output.
Activate `fis:context-engineering` skill.

**IMPORTANT:**
- Sacrifice grammar for the sake of concision.
- Ensure token efficiency while maintaining high quality.
- Pass these rules to subagents.

## Arguments
- `cm`: Stage files & create commits
- `cp`: Stage files, create commits and push
- `pr`: Create Pull Request / Merge Request [to-branch] [from-branch]
  - `to-branch`: Target branch (default: main)
  - `from-branch`: Source branch (default: current branch)
  - Provider (GitHub `gh` vs GitLab `glab`, incl. self-hosted) is auto-detected from the git remote — see `references/workflow-pr.md`
- `merge`: Merge [to-branch] [from-branch]
  - `to-branch`: Target branch (default: main)
  - `from-branch`: Source branch (default: current branch)

## Quick Reference

| Task | Reference |
|------|-----------|
| Commit | `references/workflow-commit.md` |
| Push | `references/workflow-push.md` |
| Pull Request | `references/workflow-pr.md` |
| Merge | `references/workflow-merge.md` |
| Standards | `references/commit-standards.md` |
| Safety | `references/safety-protocols.md` |
| Branches | `references/branch-management.md` |
| GitHub CLI | `references/gh-cli-guide.md` |
| Create GitLab issue (self-hosted; due date + time tracking) | `scripts/gitlab-issue.sh` |

## Core Workflow

### Step 1: Stage + Analyze
```bash
git add -A && git diff --cached --stat && git diff --cached --name-only
```

### Step 2: Security Check
Scan for secrets before commit:
```bash
git diff --cached | grep -iE "(api[_-]?key|token|password|secret|credential)"
```
**If secrets found:** STOP, warn user, suggest `.gitignore`.

### Step 3: Split Decision

**NOTE:**
- Search for related issues on the remote's tracker (GitHub or GitLab) and add to body.
- Only use `feat`, `fix`, or `perf` prefixes for files in `.claude` directory (do not use `docs`).

**Split commits if:**
- Different types mixed (feat + fix, code + docs)
- Multiple scopes (auth + payments)
- Config/deps + code mixed
- FILES > 10 unrelated

**Single commit if:**
- Same type/scope, FILES ≤ 3, LINES ≤ 50

### Step 4: Commit
```bash
git commit -m "type(scope): description"
```

## Output Format
```
✓ staged: N files (+X/-Y lines)
✓ security: passed
✓ commit: HASH type(scope): description
✓ pushed: yes/no
```

## Error Handling

| Error | Action |
|-------|--------|
| Secrets detected | Block commit, show files |
| No changes | Exit cleanly |
| Push rejected | Suggest `git pull --rebase` |
| Merge conflicts | Suggest manual resolution |
| `glab` missing/unauthenticated | Use push-option or prefilled-URL MR fallback (no CLI/token) — see `references/workflow-pr.md` |

## References

- `references/workflow-commit.md` - Commit workflow with split logic
- `references/workflow-push.md` - Push workflow with error handling
- `references/workflow-pr.md` - PR creation with remote diff analysis
- `references/workflow-merge.md` - Branch merge workflow
- `references/commit-standards.md` - Conventional commit format rules
- `references/safety-protocols.md` - Secret detection, branch protection
- `references/branch-management.md` - Naming, lifecycle, strategies
- `references/gh-cli-guide.md` - GitHub CLI commands reference
- `scripts/gitlab-issue.sh` - Create a GitLab issue (self-hosted; host/token from git remote) with due date, time estimate/spent, labels, assignee, milestone, weight, confidentiality
