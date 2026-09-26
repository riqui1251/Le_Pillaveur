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

# Fichier d'etat offsite.json, lu par l'onglet « Surveillance » de la
# supervision (contrat : src/lib/ops-status-types.ts ; dossier monte en lecture
# seule dans le conteneur par prod-deploy.sh). STATUS_DIR le deplace pour un
# essai local. Contrairement au ping, les deux « skip » de configuration Y
# laissent une trace (ok = null, not_configured) : le panneau distingue ainsi
# « pas de copie off-site parce que R2 n'est pas branche » de « la tache ne
# tourne plus ».
# write_status est la copie CONFORME de celle de scripts/vps-site-probe.sh (ou
# ses regles sont commentees) : chaque script est installe seul sous
# /usr/local/bin, et src/lib/shell-scripts.test.ts verifie qu'aucune copie ne
# diverge. Ecriture atomique, JSON valide, ne fait jamais echouer le script.
STATUS_DIR="${STATUS_DIR:-/var/lib/le-pillaveur-status}"

# write_status <job> <true|false|null> <code> <detail> [cle=entier ...]
write_status() {
  (
    job="$1" ok="$2" code="$3" detail="${4:-}"
    shift 4 || shift "$#"
    case "$ok" in true|false|null) ;; *) ok=null ;; esac
    detail=$(printf '%s' "$detail" | LC_ALL=C tr -d '"\\' | LC_ALL=C tr -c '[:print:]' ' ')
    detail="${detail:0:200}"
    metrics=""
    for pair in "$@"; do
      key="${pair%%=*}" val="${pair#*=}"
      case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
      case "$val" in ''|*[!0-9]*) continue ;; esac
      metrics="${metrics:+$metrics,}\"$key\":$((10#$val))"
    done
    [ -d "$STATUS_DIR" ] || mkdir -p -m 755 "$STATUS_DIR" || exit 1
    tmp=$(mktemp "$STATUS_DIR/.$job.json.XXXXXX") || exit 1
    if printf '{"v":1,"job":"%s","ok":%s,"code":"%s","at":"%s","detail":"%s","metrics":{%s}}\n' \
        "$job" "$ok" "$code" "$(date -Is)" "$detail" "$metrics" >"$tmp" \
      && chmod 644 "$tmp" && mv -f "$tmp" "$STATUS_DIR/$job.json"; then
      exit 0
    fi
    rm -f "$tmp"
    exit 1
  ) 2>/dev/null || echo "[$(date -Is)] etat $1 non ecrit dans $STATUS_DIR : l'onglet Surveillance le verra en retard" >&2 || true
  return 0
}

# Cause de l'echec pour le fichier d'etat, posee juste avant chaque sortie en
# erreur ; `failed` (+ code de sortie) couvre tout le reste (rclone, set -e).
# Le detail ne porte JAMAIS de chemin de l'hote ($ENV_FILE, $RCLONE_CONF,
# $BACKUP_DIR, $LOG) : il traverse l'API jusqu'a l'ecran, qui promet des codes,
# des nombres et des noms de fichiers — et l'emplacement du fichier qui porte
# les cles R2 n'a rien a y faire. Les chemins restent dans le journal, que
# docs/ops/ALERTES.md designe deja pour chaque tache.
STATUS_CODE=failed
STATUS_DETAIL=""

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
    write_status offsite false "$STATUS_CODE" "${STATUS_DETAIL:-code de sortie $status, voir le journal de la tache}" "exitCode=$status"
    ping_url /fail
  fi
}
trap on_exit EXIT

if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date -Is)] offsite skip: $ENV_FILE absent" >> "$LOG"
  write_status offsite null not_configured "offsite.env absent (scripts/vps-setup-offsite-r2.sh)"
  exit 0
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

if [ -z "${RCLONE_REMOTE:-}" ] || [ ! -f "$RCLONE_CONF" ]; then
  echo "[$(date -Is)] offsite skip: R2 non configure" >> "$LOG"
  write_status offsite null not_configured "R2 non configure (RCLONE_REMOTE ou rclone.conf manquant)"
  exit 0
