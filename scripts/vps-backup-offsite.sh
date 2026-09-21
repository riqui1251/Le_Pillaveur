#!/bin/bash
# Sauvegarde off-site des backups DB (Cloudflare R2 via rclone).
# Configure d'abord: sudo bash vps-setup-offsite-r2.sh
set -euo pipefail

ENV_FILE="/etc/le-pillaveur/offsite.env"
BACKUP_DIR="/opt/le-pillaveur-backups"
RCLONE_CONF="/etc/le-pillaveur/rclone.conf"
LOG="/var/log/le-pillaveur-backup-offsite.log"

if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date -Is)] offsite skip: $ENV_FILE absent" >> "$LOG"
  exit 0
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

if [ -z "${RCLONE_REMOTE:-}" ] || [ ! -f "$RCLONE_CONF" ]; then
  echo "[$(date -Is)] offsite skip: R2 non configure" >> "$LOG"
  exit 0
fi

LATEST=$(ls -t "$BACKUP_DIR"/prod-*.db.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "[$(date -Is)] offsite skip: aucun backup local" >> "$LOG"
  exit 0
fi

# Refus si la derniere copie locale est FIGEE. Sans ce garde-fou, une
# sauvegarde nocturne en panne (cron casse, `.backup` en echec) restait
# invisible : `ls -t` rendait toujours le meme fichier, rclone le re-televersait
# a l'identique et le journal affichait « offsite OK » chaque nuit. Le tableau
# de bord restait vert pendant que plus rien n'etait sauvegarde.
# 26 h : le cron passe toutes les 24 h, deux heures absorbent un decalage
# (changement d'heure, VPS occupe) sans masquer une nuit manquee.
MAX_AGE_MIN=$((26 * 60))
if [ -n "$(find "$LATEST" -mmin +"$MAX_AGE_MIN" -print -quit 2>/dev/null)" ]; then
  echo "[$(date -Is)] offsite ECHEC: derniere sauvegarde locale trop ancienne (>26 h): $(basename "$LATEST")" >> "$LOG"
  echo "[$(date -Is)] offsite ECHEC: verifier le cron de 03:00 et /var/log/le-pillaveur-backup.log" >> "$LOG"
  exit 1
fi

RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"

rclone copy "$LATEST" "${RCLONE_REMOTE}:${R2_BUCKET}/" \
  --config "$RCLONE_CONF" \
  --s3-no-check-bucket \
  --log-file "$LOG" \
  --log-level INFO

rclone delete "${RCLONE_REMOTE}:${R2_BUCKET}/" \
  --config "$RCLONE_CONF" \
  --min-age "${RETENTION_DAYS}d" \
  --include "prod-*.db.gz" \
  --log-file "$LOG" \
  --log-level INFO

echo "[$(date -Is)] offsite OK: $(basename "$LATEST")" >> "$LOG"
