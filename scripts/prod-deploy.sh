#!/bin/bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
ARCHIVE="${1:-/tmp/le-pillaveur-deploy.tar}"
# Memes emplacement et conventions de nommage que le cron installe par
# scripts/vps-secure-max.sh, pour que scripts/prod-db-restore.sh voie d'un seul
# coup d'oeil les instantanes quotidiens et ceux pris avant migration.
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# Tag ou l'on met de cote l'image qui tourne avant de reconstruire : sans lui,
# `docker build -t le-pillaveur:latest` ecrase le seul code deployable et un
# retour arriere ne restaure que les DONNEES (nouveau code sur ancien schema).
ROLLBACK_TAG="${ROLLBACK_TAG:-le-pillaveur:previous}"
# UID/GID du proprietaire de prod.db : l'utilisateur `nextjs` du Dockerfile
# (addgroup --gid 1001 nodejs / adduser --uid 1001 nextjs). La base est en WAL :
# SQLite cree prod.db-wal et prod.db-shm A COTE du fichier des qu'on l'ouvre.
# Tout conteneur de maintenance qui ouvre la base doit donc le faire SOUS CET
# UID, sinon il laisse un -wal appartenant a root et l'application, qui tourne
# en 1001, ne peut plus ouvrir sa propre base.
DB_UID="${DB_UID:-1001}"
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
# Seul conteneur qui garde `:ro` : `test -f` regarde le repertoire, il n'OUVRE
# jamais la base et ne peut donc pas creer de -wal/-shm. Partout ailleurs dans
# ce script, un conteneur qui lance sqlite3 monte le volume en lecture-ecriture.
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
  # Instantane pris ICI, toujours, sans jamais rejouer le script de sauvegarde
  # installe par vps-secure-max.sh. Deux raisons :
  #   - ce deploiement tourne sous `ubuntu` (il appelle `sudo` partout), or ce
  #     script est en 750 root:root : le `[ -x ]` qui le testait etait FAUX en
  #     pratique, la branche n'a jamais servi ;
  #   - la version INSTALLEE sur le VPS peut dater d'avant le passage en WAL
  #     (volume monte `:ro`, sqlite3 en root) : la rejouer echouerait sur une
  #     base WAL et couperait le deploiement sans message clair.
  # Meme mecanisme sqlite `.backup`, qui prend une copie coherente meme si le
  # conteneur ecrit pendant la copie ; le prefixe reste `prod-` pour rester dans
  # la purge a 14 jours du cron de 03:00 — qui reste le SEUL a purger.
  #
  # Le volume est monte en lecture-ECRITURE : en WAL, ouvrir la base cree
  # prod.db-shm (memoire partagee) et peut rejouer le -wal. Monte `:ro`, la
  # sauvegarde echouerait purement et simplement des que ces fichiers
  # manquent. sqlite3 est donc lance sous $DB_UID (su-exec), pour que les
  # fichiers annexes restent la propriete de l'application.
  sudo mkdir -p "$BACKUP_DIR"
  sudo chmod 700 "$BACKUP_DIR"
  docker run --rm \
    -v "$DB_VOLUME:/data" \
    -v "$BACKUP_DIR:/backup" \
    alpine sh -c "
      set -e
      # apk exige root : on installe d'abord, on redescend en $DB_UID ensuite.
      apk add --no-cache sqlite su-exec >/dev/null
      # La copie passe par /tmp (inscriptible par tous dans l'image) : le
      # dossier de sauvegarde de l'hote est en 700 root/ubuntu, l'UID $DB_UID
      # ne peut pas y ecrire — ni le fichier, ni le journal que sqlite3 cree
      # a cote de la destination pendant le .backup.
      su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \".backup /tmp/snapshot.db\"
      # Le -wal a pu grossir depuis le dernier point de controle : on le replie
      # dans le fichier principal maintenant que la copie est prise. Tolerant
      # a l echec (un lecteur en cours rend « busy ») : la sauvegarde, elle,
      # est deja faite, et c est elle qui conditionne la migration.
      su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"PRAGMA wal_checkpoint(TRUNCATE);\" >/dev/null || true
      mv /tmp/snapshot.db /backup/prod-predeploy-${STAMP}.db
    "
  sudo gzip -f "$BACKUP_DIR/prod-predeploy-${STAMP}.db"
  SNAPSHOT="$BACKUP_DIR/prod-predeploy-${STAMP}.db.gz"
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

