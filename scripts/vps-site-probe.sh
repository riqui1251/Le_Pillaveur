#!/bin/bash
# Sonde du site Le Pillaveur, vue de l'extérieur. Recopiée en
# /usr/local/bin/le-pillaveur-site-probe.sh et planifiée toutes les 5 minutes
# par scripts/vps-secure-max.sh (journal : /var/log/le-pillaveur-probe.log).
# Rejouable à la main — seul effet de bord : le fichier d'état et le ping :
#   sudo /usr/local/bin/le-pillaveur-site-probe.sh
#
# Pourquoi : les tâches de la nuit préviennent quand ELLES échouent, mais rien
# ne prévenait quand le SITE tombe. Le HEALTHCHECK du Dockerfile ne regarde que
# 127.0.0.1:3000, depuis l'intérieur du conteneur : un certificat expiré, un
# Caddy arrêté ou une règle Cloudflare cassée laissent ce contrôle vert pendant
# que plus aucun joueur n'entre. On interroge donc l'URL PUBLIQUE, qui passe
# par Cloudflare puis Caddy — le chemin du joueur, c'est voulu.
#
# Qui alerte si le VPS lui-même est éteint ? Pas ce script, qui ne tourne plus :
# c'est healthchecks.io, qui ne reçoit plus de ping (check « site », période
# 5 min, grâce 10 min, docs/ops/ALERTES.md). Même « dead man's switch » que
# les sauvegardes.
set -euo pipefail

# Surchargeable pour un essai (PROBE_URL=https://lepillaveur.fr/api/nexistepas
# force un échec). /api/health touche la base et mesure le disque : un 200 avec
# "ok":true veut dire « la page d'accueil a ses données ».
PROBE_URL="${PROBE_URL:-https://lepillaveur.fr/api/health}"
# Même convention que les autres tâches (docs/ops/ALERTES.md) : URL posée à la
# main par l'opérateur, jamais dans le dépôt. Fichier absent : la sonde tourne
# et écrit son état, personne n'est prévenu. Surchargeable pour un essai local.
PING_URL_FILE="${PING_URL_FILE:-/etc/le-pillaveur/site-ping-url}"

# Fichier d'état lu par l'onglet « Surveillance » de la supervision (contrat :
# src/lib/ops-status-types.ts). Dossier monté en lecture seule dans le
# conteneur par prod-deploy.sh ; STATUS_DIR le déplace pour un essai local.
# write_status est RECOPIÉE à l'identique dans chaque script qui écrit un état
# (ils sont installés séparément sous /usr/local/bin) ; le test
# src/lib/shell-scripts.test.ts vérifie qu'aucune copie ne diverge.
# Écriture atomique (mktemp dans le même dossier puis mv) : le panneau ne lit
# jamais un fichier à moitié écrit. Le texte libre est réduit à de l'ASCII
# imprimable sans " ni \ (JSON valide sans échappement), 200 caractères au
# plus ; les métriques sont des entiers. Elle ne fait JAMAIS échouer la tâche :
# un état non écrit se voit dans le panneau (« en retard »), une sauvegarde
# ou une sonde avortée pour ça ne se verrait nulle part.
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
    || echo "[$(date -Is)] ping${suffix} impossible : l'alerte externe est aveugle pour ce passage"
}

# L'état PRÉCÉDENT est le fichier d'état lui-même : pas de second fichier à
# tenir. Il sert à deux choses :
#   - le journal : une ligne par échec et une au retour à la normale, rien
#     quand tout va bien (sinon 288 lignes par jour que personne ne lit) ;
#   - l'alerte : voir plus bas, le premier échec est retenu.
# `"ok":true` ne peut venir que du champ ok : write_status retire les " du
# texte libre.
STATUS_FILE="$STATUS_DIR/probe.json"
PREV=""
if [ -r "$STATUS_FILE" ]; then
  PREV=$(cat "$STATUS_FILE" 2>/dev/null || true)
fi
case "$PREV" in
  *'"ok":true'*) PREV_STATE=ok ;;
  *'"ok":false'*) PREV_STATE=failed ;;
  *) PREV_STATE=unknown ;;
esac
PREV_AT=$(printf '%s' "$PREV" | sed -n 's/.*"at":"\([^"]*\)".*/\1/p')
# Âge de ce dernier état, en secondes ; vide si la date est absente ou
# illisible. Sert à la retenue du premier échec (plus bas) : un « ok » qui
# n'est plus récent ne prouve plus que le site tournait il y a un instant.
PREV_AGE_SEC=""
if [ -n "$PREV_AT" ]; then
  PREV_EPOCH=$(date -d "$PREV_AT" +%s 2>/dev/null || true)
  case "$PREV_EPOCH" in
    ''|*[!0-9]*) ;;
    *) PREV_AGE_SEC=$(( $(date +%s) - PREV_EPOCH )) ;;
  esac
fi
# Deux périodes du cron : le passage précédent a eu lieu il y a ~5 min, et
# un tour sauté (VPS chargé) reste toléré.
RETAIN_MAX_AGE_SEC=600

BODY=$(mktemp)
ERR=$(mktemp)
trap 'rm -f "$BODY" "$ERR"' EXIT

