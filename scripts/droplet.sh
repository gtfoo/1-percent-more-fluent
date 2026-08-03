#!/usr/bin/env bash
# Find a working SSH route to the droplet, then run a command over it.
#
#   bash scripts/droplet.sh                 # just probe which user works
#   bash scripts/droplet.sh 'uptime'        # run something
#
# Tries the deploy key first. BatchMode everywhere so nothing ever hangs on a
# password prompt.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
CMD="${1:-}"

SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

for key in ~/.ssh/carpark_deploy ~/.ssh/id_ed25519; do
  [ -f "$key" ] || continue
  for user in deploy gtfoo root ubuntu; do
    # -n is load-bearing: without it this probe reads stdin and hands it to the
    # remote `true`, which throws it away. Anything piped INTO droplet.sh is
    # then already gone by the time the real command runs - and the symptom is
    # a command that succeeds having received nothing, which is exactly how a
    # key appeared to deploy and had not.
    # shellcheck disable=SC2086
    if ssh -n $SSH_OPTS -i "$key" "$user@$IP" true 2>/dev/null; then
      echo "### connected as $user with $(basename "$key")" >&2
      if [ -n "$CMD" ]; then
        # shellcheck disable=SC2086
        ssh $SSH_OPTS -i "$key" "$user@$IP" "$CMD"
      else
        # shellcheck disable=SC2086
        ssh $SSH_OPTS -i "$key" "$user@$IP" 'echo "host: $(hostname)"; echo "user: $(whoami)"'
      fi
      exit 0
    fi
  done
done

echo "no working SSH route to $IP" >&2
exit 1