echo "=== Droits DB apres le CLI Prisma ==="
# `prisma migrate deploy` vient de tourner en ROOT dans l'image builder : en
# WAL, il laisse un prod.db-wal / prod.db-shm appartenant a root. Or TOUTES les
# sondes sqlite3 qui suivent tournent sous $DB_UID, et en WAL meme un simple
# SELECT doit pouvoir ECRIRE le fichier -shm. Sans ce chown intercale ici, la
# sonde « migration deja appliquee ? » echouerait a ouvrir la base, sa sortie
# vide serait lue comme « non appliquee », et on rejouerait un `db execute`
# deja applique : il echoue, et set -e coupe le deploiement APRES la migration
# mais AVANT le redemarrage — le pire des etats d'arret. L'etape « DB
# permissions » plus bas reste en place : elle couvre ce que les scripts de
# migration appeles entre-temps auront pu laisser.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  chown -R "$DB_UID:$DB_UID" /data
  chmod -R u+rwX /data
'

echo "=== Migration user_activity ==="
MIG=20250712154207_user_activity
# Meme regle que partout : sqlite3 tourne sous $DB_UID, jamais en root, pour ne
# pas laisser de prod.db-wal / prod.db-shm appartenant a root dans le volume.
#
# Le code de sortie est CAPTURE, et non consomme par un `| grep -q 1` : un
# echec d'ouverture de la base (droits, volume) rendait la meme chose qu'une
# migration non appliquee, et on partait rejouer du SQL deja applique. Ici,
# « je ne sais pas » arrete le deploiement avec un message, au lieu de le
# casser une etape plus loin.
#
# stderr tenu A PART (et non fusionne dans la sortie) : un avertissement de
# docker ou de sqlite3 contenant un « 1 » ferait conclure « deja appliquee » et
# SAUTER la migration.
MIG_PROBE_LOG=/tmp/.deploy-mig-probe.log
set +e
MIG_PROBE=$(docker run --rm -v "$DB_VOLUME:/data" alpine sh -c "apk add --no-cache sqlite su-exec >/dev/null 2>&1; su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"SELECT 1 FROM _prisma_migrations WHERE migration_name='$MIG' LIMIT 1;\"" 2>"$MIG_PROBE_LOG")
MIG_PROBE_STATUS=$?
set -e
if [ "$MIG_PROBE_STATUS" -ne 0 ]; then
  echo "ECHEC DEPLOY : impossible de lire _prisma_migrations (la sonde a rendu $MIG_PROBE_STATUS)"
  echo "Derniere erreur : $(cat "$MIG_PROBE_LOG" 2>/dev/null || echo '(vide)')"
  echo "La base a ete migree mais l'ancien conteneur tourne toujours : ne pas redemarrer a l'aveugle."
  echo "Verifier les droits du volume (bash $APP_DIR/scripts/prod-fix-db-perms.sh) puis relancer ce deploiement."
  rm -f "$MIG_PROBE_LOG"
  exit 1