# --max-time 15 : au-delà, un joueur a déjà abandonné la page. LC_ALL=C pour
# que time_total s'écrive avec un point quelle que soit la locale. Pas de -f :
# on veut le code HTTP et le corps d'une réponse 503, pas seulement l'échec.
# Pas de --retry non plus : un échec isolé est absorbé plus bas, à l'échelle
# de deux passages, pas de quelques secondes.
CURL_RC=0
CURL_OUT=$(LC_ALL=C curl -sS -o "$BODY" -w '%{http_code} %{time_total}' --max-time 15 \
  -A 'le-pillaveur-site-probe' "$PROBE_URL" 2>"$ERR") || CURL_RC=$?
HTTP_CODE="${CURL_OUT%% *}"
case "$HTTP_CODE" in ''|*[!0-9]*) HTTP_CODE=0 ;; esac
MS=$(LC_ALL=C awk -v t="${CURL_OUT##* }" 'BEGIN { printf "%d", t * 1000 + 0.5 }' 2>/dev/null || echo 0)

# Extrait du corps pour le détail, seulement s'il ressemble à du JSON : la
# réponse 503 de /api/health dit laquelle de la base ou du disque a lâché
# (aucune donnée personnelle dedans), alors qu'une page d'erreur HTML de
# Cloudflare ne serait que du bruit tronqué.
json_excerpt() {
  if [ "$(head -c 1 "$BODY" 2>/dev/null)" = "{" ]; then
    printf ' : %s' "$(head -c 150 "$BODY")"
  fi
}

if [ "$CURL_RC" -ne 0 ]; then
  STATUS_CODE=unreachable
  # Première ligne de l'erreur curl, sans son préfixe « curl: (NN) » : DNS,
  # connexion refusée, certificat, délai dépassé.
  DETAIL="curl $CURL_RC : $(head -n 1 "$ERR" | sed 's/^curl: ([0-9]*) //')"
elif [ "$HTTP_CODE" != 200 ]; then
  STATUS_CODE=http_error
  DETAIL="HTTP $HTTP_CODE$(json_excerpt)"
elif ! grep -q '"ok":true' "$BODY"; then
  # 200 sans le mot-clé : un proxy ou une page d'erreur servie en 200.
  STATUS_CODE=keyword_missing
  DETAIL="HTTP 200 sans ok:true$(json_excerpt)"
else
  STATUS_CODE=ok
  DETAIL="GET $PROBE_URL : HTTP 200"
fi

NOW="[$(date -Is)]"
if [ "$STATUS_CODE" = ok ]; then
  write_status probe true ok "$DETAIL" "httpCode=$HTTP_CODE" "ms=$MS"
  case "$PREV_STATE" in
    failed) echo "$NOW sonde OK : le site répond de nouveau (HTTP 200, ${MS} ms) ; échec précédent à ${PREV_AT:-?}" ;;
    unknown) echo "$NOW sonde OK : premier passage (HTTP 200, ${MS} ms)" ;;
  esac
  # Dernier ordre du script : s'il manque, quelque chose a cassé avant lui.
  ping_url
  exit 0
fi

write_status probe false "$STATUS_CODE" "$DETAIL" "httpCode=$HTTP_CODE" "ms=$MS"
# Le PREMIER échec après un passage réussi n'envoie pas /fail : un
# déploiement coupe le site ~30 s (plus s'il migre, prod-deploy.sh arrête alors
# le conteneur), et un passage sur dix tomberait dedans. On ne pinge rien du
# tout — ni succès ni échec — et c'est le passage suivant qui tranche : encore
# en échec, /fail part et l'alerte est immédiate (5 à 10 min après la chute) ;
# revenu, le ping de succès arrive avant la fin de la période de grâce. Même
# tolérance que l'ancienne consigne UptimeRobot (« alerte après 2 échecs
# consécutifs »). Premier passage connu (aucun état) : rien à absorber, /fail
# part tout de suite.
# La retenue exige un succès RÉCENT (moins de RETAIN_MAX_AGE_SEC) : l'état
# précédent est le fichier que cette sonde réécrit, et si l'écriture échoue
# (inodes épuisés, mktemp refusé) probe.json reste figé sur « ok ». Sans ce
# garde-fou, chaque échec passait alors pour le premier : /fail ne partait
# jamais, et seul le silence alertait, au bout de 15 min au lieu de 5 à 10.
# Date illisible ou dans le futur : même traitement qu'un état trop vieux.
if [ "$PREV_STATE" = ok ] && [ -n "$PREV_AGE_SEC" ] \
  && [ "$PREV_AGE_SEC" -ge 0 ] && [ "$PREV_AGE_SEC" -le "$RETAIN_MAX_AGE_SEC" ]; then
  echo "$NOW sonde ECHEC ($STATUS_CODE) : $DETAIL — premier échec, alerte retenue jusqu'au passage suivant"
elif [ "$PREV_STATE" = ok ]; then
  echo "$NOW sonde ECHEC ($STATUS_CODE) : $DETAIL — dernier succès connu trop ancien ou mal daté (${PREV_AT:-sans date}), alerte immédiate"
  ping_url /fail
else
  echo "$NOW sonde ECHEC ($STATUS_CODE) : $DETAIL"
  ping_url /fail
fi
exit 1
