---
name: fis:plan
description: "Plan implementations, design architectures, create technical roadmaps with detailed phases. Use for feature planning, system design, solution architecture, implementation strategy, phase documentation, editorial self-contained HTML plan artifacts with --html, and AgentWiki publishing with --wiki."
user-invocable: true
when_to_use: "Invoke when work needs phases, architecture, or a roadmap."
category: utilities
keywords: [planning, architecture, phases, roadmap, html, issue, wiki, agentwiki, publish]
argument-hint: "[task] [--fast|--hard|--deep|--parallel|--two] [--tdd|--no-tasks] [--html] [--issue] [--wiki] [--advice] [--yagni] [--skip-journal] OR [archive|red-team|validate]"
license: MIT
metadata:
  author: fis-ai-kit
  version: "1.1.0"
---

# Planning

Create detailed technical implementation plans through research, codebase analysis, solution design, and comprehensive documentation.

## Plan File Management

**Files-first:** `plan.md` + `phase-NN-*.md` under `<timestamp>-<slug>/` in the
configured plans dir (`plans/` by default; `paths.plans` in project config
overrides it) ARE the plan — hand-editable Markdown and the deliverable of this
skill. A forge issue is an optional visibility projection, never required and
never canonical: a repo with no remote still has a fully working plan as files.
Full model: `../fis-craft/references/plan-state-files-first.md`.

**One writer for state.** Create plan content with Read/Write/Edit, but route
every status change through the plan accessor whose path the session context
injects, so `plan.md` and the phase files cannot drift:

```
node <accessor> <use|resolve|list|show|status|check|uncheck|update> [--plan <path>] [--json]
```

Read the script header for exact flags; it owns the syntax, not this skill.

Rules:
- Default scope is project-local (the configured plans dir under the current project).
- Global scope is allowed only when `--global` is explicit or there is no project context.
- Create `plan.md` and `phase-XX-*.md` files using Write tool following the canonical template below.
- Change phase status with `node <accessor> update <phase> --status <s>` and tick checklist items with `check`/`uncheck`. Hand-edit the phases table only when the accessor is unavailable, and then change the Status cell alone.
- Inspect progress with `node <accessor> status` or by reading `plan.md`.
- Use `/fis:plans-kanban` to open the plans dashboard exposed by DAI.
- **Always Read before Write:** the runtime enforces Read-before-Write on existing files; skipping the Read causes the Write to be rejected. Always read any existing file before overwriting it.

### Mandatory Generated-File Read Pass

After scaffolding and before the first long write or edit to any generated plan file:

1. Enumerate generated files: `plan.md` plus all `phase-*.md`.
2. Read `plan.md`.
3. Read every generated `phase-*.md` stub, including future phases you have not drafted yet.
4. Only after the read pass, write or edit the full content for `plan.md` and each phase.

A directory listing is not enough. The stubs are tiny, so read them all first,
then fill them. Do not draft or submit a full phase body for a stub that has not
been read in the current session.

### Canonical Phase File Template

Use this structure when filling each `phase-XX-*.md`. Loaded once with the skill — no per-file Read needed to learn it. Frontmatter fields match the CLI's phase schema; section headers match `documentation-management.md` so phase files stay consistent across plans.

````markdown
---
phase: <N>
title: "<Phase Name>"
status: pending       # pending | in-progress | completed
priority: P2          # P1 | P2 | P3
effort: ""            # e.g. "4h", "2d"
dependencies: []      # phase IDs this blocks on
---

# Phase <id>: <Name>

## Overview
<1-2 sentences describing what this phase delivers>

## Requirements
- Functional: ...
- Non-functional: ...

## Architecture
<Design, data flow, component interactions>

## Related Code Files
- Create: `path/...`
- Modify: `path/...`
- Delete: `path/...`

## Implementation Steps
1. ...
2. ...

## Success Criteria
- [ ] ...

## Risk Assessment
<Risks + mitigations. For a risk resting on an assumption that may break: the
observable signal it broke, and the pre-decided response — adjust, or replan.>
````

**IMPORTANT:** Before you start, scan unfinished plans in the active scope first:
- Project scope: the configured plans dir (`plans/` by default)
- Global scope: the configured global plans root
  - Default when unset: `~/.claude/plans/`

