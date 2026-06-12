#!/bin/bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
MIGS=(
  20250608120000_user_accounts
  20250608140000_admin_supervision
  20250608150000_user_bans_and_geo
  20250608160000_user_account_code
)

run_sql() {
  local mig="$1"
  local sql="$APP_DIR/prisma/migrations/$mig/migration.sql"
  echo "=== SQL $mig ==="
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
}

resolve_mig() {
  local mig="$1"
  echo "=== RESOLVE $mig ==="
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$mig"
}

# 20250608120000 deja execute en SQL ; on marque seulement.
resolve_mig 20250608120000_user_accounts

for mig in 20250608140000_admin_supervision 20250608150000_user_bans_and_geo 20250608160000_user_account_code; do
  run_sql "$mig"
  resolve_mig "$mig"
done

echo "=== VERIFY ==="
bash /tmp/prod-db-inspect.sh
