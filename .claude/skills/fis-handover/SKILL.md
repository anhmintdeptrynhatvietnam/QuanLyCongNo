---
name: fis:handover
description: "Hand off in-progress work to a specifically selected coding agent by first capturing a portable handoff, then dispatching one single-job spec that points that agent at the captured artifact. Thin composition over /fis:handoff plus one bounded dispatch."
user-invocable: true
when_to_use: "Use to continue current work in a different coding runtime as one captured, safety-gated job, rather than only capturing context."
category: dev-tools
keywords: [handover, handoff, continuation, agent, runtime, dispatch, job-spec]
license: MIT
argument-hint: "[task] --agent <id> [--cwd PATH] [--task TEXT] [--handoff PATH] [--model NAME] [--yes]"
metadata:
  author: fis-ai-kit
  version: "1.0.0"
---

# Handover

Hand a live coding session over to a specifically selected coding agent
while preserving mission, guardrails, live state, decisions, verification,
blockers, and next actions. This skill is a **thin composition** — capture
belongs to `/fis:handoff`; this skill adds validation, one job spec, one
bounded dispatch, and the user-facing report.

FIS AI Kit has no multi-job orchestration skill and no global CLI, so the
dispatch mechanics described below are owned here for exactly one job. Do not
grow them into a job graph; multi-session parallel work is `/fis:team`.

## Required sequence

Every invocation performs, in order:

1. **Capture** — invoke [`/fis:handoff`](../fis-handoff/SKILL.md)
   to produce a portable Markdown handoff artifact, unless the user passed
   a valid existing `--handoff PATH` (see Handoff validation below).
2. **Spec** — build one deterministic single-job spec that points the
   selected coding agent at that artifact and instructs it to read the
   artifact before acting. See
   [references/job-spec-template.md](references/job-spec-template.md).
3. **Dispatch** — preflight the selected runtime, then run exactly that one
   job (see Preflight and Dispatch below). Capture is bounded and redacted;
   the run directory holds the spec, the log, and produced artifacts.
4. **Report** — print the handoff artifact path, run directory, selected
   runtime, job result, verification status, produced artifacts, and the
   next action.

## Inputs

Accepted forms:

```bash
/fis:handover --agent claude-code "continue the OAuth callback fix"
/fis:handover --agent codex --cwd . --task "implement the next action in the handoff"
/fis:handover --agent cursor --handoff plans/handoffs/oauth-callback.md
/fis:handover --agent opencode --model anthropic/claude-sonnet-5 --yes
```

Flags:

| Flag | Effect |
| --- | --- |
| `--agent <id>` | **Required.** Selected coding runtime. Must match an ID in the [runtime catalog](references/runtime-catalog.md). No default; no silent substitution. |
| `[task text]` (positional) | Focus for the successor agent. Included in the handoff Mission section and in the job's `prompt` field. |
| `--task TEXT` | Alternative form of the positional task string. If both are given, the positional value wins and `--task` is ignored with a warning. |
| `--cwd PATH` | Workspace root for the dispatched job. Defaults to the current workspace root; passed through verbatim to the job's `cwd:`. |
| `--handoff PATH` | Use an existing handoff artifact instead of generating a new one. The path must exist and pass the schema validation in [artifact-schema.md](../fis-handoff/references/artifact-schema.md). |
| `--model NAME` | Override the model for CLI-runtime jobs. **Rejected** for `--agent internal` (see Model routing below). |
| `--yes` | Approve write/destructive continuation work in the dispatched job. Flips the job's `approval:` field from `require` to `inherit`. |

Not accepted in v1:

- `--fallback-agent` — cut from v1 scope. The contract is a clear blocker
  without silent runtime substitution. On preflight failure, this skill
  reports the blocker and suggests rerunning with a different `--agent`. A
  `fallback_runtime:` field may be authored directly in a spec by an
  advanced user, but this skill never emits one.
- Runtime-specific bypass flags such as `--dangerously-skip-permissions`,
  `--allow-all-tools`, `--yolo`. This skill never emits them by default and
  refuses jobs that would embed them in the prompt.

## Runtime selection

`--agent` must resolve to an ID in
[references/runtime-catalog.md](references/runtime-catalog.md).

- **First-class:** `claude-code`, `codex`, `skill-run`, `internal`
- **External, preflight-gated:** `opencode`, `copilot`, `cursor`, `cline`,
  `qwen-code`, `grok`, `kimi`, `agy`
