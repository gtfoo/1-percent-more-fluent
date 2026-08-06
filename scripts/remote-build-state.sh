#!/usr/bin/env bash
# What is currently building on the droplet, and for which app?
#
#   cat scripts/remote-build-state.sh | bash scripts/droplet.sh 'bash -s'
#
# The droplet hosts several apps, so "is a build running" is not a useful
# question on its own - carpark recompiling better-sqlite3 looks identical to
# this app doing it. Every process is reported with the directory it is working
# in, which is the only thing that distinguishes them.
set -u
APP=/home/deploy/1-percent-more-fluent

echo "--- build-ish processes ---"
ps -eo pid,etime,cmd | grep -E '[n]ext build|[n]ode-gyp|[n]pm ci' || echo "none"

echo
echo "--- which app each belongs to ---"
for p in $(pgrep -f 'next build|node-gyp|npm ci' 2>/dev/null); do
  cwd=$(readlink "/proc/$p/cwd" 2>/dev/null || echo "unreadable")
  echo "$p -> $cwd"
done

echo
echo "--- this app ---"
echo "lock:  $(stat -c '%y' "$APP/.next/lock" 2>/dev/null || echo 'none')"
echo "now:   $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "build: $(ls "$APP/.next/standalone/server.js" 2>/dev/null || echo 'no standalone output')"
echo "svc:   $(systemctl is-active fluent)"
