#!/usr/bin/env bash
# Which AUTH_* variables are set, WITHOUT printing any of their values.
#
#   bash scripts/check-auth-env.sh            # local .env.local
#   bash scripts/check-auth-env.sh --droplet  # the server's
set -u
cd "$(dirname "$0")/.." || exit 1

report() {
  local file="$1" label="$2"
  echo "--- $label ---"
  if [ ! -f "$file" ]; then echo "  (no $file)"; return; fi
  for v in AUTH_SECRET AUTH_RESEND_KEY AUTH_EMAIL_FROM AUTH_URL; do
    line=$(grep -E "^[[:space:]]*$v=" "$file" | tail -1)
    if [ -z "$line" ]; then
      echo "  -    $v"
      continue
    fi
    value=${line#*=}
    # The two silent failures, checked without revealing anything.
    note=""
    case "$v" in
      AUTH_SECRET)
        case "$value" in
          \"*\"|\'*\') note=" (quoted)";;
          *"#"*) note="  <-- UNQUOTED AND CONTAINS #: dotenv will truncate this";;
          *) note=" (unquoted, no # - fine)";;
        esac;;
      AUTH_EMAIL_FROM)
        domain=${value##*@}
        domain=${domain%\"}
        note=" -> $domain"
        case "$domain" in
          *.*.*) note="$note  <-- a subdomain; Resend verifies it separately";;
        esac;;
      AUTH_URL) note=" -> ${value}";;
    esac
    echo "  set  $v  (${#value} chars)$note"
  done
}

if [ "${1:-}" = "--droplet" ]; then
  echo "(run this ON the droplet)"
  report "$HOME/1-percent-more-fluent/.env.local" "droplet .env.local"
else
  report ".env.local" "local .env.local"
fi
