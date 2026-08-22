---
name: fis:architecture
description: "Capture design decisions and ADR-lite records for an outcome. Use when an outcome requires a non-trivial architectural choice that should be documented for future maintainers."
user-invocable: true
when_to_use: "Invoke when an outcome carries a non-trivial design decision worth recording for future maintainers."
category: utilities
keywords: [architecture, adr, design-decision, trade-off, technical-design]
argument-hint: "[outcome-or-decision-context] [--fast|--full-adr]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# Architecture — ADR-lite Design Decisions

Capture the architectural decision for one outcome in a lightweight, durable format.

**Use when:** the outcome involves a non-trivial architectural choice — technology selection, pattern choice, schema design, API contract, or integration approach — that future maintainers need to understand.

**Skip when:** the outcome is straightforward with one obvious implementation path.

## Usage

```
/fis:architecture <context>
/fis:architecture <context> --full-adr   # Structured ADR with Drivers / Options / Decision / Consequences
/fis:architecture <context> --fast       # One-paragraph decision note only
```

**Example:**
```
/fis:architecture "Rate limiting storage: Redis vs in-memory vs DB"
/fis:architecture "API versioning strategy for payments service" --full-adr
```

## Workflow

### Step 1 — State the Decision Context

Write one sentence: *What architectural decision needs to be made for this outcome?*

Identify:
- The constraint forcing a decision (performance, cost, complexity, compliance)
- The parties affected (team, clients, downstream systems)
- The time horizon (short-term patch vs. long-term design)

### Step 2 — List Options

For each viable option, note:
- **What it is** — brief description
- **Why it might be right** — strongest argument for it
- **Why it might be wrong** — strongest argument against it
- **Effort** — rough implementation cost

Aim for 2–4 options. More than 4 usually indicates scope creep.

### Step 3 — Decide

Select the option that best satisfies the constraints. State:
- The decision in one sentence
- The primary reason (not a list — pick the decisive factor)
- Accepted trade-offs (what we're giving up)

### Step 4 — Record

Write the decision to `docs/decisions/` as `YYYYMMDD-<slug>.md` (or to the plan directory if no docs/decisions exists):

```markdown
# ADR: <decision title>

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
<one paragraph: the constraint and the decision context>

## Decision
<one sentence>

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| A      | ...  | ...  |
| B      | ...  | ...  |

## Consequences
- Positive: ...
- Negative / trade-offs: ...
- Risks: ...
```

Link the ADR from the plan or issue so it's discoverable.

### `--fast` Mode

Omit the full template. Write a one-paragraph decision note directly into the plan's `## Architecture` section or the issue description.

### `--full-adr` Mode

Follow the template above exactly. Store in `docs/decisions/`.

## Output

The ADR or decision note is the output. No code is written. The outcome's implementation follows separately via `/fis:plan` and `/fis:craft`.

## Workflow Position

**Typically follows:** `/fis:requirements` (requirements clarified the constraints), `/fis:brainstorm` (options explored)
**Typically precedes:** `/fis:plan` (plan uses the decided approach)
**Related:** `/fis:requirements` (requirements for the same outcome), `/fis:research` (evidence for option evaluation)
