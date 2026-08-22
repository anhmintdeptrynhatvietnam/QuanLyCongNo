# `/fis:handover` Runtime Catalog

This file owns **handover's dispatch policy** — which candidate runtime IDs
this skill may place in a job spec, and which are explicitly denied.
Availability, flags, auth, models, and capability tiers are **never**
asserted here — they come from the live preflight in
[`../SKILL.md`](../SKILL.md) at run time.

Two questions, no overlap:

- **This file** — policy: is a candidate ID in the user-facing menu?
- **Preflight** — evidence: is a candidate available, authenticated,
  capable, and safe right now?

There is no roster elsewhere to drift from; there is no capability claim
here to drift from. They cannot conflict.

## First-class candidates

Always in the user-facing menu for this skill. Preflight re-verifies
acceptance from live evidence at dispatch time; nothing here asserts current
implementation support.

| ID | Kind | Notes |
|---|---|---|
| `claude-code` | CLI | Default target for interactive-workflow continuation. |
| `codex` | CLI | Non-interactive entry point confirmed at preflight. |
| `skill-run` | Skill-run | Re-entrant FIS AI Kit skill invocation in the current session. |
| `internal` | In-session subagent | Selected from the routing table in [job-spec-template.md](job-spec-template.md). `--model` is rejected. |

## External, preflight-gated

In the user-facing menu but always subject to preflight. A missing binary,
missing authentication, or unverified capability makes the candidate
`unavailable` and returns a blocker without silent substitution.

| ID | Kind |
|---|---|
| `opencode` | CLI |
| `copilot` | CLI |
| `cursor` | CLI |
| `cline` | CLI |
| `qwen-code` | CLI |
| `grok` | CLI |
| `kimi` | CLI |
| `agy` | CLI |

## Not dispatchable

Explicitly denied. Rejecting immediately, with actionable guidance, is
better than a silent substitution or a confusing preflight failure.

| ID | Rejection message |
|---|---|
| `gemini-cli` | "The Gemini CLI is used in FIS AI Kit as a one-shot, non-interactive query runtime (scouting and MCP execution), not as a resumable continuation coding agent, so `/fis:handover` cannot dispatch to it. Choose a first-class runtime (`claude-code`, `codex`, `skill-run`, `internal`) or a preflight-gated external runtime." |

## User-supplied IDs

If the user passes `--agent <id>` that is neither in the menu above nor
`gemini-cli`, refuse with:

> `<id>` is not in the handover dispatch menu. Supported IDs:
> claude-code, codex, skill-run, internal, opencode, copilot, cursor, cline,
> qwen-code, grok, kimi, agy. See
> `claude/skills/fis-handover/references/runtime-catalog.md`.

Do not "help" by picking a substitute. The whole point of `--agent` is
user-selected runtime.

## Adding a new runtime to the menu

1. Confirm preflight can profile the candidate: binary detection,
   authentication check, and a documented non-interactive entry point.
2. Add a row to First-class or External above with the correct kind.
3. Do not add capability, flag, model, or authentication assertions here.
4. Update the refusal message under "User-supplied IDs" to include the
   new ID in the supported list.

Adding a runtime here is a **policy** change — a decision that this skill
is willing to hand a job to that runtime. It never implies the runtime is
installed or usable in the current environment.

## Removing a runtime

1. Move the row to "Not dispatchable" with a rejection message explaining
   why (retired path, incompatible harness, security decision).
2. Update the refusal message.
3. Reference the underlying contract change if any.

## Invariants

- No capability, flag, model, or authentication assertion appears in this
  file.
- No live-probe result appears in this file.
- The `gemini-cli` row is preserved until a documented resumable
  continuation mode exists for it.
- Every ID in First-class + External must be a value this skill can
  currently accept as `runtime:` in a job spec.
