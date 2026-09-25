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
# Image d'outils (sqlite3 + su-exec, scripts/sqlite-tools.Dockerfile) avec
# laquelle TOUT conteneur de ce script qui ouvre la base tourne. Construite
# ci-dessous, avant le premier usage. Les conteneurs qui ne font que chown/test
# sur les fichiers restent sur alpine nue : ils n'ont besoin d'aucun outil.
SQLITE_IMAGE="${SQLITE_IMAGE:-le-pillaveur-sqlite}"
SNAPSHOT=""
ROLLBACK_IMAGE=""

echo "=== Extract ==="
cd "$APP_DIR"
tar xf "$ARCHIVE"
# Fins de ligne : le depot est edite sous Windows avec core.autocrlf=true et
# `* text=auto`, et `git archive` applique cette conversion — seuls les *.sh
# sont proteges par `*.sh text eol=lf` dans .gitattributes. Dockerfile,
# scripts/sqlite-tools.Dockerfile et .dockerignore arrivent donc en CRLF
# (mesure : 41 CR sur 41 lignes pour Dockerfile). BuildKit tolere le CR en fin
# d'instruction et le lecteur de .dockerignore le retire, mais un heredoc ou
# un motif `!README.md` suivi d'un CR ne se comportent pas pareil selon la
# version du demon : on nettoie tout ce que docker lit, pas seulement les
# scripts.
find scripts \( -name '*.sh' -o -name '*.Dockerfile' \) -exec sed -i 's/\r$//' {} + 2>/dev/null || true
sed -i 's/\r$//' Dockerfile .dockerignore 2>/dev/null || true

# tar xf n'ecrase/n'ajoute que les fichiers presents dans l'archive : un
# fichier retire du depot reste orphelin sur le disque d'un deploiement a
# l'autre. Trois zones ou c'est dangereux, et qui sont ENTIEREMENT suivies par
# git (tout ce qui n'est pas dans l'archive y est donc un reliquat) :
#  - src/    : `next build` verifie les types de TOUT src/ (tsconfig inclut
#              **/*.ts). Un module mort qui importe un hook dont la signature
#              a change casse le build — vecu le 25/09/2026 avec
#              src/hooks/useOnlineGameSync.ts. Et une page morte sous src/app,
#              a n'importe quelle profondeur, reste une route EN LIGNE.
#  - public/ : servi tel quel ; un ancien fichier y reste telechargeable.
#  - docs/   : lu par le build (pages legales, regles).
# L'ancienne purge ne regardait que le premier niveau de src/app : les pages
# mortes plus profondes (src/app/[locale]/…) passaient au travers.
# Meme regle pour les configurations ESLint a l'ancienne (.eslintrc*), que le
# lint du build pourrait lire a cote d'eslint.config.mjs.
echo "=== Purge des fichiers orphelins (src, public, docs) ==="
PURGE_MANIFEST=$(mktemp)
tar tf "$ARCHIVE" | grep -v '/$' | LC_ALL=C sort -u > "$PURGE_MANIFEST"
# Garde-fou : une liste vide ou tronquee ferait tout effacer. L'archive a deja
# ete extraite sans erreur ci-dessus ; on exige en plus qu'elle contienne bien
# le code (src/) avant de supprimer quoi que ce soit.
if [ "$(grep -c '^src/' "$PURGE_MANIFEST" || true)" -lt 100 ]; then
  echo "Liste de l'archive anormalement courte : purge ANNULEE, deploiement arrete" >&2
  rm -f "$PURGE_MANIFEST"
  exit 1
fi
for dir in src public docs; do
  [ -d "$dir" ] || continue
  find "$dir" -type f -print | LC_ALL=C sort | LC_ALL=C comm -13 "$PURGE_MANIFEST" - |
    while IFS= read -r orphan; do
      echo "  orphelin supprime : $orphan"
      rm -f -- "$orphan"
    done
  find "$dir" -mindepth 1 -type d -empty -delete
