# Writing language for merge/pull request prose

Shared by `fis:ship` and `fis:review-mr`.

## Resolve before authoring

```bash
node scripts/fis-config.cjs resolve --json | jq -r '.prefs.locale.response_language // "en"'
```

Run it from the kit directory the plan accessor resolves from (`.claude/` in a
project install, `~/.claude/` global). Use the resolved value for all
human-facing forge prose. When the configured value is unusable and the default
is applied instead, state the fallback explicitly in the request body — do not
claim the unsupported tag was honored.

## Precedence

The config resolver already layers these, highest first:

1. project `.fisrc.json` → `locale.responseLanguage`
2. project config yaml → `locale.response_language`
3. user `.fisrc.json` → `locale.responseLanguage`
4. user config yaml → `locale.response_language`
5. Default: `en`

## What is localized

- Merge/pull request description headings and prose (`fis:ship`)
- Review Summary / Risk / Findings / Verdict / handoff text (`fis:review-mr`)
- Checklist labels and human-action requests

## What stays intact

- Conventional-commit **titles** (English)
- Code, commands, paths, URLs, identifiers
- Forge keywords (`Closes #123`, `Relates to #456`)
- User-provided quotes, issue titles, error output, evidence blobs

## Invalid tags

Normalize to lowercase BCP47-like `/^[a-z]{2,3}(-[a-z0-9]+)*$/`. Skip an invalid
candidate so a lower-precedence source can still win. If every configured value
is invalid or empty, use `en` and say which values were rejected.
