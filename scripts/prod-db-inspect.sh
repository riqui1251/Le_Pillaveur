#!/bin/bash
set -euo pipefail
docker run --rm -v le-pillaveur-db:/data alpine sh -c '
  apk add sqlite >/dev/null 2>&1
  echo "=== TABLES ==="
  sqlite3 /data/prod.db ".tables"
  echo "=== USER COLUMNS ==="
  sqlite3 /data/prod.db "PRAGMA table_info(User);"
  echo "=== MIGRATIONS ==="
  sqlite3 /data/prod.db "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"
'
