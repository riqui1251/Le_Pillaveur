#!/bin/bash
# Configure les backups off-site vers Cloudflare R2.
#
# Prerequis Cloudflare (gratuit):
#   1. Compte Cloudflare + domaine lepillaveur.fr
#   2. R2 > Create bucket (ex: le-pillaveur-backups)
#   3. R2 > Manage R2 API Tokens > Create (Object Read & Write sur le bucket)
#
# Usage interactif:
#   sudo bash vps-setup-offsite-r2.sh
#
# Usage non interactif:
#   sudo CF_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
#        R2_BUCKET=le-pillaveur-backups bash vps-setup-offsite-r2.sh
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Lancer avec sudo."
  exit 1
fi

CONF_DIR="/etc/le-pillaveur"
ENV_FILE="$CONF_DIR/offsite.env"
RCLONE_CONF="$CONF_DIR/rclone.conf"
LOCAL_BACKUP="/usr/local/bin/le-pillaveur-db-backup.sh"
OFFSITE_BACKUP="/usr/local/bin/le-pillaveur-db-backup-offsite.sh"

mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"

read_var() {
  local name="$1" prompt="$2" default="${3:-}"
  local val
  if [ -n "${!name:-}" ]; then
    val="${!name}"
  else
    if [ -n "$default" ]; then
      read -r -p "$prompt [$default]: " val
      val="${val:-$default}"
    else
      read -r -p "$prompt: " val
    fi
  fi
  printf -v "$name" '%s' "$val"
}

echo "=== Configuration backup Cloudflare R2 ==="
read_var CF_ACCOUNT_ID "Cloudflare Account ID"
read_var R2_ACCESS_KEY_ID "R2 Access Key ID"
read_var R2_SECRET_ACCESS_KEY "R2 Secret Access Key" 
read_var R2_BUCKET "Nom du bucket R2" "lepillaveur"

RCLONE_REMOTE="r2-lepillaveur"

tee "$RCLONE_CONF" >/dev/null <<EOF
[r2-lepillaveur]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
EOF
chmod 600 "$RCLONE_CONF"

tee "$ENV_FILE" >/dev/null <<EOF
RCLONE_REMOTE=${RCLONE_REMOTE}
R2_BUCKET=${R2_BUCKET}
OFFSITE_RETENTION_DAYS=30
EOF
chmod 600 "$ENV_FILE"

echo "=== Installation rclone ==="
if ! command -v rclone >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq rclone
fi

echo "=== Test connexion R2 ==="
rclone lsd "${RCLONE_REMOTE}:" --config "$RCLONE_CONF" --s3-no-check-bucket

echo "=== Installation scripts backup off-site ==="
install -m 750 /opt/le-pillaveur/scripts/vps-backup-offsite.sh "$OFFSITE_BACKUP" 2>/dev/null || \
  install -m 750 "$(dirname "$0")/vps-backup-offsite.sh" "$OFFSITE_BACKUP"

CRON_LOCAL="0 3 * * * $LOCAL_BACKUP >> /var/log/le-pillaveur-backup.log 2>&1"
CRON_OFFSITE="15 3 * * * $OFFSITE_BACKUP >> /var/log/le-pillaveur-backup-offsite.log 2>&1"
EXISTING=$(crontab -l 2>/dev/null | grep -Fv "$OFFSITE_BACKUP" | grep -Fv "le-pillaveur-db-backup-offsite" || true)
printf '%s\n%s\n%s\n' "$EXISTING" "$CRON_LOCAL" "$CRON_OFFSITE" | crontab -

echo "=== Test upload (dernier backup local) ==="
bash "$OFFSITE_BACKUP"

echo ""
echo "OK — backups off-site actifs vers R2://${R2_BUCKET}/"
echo "Logs: /var/log/le-pillaveur-backup-offsite.log"
