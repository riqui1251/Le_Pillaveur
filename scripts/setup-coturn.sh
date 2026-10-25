#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Installation du relais TURN (coturn) pour le vocal WebRTC — Le Pillaveur.
#
# À exécuter UNE FOIS sur le VPS (Ubuntu), en root/sudo :
#   sudo bash setup-coturn.sh <domaine-ou-ip-publique>
#
# Puis ajouter dans l'environnement de l'app Next.js (ex. .env de prod) :
#   TURN_HOST=<domaine-ou-ip-publique>
#   TURN_SECRET=<le secret affiché à la fin de ce script>
#
# Ports à ouvrir dans le pare-feu (UFW/OVH) :
#   3478/udp et 3478/tcp   (signalisation TURN)
#   49152-50175/udp        (plage de relais média — voir le calcul plus bas)
#
# Rejouable : un secret déjà en place dans /etc/turnserver.conf est conservé
# (le changer imposerait de mettre à jour TURN_SECRET côté app et de
# redéployer ; pour en tirer un neuf, retirer la ligne static-auth-secret
# avant de rejouer). Les IP publiques du VPS sont détectées ; à forcer au besoin :
#   sudo PUBLIC_IPV4=203.0.113.7 PUBLIC_IPV6=2001:db8::7 bash setup-coturn.sh <hôte>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${1:?Usage: setup-coturn.sh <domaine-ou-ip-publique>}"

SECRET=""
if [ -f /etc/turnserver.conf ]; then
  SECRET="$(sed -n 's/^static-auth-secret=//p' /etc/turnserver.conf | head -n 1 || true)"
fi
SECRET_KEPT="${SECRET:+1}"
SECRET="${SECRET:-$(openssl rand -hex 32)}"

# Adresse source vers Internet ($1 = -4 ou -6, $2 = destination publique) :
# sur un VPS sans NAT, c'est son adresse publique.
detect_src() {
  ip "$1" route get "$2" 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true
}
PUBLIC_IPV4="${PUBLIC_IPV4:-$(detect_src -4 1.1.1.1)}"
PUBLIC_IPV6="${PUBLIC_IPV6:-$(detect_src -6 2606:4700:4700::1111)}"

# Ligne denied-peer-ip pour une IP du VPS ($1 = adresse, $2 = motif, $3 =
# famille). coturn refuse de démarrer sur une valeur invalide : sans adresse
# valable, la ligne est écrite en commentaire, à compléter à la main.
self_deny_line() {
  if [[ -n "$1" && "$1" =~ $2 ]]; then
    echo "denied-peer-ip=$1"
  else
    echo "# denied-peer-ip=<${3} publique du VPS>   (absente ou introuvable : à renseigner, puis systemctl restart coturn)"
  fi
}
SELF_DENY_V4="$(self_deny_line "$PUBLIC_IPV4" '^([0-9]{1,3}\.){3}[0-9]{1,3}$' IPv4)"
SELF_DENY_V6="$(self_deny_line "$PUBLIC_IPV6" '^[0-9A-Fa-f]*:[0-9A-Fa-f:]+$' IPv6)"

apt-get update -y
apt-get install -y coturn

cat > /etc/turnserver.conf <<EOF
# Coturn — relais TURN pour le vocal Le Pillaveur (identifiants éphémères)
listening-port=3478
realm=${HOST}
server-name=${HOST}

# Identifiants éphémères (format REST API) — synchronisé avec TURN_SECRET côté app
use-auth-secret
static-auth-secret=${SECRET}

# ── Dimensionnement de la plage de relais ───────────────────────────────────
# Le vocal est en MAILLAGE COMPLET : chaque joueur ouvre une connexion par
# pair, et chacune de ces connexions gathering une candidate « relay » réclame
# SA propre allocation TURN, donc un port UDP (le média WebRTC est en
# rtcp-mux : un seul port par allocation, pas deux).
#
#   allocations pour une table de N joueurs tous relayés = N × (N − 1)
#     6 joueurs  →  30 ports
#     8 joueurs  →  56 ports
#    12 joueurs  → 132 ports
#
# L'ancienne plage 49160-49200 n'offrait que 41 ports pour TOUT le serveur :
# une seule table calait dès 6-7 joueurs relayés (42 ports demandés), et le
# vocal tombait en silence sans aucune erreur côté navigateur.
#
# Budget retenu : 12 joueurs (plus haut maillage vocal tenable) × 6 tables
# simultanées en vocal ≈ 792 allocations → 1024 ports, arrondi sur la
# frontière des ports dynamiques.
#
# Bande passante à surveiller côté VPS : le relais recopie chaque flux
# (entrée + sortie), soit ~80 kbit/s par allocation pour de l'Opus. 792
# allocations ≈ 65 Mbit/s en pointe — c'est CETTE limite, et non les ports,
# qui bornera la croissance suivante.
min-port=49152
max-port=50175

