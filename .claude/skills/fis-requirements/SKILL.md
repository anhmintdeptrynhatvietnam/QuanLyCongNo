---
name: fis:requirements
description: "Capture lightweight requirements directly into the issue and acceptance criteria. Use before planning when the outcome needs explicit, stakeholder-aligned requirements rather than informal notes."
user-invocable: true
when_to_use: "Invoke when an outcome needs explicit, stakeholder-aligned requirements before planning."
category: utilities
keywords: [requirements, acceptance-criteria, issue, elicitation, specification]
argument-hint: "[issue-url|issue-id|description] [--elicit|--fast]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# Requirements — Lightweight Capture

Capture what the outcome must achieve directly into the issue / PR, replacing heavyweight PRD/SOD documents.

**Use when:** the outcome has unclear, contested, or stakeholder-dependent requirements that need explicit capture before planning.

**Skip when:** requirements are clear and already reflected in the issue description.

## Usage

```
/fis:requirements <issue-url or description>
/fis:requirements <issue-url> --elicit   # Run structured elicitation first
/fis:requirements <issue-url> --fast     # Quick AC capture, skip elicitation
```

**Example:**
```
/fis:requirements https://github.com/org/repo/issues/421
/fis:requirements "Rate limiting for payments API" --elicit
```

## Workflow

### Step 1 — Understand Context

Read the issue / PR description. Identify:
- Who is affected (user, system, team)
- What behaviour is expected vs. current
- What constraints apply (performance, security, compliance)

### Step 2 — Elicit (Optional, `--elicit` flag)

Use `/fis:elicit` to run a structured discovery session:
- JTBD interview to uncover the real motivation
- Event Storming for complex domain flows
- Impact Mapping to align to business goals

### Step 3 — Capture Acceptance Criteria

Write 3–7 concrete, testable acceptance criteria directly into the issue / PR:

```markdown
## Acceptance Criteria

- [ ] Given [context], when [action], then [outcome]
- [ ] Rate limiting rejects requests beyond 100/min with 429 status
- [ ] Existing authenticated requests under the limit are unaffected
- [ ] Limit counters reset at the top of each minute
```

Each criterion must be:
- **Testable** — a passing test or CI check can prove it
- **Specific** — no "should be fast" — use measurable bounds
- **Independent** — each maps to one verifiable behaviour

### Step 4 — Identify Edge Cases and Constraints

Note any non-functional requirements and boundary conditions:
- Error handling requirements
- Performance or latency bounds
- Security or compliance constraints
- Backward-compatibility requirements

### Step 5 — Handoff to Planning

The enriched issue is the input to `/fis:plan`. The acceptance criteria become the plan's success criteria.

## Output

No separate document is created. The issue / PR is updated in place with:
- Refined description (if needed)
- Acceptance criteria checklist
- Edge case and constraint notes

## References

- `/fis:elicit` — structured discovery using JTBD, Event Storming, Impact Mapping
- `/fis:scenario` — generate comprehensive edge-case scenarios from the AC
- `/fis:architecture` — capture design decisions when requirements reveal architectural trade-offs

## Workflow Position

**Typically follows:** `/fis:elicit` (structured discovery) or `/fis:outcome` (outcome framing)
**Typically precedes:** `/fis:plan` (scoped phased plan using the AC)
**Related:** `/fis:architecture` (design decisions for the same outcome), `/fis:scenario` (edge-case generation)
