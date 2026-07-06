#!/bin/bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
ARCHIVE="${1:-/tmp/le-pillaveur-deploy.tar}"

echo "=== Extract ==="
cd "$APP_DIR"
tar xf "$ARCHIVE"
find scripts -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

# tar xf n'ecrase/n'ajoute que les fichiers presents dans l'archive : les
# fichiers retires du depot (ex. anciennes pages pre-i18n hors [locale])
# restent orphelins sur le disque d'un deploiement a l'autre. Next.js
# compile TOUTE page.tsx sous src/app, donc un orphelin qui importe un
# composant partage dont la signature a change casse le build. On purge
# ici tout ce qui n'est plus dans l'archive, limite a src/app (la seule
# zone ou un fichier mort devient une route compilee).
echo "=== Purge des pages orphelines (src/app) ==="
if [ -d src/app ]; then
  tar tf "$ARCHIVE" | grep -E '^src/app/' | cut -d/ -f1-3 | sort -u > /tmp/.deploy-app-manifest.txt
  for entry in src/app/*; do
    [ -e "$entry" ] || continue
    if ! grep -qxF "$entry" /tmp/.deploy-app-manifest.txt; then
      echo "  orpheline supprimee : $entry"
      rm -rf "$entry"
    fi
  done
  rm -f /tmp/.deploy-app-manifest.txt
fi

echo "=== Build image ==="
docker build -t le-pillaveur:latest . 2>&1 | tail -20
docker build --target builder -t le-pillaveur:builder . >/dev/null

echo "=== Prisma migrate deploy ==="
docker run --rm \
  -v le-pillaveur-db:/app/prisma \
  -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
  -v "$APP_DIR/prisma/schema.prisma:/app/prisma/schema.prisma:ro" \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:builder \
  npx prisma migrate deploy

echo "=== Migration user_activity ==="
MIG=20250712154207_user_activity
if docker run --rm -v le-pillaveur-db:/data alpine sh -c "apk add sqlite >/dev/null 2>&1; sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$MIG' LIMIT 1;\"" | grep -q 1; then
  echo "Migration deja appliquee"
else
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql 2>/dev/null || \
  docker build --target builder -t le-pillaveur:builder "$APP_DIR" >/dev/null && \
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
  docker build --target builder -t le-pillaveur:builder "$APP_DIR" >/dev/null
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$MIG"
fi

echo "=== Migration auth_feedback_reset ==="
bash "$APP_DIR/scripts/prod-migrate-auth-feedback.sh"

echo "=== Migration visitor_ip ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-ip.sh"

echo "=== Migration ip_history ==="
bash "$APP_DIR/scripts/prod-migrate-ip-history.sh"

echo "=== Migration visitor_local_players ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-local-players.sh"

echo "=== Migration visitor_device ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-device.sh"

echo "=== DB permissions ==="
docker run --rm -v le-pillaveur-db:/data alpine sh -c '
  apk add sqlite >/dev/null 2>&1
  chown -R 1001:1001 /data
  chmod -R u+rwX,g+rwX /data
  if [ -f /data/prod.db-journal ]; then
    sqlite3 /data/prod.db "PRAGMA journal_mode=DELETE;"
    rm -f /data/prod.db-journal
  fi
'

echo "=== Restart container ==="
docker rm -f le-pillaveur 2>/dev/null || true
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi
docker run -d \
  --name le-pillaveur \
  --restart always \
  -p 127.0.0.1:3000:3000 \
  -v le-pillaveur-db:/app/prisma \
  "${ENV_ARGS[@]}" \
  -e NODE_ENV=production \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:latest

sudo /usr/local/bin/egress-filter.sh 2>/dev/null || true

sleep 5
curl -s -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3000/compte
echo DONE_DEPLOY
