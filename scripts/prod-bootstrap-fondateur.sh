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

docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c "
  set -e
  # apk exige root ; sqlite3 redescend ensuite en DB_UID (su-exec). Sans eux,
  # il n y a rien a faire ici : on s arrete avec un message plutot qu avec un
  # code 1 muet (set -e + le 2>&1 ci-dessus avalent la sortie d apk).
  apk add --no-cache sqlite su-exec >/dev/null 2>&1 || {
    echo 'ECHEC : sqlite/su-exec non installables (depot alpine injoignable ?)'
    exit 1
  }
  id=\$(su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"SELECT id FROM User WHERE lower(email) = lower('$EMAIL_LC') AND passwordHash != '' LIMIT 1;\")
  if [ -z \"\$id\" ]; then
    echo \"Compte introuvable pour $EMAIL_LC — cree-le d'abord sur /compte\"
    exit 1
  fi
  su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"UPDATE User SET role='fondateur', displayName='Riqui', name='Riqui', updatedAt=CURRENT_TIMESTAMP WHERE id='\$id';\"
  su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"SELECT email, displayName, role FROM User WHERE id='\$id';\"
  echo 'Fondateur configure.'
"
