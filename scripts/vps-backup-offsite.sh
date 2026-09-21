#!/bin/bash
# Sauvegarde off-site des backups DB (Cloudflare R2 via rclone).
# Configure d'abord: sudo bash vps-setup-offsite-r2.sh
# Ce fichier est COPIE en /usr/local/bin/le-pillaveur-db-backup-offsite.sh par
# vps-setup-offsite-r2.sh (cron root 03:15) ; rejouer vps-secure-max.sh
# rafraichit la copie apres une modification ici.
set -euo pipefail

ENV_FILE="/etc/le-pillaveur/offsite.env"
BACKUP_DIR="/opt/le-pillaveur-backups"
RCLONE_CONF="/etc/le-pillaveur/rclone.conf"
LOG="/var/log/le-pillaveur-backup-offsite.log"
# Meme convention que la sauvegarde locale (vps-secure-max.sh) et la veille
# disque, detaillee dans docs/ops/ALERTES.md : URL de ping posee par
# l'operateur, jamais dans le depot. Appelee a la FIN d'un envoi reussi ;
# <url>/fail sur echec franc (healthchecks.io seulement, cf. ping_url).
# Les « skip » de configuration ci-dessous n'appellent rien : si l'operateur a
# pose une URL, c'est qu'il attend une copie — le silence alertera, a raison.
PING_URL_FILE="/etc/le-pillaveur/offsite-ping-url"

PING_URL=""
if [ -r "$PING_URL_FILE" ]; then
  PING_URL=$(head -n 1 "$PING_URL_FILE" | tr -d '[:space:]')
fi

# ping_url [/fail] — silencieux et jamais bloquant : l'URL contient un secret,
# elle n'apparait ni dans le journal ni dans un message de curl. <url>/fail
# est la convention healthchecks.io (hc-ping.com heberge, …/ping/<uuid>
# auto-heberge) ; pour un autre service on n'invente pas de route.
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
    || echo "[$(date -Is)] ping${suffix} impossible : l'alerte externe est aveugle pour ce passage" >> "$LOG"
}

# Tout echec passe ici (set -e : rclone, gzip -t, exit 1 explicites) : une
# ligne dans le journal, et le service d'alerte prevenu sans attendre la
# periode de grace.
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "[$(date -Is)] offsite ECHEC (code $status) : rien n'a ete envoye ce soir" >> "$LOG"
    ping_url /fail
  fi
}
trap on_exit EXIT

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

# Derniere copie QUOTIDIENNE (ou pre-deploiement) : les copies horaires
# (prod-hourly-*, gardees 48 h, memes script et dossier en mode `hourly`) sont
# EXCLUES. Sinon, une nuit ou le quotidien de 03:00 echoue serait masquee par
# la copie de 02:00, fraiche et valide, et le garde-fou d'age ci-dessous ne
# verrait plus jamais rien. `awk NR == 1` plutot que `head` : head ferme le
# tube des la premiere ligne, et sous pipefail un sort interrompu ferait
# echouer l'affectation.
LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name 'prod-*.db.gz' ! -name 'prod-hourly-*' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | awk 'NR == 1 { print $2 }')
if [ -z "$LATEST" ]; then
  echo "[$(date -Is)] offsite ECHEC: aucun backup local quotidien dans $BACKUP_DIR" >> "$LOG"
  exit 1
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

# On n'envoie jamais un fichier qu'on n'a pas relu. La sauvegarde locale et
# l'instantane de prod-deploy.sh verifient deja leur .gz (integrity_check sur
# la copie, puis gzip -t), mais entre les deux crons un disque plein peut
# encore tronquer le fichier : mieux vaut garder la copie R2 de la veille
# qu'ecraser R2 avec un fichier illisible.
if ! gzip -t "$LATEST" 2>>"$LOG"; then
  echo "[$(date -Is)] offsite ECHEC: $(basename "$LATEST") ne se decompresse pas (gzip -t), rien envoye" >> "$LOG"
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
# Dernier ordre du script : s'il manque, quelque chose a casse avant lui.
ping_url
