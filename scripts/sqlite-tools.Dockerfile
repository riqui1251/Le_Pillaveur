# Image d'outils SQLite pour tout ce qui ouvre la base de prod hors de
# l'application : instantane avant migration et purge des sessions
# (prod-deploy.sh), restauration, reparation des droits, inspection,
# bootstrap du fondateur, cron de sauvegarde. Elle ne contient QUE :
#   - sqlite3 : ouvrir prod.db (.backup, PRAGMA, SELECT) ;
#   - su-exec : le faire sous l'UID de l'application (1001), pour ne jamais
#     laisser de prod.db-wal / prod.db-shm appartenant a root dans le volume.
#
# Pourquoi une image plutot que `alpine` + `apk add` a chaque conteneur : l'apk
# passait par le reseau A CHAQUE etape (jusqu'a huit fois par deploiement), et
# un depot alpine injoignable (filtre d'egress, DNS, miroir en panne) coupait
# l'operation en plein milieu — au pire entre la migration et le redemarrage.
# Construite par prod-deploy.sh a chaque deploiement (2 s en cache), elle est
# la AVANT que quiconque ait besoin d'ouvrir la base, et aucun conteneur
# d'outils n'a plus besoin du reseau.
#
# CONTRAT (partage avec le cron de sauvegarde, scripts/vps-secure-max.sh) :
# nom `le-pillaveur-sqlite`, sqlite3 et su-exec dans le PATH, rien d'autre.
# Les scripts de maintenance la construisent eux-memes si elle manque ; le
# cron, lui, retombe sur alpine + apk.
#
#   docker build -t le-pillaveur-sqlite -f scripts/sqlite-tools.Dockerfile scripts/
#
# `alpine` sans version, comme les autres conteneurs d'outils du depot : c'est
# l'image deja presente sur le VPS, aucun telechargement supplementaire.
FROM alpine
RUN apk add --no-cache sqlite su-exec
