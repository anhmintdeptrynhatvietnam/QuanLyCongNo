---
name: fis:scout
description: "Fast codebase scouting using native search, optional Explore agents, and user-permitted external probes (Gemini/OpenCode). Use for file discovery, task context gathering, and scoped searches across directories."
user-invocable: true
when_to_use: "Invoke for fast file discovery and codebase orientation."
category: dev-tools
keywords: [codebase, scouting, file-discovery, search]
argument-hint: "[search-target] [ext]"
metadata:
  author: fis-ai-kit
  version: "1.1.0"
---

# Scout

Fast, token-efficient codebase scouting using parallel agents to find files needed for tasks.

## Usage

```
/fis:scout <search-target> [ext]
```

## Arguments
- Default: Scout using built-in Explore subagents in parallel when delegation is permitted (`./references/internal-scouting.md`)
- `ext`: Scout using user-permitted external probes when native/local search is insufficient (`./references/external-scouting.md`)

## When to Use

- Beginning work on feature spanning multiple directories
- User mentions needing to "find", "locate", or "search for" files
- Starting debugging session requiring file relationships understanding
- User asks about project structure or where functionality lives
- Before changes that might affect multiple codebase parts

## Quick Start

1. Analyze user prompt to identify search targets
2. Use a wide range of `search_files` patterns to find relevant files and estimate scale of the codebase
3. Spawn parallel agents with divided directories only when the active runtime permits `delegate_agent` usage
4. Collect results into concise report

## Runtime Tooling

Use portable capabilities first:
- `search_files` for local discovery — the `Grep` and `Glob` tools on this runtime.
- `read_file` for scoped file reads — the `Read` tool on this runtime.
- `run_shell` for local commands such as `rg`, `wc`, or `sed` — the `Bash` tool on this runtime.
- The live task-management surface for progress tracking when useful.
- `delegate_agent` for Explore subagents only when user request and runtime policy allow delegation — the `Task` tool on this runtime.

Do not spawn subagents only because this skill mentions Explore. Some runtimes,
including Codex Desktop, require the actual user request to explicitly ask for
subagents, delegation, or parallel agent work. If that explicit request is
absent, scout in the main agent with `search_files` and `read_file`.

Runtime mapping for `delegate_agent`:
- Claude Code: use the native delegation capability with `subagent_type: "Explore"`.
- Codex Desktop: Explore is a deferred multi-agent role. If `multi_agent_v1`
  is not visible, call `tool_search` for multi-agent spawn tools first, then use
  `multi_agent_v1.spawn_agent` with `agent_type: "Explore"`. Do not set a model
  override; the Explore role owns its runtime model configuration.

## Configuration

Read from `.claude/.fisrc.json` (or `~/.claude/.fisrc.json`):
- `gemini.model` - Gemini model for external probes (default: `gemini-3-flash-preview`)

## Workflow

### 1. Analyze Task
- Parse user prompt for search targets
- Identify key directories, patterns, file types, lines of code
- Determine optimal SCALE value of subagents to spawn

### 2. Divide and Conquer
- Split codebase into logical segments per agent
- Assign each agent specific directories or patterns
- Ensure no overlap, maximize coverage

### 3. Register Scout Work
- **Skip if:** Agent count ≤ 2 (overhead exceeds benefit)
- Discover the live task-management surface and check for existing scout work
  (`TaskList`/`TaskCreate`/`TaskUpdate` or `TodoWrite` on this runtime)
- If available, register one scoped item per agent; otherwise update the active plan
- Keep tracking concise: scope, assigned directories, current status, and timeout
- Treat the active plan as the durable source of truth
- See `references/task-management-scouting.md` for the tracking schema and examples

### 4. Spawn Parallel Agents
Load appropriate reference based on decision tree:
- **Internal (Default):** `references/internal-scouting.md` (Explore subagents)
- **External:** `references/external-scouting.md` (Gemini/OpenCode)

**Notes:**
- Record each scope as in progress before spawning its agent
- Prompt detailed instructions for each subagent with exact directories or files it should read
- Remember that each subagent has less than 200K tokens of context window
- Amount of subagents to-be-spawned depends on the current system resources available and amount of files to be scanned
- Each subagent must return a detailed summary report to a main agent
- In Codex Desktop, first expose deferred multi-agent tools through `tool_search` if they are not already visible.
- If runtime policy blocks subagents because the user did not explicitly request delegation, continue with main-agent scouting instead of forcing a spawn.

### 5. Collect Results
**IMPORTANT:** Invoke the installed project-organization skill (`/fis:project-organization`) to organize the outputs.

- Timeout: 3 minutes per agent (skip non-responders)
- Record completed scopes and log timed-out agents in the report
- Aggregate findings into single report
- List unresolved questions at end

## Report Format

```markdown
# Scout Report

## Relevant Files
- `path/to/file.ts` - Brief description
- ...

## Unresolved Questions
- Any gaps in findings
```

## References

- `references/internal-scouting.md` - Using Explore subagents
- `references/external-scouting.md` - Using user-permitted Gemini/OpenCode probes
- `references/task-management-scouting.md` - Task-tracking patterns for scout coordination

## Workflow Position

**Typically precedes:** the installed debug skill (debug after scouting), `/fis:fix` (fix after locating code), the installed code-review skill (scout edge cases before review)
**Related:** the installed debug skill (investigate after scouting), the installed brainstorm skill (explore after scouting)
