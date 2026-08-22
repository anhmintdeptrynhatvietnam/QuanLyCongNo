---
name: fis:outcome
description: "Task router and single-DRI outcome owner. Classifies the task, inventories what is actually installed, chains capabilities into the shortest workflow that fits, and spawns subagents at defined trigger points — then frames, implements, and verifies the outcome against acceptance criteria and tests/CI."
user-invocable: true
when_to_use: "Invoke at the start of multi-step, multi-domain, or ambiguous work, when the right skill or sequence is unclear, or when one person owns a well-defined outcome end-to-end."
category: utilities
keywords: [outcome, dri, routing, dispatch, chaining, subagents, acceptance-criteria, workflow, orchestration, quality-gates]
argument-hint: "[outcome description] [--fast|--parallel]"
metadata:
  author: fis-ai-kit
  version: "1.3.0"
---

# Outcome — Task Router and One DRI, One Outcome

Two jobs, in order.

1. **Route.** Classify the task, resolve it against the capabilities actually
   installed, and chain the shortest workflow that fits. Spawn subagents at the
   trigger points where they raise quality.
2. **Own the outcome.** One human owns one outcome end-to-end. The system of
   record is the issue + PR + acceptance criteria + tests/CI.

**No role relay. No mandatory artifact chain. No role handoffs.**

## Boundaries

**This skill classifies and chains; `/fis:craft` implements.** The router
decides which capability owns each link and when; the routed skill or agent
does the work inside that link.

| Situation | Owner |
|-----------|-------|
| Pick and sequence installed capabilities, time subagent spawns, in this session | this skill |
| Frame, verify, and close a scoped outcome with one DRI | this skill |
| Implement a feature, plan, or phase | `/fis:craft` |
| Diagnose and repair a defect or CI failure | `/fis:fix` (root cause first: `/fis:debug`) |
| Coordinate multiple sessions or teammates | `/fis:team` |
| Isolate parallel workstreams on separate branches | `/fis:worktree` |
| Discover or install a capability you do not have yet | `/fis:find-skills` |
| Execute the domain work itself | the routed skill or agent owns execution |

If the request is explicitly about running coordinated multi-session work or
isolating parallel branches, hand off now and stop routing.

## Operating contract (read first)

This skill routes a workflow and then owns an outcome. When invoked, **do not
jump straight to producing the deliverable.**

1. **Run the routing protocol first (R0–R2 are cheap and mandatory).** R0 may
   send the task to a single better-fitting skill; when it does, invoke that
   skill and stop — the routed skill's own gates apply, and no outcome ceremony
   is added on top.
2. **If this skill keeps the task, always start at Step 1 (Frame). Never write
   code, files, or any deliverable before the outcome is framed** — even a
   single HTML page or a "quick" task.
3. **Emit the frame explicitly, in your reply:** one-sentence outcome, 3–5
   acceptance criteria, out-of-scope, risk (R1–R4), and the chosen mode
   (`default` / `--fast` / `--parallel`). For anything above a trivial R1
   change, **pause for DRI confirmation** before implementing.
   - **Acceptance criteria must have a home (issue/PR).** Keeping them
     chat-only is allowed *only* for a throwaway you flag as such and the user
     agrees — **never drop the issue/PR home silently, including in `--fast`.**
     If you cannot create the issue (e.g. wrong/absent Git CLI), say so and
     offer the fallback (see Step 1 + `references/frame-template.md`).
4. **Implement only through the nucleus capabilities** — `/fis:craft` or
   `/fis:fix` (frontend/UI work: `/fis:frontend-design`). Do not hand-roll the
   implementation outside the flow.
