#!/bin/bash
# Applique les migrations comptes/auth si elles ont ete sautees (timestamps anterieurs a des migrations deja deployees).
# Usage sur le VPS : APP_DIR=/opt/le-pillaveur bash scripts/prod-apply-auth-migrations.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"

# Noms historiques (deja resolus en prod juin 2026) + nouveaux noms apres reordonnancement.
MIGS=(
  20250608120000_user_accounts
  20250608140000_admin_supervision
  20250608150000_user_bans_and_geo
  20250608160000_user_account_code
  20250712154203_user_accounts
  20250712154204_admin_supervision
  20250712154205_user_bans_and_geo
  20250712154206_user_account_code
)

is_applied() {
  local mig="$1"
  docker run --rm -v le-pillaveur-db:/data alpine sh -c \
    "apk add sqlite >/dev/null 2>&1; sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$mig' LIMIT 1;\"" \
    | grep -q 1
}

for mig in "${MIGS[@]}"; do
  if is_applied "$mig"; then
    echo "SKIP (deja appliquee): $mig"
    continue
  fi
  sql="$APP_DIR/prisma/migrations/$mig/migration.sql"
  if [ ! -f "$sql" ]; then
    echo "SKIP (fichier absent): $mig"
    continue
  fi
  echo "=== $mig ==="
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$mig"
done

docker run --rm -v le-pillaveur-db:/data alpine sh -c '
  apk add sqlite >/dev/null 2>&1
  chmod -R u+rwX,g+rwX /data
  chown -R 1001:1001 /data
  if [ -f /data/prod.db-journal ]; then
    sqlite3 /data/prod.db "PRAGMA journal_mode=DELETE;"
    rm -f /data/prod.db-journal
  fi
'
echo "DONE"
