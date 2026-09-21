# Alertes et sauvegardes surveillées — runbook opérateur

Jusqu'ici, tout ce qui tournait la nuit sur le VPS n'écrivait que dans
`/var/log/*.log` : un échec n'était vu par personne. Ce document dit comment
brancher les alertes (une fois), puis où regarder quand une alerte arrive.

Principe : chaque tâche planifiée **pinge** un service externe quand elle a
réussi (« dead man's switch »). Si le ping manque — cron cassé, docker arrêté,
VPS éteint —, c'est le service qui prévient. Rien sur le VPS n'a besoin de
fonctionner pour que l'alerte parte.

## Ce qui tourne (cron root : `sudo crontab -l`)

| Quand | Quoi | Script | Journal | Alerte |
|---|---|---|---|---|
| 03:00 | sauvegarde quotidienne `prod-<date>.db.gz` (14 j), point de contrôle WAL | `/usr/local/bin/le-pillaveur-db-backup.sh` | `/var/log/le-pillaveur-backup.log` | ping `backup` |
| 03:15 | copie R2 de la dernière quotidienne (30 j) | `/usr/local/bin/le-pillaveur-db-backup-offsite.sh` | `/var/log/le-pillaveur-backup-offsite.log` | ping `offsite` |
| 18 h → 02 h et 04 h, à l'heure pile | sauvegarde horaire `prod-hourly-<date>.db.gz` (48 h) | même script, argument `hourly` | `/var/log/le-pillaveur-backup-hourly.log` | `/fail` seulement |
| 07:00 | veille disque (`df -P /`, `docker system df`, seuil 80 %) | `/usr/local/bin/le-pillaveur-disk-watch.sh` | `/var/log/le-pillaveur-disk.log` | ping `disk` |
| toutes les 5 min | sonde externe sur `https://lepillaveur.fr/api/health` | UptimeRobot / Better Stack | tableau de bord du service | mot-clé `"ok":true` absent |

Chaque copie est **vérifiée avant de compter** : `PRAGMA integrity_check` sur
la copie (doit rendre exactement `ok`), puis `gzip -t`. Une copie qui échoue
est supprimée, le journal dit pourquoi, et le ping `/fail` part. L'horaire
n'envoie pas de ping de succès (le quotidien prouve que la chaîne marche) mais
signale ses échecs : une copie qui ne passe pas `integrity_check` à 21 h est
le premier signe d'une base abîmée, on ne l'attend pas jusqu'à 03:00.

Les scripts sous `/usr/local/bin` sont des **copies** (root, 750) posées par
`scripts/vps-secure-max.sh` : modifier `scripts/` dans le dépôt ne change rien
tant qu'on ne l'a pas rejoué (étape 3).

## Mise en place (une fois)

### 1. healthchecks.io — trois checks

Compte gratuit sur <https://healthchecks.io>. Créer trois checks ; noter
l'URL de ping de chacun (`https://hc-ping.com/<uuid>`) :

| Nom | Période | Grâce | Pourquoi |
|---|---|---|---|
| `backup` | 1 jour | 2 h | le cron passe à 03:00 ; alerte vers 05:00 s'il n'a pas pingé |
| `offsite` | 1 jour | 2 h | 03:15, même logique |
| `disk` | 1 jour | 2 h | 07:00 ; alerte immédiate au-dessus de 80 % (`/fail`), alerte vers 09:00 si le cron ne passe plus |

Dans chaque check, brancher l'e-mail (et, si possible, un second canal :
Telegram, SMS…).

### 2. Poser les URL sur le VPS

Une URL par fichier, une ligne, jamais dans le dépôt ni dans un journal :

```bash
sudo mkdir -p /etc/le-pillaveur && sudo chmod 700 /etc/le-pillaveur
echo 'https://hc-ping.com/<uuid-backup>'  | sudo tee /etc/le-pillaveur/backup-ping-url  >/dev/null
echo 'https://hc-ping.com/<uuid-offsite>' | sudo tee /etc/le-pillaveur/offsite-ping-url >/dev/null
echo 'https://hc-ping.com/<uuid-disk>'    | sudo tee /etc/le-pillaveur/disk-ping-url    >/dev/null
sudo chmod 600 /etc/le-pillaveur/*-ping-url
```

