#!/bin/bash
set -euo pipefail
APP_DIR=/opt/le-pillaveur
MIG=20250712154207_user_activity

applied=$(docker run --rm -v le-pillaveur-db:/data alpine sh -c "apk add sqlite >/dev/null 2>&1; sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$MIG' LIMIT 1;\"" || true)

if echo "$applied" | grep -q 1; then
  echo "Migration $MIG deja appliquee"
else
  echo "Application SQL $MIG"
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$MIG"
  echo "Migration $MIG OK"
fi

docker run --rm -v le-pillaveur-db:/data alpine sh -c 'apk add sqlite >/dev/null 2>&1; sqlite3 /data/prod.db "PRAGMA table_info(User);" | grep -E "lastLogin|totalPresence"'
