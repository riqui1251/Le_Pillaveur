#!/bin/bash
# Installe les watchdogs prod + beta sur le VPS (cron toutes les 2 min).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_one() {
  local src="$1"
  local dest="$2"
  local cron_name="$3"
  sudo install -m 755 "$src" "$dest"
  echo "*/2 * * * * root ${dest}" | sudo tee "/etc/cron.d/${cron_name}" >/dev/null
  sudo chmod 644 "/etc/cron.d/${cron_name}"
}

install_one "${SCRIPT_DIR}/le-pillaveur-watchdog.sh" /usr/local/bin/le-pillaveur-watchdog.sh le-pillaveur-watchdog
install_one "${SCRIPT_DIR}/le-pillaveur-watchdog-beta.sh" /usr/local/bin/le-pillaveur-watchdog-beta.sh le-pillaveur-watchdog-beta

for svc in lepillaveur-lepillaveur-5dl27o lepillaveurbeta-lepillaveurbeta-odxl7k; do
  sudo docker service update \
    --restart-condition any \
    --restart-delay 5s \
    --restart-max-attempts 0 \
    "$svc" >/dev/null
done

echo "Watchdogs installes (cron */2 min)."
