#!/bin/bash
# Surveillance Le Pillaveur (sans Dokploy) :
#  1) re-applique le filtrage UDP si Docker l'a vide apres un restart
#  2) relance le conteneur si le site ne repond plus
NAME=le-pillaveur
URL=http://127.0.0.1:80/api/health
LOG=/var/log/le-pillaveur-watchdog.log
IPT=/usr/sbin/iptables

# 1) Filtrage UDP conteneurs toujours present ?
if ! $IPT -C DOCKER-USER -p udp -j DROP 2>/dev/null; then
  echo "$(date -Iseconds) egress manquant -> reapplication" >> "$LOG"
  /usr/local/bin/egress-filter.sh >> "$LOG" 2>&1
fi

# 2) Sante du site
if curl -sf --max-time 10 "$URL" >/dev/null 2>&1; then
  exit 0
fi
echo "$(date -Iseconds) site down -> restart conteneur" >> "$LOG"
/usr/bin/docker restart "$NAME" >> "$LOG" 2>&1