done
for orphan in .eslintrc .eslintrc.json .eslintrc.js .eslintrc.cjs .eslintrc.yml; do
  if [ -e "$orphan" ] && ! grep -qxF "$orphan" "$PURGE_MANIFEST"; then
    echo "  orphelin supprime : $orphan"
    rm -f -- "$orphan"
  fi
done
rm -f "$PURGE_MANIFEST"

echo "=== Version deployee ==="
# BUILD_INFO est ecrit par scripts/deploy-from-local.sh et ajoute a l'archive
# (sha court, sha complet, branche, date). Lu DANS L'ARCHIVE et non dans le
# fichier extrait : un tar fabrique a la main n'en contient pas, et la copie
# laissee sur le disque par le deploiement precedent ferait alors tagger la
# nouvelle image avec un sha perime. Sans BUILD_INFO on deploie quand meme,
# sous « inconnu » : la version s'affichera telle quelle en Supervision.
# Le sha est verifie (hexadecimal, 7 a 40 caracteres) avant de servir de tag
# docker et d'argument de build : le contenu de l'archive n'est pas une source
# a laquelle on colle des chaines arbitraires.
build_info() {
  tar -xOf "$ARCHIVE" BUILD_INFO 2>/dev/null | grep -E "^$1=" | head -1 | cut -d= -f2- | tr -d '\r' || true
}
GIT_SHA=$(build_info GIT_SHA)
if ! echo "$GIT_SHA" | grep -qE '^[0-9a-f]{7,40}$'; then
  echo "Pas de BUILD_INFO exploitable dans l'archive (tar fabrique a la main ?) : version « inconnu »"
  GIT_SHA=inconnu
else
  echo "sha $GIT_SHA (branche $(build_info GIT_BRANCH), archive du $(build_info BUILD_DATE))"
fi

echo "=== Image d'outils SQLite ==="
# sqlite3 + su-exec preinstalles : plus aucun `apk add` — donc plus aucun
# acces reseau — au moment d'ouvrir la base, la ou un depot alpine injoignable
# coupait le deploiement entre deux etapes. Reconstruite a chaque deploiement
# plutot que « si absente ou si le Dockerfile a change » : 2 s en cache, et
# rien a detecter. Si docker est en panne, c'est ici que ca s'arrete, avant
# d'avoir touche a quoi que ce soit. Meme nom d'image pour le cron de
# sauvegarde (scripts/vps-secure-max.sh), qui retombe sur alpine + apk si elle
# manque.
docker build -q -t "$SQLITE_IMAGE" -f "$APP_DIR/scripts/sqlite-tools.Dockerfile" "$APP_DIR/scripts" >/dev/null

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
# Le sha entre dans l'image (ARG GIT_SHA du Dockerfile -> NEXT_PUBLIC_BUILD_SHA
# + etiquette OCI). Meme argument pour les deux builds : sinon la cible builder
# ne retrouverait pas les couches que le build complet vient de produire.
docker build --build-arg "GIT_SHA=$GIT_SHA" -t le-pillaveur:latest . 2>&1 | tail -20
docker build --build-arg "GIT_SHA=$GIT_SHA" --target builder -t le-pillaveur:builder . >/dev/null

echo "=== Tags de version ==="
# le-pillaveur:<sha> = retrouver l'image d'un deploiement donne (retour a une
# version precise avec prod-db-restore.sh --image, comparaison de deux
# versions). On n'en garde que trois : `docker images` liste du plus recent au
# plus ancien, on detache tout tag sha au-dela. Detacher un tag n'efface
# l'image que si plus rien ne la reference : latest, previous et builder ne
# ressemblent pas a un sha et ne sont jamais touches.
if [ "$GIT_SHA" != "inconnu" ]; then
  docker tag le-pillaveur:latest "le-pillaveur:$GIT_SHA"
  echo "Image taguee le-pillaveur:$GIT_SHA"
  docker images le-pillaveur --format '{{.Tag}}' \
    | grep -E '^[0-9a-f]{7,40}$' \
    | tail -n +4 \
    | while read -r old; do
        echo "  tag retire : le-pillaveur:$old"
        docker rmi "le-pillaveur:$old" >/dev/null 2>&1 || true
      done || true
