#!/usr/bin/env bash
# Run ON the droplet. Turn on magic-link sign-in for this app.
#
# The AUTH_RESEND_KEY= line arrives on STDIN, because the key lives on the
# developer's machine and not on the server. Nothing is ever echoed.
#
#   ... | bash droplet-enable-signin.sh          # report only
#   ... | bash droplet-enable-signin.sh --write  # write and restart
#
# AUTH_SECRET is generated here, fresh: it signs THIS app's JWTs, and sharing
# one across two apps means a token minted by either is accepted by both.
#
# systemd reads .env.local as an EnvironmentFile, which is NOT dotenv - it does
# not strip an inline `#`, it keeps it, the opposite of the local failure. The
# secret is quoted, which is correct for both.
set -eu

APP=/home/deploy/1-percent-more-fluent
ENVFILE="$APP/.env.local"
WRITE=${1:-}

KEY_LINE=$(cat)
case "$KEY_LINE" in
  AUTH_RESEND_KEY=*) ;;
  *) echo "stdin was not an AUTH_RESEND_KEY= line"; exit 1;;
esac
echo "received a key line (${#KEY_LINE} chars, not shown)"

echo "--- what is set now ---"
for v in AUTH_SECRET AUTH_RESEND_KEY AUTH_EMAIL_FROM AUTH_URL; do
  if grep -qE "^[[:space:]]*$v=" "$ENVFILE" 2>/dev/null; then echo "  set  $v"; else echo "  -    $v"; fi
done

if [ "$WRITE" != "--write" ]; then
  echo
  echo "dry run - pass --write to apply"
  exit 0
fi

if grep -qE '^[[:space:]]*AUTH_RESEND_KEY=' "$ENVFILE"; then
  echo "already configured; leaving it alone"
  exit 0
fi

cp "$ENVFILE" "$ENVFILE.before-auth"
echo "backed up to $ENVFILE.before-auth"

{
  echo ""
  echo "# Magic-link sign-in. Optional: removing these four returns the app to"
  echo "# anonymous-cookie reading, with no sign-in offered anywhere."
  echo "AUTH_SECRET=\"$(openssl rand -base64 32)\""
  echo "$KEY_LINE"
  echo "AUTH_EMAIL_FROM=login@gtfoo.com"
  echo "AUTH_URL=https://1-percent-more-fluent.gtfoo.com"
} >> "$ENVFILE"
chmod 600 "$ENVFILE"

echo "wrote four variables, none printed"

echo "--- restarting ---"
sudo -n systemctl restart fluent
sleep 4
echo "  service: $(systemctl is-active fluent)"
echo "  providers: $(curl -s https://1-percent-more-fluent.gtfoo.com/api/auth/providers | head -c 140)"
