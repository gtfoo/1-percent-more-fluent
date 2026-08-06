#!/usr/bin/env bash
# Finish a deploy whose build was cut short, WITHOUT re-running npm ci.
#
#   cat scripts/remote-finish-build.sh | bash scripts/droplet.sh 'bash -s'
#   cat scripts/remote-finish-build.sh | bash scripts/droplet.sh 'bash -s status'
#
# Why this exists: the GitHub Actions SSH step has a fixed command timeout, and
# `npm ci` on a 1 vCPU droplet - which recompiles better-sqlite3 from source -
# now eats most of it. When the build is killed partway the repo is left with no
# .next at all, because deploy.sh removes it before building. The service keeps
# serving from the process already in memory, so nothing looks wrong until it
# restarts and cannot come back.
#
# Detached, because the same SSH fragility that caused the problem will happily
# kill the fix: the build runs under setsid with a log, and this script returns
# immediately. Run it again with `status` to see where it got to.
set -uo pipefail
APP=/home/deploy/1-percent-more-fluent
LOG=/tmp/fluent-finish-build.log
cd "$APP"

if [ "${1:-}" = "status" ]; then
  echo "--- tail of $LOG ---"
  tail -15 "$LOG" 2>/dev/null || echo "(no log yet)"
  echo
  echo "running: $(pgrep -fc 'next build' 2>/dev/null || echo 0) next build process(es)"
  echo "build:   $(ls "$APP/.next/standalone/server.js" 2>/dev/null || echo 'no standalone output')"
  echo "svc:     $(systemctl is-active fluent)"
  exit 0
fi

setsid nohup bash -c '
  set -euo pipefail
  cd '"$APP"'

  # The droplet is 1 vCPU with 1GB of RAM and hosts more than this app. Building
  # while another app compiles better-sqlite3 risks the OOM killer choosing the
  # running fluent process - which, with the build output missing, is the only
  # thing still serving the site. Queue rather than compete.
  # The bracket is load-bearing. pgrep -f matches whole command lines, and this
  # script IS a command line containing the pattern - so a plain "node-gyp"
  # matched the waiting process itself, and it queued behind itself until the
  # loop ran out. "[n]ode-gyp" matches a real node-gyp but not the literal text
  # here. Same trap as the pkill -f note in dev.sh.
  for _ in $(seq 1 90); do
    busy=$(pgrep -f "[n]ode-gyp|[n]pm ci" | wc -l)
    [ "$busy" -eq 0 ] && break
    echo "waiting: $busy build process(es) elsewhere on the host"
    sleep 20
  done

  echo "==> next build"
  npm run build

  echo "==> assembling standalone output"
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public

  echo "==> restarting"
  sudo systemctl restart fluent
  sleep 4
  systemctl is-active fluent
  echo "==> done"
' > "$LOG" 2>&1 &
disown

echo "started, logging to $LOG"
