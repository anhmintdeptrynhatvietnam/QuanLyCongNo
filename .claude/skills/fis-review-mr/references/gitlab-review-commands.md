# GitLab MR Review Commands

Command cookbook for `/fis:review-mr`. GitLab-first with the same fallback
philosophy as `fis-git`: `glab` when ready, REST API with an existing token
otherwise, read-only local review as the last resort.

## Resolve MR reference

Accept `123`, `!123`, or a URL. From a URL, parse host, project path, and iid:

```bash
# https://<host>/<group>/<project>/-/merge_requests/<iid>
MR_URL="$1"
HOST=$(printf '%s' "$MR_URL" | sed -E 's#^https?://([^/]+)/.*#\1#')
PROJPATH=$(printf '%s' "$MR_URL" | sed -E 's#^https?://[^/]+/(.+)/-/merge_requests/.*#\1#')
IID=$(printf '%s' "$MR_URL" | sed -E 's#.*/-/merge_requests/([0-9]+).*#\1#')
```

If only an iid is given, derive host/project from the git remote (same parsing
as `fis-git/scripts/gitlab-issue.sh`). If the URL's project differs from the
current repo, stop and ask the user to switch repos.

## Tier 1 — glab ready

```bash
GLAB_READY=false
command -v glab >/dev/null 2>&1 && glab auth status >/dev/null 2>&1 && GLAB_READY=true
```

| Task | Command |
|------|---------|
| MR metadata (JSON) | `glab mr view "$IID" --output json` |
| MR diff | `glab mr diff "$IID"` |
| Changed files | `glab mr diff "$IID" --raw \| grep '^diff --git'` |
| Check out MR head | `glab mr checkout "$IID"` |
| Pipeline status for MR branch | `glab ci status --branch "<source-branch>"` |
| Job log | `glab ci trace <job-id>` |
| Retry transient job | `glab ci retry <job-id>` |
| Post note (review body) | `glab mr note "$IID" -m "<body>"` |
| Approve | `glab mr approve "$IID"` |
| Search MRs (duplicate gate) | `glab mr list --all --search "<terms>"` |
| Search issues (duplicate gate) | `glab issue list --all --search "<terms>"` |
| Raw API escape hatch | `glab api "projects/:id/merge_requests/$IID"` |

`glab` auto-detects the instance (including self-hosted) from the remote. One-
time auth per instance: `glab auth login --hostname <host-from-remote>`.

## Tier 2 — REST API (no glab)

Token resolution — `GITLAB_TOKEN`, else the stored git credential:

```bash
TOKEN="${GITLAB_TOKEN:-}"
[ -z "$TOKEN" ] && TOKEN=$(printf "protocol=https\nhost=%s\n\n" "$HOST" \
  | git credential fill 2>/dev/null | sed -n 's/^password=//p')
API="https://$HOST/api/v4"
PROJ=$(printf '%s' "$PROJPATH" | sed 's#/#%2F#g')
AUTH=(--header "PRIVATE-TOKEN: $TOKEN")
```

| Task | Endpoint |
|------|----------|
| MR metadata (incl. `detailed_merge_status`, `has_conflicts`, `head_pipeline`) | `GET $API/projects/$PROJ/merge_requests/$IID` |
| MR diffs | `GET $API/projects/$PROJ/merge_requests/$IID/diffs` (older GitLab: `/changes`) |
| MR pipelines | `GET $API/projects/$PROJ/merge_requests/$IID/pipelines` |
| Pipeline jobs | `GET $API/projects/$PROJ/pipelines/<pipeline-id>/jobs` |
| Job log | `GET $API/projects/$PROJ/jobs/<job-id>/trace` |
| Post note | `POST $API/projects/$PROJ/merge_requests/$IID/notes` with `body=` |
| Approve | `POST $API/projects/$PROJ/merge_requests/$IID/approve` |
| Rebase (stale branch) | `PUT $API/projects/$PROJ/merge_requests/$IID/rebase` |
| Search MRs | `GET $API/projects/$PROJ/merge_requests?state=all&search=<terms>` |
| Search issues | `GET $API/projects/$PROJ/issues?state=all&search=<terms>` |

## Tier 3 — read-only local review (no CLI, no token)

GitLab exposes every MR head as a virtual ref. This supports review-only mode:

```bash
git fetch origin "merge-requests/$IID/head:mr-$IID"
git log "origin/<target-branch>..mr-$IID" --oneline
git diff "origin/<target-branch>...mr-$IID"
```

Findings print to chat only. `--fix` needs push access to the source branch;
`--reply` needs Tier 1 or 2. State the limitation instead of failing.

## Checking out the head for --fix

Prefer `glab mr checkout "$IID"`. Without glab:

```bash
git fetch origin "merge-requests/$IID/head:mr-$IID"
git checkout mr-$IID
git rev-parse HEAD   # must equal the MR head SHA from metadata
```

Pushing fixes requires the real source branch (from MR metadata `source_branch`)
and write access to its project. A fork source without write access is an
external blocker — do not commit to a detached local copy and claim success.

## Merge-state semantics

From MR metadata:

- `detailed_merge_status: "mergeable"` — clean.
- `has_conflicts: true` or `detailed_merge_status: "conflict"` — resolve
  conflicts (merge or rebase target into source per repo convention).
- `detailed_merge_status: "ci_still_running"` / `"ci_must_pass"` — watch the
  pipeline before verdict in `--fix` mode.
- `merge_status` is the legacy field on older GitLab; read it when
  `detailed_merge_status` is absent.

## GitHub mapping (when the remote is github.com)

| GitLab | GitHub |
|--------|--------|
| `glab mr view --output json` | `gh pr view --json title,body,baseRefName,headRefName,headRefOid,mergeStateStatus,files,statusCheckRollup` |
| `glab mr diff` | `gh pr diff` |
| `glab mr checkout` | `gh pr checkout` |
| `glab ci status` / `glab ci trace` | `gh pr checks` / `gh run view --log` |
| `glab mr note` + `glab mr approve` | `gh pr review --comment\|--approve\|--request-changes --body-file -` |
| `glab mr list --search` | `gh pr list --state all --search` |
| MR head ref `merge-requests/<iid>/head` | PR head ref `pull/<n>/head` |

GitHub caps review bodies at ~65,536 chars — truncate the findings section
past 60,000 chars with a `[truncated — N findings omitted; see local output]`
marker. GitLab notes have a much higher limit; apply the same 60,000-char cap
anyway so the note stays readable.
