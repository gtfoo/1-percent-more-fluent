#!/usr/bin/env bash
# Read-only: which local keys open which droplet accounts, and why.
# Prints fingerprints and comments only - never key material.
set -u
IP="${DROPLET_IP:-167.71.196.128}"
OPTS="-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

echo "=== local keys (fingerprints) ==="
for k in ~/.ssh/*.pub; do
  [ -f "$k" ] || continue
  printf '  %-22s %s\n' "$(basename "$k" .pub)" "$(ssh-keygen -lf "$k" 2>/dev/null)"
done

echo
echo "=== which local key opens which account ==="
for key in ~/.ssh/carpark_deploy ~/.ssh/id_ed25519; do
  [ -f "$key" ] || continue
  for user in deploy root; do
    printf '  %-30s ' "$(basename "$key") -> $user"
    ssh $OPTS -i "$key" "$user@$IP" 'echo OK as $(id -un)' 2>/dev/null || echo "denied"
  done
done

echo
echo "=== authorized_keys on the droplet (fingerprints + comments) ==="
ssh $OPTS -i ~/.ssh/carpark_deploy "root@$IP" '
for f in /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys; do
  echo "  --- $f ---"
  if [ -f "$f" ]; then
    ssh-keygen -lf "$f" 2>/dev/null | sed "s|^|    |" || echo "    (unreadable)"
  else
    echo "    (missing)"
  fi
done
'
