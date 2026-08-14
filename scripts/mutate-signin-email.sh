#!/usr/bin/env bash
# Prove scripts/check-signin-email.ts can actually fail.
#
#   bash scripts/mutate-signin-email.sh
#
# Break the email six ways that matter and confirm the check catches each one.
# A check that cannot fail is worse than no check: it retires the worry without
# doing the work, and you find out when somebody cannot sign in and does not
# tell you.
#
# Suggested by the career-side-quests agent, who had shipped a vacuous test in
# that repo before - it passed because the thing it tested never ran. Worth the
# twenty minutes: two of the six mutations below survived the first time, and
# both were assertions that looked right.
#
#   - "states the expiry" checked that "15 minutes" appeared SOMEWHERE. The
#     preheader says it too, so the sentence the reader actually sees could
#     drift to five minutes and the check still passed.
#   - "the raw URL appears as text" counted occurrences of the URL, which are
#     satisfied by two href attributes. The visible fallback link could be
#     reworded to "click here" - readable address nowhere - and it passed.
#
# Not wired into check.sh: it rewrites a tracked file and restores it, which is
# not something a routine pre-commit run should be doing. Run it when the check
# or the email changes.
set -u
cd "$(dirname "$0")/.." || exit 1
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 20 >/dev/null 2>&1

F=src/server/signin-email.ts

if ! git diff --quiet -- "$F"; then
  echo "$F has uncommitted changes; commit or stash first - this script restores by checkout."
  exit 1
fi
trap 'git checkout -- "$F" 2>/dev/null' EXIT

run() { npx tsx scripts/check-signin-email.ts >/dev/null 2>&1; }

if run; then echo "ok   baseline passes"; else echo "FAIL baseline is already broken"; exit 1; fi

survivors=0
mutate() {
  local name="$1"; shift
  git checkout -- "$F"
  "$@"
  if run; then
    echo "SURVIVED  $name"
    survivors=$((survivors + 1))
  else
    echo "caught    $name"
  fi
  git checkout -- "$F"
}

# The link arrives truncated at the first & in a strict client.
mutate "unescaped & in the href" \
  perl -0pi -e 's/const safeUrl = url\.replace\(\/&\/g, "&amp;"\);/const safeUrl = url;/' "$F"

# Promises a window that is not the one the token has.
mutate "expiry copy drifts from LINK_MINUTES" \
  perl -0pi -e 's/\$\{expiresInMinutes\} minutes<\/strong>/5 minutes<\/strong>/' "$F"

# Blocked by default in most clients.
mutate "load-bearing <img> added" \
  perl -0pi -e 's/<h1 /<img src="https:\/\/example.com\/logo.png"><h1 /' "$F"

# Outlook renders through Word and collapses this to one column.
mutate "layout switched off tables" \
  perl -0pi -e 's/<table role="presentation"/<div style="display:flex"/g' "$F"

# Scores worse with spam filters, and this message has to arrive.
mutate "plain-text part emptied" \
  perl -0pi -e 's/const text = \[/const text = [].length ? [/' "$F"

# A client that strips the button leaves the reader no way in.
mutate "fallback URL no longer readable" \
  perl -0pi -e 's/>\$\{safeUrl\}<\/a>/>click here<\/a>/' "$F"

echo
if [ "$survivors" -gt 0 ]; then
  echo "$survivors mutation(s) survived - the check has holes"
  exit 1
fi
echo "every mutation caught"
