#!/bin/bash
# Applique les migrations comptes/auth si elles ont ete sautees (timestamps anterieurs a des migrations deja deployees).
# Usage sur le VPS : APP_DIR=/opt/le-pillaveur bash scripts/prod-apply-auth-migrations.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : l'ouvrir cree prod.db-wal et prod.db-shm a cote du fichier. Les
# conteneurs sqlite3 de ce script descendent donc a cet UID, et le chown final
# rattrape ce que le CLI Prisma (qui tourne en root dans l'image builder) a pu
# laisser derriere lui.
DB_UID="${DB_UID:-1001}"

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

# Rend 0 = deja appliquee, 1 = pas appliquee, 2 = ON NE SAIT PAS (la base n a
# pas pu etre ouverte). Cette troisieme reponse est le point : avant, un echec
# d OUVERTURE (droits du volume, prod.db-wal laisse par root) ne se distinguait
# pas d un « pas appliquee », et on repartait rejouer un `db execute` DEJA
# applique — qui echoue et coupe le script.
is_applied() {
  local mig="$1" out status
  set +e
  out=$(docker run --rm -v le-pillaveur-db:/data alpine sh -c \
    "apk add --no-cache sqlite su-exec >/dev/null 2>&1; su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$mig' LIMIT 1;\"" \
    2>/dev/null)
  status=$?
  set -e
  [ "$status" -ne 0 ] && return 2
  echo "$out" | grep -q 1
}

for mig in "${MIGS[@]}"; do
  # `|| rc=$?` : sans lui, set -e tuerait le script des le premier « pas
  # appliquee » (code 1), qui est pourtant le cas nominal.
  rc=0
  is_applied "$mig" || rc=$?
  if [ "$rc" -eq 2 ]; then
    echo "ECHEC : _prisma_migrations illisible (base non ouvrable) — rien n a ete applique"
    echo "Reparer les droits du volume (bash \"$(dirname "$0")/prod-fix-db-perms.sh\") puis relancer."
    exit 1
  fi
  if [ "$rc" -eq 0 ]; then
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

# Filet apres le passage du CLI Prisma : `db execute` / `migrate resolve`
# tournent en root dans l'image builder et laissent, en WAL, un prod.db-wal et
# un prod.db-shm appartenant a root — l'application, qui demarre en 1001, ne
# pourrait plus ouvrir sa base. On ne force plus journal_mode=DELETE (WAL est
# pose par l'application, cf. src/lib/db-setup.ts) et on ne supprime plus
# prod.db-journal a la main : un journal present est un journal CHAUD, que seule
# l'ouverture de la base par sqlite peut rejouer sans risque.
docker run --rm -e DB_UID="$DB_UID" -v le-pillaveur-db:/data alpine sh -c '
  set -e
  # chown/chmod d abord, sans dependre du depot alpine : c est la partie
  # indispensable. Le releve du mode de journal est du confort, tolerant a
  # l echec.
  chown -R "$DB_UID:$DB_UID" /data
  # u+rwX seulement : le chown ci-dessus rend tout le volume proprietaire de
  # $DB_UID, sous lequel tourne l application. Le bit d ecriture du groupe
  # n etait requis par rien.
  chmod -R u+rwX /data
  if [ -f /data/prod.db ] && apk add --no-cache sqlite su-exec >/dev/null 2>&1; then
    echo "journal SQLite : $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA journal_mode;" 2>/dev/null || echo inconnu)"
    chown -R "$DB_UID:$DB_UID" /data
  fi
'
echo "DONE"
