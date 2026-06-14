#!/bin/bash
# Restreint SSH (port 22) à une ou plusieurs IP fixes.
# Usage: sudo bash vps-ssh-restrict.sh 90.112.252.37 [autre_ip...]
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Lancer avec sudo."
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 IP1 [IP2...]"
  exit 1
fi

echo "===== SSH: autoriser IP admin ====="
for ip in "$@"; do
  ufw allow from "$ip" to any port 22 proto tcp comment "SSH admin $ip"
  echo "  allow $ip"
done

echo "===== SSH: retirer 22/tcp ouvert a tous ====="
for _ in 1 2 3 4 5; do
  num=$(ufw status numbered | grep -E '22/tcp.*ALLOW IN.*Anywhere' | head -1 | sed -n 's/^\[\([0-9]*\)\].*/\1/p')
  [ -n "$num" ] || break
  yes | ufw delete "$num" >/dev/null 2>&1 || break
done

ufw status verbose | grep -E '22/tcp|Status'
echo "===== DONE ====="