fi
rm -f "$MIG_PROBE_LOG"
if echo "$MIG_PROBE" | grep -q 1; then
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
#
# /!\ REGLE POUR TOUTE FUTURE PURGE OU MIGRATION DE SESSIONS /!\
# Supprimer, invalider ou transformer des lignes Session rend TOUS les comptes
# INVITES concernes definitivement inaccessibles : un invite n'a ni email, ni
# mot de passe, ni Google, son cookie de session est sa SEULE cle. Il ne
# pourra jamais "se reconnecter" (vrai seulement pour les comptes
# email/Google), et le balayage de conservation (src/lib/retention-sweep.ts)
# supprimera ensuite ces invites orphelins apres 7 jours d'inactivite. C'est
# exactement ce que la premiere execution de cette purge a fait le 10/09/2026
# (DELETE sans filtre). Donc, pour toute operation future :
#   - migrer EN PLACE (ex. token = sha256(token) via un script Node, sqlite3
#     n'ayant pas sha256) : les cookies existants restent valides ;
#   - ou, a defaut, EPARGNER les sessions des invites :
#     DELETE FROM Session WHERE userId NOT IN (SELECT id FROM User WHERE isGuest = 1);
# Ce bloc applique desormais lui-meme ce filtre : le temoin n'est plus la
# seule protection. Rejoue par erreur (base restauree dans un volume NEUF,
# sans le fichier .session-purge-hashed-tokens.done), il ne ferait que
# deconnecter les comptes email/Google, jamais perdre un invite. Recreer quand
# meme le temoin AVANT de deployer sur un volume neuf.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
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
  # apk exige root ; sqlite3 tourne ensuite sous DB_UID pour que les fichiers
  # WAL crees a l ouverture restent la propriete de l application.
  apk add --no-cache sqlite su-exec >/dev/null 2>&1
  COUNT=$(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "SELECT COUNT(*) FROM Session WHERE userId NOT IN (SELECT id FROM User WHERE isGuest = 1);") || {
    echo "ECHEC : table Session illisible (schema non migre ?), purge impossible"
    exit 1
  }
  su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "DELETE FROM Session WHERE userId NOT IN (SELECT id FROM User WHERE isGuest = 1);"
  echo "$COUNT session(s) de compte email/Google supprimee(s) : ces comptes devront se reconnecter. Sessions d invites epargnees."
  : > "$MARKER"
  chown "$DB_UID:$DB_UID" "$MARKER"
'

echo "=== DB permissions ==="
# Dernier filet AVANT le redemarrage : `prisma migrate deploy` tourne en root
# dans l'image builder et laisse donc, en WAL, un prod.db-wal / prod.db-shm
# appartenant a root. L'application demarre en 1001 : sans ce chown elle ne
# pourrait plus ouvrir sa propre base. On ne force plus journal_mode=DELETE
# (c'est l'application qui pose WAL au demarrage, cf. src/lib/db-setup.ts) et
# on ne supprime plus prod.db-journal a la main : un journal present est un
# journal CHAUD, que seule l'ouverture de la base par sqlite peut rejouer sans
# risque. L'ouverture ci-dessous s'en charge et affiche le mode obtenu.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  # Le chown/chmod passe AVANT tout apk : c est la seule partie indispensable au
  # redemarrage, et elle ne doit pas dependre de la joignabilite du depot alpine
  # (filtre d egress). Le releve du mode de journal, lui, est du confort : il
  # est tolerant a l echec.
  chown -R "$DB_UID:$DB_UID" /data
  # u+rwX seulement : le chown ci-dessus vient de rendre TOUT le volume
  # proprietaire de $DB_UID, et l application tourne sous cet UID. Le bit
  # d ecriture du GROUPE n etait requis par rien et elargissait gratuitement
  # les droits du seul fichier qui porte les comptes des joueurs.
  chmod -R u+rwX /data
  if [ -f /data/prod.db ] && apk add --no-cache sqlite su-exec >/dev/null 2>&1; then
    echo "journal SQLite : $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA journal_mode;" 2>/dev/null || echo inconnu)"
    # Relance du chown : l ouverture ci-dessus a pu creer -wal/-shm.
    chown -R "$DB_UID:$DB_UID" /data
  fi
'

echo "=== Restart container ==="
docker rm -f le-pillaveur 2>/dev/null || true
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi
# DATABASE_URL reste NUE ici, volontairement : les parametres de connexion
# (?connection_limit=1&socket_timeout=15) sont ajoutes par l'application, dans
# src/lib/prisma.ts — source de verite unique. Les repeter ici les ferait aussi
# arriver au CLI Prisma des conteneurs de migration, ou brider le pool n'a
# aucun sens, et il faudrait penser a les changer a deux endroits.
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
