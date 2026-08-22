# Domain Routing

Domain routing is capability-based and lives in one place:
`.claude/rules/skill-domain-routing.md`, which is always loaded.

Match the outcome's intent to a capability there, then resolve that capability
against the runtime's live skill catalog. A copied command inventory goes stale
the moment kit composition changes, which is why this file no longer keeps one.

## Outcome-specific defaults

- Default to the Tier 1 nucleus. Pull in a Tier 2 or domain capability only when
  the outcome genuinely needs it.
- Domain knowhow capabilities are never activated by default. The outcome has to
  explicitly target that domain.
- Parallel team coordination, edge-case scenario generation, and expert Q&A are
  opt-in for the same reason: they cost a workstream each and rarely apply.
