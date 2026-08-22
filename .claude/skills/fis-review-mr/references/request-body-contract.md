# Evidence-rich request body contract

`fis:ship` must create/update merge request (GitLab) or pull request (GitHub)
bodies with these sections. Headings are localized to the effective writing
language; English forms shown. Read the body back from the forge after writing
it and check each required section is present and non-empty.

## Required sections

### 1. End-to-end work summary
Workflow from task/issue/plan → implementation → verification → review → ship.
Facts only; do not invent steps that did not run.

### 2. Subagent delegation
Count used. For each: role, task, status, concise result. If none: say so.

### 3. Technical decisions
Material decisions + rationale/evidence. Do not fabricate filler.

### 4. Deviations from plan
Compare to the active plan when one exists. If none/no deviations: state that.

### 5. Completion evidence
Map acceptance criteria to tests, commands, artifacts, review, CI. UI/UX changes
need relevant screenshots (or an explicit unavailable reason). Non-UI changes
must not add decorative screenshots.

### 6. Checklist
Completed vs incomplete/skipped with reasons. Never mark unknown work done.

### 7. Human actions required
Decisions, credentials, manual QA, rollout, approvals. If none: `None` (localized).

## Traceability (retain)

Fold prior ship fields into this body without duplicating facts:

- **Linked Issues** (`Closes #N` / `Relates to #N`)
- Pre-landing review outcome (under Completion evidence or Checklist)
- Test results (under Completion evidence / Checklist)
- Diff/changes summary (under Completion evidence)
- **Ship Mode** (mode + target branch)

## Review validation

- Missing required sections → **Important** findings.
- Unsupported claims / empty evidence where evidence is asserted → **Important**.
- Missing Linked Issues / Ship Mode on ship-authored requests → **Suggestion**.
- Do not pad sections; prefer honest `None` / `Not run` / `Unavailable`.
