#!/bin/bash
# Bloque l'UDP SORTANT (hote + conteneurs Docker) sauf DNS/NTP, loopback et reponses.
# Objectif : empecher le VPS d'etre utilise comme source d'attaque UDP (flood),
# meme en cas de compromission. Le trafic du site (TCP 80/443) n'est pas affecte.
IPT=/usr/sbin/iptables

del() { while $IPT -C "$@" 2>/dev/null; do $IPT -D "$@"; done; }

clean_output() {
  del OUTPUT -o lo -j ACCEPT
  del OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  del OUTPUT -p udp --dport 53 -j ACCEPT
  del OUTPUT -p udp --dport 123 -j ACCEPT
  del OUTPUT -p udp -j DROP
}

clean_docker() {
  del DOCKER-USER -p udp -d 127.0.0.11 -j ACCEPT
  del DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  del DOCKER-USER -p udp --dport 53 -j ACCEPT
  del DOCKER-USER -p udp --dport 123 -j ACCEPT
  del DOCKER-USER -p udp -j DROP
}

# --- Hote ---
clean_output
# Inserer en ordre inverse (resultat haut->bas : lo, established, 53, 123, DROP udp)
$IPT -I OUTPUT 1 -p udp -j DROP
$IPT -I OUTPUT 1 -p udp --dport 123 -j ACCEPT
$IPT -I OUTPUT 1 -p udp --dport 53 -j ACCEPT
$IPT -I OUTPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
$IPT -I OUTPUT 1 -o lo -j ACCEPT

# --- Conteneurs Docker (trafic forwarde) ---
if $IPT -L DOCKER-USER -n >/dev/null 2>&1; then
  clean_docker
  $IPT -I DOCKER-USER 1 -p udp -j DROP
  $IPT -I DOCKER-USER 1 -p udp --dport 123 -j ACCEPT
  $IPT -I DOCKER-USER 1 -p udp --dport 53 -j ACCEPT
  $IPT -I DOCKER-USER 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  $IPT -I DOCKER-USER 1 -p udp -d 127.0.0.11 -j ACCEPT
fi

echo "Egress filter applique."
