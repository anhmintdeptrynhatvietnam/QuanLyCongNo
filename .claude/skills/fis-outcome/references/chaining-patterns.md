# Chaining Patterns

How to compose installed capabilities into a workflow: the skeleton, the link
contract, context passing, when to collapse, when to insert, and how to recover.

Nucleus delivery sequencing for engineering work is owned by
`workflow-routing.md` in this directory and by
`.claude/rules/skill-workflow-routing.md`. Load those for the sequences; this
file never re-lists their tables. Content and campaign sequences live here
because no installed reference owns them today; if a marketing routing
reference ships later, that section slims to a pointer.

Every capability named below is resolved against the runtime's live
installed-skill catalog at decision time (router step R2). A skill named here
is the capability's usual owner in this kit, not a guarantee that it is
installed.

## The Skeleton

Every chain is a subset of:

```text
understand -> decide -> execute -> verify -> deliver
```

| Link | Purpose | Typical owners |
|------|---------|----------------|
| understand | Gather the facts the next link needs | scouting and research capabilities (`/fis:scout`, `/fis:research`), read-only `explore` / `researcher` agents |
| decide | Turn facts into an approach the DRI would accept | option and planning capabilities (`/fis:brainstorm`, `/fis:plan`), `planner` agent |
| execute | Produce the artifact | domain capability running under the implementation capability (`/fis:craft`, `/fis:fix`) |
| verify | Prove the artifact does what was decided | test and review capabilities (`/fis:test`, `/fis:code-review`), `tester` and `code-reviewer` agents |
| deliver | Ship, publish, or report | release capability (`/fis:ship`, `/fis:git`), outcome-first report in the issue/PR |

Chains run forward only. A discovered problem creates a detour, not a
reshuffle.

## Link Contract

- **Entry criteria**: the inputs the link needs exist and are named (a file, a
  report, a decision). If entry criteria are not met, the previous link is not
  done — do not start the link anyway.
- **Exit criteria**: the link produced its artifact and it is verifiable (file
  written, tests green, acceptance criterion checked off). "Mostly done" does
  not exit.
- **Single owner**: one skill or agent owns each link. Helpers feed the owner;
  they do not share the pen.

## Context Passing

- Chains of one or two links pass context in-conversation.
- Longer chains write artifacts to files and pass paths, not prose summaries —
  the next link rereads the artifact, so nothing is lost to compression. Use
  the plan and report layout in
  `../../_shared/references/workflow-artifacts.md`
  (`plans/<slug>/plan.md`, `plans/<slug>/phase-XX-<name>.md`,
  `plans/<slug>/reports/`).
- A link's report states: what was produced, where, what the next link needs to
  know, open concerns. Nothing else.
- Scope-affecting flags travel with the context. `--yagni` above all: a link or
  delegate that never sees it silently reverts to the FIS AI Kit default of
  delivering the full requested scope.

## Collapse Rule (keep chains short)

Merge or drop a link when ALL of:

1. Its owner would spend under ~5 minutes of focused work.
2. It produces no artifact a later link rereads.
3. Skipping it removes no verification the risk class demands.

A three-link chain that fits the task beats a five-link chain that fits the
diagram. Verification links are exempt from collapse at elevated and high risk
(FIS R3 and R4).

## Insertion Rule

Modifiers add links; nothing else does:

- size epic → insert `decide` (planning) if absent, split `execute` by phase.
- risk elevated (R3) → insert `verify` if absent.
- risk high (R4) → insert `verify` AND an independent review, plus explicit
  user confirmation before the irreversible step.
- domains 2+ → one execute sub-link per domain, dependency-ordered.

The Risk → Gate table in `workflow-routing.md` is the authority for which
specific gates each FIS risk level makes mandatory; this rule only decides
whether a link exists at all.

## Engineering Delivery Sequences

Owned by `workflow-routing.md` (nucleus sequence, mode behavior, Risk → Gate,
deviation conditions) and `.claude/rules/skill-workflow-routing.md` (core
development, bugfix, and investigation shapes). Load them when the class is
build-feature, fix-defect, investigate-explain, review-audit, or ship-release
on a codebase. When the domain choice is ambiguous first, resolve it through
`.claude/rules/skill-domain-routing.md` and the installed-pack resolution table
in `../../fis-find-skills/references/domain-routing.md`.

## Content and Campaign Sequences

FIS AI Kit installs content capabilities but no campaign-workflow reference, so
the shapes live here. They are written as capabilities: resolve each against
the installed catalog at R2, and drop a link whose capability is absent rather
than inventing a command for it.

**Campaign or launch** (class plan-campaign):

```text
market/audience research -> positioning and audience definition -> campaign brief
  -> per-channel production (copywriting, visual design, image or video assets)
  -> measurement setup
```

Researcher agents run the research links in parallel; one content owner per
channel once the brief exists; an independent reviewer gates every channel
before anything publishes — a mass-audience send is high risk.

**Single content piece** (class create-content):

```text
brand/voice input -> copywriting capability -> organic-reach pass (only when the
  piece needs discoverability) -> independent content review -> publish or schedule
```

**Performance diagnosis** (class analyze-performance):

```text
pull the metrics -> locate the bottleneck -> targeted fix -> prove the fix with a
  measured comparison
```

## Failure and Detours

- A failed link never advances the chain. Detour: diagnose (`/fis:debug` or the
  `debugger` agent), or rescope the link, then resume AT the failed link.
- Two consecutive failures of the same link: stop the chain, report what ran,
  what failed, and the smallest missing input. The outcome-level iteration cap
  in `../SKILL.md` still applies (max 3 fix attempts on one failure).
- New information that invalidates a completed link: say so explicitly, then
  redo from that link forward. A silent partial redo corrupts the chain's
  artifacts.