5. **"Done" requires verified acceptance criteria** (Step 4 Test, plus the
   mode's review/ship). Producing an artifact and saying "done" is not
   completion.
6. If the request is exploration or a throwaway prototype with **no scoped
   outcome**, say so and route to the right skill (see "When NOT to Use")
   instead of silently building.

If you skip routing and framing and go straight to output, you are running the
wrong flow.

## Principles

- One human DRI owns every decision and trade-off for the outcome.
- Acceptance criteria live in the issue / PR description — not a generated PRD.
- Tests and CI are the contract. Passing tests + accepted criteria = done.
- Route to a capability only after confirming it is installed.
- Pull in Tier 2 or domain skills when the outcome genuinely needs them; do not
  activate them by default.
- Default delivers the full requested scope. `--yagni` is the opt-in that cuts
  scope, and it must travel to every link and delegate that receives it.

## Usage

```
/fis:outcome <outcome description>
```

**Example:**
```
/fis:outcome "Add rate limiting to the payments API so abuse is caught before the daily cap"
/fis:outcome "Fix the session expiry bug reported in issue #421" --fast
```

## Routing Protocol

Six steps, labelled R0–R5 so they never collide with the delivery steps below.
R0–R2 are cheap and mandatory; R3–R5 scale with the task.

### R0 — Proportionality gate (always run first)

Routing ceremony on a trivial task is itself a quality failure.

| Condition | Action |
|-----------|--------|
| User names a skill to use | Invoke that skill. Stop routing. |
| Single domain, single step, one obviously matching installed skill | Invoke it directly. Stop routing. |
| Pure conversation, opinion, or fact question | Answer. No skills, no agents. |
| Multi-step, multi-domain, ambiguous match, high risk, or no obvious skill | Continue to R1. |

### R1 — Classify the task

Output one line before acting:

```
Route: <workflow class> | size: <trivial|standard|epic> | risk: <low|elevated|high> | domains: <n>
```

The class gives the default route shape; the modifiers bend it. When a task
spans classes, pick the class of the FINAL deliverable and treat the others as
links inside its chain.

| Class | Signals (user phrasing) | Default route shape |
|-------|-------------------------|---------------------|
| build-feature | "implement / add / build X", new capability | scout → plan (size ≥ standard) → execute (domain skill under `/fis:craft`) → test → review (elevated+ risk) |
| fix-defect | "broken / error / bug / failing / CI red" | `/fis:fix` directly; `debugger` role after two failed attempts; verify with a test link |
| investigate-explain | "why / how does / understand / compare / what happens if" | scout → analysis (`/fis:debug` or `/fis:ask`) → findings report; no mutation links; parallel `explore` roles when >2 areas |
| review-audit | "review / audit / check quality / security posture" | `/fis:code-review` or `/fis:security` → verified findings report; independent `code-reviewer` for cross-module or security scope |
| ship-release | "ship / open the request / release / publish the branch" | verify state (tests green, diff reviewed) → `/fis:ship`; reviewer BEFORE this class starts, not during |
| create-content | "write / draft / post / email / landing copy" | voice/brand input → writing capability → discoverability pass → independent content review → publish or schedule |
| plan-campaign | "campaign / launch / funnel / go-to-market" | research → audience/positioning → brief → per-channel production → measurement setup (see `references/chaining-patterns.md`) |
| analyze-performance | "metrics / traffic / conversion / report on / trends" | pull data → analysis → recommendations report; delegate large data pulls |
| design-visual | "mockup / logo / banner / diagram / UI design" | design or visual capability per artifact type; `ui-ux-designer` for iteration batches; review only when brand-critical |
| operate-infra | "deploy / docker / kubernetes / database ops / backup" | platform capability (`/fis:deploy`, `/fis:devops`, `/fis:databases`) → verify link (health check, dry run first when destructive) |
| document | "document / readme / changelog / update docs" | `/fis:docs` → accuracy check against the change that triggered it |
| meta-capability | "is there a skill for / can you X / extend tooling" | `/fis:find-skills` → install → re-route the original task |

Class names are stable vocabulary for the routing record; the skills filling
each slot come from the R2 inventory, never from this table.

**Size**

| Size | Test | Effect on route |
|------|------|-----------------|
| trivial | One file or artifact, < 30 min, no unknowns | Collapse to a single skill or inline work; skip planning; no subagents |
| standard | One deliverable, few files, minor unknowns | Default shape as-is |
| epic | Multiple deliverables or subsystems, real unknowns | Insert the planning link; split execution into phases; delegate phases with disjoint file ownership |

**Risk** — the router's three classes map onto the outcome's R1–R4 blast radius:

| Router risk | Outcome risk | Test |
|-------------|--------------|------|
| low | R1–R2 | Internal, reversible, no audience |
| elevated | R3 | User-visible behavior, cross-module or shared-contract reach |
| high | R4 | Public contract, security, credentials, data migration, money, destructive op, mass-audience send |

Risk is set by the highest-risk link in the chain, not the average.

**Domain count** — 1 domain: a single domain capability owns execution. 2+
domains: one execute sub-link per domain, sequenced by dependency; the workflow
capability owns the spine, and two domain skills never co-own one link.

**Ambiguity rule:** if two classes fit equally, prefer the one whose default
shape is shorter and say so in the routing record. Upgrading a route mid-task
on new evidence is cheap; unwinding ceremony is not.

### R2 — Inventory what is actually installed

Never route to a capability that is not installed, and never rely on a bundled
list — kit composition changes. Discovery is runtime-native: read the live
installed-skill catalog and the live agent inventory the runtime supplies this
session, and trust that list over memory or any table in this kit.

Capability missing? Use `/fis:find-skills` to discover and install it;
otherwise do the work inline and name the gap in your final report. Do not
silently pretend the capability exists.

### R3 — Select and chain capabilities

Selection precedence:

1. The skill the user named.
2. Domain-specific capability over workflow-generic capability (a React feature
   resolves to the frontend capability first, then executes through the
   workflow capabilities).
3. One primary capability per distinct intent; secondary capabilities are
   follow-up helpers, not co-owners.

Consult the owning references instead of guessing, and instead of re-deriving
what they already encode:

| Decision | Load |
|----------|------|
| Which domain capability fits this intent | `.claude/rules/skill-domain-routing.md`, then `../fis-find-skills/references/domain-routing.md` for the installed pack that serves it |
| Which sequence fits multi-step dev work | `.claude/rules/skill-workflow-routing.md` and `references/workflow-routing.md` |
| Which visual or preview mode fits | `../fis-preview/references/visual-explanation-routing.md` |
| How to compose links, pass context, and recover mid-chain | `references/chaining-patterns.md` |

`references/chaining-patterns.md` owns the chain rules: the
understand → decide → execute → verify → deliver skeleton, entry and exit
criteria per link, artifact passing through report files, the collapse rule
that keeps chains short, and the insertion rule that adds links.

### R4 — Spawn subagents at trigger points

Subagents raise quality when they add a fresh context window, an enforced tool
boundary, parallel wall-clock, or a specialist system prompt — and lower it
when they fragment a task that needed full conversation context.

Load `references/subagent-timing.md` for the trigger table (stage × condition →
role), the delegation contract every spawn must carry, parallel-safety rules,
and runtime-neutral dispatch.

Fast triggers you should never miss:

- Investigation spanning more than two areas → parallel read-only `explore`
  agents at the start, not after you are lost.
- Implementation finished → `tester` before you claim done.
- Ship, publish, or public-contract change ahead → `code-reviewer` first.
- Same failure twice → `debugger` with the evidence so far.

### R5 — Quality gates by risk

Verification is part of done, not optional polish:

| Risk class | Mandatory before delivering |
|------------|-----------------------------|
| low (R1–R2, internal, reversible) | The executing skill's own checks |
| elevated (R3, user-visible behavior, cross-module) | Test/verification link + self-review of the diff or draft |
| high (R4, public contract, security, data, money, destructive, mass-audience send) | Verification link + independent `code-reviewer` + explicit DRI confirmation before the irreversible step |

`references/workflow-routing.md` holds the detailed FIS Risk → Gate table
(Scout, ADR, security scan, review depth, DRI pre-approval). This table is the
floor; that one decides the specifics.

Report outcome-first when the chain completes: what was delivered, which links
ran, which agents were used, what was verified, what gaps remain.

## Modes

| Mode | Sequence | Allowed when |
|------|----------|--------------|
| default | full nucleus (Frame → Plan → Scout? → Implement → Test → Review → Ship) | any outcome |
| `--fast` | Frame → Implement → Test → Ship (Plan is an inline 3-line note; Scout only if unfamiliar; Review folds into Test as self-review) | Risk R1–R2 **and** ≤3 acceptance criteria **and** no public-contract/data-migration/security surface |
| `--parallel` | Plan first, then `/fis:craft --parallel` (or `/fis:team`) across phases | Plan has 3+ independent phases with no shared file ownership |

`--fast` and `--parallel` are mutually exclusive: `--parallel` requires a real plan, `--fast` skips it. If a `--fast` outcome turns out to be R3+ mid-flight, stop and rerun in default mode (see Failure Loop).

**`--fast` still frames.** It shortens the pipeline; it does **not** skip the frame, the acceptance-criteria home (issue/PR), or provider detection. It never drops the issue/PR home silently — at most it defers to chat-only with explicit user consent for a flagged throwaway.

## Workflow

### Step 1 — Frame

**This step is mandatory and comes before any implementation.** Output the frame in your reply as a short block (outcome, acceptance criteria, out-of-scope, risk, mode). For anything above a trivial R1 change, stop and get DRI confirmation before Step 2.

Clarify exactly one outcome with the DRI:

1. **One sentence:** What user or system problem does this solve?
2. **Acceptance criteria:** 3–5 concrete, testable criteria. Write them directly into the issue / PR as a checklist.
3. **Out of scope:** Explicitly name what is NOT included.
4. **Risk level (R1–R4):** Estimate blast radius. This value is not decorative — it drives the required gates below.

| Risk | Blast radius |
|------|--------------|
| R1 | Single file / isolated change |
| R2 | Single service |
| R3 | Multiple services or a shared internal contract |
| R4 | Public API, data migration, auth/security surface, or irreversible action |

If no issue/PR exists yet, create one first so the acceptance criteria have a home. Use `/fis:git` and **detect the provider from the git remote** — GitHub (`gh`) vs GitLab (`glab`, including self-hosted like `gitlab.fis.vn`); never assume GitHub. If the matching CLI is missing or unauthenticated, fall back to the prefilled issue URL or defer criteria into the PR (do not silently skip). Frame template, provider-aware creation, good vs bad criteria, and the checklist format: `references/frame-template.md`.

**Risk drives the gates** — consult `references/workflow-routing.md` for the Risk → Gate table (which of Scout, Architecture/ADR, Security scan, review depth, and DRI pre-approval become mandatory). Then consult `references/domain-routing.md` for Tier 2 / domain skills.

### Step 2 — Plan

Use `/fis:plan` to produce a scoped, phased plan.

- For complex outcomes: use `/fis:scout` first to map affected code, then plan.
- Acceptance criteria from Step 1 become the plan's success criteria.
- Do not create PRD/TRD/Story/TestSpec artifact chains by default.
- Plan, phase, and report file layout: `../_shared/references/workflow-artifacts.md`.

### Step 3 — Implement

Use `/fis:craft` (feature work) or `/fis:fix` (bug/regression) to implement each phase.

Consult `references/workflow-routing.md` for nucleus sequencing and when to deviate.

### Step 4 — Test

Use `/fis:test` to run the test suite and confirm all acceptance criteria are covered by passing tests.

**Acceptance-criteria ↔ test traceability (anti "done-in-name-only"):** map every acceptance criterion to the test(s) that cover it. Any criterion with no covering test is a gap — add a test, or mark it explicitly untestable with a one-line DRI sign-off in the issue/PR. Record the mapping in the PR:

```
- [x] AC1 "rejects over daily cap" → test_ratelimit_daily_cap
- [x] AC2 "returns 429 with retry-after" → test_ratelimit_headers
```

If tests fail, follow the Failure Loop below (`/fis:debug` when the cause is unknown, then `/fis:fix`).

### Step 5 — Review

Use `/fis:code-review` to review the implementation against the acceptance criteria.

### Step 6 — Ship

Use `/fis:ship` to merge and close the outcome.

Mark the issue / PR resolved with evidence: passing CI link + acceptance criteria checked off in the PR description.

## Worked Routes

Every route below runs the framing contract above first. The examples describe
only the routing that follows; they are not alternate workflow authorities.

**"Fix the failing CI on this branch"** — after framing the repaired behavior
and the safety boundary, R0 finds a single domain and an obvious owner. Route
to `/fis:fix`. No chain, no agents unless `/fis:fix` itself escalates. Total
router overhead: one classification line.

**"Add team billing with a payment provider and a settings page"** — class:
build-feature, size: epic, risk: high (money, R4), domains: 3 (backend,
payments, frontend). Chain: `/fis:scout` → `/fis:plan` → implement through
`/fis:craft` with the payments and frontend domain capabilities → `/fis:test` →
`/fis:code-review` → `/fis:ship`. Agents: parallel `explore` roles map the
payment and settings code; one `fullstack-developer` per plan phase with
disjoint file sets; `tester` after implementation; `code-reviewer` before ship,
mandatory at R4.

**"Launch a campaign for the new feature"** — class: plan-campaign, size:
standard, domains: 2+. Chain per the campaign sequence in
`references/chaining-patterns.md`: research → audience and positioning →
campaign brief → per-channel production → measurement setup. Agents:
`researcher` roles in parallel at the start; one content owner per channel; an
independent reviewer before anything publishes, because a mass-audience send is
high risk.

## Anti-Patterns

| Do not | Because |
|--------|---------|
| Spawn a subagent for a two-minute single-file edit | Delegation overhead exceeds the work; quality drops with context loss |
| Build a five-link chain for a single-domain ask | Every link adds handoff loss; the collapse rule exists for this |
| Route to a skill or agent you have not confirmed installed | Broken dispatch mid-task; inventory is R2 for a reason |
| Re-route mid-chain without new evidence | Thrash; reroute once per link on evidence, else surface it to the DRI |
| Copy routing tables from owning rules or references into prompts or docs | They drift; load them at decision time instead |
| Use this skill to coordinate multiple sessions or worktrees | That is `/fis:team` and `/fis:worktree` |
| Skip the independent reviewer on R4 work because the diff "looks clean" | The gate exists precisely for confident mistakes |
| Implement inside the router instead of through `/fis:craft` | The router classifies and chains; it does not hold the pen |

## Failure Loop

The workflow is not one-directional. When a step fails, loop back to the narrowest fixing step — do not silently retry the same action.

- **A failed link never advances the chain.** Detour (fix, diagnose, or rescope the link), then resume AT the failed link.
- **Test fails:** `/fis:debug` if the root cause is unknown, then `/fis:fix`, then re-test.
- **Review finds critical issues:** back to `/fis:craft` or `/fis:fix` for those findings only, then re-review.
- **Ship/CI fails:** `/fis:fix` on the CI failure, then re-run. Flaky or infra failures are escalated, not blindly retried.
- **Scope changes mid-outcome:** stop, return to Step 1, re-confirm acceptance criteria with the DRI. Never silently expand scope.
- **New information invalidates a completed link:** say so, then redo from that link forward. A silent partial redo corrupts the chain's artifacts.

**Subagent status handling:** `BLOCKED` or `NEEDS_CONTEXT` means change the
context, scope, or approach before re-delegating. Never resend the same failing
prompt.

**Iteration cap:** after **3** fix attempts on the same failure without progress, stop and escalate to the DRI with what was tried and the current evidence. Two consecutive failures of the same chain link stop the chain: report what ran, what failed, and the smallest missing input. Blocked-by-external-decision or blocked-by-dependency also escalates immediately. Full loop-back table and escalation contract: `references/workflow-routing.md`.

## Resume (multi-session)

The issue/PR is the only state store — there is no separate progress file. To resume an in-flight outcome, read the issue/PR and derive the current step from its checklist:

| Signal in issue/PR | Current step |
|--------------------|--------------|
| No acceptance criteria written | Step 1 — Frame |
| Criteria written, no plan/branch | Step 2 — Plan |
| Branch/commits exist, tests not attached | Step 3–4 — Implement / Test |
| Test evidence attached, no review note | Step 5 — Review |
| Review approved, not merged | Step 6 — Ship |

## Routing

- See `references/workflow-routing.md` for nucleus sequencing, Risk → Gate table, mode behavior, and the Failure Loop / escalation contract.
- See `references/domain-routing.md` for when to activate Tier 2 or domain pack skills.
- See `references/chaining-patterns.md` for the chain skeleton, link contract, context passing, and collapse/insertion rules.
- See `references/subagent-timing.md` for subagent trigger points, the delegation contract, and parallel safety.
- See `references/frame-template.md` for acceptance-criteria templates and the issue/PR checklist format.
- See `../_shared/references/workflow-artifacts.md` for where plans, phases, and reports live.

## When NOT to Use

- Exploratory research with no specific outcome → use `/fis:brainstorm` or `/fis:research`.
- Ongoing maintenance without a scoped outcome → use nucleus skills directly.
- Pure requirements discovery → use `/fis:elicit` then `/fis:requirements`.
- Multi-session coordination or isolated parallel branches → use `/fis:team` or `/fis:worktree`.

## Workflow Position

**Precedes:** `/fis:plan` → `/fis:scout` → `/fis:craft` / `/fis:fix` → `/fis:test` → `/fis:code-review` → `/fis:ship`
**Related:** `/fis:requirements` (when explicit requirements capture is needed), `/fis:architecture` (when ADR-level decisions are needed), `/fis:find-skills` (when the needed capability is not installed)
