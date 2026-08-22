# Pull Request Workflow

Execute via `git-manager` subagent.

## Variables
- TO_BRANCH: target (defaults to `main`)
- FROM_BRANCH: source (defaults to current branch)

## CRITICAL: Use REMOTE diff
PRs based on remote branches. Local diff includes unpushed changes.

## Tool 1: Sync + Analyze

**IMPORTANT: Always merge `main` (or any default branch) to current branch first.**

```bash
git fetch origin && \
git push -u origin HEAD 2>/dev/null || true && \
BASE=${BASE_BRANCH:-main} && \
HEAD=$(git rev-parse --abbrev-ref HEAD) && \
echo "=== PR: $HEAD → $BASE ===" && \
echo "=== COMMITS ===" && \
git log origin/$BASE...origin/$HEAD --oneline && \
echo "=== FILES ===" && \
git diff origin/$BASE...origin/$HEAD --stat
```

**If "Branch not on remote":** Push first, retry.

## Tool 2: Generate Content
**Title:** Conventional commit format, <72 chars, NO version numbers
**Body:** Summary bullets + Test plan checklist

## Tool 3: Detect provider

Do not assume GitHub. Detect from the remote and use the matching CLI:

```bash
REMOTE=$(git remote get-url origin)
case "$REMOTE" in
  *github.com*) PROVIDER=gh ;;
  *)            PROVIDER=glab ;;   # gitlab.com OR any self-hosted GitLab
esac
echo "provider: $PROVIDER ($REMOTE)"
```

`glab` auto-detects the instance (including self-hosted) from this remote — no host flag needed inside the repo. It only needs a one-time auth per instance: `glab auth login --hostname <host-from-remote>`. Never hardcode a host; derive it from the remote or `GITLAB_HOST`.

### GitLab readiness check

`glab` may be missing OR installed-but-unauthenticated. Check BOTH before using it:

```bash
GLAB_READY=false
if command -v glab >/dev/null 2>&1 && glab auth status >/dev/null 2>&1; then
  GLAB_READY=true
fi
if [ "$PROVIDER" = glab ] && [ "$GLAB_READY" = false ]; then
  echo "glab missing/unauthenticated → use push-option or prefilled-URL fallback"
fi
```

## Tool 4: Create PR / MR

**GitHub:**
```bash
gh pr create --base $BASE --head $HEAD --title "..." --body "$(cat <<'EOF'
## Summary
- Bullet points

## Test plan
- [ ] Test item
EOF
)"
```

**GitLab (gitlab.com and self-hosted) — graceful fallback ladder.** No `GITLAB_TOKEN` is required for any tier; tiers 2–3 reuse the git credentials that already authorized the push.

**Tier 1 — `glab` installed AND authenticated (`GLAB_READY=true`):** `glab` auto-detects the self-hosted instance from the remote.
```bash
glab mr create --target-branch "$BASE" --source-branch "$HEAD" [--draft] --title "..." --description "$(cat <<'EOF'
## Summary
- Bullet points

## Test plan
- [ ] Test item
EOF
)"
```

**Tier 2 — `glab` missing or unauthenticated → GitLab push options** (no CLI, no token). Only usable when the push actually **updates the remote ref**:
```bash
git push origin HEAD \
  -o merge_request.create \
  -o merge_request.target="$BASE" \
  -o merge_request.draft \
  -o merge_request.title="..." \
  -o merge_request.description="..."
```
**CRITICAL:** push options are processed only when the push updates the remote ref. If the branch is already current ("Everything up-to-date"), GitLab will NOT create the MR. Use push options only **when pushing new commits**; if the branch is already fully pushed, use Tier 3. Drop `-o merge_request.draft` when a draft is not wanted.

**Tier 3 — branch already pushed / push options unavailable / older GitLab → prefilled MR URL** for the user to click. Derive the web base from the remote (handles both `https://host/group/project.git` and `git@host:group/project.git`; strips trailing `.git`):
```bash
REMOTE=$(git remote get-url origin)
WEB_BASE=$(printf '%s' "$REMOTE" \
  | sed -E 's#^git@([^:]+):#https://\1/#' \
  | sed -E 's#\.git$##')
echo "$WEB_BASE/-/merge_requests/new?merge_request%5Bsource_branch%5D=$HEAD&merge_request%5Btarget_branch%5D=$BASE"
```
Tell the user to open the printed URL and tick **"Mark as draft"** if a draft is wanted.

## DO NOT use (local comparison)
- ❌ `git diff main...HEAD`
- ❌ `git diff --cached`
- ❌ `git status`

## Error Handling

| Error | Action |
|-------|--------|
| Branch not on remote | `git push -u origin HEAD`, retry |
| Empty diff | Warn: "No changes for PR" |
| Push rejected | `git pull --rebase`, resolve, push |
| No upstream | `git push -u origin HEAD` |
| `glab` missing or unauthenticated | Skip Tier 1: use Tier 2 push options when pushing new commits, else Tier 3 prefilled MR URL (no CLI/token needed) |
| `glab` not authenticated (self-hosted) | `glab auth login --hostname <host-from-remote>`, retry — or use the push-option / prefilled-URL fallback |
| Push options ignored ("Everything up-to-date") | Ref unchanged, so no MR created — use Tier 3 prefilled MR URL |
| Wrong GitLab host detected | Set `GITLAB_HOST=<host>` or pass `glab --repo <host>/<group>/<project>` |
