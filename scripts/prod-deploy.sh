#!/bin/bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
ARCHIVE="${1:-/tmp/le-pillaveur-deploy.tar}"
# Memes emplacement et conventions de nommage que le cron installe par
# scripts/vps-secure-max.sh, pour que scripts/prod-db-restore.sh voie d'un seul
# coup d'oeil les instantanes quotidiens et ceux pris avant migration.
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/usr/local/bin/le-pillaveur-db-backup.sh}"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# Tag ou l'on met de cote l'image qui tourne avant de reconstruire : sans lui,
# `docker build -t le-pillaveur:latest` ecrase le seul code deployable et un
# retour arriere ne restaure que les DONNEES (nouveau code sur ancien schema).
ROLLBACK_TAG="${ROLLBACK_TAG:-le-pillaveur:previous}"
SNAPSHOT=""
ROLLBACK_IMAGE=""

echo "=== Extract ==="
cd "$APP_DIR"
tar xf "$ARCHIVE"
find scripts -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

# tar xf n'ecrase/n'ajoute que les fichiers presents dans l'archive : les
# fichiers retires du depot (ex. anciennes pages pre-i18n hors [locale])
# restent orphelins sur le disque d'un deploiement a l'autre. Next.js
# compile TOUTE page.tsx sous src/app, donc un orphelin qui importe un
# composant partage dont la signature a change casse le build. On purge
# ici tout ce qui n'est plus dans l'archive, limite a src/app (la seule
# zone ou un fichier mort devient une route compilee).
echo "=== Purge des pages orphelines (src/app) ==="
if [ -d src/app ]; then
  tar tf "$ARCHIVE" | grep -E '^src/app/' | cut -d/ -f1-3 | sort -u > /tmp/.deploy-app-manifest.txt
  for entry in src/app/*; do
    [ -e "$entry" ] || continue
    if ! grep -qxF "$entry" /tmp/.deploy-app-manifest.txt; then
      echo "  orpheline supprimee : $entry"
      rm -rf "$entry"
    fi
  done
  rm -f /tmp/.deploy-app-manifest.txt
fi

echo "=== Conservation de l'image precedente ==="
# A faire AVANT le build : une fois `le-pillaveur:latest` reconstruit, l'image
# qui tournait n'a plus de tag et peut disparaitre au prochain `docker prune`.
# On lui en pose un pour que prod-db-restore.sh --image puisse y revenir.
if docker image inspect le-pillaveur:latest >/dev/null 2>&1; then
  docker tag le-pillaveur:latest "$ROLLBACK_TAG"
  ROLLBACK_IMAGE="$ROLLBACK_TAG"
  echo "Image en place conservee sous $ROLLBACK_TAG"
else
  echo "Aucune image le-pillaveur:latest : premiere installation, pas de retour arriere code possible"
fi

echo "=== Build image ==="
docker build -t le-pillaveur:latest . 2>&1 | tail -20
docker build --target builder -t le-pillaveur:builder . >/dev/null

echo "=== Instantane DB avant migration ==="
# `prisma migrate deploy` ecrit directement sur le volume de prod et le seul
# filet de securite etait le cron de 03:00 : une migration fautive lancee le
# soir coutait jusqu'a ~20 h de comptes, d'XP et de resultats. On fige donc la
# base juste avant, et on refuse de migrer si l'instantane echoue.

# La sonde doit distinguer TROIS cas, la ou un simple `if ! docker run ...`
# n'en voyait que deux et concluait « premiere installation » des que la
# commande docker echouait (image alpine non telechargeable derriere le filtre
# d'egress, demon arrete) : on partait alors deployer sans filet.
#   0   -> prod.db present : on sauvegarde
#   1   -> `test -f` a repondu non : volume ou base absents, premiere install
#   *   -> panne docker (125/126/127...) : on ne sait rien, on s'arrete
DB_PROBE_LOG=/tmp/.deploy-db-probe.log
set +e
docker run --rm -v "$DB_VOLUME:/data:ro" alpine test -f /data/prod.db 2>"$DB_PROBE_LOG"
DB_PROBE=$?
set -e
if [ "$DB_PROBE" -eq 1 ]; then
  echo "Pas de prod.db dans le volume $DB_VOLUME : premiere installation, rien a sauvegarder"
  rm -f "$DB_PROBE_LOG"
elif [ "$DB_PROBE" -ne 0 ]; then
  echo "ECHEC DEPLOY : impossible de sonder le volume $DB_VOLUME (docker a rendu $DB_PROBE)"
  echo "Derniere erreur docker : $(cat "$DB_PROBE_LOG" 2>/dev/null || echo '(vide)')"
  echo "Tant qu'on ne sait pas si une base existe, on ne migre pas : verifier le demon docker et l'acces a l'image alpine."
  rm -f "$DB_PROBE_LOG"
  exit 1
else
  rm -f "$DB_PROBE_LOG"
  STAMP=$(date +%Y%m%d-%H%M%S)
  if [ -x "$BACKUP_SCRIPT" ]; then
    # Script pose par vps-secure-max.sh (sqlite3 .backup + gzip + purge a 14
    # jours) : on le rejoue tel quel plutot que de dupliquer sa logique.
    BEFORE=$(sudo sh -c "ls -t '$BACKUP_DIR'/prod-*.db.gz 2>/dev/null | head -1" || true)
    sudo "$BACKUP_SCRIPT"
    SNAPSHOT=$(sudo sh -c "ls -t '$BACKUP_DIR'/prod-*.db.gz 2>/dev/null | head -1" || true)
    # Le script cron n'annonce pas le fichier qu'il ecrit : on exige qu'il en
    # ait produit un NOUVEAU, sinon `ls -t` nous rendrait la sauvegarde de la
    # veille et on migrerait sans filet en croyant en avoir un.
    if [ "$SNAPSHOT" = "$BEFORE" ]; then
      SNAPSHOT=""
    fi
  else
    # Repli autonome : le script cron n'est pas garanti present (VPS reinstalle,
    # vps-secure-max.sh jamais joue). Meme mecanisme sqlite `.backup`, qui prend
    # une copie coherente meme si le conteneur ecrit pendant la copie ; le
    # prefixe reste `prod-` pour rester dans la purge a 14 jours du cron.
    sudo mkdir -p "$BACKUP_DIR"
    sudo chmod 700 "$BACKUP_DIR"
    docker run --rm \
      -v "$DB_VOLUME:/data:ro" \
      -v "$BACKUP_DIR:/backup" \
      alpine sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/prod.db \".backup /backup/prod-predeploy-${STAMP}.db\""
    sudo gzip -f "$BACKUP_DIR/prod-predeploy-${STAMP}.db"
    SNAPSHOT="$BACKUP_DIR/prod-predeploy-${STAMP}.db.gz"
  fi
  if [ -z "$SNAPSHOT" ] || ! sudo test -s "$SNAPSHOT"; then
    echo "ECHEC DEPLOY : instantane de la base impossible, migration annulee"
    exit 1
  fi
  echo "Instantane : $SNAPSHOT ($(sudo du -h "$SNAPSHOT" | cut -f1))"
fi

echo "=== Prisma migrate deploy ==="
docker run --rm \
  -v "$DB_VOLUME:/app/prisma" \
  -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
  -v "$APP_DIR/prisma/schema.prisma:/app/prisma/schema.prisma:ro" \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:builder \
  npx prisma migrate deploy

echo "=== Migration user_activity ==="
MIG=20250712154207_user_activity
if docker run --rm -v "$DB_VOLUME:/data" alpine sh -c "apk add sqlite >/dev/null 2>&1; sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$MIG' LIMIT 1;\"" | grep -q 1; then
  echo "Migration deja appliquee"
else
  docker run --rm \
    -v "$DB_VOLUME:/app/prisma" \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql 2>/dev/null || \
  docker build --target builder -t le-pillaveur:builder "$APP_DIR" >/dev/null && \
  docker run --rm \
    -v "$DB_VOLUME:/app/prisma" \
    -v "$APP_DIR/prisma/migrations/$MIG/migration.sql:/migration.sql:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma db execute --file /migration.sql
  docker build --target builder -t le-pillaveur:builder "$APP_DIR" >/dev/null
  docker run --rm \
    -v "$DB_VOLUME:/app/prisma" \
    -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
    -e DATABASE_URL=file:/app/prisma/prod.db \
    le-pillaveur:builder \
    npx prisma migrate resolve --applied "$MIG"
fi

echo "=== Migration auth_feedback_reset ==="
bash "$APP_DIR/scripts/prod-migrate-auth-feedback.sh"

echo "=== Migration visitor_ip ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-ip.sh"

echo "=== Migration ip_history ==="
bash "$APP_DIR/scripts/prod-migrate-ip-history.sh"

echo "=== Migration visitor_local_players ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-local-players.sh"

echo "=== Migration visitor_device ==="
bash "$APP_DIR/scripts/prod-migrate-visitor-device.sh"

echo "=== Purge unique des sessions (jetons desormais haches) ==="
# Les jetons de session sont maintenant stockes HACHES (SHA-256) en base :
# src/lib/auth-server.ts compare hashToken(cookie) a Session.token. Les lignes
# ecrites par l'ancien code portent le jeton EN CLAIR : elles ne pourront plus
# jamais correspondre a un cookie, resteraient en base jusqu'a leur expiration
# (et un dump les rendrait toujours exploitables). On les efface donc une fois
# pour toutes, avant de redemarrer l'application sur le nouveau code.
# Etape explicite et marquee : un fichier temoin dans le volume empeche de la
# rejouer a chaque deploiement (sinon on deconnecterait tout le monde a chaque
# mise en ligne).
docker run --rm -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  MARKER=/data/.session-purge-hashed-tokens.done
  if [ -f "$MARKER" ]; then
    echo "Purge deja effectuee (temoin $MARKER) : sessions intactes"
    exit 0
  fi
  if [ ! -f /data/prod.db ]; then
    echo "Pas de base : rien a purger"
    exit 0
  fi
  apk add --no-cache sqlite >/dev/null 2>&1
  COUNT=$(sqlite3 /data/prod.db "SELECT COUNT(*) FROM Session;") || {
    echo "ECHEC : table Session illisible (schema non migre ?), purge impossible"
    exit 1
  }
  sqlite3 /data/prod.db "DELETE FROM Session;"
  echo "$COUNT session(s) supprimee(s) : TOUT LE MONDE DEVRA SE RECONNECTER (jetons en clair devenus inutilisables)."
  : > "$MARKER"
'

echo "=== DB permissions ==="
docker run --rm -v "$DB_VOLUME:/data" alpine sh -c '
  apk add sqlite >/dev/null 2>&1
  chown -R 1001:1001 /data
  chmod -R u+rwX,g+rwX /data
  if [ -f /data/prod.db-journal ]; then
    sqlite3 /data/prod.db "PRAGMA journal_mode=DELETE;"
    rm -f /data/prod.db-journal
  fi
'

echo "=== Restart container ==="
docker rm -f le-pillaveur 2>/dev/null || true
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi
docker run -d \
  --name le-pillaveur \
  --restart always \
  -p 127.0.0.1:3000:3000 \
  -v "$DB_VOLUME:/app/prisma" \
  "${ENV_ARGS[@]}" \
  -e NODE_ENV=production \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:latest

sudo /usr/local/bin/egress-filter.sh 2>/dev/null || true

echo "=== Controle de sante (bloquant) ==="
# DONE_DEPLOY est le marqueur que l'humain lit pour savoir que tout s'est bien
# passe : il ne doit JAMAIS s'afficher sur un deploiement rate. L'ancien code
# se contentait d'imprimer le code HTTP sans le tester.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
# /api/health ne rend AUCUNE page : un composant serveur casse ou une cle i18n
# manquante laisse la sonde verte pendant que tout le site repond 500. On garde
# donc, comme l'ancien controle sur /compte, une requete sur une vraie page
# rendue (-L : l'accueil redirige vers la locale par defaut).
PAGE_URL="${PAGE_URL:-http://127.0.0.1:3000/}"
HEALTH_TRIES="${HEALTH_TRIES:-10}"
HEALTH_DELAY="${HEALTH_DELAY:-3}"
HEALTH_BODY=/tmp/.deploy-health.json
PAGE_BODY=/tmp/.deploy-page.html
page_code=000
attempt=1
while [ "$attempt" -le "$HEALTH_TRIES" ]; do
  # curl imprime deja 000 quand la connexion echoue ; le `|| true` empeche
  # seulement set -e de tuer la boucle, et le defaut couvre le cas ou curl
  # n'imprime rien du tout.
  code=$(curl -s -o "$HEALTH_BODY" -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)
  [ -n "$code" ] || code=000
  # 200 ne suffit pas : la route repond aussi 503 avec un corps JSON quand la
  # base est injoignable, et un proxy mal reveille peut renvoyer une page HTML.
  if [ "$code" = "200" ] && grep -q '"ok":true' "$HEALTH_BODY"; then
    page_code=$(curl -sL -o "$PAGE_BODY" -w '%{http_code}' --max-time 15 "$PAGE_URL" || true)
    [ -n "$page_code" ] || page_code=000
    # On exige du HTML complet : Next.js sert la page d'erreur en 500, mais un
    # rendu tronque (stream coupe) rendrait 200 sans `</html>`.
    if [ "$page_code" = "200" ] && grep -qi '</html>' "$PAGE_BODY"; then
      echo "Sante OK (tentative $attempt/$HEALTH_TRIES) : $(cat "$HEALTH_BODY")"
      echo "Page $PAGE_URL rendue (status=$page_code)"
      rm -f "$HEALTH_BODY" "$PAGE_BODY"
      echo DONE_DEPLOY
      exit 0
    fi
    echo "  tentative $attempt/$HEALTH_TRIES : base OK mais page $PAGE_URL status=$page_code"
  else
    echo "  tentative $attempt/$HEALTH_TRIES : status=$code"
  fi
  attempt=$((attempt + 1))
  sleep "$HEALTH_DELAY"
done

echo "ECHEC DEPLOY : $HEALTH_URL / $PAGE_URL ne repondent pas sainement apres $HEALTH_TRIES tentatives"
echo "Derniere reponse sante : $(cat "$HEALTH_BODY" 2>/dev/null || echo '(vide)')"
echo "Dernier status page : $page_code"
rm -f "$HEALTH_BODY" "$PAGE_BODY"
echo "--- docker logs le-pillaveur (30 dernieres lignes) ---"
docker logs --tail 30 le-pillaveur 2>&1 || true
echo "--- retour arriere ---"
if [ -n "$ROLLBACK_IMAGE" ]; then
  # Restaurer la base seule redemarrerait le NOUVEAU code sur l'ANCIEN schema :
  # on propose donc le couple donnees + image precedente.
  echo "Image precedente disponible : $ROLLBACK_IMAGE"
else
  echo "Aucune image precedente conservee (premiere installation)."
fi
if [ -n "$SNAPSHOT" ]; then
  echo "Instantane pris avant migration : $SNAPSHOT"
fi
if [ -n "$SNAPSHOT" ] || [ -n "$ROLLBACK_IMAGE" ]; then
  # prod-db-restore.sh exige une confirmation tapee a la main : la commande
  # doit tourner dans un TERMINAL (ssh -t), pas dans un ssh non interactif
  # comme celui qui a lance ce deploiement, sinon elle refuse de s'executer.
  RESTORE_CMD="bash $APP_DIR/scripts/prod-db-restore.sh"
  if [ -n "$ROLLBACK_IMAGE" ]; then
    RESTORE_CMD="$RESTORE_CMD --image $ROLLBACK_IMAGE"
  fi
  if [ -n "$SNAPSHOT" ]; then
    RESTORE_CMD="$RESTORE_CMD $SNAPSHOT"
  fi
  echo "Retour arriere (depuis un terminal interactif, ex. ssh -t vps) :"
  echo "  $RESTORE_CMD"
fi
exit 1
