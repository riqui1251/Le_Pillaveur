#!/bin/bash
# Caddy derriere Cloudflare : proxies de confiance (IP Cloudflare) + en-tetes securite.
set -euo pipefail

CADDY=/etc/caddy/Caddyfile
BACKUP="${CADDY}.bak.$(date +%s)"
TMP=$(mktemp)

fetch_cf_ips() {
  curl -fsSL "$1"
}

echo "Recuperation des IP Cloudflare..."
CF4=$(fetch_cf_ips "https://www.cloudflare.com/ips-v4" | tr '\n' ' ')
CF6=$(fetch_cf_ips "https://www.cloudflare.com/ips-v6" | tr '\n' ' ')

sudo cp "$CADDY" "$BACKUP"
echo "Backup: $BACKUP"

{
  echo '{'
  echo -e '\tservers {'
  echo -n -e '\t\ttrusted_proxies static private_ranges '
  echo -n "$CF4 "
  echo "$CF6"
  echo -e '\t}'
  echo '}'
  echo ''
  cat <<'SITE'
lepillaveur.fr, www.lepillaveur.fr {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
		-X-Powered-By
	}

	reverse_proxy 127.0.0.1:3000
}
SITE
} | sudo tee "$CADDY" >/dev/null

echo "--- Validation Caddyfile ---"
if sudo caddy validate --config "$CADDY" --adapter caddyfile; then
  sudo systemctl reload caddy
  echo "Caddy reloaded (trusted_proxies Cloudflare IP ranges)."
else
  echo "ERREUR -> restauration $BACKUP"
  sudo cp "$BACKUP" "$CADDY"
  sudo systemctl reload caddy
  exit 1
fi

rm -f "$TMP"
