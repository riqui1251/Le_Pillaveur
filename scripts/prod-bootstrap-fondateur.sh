#!/bin/bash
set -euo pipefail
EMAIL="${1:-riqui1251@gmail.com}"
EMAIL_LC="$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')"

docker run --rm -v le-pillaveur-db:/data alpine sh -c "
  apk add sqlite >/dev/null 2>&1
  id=\$(sqlite3 /data/prod.db \"SELECT id FROM User WHERE lower(email) = lower('$EMAIL_LC') AND passwordHash != '' LIMIT 1;\")
  if [ -z \"\$id\" ]; then
    echo \"Compte introuvable pour $EMAIL_LC — cree-le d'abord sur /compte\"
    exit 1
  fi
  sqlite3 /data/prod.db \"UPDATE User SET role='fondateur', displayName='Riqui', name='Riqui', updatedAt=CURRENT_TIMESTAMP WHERE id='\$id';\"
  sqlite3 /data/prod.db \"SELECT email, displayName, role FROM User WHERE id='\$id';\"
  echo 'Fondateur configure.'
"
