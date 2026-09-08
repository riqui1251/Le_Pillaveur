#!/bin/bash
# Restauration d'un instantane SQLite de production dans le volume Docker,
# et/ou retour a l'image applicative precedente.
#
# Les instantanes proviennent soit du cron quotidien de 03:00 pose par
# scripts/vps-secure-max.sh, soit de l'instantane pris avant migration par
# scripts/prod-deploy.sh (prefixe prod-predeploy-). Ils vivent tous dans
# /opt/le-pillaveur-backups sous forme de .db.gz.
#
# Usage :
#   bash scripts/prod-db-restore.sh                 # liste les instantanes
#   bash scripts/prod-db-restore.sh prod-2026....gz # restaure les donnees
#   bash scripts/prod-db-restore.sh --image le-pillaveur:previous prod-2026....gz
#                                                   # donnees + code precedent
#   bash scripts/prod-db-restore.sh --image le-pillaveur:previous
#                                                   # code precedent seul
#
# --image <tag> : image avec laquelle le conteneur est redemarre (defaut
# le-pillaveur:latest, c'est-a-dire le code fraichement deploye). Restaurer les
# seules DONNEES redemarre le NOUVEAU code sur l'ANCIEN schema : quand c'est le
# deploiement lui-meme qui est fautif, il faut aussi revenir a l'image d'avant,
# que prod-deploy.sh conserve sous le tag le-pillaveur:previous.
#
# Le script est volontairement bavard et lent : il verifie l'archive AVANT de
# toucher la prod, sauvegarde la base actuelle, demande une confirmation tapee
# a la main, puis redemarre le conteneur et verifie sa sante. Cette confirmation
# exige un vrai terminal : le lancer via un ssh non interactif est refuse.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PAGE_URL="${PAGE_URL:-http://127.0.0.1:3000/}"
HEALTH_TRIES="${HEALTH_TRIES:-10}"
HEALTH_DELAY="${HEALTH_DELAY:-3}"
RESTART_IMAGE="${RESTART_IMAGE:-le-pillaveur:latest}"

# L'aide est l'en-tete du fichier : une seule source a maintenir.
usage() {
  sed -n '2,27p' "$0"
}

SNAPSHOT=""
IMAGE_GIVEN=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --image)
      shift
      if [ "$#" -lt 1 ]; then
        echo "ECHEC : --image attend un tag (ex. le-pillaveur:previous)"
        exit 1
      fi
      RESTART_IMAGE="$1"
      IMAGE_GIVEN=1
      ;;
    --image=*)
      RESTART_IMAGE="${1#--image=}"
      IMAGE_GIVEN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Option inconnue : $1"
      usage
      exit 1
      ;;
    *)
      if [ -n "$SNAPSHOT" ]; then
        echo "ECHEC : un seul instantane a la fois (recu « $SNAPSHOT » puis « $1 »)"
        exit 1
      fi
      SNAPSHOT="$1"
      ;;
  esac
  shift
done

# Deux chantiers independants : les DONNEES (un instantane a remettre) et le
# CODE (l'image avec laquelle on redemarre). On peut demander l'un, l'autre ou
# les deux ; sans rien, on se contente de lister ce qui est disponible.
RESTORE_DATA=0
if [ -n "$SNAPSHOT" ]; then
  RESTORE_DATA=1
fi

if [ "$RESTORE_DATA" = "1" ] || [ "$IMAGE_GIVEN" = "0" ]; then
  echo "===== 1) INSTANTANES DISPONIBLES ====="
  if ! sudo test -d "$BACKUP_DIR"; then
    echo "Aucun dossier de sauvegarde : $BACKUP_DIR"
    echo "Lancer d'abord scripts/vps-secure-max.sh (il installe le cron de sauvegarde)."
    exit 1
  fi
  # Le dossier est en 700 : le listing passe par sudo pour marcher quel que soit
  # l'utilisateur qui lance le script. Le chemin est passe en ARGUMENT du shell
  # appele, jamais colle dans sa ligne de commande.
  sudo sh -c 'ls -lht "$1"/prod-*.db.gz 2>/dev/null' sh "$BACKUP_DIR" || {
    echo "Aucun instantane prod-*.db.gz dans $BACKUP_DIR"
    exit 1
  }
fi

if [ "$RESTORE_DATA" = "0" ] && [ "$IMAGE_GIVEN" = "0" ]; then
  echo
  echo "Choisir un instantane ci-dessus puis relancer :"
  echo "  bash $APP_DIR/scripts/prod-db-restore.sh <nom-du-fichier.db.gz>"
  echo "Pour revenir aussi au code precedent :"
  echo "  bash $APP_DIR/scripts/prod-db-restore.sh --image le-pillaveur:previous <nom-du-fichier.db.gz>"
  exit 0
