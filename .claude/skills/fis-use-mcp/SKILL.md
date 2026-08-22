---
name: fis:use-mcp
description: "Execute MCP server tools with intelligent discovery and filtering. Use for MCP integrations, tool execution, capability discovery."
user-invocable: true
when_to_use: "Invoke for MCP tool discovery or controlled tool execution."
category: dev-tools
keywords: [MCP, tools, execute, discovery]
argument-hint: "[task]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# MCP Tool Execution

Execute MCP operations via **Gemini CLI** to preserve context budget.

## Execution Steps

1. **Execute task via Gemini CLI** (using stdin pipe for MCP support):
   ```bash
   # IMPORTANT: Use stdin piping for MCP tasks (historically more reliable for MCP server init)
   # Read model from .claude/.fisrc.json: gemini.model (default: gemini-3-flash-preview)
   echo "$ARGUMENTS. Return JSON only per GEMINI.md instructions." | gemini -y -m <gemini.model>
   ```

2. **Fallback to direct MCP tool execution** (if Gemini CLI unavailable):
   - Use Claude's built-in MCP tool calls to discover and execute tools
   - Use `/fis:mcp-builder` skill to fix any MCP script issues
   - **DO NOT** create ANY new scripts
   - If no suitable MCP tools found, report back to the main agent to move on to the next step

## Important Notes

- **MUST use stdin piping for MCP tasks** — historically more reliable for MCP server initialization
- Use `-y` flag to auto-approve tool execution
- **GEMINI.md auto-loaded**: Gemini CLI automatically loads `GEMINI.md` from project root, enforcing JSON-only response format
- **Parseable output**: Responses are structured JSON: `{"server":"name","tool":"name","success":true,"result":<data>,"error":null}`
- **Error handling**: Check gemini exit code — if non-zero or output contains `GaxiosError`/`RESOURCE_EXHAUSTED`/`MODEL_CAPACITY_EXHAUSTED`/`PERMISSION_DENIED`/`UNAUTHENTICATED`, fall back to direct MCP tool execution

## Anti-Pattern for MCP Tasks

```bash
# AVOID for MCP tasks - historically reported MCP init issues in headless mode
gemini -y -m <gemini.model> --prompt "..."

# Use stdin piping instead for MCP tool execution
echo "..." | gemini -y -m <gemini.model>
```

**Note**: `--prompt` is fine for non-MCP tasks (research, analysis). Only MCP tool execution requires stdin piping.
