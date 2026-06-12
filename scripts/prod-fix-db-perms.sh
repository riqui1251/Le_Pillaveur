#!/bin/bash
set -euo pipefail
docker run --rm -v le-pillaveur-db:/data alpine sh -c '
  apk add sqlite >/dev/null 2>&1
  chmod -R u+rwX,g+rwX /data
  chown -R 1001:1001 /data
  if [ -f /data/prod.db-journal ]; then
    sqlite3 /data/prod.db "PRAGMA journal_mode=DELETE;"
    rm -f /data/prod.db-journal
  fi
  echo "integrity:" $(sqlite3 /data/prod.db "PRAGMA integrity_check;")
  ls -la /data/prod.db*
'
docker restart le-pillaveur
sleep 5
bash /tmp/prod-test-register.sh
