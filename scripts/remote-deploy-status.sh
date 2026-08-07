#!/usr/bin/env bash
# Is the RUNNING service actually the build that is on disk?
#
#   cat scripts/remote-deploy-status.sh | bash scripts/droplet.sh 'bash -s'
#
# "Service active" and "build present" can both be true while the process still
# holds older code: systemd keeps serving whatever it started with. The only
# honest check is whether the service started AFTER the build was written.
set -u
APP=/home/deploy/1-percent-more-fluent

echo "commit:      $(cd "$APP" && git rev-parse --short HEAD)  $(cd "$APP" && git log -1 --pretty=%s | cut -c1-48)"
echo "build wrote: $(stat -c '%y' "$APP/.next/standalone/server.js" 2>/dev/null | cut -c1-19 || echo 'MISSING')"
echo "svc started: $(systemctl show fluent -p ActiveEnterTimestamp --value)"
echo "svc state:   $(systemctl is-active fluent)  restarts=$(systemctl show fluent -p NRestarts --value)"

BUILD=$(stat -c '%Y' "$APP/.next/standalone/server.js" 2>/dev/null || echo 0)
START=$(date -d "$(systemctl show fluent -p ActiveEnterTimestamp --value)" +%s 2>/dev/null || echo 0)
if [ "$BUILD" -eq 0 ]; then
  echo "VERDICT:     no build on disk"
elif [ "$START" -gt "$BUILD" ]; then
  echo "VERDICT:     serving the current build"
else
  echo "VERDICT:     STALE - service predates the build, needs a restart"
fi

echo
echo "--- did the per-language migration run? ---"
node -e '
const APP="/home/deploy/1-percent-more-fluent";
const D=require(APP+"/node_modules/better-sqlite3");
const db=new D(APP+"/data/fluent.sqlite",{readonly:true});
const pk=db.prepare("PRAGMA table_info(profiles)").all().filter(c=>c.pk>0).map(c=>c.name);
console.log("profiles key:", pk.join(", ") || "(none)");
console.log("profiles:    ", db.prepare("SELECT COUNT(*) n FROM profiles").get().n, "rows");
const cols=db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
console.log("users has active_language:", cols.includes("active_language"));
' 2>&1 | tail -5
