# CI/CD Fix Workflow

For pipeline failures on the repository's forge — GitLab CI (gitlab.com and
self-hosted) or GitHub Actions.

## Prerequisites
- The provider CLI for the detected remote, installed and authorized
  (`glab` for GitLab, `gh` for GitHub)
- A pipeline/run URL or id

## Provider resolution

```bash
REMOTE=$(git remote get-url origin)
case "$REMOTE" in
  *github.com*) PROVIDER=gh ;;
  *)            PROVIDER=glab ;;   # gitlab.com OR any self-hosted GitLab
esac
```

## Workflow

1. **Fetch logs** with `debugger` agent:
   ```bash
   # GitLab
   glab ci get --pipeline-id <pipeline-id>       # job list + statuses
   glab ci trace <job-id>                        # failing job log

   # GitHub
   gh run view <run-id> --log-failed
   gh run view <run-id> --log
   ```

2. **Analyze** root cause from logs

3. **Implement fix** based on analysis

4. **Test locally** with `tester` agent before pushing

5. **Iterate** if tests fail, repeat from step 3

## Notes
- If the provider CLI is unavailable or unauthenticated, say so and give the
  one-line remedy (`glab auth login --hostname <host>` or `gh auth login`).
  Never hardcode a host — derive it from the git remote.
- With no CLI at all, ask the user to paste the failing job log; the diagnosis
  steps are unchanged.
- Check both the failed job and preceding jobs for context.
- Common issues: env vars, dependencies, permissions, timeouts.
