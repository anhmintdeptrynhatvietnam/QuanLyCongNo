# Frame Template

Use when framing an outcome in Step 1. The issue/PR is the system of record — everything here lives there, not in a separate document.

## Create the home first

If no issue/PR exists, create one before writing criteria:

```bash
# GitHub
gh issue create --title "<outcome, one sentence>" --body "<framing below>"

# GitLab (works for both gitlab.com and self-hosted)
glab issue create --title "<outcome, one sentence>" --description "<framing below>"
```

**GitLab without a working `glab` — graceful fallback ladder.** No `GITLAB_TOKEN` is required. Never hardcode a host; derive it from the git remote.

1. **`glab` installed AND authenticated** (`command -v glab` and `glab auth status` both succeed) — use `glab issue create` above. `glab` auto-detects the instance (incl. self-hosted) from the repo's git remote. Authenticate once per instance:
   ```bash
   glab auth login --hostname <your-gitlab-host>     # e.g. gitlab.company.internal
   ```
   Outside a repo or in CI, target the host with `GITLAB_HOST=<your-gitlab-host>` or `glab --repo <host>/<group>/<project> ...`.
2. **`glab` missing or unauthenticated → print a prefilled issue URL** for the user to open (derive the web base from the remote; handles `https://…​.git` and `git@host:group/project.git`):
   ```bash
   REMOTE=$(git remote get-url origin)
   WEB_BASE=$(printf '%s' "$REMOTE" | sed -E 's#^git@([^:]+):#https://\1/#' | sed -E 's#\.git$##')
   echo "$WEB_BASE/-/issues/new"
   ```
   Paste the framing block below into the new issue.
3. **No tracker access at all → skip the issue for now** and write the acceptance criteria straight into the PR/MR description later (Step 12 of ship). The issue/PR remains the single system of record.

Or use `/fis:git`. For a **GitLab (incl. self-hosted)** issue that also needs a **due date** or **time estimate/spent**, use the helper `claude/skills/fis-git/scripts/gitlab-issue.sh --title "..." --due YYYY-MM-DD --estimate 3d` (host/token resolved from the git remote). Link the branch/PR back to the issue so status stays in one place.

## Issue / PR framing block

Paste and fill this into the issue/PR description:

```markdown
## Outcome
<one sentence: the user or system problem this solves>

## Acceptance criteria
- [ ] AC1 <concrete, observable, testable>
- [ ] AC2 <concrete, observable, testable>
- [ ] AC3 <concrete, observable, testable>

## Out of scope
- <thing explicitly not included>

## Risk
R<1-4> — <blast radius in a few words>

## Traceability (filled at Test step)
- [ ] AC1 → <test name>
- [ ] AC2 → <test name>
```

## Good vs bad acceptance criteria

Criteria must be observable and testable. If you cannot write a test for it, it is not a criterion.

| Bad (vague) | Good (testable) |
|-------------|-----------------|
| "Rate limiting works" | "Requests over 1000/day for one API key return HTTP 429" |
| "It should be fast" | "p95 latency for `/search` stays under 300ms at 50 rps" |
| "Handle errors gracefully" | "On DB timeout the endpoint returns 503 and logs the trace id" |
| "Improve the UX" | "The checkout form shows an inline error within 200ms of an invalid email" |

Rules:
- 3–5 criteria. If you need more, the outcome is probably two outcomes — split it.
- One behavior per criterion. No "and" hiding a second requirement.
- State the observable result, not the implementation.
- Name what is out of scope explicitly; unstated scope is where creep enters.
