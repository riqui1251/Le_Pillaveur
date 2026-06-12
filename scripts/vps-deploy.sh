#!/bin/bash
# Construit et (re)lance Le Pillaveur sur le VPS, sans Dokploy.
set -e
APP_DIR=/opt/le-pillaveur
IMG=le-pillaveur:latest
NAME=le-pillaveur
VOL=le-pillaveur-db

cd "$APP_DIR"

echo "=== Build image ==="
docker build -t "$IMG" .

echo "=== Migrations base (SQLite) ==="
docker build --target builder -t le-pillaveur:builder . >/dev/null
docker run --rm -v "${VOL}:/app/prisma" -e DATABASE_URL=file:/app/prisma/prod.db le-pillaveur:builder npx prisma migrate deploy || echo "(migrations: a verifier)"

echo "=== (Re)lancement du conteneur ==="
docker rm -f "$NAME" 2>/dev/null || true
docker run -d \
  --name "$NAME" \
  --restart always \
  -p 80:3000 \
  -v "${VOL}:/app/prisma" \
  -e NODE_ENV=production \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  "$IMG"

echo "=== Etat ==="
sleep 5
docker ps --filter "name=${NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo DONE_DEPLOY