Fichier absent = comportement d'avant (la tâche tourne, personne n'est
prévenu). Le script d'installation le signale dans sa vérification finale.

### 3. Rejouer `vps-secure-max.sh` (pose les scripts et les crons)

**Dans la même session que le déploiement, le soir même, avant 03:00** —
et à une heure creuse : sa section 6 (`apt-get upgrade`) peut redémarrer
docker, donc le conteneur.

```bash
npm run deploy                                   # attendre DONE_DEPLOY
ssh ubuntu@146.59.199.22 'bash /opt/le-pillaveur/scripts/vps-secure-max.sh'
```

Pourquoi tout de suite : le script de sauvegarde qui tourne à 03:00 est la
**copie installée** sous `/usr/local/bin`, celle du dernier passage de
`vps-secure-max.sh`. Dès que le nouveau code tourne, la base passe en WAL
(réglage persistant, `src/lib/db-setup.ts`) ; une copie installée antérieure
(volume `:ro`, sqlite3 en root, sans `integrity_check`) ouvrirait une base
WAL sur un montage lecture seule — rien de destructif, mais une nuit sans copie
vérifiée. `/opt/le-pillaveur/scripts/` est à jour dès la fin de `npm run deploy`
(l'archive est extraite avant que `prod-deploy.sh` ne tourne).

Il (ré)écrit le script de sauvegarde, recopie `vps-disk-watch.sh` et
`vps-backup-offsite.sh` sous `/usr/local/bin`, pose les crons sans les
dupliquer, lance une première sauvegarde (qui pinge `backup`), puis — c'est
son rôle historique — applique les mises à jour système (`apt upgrade`).

### 4. Sonde externe sur `/api/health`

UptimeRobot (gratuit) ou Better Stack : moniteur **HTTP(s) par mot-clé**.

- URL : `https://lepillaveur.fr/api/health`
- mot-clé : `"ok":true` — alerter quand le mot-clé est **absent**
- intervalle : 5 min ; alerte après 2 échecs consécutifs pour absorber un
  redémarrage de déploiement (~30 s)

La route rend `ok: false` (HTTP 503) si la table `User` ne répond pas **ou**
s'il reste moins de 5 % de disque libre sur le volume de la base. Un simple
moniteur « code 200 » suffirait aussi, le mot-clé protège en plus contre une
page d'erreur HTML servie en 200 par un proxy.

### 5. Vérifier

```bash
sudo crontab -l                      # 4 lignes le-pillaveur : 03:00, horaire, 07:00, et 03:15 seulement si vps-setup-offsite-r2.sh a été joué
sudo /usr/local/bin/le-pillaveur-db-backup.sh hourly   # une copie prod-hourly-… en quelques secondes
sudo /usr/local/bin/le-pillaveur-disk-watch.sh          # une ligne « disk OK : / occupé à NN % »
sudo DISK_ALERT_PCT=1 /usr/local/bin/le-pillaveur-disk-watch.sh   # force l'alerte : le check « disk » doit passer rouge
curl -s https://lepillaveur.fr/api/health                # {"ok":true,…,"disk":{"freePct":NN}}
```

Sur healthchecks.io, les trois checks doivent être verts après la nuit
suivante (le `disk` forcé repasse vert au ping de 07:00).

## Convention de ping

- Le fichier `/etc/le-pillaveur/<check>-ping-url` contient **l'URL de base**,
  rien d'autre.
- Succès : `curl -fsS -m 10 --retry 3 <url>`, dernier ordre du script.
- Échec : `<url>/fail`, seulement si l'URL est de type healthchecks.io
  (`hc-ping.com/…` hébergé, ou `…/ping/<uuid>` auto-hébergé). Pour un autre
  service on n'invente pas de route : seul le silence alerte, après la
  période de grâce.
- Un ping qui échoue (réseau) n'échoue jamais la tâche : une ligne dans le
  journal, c'est tout.

## `/api/health`

```json
{ "ok": true, "service": "le-pillaveur", "db": "up", "disk": { "freePct": 21 } }
```

- `db` : `up` si `SELECT COUNT(*) FROM User LIMIT 1` répond, sinon `down`.
- `disk.freePct` : pourcentage libre **disponible** (hors réserve root) sur le
  répertoire de la base ; `null` si la mesure est impossible (`ok` inchangé).
- `ok: false` + HTTP 503 : base `down`, **ou** `freePct < 5`.
- Jamais de chemin, de sha de build ni de message d'erreur dans la réponse.

## Symptôme → où regarder

| Symptôme | Où regarder | Puis |
|---|---|---|
| healthchecks `backup` rouge (pas de ping) | `sudo tail -50 /var/log/le-pillaveur-backup.log` ; `sudo crontab -l` ; `docker ps` | ligne `backup ECHEC` : lire les lignes au-dessus (`integrity_check`, `gzip -t`, `apk`) ; pas de ligne du tout : cron ou VPS arrêté |
| healthchecks `backup` rouge via `/fail` | même journal, ligne `ECHEC : integrity_check…` | copie corrompue = base source suspecte : `sudo /usr/local/bin/le-pillaveur-db-backup.sh` à la main ; si ça échoue encore, voir « Restaurer » AVANT le prochain déploiement. La copie refusée est gardée sous `suspect-<mode>-<date>.db.gz` (48 h, invisible pour la restauration et l'off-site) : c'est l'état courant, pour un `.recover` ; à supprimer à la main une fois la base réparée |
| healthchecks `offsite` rouge | `sudo tail -50 /var/log/le-pillaveur-backup-offsite.log` | `trop ancienne` : c'est le quotidien qui a manqué (ligne du dessus) ; `gzip -t` : le .gz local est tronqué, relancer la sauvegarde ; erreur rclone : jeton R2 ou réseau |
| healthchecks `disk` rouge | `sudo tail -20 /var/log/le-pillaveur-disk.log` | section « Disque » ci-dessous |
| sonde externe : `"ok":true` absent | `curl -s https://lepillaveur.fr/api/health` | `db: down` → `docker logs --tail 50 le-pillaveur` ; `freePct` < 5 → section « Disque » ; rien ne répond → `docker ps`, `systemctl status caddy` |
| copies horaires absentes le soir | `sudo tail /var/log/le-pillaveur-backup-hourly.log` ; `ls -lt /opt/le-pillaveur-backups \| head` | pas de ping de succès pour l'horaire : seul ce journal en parle |
| `prod.db-wal` énorme dans le volume | `docker run --rm -v le-pillaveur-db:/data alpine ls -la /data` | le point de contrôle TRUNCATE de 03:00 rend « busy » chaque nuit : vérifier qu'aucun autre lecteur ne tourne à 03:00 (`sudo crontab -l`) |

## Disque : que faire à 80 %

Le script de veille **ne purge rien** ; c'est `prod-deploy.sh` qui nettoie le
cache de build docker à chaque déploiement. À la main, par ordre de gain :

```bash
docker system df                       # la ligne « Build Cache » est presque toujours la coupable
docker builder prune -af               # cache de build : sans risque, le prochain build est juste plus long
docker image prune -f                  # images sans tag ; ne touche pas à le-pillaveur:latest/:previous/:builder
sudo du -sh /opt/le-pillaveur-backups  # 14 j de quotidiennes + 48 h d'horaires
sudo journalctl --disk-usage           # journaux système
```

Ne jamais supprimer `le-pillaveur:previous` (retour arrière du code) ni le
volume `le-pillaveur-db`.

## Restaurer

Les copies horaires (`prod-hourly-…`) apparaissent dans la liste de
`scripts/prod-db-restore.sh` comme les quotidiennes et les instantanés
pré-déploiement ; la procédure est celle du script (terminal interactif,
confirmation tapée à la main).
