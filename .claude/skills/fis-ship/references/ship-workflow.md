# Ship Workflow — Detailed Steps

## Step 1: Pre-flight

1. Check current branch: `git branch --show-current`
   - If on target branch (main/master/dev): **ABORT** — "Ship from a feature branch, not the target branch."
2. Determine ship mode from arguments:
   - `official` → target = auto-detect default branch (main/master)
   - `beta` → target = auto-detect dev branch (dev/beta/develop)
   - No argument → infer from branch name:
     - `feature/* hotfix/* bugfix/*` → official
     - `dev/* beta/* experiment/*` → beta
     - Unclear → `ask_user capability` with options: "Official (main)", "Beta (dev)"
3. Auto-detect target branch:
   ```bash
   # For official: detect default branch
   git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'
   # Fallback
   git rev-parse --verify origin/main 2>/dev/null && echo "main" || echo "master"

   # For beta: detect dev branch
   for b in dev beta develop; do
     git rev-parse --verify origin/$b 2>/dev/null && echo "$b" && break
   done
   ```
4. Run `git status` (never use `-uall`). Uncommitted changes are always included.
5. Run `git diff <target>...HEAD --stat` and `git log <target>..HEAD --oneline` to understand what's being shipped.
6. If `--dry-run`: output what would happen at each step and stop here.

## Step 2: Link Issues

Find or create related issues for traceability. Provider is auto-detected in Step 12 (`gh` for GitHub, `glab` for gitlab.com and self-hosted); use the matching CLI here too.

1. Search for related open issues by keywords from branch name and commit messages:
   ```bash
   # Extract keywords from branch name
   BRANCH=$(git branch --show-current)
   KEYWORDS=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/ /g' | tr '[:upper:]' '[:lower:]')

   # Search existing issues
   gh issue list --state open --limit 10 --search "$KEYWORDS"          # GitHub
   glab issue list --all --search "$KEYWORDS" 2>/dev/null | head       # GitLab (incl. self-hosted)
   ```

2. Also check if any issues are referenced in commit messages:
   ```bash
   git log <target>..HEAD --oneline | grep -oE '#[0-9]+' | sort -u
   ```

3. **If related issues found:** Note issue numbers for PR linking.

4. **If NO related issues found:** Create a new issue with structured format (GitHub `gh issue create`; GitLab `glab issue create --title ... --description ...`):
   ```bash
   gh issue create --title "<type>: <summary from commits>" --body "$(cat <<'EOF'
   ## Problem Statement
   <infer from diff and commit messages>

   ## Proposal
   <summarize the implementation approach>

   ## How It Works
   <describe key changes with bullet points>

   ### Architecture
   ```
   <ASCII diagram of component interactions>
   ```

   ## Challenges
   - <potential edge cases or risks>

   ## Plan & Phases
   - [x] Implementation complete
   - [x] Tests passing
   - [ ] Code review approved
   - [ ] Merged to <target>

   ## Human Review Tasks
   - [ ] Verify business logic correctness
   - [ ] Check for edge cases not covered by tests
   - [ ] Validate UX/API contract changes (if any)
   EOF
   )"
   ```

5. Store issue numbers for Step 12 (PR creation).

## Step 3: Merge target branch

Fetch and merge so tests run against the merged state:

```bash
git fetch origin <target> && git merge origin/<target> --no-edit
```

- **If merge conflicts:** Try auto-resolve simple ones (lockfiles, version files). For complex conflicts, **STOP** and show them.
- **If already up to date:** Continue silently.

## Step 4: Run Tests

**Skip if:** `--skip-tests` flag.

1. Auto-detect test command (see `auto-detect.md`)
2. Delegate to `tester` subagent — don't inline test execution
3. Check pass/fail from agent result

- **If any test fails:** Show failures and **STOP**. Do not proceed.
- **If all pass:** Note counts briefly and continue.
- **If no test runner detected:** Use `ask_user capability` — "No test runner detected. Skip tests or provide command?"

## Step 5: Pre-Landing Review

**Skip if:** `--skip-review` flag.

1. Run `git diff origin/<target>` to get the full diff
2. Delegate to `code-reviewer` subagent with the diff
3. Two-pass model:
   - **Pass 1 (CRITICAL):** Security, injection, race conditions, auth bypass
   - **Pass 2 (INFORMATIONAL):** Dead code, magic numbers, test gaps, style

4. **Output findings:**
   ```
   Pre-Landing Review: N issues (X critical, Y informational)
   ```

5. **If critical issues found:** For EACH critical issue, use `ask_user capability`:
   - Problem description with `file:line`
   - Recommended fix
   - Options: A) Fix now (recommended), B) Acknowledge and ship, C) False positive — skip

6. **If user chose Fix (A):** Apply fixes, commit fixed files, then **re-run tests** (Step 4) before continuing.
7. **If only informational:** Include in PR body, continue.
8. **If no issues:** Output "No issues found." and continue.

## Step 6: Version Bump (conditional)

1. Auto-detect version source (see `auto-detect.md`)
2. If no version file found: **skip silently**
3. Auto-decide bump level from diff size:
   - **< 50 lines:** patch bump
   - **50+ lines:** patch bump (default safe choice)
   - **Major feature or breaking change:** Use `ask_user capability` — "This looks like a significant change. Bump minor or patch?"
