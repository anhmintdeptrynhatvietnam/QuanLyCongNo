# Mode: to-issues — GitLab Issue export

## Required env
```bash
export GITLAB_TOKEN=<PAT api-scope>
export GITLAB_PROJECT_ID=<numeric>
```

## Mapping

| Kit document | → Issue | Labels |
|---|---|---|
| PRD | Epic | epic, prd, status |
| Story | Issue | story, status, persona |
| Bug | Issue | bug, severity, status |
| CR | Issue | cr, prd-related |
| TestSpec | Issue | test-spec, qa |

## Issue field mapping

| GitLab field | Source |
|---|---|
| Title | `<ID>: <title>` |
| Description | Body markdown |
| Labels | Frontmatter (status, type, persona, severity) |
| Milestone | `target_release` field |
| Assignee | `owner` field qua user lookup |

## Idempotency
Match qua title prefix `^<ID>: `; update thay vì create lại.
Backlink: document frontmatter `gitlab_issue_url`.

## Bidirectional sync (`--sync-back`)
Read issue state → update document `gitlab_status`.

## API examples

```bash
# Create
curl -X POST "$HOST/api/v4/projects/$PID/issues" \
  -H "PRIVATE-TOKEN: $TOKEN" \
  -d "title=US-0042: ..." \
  -d "description=..." \
  -d "labels=story,Approved"

# Update
curl -X PUT "$HOST/api/v4/projects/$PID/issues/142" \
  -H "PRIVATE-TOKEN: $TOKEN" \
  -d "labels=story,Done"
```