If there are relevant plans overlapping your upcoming plan, update them as well. If you're unsure or need more clarifications, use `ask_user capability` (the `AskUserQuestion` tool on this runtime) to ask the user.

### Scope Selection

- **Project scope** is the default whenever the current working tree has project context.
- **Global scope** is allowed only when:
  - the user explicitly asks for it via `--global`, or
  - there is no project context to anchor a local plan.
- **No project context** means no `.git`, `package.json`, or `CLAUDE.md` was found in the ancestor chain.
- Keep scope honest in prose and examples: the skill describes CLI-owned behavior, it does not implement scope resolution itself.

### Cross-Plan Dependency Detection

During the pre-creation scan, detect and mark blocking relationships between plans:

1. **Scan** — Read `plan.md` frontmatter of each unfinished plan (status != `completed`/`cancelled`)
2. **Compare scope** — Check overlapping files, shared dependencies, same feature area
3. **Classify relationship:**
   - New plan needs output of existing plan → new plan `blockedBy: [existing-plan-dir]`
   - New plan changes something existing plan depends on → existing plan `blockedBy: [new-plan-dir]`, new plan `blocks: [existing-plan-dir]`
   - Cross-scope dependency → use `global:` or `project:` prefixes
   - Mutual dependency → both plans reference each other in `blockedBy`/`blocks`
4. **Bidirectional update** — When relationship detected, update BOTH `plan.md` files' frontmatter
5. **Ambiguous?** → Use `ask_user capability` with header "Plan Dependency", present detected overlap, ask user to confirm relationship type (blocks/blockedBy/none)

**Frontmatter fields**:
```yaml
blockedBy: [260301-1200-auth-system]            # Same-scope dependency
blockedBy: [global:260301-1200-auth-system]     # Cross-scope dependency
blocks: [project:260228-0900-user-dashboard]    # Explicit project-scope dependency
```

**Status interaction:** Read `plan.md` directly to inspect plan status and cross-plan dependencies. Same-scope bare refs stay in the current scope; prefixed refs resolve against the explicit project/global root. Missing refs should warn and show `not found`, not hard-fail the plan.

## Default (No Arguments)

If invoked with a task description, proceed with planning workflow. If invoked WITHOUT arguments or with unclear intent, use `ask_user capability` to present available operations:

| Operation | Description |
|-----------|-------------|
| `(default)` | Create implementation plan for a task |
| `archive` | Write journal entry & archive plans |
| `red-team` | Adversarial plan review |
| `validate` | Critical questions interview |

Present as options via `ask_user capability` with header "Planning Operation", question "What would you like to do?".

## Workflow Modes

Default: `--auto` (analyze task complexity and auto-pick mode).

| Flag | Mode | Research | Red Team | Validation | Craft Flag |
|------|------|----------|----------|------------|-----------|
| `--auto` | Auto-detect | Follows mode | Follows mode | Follows mode | Follows mode |
| `--fast` | Fast | Skip | Skip | Skip | `--auto` |
| `--hard` | Hard | 2 researchers | Yes | Optional | (none) |
| `--deep` | Deep | 2-3 researchers + per-phase scout | Yes | Yes | (none) |
| `--parallel` | Parallel | 2 researchers | Yes | Optional | `--parallel` |
| `--two` | Two approaches | 2+ researchers | After selection | After selection | (none) |

**Composable flags** (combine with any mode):
| Flag | Effect |
|------|--------|
| `--tdd` | Add tests-first structure to each phase for regression-safe refactors |
| `--no-tasks` | Skip task hydration |
| `--html` | Output a self-contained editorial interactive HTML plan with visible phase outlines, markdown detail modals, and optional generated watercolor technical sketch imagery |
| `--issue` | Create or update a forge issue after plan validation with branch, summary, plan links, open questions, and `ready to review` |
| `--wiki` | Publish the final reviewed plan docs or HTML artifact to AgentWiki via CLI or MCP when available |
| `--advice` | Run under `kongming` advisory supervision (see Advisory Supervision Mode) |
| `--yagni` | Opt into YAGNI: challenge and cut scope not needed for the stated outcome (default: plan the full requested scope). Forward it to every subagent prompt and downstream skill, or the opt-in dies at the handoff |
| `--skip-journal` | Skip the automatic journal entry (see Journal step — opt-out) |

