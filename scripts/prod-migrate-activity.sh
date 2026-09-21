#!/bin/bash
set -euo pipefail
APP_DIR=/opt/le-pillaveur
MIG=20250712154207_user_activity
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : toute ouverture — meme une simple lecture — cree prod.db-wal et
# prod.db-shm a cote du fichier. Les laisser a root rend la base inouvrable
# par l'application, qui tourne en 1001. Lance depuis prod-deploy.sh le probleme
# se reparait tout seul (l'etape « DB permissions » qui suit fait le chown) ;
# lance A LA MAIN, il couchait le site. sqlite3 descend donc a cet UID.
DB_UID="${DB_UID:-1001}"

# Sonde « deja appliquee ? ». Le code de sortie est CAPTURE, et stderr tenu a
# part : sans cela, un echec d OUVERTURE de la base (droits du volume, -wal
# laisse par root) rendait une sortie vide, indiscernable d une migration non
# appliquee — on repartait alors rejouer un `db execute` DEJA applique, qui
# echoue et coupe le script. « Je ne sais pas » doit s arreter avec un message.
PROBE_LOG="/tmp/.migrate-probe-$MIG.log"
set +e
applied=$(docker run --rm -v le-pillaveur-db:/data alpine sh -c "apk add --no-cache sqlite su-exec >/dev/null 2>&1; su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$MIG' LIMIT 1;\"" 2>"$PROBE_LOG")
applied_status=$?
set -e
if [ "$applied_status" -ne 0 ]; then
  echo "ECHEC : impossible de lire _prisma_migrations (la sonde a rendu $applied_status)"
  echo "Derniere erreur : $(cat "$PROBE_LOG" 2>/dev/null || echo '(vide)')"
  echo "Reparer les droits du volume (bash \"$(dirname "$0")/prod-fix-db-perms.sh\") puis relancer."
  rm -f "$PROBE_LOG"
  exit 1
fi
rm -f "$PROBE_LOG"

if echo "$applied" | grep -q 1; then
  echo "Migration $MIG deja appliquee"
else
  echo "Application SQL $MIG"
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
  docker run --rm \
    -v le-pillaveur-db:/app/prisma \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$MIG"
  echo "Migration $MIG OK"
fi

# Verification finale : de l AFFICHAGE, pas une etape bloquante. Tolerante a
# l echec (`|| echo`) comme les cinq autres scripts de migration : une colonne
# renommee un jour ferait sortir ce script en erreur alors que la migration,
# elle, a reussi. (Celui-ci n est PAS appele par prod-deploy.sh, qui a son
# propre bloc user_activity : l impact se limite a un lancement manuel.)
docker run --rm -e DB_UID="$DB_UID" -v le-pillaveur-db:/data alpine sh -c 'apk add --no-cache sqlite su-exec >/dev/null 2>&1; su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA table_info(User);" | grep -E "lastLogin|totalPresence"' || echo "colonnes lastLogin/totalPresence non retrouvees"