fi

# Derniere copie QUOTIDIENNE (ou pre-deploiement) : les copies horaires
# (prod-hourly-*, gardees 48 h, memes script et dossier en mode `hourly`) sont
# EXCLUES. Sinon, une nuit ou le quotidien de 03:00 echoue serait masquee par
# la copie de 02:00, fraiche et valide, et le garde-fou d'age ci-dessous ne
# verrait plus jamais rien. `awk NR == 1` plutot que `head` : head ferme le
# tube des la premiere ligne, et sous pipefail un sort interrompu ferait
# echouer l'affectation.
# `|| true` sur find, pour la meme raison : dossier absent (VPS ou
# vps-secure-max.sh n'a pas encore tourne) ou illisible, find sort en 1, et
# sous pipefail + set -e l'affectation tuait le script AVANT le test
# ci-dessous — le fichier d'etat disait `failed` au lieu de `no_local_backup`,
# et le journal n'avait pas sa ligne. Aucun fichier trouve est la seule
# lecture honnete de ce cas.
LATEST=$( { find "$BACKUP_DIR" -maxdepth 1 -name 'prod-*.db.gz' ! -name 'prod-hourly-*' -printf '%T@ %p\n' 2>/dev/null || true; } \
  | sort -rn | awk 'NR == 1 { print $2 }')
if [ -z "$LATEST" ]; then
  echo "[$(date -Is)] offsite ECHEC: aucun backup local quotidien dans $BACKUP_DIR" >> "$LOG"
  STATUS_CODE=no_local_backup
  STATUS_DETAIL="aucune copie prod-*.db.gz quotidienne sur le serveur"
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
  STATUS_CODE=stale_local_backup
  STATUS_DETAIL="$(basename "$LATEST") a plus de 26 h : la sauvegarde de 03:00 a manque"
  exit 1
fi

# On n'envoie jamais un fichier qu'on n'a pas relu. La sauvegarde locale et
# l'instantane de prod-deploy.sh verifient deja leur .gz (integrity_check sur
# la copie, puis gzip -t), mais entre les deux crons un disque plein peut
# encore tronquer le fichier : mieux vaut garder la copie R2 de la veille
# qu'ecraser R2 avec un fichier illisible.
if ! gzip -t "$LATEST" 2>>"$LOG"; then
  echo "[$(date -Is)] offsite ECHEC: $(basename "$LATEST") ne se decompresse pas (gzip -t), rien envoye" >> "$LOG"
  STATUS_CODE=gzip_failed
  STATUS_DETAIL="$(basename "$LATEST") ne se decompresse pas (gzip -t), rien envoye"
  exit 1
fi

RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"

# Les deux rclone echouent par set -e : le detail dit lequel, le journal
# (--log-file) dit pourquoi.
STATUS_DETAIL="envoi rclone de $(basename "$LATEST") vers R2 en echec, voir le journal de la tache"
rclone copy "$LATEST" "${RCLONE_REMOTE}:${R2_BUCKET}/" \
  --config "$RCLONE_CONF" \
  --s3-no-check-bucket \
  --log-file "$LOG" \
  --log-level INFO

STATUS_DETAIL="copie envoyee, mais purge R2 (rclone delete) en echec, voir le journal de la tache"
rclone delete "${RCLONE_REMOTE}:${R2_BUCKET}/" \
  --config "$RCLONE_CONF" \
  --min-age "${RETENTION_DAYS}d" \
  --include "prod-*.db.gz" \
  --log-file "$LOG" \
  --log-level INFO

echo "[$(date -Is)] offsite OK: $(basename "$LATEST")" >> "$LOG"
write_status offsite true ok "$(basename "$LATEST")"
# Dernier ordre du script : s'il manque, quelque chose a casse avant lui.
ping_url
