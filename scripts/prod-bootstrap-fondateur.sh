#!/bin/bash
# Promeut au role « fondateur » le compte dont l'e-mail est EXACTEMENT celui
# donne (compare sans casse). Aucune adresse par defaut : le script ne devine
# jamais le compte. Refuse si plusieurs comptes repondent a l'adresse, et ne
# fait rien si un AUTRE fondateur existe deja, sauf --force. Sur a rejouer sur
# le meme compte : l'UPDATE est idempotent. Ne renomme plus rien (un UPDATE
# brut du pseudo contournait le controle d'unicite du site).
# Usage : prod-bootstrap-fondateur.sh <email> [--force]
set -euo pipefail

EMAIL=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -*)
      echo "Option inconnue : $arg" >&2
      exit 2
      ;;
    *)
      if [ -n "$EMAIL" ]; then
        echo "Une seule adresse e-mail attendue" >&2
        exit 2
      fi
      EMAIL="$arg"
      ;;
  esac
done
if [ -z "$EMAIL" ]; then
  echo "Usage : $0 <email> [--force]" >&2
  exit 2
fi
# L'adresse est recopiee telle quelle dans le SQL : rien d'autre qu'une
# adresse ordinaire (ni apostrophe, ni espace, ni joker).
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
if ! [[ "$EMAIL" =~ $EMAIL_RE ]]; then
  echo "Adresse e-mail invalide : $EMAIL" >&2
  exit 2
fi
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
  q() { su-exec \"\$DB_UID:\$DB_UID\" sqlite3 /data/prod.db \"\$1\"; }
  ids=\$(q \"SELECT id FROM User WHERE lower(email) = '$EMAIL_LC';\")
  count=\$(printf '%s\n' \"\$ids\" | grep -c . || true)
  if [ \"\$count\" -eq 0 ]; then
    echo \"Compte introuvable pour $EMAIL_LC — cree-le d abord sur /compte\"
    exit 1
  fi
  if [ \"\$count\" -gt 1 ]; then
    echo \"Plusieurs comptes (\$count) pour $EMAIL_LC : rien n est fait\"
    exit 1
  fi
  id=\$ids
  others=\$(q \"SELECT count(*) FROM User WHERE role = 'fondateur' AND id != '\$id';\")
  if [ \"\$others\" -gt 0 ] && [ \"$FORCE\" != 1 ]; then
    echo 'Un fondateur existe deja : rien n est fait (--force pour en nommer un autre).'
    exit 1
  fi
  q \"UPDATE User SET role = 'fondateur', updatedAt = CURRENT_TIMESTAMP WHERE id = '\$id';\"
  q \"SELECT email, displayName, role FROM User WHERE id = '\$id';\"
  echo 'Fondateur configure.'
"