fi

# Redemarrer sur un tag inexistant laisserait le site a terre : on verifie
# l'image AVANT de couper quoi que ce soit.
if ! docker image inspect "$RESTART_IMAGE" >/dev/null 2>&1; then
  echo "ECHEC : image introuvable : $RESTART_IMAGE"
  echo "Images disponibles :"
  docker images 'le-pillaveur*' --format '  {{.Repository}}:{{.Tag}}  ({{.CreatedSince}})' || true
  exit 1
fi

if [ "$RESTORE_DATA" = "1" ]; then
  # Un nom nu est cherche dans BACKUP_DIR, un chemin absolu est pris tel quel.
  case "$SNAPSHOT" in
    /*) ;;
    *) SNAPSHOT="$BACKUP_DIR/$SNAPSHOT" ;;
  esac
  if ! sudo test -s "$SNAPSHOT"; then
    echo "Instantane introuvable ou vide : $SNAPSHOT"
    exit 1
  fi

  echo
  echo "===== 2) VERIFICATION DE L'ARCHIVE ====="
  WORK="/tmp/le-pillaveur-restore-$$"
  # Le repertoire de travail contient une copie complete de la base : on le
  # detruit quoi qu'il arrive (succes, echec, interruption).
  trap 'sudo rm -rf "$WORK"' EXIT
  sudo mkdir -p "$WORK"
  # Le nom de l'instantane vient de l'utilisateur : il est passe en ARGUMENT du
  # shell root (positionnels "$1"/"$2"), jamais interpole dans sa ligne de
  # commande — sinon un nom de fichier bien choisi ferait executer n'importe
  # quoi en root.
  sudo sh -c 'gunzip -c -- "$1" > "$2"' sh "$SNAPSHOT" "$WORK/restore.db"

  # Restaurer une archive corrompue detruirait la prod sans retour utile : on
  # ouvre la copie hors ligne avant de toucher au volume.
  INTEGRITY=$(docker run --rm -v "$WORK:/restore" alpine sh -c \
    'apk add --no-cache sqlite >/dev/null && sqlite3 /restore/restore.db "PRAGMA integrity_check;"' | tr -d '\r')
  if [ "$INTEGRITY" != "ok" ]; then
    echo "ECHEC : integrite SQLite refusee ($INTEGRITY)"
    exit 1
  fi
  USERS=$(docker run --rm -v "$WORK:/restore" alpine sh -c \
    'apk add --no-cache sqlite >/dev/null && sqlite3 /restore/restore.db "SELECT COUNT(*) FROM User;" 2>/dev/null' | tr -d '\r' || true)
  echo "Integrite : ok"
  echo "Comptes dans l'instantane : $USERS"
fi

echo
echo "===== 3) CONFIRMATION ====="
if [ "$RESTORE_DATA" = "1" ]; then
  CURRENT_USERS=$(docker run --rm -v "$DB_VOLUME:/data:ro" alpine sh -c \
    'apk add --no-cache sqlite >/dev/null && sqlite3 /data/prod.db "SELECT COUNT(*) FROM User;" 2>/dev/null' | tr -d '\r' || true)
  echo "Base actuelle  : volume $DB_VOLUME (${CURRENT_USERS:-?} comptes)"
  echo "Sera remplacee : $SNAPSHOT (${USERS:-?} comptes)"
  echo "Tout ce qui a ete ecrit depuis l'instantane sera PERDU."
else
  echo "Base actuelle  : INCHANGEE (aucun instantane demande)"
fi
echo "Image de redemarrage : $RESTART_IMAGE"
echo "Le conteneur le-pillaveur sera ARRETE puis redemarre : coupure de service."
if [ ! -t 0 ]; then
  # Pas de tty : refus net plutot qu'une restauration declenchee par un pipe.
  echo "ECHEC : confirmation impossible (entree non interactive). Relancer depuis un terminal (ssh -t)."
  exit 1
fi
printf 'Taper RESTAURER pour continuer : '
read -r ANSWER
if [ "$ANSWER" != "RESTAURER" ]; then
  echo "Annule."
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
if [ "$RESTORE_DATA" = "1" ]; then
  echo
  echo "===== 4) SAUVEGARDE DE LA BASE ACTUELLE ====="
  # La restauration est elle-meme destructrice : on garde de quoi revenir en
  # arriere si on s'est trompe d'instantane.
  docker run --rm \
    -v "$DB_VOLUME:/data:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/prod.db \".backup /backup/prod-prerestore-${STAMP}.db\""
  sudo gzip -f "$BACKUP_DIR/prod-prerestore-${STAMP}.db"
  echo "Base actuelle sauvegardee : $BACKUP_DIR/prod-prerestore-${STAMP}.db.gz"
fi

echo
echo "===== 5) ARRET DU CONTENEUR ====="
# Aucun ecrivain ne doit tenir le fichier pendant la copie, sinon on restaure
# une base que le processus vivant reecrit aussitot.
docker rm -f le-pillaveur 2>/dev/null || true

if [ "$RESTORE_DATA" = "1" ]; then
  echo
  echo "===== 6) RESTAURATION ====="
  # Droits identiques a scripts/prod-fix-db-perms.sh et a l'etape « DB
  # permissions » du deploiement : proprietaire 1001 (l'utilisateur du
  # conteneur) et ecriture pour le groupe. Le 640 pose ici divergeait de cette
  # convention (SQLite a besoin d'ecrire aussi ses fichiers annexes).
  docker run --rm -v "$DB_VOLUME:/data" -v "$WORK:/restore:ro" alpine sh -c '
    set -e
    rm -f /data/prod.db-journal /data/prod.db-wal /data/prod.db-shm
    cp /restore/restore.db /data/prod.db
    chown -R 1001:1001 /data
    chmod -R u+rwX,g+rwX /data
    ls -l /data/prod.db
  '
fi

echo
echo "===== 7) REDEMARRAGE ($RESTART_IMAGE) ====="
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
  "$RESTART_IMAGE"

sudo /usr/local/bin/egress-filter.sh 2>/dev/null || true

echo
echo "===== 8) CONTROLE DE SANTE ====="
HEALTH_BODY=/tmp/.restore-health.json
PAGE_BODY=/tmp/.restore-page.html
page_code=000
attempt=1
while [ "$attempt" -le "$HEALTH_TRIES" ]; do
  code=$(curl -s -o "$HEALTH_BODY" -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)
  [ -n "$code" ] || code=000
  if [ "$code" = "200" ] && grep -q '"ok":true' "$HEALTH_BODY"; then
    # Comme au deploiement : la sonde ne rend aucune page, on verifie donc
    # aussi qu'une vraie page sort du rendu.
    page_code=$(curl -sL -o "$PAGE_BODY" -w '%{http_code}' --max-time 15 "$PAGE_URL" || true)
    [ -n "$page_code" ] || page_code=000
    if [ "$page_code" = "200" ] && grep -qi '</html>' "$PAGE_BODY"; then
      echo "Sante OK (tentative $attempt/$HEALTH_TRIES) : $(cat "$HEALTH_BODY")"
      echo "Page $PAGE_URL rendue (status=$page_code)"
      rm -f "$HEALTH_BODY" "$PAGE_BODY"
      # Le tag courant doit suivre l'image sur laquelle on tourne vraiment :
      # sinon le-pillaveur:latest pointe encore sur l'image fautive, et le
      # deploiement suivant l'archiverait comme "previous" (retour arriere perdu).
      if [ "$RESTART_IMAGE" != "le-pillaveur:latest" ]; then
        docker tag "$RESTART_IMAGE" le-pillaveur:latest
        echo "Tag le-pillaveur:latest realigne sur $RESTART_IMAGE"
      fi
      echo DONE_RESTORE
      exit 0
    fi
    echo "  tentative $attempt/$HEALTH_TRIES : base OK mais page $PAGE_URL status=$page_code"
  else
    echo "  tentative $attempt/$HEALTH_TRIES : status=$code"
  fi
  attempt=$((attempt + 1))
  sleep "$HEALTH_DELAY"
done

echo "ECHEC RESTORE : $HEALTH_URL / $PAGE_URL ne repondent pas sainement apres $HEALTH_TRIES tentatives"
echo "Derniere reponse sante : $(cat "$HEALTH_BODY" 2>/dev/null || echo '(vide)')"
echo "Dernier status page : $page_code"
rm -f "$HEALTH_BODY" "$PAGE_BODY"
echo "--- docker logs le-pillaveur (30 dernieres lignes) ---"
docker logs --tail 30 le-pillaveur 2>&1 || true
if [ "$RESTORE_DATA" = "1" ]; then
  echo "Retour arriere possible : bash $APP_DIR/scripts/prod-db-restore.sh prod-prerestore-${STAMP}.db.gz"
fi
exit 1
