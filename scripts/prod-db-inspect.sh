#!/bin/bash
# Inspection en LECTURE SEULE de la base de production (tables, colonnes de
# User, migrations appliquees). Sur a rejouer : aucune ecriture.
set -euo pipefail
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : meme une simple LECTURE ouvre la base et cree prod.db-wal et
# prod.db-shm a cote du fichier. Ouvrir la base en root laissait donc ces
# fichiers annexes a root, apres quoi l'application — qui tourne en 1001 — ne
# pouvait plus ouvrir sa propre base jusqu'a un passage de prod-fix-db-perms.sh.
# Une inspection ne doit jamais coucher le site : sqlite3 descend a cet UID.
DB_UID="${DB_UID:-1001}"

docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  # apk exige root ; sqlite3 redescend ensuite en DB_UID (su-exec). Rien a
  # proteger ici (script en LECTURE SEULE, il n ecrit aucun droit) : sans
  # sqlite3 il n y a tout simplement rien a inspecter. On le dit, au lieu de
  # sortir en 1 sans un mot a cause de set -e et du 2>&1 ci-dessus.
  apk add --no-cache sqlite su-exec >/dev/null 2>&1 || {
    echo "ECHEC : sqlite/su-exec non installables (depot alpine injoignable ?) — inspection impossible"
    exit 1
  }
  echo "=== TABLES ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db ".tables"
  echo "=== USER COLUMNS ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA table_info(User);"
  echo "=== MIGRATIONS ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"
'
