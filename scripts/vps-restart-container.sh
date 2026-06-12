#!/bin/bash
set -uo pipefail
NAME=le-pillaveur
IMG=le-pillaveur:latest
VOL=le-pillaveur-db

echo "=== Recréation du conteneur (config identique : 127.0.0.1:3000, volume, restart always) ==="
docker rm -f "$NAME" 2>/dev/null || true
docker run -d \
  --name "$NAME" \
  --restart always \
  -p 127.0.0.1:3000:3000 \
  -v "${VOL}:/app/prisma" \
  -e NODE_ENV=production \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  "$IMG"

echo "=== Réapplication du filtre egress UDP (DOCKER-USER réinitialisé au restart) ==="
sudo /usr/local/bin/egress-filter.sh 2>/dev/null || echo "(egress-filter non trouvé)"

echo "=== Attente démarrage ==="
sleep 6
docker ps --filter "name=${NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "=== Health (direct conteneur) ==="
curl -sf --max-time 10 http://127.0.0.1:3000/api/health && echo " <- OK" || echo "HEALTH KO"

echo "=== Image purge (anciennes <none>) ==="
docker image prune -f >/dev/null 2>&1 || true
echo DONE
