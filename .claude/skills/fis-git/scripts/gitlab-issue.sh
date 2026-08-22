#!/usr/bin/env bash
#
# gitlab-issue.sh — create a GitLab issue (self-hosted aware) with optional
# due date and time tracking (estimate / spent).
#
# Usage:
#   claude/skills/fis-git/scripts/gitlab-issue.sh --title "..." [options]
#
# Options:
#   --title <t>           (required) issue title
#   --description <d>     issue body (markdown); use --desc-file to read from a file
#   --desc-file <path>    read description from a file
#   --due <YYYY-MM-DD>    due date
#   --estimate <dur>      time estimate, e.g. 3h, 1d, 2h30m, 1w
#   --spent <dur>         time already spent, e.g. 1h30m
#   --labels <a,b,c>      comma-separated labels
#   --assignee <user>     username to assign (resolved to id)
#   --milestone <title>   milestone title (resolved to id)
#   --weight <n>          issue weight
#   --confidential        mark the issue confidential
#   --repo <host/group/project>   override target (default: from git remote)
#
# Auth: GITLAB_TOKEN env var, else the stored git credential for the host.
# Duration format is GitLab's own: mo (month) w d h m — e.g. "3h30m", "1d", "1w".
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

TITLE="" DESC="" DESC_FILE="" DUE="" EST="" SPENT="" LABELS="" ASSIGNEE="" MILESTONE="" WEIGHT="" CONF="" REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --title)        TITLE="$2"; shift 2 ;;
    --description)  DESC="$2"; shift 2 ;;
    --desc-file)    DESC_FILE="$2"; shift 2 ;;
    --due)          DUE="$2"; shift 2 ;;
    --estimate)     EST="$2"; shift 2 ;;
    --spent)        SPENT="$2"; shift 2 ;;
    --labels)       LABELS="$2"; shift 2 ;;
    --assignee)     ASSIGNEE="$2"; shift 2 ;;
    --milestone)    MILESTONE="$2"; shift 2 ;;
    --weight)       WEIGHT="$2"; shift 2 ;;
    --confidential) CONF="true"; shift ;;
    --repo)         REPO="$2"; shift 2 ;;
    -h|--help)      sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$TITLE" ] || { echo "error: --title is required" >&2; exit 2; }
[ -n "$DESC_FILE" ] && DESC="$(cat "$DESC_FILE")"

# ── Resolve host + project ──────────────────────────────────────────────────
if [ -n "$REPO" ]; then
  HOST="${REPO%%/*}"; PROJPATH="${REPO#*/}"
else
  REMOTE=$(git remote get-url origin)
  case "$REMOTE" in
    git@*)  HOSTPATH="${REMOTE#git@}"; HOST="${HOSTPATH%%:*}"; PROJPATH="${HOSTPATH#*:}" ;;
    *://*)  REST="${REMOTE#*://}"; REST="${REST#*@}"; HOST="${REST%%/*}"; PROJPATH="${REST#*/}" ;;
    *) echo "error: cannot parse remote: $REMOTE" >&2; exit 1 ;;
  esac
  PROJPATH="${PROJPATH%.git}"
fi
case "$HOST" in
  *github.com*) echo "error: this script targets GitLab; the remote is GitHub (use gh)." >&2; exit 1 ;;
esac
API="https://$HOST/api/v4"
PROJ=$(printf '%s' "$PROJPATH" | sed 's#/#%2F#g')

# ── Token ───────────────────────────────────────────────────────────────────
TOKEN="${GITLAB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  TOKEN=$(printf "protocol=https\nhost=%s\n\n" "$HOST" | git credential fill 2>/dev/null | sed -n 's/^password=//p')
fi
[ -n "$TOKEN" ] || { echo "error: no GitLab token. Set GITLAB_TOKEN, or authenticate git to $HOST (e.g. a push) so the credential is stored." >&2; exit 1; }
AUTH=(--header "PRIVATE-TOKEN: $TOKEN")

jq_get() { python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: d=None
print($1)"; }

# ── Resolve assignee / milestone (optional) ─────────────────────────────────
ASSIGNEE_ID=""
if [ -n "$ASSIGNEE" ]; then
  ASSIGNEE_ID=$(curl -s "${AUTH[@]}" "$API/users?username=$ASSIGNEE" | jq_get "d[0]['id'] if isinstance(d,list) and d else ''")
  [ -n "$ASSIGNEE_ID" ] || echo "warning: assignee '$ASSIGNEE' not found; skipping" >&2
fi
MILESTONE_ID=""
if [ -n "$MILESTONE" ]; then
  MS_ENC=$(printf '%s' "$MILESTONE" | sed 's/ /%20/g')
  MILESTONE_ID=$(curl -s "${AUTH[@]}" "$API/projects/$PROJ/milestones?title=$MS_ENC" | jq_get "d[0]['id'] if isinstance(d,list) and d else ''")
  [ -n "$MILESTONE_ID" ] || echo "warning: milestone '$MILESTONE' not found; skipping" >&2
fi

# ── Create the issue (title, description, due date, labels, weight, confidential) ─
create=(--data-urlencode "title=$TITLE")
[ -n "$DESC" ]         && create+=(--data-urlencode "description=$DESC")
[ -n "$DUE" ]          && create+=(--data-urlencode "due_date=$DUE")
[ -n "$LABELS" ]       && create+=(--data-urlencode "labels=$LABELS")
[ -n "$WEIGHT" ]       && create+=(--data-urlencode "weight=$WEIGHT")
[ -n "$CONF" ]         && create+=(--data-urlencode "confidential=true")
[ -n "$ASSIGNEE_ID" ]  && create+=(--data-urlencode "assignee_ids[]=$ASSIGNEE_ID")
[ -n "$MILESTONE_ID" ] && create+=(--data-urlencode "milestone_id=$MILESTONE_ID")

RESP=$(curl -s --request POST "${AUTH[@]}" "${create[@]}" "$API/projects/$PROJ/issues")
IID=$(printf '%s' "$RESP" | jq_get "d.get('iid','') if isinstance(d,dict) else ''")
URL=$(printf '%s' "$RESP" | jq_get "d.get('web_url','') if isinstance(d,dict) else ''")
if [ -z "$IID" ]; then
  echo "error: issue creation failed (HTTP body below):" >&2
  printf '%s\n' "$RESP" | head -c 500 >&2; echo >&2
  exit 1
fi
echo "created issue #$IID"
[ -n "$DUE" ] && echo "  due: $DUE"

# ── Time tracking (dedicated endpoints; not settable in the create call) ─────
if [ -n "$EST" ]; then
  curl -s --request POST "${AUTH[@]}" --data-urlencode "duration=$EST" \
    "$API/projects/$PROJ/issues/$IID/time_estimate" >/dev/null && echo "  estimate: $EST"
fi
if [ -n "$SPENT" ]; then
  curl -s --request POST "${AUTH[@]}" --data-urlencode "duration=$SPENT" \
    "$API/projects/$PROJ/issues/$IID/add_spent_time" >/dev/null && echo "  spent: $SPENT"
fi

echo "$URL"
