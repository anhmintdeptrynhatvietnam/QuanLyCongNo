# Parallel Exploration

Patterns for launching multiple subagents in parallel to scout the codebase,
verify implementation, and coordinate through the runtime's portable
capabilities.

## Runtime Rules

- Use `delegate_agent` for subagents. Native names differ by runtime.
- Claude Code and Cursor map `delegate_agent` to the `Task` tool.
- On a runtime where the tool is deferred or renamed, discover it through the
  live tool surface first instead of assuming a name.
- Do not spawn subagents only because a skill says to. Some runtimes require the
  actual user request to explicitly ask for subagents, delegation, or parallel
  agent work.
- If delegation is unavailable or not permitted, do the scout and verification
  in the main agent with `search_files`, `read_file`, and `run_shell`.

## Parallel Exploration (Scouting)

Launch multiple `Explore` subagents simultaneously when you need to find:
- Related files across different areas
- Similar implementations or patterns
- Dependencies and usage

**Portable pattern:**
- Delegate Explore with distinct prompts for area1, area2, and area3.
- Claude Code / Cursor native form:
  `delegate_agent capability(subagent_type="Explore", prompt="...", description="...")`.

**Example — multi-area scouting:**
Launch in one assistant turn when the runtime supports parallel calls:
- Explore auth-related files in `src/`
- Explore API routes handling users
- Explore tests for the auth module

## Parallel Verification (shell)

Prefer direct `run_shell` verification in the main agent. Delegate verification
only when the user explicitly requested parallel delegation and the runtime has
a suitable worker role.

**Example — multi-verification:**
Run typecheck, lint, build, and tests with `run_shell`; split across workers
only when delegation is permitted.

## Task-Coordinated Parallel (Moderate+)

For multi-phase fixes, discover the live task-management surface and use it to
coordinate parallel agents when available. Otherwise, track scopes and status in
the active plan.

**Pattern — parallel issue trees:**
- Create separate plan items per independent issue.
- Mark each issue's debug item as blocking its fix item.
- Add a final integration-verify item blocked by all issue fixes.
- Spawn agents per issue tree through `delegate_agent` when permitted.

Agents claim work through the live surface when supported. Otherwise, the
orchestrator assigns non-overlapping scopes from the active plan and advances
blocked work only after prerequisites complete.

## When to Use Parallel

| Scenario | Parallel Strategy |
|----------|-------------------|
| Root cause unclear, multiple suspects | 2-3 Explore agents on different areas |
| Multi-module fix | Explore each module in parallel when delegation is permitted |
| After implementation | `run_shell` for typecheck + lint + build; delegate only if permitted |
| Before commit | `run_shell` for test + build + lint; delegate only if permitted |
| 2+ independent issues | Plan tree per issue + delegated fullstack-developer agents |

## Combining Explore + Tasks + shell

**Step 1:** Parallel Explore to scout
**Step 2:** Sequential implementation (update tasks as phases complete)
**Step 3:** Parallel shell verification

1. Scout payment handlers with Explore.
2. Scout order processors with Explore.
3. Wait for results, implement the fix, and update progress in the live surface
   or active plan.
4. Verify with `run_shell`: tests, typecheck, build.

## Resource Limits

- Max 3 parallel agents recommended (system resources)
- Each subagent has its own context limit
- Keep prompts concise to avoid context bloat
- Check the live surface for unblocked work when supported; otherwise read the
  active plan