Load: `references/workflow-modes.md` for auto-detection logic, per-mode workflows, context reminders.

### Advisory Supervision Mode (`--advice`)

When `--advice` is present, run this skill under `kongming` supervision.
`kongming` is an advisory-only supervisor: it returns counsel, never code, and
the main agent stays responsible for every decision, edit, and gate.

Spawn `kongming` at these checkpoints:

- **After each planning phase, gate, or major analysis completes** (research,
  solution design, red-team, validation) — pass the goal, what was concluded,
  and the evidence; ask for a go/no-go and the next risk to watch.
- **When stuck** — repeated failures, a blocked step, or contradictory evidence;
  pass everything already tried and the exact obstacle.
- **Before a high-stakes decision** — a design fork, a public-contract or
  security-sensitive change, or an irreversible action; get counsel first.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`
— the `Task` tool on this runtime. Give it enough context to answer in one
reply; it does not interview.

**When the workflow reaches a merge/pull request** (here, via `--issue` or a
downstream `/fis:craft` or `/fis:ship` handoff): pass `--advice` to the
downstream skill so supervision persists across the handoff. Watch and fix CI
until every required check is green, then spawn `kongming` to review the whole
implementation and post its assessment plus concrete next steps as a comment
directly on the request and the source issue (when one exists).

`--advice` adds supervision; it never bypasses this skill's approval gates,
red-team/validation gates, or security policy.

### HTML Output Mode (`--html`)

When `--html` is present, activate `/fis:frontend-design` before composing the
HTML artifact. If that skill requires design intelligence, follow its
`fis:ui-ux-pro-max` activation rule before styling.

**Artifact rules:**
- Write the primary output as `plan.html` in the selected plan directory.
- The HTML file must be self-contained: inline CSS and JavaScript, no build
  step, no network-required assets.
- If generated image assets are used, embed selected images as data URIs so
  `plan.html` remains portable; keep source images under `{plan-dir}/assets/`
  for review only.
- Generate `plan.html` after red-team and validation gates so the HTML reflects
  the final reviewed plan. Markdown files produced for scaffolding or gate
  compatibility are not the user-facing deliverable in this mode.
- If another workflow requires `plan.md` (for example `--issue`), keep
  `plan.md` as a concise index that points to `plan.html`; do not duplicate the
  full plan body unless a downstream `/fis:craft` handoff explicitly needs it.
- Include accessible responsive UI, keyboard-friendly controls, and reduced
  motion handling.

**Content requirements:**
- Plan overview and phase roadmap.
- Main page must show a concise outline summary for every phase: title, status,
  priority, dependencies, objective, 3-6 key bullets, related files,
  success criteria highlights, and test/validation gate when known.
- Each phase outline must open a detail modal rendering the full phase markdown:
  headings, lists, checkboxes, tables, fenced code, inline code, blockquotes,
  links, horizontal rules, and frontmatter metadata. Escape raw HTML unless a
  trusted sanitizer is bundled inline.
- User flows.
- **Implementation workflow diagram (required):** at least one visual diagram
  (flowchart, sequence, or architecture) rendered inline in HTML/CSS/SVG/Canvas
  that shows what will be built and the phase/dependency flow. Under `--html`
  this is mandatory, not optional.
- **UI/UX mockups with annotations (required when the plan touches UI/UX):**
  embed annotated visual mockups of the proposed screens or components directly
  in `plan.html` so the user previews the intended interface before
  implementation. Derive layout, color, type, spacing, and component states from
  the project design guidelines when present, otherwise the built-in editorial
  contract below. Annotate each mockup with callouts tying elements to design
  tokens, interaction states, and the acceptance criteria they satisfy.
- Other diagrams and charts rendered directly in HTML/CSS/SVG/Canvas when useful.
- Interactive affordances such as tabs, filters, expandable risks, or chart
  toggles when useful.
- Citations as visible URLs for external sources, forge issues, docs, and any
  web references used.
- Open questions section; write "None" when there are no unresolved questions.

**Generated illustration requirements:**
- If an image-generation capability is available, generate 1-3 raster
  illustrations for the HTML.
- Prompt style: technical sketch, watercolor wash, hand-drawn engineering
  notebook, ink linework, warm paper, muted red/gold accents, no text, no logo,
  no watermark.
- If image generation is unavailable or fails, continue with typographic
  diagrams / CSS-only structure and state the limitation in the final response.

**Design direction:**
- Use the editorial magazine style contract from the user's supplied guideline
  when present; otherwise use this built-in contract.
- Use warm paper `#faf7f2`, paper panels `#f0ebe1`, ink `#0a0a0a`, muted
  `#6b6258`, accent red `#b8232c`, hairline dividers, serif display, mono
  labels, and restrained sans body.
