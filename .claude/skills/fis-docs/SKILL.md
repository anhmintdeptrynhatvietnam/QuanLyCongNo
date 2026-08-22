---
name: fis:docs
description: "Analyze codebase and manage project documentation. Use for doc init / update / summarize, plus FIS .docx export and .docx import (round-trip with FIS-format templates: PRD / SOD / DDD / FSD / DBDD / BRD / TRD / feature-spec / SAD / charter / risk-register / status-report / test-spec / bug-report)."
user-invocable: true
when_to_use: "Invoke to create, refresh, summarize, or audit project documentation, including FIS-format document export and import."
category: utilities
keywords: [documentation, init, update, summarize, docx, export, import, fis-template]
argument-hint: "init|update|summarize|export|import|to-issues"
metadata:
  author: fis-ai-kit
  version: "2.1.0"
---

# Documentation Management

Analyze codebase and manage project documentation through scouting, analysis, and structured doc generation.

**IMPORTANT:** Invoke "/fis:project-organization" skill to organize the outputs.

## Default (No Arguments)

If invoked without arguments, use `AskUserQuestion` to present available documentation operations:

| Operation | Description |
|-----------|-------------|
| `init` | Analyze codebase & create initial docs |
| `update` | Analyze changes & update docs |
| `summarize` | Quick codebase summary |
| `export` | Render kit MD artifact → `.docx` using a FIS template (project-customisable) |
| `import` | Convert `.docx` → kit MD with frontmatter (round-trip) |
| `to-issues` | Convert kit MD artifacts → GitLab/Linear issue payloads |

Present as options via `AskUserQuestion` with header "Documentation Operation", question "What would you like to do?".

## Subcommands

| Subcommand | Reference | Purpose |
|------------|-----------|---------|
| `/fis:docs init` | `references/init-workflow.md` | Analyze codebase and create initial documentation |
| `/fis:docs update` | `references/update-workflow.md` | Analyze codebase and update existing documentation |
| `/fis:docs summarize` | `references/summarize-workflow.md` | Quick analysis and update of codebase summary |
| `/fis:docs export <md>` | `references/export-workflow.md` | Render MD → `.docx` using FIS-format template (resolver: project `.fis/templates/` → kit defaults) |
| `/fis:docs import <docx>` | `references/import-workflow.md` | Convert `.docx` → MD with frontmatter (mammoth-based, preserves headings) |
| `/fis:docs to-issues <md>` | `references/to-issues-workflow.md` | Emit GitLab/Linear issue payload from MD frontmatter |

## Routing

Parse `$ARGUMENTS` first word:
- `init` → Load `references/init-workflow.md`
- `update` → Load `references/update-workflow.md`
- `summarize` → Load `references/summarize-workflow.md`
- `export` → Load `references/export-workflow.md`
- `import` → Load `references/import-workflow.md`
- `to-issues` → Load `references/to-issues-workflow.md`
- empty/unclear → AskUserQuestion (do not auto-run `init`)

## Template resolver (export)

`/fis:docs export <artifact-md>` looks up the docx template by frontmatter `template:` key:

1. Project-local: `<project>/.fis/templates/<template>/<template>.docx` (+ `.docx-mapping.json`)
2. Kit default: `<kit>/templates/docx-templates/<template>.docx`

Project-local takes precedence. Drop a customised `.docx` skeleton (with FIS section structure preserved) into `.fis/templates/` to override per-project. See `references/docx-format.md` for mapping JSON spec.

## Shared Context

Documentation lives in `./docs` directory:
```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

Use `docs/` directory as the source of truth for documentation.

**IMPORTANT**: **Do not** start implementing code.