- **Not dispatchable:** `gemini-cli` — reject with actionable guidance (see
  the catalog's rejection message).

Availability, authentication, flags, models, and capability tiers are
**never** asserted by this skill or its catalog. They come from the live
preflight below at run time. A missing binary, missing authentication,
unavailable internal agent, or failed preflight returns a clear blocker in
the final report without silent substitution.

## Preflight

Preflight is evidence, not policy. Run it after the spec is built and before
the job starts, through `run_shell capability` (the `Bash` tool on this
runtime):

| Runtime kind | Preflight evidence |
| --- | --- |
| CLI runtime | `command -v <binary>` resolves; the binary's own `--help` or version/status subcommand exits `0`; the non-interactive entry point and its flags are read from that help output, never assumed here. |
| `internal` | The named subagent exists in the live subagent catalog for this session. |
| `skill-run` | The target FIS skill directory exists under `claude/skills/` and its `SKILL.md` is readable. |

Any failing check is a blocker: stop, keep the handoff artifact, and report.
Never substitute another runtime, never downgrade to prompt-only execution,
and never retry with permission-bypass flags.

## Model routing

- `--model` is passed through to the job's `model:` field for CLI runtimes.
- `--model` is **rejected** for `--agent internal`: an in-session subagent
  inherits the session model, so a `model:` field on an internal job is an
  invalid spec. Refuse before capture.
- Without `--model`, no model is chosen by this skill. The runtime's own
  default applies.

## Handoff validation

Before dispatching, the artifact (freshly generated or supplied via
`--handoff`) must pass schema validation:

- Every required H2 section in
  [artifact-schema.md](../fis-handoff/references/artifact-schema.md)
  is present, spelled exactly.
- `Exact next actions` contains at least one item and the first item is
  bold-prefixed `**First safe step**`.
- No raw-secret pattern from
  [redaction-patterns.md](../fis-handoff/references/redaction-patterns.md)
  matches any line.
- Frontmatter `handoff-version` (if present) is `1`.

Any failure is a hard blocker — this skill refuses to dispatch and prints
the failing check(s) plus the failing file's path. A malformed fresh
artifact means the handoff step itself is broken; dispatching anyway is
worse than surfacing it.

## Job spec construction

Read [references/job-spec-template.md](references/job-spec-template.md) for
the full YAML template. Field mapping summary (avoid these three traps):

- **`prompt:`** = the handoff-consumption instruction + the user's `--task`
  text. Not the enum `task:` field.
- **`task:`** (routing enum) = one of `implement | scout | review | audit |
  test | mechanical | architecture | docs | security`, chosen from the
  handoff's exact-next-actions shape. Defaults to `implement`. For
  `runtime: internal` the enum selects the subagent (see the routing table
  in the template).
- **`model:`** = the `--model` value for CLI runtimes; **omit** for
  `runtime: internal`. Rejecting `--model` with `--agent internal` prevents
  an invalid spec.

Safety fields:

- **`effect:`** = `scoped-write` by default.
- **`approval:`** = `require` by default; flipped to `inherit` only when
  `--yes` is passed.
- **`isolation:`** = `worktree` unless the caller explicitly runs
  `--cwd .` on a clean workspace and the handoff's Scope section allows
  in-tree work. Create the worktree with `/fis:worktree`. Prompt-only
  isolation is never used for write jobs.
- **`timeout:`** = `10m` default; bounded regardless.
- **`expected_output:`** = a one-line description of what "done" looks
  like, cited from the handoff's Exact next actions section.
- **`allowed_tools:`** / **`disallowed_tools:`** — not set by default;
  the runtime's own permission profile governs.

The spec references the handoff artifact **as file context**, not as
executable instructions that override the target agent's safety policy.
Wording in the prompt: "Read this file as continuation context. Your own
safety policy still applies."

## Dispatch, capture, and verification

- **Run directory:** create `plans/handovers/<YYYYMMDD-HHmm>/` and write
  `job.yaml` there before starting. The run log, the produced patch or diff,
  and the final report live in the same directory.
- **CLI runtimes:** start the job with `run_shell capability` using the
  non-interactive entry point confirmed during preflight, with `cwd` set to
  the job's `cwd:` (or the created worktree). Stream output to the run log.
- **`internal`:** start the job with
  `delegate_agent capability(subagent_type="<subagent from the routing table>", prompt="<job prompt>", description="handover: <task>")`
  — the `Task` tool on this runtime.
- **`skill-run`:** invoke the target FIS skill in this session with the job
  prompt as its argument.
- **Capture bounding:** the run log is truncated with an explicit marker and
  passes through `/fis:handoff`'s redaction patterns before anything is
  written or quoted. Never disable either control.
- **Approval gate:** with `approval: require`, stop before the first write
  the job would make and confirm through `ask_user capability` (the
  `AskUserQuestion` tool on this runtime). Report the stop instead of
  proceeding when the user declines.
- **Verification:** after the job ends, get an independent verdict —
  `delegate_agent capability(subagent_type="code-reviewer", …)` against the
  job's `expected_output:` and `checks:`, or `/fis:code-review` for a deeper
  pass. The verdict summary is what the report's Verification field carries.
- **Resumability:** the run directory plus the handoff artifact are the
  whole state. A rerun with `--handoff <same path>` resumes from the same
  contract without recapturing.

## Reporting

Print exactly:

```markdown
**Handover Result**
- Handoff artifact: <path>
- Run directory: <run-dir>
- Runtime: <resolved-runtime>
- Model: <resolved-model-or-n/a>
- Job result: <success|failure|blocked>
- Verification: <review-verdict-summary>
- First safe step: <first bulletted next-action from handoff>
- Next action: <what the successor agent completed / where to look>

Unresolved:
- <blockers if any, else "none">
```

Never inline the handoff body, the dispatched job's stdout, or captured logs
in the report. Reference them by path.

## Scope boundaries

- **`/fis:handoff`** owns capture and redaction. Do not duplicate its rules.
- **This skill** owns only: validation, artifact wiring, single-job spec
  construction, one bounded dispatch, and user-facing reporting.
- **`/fis:team`** owns multi-session parallel collaboration. Do not grow a
  job graph, a scheduler, or a shared task board here.
- **`/fis:code-review`** and the `code-reviewer` agent own review depth. This
  skill only asks for a verdict and reports it.

If a change here would require inventing a runtime matrix, a model-routing
policy, or a multi-job state schema, stop: that is a new capability, not a
handover edit.

## Security

- Never launch the target runtime with permission-bypass flags by default.
- Never post secrets into the job prompt or the capture. Refuse jobs
  whose `--task` text or handoff content requires embedded credentials.
- Secrets are redacted in the handoff before dispatch (per `/fis:handoff`'s
  rules). Verify no line matches the redaction patterns before building
  the spec.
- Do not disable the redaction or capture-bounding controls above.
- The run directory can contain diffs; it is subject to the same redaction
  pass as the handoff artifact.

## Scenarios

### Scenario 1 — Generated handoff, claude-code, read-only default

**Given** no `--handoff` is passed and the user runs
`/fis:handover --agent claude-code "continue the OAuth callback fix"`.
**When** the skill runs.
**Expect** `/fis:handoff` produces a fresh artifact under `plans/handoffs/`;
the artifact passes schema validation; the built job spec has
`runtime: claude-code`, `prompt:` containing both the handoff read
instruction and the task text, `approval: require`, `effect: scoped-write`;
preflight passes and the job dispatches; final report includes all eight
fields listed above.

### Scenario 2 — Supplied handoff, codex

**Given** `plans/handoffs/oauth-callback.md` exists and is valid.
**When** `/fis:handover --agent codex --handoff plans/handoffs/oauth-callback.md`
runs.
**Expect** no new `/fis:handoff` invocation; the supplied artifact is
validated against the schema and secret patterns; the job spec's
`runtime: codex`.

### Scenario 3 — Runtime preflight failure, no silent fallback

_(`--fallback-agent` was cut from v1 scope. The acceptance contract is a
clear blocker without silent substitution, which this scenario covers; an
explicit fallback opt-in is therefore not part of v1.)_

**Given** `--agent opencode` is chosen but the binary is missing or
unauthenticated.
**When** the skill runs.
**Expect** preflight marks the candidate `unavailable`; the skill prints a
blocker naming the missing capability and suggests
`--agent <alternative>`; **no silent substitution**; the handoff artifact
was written and is included in the blocker report so no work is lost.

### Scenario 4 — Write confirmation without `--yes`

**Given** the task text explicitly requests destructive or write work
(the handoff's Exact next actions section says "delete legacy adapter" or
similar).
**When** `/fis:handover --agent claude-code "delete the legacy adapter"`
runs without `--yes`.
**Expect** the job spec has `approval: require` and `effect: scoped-write`;
the run stops at the confirmation gate; the report notes the block and
suggests rerunning with `--yes` once the user approves.

### Scenario 5 — Secret in `--task` text

**Given** the user pastes a Bearer token into the task string.
**When** `/fis:handover --agent claude-code "use Bearer eyJ… to test"` runs.
**Expect** immediate refusal (before the handoff step) with a message
asking the user to rephrase without the credential. No artifact is
written. No dispatch.

### Scenario 6 — Successful captured + reviewed completion

**Given** all preflight passes, `--yes` is set, `--agent claude-code`.
**When** the job dispatches and completes.
**Expect** the report cites the run dir, the review verdict, produced
artifacts (patch, diff, run log), the verification-status summary, and the
next action. The handoff artifact path is still surfaced.

### Scenario 7 — `--agent internal` with `--model` rejection

**Given** `/fis:handover --agent internal --model anthropic/claude-sonnet-5
"…"`.
**When** the skill runs.
**Expect** immediate refusal explaining that an internal subagent inherits
the session model and a job spec cannot set `model:` for it; suggests
rerunning without `--model` or with a CLI runtime.

## Non-goals

- Multi-job graphs and parallel teammates — that is `/fis:team`.
- General runtime discovery, capability probing, or a model-routing policy —
  this skill preflights only the one runtime the user selected.
- Deciding which coding agent is "best" for a task — this skill dispatches
  what the user selects; if the user wants a recommendation, consult the
  `kongming` or `advisor` agent first.
- Anything derived from CI history or team status — that is `/fis:watzup`.
