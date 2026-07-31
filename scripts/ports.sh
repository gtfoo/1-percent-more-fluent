#!/usr/bin/env bash
# Read-only: what is listening inside WSL, and which project is it?
set -u

echo "--- listening sockets ---"
ss -ltnp 2>/dev/null | grep -E ':300[0-9]' || echo "  nothing on 3000-3009"

echo
echo "--- next dev processes ---"
ps -eo pid,ppid,etime,args | grep -E 'next(-server)? ?dev|next dev' | grep -v grep || echo "  none"

echo
echo "--- comprensible dev log (tail) ---"
tail -25 /tmp/comprensible-dev.log 2>/dev/null || echo "  no log"
