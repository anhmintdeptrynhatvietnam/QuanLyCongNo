# External Scouting with Gemini/OpenCode

Use external agentic tools only when the user permits that execution path and
the runtime-native search capabilities are insufficient.

## Routing

```text
Native/local search sufficient  -> use search_files, read_file, rg, wc, sed
External probe permitted        -> use Gemini or OpenCode for bounded read-only scopes
Antigravity requested           -> route through the installed orchestration capability
```

Ordinary scouting must not invoke Antigravity directly. Whichever orchestration
capability is installed owns its version, authentication, safety, and
first-class verification gates. Use that capability when the user explicitly
requests Antigravity; if none is installed, stay on native/local scouting.

## Tool Selection

```
SCALE <= 3  → gemini CLI
SCALE 4-5   → opencode CLI
SCALE >= 6  → Use internal scouting instead
```

## Configuration

Read from `.claude/.fisrc.json` (or `~/.claude/.fisrc.json`):
```json
{
  "gemini": {
    "model": "gemini-3-flash-preview"
  }
}
```

Default model: `gemini-3-flash-preview`

## Gemini CLI (SCALE <= 3)

### Command
```bash
timeout 120 gemini -y -m <model> --prompt "[prompt]" 2>&1
```

### Example
```bash
timeout 120 gemini -y -m gemini-3-flash-preview --prompt "Search src/ for authentication files. List paths with brief descriptions." 2>&1
```

## OpenCode CLI (SCALE 4-5)

### Command
```bash
opencode run "[prompt]" --model opencode/grok-code
```

### Example
```bash
opencode run "Find all payment-related files in lib/ and api/" --model opencode/grok-code
```

## Installation Check

Verify the external tool before using that path:

```bash
command -v gemini
command -v opencode
```

If the tool is not installed, use `ask_user capability` — the `AskUserQuestion`
tool on this runtime — to offer:
1. **Yes** - Provide installation instructions (may need manual auth steps)
2. **No** - Continue with `search_files`, `read_file`, and scoped `run_shell`
   searches; use internal Explore delegation only when the user explicitly
   requested or permitted subagents (`internal-scouting.md`)

## Parallel External Commands

Prefer parallel runtime tool calls when available. If only shell execution is
available, run independent one-shot searches with non-overlapping scopes:

```bash
timeout 120 gemini -y -m gemini-3-flash-preview --prompt "Read-only: search db/ and migrations/ for migration files" 2>&1
timeout 120 gemini -y -m gemini-3-flash-preview --prompt "Read-only: search lib/ and src/ for database schema files" 2>&1
timeout 120 gemini -y -m gemini-3-flash-preview --prompt "Read-only: search config/ for database configuration" 2>&1
```

The same scoping applies to OpenCode:

```bash
opencode run "Read-only: search db/ and migrations/ for migration files" --model opencode/grok-code
opencode run "Read-only: search lib/ and src/ for database schema files" --model opencode/grok-code
opencode run "Read-only: search config/ for database configuration" --model opencode/grok-code
```

Do not dispatch multiple searches against the same directories. External tools
must remain read-only for scouting prompts. When delegating these commands to a
shell worker, use `delegate_agent capability` — the `Task` tool on this runtime
— only when the user permitted delegation, and issue every spawn in a single
assistant turn for parallel execution.

## Prompt Guidelines

- Name exact directories to search.
- Request file paths with one-line relevance notes.
- State that the task is read-only.
- Set scope boundaries and exclusions.
- Ask for relationships only when they affect the task.

## Reading File Content

Use local chunking for large files. Do not send whole private files to an
external CLI just to bypass a context limit.

### Step 1: Get Line Counts

```bash
wc -l path/to/file1.ts path/to/file2.ts path/to/file3.ts
```

### Step 2: Read Bounded Chunks

- Files under 500 lines: read directly.
- Files from 500 to 1500 lines: split into 2-3 chunks.
- Files over 1500 lines: split into roughly 500-line chunks.

```bash
sed -n '1,500p' large-file.ts
sed -n '501,1000p' large-file.ts
```

## Timeout and Error Handling

- Wrap all gemini calls: `timeout 120 gemini -y -m <model> --prompt "[prompt]" 2>&1`
- Treat a non-zero exit code as failure.
- Check output for error markers: `GaxiosError`, `RESOURCE_EXHAUSTED`, `MODEL_CAPACITY_EXHAUSTED`, `PERMISSION_DENIED`, `UNAUTHENTICATED`
- Do not retry a failed external probe automatically.
- **Model fallback:** if `gemini-3-flash-preview` fails with 429, try `gemini-2.5-flash` before giving up.
- After two external failures, continue with native/local scouting.
- Note incomplete directory coverage in the report.
