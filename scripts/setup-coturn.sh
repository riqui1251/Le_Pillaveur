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
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${1:?Usage: setup-coturn.sh <domaine-ou-ip-publique>}"
SECRET="$(openssl rand -hex 32)"

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

# Le média WebRTC relaie en UDP — pas besoin de relais TCP (surface en moins).
no-tcp-relay

# Limites anti-abus : l'audio Opus consomme ~40 kbit/s par flux ; on plafonne
# large (128 kbit/s par allocation).
max-bps=131072

# Quota PAR UTILISATEUR : un joueur d'une table de 12 tient 11 connexions, donc
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
echo "→ Ajoute ces deux variables à l'environnement de l'app,"
echo "  ouvre 3478/udp+tcp et 49152-50175/udp dans le pare-feu,"
echo "  puis redéploie. Sans elles, l'app reste en STUN seul."
echo "──────────────────────────────────────────────────────────"
