# GitLab Pipeline Commands

Command cookbook for `/fis:vibe`. Provider is detected from the git remote
(same rule as `fis-git`): `*github.com*` → GitHub (`gh`), everything else →
GitLab (`glab` or REST API, including self-hosted).

Token fallback when `glab` is missing or unauthenticated: `GITLAB_TOKEN`, else
the stored git credential for the host — identical resolution to
`fis-git/scripts/gitlab-issue.sh`. Use `glab auth status` to check readiness.

## Repo and issue intake

| Task | GitLab | GitHub |
|------|--------|--------|
| Resolve repo + default branch | `glab repo view --output json` (or parse the remote URL) | `gh repo view --json nameWithOwner,defaultBranchRef` |
| Read issue + discussion | `glab issue view <iid> --output json` and `glab issue view <iid> --comments` | `gh issue view <n> --comments` |
| Create issue (natural-language input) | `fis-git/scripts/gitlab-issue.sh --title "..." --description "..." [--due YYYY-MM-DD] [--estimate 3h] [--labels a,b]` | `gh issue create --title "..." --body "..."` |
| Post execution note | `glab issue note <iid> -m "<body>"` | `gh issue comment <n> --body "<body>"` |

Issue URL forms: `https://<host>/<group>/<project>/-/issues/<iid>` (GitLab),
`https://github.com/<owner>/<repo>/issues/<n>` (GitHub). Compare the URL's
project against the current remote before starting; mismatch = stop and ask.

## Pipeline labels

Create each label only if missing (list first — creation of an existing label
errors on both providers):

```bash
# GitLab
glab label list --output json | grep -q '"ready to craft"' \
  || glab label create --name "ready to craft" --color "#0E8A16" \
       --description "Plan validated; ready for /fis:craft or /fis:fix"
```

Same pattern for `in progress` (`#FBCA04`), `ready to ship stable`
(`#5319E7`), and `ready to ship beta` (`#1D76DB`). API fallback:
`POST /projects/:id/labels` with `name`, `color`, `description`.

Label transitions on the issue:

```bash
# GitLab: --unlabel removes, --label adds (both idempotent)
glab issue update <iid> --label "in progress" --unlabel "ready to craft"
# GitHub
gh issue edit <n> --add-label "in progress" --remove-label "ready to craft"
```

If a label update fails for any reason other than the label being absent, stop
the pipeline and report the exact CLI/API error.

## Merge (--ship only)

```bash
# GitLab — prefer auto-merge so required pipelines gate the merge
glab mr merge <iid> --auto-merge --remove-source-branch
# Older glab releases use --when-pipeline-succeeds instead of --auto-merge.
# Respect repo convention for --squash; never force anything.

# GitHub
gh pr merge <n> --auto
```

API fallback: `PUT /projects/:id/merge_requests/:iid/merge` with
`merge_when_pipeline_succeeds=true`. Branch protection and required approvals
always win — a refusal is an external blocker, not something to bypass.

## CI watch after merge

Watch the target-branch pipeline for the merge commit:

```bash
# GitLab
glab ci status --branch "<target-branch>"          # current status
glab api "projects/:id/pipelines?ref=<target-branch>&sha=<merge-commit-sha>"
glab ci trace <job-id>                             # failed job log

# GitHub
gh run list --branch "<target-branch>" --commit <merge-commit-sha>
gh run view <run-id> --log
```

Poll until every job is terminal, bounded by the repository's normal CI
duration (30-minute ceiling per commit when unknown). Retry
(`glab ci retry <job-id>` / `gh run rerun <run-id> --failed`) only for clearly
transient infrastructure failures — never to hide a deterministic failure.

## Post-merge fix loop evidence

When CI fails deterministically, hand `/fis:fix --auto` the exact evidence:

- pipeline/job IDs and web URLs
- the failing job name, stage, and the exact failing command + error from the
  trace
- the merge commit SHA and target branch

The follow-up branch ships through the same `/fis:ship` → `/fis:review-mr`
path as the original change.
