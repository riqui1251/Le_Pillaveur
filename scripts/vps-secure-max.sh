#!/bin/bash
# Durcissement VPS Le Pillaveur — permissions, sauvegardes DB, sysctl, mises à jour.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
BACKUP_SCRIPT="/usr/local/bin/le-pillaveur-db-backup.sh"
# Veille disque et copie off-site : deux scripts du dépôt (scripts/) recopiés
# sous /usr/local/bin en root, comme le script de sauvegarde. Le cron root
# n'exécute ainsi jamais un fichier de $APP_DIR, que `ubuntu` peut modifier.
DISK_SCRIPT="/usr/local/bin/le-pillaveur-disk-watch.sh"
OFFSITE_SCRIPT="/usr/local/bin/le-pillaveur-db-backup-offsite.sh"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# UID/GID du propriétaire de prod.db : l'utilisateur `nextjs` du Dockerfile.
# La base est en WAL (journal posé par l'application, src/lib/db-setup.ts) :
# l'ouvrir crée prod.db-wal et prod.db-shm à côté du fichier. Tout conteneur de
# maintenance doit donc lancer sqlite3 SOUS CET UID, sinon il laisse des
# fichiers annexes appartenant à root et l'application ne peut plus ouvrir sa
# propre base.
DB_UID="${DB_UID:-1001}"

echo "===== 1) PERMISSIONS SECRETS ====="
if [ -f "$APP_DIR/.env" ]; then
  chmod 600 "$APP_DIR/.env"
  chown ubuntu:ubuntu "$APP_DIR/.env"
  echo ".env -> $(stat -c '%a %U:%G' "$APP_DIR/.env")"
fi

echo "===== 2) VOLUME DB (prod uniquement, permissions restreintes) ====="
# On n'impose plus journal_mode=DELETE et on ne supprime plus prod.db-journal à
# la main : c'est l'application qui pose WAL au démarrage (src/lib/db-setup.ts),
# et un -journal présent est un journal CHAUD que seule l'ouverture de la base
# par sqlite peut rejouer sans risque de corruption. L'ouverture ci-dessous s'en
# charge et affiche le mode réellement en place.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  # apk exige root ; sqlite3 redescend ensuite en DB_UID (su-exec).
  apk add --no-cache sqlite su-exec >/dev/null 2>&1 || true
  rm -f /data/dev.db /data/dev.db-journal /data/dev.db-wal /data/dev.db-shm
  chown -R "$DB_UID:$DB_UID" /data
  chmod 750 /data
  # 640 et non 660 : le chown ci-dessus fait de $DB_UID le PROPRIÉTAIRE du
  # fichier, et le conteneur applicatif tourne sous cet UID — il écrit donc
  # prod.db, prod.db-wal et prod.db-shm avec le seul bit d'écriture du
  # propriétaire. Les fichiers -wal/-shm sont créés par SQLite à côté, en
  # héritant du mode du fichier principal. Donner l'écriture au GROUPE n'était
  # requis par rien, et c'est le fichier qui porte tous les comptes.
  chmod 640 /data/prod.db 2>/dev/null || true
  if [ -f /data/prod.db ]; then
    echo "journal SQLite : $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA journal_mode;" 2>/dev/null || echo inconnu)"
    # L ouverture ci-dessus a pu créer -wal/-shm : on repasse le chown.
    chown -R "$DB_UID:$DB_UID" /data
  fi
  ls -la /data/
'

echo "===== 3) SAUVEGARDE DB (quotidienne 03:00, horaire 18 h - 04 h) ====="
# /!\ À rejouer LE SOIR MÊME d'un déploiement, avant 03:00 : le script de
# sauvegarde INSTALLÉ (copie sous /usr/local/bin) est celui du dernier passage
# de ce fichier, pas celui du dépôt. Une version antérieure au passage en WAL
# (volume monté `:ro`, sqlite3 en root, sans integrity_check ni gzip -t ni
# ping) ouvrirait à 03:00 une base WAL sur un montage lecture seule — rien de
# destructif, mais une nuit sans copie vérifiée. Ordre et heure creuse :
# docs/ops/ALERTES.md §3 (la section 6 ci-dessous peut redémarrer docker).
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
chown ubuntu:ubuntu "$BACKUP_DIR"

