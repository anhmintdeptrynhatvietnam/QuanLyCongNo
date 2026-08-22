# Development Rules

Use this file when editing code, tests, scripts, or configuration.

## Baseline

- Follow project docs in `docs/` and existing local patterns.
- Apply KISS and DRY. Deliver the full requested scope — do not trim, defer, or
  simplify away features the user explicitly asked for. Add nothing beyond the
  request. When the user passes `--yagni`, additionally apply YAGNI (You Aren't
  Gonna Need It): challenge and cut any scope not needed for the stated outcome.
- Implement real behavior. Do not add fake data, mocks, or temporary shortcuts just to satisfy a check.
- Keep changes scoped to the request and the affected contracts.
- Use descriptive kebab-case file names for new files when the repo has no stronger convention.
- Do not repeat code. Before writing something the codebase already has, reuse
  it: pull shared logic into a common helper, give a fixed set of values an enum
  or named constant, and build one component the callers share instead of
  near-duplicates. Extract on the second real occurrence, not in anticipation of
  one — an abstraction guessed in advance is harder to remove than the
  duplication it replaced.
- Split code only when it reduces real complexity or matches existing module boundaries.

## Quality Gates

- Run the narrowest useful test first, then broaden when shared behavior or public contracts changed.
- Do not hide failing tests, lint, type, build, or syntax errors.
- Preserve public contracts unless the change intentionally updates them and the user accepted that scope.
- Keep commits focused and use conventional commit format without AI references.
- Never commit secrets, dotenv files, tokens, private keys, database credentials, or personal data.

## Tooling

- Use `gh` for GitHub operations when needed.
- Use current docs only when the API/tooling may have changed.
- Use relevant skills by reading their descriptions first, then opening only the needed `SKILL.md`.
- Use `/fis:preview` only when a visual explanation will materially help the user understand the change.

## Metadata Deletions

When renaming or deleting ANY file under `claude/` (skills, hooks, agents, rules, scripts), add the old path to `claude/metadata.json` `deletions[]` **relative to the `claude/` root** (e.g. `hooks/removed-hook.cjs`, `agents/removed-agent.md`; never `claude/hooks/...`).

This tells the CLI installer to remove stale files from user machines on `fis update`. Forgetting it leaves orphaned files that cause conflicts. Do not remove existing deletion entries.
