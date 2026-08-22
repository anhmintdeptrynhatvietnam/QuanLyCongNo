# Plan State: Files-First Model

Shared by every skill that creates, resolves, or mutates a plan (`fis:plan`,
`fis:craft`, `fis:ship`, `fis:vibe`, and any other skill referencing this file).
This is the single description of where plan state lives — do not restate a
divergent copy in another skill; link here instead.

## Canonical state = repo files

- `plans/<timestamp>-<slug>/plan.md` plus `phase-NN-*.md` in the repo ARE the
  plan. Hand-editable Markdown. They are the deliverable of planning skills and
  the only thing implementation skills read to know what to build.
- A project with no git remote, no forge auth, and no network still has a fully
  working plan — because the files are the plan.

## The accessor is one writer, not a second source of truth

Invoke it by path; FIS AI Kit is installed by the DAI desktop app, so no `fis`
binary is guaranteed to be on PATH:

```
node <accessor> <use|unuse|resolve|list|show|status|check|uncheck|update> [--plan <path>] [--cwd <dir>] [--json]
```

`<accessor>` is the `fis-plan.cjs` path the session context injects
(`.claude/scripts/fis-plan.cjs` in a project install, `~/.claude/scripts/…`
global). Never hardcode one — a hardcoded path breaks under the other install
shape.

It exists so `plan.md` and the phase files cannot drift apart: a status change
touches both in one locked, atomic operation. There is no database and no cache
to reindex. Read commands (`resolve`, `list`, `show`, `status`) never mutate;
write commands (`check`, `uncheck`, `update`) write the Markdown files.

## Current-plan resolution

Two pointers, deliberately:

- **Session pointer** — what `set-active-plan.cjs` writes and the hooks read. It
  dies with the session.
- **Worktree pointer** — `node <accessor> use <plan-dir>` pins a plan for this
  worktree and branch, under the user directory rather than the checkout. It
  survives a restart, and two worktrees on different branches pin different
  plans. It holds nothing but a path, so a lost pointer costs a resolution
  shortcut and no state.

Resolution order: the pinned pointer first, then `node <accessor> resolve`,
which matches the current repo and branch. Read phase content with
`node <accessor> show [phase]` (or the files directly) — never from issue or
merge-request comments, and never require a linked issue to resolve or progress
a plan.

## Forge issue = optional visibility projection, never canonical

- Publishing is the agent's job, not the accessor's: the agent projects a
  validated plan onto an issue (create or update) using the provider CLI for the
  detected remote — `glab` on GitLab, `gh` on GitHub. There is no publish
  subcommand.
- Publishing is never required and never the source of truth. Skip it entirely
  in a repo with no forge remote, no auth, or when the user does not ask for it —
  the plan is still fully usable as files. When the user asks to publish but the
  provider CLI or auth is unavailable, skip without failing and report one line
  suggesting how to enable it (e.g. `glab auth login`, `gh auth login`).
- Publishing never overwrites the body of a pre-existing issue a plan was
  created from; it only adds links, comments, or labels.
- If a linked issue and the files ever disagree on status, the files win. The
  issue is a mirror, not a lock.

### Publish-safety protocol

When an agent does project a plan onto an issue, follow this so the projection
is safe, idempotent, and recoverable.

1. **Gate every publish, not just the first.** Visibility can flip and new phase
   evidence appears, so on each write confirm the target project/issue visibility
   is acceptable for the content, then run a secret scan over the *rendered*
   projection text after composing it. Never project raw logs, env values,
   tokens, credentials, or local absolute paths. If the rendered body would
   exceed the provider's comment limit, truncate to a repo-relative plan-path
   link — do not split across comments.
2. **Provenance is a breadcrumb, not state.** FIS keeps no index to hold issue
   ids, so record the linkage where a human and a later agent will both see it: a
   `Tracking: <issue-url>` line in the plan body. It is non-authoritative by
   construction — the files still win.
3. **Adopt before you create.** Embed a stable marker in every bot-authored
   projected comment: `<!-- fis-plan <plan-dir-basename> hash=<12-hex> branch=<branch> -->`.
   Before creating a new root comment, scan the issue's existing comments for
   that marker; on a unique authored-by-self match, **adopt** it instead of
   posting a duplicate.
4. **Author-verify before editing.** Only edit a comment the current provider
   identity authored. Identities differ across machines and CI, so on a mismatch —
   or a missing or edited marker — **append a new marked comment**; never edit
   another author's comment and never abort the delivery over it.
5. **Rev-echo for idempotency and tamper detection.** The marker carries a short
   content hash of the rendered body. Before rewriting, re-read the comment: if
   the hash matches what you last wrote, skip the write; if the marker or hash is
   missing or altered, a human or another bot touched it — append rather than
   overwrite. Do not build compare-and-swap logic: the projection is derived and
   regenerable, and the files always win.
6. **Fail safe on missing or rate-limited issues.** A 404/410 (issue moved,
   deleted, or locked) → report and stop; never auto-create a replacement issue.
   On rate limits or a partial write, back off, skip, and report — never
   retry-loop.

## Delivery finalization (finish on ship)

When a plan-backed change ships, finalize the plan so its files stop reading as
active work — the core "stale plan read as false context" mitigation.

**On ship success, before the ship commit:**

1. Resolve the active plan (`node <accessor> resolve`). A resolve-miss means no
   active plan for this repo and branch — **skip finalization silently**; most
   ships carry no plan. Only an ambiguity error, or a failure partway through the
   steps below, warrants a warning plus the exact plan-dir path.
2. Verify the phase checkboxes reflect reality (`node <accessor> status` prints
   the progress summary). If the diff proves a phase's boxes done,
   `node <accessor> check <phase> <item>` them. If the work is genuinely partial,
   `node <accessor> update --status in-progress` and stop — never blind-complete
   a half-done plan.
3. When the plan is actually complete, `node <accessor> update --status completed`.
   This rewrites the canonical `status:` in `plan.md`. The ship's own commit then
   carries the finalized plan files onto the branch, so `status: completed`
   reaches the target branch in the **same merge** as the code it describes — the
   files can never claim completion for code that did not land. Make this a
   synchronous, foreground step.

Because the files are the only state, there is no separate index close on merge.
After the merge, optionally append one marked comment to a linked issue ("plan
completed, request !N merged") under the publish gates above.

Degrade honestly: if the accessor is unavailable or any step fails, report the
exact plan-dir path and reason and complete the delivery with a warning — never
hand-edit a status line and never delete plan files.

## Rules for skills consuming this model

1. Resolve the current plan via the pinned worktree pointer (`use`) first,
   falling back to `resolve` — never assume a forge issue must exist.
2. Read phase content via `show` (or the files directly), not via issue comments.
3. Mutate status via the accessor's write commands so `plan.md` and the phase
   files stay in sync; do not hand-edit a phases table or a status cell.
4. Treat publishing as an additive, opt-in visibility step that runs after the
   plan is already valid as files — never as a prerequisite for planning or
   implementation to proceed.
5. Reference the accessor through the injected path, and check `--help`-level
   usage in the script header for exact flags rather than trusting this file.
