#!/bin/bash
# Durcissement VPS Le Pillaveur — permissions, sauvegardes DB, sysctl, mises à jour.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/le-pillaveur}"
BACKUP_DIR="${BACKUP_DIR:-/opt/le-pillaveur-backups}"
BACKUP_SCRIPT="/usr/local/bin/le-pillaveur-db-backup.sh"
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"

echo "===== 1) PERMISSIONS SECRETS ====="
if [ -f "$APP_DIR/.env" ]; then
  chmod 600 "$APP_DIR/.env"
  chown ubuntu:ubuntu "$APP_DIR/.env"
  echo ".env -> $(stat -c '%a %U:%G' "$APP_DIR/.env")"
fi

echo "===== 2) VOLUME DB (prod uniquement, permissions restreintes) ====="
docker run --rm -v "$DB_VOLUME:/data" alpine sh -c '
  apk add --no-cache sqlite >/dev/null 2>&1 || true
  rm -f /data/dev.db /data/dev.db-journal
  if [ -f /data/prod.db-journal ]; then
    sqlite3 /data/prod.db "PRAGMA journal_mode=DELETE;" 2>/dev/null || true
    rm -f /data/prod.db-journal
  fi
  chown -R 1001:1001 /data
  chmod 750 /data
  chmod 640 /data/prod.db 2>/dev/null || true
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
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/prod-${STAMP}.db"
docker run --rm \
  -v "$DB_VOLUME:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/prod.db \".backup /backup/prod-${STAMP}.db\""
gzip -f "$OUT"
find "$BACKUP_DIR" -name "prod-*.db.gz" -mtime +14 -delete
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
