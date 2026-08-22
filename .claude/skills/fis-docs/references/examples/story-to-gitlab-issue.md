# Walkthrough: Story → GitLab Issue

## Input
`docs/stories/US-0042.md` Approved:

```yaml
---
id: US-0042
type: story
title: "Login với Azure AD"
status: Approved
priority: Must
story_points: 5
persona: teller
parents: [EP-0001, TRD-0001]
target_release: "2026-Q3"
owner: marcus@fis.vn
---
```

## Skill action

### Step 1: Idempotency check
```bash
curl "$HOST/api/v4/projects/$PID/issues?search=US-0042" \
  -H "PRIVATE-TOKEN: $TOKEN"
# Response: [] → create new
```

### Step 2: Lookup assignee + milestone
```bash
curl "$HOST/api/v4/users?username=marcus"
# {id: 87}

curl "$HOST/api/v4/projects/$PID/milestones?title=2026-Q3"
# {id: 12}
```

### Step 3: Create issue
```bash
curl -X POST "$HOST/api/v4/projects/$PID/issues" \
  -H "PRIVATE-TOKEN: $TOKEN" \
  -d '{
    "title": "US-0042: Login với Azure AD",
    "description": "<body>",
    "labels": "story,Approved,persona:teller,priority:Must,points:5",
    "assignee_ids": [87],
    "milestone_id": 12
  }'
# Response: { iid: 142, web_url: "..." }
```

### Step 4: Update document backlink
Edit US-0042.md frontmatter:
```yaml
gitlab_issue_url: "https://gitlab.example.com/.../issues/142"
gitlab_issue_iid: 142
gitlab_synced_at: "2026-05-02T15:30:00+07:00"
```

### Step 5: Output
```
✓ US-0042 → GitLab Issue #142
  URL: ...
  Labels: story, Approved, persona:teller
  Assignee: marcus
  Milestone: 2026-Q3
```

## Re-run idempotent
```
ℹ Existing issue #142 found, updating
✓ Updated description + labels
```

## Sync back (`--sync-back`)
Reads issue state → update document `gitlab_state`, `owner` if changed.