- Use print-editorial structure: cover section, running mono slide tags/folios,
  generous whitespace, asymmetric grids, rule lines, pull quotes, stat bands,
  and fixed nav dots when useful.
- Avoid gradients, drop shadows, rounded cards, pure white backgrounds, generic
  SaaS styling, decorative bokeh/orbs, emoji icons, and hidden instructions.
- Use accent only for italic serif emphasis, eyebrows, active states, left
  rules, and small data highlights. Include subtle CSS paper grain.
- Keep typography readable on mobile and desktop; no horizontal scrolling.

### Forge Issue Projection (`--issue`, optional publish)

When `--issue` is present, publish an OPTIONAL visibility projection of the
validated plan to a forge issue after validation and red-team gates finish and
before implementation handoff. `plan.md` + phase files remain canonical either
way — this step never replaces them and is skipped entirely in a repo with no
forge remote or auth (report the skip, do not fail the plan).

**Resolve the provider from the remote first.** Use `glab` on GitLab and `gh` on
GitHub, and read the installed skill for that provider for exact commands. Gate
the publish on project visibility and a secret scan before writing anything.

**When the forge is not reachable** (CLI not installed, not authenticated, or no
token): do not fail the plan. Report the skip, name what is missing, and suggest
the concrete next step (e.g. `glab auth login`, `gh auth login`) so the user can
enable publishing if they want it. The plan is fully usable as files either way.

**Required issue fields:**
- Branch name from `git branch --show-current`.
- Plan summary.
- Repo-relative link to `plan.md`.
- Repo-relative link to `plan.html` when `--html` is present.
- Repo-relative link to the brainstorm report when one exists; otherwise state
  `Brainstorm report: None found`.
- Open questions when present; otherwise state `Open questions: None`.
- Acceptance criteria from the validated plan.

**Required label:** `ready to review` — a plan-awaiting-human-review stage before
implementation starts. Create the label first if the project does not have it.

- If an issue already exists for the same plan or branch, update/comment on it
  instead of creating a duplicate.
- All links posted to the forge must be repo-relative. Do not post absolute
  local filesystem paths.
- Redact secrets, env values, tokens, customer data, private logs, and local
  machine-specific details before writing issue bodies or comments.
- If the provider CLI cannot create labels or issues, stop and report the exact
  error to the user; do not treat it as a plan-creation failure.

### Combined `--html --issue`

`plan.html` is the authoritative plan. Create a short companion `plan.md` index
only to satisfy the issue's stable `plan.md` link requirement. The issue must
include both relative links.

### AgentWiki Publish Mode (`--wiki`)

When `--wiki` is present, publish the final reviewed plan artifact to AgentWiki
after validation/red-team gates and after `plan.html` generation when `--html`
is also present.

`--wiki` is private/workspace-first. Use `agentwiki doc share` by default. Run
`agentwiki doc publish` or `agentwiki sites upload` only when the user
explicitly requests public publishing or a public hosted site.

**Availability check:**
1. Prefer AgentWiki CLI when `command -v agentwiki` succeeds and
   `agentwiki whoami` confirms auth.
2. If CLI is unavailable, use AgentWiki MCP tools when exposed in the session
   for document create/update, file upload, share links, or static site upload.
3. If neither is available or auth fails, do not block plan creation. Report
   "AgentWiki publish skipped" with the exact missing capability.