fi

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
    "$SQLITE_IMAGE" sh -c "
      set -e
      # La copie passe par /tmp (inscriptible par tous dans l'image) : le
      # dossier de sauvegarde de l'hote est en 700 root/ubuntu, l'UID $DB_UID
      # ne peut pas y ecrire — ni le fichier, ni le journal que sqlite3 cree
      # a cote de la destination pendant le .backup.
      su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \".backup /tmp/snapshot.db\"
      # La copie est VERIFIEE avant de servir de filet : un .backup rend 0 meme
      # depuis une base deja abimee, et l instantane le serait tout autant —
      # c est pourtant lui que prod-db-restore.sh (ou le cron off-site, qui ne
      # choisit que le plus recent) rejouerait. Meme garde-fou que le cron de
      # sauvegarde (scripts/vps-secure-max.sh) : sur la COPIE, jamais sur
      # prod.db, qu un integrity_check retiendrait pendant que le site ecrit.
      CHECK=\$(su-exec $DB_UID:$DB_UID sqlite3 /tmp/snapshot.db \"PRAGMA integrity_check;\")
      if [ \"\$CHECK\" != ok ]; then
        echo \"ECHEC : integrity_check de l instantane a rendu (5 premieres lignes) :\"
        echo \"\$CHECK\" | head -5
        # La copie refusee est CONSERVEE sous un prefixe a part : une base
        # abimee qui sert encore (un index corrompu suffit) ferait jeter
        # chaque instantane, et l operateur n aurait plus que des copies
        # d AVANT le dommage — aucun etat courant pour tenter \`.recover\`.
        # Hors des motifs prod-* : invisible pour prod-db-restore.sh, le
        # cron off-site et les purges ; a supprimer A LA MAIN une fois la
        # base reparee (docs/ops/ALERTES.md).
        mv /tmp/snapshot.db /backup/suspect-predeploy-${STAMP}.db
        gzip -f /backup/suspect-predeploy-${STAMP}.db
        echo \"Copie suspecte conservee : $BACKUP_DIR/suspect-predeploy-${STAMP}.db.gz\"
        exit 1
      fi
      # Le -wal a pu grossir depuis le dernier point de controle : on le replie
      # dans le fichier principal maintenant que la copie est prise. Tolerant
      # a l echec (un lecteur en cours rend « busy ») : la sauvegarde, elle,
      # est deja faite, et c est elle qui conditionne la migration.
      su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"PRAGMA wal_checkpoint(TRUNCATE);\" >/dev/null || true
      mv /tmp/snapshot.db /backup/prod-predeploy-${STAMP}.db
    "
  sudo gzip -f "$BACKUP_DIR/prod-predeploy-${STAMP}.db"
  SNAPSHOT="$BACKUP_DIR/prod-predeploy-${STAMP}.db.gz"
  # `gzip -t` en plus de `test -s` : un .gz tronque (disque plein en cours de
  # compression) a une taille non nulle mais ne se decompresse pas. Le cron
  # off-site le refuserait a 03:15 ; autant le savoir ICI, avant de migrer.
  if [ -z "$SNAPSHOT" ] || ! sudo test -s "$SNAPSHOT" || ! sudo gzip -t "$SNAPSHOT"; then
    echo "ECHEC DEPLOY : instantane de la base impossible ou illisible, migration annulee"
    exit 1
  fi
  echo "Instantane : $SNAPSHOT ($(sudo du -h "$SNAPSHOT" | cut -f1))"
fi

echo "=== Prisma migrate deploy ==="
# Seule etape de migration : elle applique tout prisma/migrations, dans
# l'ordre, en s'appuyant sur _prisma_migrations. Les six migrations dites
# « manuelles » d'autrefois (user_activity, auth_feedback_reset, visitor_ip,
# ip_history, visitor_local_players, visitor_device) ne sont plus rejouees
# ici : verifiees ENREGISTREES ET TERMINEES dans _prisma_migrations de prod le
# 21/09/2026, elles etaient sondees puis sautees a chaque deploiement, au prix
# de six conteneurs et d'autant d'`apk add` par le reseau.
docker run --rm \
  -v "$DB_VOLUME:/app/prisma" \
  -v "$APP_DIR/prisma/migrations:/app/prisma/migrations:ro" \
  -v "$APP_DIR/prisma/schema.prisma:/app/prisma/schema.prisma:ro" \
  -e DATABASE_URL=file:/app/prisma/prod.db \
  le-pillaveur:builder \
  npx prisma migrate deploy

echo "=== Droits DB apres le CLI Prisma ==="
# `prisma migrate deploy` vient de tourner en ROOT dans l'image builder : en
# WAL, il laisse un prod.db-wal / prod.db-shm appartenant a root. Or la purge
# des sessions qui suit ouvre la base sous $DB_UID, et en WAL meme un simple
# SELECT doit pouvoir ECRIRE le fichier -shm : sans ce chown intercale, elle
# echouerait a ouvrir la base et set -e couperait le deploiement APRES la
# migration mais AVANT le redemarrage — le pire des etats d'arret. L'etape
# « DB permissions » plus bas reste en place, en dernier filet.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  chown -R "$DB_UID:$DB_UID" /data
  chmod -R u+rwX /data
'

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
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" "$SQLITE_IMAGE" sh -c '
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
  # sqlite3 tourne sous DB_UID pour que les fichiers WAL crees a l ouverture
  # restent la propriete de l application.
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
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" "$SQLITE_IMAGE" sh -c '
  set -e
  # chown/chmod d abord : c est la seule partie indispensable au redemarrage.
  # Le releve du mode de journal, lui, est du confort, tolerant a l echec.
  chown -R "$DB_UID:$DB_UID" /data
  # u+rwX seulement : le chown ci-dessus vient de rendre TOUT le volume
  # proprietaire de $DB_UID, et l application tourne sous cet UID. Le bit
  # d ecriture du GROUPE n etait requis par rien et elargissait gratuitement
  # les droits du seul fichier qui porte les comptes des joueurs.
  chmod -R u+rwX /data
  if [ -f /data/prod.db ]; then
    echo "journal SQLite : $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA journal_mode;" 2>/dev/null || echo inconnu)"
    # Relance du chown : l ouverture ci-dessus a pu creer -wal/-shm.
    chown -R "$DB_UID:$DB_UID" /data
  fi
'

echo "=== Restart container ==="
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
#
# Garde-fous de ressources, absents jusqu'ici. Le VPS (3,8 Go de RAM) est
# partage avec Caddy : un conteneur sans limite qui fuit emporte l'hote entier
# (OOM killer au hasard) au lieu de redemarrer seul (--restart always).
#   --memory=1g : PLAFOND DE SECURITE, pas une mesure de besoin — le conteneur
#     consommait 283 Mio le 21/09/2026 (docker stats), 3,5 fois moins.
#   --memory-swap egal a --memory : pas de swap pour le conteneur ; mieux vaut
#     un redemarrage net qu'un site qui rame en swappant.
#   --pids-limit=512 : borne une fuite de processus/threads (15 pids en
#     fonctionnement normal).
#   --log-opt : les journaux json-file n'avaient AUCUNE rotation et
#     grossissaient sans fin sur un disque deja a 79 % ; 5 x 20 Mo suffisent
#     a relire les derniers jours avec `docker logs`. Ces deux options ne sont
#     valides QUE pour les pilotes json-file et local : sur un demon configure
#     en journald/syslog, docker refuse le conteneur (« unknown log opt »).
# Les memes options sont reprises par scripts/prod-db-restore.sh (retour
# arriere) : les garder identiques.
RUN_ARGS=(
  --restart always
  --memory=1g --memory-swap=1g
  --pids-limit=512
  --log-opt max-size=20m --log-opt max-file=5
  -p 127.0.0.1:3000:3000
  -v "$DB_VOLUME:/app/prisma"
  "${ENV_ARGS[@]}"
  -e NODE_ENV=production
  -e DATABASE_URL=file:/app/prisma/prod.db
)
# Sonde AVANT de couper l'ancien conteneur : une option refusee par le demon
# (pilote de journalisation, cgroup sans memoire) n'etait decouverte qu'APRES
# `docker rm -f`, site a terre jusqu'a correction manuelle. `docker create`
# fait valider les options par le demon sans rien demarrer (le port n'est
# reserve qu'au start), puis on jette le conteneur sonde. Un echec ici laisse
# l'ancien conteneur en place : le site tourne toujours, sur l'ancien code
# mais la base est deja migree — corriger l'option puis relancer le script.
docker rm -f le-pillaveur-probe >/dev/null 2>&1 || true
if ! docker create --name le-pillaveur-probe "${RUN_ARGS[@]}" le-pillaveur:latest >/dev/null; then
  echo "ECHEC DEPLOY : le demon docker refuse les options du conteneur (message ci-dessus)."
  echo "L'ancien conteneur n'a PAS ete coupe (base deja migree). Verifier par exemple le pilote de journaux :"
  echo "  docker info --format '{{.LoggingDriver}}'   # attendu : json-file ou local"
  exit 1
fi
docker rm le-pillaveur-probe >/dev/null
docker rm -f le-pillaveur 2>/dev/null || true
docker run -d \
  --name le-pillaveur \
  "${RUN_ARGS[@]}" \
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
      echo "Version en ligne : $GIT_SHA"
      echo DONE_DEPLOY

      echo "=== Menage disque (le site est en ligne : rien ici ne conditionne le deploiement) ==="
      # Le cache de build BuildKit est ce qui remplit le disque : chaque
      # `docker build` y laisse les couches intermediaires de toutes les
      # versions passees (55 Go recuperables sur 77 le 21/09/2026, disque a
      # 79 %), et rien ne les purgeait. On garde 8 Go : UN build pese deja
      # plus de 4 Go dans le cache — la couche `npm ci` (~2 Go, la seule
      # longue a refaire), la copie complete de node_modules que fait
      # `COPY --from=deps` (second enregistrement de meme taille) et .next —
      # et BuildKit purge du moins recemment utilise : sous l'empreinte d'un
      # build, c'est `npm ci`, premiere couche touchee, qui partait la
      # premiere, et le deploiement suivant la refaisait par le reseau. 8 Go
      # laissent la marge d'un build entier et liberent quand meme ~45 Go.
      # `docker image prune` SANS -a ne retire que les images sans tag
      # (l'ancien builder, les restes de build) : latest, previous, builder
      # et les tags sha restent. Tout est tolerant a l'echec : DONE_DEPLOY
      # est deja imprime, le deploiement est fait.
      echo "disque avant : $(df -h / | tail -1)"
      docker image prune -f 2>&1 | tail -1 || true
      # --reserved-space est le nom actuel (docker 29 / buildx) de l'ancien
      # --keep-storage : on essaie l'un puis l'autre pour ne pas dependre de
      # la version du demon.
      docker builder prune -f --reserved-space 8GB 2>&1 | tail -1 \
        || docker builder prune -f --keep-storage 8GB 2>&1 | tail -1 \
        || echo "  (builder prune impossible : voir « docker builder prune --help »)"
      echo "disque apres : $(df -h / | tail -1)"
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
