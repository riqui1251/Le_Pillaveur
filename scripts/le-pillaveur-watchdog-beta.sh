#!/bin/bash
# Surveille la beta (Dokploy) et relance le service Docker si l'app ne repond plus.
SERVICE="lepillaveurbeta-lepillaveurbeta-odxl7k"
# Health interne au conteneur (basePath compile au build ; /api/health si pas de prefix)
HEALTH_PATH="/api/health"
LOG="/var/log/le-pillaveur-watchdog-beta.log"
LOCK="/tmp/le-pillaveur-watchdog-beta.lock"

if [ -f "$LOCK" ]; then
  find "$LOCK" -mmin +5 -delete 2>/dev/null
  [ -f "$LOCK" ] && exit 0
fi

check_health() {
  local cid
  cid=$(docker ps -q --filter "name=lepillaveurbeta" | head -n1)
  if [ -z "$cid" ]; then
    return 1
  fi
  docker exec "$cid" node -e \
    "fetch('http://127.0.0.1:3000${HEALTH_PATH}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

if check_health; then
  exit 0
fi

touch "$LOCK"
echo "$(date -Iseconds) Beta down - restarting ${SERVICE}" >> "${LOG}"
/usr/bin/docker service update --force "${SERVICE}" >> "${LOG}" 2>&1
rm -f "$LOCK"