**Markdown/document publish:**
- Publish a reviewed Markdown artifact. If the plan spans `phase-*.md` files,
  create `{plan-dir}/wiki-publish.md` as a concise combined document or index
  before uploading.
- CLI path:
  ```bash
  agentwiki doc upload "{publish-md}" \
    --title "{plan title}" \
    --description "{short summary}" \
    --category "plans" \
    --tags "fis-plan,{repo-slug},{branch}" \
    --json
  agentwiki doc share "{document-id}" --json
  ```
- Capture the returned share URL and include it in the final response. Use
  `agentwiki doc publish "{document-id}" --description "{short summary}" --json`
  only on explicit user request for a public document.

**HTML/static-site publish:**
- For `--html`, keep the self-contained `plan.html` local by default and report
  its path. Upload it as a public hosted site only when the user explicitly asks:
  ```bash
  agentwiki sites upload "{plan-dir}/plan.html" \
    --description "{plan title} - plan HTML artifact" \
    --auto-summary
  ```
- Capture the returned site URL and include it in the final response. If
  `--issue` is also present, comment on or update the issue with the wiki URL.

**MCP fallback:**
- Use AgentWiki MCP document tools for Markdown content when available
  (`document_create`/`document_update`, upload, share-link equivalents).
- Use MCP static-site upload only if the active toolset exposes that exact
  capability and the user explicitly requested public site upload. Do not fake
  a hosted URL from a raw file upload.

**Security rules:**
- Redact secrets, env values, tokens, customer data, private logs, and
  local-machine-only paths before publishing.
- Prefer repo-relative paths and public-safe summaries.
- Publish only final reviewed artifacts; do not publish intermediate research
  notes unless the user explicitly asks.

## When to Use

- Planning new feature implementations
- Architecting system designs
- Evaluating technical approaches
- Creating implementation roadmaps
- Breaking down complex requirements

## Core Responsibilities & Rules

Always honoring **KISS** and **DRY** principles. Deliver the full requested scope — never trim or defer what the user explicitly asked for. Add nothing unrequested. With `--yagni`, additionally challenge and cut any scope not needed for the stated outcome.
**Be honest, be brutal, straight to the point, and be concise.**

### 0. Scope Challenge
Load: `references/scope-challenge.md`
**Skip if:** trivial task (single file fix, <20 word description). `--fast`
changes planning depth only; it never skips the requested-scope baseline or
authorizes scope reduction. Present the reduction fork only with `--yagni`.

### 1. Research & Analysis
Load: `references/research-phase.md`
**Skip if:** Fast mode or provided with researcher reports

### 2. Codebase Understanding
Load: `references/codebase-understanding.md`
**Skip if:** Provided with scout reports

### 3. Solution Design
Load: `references/solution-design.md`

### 4. Plan Creation & Organization
Load: `references/plan-organization.md`

### 5. Task Breakdown & Output Standards
Load: `references/output-standards.md`

## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Pre-Creation Check] --> B[Cross-Plan Scan]
    B --> C[Scope Challenge]
    C --> D[Mode Detection]
    D -->|fast| E[Skip Research]
    D -->|hard/deep/parallel/two| F[Spawn Researchers]
    E --> G[Codebase Analysis]
    F --> G
    G --> H[Write Plan via Planner]
    H --> I{Red Team?}
    I -->|Yes| J[Red Team Review]
    I -->|No| K{Validate?}
    J --> K
    K -->|Yes| V[Verification Pass]
    K -->|No| X{HTML?}
    V --> L[Validation Interview]
    L --> X
    X -->|Yes| Y[Activate frontend-design<br/>Write plan.html]
    X -->|No| M[Hydrate Tasks]
    Y --> M
    M --> Q{Issue?}
    Q -->|Yes| R[Create or update issue<br/>Label ready to review]
    Q -->|No| W{Wiki?}
    R --> W
    W -->|Yes| S[Publish docs or HTML<br/>via AgentWiki]
    W -->|No| N[Present Boundary Reminder]
    S --> N
    N --> P[Post-Plan Handoff<br/>ask_user capability: skip gates already auto-run]
    P --> O[Journal]
