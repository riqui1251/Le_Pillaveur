#!/bin/bash
# Remet les droits du volume DB en ordre et vérifie l'intégrité du fichier.
# Sûr à rejouer : il ne modifie ni le schéma ni les données.
set -euo pipefail
DB_VOLUME="${DB_VOLUME:-le-pillaveur-db}"
# UID/GID du conteneur applicatif (Dockerfile : nextjs 1001). La base est en
# WAL : l'ouvrir crée prod.db-wal et prod.db-shm à côté du fichier. Ouvrir la
# base en root laisserait ces fichiers annexes à root, et l'application — qui
# tourne en 1001 — ne pourrait plus ouvrir sa propre base. C'est exactement le
# genre de panne que ce script est censé réparer, pas provoquer.
DB_UID="${DB_UID:-1001}"

# On n'impose plus journal_mode=DELETE et on ne supprime plus prod.db-journal à
# la main : le journal est posé en WAL par l'application au démarrage
# (src/lib/db-setup.ts), et un -journal présent est un journal CHAUD que seule
# l'ouverture de la base par sqlite peut rejouer sans risque de corruption.
# L'`integrity_check` ci-dessous ouvre la base et s'en charge.
docker run --rm -e DB_UID="$DB_UID" -v "$DB_VOLUME:/data" alpine sh -c '
  set -e
  # /!\ ORDRE CRITIQUE : chown/chmod AVANT tout apk, comme dans prod-deploy.sh
  # et prod-apply-auth-migrations.sh. La reparation des droits est la SEULE
  # partie indispensable de ce script — c est pour elle qu on le lance quand
  # l application ne peut plus ouvrir sa base. Elle ne doit donc dependre ni du
  # depot alpine (filtre d egress du VPS, DNS, miroir en panne) ni de su-exec.
  # Avec set -e, un apk en echec place ici privait le volume de son chown : le
  # secours ne reparait plus rien exactement dans le cas ou on en a besoin.
  chown -R "$DB_UID:$DB_UID" /data
  chmod -R u+rwX /data
  # Releve du journal et controle d integrite : du CONFORT, tolerant a l echec.
  # sqlite3 tourne sous DB_UID (su-exec) pour ne pas laisser de -wal/-shm
  # appartenant a root derriere lui.
  if [ -f /data/prod.db ] && apk add --no-cache sqlite su-exec >/dev/null 2>&1; then
    echo "journal:" $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA journal_mode;" 2>/dev/null || echo inconnu)
    echo "integrity:" $(su-exec "$DB_UID:$DB_UID" sqlite3 /data/prod.db "PRAGMA integrity_check;" 2>/dev/null || echo inconnu)
    # Les deux ouvertures ci-dessus ont pu creer -wal/-shm : on repasse le chown.
    chown -R "$DB_UID:$DB_UID" /data
  else
    echo "journal/integrite : non releves (base absente ou depot alpine injoignable) — les droits, eux, sont reparis"
  fi
  ls -la /data/prod.db*
'
docker restart le-pillaveur
sleep 5
# Script du DEPOT, pas /tmp : un /tmp/prod-test-register.sh disparait au premier
# redemarrage du VPS, et son absence faisait sortir ce script en erreur APRES
# une reparation reussie — l operateur croyait le secours en echec. Tolerant :
# le test d inscription est une verification, pas la reparation.
bash "$(dirname "$0")/prod-test-register.sh" || echo "test d inscription non joue (voir ci-dessus) : les droits sont tout de meme reparis"
