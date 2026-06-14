#!/bin/bash
# Autorise HTTP/HTTPS uniquement depuis les IP Cloudflare (apres migration DNS).
# A lancer une fois lepillaveur.fr proxifie sur Cloudflare (nuage orange).
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Lancer avec sudo."
  exit 1
fi

CF_URLS=(
  "https://www.cloudflare.com/ips-v4"
  "https://www.cloudflare.com/ips-v6"
)

echo "===== UFW: autoriser Cloudflare sur 80/443 ====="
for url in "${CF_URLS[@]}"; do
  while read -r cidr; do
    [ -z "$cidr" ] && continue
    ufw allow from "$cidr" to any port 80 proto tcp comment 'Cloudflare HTTP' >/dev/null 2>&1 || true
    ufw allow from "$cidr" to any port 443 proto tcp comment 'Cloudflare HTTPS' >/dev/null 2>&1 || true
  done < <(curl -fsSL "$url")
done

echo "===== UFW: retirer 80/443 ouvert a tous ====="
for port in 80 443; do
  while ufw status numbered | grep -qE "^\[ *[0-9]+\].*${port}/tcp.*ALLOW IN.*Anywhere"; do
    num=$(ufw status numbered | grep -E "${port}/tcp.*ALLOW IN.*Anywhere" | head -1 | sed -n 's/^\[\([0-9]*\)\].*/\1/p')
    [ -n "$num" ] || break
    yes | ufw delete "$num" >/dev/null 2>&1 || break
  done
done

ufw status verbose | grep -E '80/tcp|443/tcp|Status'
echo "===== DONE — le trafic web ne passe plus que via Cloudflare ====="