sudo tee "$BACKUP_SCRIPT" >/dev/null <<'SCRIPT'
#!/bin/bash
# Sauvegarde de prod.db. Installé par scripts/vps-secure-max.sh, lancé par le
# cron root en deux cadences :
#   daily  (sans argument) : 03:00, préfixe prod-, 14 jours, point de contrôle
#                            WAL, ping du « dead man's switch » ;
#   hourly                 : 18 h → 04 h, préfixe prod-hourly-, 48 h, ni point
#                            de contrôle ni ping de succès.
# Chaque copie est VÉRIFIÉE (integrity_check, puis gzip -t) avant de compter
# comme sauvegarde : jusqu'ici, la première relecture d'une copie était la
# restauration — trop tard pour en refaire une.
set -euo pipefail
MODE="${1:-daily}"
case "$MODE" in
  daily|hourly) ;;
  *) echo "usage : $0 [daily|hourly]" >&2; exit 2 ;;
esac
BACKUP_DIR="/opt/le-pillaveur-backups"
DB_VOLUME="le-pillaveur-db"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : l'ouvrir crée prod.db-wal et prod.db-shm. Sauvegarder en root laisserait
# ces fichiers à root et casserait l'application au redémarrage suivant.
DB_UID="${DB_UID:-1001}"
# « Dead man's switch » : ce fichier, posé À LA MAIN par l'opérateur (jamais
# dans le dépôt, voir docs/ops/ALERTES.md), contient l'URL de ping d'un service
# du type healthchecks.io. Le script l'appelle à la FIN d'une sauvegarde
# quotidienne réussie ; si l'appel manque (cron cassé, docker arrêté, VPS
# éteint), c'est le service qui prévient l'opérateur — rien ici n'a besoin de
# fonctionner pour que l'alerte parte. Un échec franc appelle <url>/fail pour
# prévenir tout de suite, sans attendre la période de grâce. Fichier absent :
# les sauvegardes tournent comme avant, personne n'est prévenu.
PING_URL_FILE="/etc/le-pillaveur/backup-ping-url"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
if [ "$MODE" = hourly ]; then PREFIX="prod-hourly-"; else PREFIX="prod-"; fi
OUT="$BACKUP_DIR/${PREFIX}${STAMP}.db"
# Passe à 1 quand ${OUT}.gz est relu avec succès : un échec APRÈS ce point
# (purge) ne doit pas emporter une sauvegarde valide.
BACKUP_DONE=0

PING_URL=""
if [ -r "$PING_URL_FILE" ]; then
  PING_URL=$(head -n 1 "$PING_URL_FILE" | tr -d '[:space:]')
fi

