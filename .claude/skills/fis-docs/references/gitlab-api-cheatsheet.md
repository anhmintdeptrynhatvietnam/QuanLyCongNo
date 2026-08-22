# GitLab API Cheatsheet

## Auth
```bash
export GITLAB_TOKEN="glpat_xxx"
export GITLAB_HOST="https://gitlab.example.com"
export PROJECT_ID=12345
```

## Create issue
```bash
curl -X POST "$GITLAB_HOST/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -d '{
    "title": "US-0042: Login với Azure AD",
    "description": "Body...",
    "labels": "story,Ready",
    "assignee_ids": [123],
    "milestone_id": 5,
    "due_date": "2026-06-30"
  }'
# Response: { id, iid, web_url, ... }
```

## Find issue (idempotency)
```bash
curl "$GITLAB_HOST/api/v4/projects/$PROJECT_ID/issues?search=US-0042" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN"

curl "$GITLAB_HOST/api/v4/projects/$PROJECT_ID/issues?labels=story" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN"
```

## Update issue
```bash
curl -X PUT "$GITLAB_HOST/api/v4/projects/$PROJECT_ID/issues/142" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -d '{"labels": "story,Approved", "description": "Updated..."}'
```

## Add label without replacing
```bash
curl -X PUT ".../issues/142" -d '{"add_labels": "blocker"}'
```

## Close issue
```bash
curl -X PUT ".../issues/142" -d '{"state_event": "close"}'
```

## Find user
```bash
curl "$GITLAB_HOST/api/v4/users?username=alice"
# Response: [{ id, username, ... }]
```

## Add comment
```bash
curl -X POST ".../issues/142/notes" \
  -d '{"body": "Synced from kit at 2026-05-02"}'
```

## Gotchas
- `iid` (project-scoped) ≠ `id` (global) — use `iid` trong URL
- Labels: comma-separated string
- Markdown: GitLab Flavored Markdown
- Rate limit: ~600 req/min authenticated
