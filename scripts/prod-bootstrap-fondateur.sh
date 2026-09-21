#!/bin/bash
# Promeut un compte existant au role « fondateur ». Sur a rejouer : l'UPDATE
# est idempotent (memes valeurs a chaque passage).
set -euo pipefail
EMAIL="${1:-riqui1251@gmail.com}"
EMAIL_LC="$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : ce script ECRIT, donc il cree a coup sur prod.db-wal et prod.db-shm a
# cote du fichier. Les laisser a root rendait la base inouvrable par
# l'application — qui tourne en 1001 — jusqu'a un passage de
# prod-fix-db-perms.sh. sqlite3 descend donc a cet UID.
DB_UID="${DB_UID:-1001}"

# Image d'outils SQLite (sqlite3 + su-exec deja installes, scripts/
# sqlite-tools.Dockerfile), construite par prod-deploy.sh : plus d'`apk add`
# — donc plus de reseau — ici. Si elle manque (VPS pas encore redeploye
# depuis son introduction), on la construit a partir du meme Dockerfile, a
# cote de ce script ; sans elle il n'y a rien a faire.
SQLITE_IMAGE="${SQLITE_IMAGE:-le-pillaveur-sqlite}"
if ! docker image inspect "$SQLITE_IMAGE" >/dev/null 2>&1; then
  echo "Image $SQLITE_IMAGE absente : construction depuis scripts/sqlite-tools.Dockerfile"
  docker build -q -t "$SQLITE_IMAGE" -f "$(dirname "$0")/sqlite-tools.Dockerfile" "$(dirname "$0")" >/dev/null || {
    echo "ECHEC : image d'outils SQLite non constructible (reseau ?)"
    exit 1
  }
fi

docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" "$SQLITE_IMAGE" sh -c "
  set -e
  # sqlite3 tourne sous DB_UID (su-exec) : ce script ECRIT, les fichiers
  # -wal/-shm qu il cree doivent rester la propriete de l application.
  id=\$(su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"SELECT id FROM User WHERE lower(email) = lower('$EMAIL_LC') AND passwordHash != '' LIMIT 1;\")
  if [ -z \"\$id\" ]; then
    echo \"Compte introuvable pour $EMAIL_LC — cree-le d'abord sur /compte\"
    exit 1
  fi
  su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"UPDATE User SET role='fondateur', displayName='Riqui', name='Riqui', updatedAt=CURRENT_TIMESTAMP WHERE id='\$id';\"
  su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"SELECT email, displayName, role FROM User WHERE id='\$id';\"
  echo 'Fondateur configure.'
"
