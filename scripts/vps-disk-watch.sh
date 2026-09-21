#!/bin/bash
# Veille disque du VPS Le Pillaveur. Recopié en /usr/local/bin/le-pillaveur-disk-watch.sh
# et planifié à 07:00 par scripts/vps-secure-max.sh (journal :
# /var/log/le-pillaveur-disk.log). Rejouable à la main, sans effet de bord :
#   sudo /usr/local/bin/le-pillaveur-disk-watch.sh
#
# Pourquoi : le 21/09/2026 le disque était à 79 % — dont ~55 Go de cache de
# build docker — et rien ne le mesurait. Un disque plein casse d'abord la
# sauvegarde (gzip tronqué), puis SQLite (écritures refusées), avant que la
# sonde de santé ne voie quoi que ce soit. Ici on mesure, on trace, on alerte.
# Ce script ne PURGE RIEN : c'est prod-deploy.sh qui nettoie le cache de build
# à chaque déploiement, et une purge automatique à 07:00 pourrait retirer une
# image (`le-pillaveur:previous`) dont un retour arrière a encore besoin.
set -euo pipefail

# Seuil d'alerte sur l'occupation de / (df). 80 % : il reste alors ~15 Go sur
# le disque de 77 Go, de quoi déployer (l'image builder pèse 2,4 Go et le build
# en crée une copie) et tenir les sauvegardes de la nuit. Réglable par
# l'environnement pour un essai à la main (DISK_ALERT_PCT=1 force l'alerte).
THRESHOLD_PCT="${DISK_ALERT_PCT:-80}"
# Même convention que la sauvegarde (vps-secure-max.sh, docs/ops/ALERTES.md) :
# une URL de ping posée par l'opérateur, jamais dans le dépôt. Sous le seuil
# on appelle <url> ; au-dessus, <url>/fail, et le service prévient tout de
# suite. Le check reste aussi un « dead man's switch » : sans passage à 07:00
# (cron cassé, VPS éteint), le silence alerte.
PING_URL_FILE="/etc/le-pillaveur/disk-ping-url"
NOW="[$(date -Is)]"

PING_URL=""
if [ -r "$PING_URL_FILE" ]; then
  PING_URL=$(head -n 1 "$PING_URL_FILE" | tr -d '[:space:]')
fi

# ping_url [/fail] — silencieux et jamais bloquant ; l'URL contient un secret
# et n'apparaît ni dans le journal ni dans un message de curl. <url>/fail est
# la convention healthchecks.io (hc-ping.com hébergé, …/ping/<uuid> auto-
# hébergé) ; pour un autre service on n'invente pas de route.
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
    || echo "$NOW ping${suffix} impossible : l'alerte externe est aveugle pour ce passage"
}

# `df -P` : format POSIX, une seule ligne par montage quelle que soit la
# longueur du nom de périphérique ; la 5e colonne est l'occupation en %.
USED_PCT=$(df -P / 2>/dev/null | awk 'NR == 2 { sub("%", "", $5); print $5 }') || USED_PCT=""
case "$USED_PCT" in
  ''|*[!0-9]*)
    echo "$NOW disk ECHEC : impossible de lire df -P / (rendu : « ${USED_PCT:-vide} »)"
    ping_url /fail
    exit 1 ;;
esac

# `docker system df` : la ligne « Build Cache » est celle qui enfle (467
# entrées, 55 Go récupérables le 21/09/2026) — des couches intermédiaires
# sans valeur, que prod-deploy.sh purge. Tolérant : le démon peut être arrêté,
# on veut quand même la mesure du disque.
DOCKER_DF=$(docker system df 2>/dev/null || echo "docker system df indisponible")
BUILD_CACHE=$(printf '%s\n' "$DOCKER_DF" | awk '/^Build Cache/ { print "cache de build docker récupérable : " $(NF-1) " " $NF }')

if [ "$USED_PCT" -ge "$THRESHOLD_PCT" ]; then
  echo "$NOW disk ALERTE : / occupé à ${USED_PCT} % (seuil ${THRESHOLD_PCT} %) — ${BUILD_CACHE:-docker injoignable}"
  printf '%s\n' "$DOCKER_DF" | sed 's/^/    /'
  echo "$NOW disk ALERTE : que faire -> docs/ops/ALERTES.md (section « disque »)"
  ping_url /fail
  exit 1
fi
echo "$NOW disk OK : / occupé à ${USED_PCT} % (seuil ${THRESHOLD_PCT} %) — ${BUILD_CACHE:-docker injoignable}"
ping_url