```

**This diagram is the authoritative workflow.** Prose sections below provide detail for each node.

## Workflow Process

1. **Pre-Creation Check** → Check Plan Context for active/suggested/none
1b. **Cross-Plan Scan** → Scan unfinished plans, detect `blockedBy`/`blocks` relationships, update both plans
1c. **Scope Challenge** → Run Step 0 scope questions, select mode (see `references/scope-challenge.md`)
    **Skip if:** trivial task. `--fast` changes planning depth only; present the
    reduction fork only with `--yagni`
2. **Mode Detection** → Auto-detect or use explicit flag (see `workflow-modes.md`)
3. **Research Phase** → Spawn researchers (skip in fast mode)
4. **Codebase Analysis** → Read docs, scout if needed
5. **Plan Documentation** → Write comprehensive plan via planner subagent
6. **Red Team Review** → Run `/fis:plan red-team {plan-path}` (hard/deep/parallel/two modes)
7. **Post-Plan Validation** → Run `/fis:plan validate {plan-path}` (hard/deep/parallel/two modes)
8. **HTML Artifact** → If `--html`, activate `/fis:frontend-design` and write final reviewed `plan.html` as the primary output
9. **Hydrate Progress** → Mirror phases into live task management when available (default on, `--no-tasks` to skip)
10. **Forge Issue** → If `--issue`, create/update issue and apply `ready to review`
11. **AgentWiki Publish** → If `--wiki`, publish final docs privately or upload `plan.html` only when AgentWiki CLI/MCP is available and the requested visibility permits it
12. **Boundary Reminder** → Present optional next-step commands with absolute path
13. **Journal** → Run `/fis:journal` to write a concise technical journal entry upon completion. See the shared "Journal step — opt-out" block below.

### Journal step — opt-out

Skip the automatic `/fis:journal` step when either applies:
- The invocation includes the `--skip-journal` flag, OR
- `node scripts/fis-config.cjs resolve --json | jq -r 'if .prefs.journal.auto == false then "false" else "true" end'` returns `false`, run from the same kit directory the plan accessor resolves from (`.claude/` in a project install, `~/.claude/` global). If the command errors or prints anything other than the exact string `false`, treat as `true` (default) — corrupt or missing config never suppresses the automatic journal.

Precedence: flag > project config > user config > default (`true`).
When skipped, print one line:
- `journal skipped by --skip-journal` (flag), or
- `journal skipped by preference` (config).

Explicit `/fis:journal` invocation is unaffected.

### Whole-Plan Consistency Gate

This gate is mandatory after `/fis:plan validate` or `/fis:plan red-team` edits any plan file.
Load: `references/verification-roles.md` → "Whole-Plan Consistency Sweep".

Before recommending implementation, re-read `plan.md` and every `phase-*.md` file. Search all plan files for stale terms, rejected assumptions, renamed APIs/files/fields, superseded decisions, and duplicate embedded drafts/contracts. Reconcile contradictions across the entire plan, not only the edited phase.

If unresolved contradictions remain, report them and ask the user. Do not recommend implementation until the whole-plan consistency sweep reports zero unresolved contradictions.

## Output Requirements
**IMPORTANT:** Invoke "/fis:project-organization" skill to organize the outputs.

- DO NOT implement code - only create plans
- Respond with plan file path and summary
- Ensure self-contained plans with necessary context
- Include code snippets/pseudocode when clarifying
- With `--html`, respond with the `plan.html` path, the companion `plan.md`
  index path when one exists, and a short note that HTML is authoritative.
- With `--issue`, respond with the issue URL and confirm the `ready to review`
  label was applied.
- With `--wiki`, respond with the AgentWiki document/share/site URL when
  published, or state the exact reason publishing was skipped.
- Discover and follow the consuming repository's instruction and
  development-standard documents; do not assume a fixed docs path

## Task Management

Plan files are the durable source of truth. Runtime task views may be session-scoped; hydration mirrors the plan without replacing it.

**Default:** After writing plan files, discover the live task-management surface and mirror phases there when available. Skip with `--no-tasks`.
**3-Item Rule:** Fewer than 3 phases → skip runtime tracking.
**Fallback:** If no live surface exists, update the active plan directly. Planning and handoff remain fully functional.

Load: `references/task-management.md` for the hydration and implementation handoff protocol.

### Hydration Workflow
1. Write plan.md + phase files (persistent layer)
2. Discover the live task-management surface
3. If available, mirror phases, dependencies, and critical/high-risk steps there
4. Retain enough context to map every runtime item back to its plan phase and checklist item
5. Implementation reuses the live view when present or rebuilds it from unchecked plan items

## Active Plan State

Check `## Plan Context` injected by hooks:
- **"Plan: {path}"** → Active plan. Ask "Continue? [Y/n]"
- **"Suggested: {path}"** → Branch hint only. Ask if activate or create new.
- **"Plan: none"** → Create new using `Plan dir:` from `## Naming`