4. For beta mode: use prerelease suffix (e.g., `1.2.4-beta.1`)
5. Write new version to detected file

## Step 7: Changelog (conditional)

1. Check for CHANGELOG.md or CHANGES.md
2. If not found: **skip silently**
3. Auto-generate entry from ALL commits on branch:
   - `git log <target>..HEAD --oneline` for commit list
   - `git diff <target>...HEAD` for full diff context
4. Categorize into: Added, Changed, Fixed, Removed
5. Insert after file header, dated today
6. Format: `## [X.Y.Z] - YYYY-MM-DD`

**Do NOT ask user to describe changes.** Infer from diff and commits.

## Step 8: Journal (background)

**Skip if:** `--skip-journal` flag.

Write a technical journal entry capturing this ship session. Run as **background task** to not block pipeline.

1. Invoke `/fis:journal` skill via `journal-writer` subagent in background:
   - Topic: summary of shipped changes (from commit messages + diff stats)
   - Include: what was shipped, key decisions, technical challenges encountered
   - Output: saved to `./docs/journals/` directory
2. Don't wait for completion — continue to next step immediately.

## Step 9: Docs Update (conditional, background)

**Skip if:** `--skip-docs` flag OR ship mode is `beta`.

Update project documentation for official releases. Run as **background task**.

1. Invoke `/fis:docs update` skill via `docs-manager` subagent in background:
   - Analyzes code changes since last release
   - Updates relevant docs in `./docs/` directory
2. Don't wait for completion — continue to next step immediately.

## Step 10: Commit

1. Stage all changes: `git add -A`
2. Security check: scan staged diff for secrets (API keys, tokens, passwords)
   - If secrets found: **STOP**, warn user, suggest `.gitignore`
3. Compose commit message:
   - Format: `type(scope): description`
   - Infer type from changes (feat/fix/refactor/chore)
   - If version + changelog present, include in same commit
4. Commit:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

Brief body describing the changes.
EOF
)"
```

## Step 11: Push

```bash
git push -u origin $(git branch --show-current)
```

- **Never force push.**
- If push rejected: suggest `git pull --rebase` and retry once.

## Step 12: Create PR / MR

Detect the provider from the git remote — do not assume GitHub:
```bash
REMOTE=$(git remote get-url origin)
case "$REMOTE" in
  *github.com*) PROVIDER=gh ;;
  *)            PROVIDER=glab ;;   # gitlab.com OR any self-hosted GitLab
esac
which "$PROVIDER" 2>/dev/null || echo "MISSING"
```

Create the PR/MR targeting the correct branch:

**GitHub:**
```bash
gh pr create --base <target-branch> --title "<type>: <summary>" --body "$(cat <<'EOF'
<PR body from pr-template.md>
EOF
)"
```
If `gh` is missing: output "Install the gh CLI to auto-create the PR" and stop after push.

**GitLab (gitlab.com and self-hosted) — graceful fallback ladder.** No `GITLAB_TOKEN` is required; tiers 2–3 reuse the git credentials that already authorized the push. Full detail in `fis-git/references/workflow-pr.md`.

1. **`glab` installed AND authenticated** (`command -v glab` and `glab auth status` both succeed) — `glab` auto-detects the self-hosted instance from the remote:
   ```bash
   glab mr create --target-branch <target-branch> [--draft] --title "<type>: <summary>" --description "$(cat <<'EOF'
   <PR body from pr-template.md>
   EOF
   )"
   ```
2. **`glab` missing or unauthenticated → GitLab push options** (no CLI, no token). Works only when the push updates the remote ref, so use it **when pushing new commits** (combine with Step 11):
   ```bash
   git push origin HEAD \
     -o merge_request.create \
     -o merge_request.target=<target-branch> \
     -o merge_request.draft \
     -o merge_request.title="<type>: <summary>" \
     -o merge_request.description="<short summary>"
   ```
   CRITICAL: if the push reports "Everything up-to-date" the ref did not change and NO MR is created — fall through to tier 3. Drop `-o merge_request.draft` when not shipping a draft.
3. **Branch already pushed / push options unavailable / older GitLab → prefilled MR URL** (derive the web base from the remote; handles `https://…​.git` and `git@host:group/project.git`):
   ```bash
   REMOTE=$(git remote get-url origin)
   WEB_BASE=$(printf '%s' "$REMOTE" | sed -E 's#^git@([^:]+):#https://\1/#' | sed -E 's#\.git$##')
   HEAD=$(git rev-parse --abbrev-ref HEAD)
   echo "$WEB_BASE/-/merge_requests/new?merge_request%5Bsource_branch%5D=$HEAD&merge_request%5Btarget_branch%5D=<target-branch>"
   ```
   Tell the user to open the URL and tick "Mark as draft" if wanted.

**Link issues** collected from Step 2: add closing keywords in the body (e.g. "Closes #42, Relates to #43") — same syntax on GitHub and GitLab.

**Output the PR/MR URL** — this is the final output the user sees.

If a PR/MR already exists for this branch, update it instead: `gh pr edit ...` (GitHub) or `glab mr update ...` (GitLab).
