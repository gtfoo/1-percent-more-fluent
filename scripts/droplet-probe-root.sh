#!/usr/bin/env bash
# Read-only: is there any route to root on the droplet from here?
# Determines whether the remaining setup can be finished without the user.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

for key in ~/.ssh/carpark_deploy ~/.ssh/id_ed25519; do
  [ -f "$key" ] || continue
  for user in root admin ubuntu; do
    printf '  %-34s ' "$user via $(basename "$key")"
    out=$(ssh $OPTS -i "$key" "$user@$IP" 'id -un' 2>&1 | tail -1)
    echo "$out"
  done
done

echo
echo "  deploy account sudo rights:"
ssh $OPTS -i ~/.ssh/carpark_deploy "deploy@$IP" 'sudo -n -l 2>&1 | tail -3' | sed 's|^|    |'
