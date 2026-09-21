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

# Image d'outils SQLite (sqlite3 + su-exec deja installes, scripts/
# sqlite-tools.Dockerfile), construite par prod-deploy.sh : plus d'`apk add`
# — donc plus de reseau — pour une simple inspection. Si elle manque (VPS pas
# encore redeploye depuis son introduction), on la construit ici, a partir du
# meme Dockerfile, a cote de ce script ; sans elle il n'y a rien a inspecter.
SQLITE_IMAGE="${SQLITE_IMAGE:-le-pillaveur-sqlite}"
if ! docker image inspect "$SQLITE_IMAGE" >/dev/null 2>&1; then
  echo "Image $SQLITE_IMAGE absente : construction depuis scripts/sqlite-tools.Dockerfile"
  docker build -q -t "$SQLITE_IMAGE" -f "$(dirname "$0")/sqlite-tools.Dockerfile" "$(dirname "$0")" >/dev/null || {
    echo "ECHEC : image d'outils SQLite non constructible (reseau ?) — inspection impossible"
    exit 1
  }
fi

docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" "$SQLITE_IMAGE" sh -c '
  set -e
  # sqlite3 tourne sous DB_UID (su-exec) : lecture seule, mais en WAL meme un
  # SELECT cree -wal/-shm, qui doivent rester la propriete de l application.
  echo "=== TABLES ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db ".tables"
  echo "=== USER COLUMNS ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA table_info(User);"
  echo "=== MIGRATIONS ==="
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"
'
