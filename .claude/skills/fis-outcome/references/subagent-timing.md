# Subagent Timing

When to spawn installed agents, what every delegation must carry, what may run
in parallel, and how dispatch works on a runtime that has no agent surface.

Agent names below are the roles this kit ships today. Resolve them against the
live agent inventory at router step R2 before spawning; never dispatch to a
role you have not confirmed exists on this runtime.

`.claude/rules/orchestration-protocol.md` is the authority for delegation
context and status handling. This file adds the timing decision on top of it.

## Why (and why not) delegate

A subagent adds value through exactly four mechanisms: a fresh context window
(no accumulated noise), an enforced tool boundary, parallel wall-clock, or a
specialist system prompt. If a spawn provides none of these, do the work
inline.

Do NOT spawn when:

- The work is a single small edit or lookup (delegation overhead > work).
- The task needs the full conversation history to be done right — subagents
  start blank; the contract below is ALL they know.
- The DRI is mid-dialogue on the same question (interactive loops stay in the
  controller session).
- The runtime pays a per-dispatch process cost larger than the work itself.

## Trigger Table

| Stage | Condition | Role |
|-------|-----------|------|
| understand | More than two areas or files to map | `explore` (read-only, in parallel) |
| understand | External tech, unfamiliar API, or vendor decision involved | `researcher` |
| decide | Size epic, multi-file build ahead | `planner` — prefer `/fis:plan` instead when the DRI should review the plan |
| decide | Approach contested or high-stakes | `brainstormer` with an adversarial prompt |
| decide | DRI wants to be interviewed about the design before committing | `advisor` |
| execute | Independent file sets across plan phases | one `fullstack-developer` per phase, disjoint file ownership, parallel only when files do not overlap |
| execute | Frontend or UX surface in the phase | `ui-ux-designer` alongside the implementing role |
| execute | Diff has grown redundant or inconsistent after the change landed | `code-simplifier`, behavior-preserving only |
| verify | Implementation or fix just finished | `tester` before claiming done |
| verify | Ship, publish, public-contract change ahead, or risk high (R4) | `code-reviewer` as an independent pass |
| any | Same failure twice despite fixes | `debugger` with all evidence so far |
| any | Hard problem on a model below the strongest available (stuck after retries, high-stakes fork, fuzzy requirements) | `kongming` — autonomous counsel in one reply, no interview, advice only |
| deliver | Behavior, setup, commands, or architecture changed | `docs-manager`, scoped to the owning doc surface |
| deliver | Plan status, phase progress, or cross-session tracking needs sync | `project-manager` |
| deliver | Durable lesson, incident, or hard failure worth recording | `journal-writer` |
| deliver | Commit, branch, or push work the controller does not own | `git-manager` |

Timing beats selection: the most common failure is the right agent spawned
late — explorers after you are already lost, a reviewer after the request is
open. Spawn at the trigger, not at the regret.

## Delegation Contract

Every spawn carries all eight. A subagent cannot see the conversation; this
contract is its entire world:

1. **Task** — one outcome, verifiable.
2. **Files to read** — exact paths, not "look around" (unless scouting IS the
   task).
3. **Files it may modify** — explicit ownership; empty for read-only roles.
4. **Acceptance criteria** — how the agent knows it is done.
5. **Constraints** — patterns to follow, things not to touch, no commit or push
   unless the controller owns git operations and says so.
6. **Work context path and report path** — the repository or worktree it works
   in, plus where to write findings (`plans/<slug>/reports/` by convention);
   otherwise return the result inline.
7. **Scope-affecting flags** — pass `--yagni` through when the DRI used it.
   Without it the delegate defaults to delivering the full requested scope,
   which is the FIS AI Kit default.
8. **Status line** — end with
   `Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT` plus a
   one-line summary.

Handle `BLOCKED` and `NEEDS_CONTEXT` by changing the context, scope, or
approach before re-delegating. Re-sending a failing prompt unchanged is a loop,
not a retry.

## Parallel Safety

- Parallel agents require disjoint file ownership, decided BEFORE spawning.
- Never parallel-edit the same file, generated artifact, database migration
  sequence, or shared config.
- Read-only explorers parallelize freely.
- Merge decisions, conflict resolution, and DRI approvals stay in the
  controller session.
- Keep concurrent spawns to a handful (3-4); a wall of agents burns quota and
  produces reports faster than anyone can verify them.
- Work that needs several coordinated sessions rather than one-shot delegates
  belongs to `/fis:team`; isolated branches per workstream belong to
  `/fis:worktree`.

## Dispatch

Delegation is runtime-neutral. Discover the live capability, then use it:

- Spawn with
  `delegate_agent capability(subagent_type="<role>", prompt="<the eight contract items>", description="<brief>")`
  — the `Task` tool on this runtime. Parallel dispatch means several such calls
  in a single turn.
- Semantics to expect: fresh context, the role's own tool allowlist enforced,
  one text result returned.
- Ask the DRI through `ask_user capability` (the `AskUserQuestion` tool on this
  runtime) when a delegation result forces a decision the controller cannot
  make alone.
- Long-running or repeated shell verification inside a delegation runs through
  `run_shell capability`; stop what you started before the session or worktree
  ends.
- No delegation capability on this runtime? Do the work inline, keep the same
  verification links, and name the gap in the final report. Never describe a
  delegation that did not happen.

## Reporting Back

The controller reports outcome-first after agents return: what each role
produced, what was verified, which reports exist where, and any
`DONE_WITH_CONCERNS` items verbatim — concerns from a fresh-context agent are
signal, not noise.
