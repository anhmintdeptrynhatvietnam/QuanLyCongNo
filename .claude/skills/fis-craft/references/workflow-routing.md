# Workflow Routing

Use this file when choosing the sequence for multi-step work. It is a routing
map only; load the owning `SKILL.md` before executing details.

Resolve each capability against the runtime's live installed-skill catalog. The
FIS skill named in parentheses is the current owner of that capability; if it is
not installed, use whatever installed skill covers the capability instead of
synthesizing a command.

## Core Sequences

| User intent | Sequence |
|---|---|
| Implement a feature | brainstorm (`/fis:brainstorm`) -> planning (`/fis:plan`) -> implementation (`/fis:craft`) -> testing (`/fis:test`) -> code review (`/fis:code-review`) |
| Execute an accepted plan | reuse its brainstorm contract -> `/fis:craft <plan-path>` |
| Quick implementation | bounded brainstorm gate -> `/fis:craft --fast` |
| Bug, error, failed test, or CI failure | opening intent frame -> `/fis:fix` |
| Investigate before deciding | scouting (`/fis:scout`) -> debugging (`/fis:debug`) -> brainstorm -> planning |
| Review a merge/pull request | the installed review capability for the detected provider (`/fis:review-mr` on GitLab) |
| Fix review feedback | the review capability with its fix mode, or `/fis:fix --parallel` |
| Ship a completed branch | shipping (`/fis:ship`) |
| Explain work visually | visual explanation (`/fis:preview --explain` or `/fis:preview --html --diff`) |
| Update project docs | documentation maintenance (`/fis:docs update`) |

## Implementation Owner

- Start delivery with outcome, constraints, non-goals, and acceptance criteria.
  Reuse them from an accepted plan instead of asking again.
- Use the implementation capability (`/fis:craft`) for known feature scope after
  requirements are clear.
- Use the fix capability (`/fis:fix`) for concrete bugs, errors, test failures,
  and CI failures.
- Use the planning capability when work needs architecture, phases, file
  ownership, or TDD structure.
- Use the testing capability for verification-only work.
- Use the shipping capability only after implementation, tests, and review are
  done.
- Read-only scout, debug, review, and explanation work may stop without an
  interactive design loop. Satisfy the brainstorm gate if it crosses into
  delivery or workspace mutation.

## Handoff Rules

- Establish the brainstorm contract, then use the domain skill for evidence and
  design, followed by the workflow owner. Example: for a React feature, route to
  the frontend-development capability, then execute through the planning
  capability and `/fis:craft`.
- For a domain-knowhow task (telecom billing, MVNO, SAP, EHRP, utility billing,
  Vietnam fintech or locale), pair the domain capability with the technique
  capability. See `.claude/rules/skill-domain-routing.md`.
- For visual explanations, invoke the preview capability and follow its
  explanation routing.
- For documentation changes, invoke the documentation capability and follow the
  installed documentation-management routing.
- If a skill-discovery capability is installed and skill choice is ambiguous,
  invoke it for domain routing. Otherwise use the installed skill names and
  descriptions.

## Post-Implementation

- Review high-risk, cross-module, or public-contract changes before shipping.
- Update docs only when behavior, setup, commands, architecture, security
  posture, public contracts, or future maintainer decisions changed.
- Journal when a workflow creates durable decisions or debugging lessons.
