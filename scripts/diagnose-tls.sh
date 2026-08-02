#!/usr/bin/env bash
# Diagnose ERR_SSL_PROTOCOL_ERROR from outside the droplet.
#
#   bash scripts/diagnose-tls.sh [host] [known-good-host]
#
# The discriminating test is the third one: comparing the target against a
# hostname Caddy definitely does NOT know. If they behave identically, Caddy is
# not serving the config you think it is. If they differ, Caddy knows the name
# and the problem is certificate issuance.
set -u
HOST="${1:-1-percent-more-fluent.gtfoo.com}"
GOOD="${2:-gtfoo.com}"
BOGUS="definitely-not-a-real-site-xyz.gtfoo.com"

ip() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | head -1; }

IP=$(ip "$HOST")
echo "resolved $HOST -> ${IP:-DOES NOT RESOLVE}"
echo "resolved $GOOD -> $(ip "$GOOD")"
echo

sni_probe() {
  local name="$1"
  printf '  %-46s ' "$name"
  local out
  out=$(echo | timeout 10 openssl s_client -connect "$IP:443" -servername "$name" 2>&1)
  if grep -q "subject=" <<<"$out"; then
    echo "CERT: $(grep -m1 'subject=' <<<"$out" | sed 's/.*CN *= *//')"
  elif grep -qi "no peer certificate" <<<"$out"; then
    echo "NO CERTIFICATE (handshake aborted)"
  else
    echo "no handshake"
  fi
}

echo "TLS by SNI, all against $IP:443"
sni_probe "$HOST"
sni_probe "$BOGUS"
sni_probe "$GOOD"
echo

echo "port 80"
for h in "$HOST" "$BOGUS" "$GOOD"; do
  printf '  %-46s ' "$h"
  curl -s -o /dev/null -m 8 -w 'status %{http_code}\n' "http://$h/" || echo "no answer"
done
exit 0