After creating plan, set both pointers — they are complementary, not alternatives:
- `node .claude/scripts/set-active-plan.cjs {plan-dir}` — session-scoped hook
  context, so subagents inherit the plan.
- `node <accessor> use {plan-dir}` — worktree-persistent current-plan pointer
  that `resolve` and downstream implementation use across sessions, with no
  forge link required.

Reports: Active plans → plan-specific path. Suggested → default path.

### Important
**DO NOT** create plans or reports in arbitrary user directories.
**MUST** create plans or reports in one of these allowed roots:
- project scope → current working project directory
- global scope → configured global plans root
  - Default when unset: `~/.claude/plans/`

## Subcommands

| Subcommand | Reference | Purpose |
|------------|-----------|---------|
| `/fis:plan archive` | `references/archive-workflow.md` | Archive plans + write journal entries |
| `/fis:plan red-team` | `references/red-team-workflow.md` | Adversarial plan review with hostile reviewers |
| `/fis:plan validate` | `references/validate-workflow.md` | Validate plan with critical questions interview |

## Post-Plan Handoff (MANDATORY at session end)

After `plan.md` + phase files are written and the user has reviewed/approved them, use `ask_user capability` (the `AskUserQuestion` tool on this runtime) to offer the appropriate next step. Recommend the option that best fits the plan's risk/scope; recommended option listed FIRST and labelled "(Recommended)".

| Option | Recommend When | Why |
|--------|----------------|-----|
| `/fis:plan validate` | Plan is moderate-to-complex; user wants critical-questions interview before implementation | Cheapest gate — surfaces unspecified assumptions, missing acceptance criteria, hand-wavy phases |
| `/fis:plan red-team` | Plan touches security, auth, payments, data integrity, public APIs, infra, or has high blast radius | Adversarial reviewers stress-test the plan for failure modes, attack vectors, and missing edge cases |
| `/fis:craft <plan-path>` | Plan is small / well-understood / low-risk and user wants to start implementation | Skip extra gates; go straight to implementation |
| End session | User wants to review/share plan before deciding | Stop with plan path returned |

**Skip this step ONLY when:**
- The current invocation IS already a subcommand (`validate`, `red-team`, `archive`) — those have their own terminal handoff.
- User explicitly said "just plan, don't suggest next step".

**Skip an individual option ONLY when the active mode already auto-ran that gate (per Workflow Process Steps 6-7):**
- Omit `/fis:plan red-team` from the offered options when mode is `--hard`, `--deep`, `--parallel`, or `--two` (Step 6 already ran adversarial review).
- Omit `/fis:plan validate` from the offered options when mode is `--deep` (Step 7 already ran validation).
- If both gates already ran, the Post-Plan Handoff still fires but offers only `/fis:craft <plan-path>` and `End session`.

After selection: invoke the chosen command with the plan path as argument for continuity.

## Quality Standards

- Thorough and specific, consider long-term maintainability
- Research thoroughly when uncertain
- Address security and performance concerns
- Detailed enough for junior developers
- Validate against existing codebase patterns

**Remember:** Plan quality determines implementation success. Be comprehensive and consider all solution aspects.

## Workflow Position

**Typically follows:** `/fis:brainstorm` (after exploring options), `/fis:scout` (after codebase discovery)
**May precede:** `/fis:craft` after user approval (otherwise stop with plan path and next-step options)
**Related:** `/fis:brainstorm` (explore before planning), `/fis:craft` (execute after planning)