# ping_url [/fail] — appel silencieux, jamais bloquant : l'URL contient un
# secret et ne doit apparaître ni dans le journal ni dans un message de curl.
# La convention <url>/fail est celle de healthchecks.io (hébergé : hc-ping.com,
# auto-hébergé : …/ping/<uuid>). Pour tout autre service on n'invente pas de
# route : seul le silence du ping de succès alerte, et rien ne casse.
ping_url() {
  [ -n "$PING_URL" ] || return 0
  local suffix="${1:-}"
  if [ -n "$suffix" ]; then
    case "$PING_URL" in
      *hc-ping.com/*|*/ping/*) ;;
      *) return 0 ;;
    esac
  fi
  curl -fsS -m 10 --retry 3 -o /dev/null "${PING_URL}${suffix}" 2>/dev/null \
    || echo "[$(date -Is)] ping${suffix} impossible : la sauvegarde n'en dépend pas, mais l'alerte externe est aveugle"
}

# Tout échec passe ici (set -e) : le fichier en cours est retiré, le journal
# dit pourquoi, le service d'alerte est prévenu. Le mode horaire n'envoie pas
# de ping de SUCCÈS (le quotidien suffit à prouver que la chaîne fonctionne),
# mais un échec horaire — une copie qui ne passe pas integrity_check est le
# premier signe d'une base abîmée — n'attend pas 03:00 pour être signalé.
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    if [ "$BACKUP_DONE" -eq 0 ]; then rm -f "$OUT" "${OUT}.gz"; fi
    echo "[$(date -Is)] backup ECHEC ($MODE, code $status) : aucune copie conservée pour ce passage"
    ping_url /fail
  fi
}
trap on_exit EXIT

# Image de maintenance : `le-pillaveur-sqlite` (alpine + sqlite3 + su-exec) est
# construite par prod-deploy.sh et ne dépend pas du réseau. Tant qu'elle
# n'existe pas (avant le prochain déploiement), on retombe sur alpine + apk :
# ce cron doit marcher AVANT ce déploiement, pas seulement après.
if docker image inspect le-pillaveur-sqlite >/dev/null 2>&1; then
  IMAGE="le-pillaveur-sqlite"; NEED_APK=0
else
  IMAGE="alpine"; NEED_APK=1
fi

# Volume monté en lecture-ÉCRITURE (et non plus `:ro`) : en WAL, SQLite doit
# pouvoir créer le fichier de mémoire partagée -shm pour seulement LIRE la
# base ; monté `:ro`, la sauvegarde échouerait dès qu'il manque.
# `.backup` reste la commande : elle prend une copie cohérente même pendant que
# l'application écrit, ce qu'un `cp` ne garantit pas en WAL.
docker run --rm \
  -e DB_UID="$DB_UID" -e MODE="$MODE" -e NEED_APK="$NEED_APK" -e STAMP="$STAMP" \
  -e TARGET="/backup/$(basename "$OUT")" \
  -v "$DB_VOLUME:/data" \
  -v "$BACKUP_DIR:/backup" \
  "$IMAGE" sh -c '
    set -e
    # apk exige root : on installe, puis on redescend en $DB_UID (su-exec).
    if [ "$NEED_APK" = 1 ]; then apk add --no-cache sqlite su-exec >/dev/null; fi
    # La copie passe par /tmp : /backup est en 700 côté hôte, l UID $DB_UID
    # ne peut y écrire ni le fichier ni le journal que sqlite3 crée à côté de
    # la destination pendant le .backup.
    su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db ".backup /tmp/copie.db"
    # Vérification de la COPIE, pas de la base vivante : c est elle qu on
    # restaurera, et un integrity_check sur prod.db retiendrait les écrivains
    # le temps du parcours. Tout autre résultat que « ok » = copie inutilisable
    # comme SAUVEGARDE (et base source probablement abîmée) : on échoue fort.
    CHECK=$(su-exec "$DB_UID:$DB_UID" sqlite3 /tmp/copie.db "PRAGMA integrity_check;")
    if [ "$CHECK" != "ok" ]; then
      echo "ECHEC : integrity_check de la copie a rendu (5 premières lignes) :" >&2
      printf "%s\n" "$CHECK" | head -n 5 >&2
      # La copie refusée n est PAS jetée : une base abîmée qui sert encore (un
      # index corrompu suffit) ferait rejeter chaque copie horaire et
      # quotidienne, et l opérateur n aurait plus que des copies d AVANT le
      # dommage — aucun état courant pour tenter `.recover`. Préfixe suspect-,
      # hors des motifs prod-* : invisible pour prod-db-restore.sh, le cron
      # off-site et les purges de ce script. 48 h de recul, purgées ICI (le
      # chemin nominal ne les voit jamais) pour qu une corruption qui dure ne
      # remplisse pas le disque à raison de douze copies par jour.
      find /backup -name "suspect-*.db.gz" -mmin +2880 -delete 2>/dev/null || true
      rm -f /tmp/copie.db-wal /tmp/copie.db-shm
      mv /tmp/copie.db "/backup/suspect-${MODE}-${STAMP}.db"
      gzip -f "/backup/suspect-${MODE}-${STAMP}.db"
      echo "Copie suspecte conservée pour analyse : suspect-${MODE}-${STAMP}.db.gz (à supprimer à la main une fois la base réparée)" >&2
      exit 1
    fi
    # Point de contrôle APRÈS la copie, UNE fois par nuit seulement : sans lui,
    # prod.db-wal grossit sans fin entre deux redémarrages du conteneur (les
    # points de contrôle automatiques replient les pages dans prod.db mais ne
    # tronquent jamais le fichier). TRUNCATE le remet à zéro octet ; il lui
    # faut un instant sans lecteur, sinon SQLite rend « busy » et ne bloque
    # pas la sauvegarde. Le refaire à chaque heure de pointe n apporterait
    # rien : les pages sont déjà repliées au fil de l eau, et l instant sans
    # lecteur est justement rare quand des tablées jouent.
    if [ "$MODE" = daily ]; then
      su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null || true
    fi
    mv /tmp/copie.db "$TARGET"
  '
gzip -f "$OUT"
# Relecture complète de l'archive : un disque plein ou un gzip interrompu
# laisse un .gz tronqué que `gzip -f` ne signale pas toujours. Un fichier qui
# ne se relit pas n'est pas une sauvegarde : le trap le supprime.
if ! gzip -t "${OUT}.gz"; then
  echo "ECHEC : ${OUT}.gz ne se décompresse pas (gzip -t)" >&2
  exit 1
fi
BACKUP_DONE=1

if [ "$MODE" = hourly ]; then
  # 48 h : deux soirées de recul à la maille de l'heure, le quotidien couvre le
  # reste. -mmin exact : ces copies passent onze fois par jour, pas de marge.
  find "$BACKUP_DIR" -name "prod-hourly-*.db.gz" -mmin +$((48 * 60)) -delete
else
  # 14 jours sur le serveur (politique de confidentialité §7). Pas -mtime +14 :
  # find arrondit l'âge au jour inférieur, la copie du jour J ne partait qu'au
  # passage de J+15, voire J+16. Seuil de 13 jours et 1 heure : le cron ne
  # passant qu'une fois par jour, la copie du jour J part au passage de J+14
  # (l'heure de marge absorbe l'écart de durée entre deux sauvegardes) ; un
  # instantané pris en cours de journée J (prod-deploy.sh) part au plus tard à
  # ce même passage. /!\ Ce cron de 03:00 est le SEUL à purger : prod-deploy.sh
  # prend son instantané lui-même et ne rejoue PAS ce script (il tourne sous
  # `ubuntu`, or ce fichier est en 750 root:root).
  # `! -name prod-hourly-*` : les copies horaires commencent aussi par prod-
  # mais ont leur propre purge (48 h, ci-dessus) ; cette règle ne les voit pas.
  find "$BACKUP_DIR" -name "prod-*.db.gz" ! -name "prod-hourly-*" -mmin +$((13 * 24 * 60 + 60)) -delete
fi
echo "[$(date -Is)] backup OK ($MODE): ${OUT}.gz"
# Ping de succès, quotidien seulement, et DERNIER ordre du script : s'il
# manque, c'est que quelque chose a cassé avant lui.
if [ "$MODE" = daily ]; then ping_url; fi
SCRIPT
sudo chmod 750 "$BACKUP_SCRIPT"
sudo chown root:root "$BACKUP_SCRIPT"

echo "===== 3b) VEILLE DISQUE + COPIE OFF-SITE (scripts du dépôt recopiés en root) ====="
# Recopie un script du dépôt sous /usr/local/bin, en root et sans CR : le
# dépôt est édité sous Windows, et prod-deploy.sh ne nettoie scripts/ qu'au
# déploiement — ce script peut être rejoué depuis une archive fraîche.
install_root_script() {
  sed 's/\r$//' "$1" | sudo tee "$2" >/dev/null
  sudo chmod 750 "$2"
  sudo chown root:root "$2"
  echo "$2 <- $1"
}
if [ -f "$SCRIPT_DIR/vps-disk-watch.sh" ]; then
  install_root_script "$SCRIPT_DIR/vps-disk-watch.sh" "$DISK_SCRIPT"
else
  echo "vps-disk-watch.sh introuvable dans $SCRIPT_DIR : veille disque NON installée"
fi
# La copie off-site n'est rafraîchie que si vps-setup-offsite-r2.sh l'a déjà
# installée (R2 configuré) : ici on ne configure rien, on met à jour.
if sudo test -f "$OFFSITE_SCRIPT" && [ -f "$SCRIPT_DIR/vps-backup-offsite.sh" ]; then
  install_root_script "$SCRIPT_DIR/vps-backup-offsite.sh" "$OFFSITE_SCRIPT"
else
  echo "copie off-site non installée (sudo bash scripts/vps-setup-offsite-r2.sh) : rien à rafraîchir"
fi

echo "===== 3c) CRONS ROOT (sauvegardes, veille disque) ====="
# Une seule ligne par script quel que soit le nombre de passages : on retire
# TOUTES les lignes qui citent le script (motif -F sur son chemin) avant de
# réécrire les nôtres. La ligne off-site (03:15, posée par
# vps-setup-offsite-r2.sh) cite un autre chemin et reste intacte.
CRON_DAILY="0 3 * * * $BACKUP_SCRIPT >> /var/log/le-pillaveur-backup.log 2>&1"
# 18 h → 04 h = le pic de jeu, le moment où une panne coûte le plus de parties.
# 03 h EXCLU : le quotidien passe à cette heure, et un lecteur horaire lancé au
# même instant ferait rendre « busy » à son point de contrôle TRUNCATE — la
# seule chose qui empêche prod.db-wal de grossir sans fin.
CRON_HOURLY="0 18-23,0-2,4 * * * $BACKUP_SCRIPT hourly >> /var/log/le-pillaveur-backup-hourly.log 2>&1"
# 07:00 : après la nuit de sauvegardes, avant la journée ; le journal dit ce
# que la nuit a coûté en disque, et l'opérateur le lit au réveil.
CRON_DISK="0 7 * * * $DISK_SCRIPT >> /var/log/le-pillaveur-disk.log 2>&1"
EXISTING=$(sudo crontab -l 2>/dev/null | grep -Fv "$BACKUP_SCRIPT" | grep -Fv "$DISK_SCRIPT" || true)
if sudo test -f "$DISK_SCRIPT"; then
  printf '%s\n%s\n%s\n%s\n' "$EXISTING" "$CRON_DAILY" "$CRON_HOURLY" "$CRON_DISK" | sudo crontab -
else
  printf '%s\n%s\n%s\n' "$EXISTING" "$CRON_DAILY" "$CRON_HOURLY" | sudo crontab -
fi
echo "Crons posés :"
sudo crontab -l | grep -F le-pillaveur

echo "===== 4) PREMIERE SAUVEGARDE ====="
sudo "$BACKUP_SCRIPT"
ls -lh "$BACKUP_DIR" | tail -5

echo "===== 5) SYSCTL RESEAU ====="
SYSCTL_DROPIN=/etc/sysctl.d/99-lepillaveur-hardening.conf
sudo tee "$SYSCTL_DROPIN" >/dev/null <<'SYSCTL'
# Durcissement reseau Le Pillaveur
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
SYSCTL
sudo sysctl --system >/dev/null 2>&1 || sudo sysctl -p "$SYSCTL_DROPIN"

echo "===== 6) MISES A JOUR SYSTEME ====="
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get autoremove -y -qq

echo "===== 7) VERIFICATION FINALE ====="
echo "--- .env ---"
stat -c '%a %U:%G %n' "$APP_DIR/.env" 2>/dev/null || echo "pas de .env"
echo "--- ports ---"
sudo ss -tulpn | grep LISTEN
echo "--- fail2ban ---"
sudo fail2ban-client status sshd 2>/dev/null | grep -E 'Currently banned|Total banned' || true
echo "--- backups ---"
ls -lh "$BACKUP_DIR" 2>/dev/null | tail -3
echo "--- crons root ---"
sudo crontab -l 2>/dev/null | grep -F le-pillaveur || echo "aucun cron le-pillaveur"
echo "--- alertes (fichiers de ping ; leur contenu est un secret, jamais affiché) ---"
for check in backup offsite disk; do
  if sudo test -s "/etc/le-pillaveur/$check-ping-url"; then
    echo "$check-ping-url : présent"
  else
    echo "$check-ping-url : ABSENT — personne n'est prévenu, voir docs/ops/ALERTES.md"
  fi
done
echo "===== DONE ====="
