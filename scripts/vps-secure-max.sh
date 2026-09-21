#!/bin/bash
# Durcissement VPS Le Pillaveur — permissions, sauvegardes DB, sysctl, mises à jour.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
BACKUP_SCRIPT="/usr/local/bin/le-pillaveur-db-backup.sh"
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

echo "===== 3) SAUVEGARDE DB QUOTIDIENNE ====="
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
chown ubuntu:ubuntu "$BACKUP_DIR"

sudo tee "$BACKUP_SCRIPT" >/dev/null <<'SCRIPT'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/le-pillaveur-backups"
DB_VOLUME="le-pillaveur-db"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : l'ouvrir crée prod.db-wal et prod.db-shm. Sauvegarder en root laisserait
# ces fichiers à root et casserait l'application au redémarrage suivant.
DB_UID="${DB_UID:-1001}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/prod-${STAMP}.db"
# Volume monté en lecture-ÉCRITURE (et non plus `:ro`) : en WAL, SQLite doit
# pouvoir créer le fichier de mémoire partagée -shm pour seulement LIRE la
# base ; monté `:ro`, la sauvegarde échouerait dès qu'il manque.
# `.backup` reste la commande : elle prend une copie cohérente même pendant que
# l'application écrit, ce qu'un `cp` ne garantit pas en WAL.
docker run --rm \
  -v "$DB_VOLUME:/data" \
  -v "$BACKUP_DIR:/backup" \
  alpine sh -c "
    set -e
    # apk exige root : on installe, puis on redescend en $DB_UID.
    apk add --no-cache sqlite su-exec >/dev/null
    # La copie passe par /tmp : $BACKUP_DIR est en 700 côté hôte, l'UID $DB_UID
    # ne peut y écrire ni le fichier ni le journal que sqlite3 crée à côté de la
    # destination pendant le .backup.
    su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \".backup /tmp/prod-${STAMP}.db\"
    # Point de contrôle APRÈS la copie : sans lui, prod.db-wal grossit sans fin
    # entre deux redémarrages du conteneur (les points de contrôle automatiques
    # ne le tronquent pas). TRUNCATE le remet à zéro octet ; s'il est occupé par
    # un lecteur, SQLite rend « busy » et ne bloque pas la sauvegarde.
    su-exec $DB_UID:$DB_UID sqlite3 /data/prod.db \"PRAGMA wal_checkpoint(TRUNCATE);\" >/dev/null || true
    mv /tmp/prod-${STAMP}.db /backup/prod-${STAMP}.db
  "
gzip -f "$OUT"
# 14 jours sur le serveur (politique de confidentialité §7). Pas -mtime +14 :
# find arrondit l'âge au jour inférieur, la copie du jour J ne partait qu'au
# passage de J+15, voire J+16. Seuil de 13 jours et 1 heure : le cron ne
# passant qu'une fois par jour, la copie du jour J part au passage de J+14
# (l'heure de marge absorbe l'écart de durée entre deux sauvegardes) ; un
# instantané pris en cours de journée J (prod-deploy.sh) part au plus tard à
# ce même passage. /!\ Ce cron de 03:00 est le SEUL à purger : prod-deploy.sh
# prend son instantané lui-même et ne rejoue PAS ce script (il tourne sous
# `ubuntu`, or ce fichier est en 750 root:root).
find "$BACKUP_DIR" -name "prod-*.db.gz" -mmin +$((13 * 24 * 60 + 60)) -delete
echo "[$(date -Is)] backup OK: ${OUT}.gz"
SCRIPT
sudo chmod 750 "$BACKUP_SCRIPT"
sudo chown root:root "$BACKUP_SCRIPT"

CRON_LINE="0 3 * * * $BACKUP_SCRIPT >> /var/log/le-pillaveur-backup.log 2>&1"
EXISTING=$(sudo crontab -l 2>/dev/null | grep -Fv "$BACKUP_SCRIPT" || true)
printf '%s\n%s\n' "$EXISTING" "$CRON_LINE" | sudo crontab -
echo "Cron backup: $CRON_LINE"

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
echo "===== DONE ====="