# ── Durcissement ────────────────────────────────────────────────────────────
# Interdire tout relais vers l'intérieur de la machine ou des réseaux privés :
# sans ces règles, un utilisateur authentifié pourrait atteindre des services
# internes du VPS (127.0.0.1, adresses privées) à travers le relais.
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff

# Ni vers les IP publiques du VPS lui-même : le paquet relayé vers sa propre
# adresse passe par l'interface lo, que le pare-feu accepte, et atteindrait
# Caddy (HTTP/3 sur 443/udp) sans passer par Cloudflare — donc avec un
# en-tête CF-Connecting-IP choisi par l'attaquant (voir geo-server.ts).
${SELF_DENY_V4}
${SELF_DENY_V6}

# Le média WebRTC relaie en UDP — pas besoin de relais TCP (surface en moins).
no-tcp-relay

# Limites anti-abus : l'audio Opus consomme ~40 kbit/s par flux ; on plafonne
# large (128 kbit/s par allocation).
max-bps=131072

# Durée de vie maximale demandable par allocation : celle par défaut (10 min).
# Un navigateur la rafraîchit tant que l'appel dure ; une allocation qu'un
# script cesse de rafraîchir libère sa place en 10 min au lieu d'une heure.
max-allocate-lifetime=600

# Quota PAR UTILISATEUR : l'app nomme chaque identifiant « expiration:id du
# compte » (src/lib/rtc/ice.ts) et coturn compte ce quota sur la partie qui
# suit le « : ». Un joueur d'une table de 12 tient 11 connexions, donc
# 11 allocations. Le doublement couvre le recouvrement normal — pendant une
# renégociation ou un changement de réseau, la nouvelle allocation existe avant
# que l'ancienne n'expire (stale-nonce / lifetime). 12 était pile le nombre
# d'une table de 13 : au premier micro-incident, le quota sautait et le joueur
# perdait le vocal sans explication.
#   11 pairs × 2 (recouvrement) ≈ 22 → 32 avec marge
user-quota=32

# Quota GLOBAL : tenu sous la taille de la plage de ports (1024), sinon coturn
# accepterait des allocations qu'il ne peut plus placer.
total-quota=900

# Uniquement du relais, pas de fonctionnalités annexes
no-cli
no-tlsv1
no-tlsv1_1
fingerprint
stale-nonce=600

# Journalisation sobre
log-file=/var/log/turnserver.log
simple-log
EOF

# Activer le démon (Debian/Ubuntu désactivent coturn par défaut)
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn || true

systemctl enable coturn
systemctl restart coturn
systemctl --no-pager status coturn | head -5

echo
echo "──────────────────────────────────────────────────────────"
echo "coturn installé et démarré."
echo "TURN_HOST=${HOST}"
echo "TURN_SECRET=${SECRET}"
if [ -n "$SECRET_KEPT" ]; then
  echo "→ Secret existant conservé : rien à changer côté app."
else
  echo "→ Ajoute ces deux variables à l'environnement de l'app,"
  echo "  ouvre 3478/udp+tcp et 49152-50175/udp dans le pare-feu,"
  echo "  puis redéploie. Sans elles, l'app reste en STUN seul."
fi
for line in "$SELF_DENY_V4" "$SELF_DENY_V6"; do
  case "$line" in
    "#"*) echo "ATTENTION : IP publique du VPS non relevée dans /etc/turnserver.conf : ${line#\# }" ;;
    *) echo "Relais interdit vers le VPS lui-même : ${line}" ;;
  esac
done
echo "──────────────────────────────────────────────────────────"
