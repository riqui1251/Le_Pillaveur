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

# Fichier d'état disk.json, lu par l'onglet « Surveillance » de la supervision
# (contrat : src/lib/ops-status-types.ts ; dossier monté en lecture seule dans
# le conteneur par prod-deploy.sh). STATUS_DIR le déplace pour un essai local.
# Le ping dit « ça a marché / pas marché » à healthchecks.io ; ce fichier dit
# QUOI (pourcentage, seuil) aux fondateurs, sans ouvrir de session ssh.
# write_status est la copie CONFORME de celle de scripts/vps-site-probe.sh (où
# ses règles sont commentées) : chaque script est installé seul sous
# /usr/local/bin, et src/lib/shell-scripts.test.ts vérifie qu'aucune copie ne
# diverge. Écriture atomique, JSON valide, ne fait jamais échouer le script.
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
    # Pas de usedPct : la mesure a justement échoué ; write_status écarte de
    # toute façon une valeur non entière.
    write_status disk false df_failed "df -P / illisible (rendu : ${USED_PCT:-vide})" "thresholdPct=$THRESHOLD_PCT"
    ping_url /fail
    exit 1 ;;
esac

# `docker system df` : la ligne « Build Cache » est celle qui enfle (467
# entrées, 55 Go récupérables le 21/09/2026) — des couches intermédiaires
# sans valeur, que prod-deploy.sh purge. Tolérant : le démon peut être arrêté,
# on veut quand même la mesure du disque.
DOCKER_DF=$(docker system df 2>/dev/null || echo "docker system df indisponible")
BUILD_CACHE=$(printf '%s\n' "$DOCKER_DF" | awk '/^Build Cache/ { print "cache de build docker récupérable : " $(NF-1) " " $NF }')
# Même ligne, en ASCII pour le fichier d'état : seule la colonne RECLAIMABLE
# ($6 : « Build Cache » compte pour deux champs), la seule qui dise quoi faire.
CACHE_RECLAIM=$(printf '%s\n' "$DOCKER_DF" | awk '/^Build Cache/ { print $6 }')
STATE_DETAIL="/ occupe a ${USED_PCT} % (seuil ${THRESHOLD_PCT} %), cache de build docker recuperable : ${CACHE_RECLAIM:-inconnu}"

if [ "$USED_PCT" -ge "$THRESHOLD_PCT" ]; then
  echo "$NOW disk ALERTE : / occupé à ${USED_PCT} % (seuil ${THRESHOLD_PCT} %) — ${BUILD_CACHE:-docker injoignable}"
  printf '%s\n' "$DOCKER_DF" | sed 's/^/    /'
  echo "$NOW disk ALERTE : que faire -> docs/ops/ALERTES.md (section « disque »)"
  write_status disk false over_threshold "$STATE_DETAIL" "usedPct=$USED_PCT" "thresholdPct=$THRESHOLD_PCT"
  ping_url /fail
  exit 1
fi
echo "$NOW disk OK : / occupé à ${USED_PCT} % (seuil ${THRESHOLD_PCT} %) — ${BUILD_CACHE:-docker injoignable}"
write_status disk true ok "$STATE_DETAIL" "usedPct=$USED_PCT" "thresholdPct=$THRESHOLD_PCT"
ping_url
