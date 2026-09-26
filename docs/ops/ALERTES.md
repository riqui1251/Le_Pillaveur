# Alertes et sauvegardes surveillées — runbook opérateur

Jusqu'ici, tout ce qui tournait la nuit sur le VPS n'écrivait que dans
`/var/log/*.log` : un échec n'était vu par personne. Ce document dit comment
brancher les alertes (une fois), puis où regarder quand une alerte arrive.

Principe : chaque tâche planifiée **pinge** un service externe quand elle a
réussi (« dead man's switch »). Si le ping manque — cron cassé, docker arrêté,
VPS éteint —, c'est le service qui prévient. Rien sur le VPS n'a besoin de
fonctionner pour que l'alerte parte.

En plus du ping, chaque tâche dépose son dernier résultat dans un **fichier
d'état** que l'onglet **Surveillance** de la supervision affiche aux
fondateurs (section « Fichiers d'état » plus bas) : on voit d'un coup d'œil ce
que la nuit a donné, sans session ssh.

## Ce qui tourne (cron root : `sudo crontab -l`)

| Quand | Quoi | Script | Journal | Alerte | Fichier d'état |
|---|---|---|---|---|---|
| toutes les 5 min | sonde du site : `https://lepillaveur.fr/api/health` **via Cloudflare et Caddy** | `/usr/local/bin/le-pillaveur-site-probe.sh` | `/var/log/le-pillaveur-probe.log` (échecs et retours seulement) | ping `site` ; `/fail` au 2e échec de suite | `probe.json` |
| 03:00 | sauvegarde quotidienne `prod-<date>.db.gz` (14 j), point de contrôle WAL | `/usr/local/bin/le-pillaveur-db-backup.sh` | `/var/log/le-pillaveur-backup.log` | ping `backup` | `backup-daily.json` |
| 03:15 | copie R2 de la dernière quotidienne (30 j) | `/usr/local/bin/le-pillaveur-db-backup-offsite.sh` | `/var/log/le-pillaveur-backup-offsite.log` | ping `offsite` | `offsite.json` |
| 18 h → 02 h et 04 h, à l'heure pile | sauvegarde horaire `prod-hourly-<date>.db.gz` (48 h) | même script, argument `hourly` | `/var/log/le-pillaveur-backup-hourly.log` | `/fail` seulement | `backup-hourly.json` |
| 07:00 | veille disque (`df -P /`, `docker system df`, seuil 80 %) | `/usr/local/bin/le-pillaveur-disk-watch.sh` | `/var/log/le-pillaveur-disk.log` | ping `disk` | `disk.json` |

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

### 1. healthchecks.io — quatre checks

Compte gratuit sur <https://healthchecks.io>. Créer quatre checks ; noter
l'URL de ping de chacun (`https://hc-ping.com/<uuid>`) :

| Nom | Période | Grâce | Pourquoi |
|---|---|---|---|
| `site` | 5 min | 10 min | sonde toutes les 5 min ; alerte **immédiate** au 2e échec de suite (`/fail`, 5 à 10 min après la chute), et au bout de 15 min sans aucun ping (VPS éteint, cron cassé, réseau sortant coupé) |
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
echo 'https://hc-ping.com/<uuid-site>'    | sudo tee /etc/le-pillaveur/site-ping-url    >/dev/null
sudo chmod 600 /etc/le-pillaveur/*-ping-url
```

Fichier absent = comportement d'avant (la tâche tourne, personne n'est
prévenu). Le script d'installation le signale dans sa vérification finale.
Les fichiers d'état, eux, sont écrits dans tous les cas : l'onglet
Surveillance fonctionne avant même que les checks soient créés.

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

Il crée le dossier d'état `/var/lib/le-pillaveur-status` (root, 755),
(ré)écrit le script de sauvegarde, recopie `vps-disk-watch.sh`,
`vps-site-probe.sh` et `vps-backup-offsite.sh` sous `/usr/local/bin`, pose les
crons sans les dupliquer, lance une première sauvegarde (qui pinge `backup`)
et un premier passage de la sonde (qui pinge `site`), puis — c'est son rôle
historique — applique les mises à jour système (`apt upgrade`). Sa
vérification finale affiche les fichiers de ping présents/absents et le
contenu des fichiers d'état.

Le **montage** du dossier d'état dans le conteneur vient, lui, de
`prod-deploy.sh` (`-v /var/lib/le-pillaveur-status:/app/ops-status:ro`) : il
n'existe qu'à partir du premier déploiement qui contient cette ligne. Avant,
l'onglet Surveillance signale le dossier comme absent (`statusDirFound`
faux dans la réponse de `/api/admin/ops-status`).

### 4. Sonde du site (`vps-site-probe.sh`)

Toutes les 5 minutes, le VPS interroge sa propre URL **publique** :

- `curl -sS --max-time 15 https://lepillaveur.fr/api/health` — la requête
  sort du VPS, passe par Cloudflare puis Caddy, exactement comme celle d'un
  joueur. Le HEALTHCHECK du Dockerfile, lui, ne regarde que `127.0.0.1:3000`
  depuis le conteneur : il reste vert avec un certificat expiré, un Caddy
  arrêté ou une règle Cloudflare cassée ;
- succès = HTTP 200 **et** `"ok":true` dans le corps (la route rend
  `ok: false` en 503 si la table `User` ne répond pas ou s'il reste moins de
  5 % de disque ; le mot-clé protège en plus d'une page d'erreur servie en
  200 par un proxy) ;
- le résultat va dans `probe.json` (code `ok`, `http_error`,
  `keyword_missing` ou `unreachable`, temps de réponse en ms) ;
- **alerte** : succès → ping `site`. Le **premier** échec après un succès
  n'envoie rien (ni succès ni `/fail`) : un déploiement coupe le site ~30 s,
  plus s'il migre, et un passage sur dix tomberait dedans. Le passage suivant
  tranche : encore en échec → `/fail`, alerte immédiate ; revenu → ping de
  succès, avant la fin de la grâce. Une vraie panne est donc signalée 5 à
  10 min après son début. C'est la règle « alerte après 2 échecs consécutifs »
  qu'on donnait jusqu'ici à UptimeRobot. La retenue exige un succès **récent**
  (moins de 10 min) : si `probe.json` ne peut plus être réécrit, il reste figé
  sur « ok », et sans cette borne chaque échec passerait pour le premier ;
- **journal** : une ligne par échec, une au retour à la normale (avec l'heure
  de l'échec précédent), rien quand tout va bien.

Ce que la sonde ne voit pas : le VPS éteint (elle ne tourne plus — c'est
alors le silence qui alerte, au bout de 15 min), et un problème qui ne
toucherait que les visiteurs d'ailleurs (DNS chez un opérateur, pays bloqué).
Pour ce dernier cas, un moniteur UptimeRobot ou Better Stack **par mot-clé**
(`"ok":true` absent, 5 min, alerte après 2 échecs) reste un complément utile,
facultatif.

Essai à la main, sans rien casser :

```bash
sudo /usr/local/bin/le-pillaveur-site-probe.sh; echo "rc=$?"   # rc=0, et rien d'écrit si l'état précédent était déjà bon
cat /var/lib/le-pillaveur-status/probe.json
```

### 5. Vérifier

```bash
sudo crontab -l                      # 5 lignes le-pillaveur : */5 (sonde), 03:00, horaire, 07:00, et 03:15 seulement si vps-setup-offsite-r2.sh a été joué
sudo /usr/local/bin/le-pillaveur-db-backup.sh hourly   # une copie prod-hourly-… en quelques secondes
sudo /usr/local/bin/le-pillaveur-disk-watch.sh          # une ligne « disk OK : / occupé à NN % »
sudo DISK_ALERT_PCT=1 /usr/local/bin/le-pillaveur-disk-watch.sh   # force l'alerte : le check « disk » doit passer rouge
curl -s https://lepillaveur.fr/api/health                # {"ok":true,…,"disk":{"freePct":NN}}
sudo cat /var/lib/le-pillaveur-status/*.json             # une ligne JSON par tâche déjà passée
# Forcer l'alerte « site » : DEUX passages en échec (le premier est retenu).
# Le cron suivant (≤ 5 min) remet l'état au vert et pinge le succès.
sudo PROBE_URL=https://lepillaveur.fr/api/nexistepas /usr/local/bin/le-pillaveur-site-probe.sh
sudo PROBE_URL=https://lepillaveur.fr/api/nexistepas /usr/local/bin/le-pillaveur-site-probe.sh
```

Sur healthchecks.io, les quatre checks doivent être verts après la nuit
suivante (le `disk` forcé repasse vert au ping de 07:00, le `site` forcé au
passage suivant de la sonde).

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
- Exception de la sonde du site : le premier échec après un succès récent
  (moins de 10 min) n'envoie **rien** ; `/fail` part au deuxième échec de
  suite (section 4).

## Fichiers d'état et onglet Surveillance

L'onglet **Surveillance** de la supervision (fondateurs seulement) montre, en
plus de l'état du conteneur (version, mémoire, base, disque, flux, plantages,
tâches internes), le dernier résultat de chaque tâche root ci-dessus. Il le
lit dans des fichiers que les scripts écrivent eux-mêmes.

- **Dossier** : `/var/lib/le-pillaveur-status` sur l'hôte (root, 755 ; fichiers
  644), créé par `vps-secure-max.sh` et par `prod-deploy.sh`. Monté **en lecture
  seule** dans le conteneur : `-v /var/lib/le-pillaveur-status:/app/ops-status:ro`
  (mêmes options dans `prod-db-restore.sh` et `prod-env-resend.sh` — tout
  script qui recrée le conteneur —, vérifié par
  `src/lib/shell-scripts.test.ts`). Côté application :
  `OPS_STATUS_DIR`, `/app/ops-status` par défaut.
- **Un fichier par tâche** : `probe.json`, `backup-daily.json`,
  `backup-hourly.json`, `offsite.json`, `disk.json`. Une ligne JSON :

  ```json
  {"v":1,"job":"backup-daily","ok":true,"code":"ok","at":"2026-09-26T03:00:41+02:00","detail":"prod-20260926-030000.db.gz","metrics":{"sizeBytes":1843221}}
  ```

- **Écriture atomique** (fichier temporaire dans le même dossier, puis `mv`) :
  le panneau ne lit jamais un fichier à moitié écrit. Un état qui ne peut pas
  être écrit ne fait **jamais** échouer la tâche (une ligne « etat … non ecrit »
  dans son journal) ; le panneau le montre alors « en retard ».
- **Aucune donnée personnelle** : des codes, des dates, des nombres, un nom de
  fichier de sauvegarde. Les URL de ping restent dans `/etc/le-pillaveur`
  (700) : ni l'application ni ces fichiers ne les voient.

| Tâche | `ok: true` | `ok: false` | `ok: null` | Métriques | En retard après |
|---|---|---|---|---|---|
| `probe` | `ok` | `http_error` (code ≠ 200), `keyword_missing` (200 sans `"ok":true`), `unreachable` (DNS, connexion, certificat, délai) | — | `httpCode`, `ms` | 15 min |
| `backup-daily` | `ok` (detail = fichier `.db.gz`) | `integrity_failed` (copie refusée, gardée en `suspect-…`), `gzip_failed`, `failed` | — | `sizeBytes` ; `exitCode` en échec | 26 h |
| `backup-hourly` | idem | idem | — | idem | 16 h (couvre la journée 04 h → 18 h sans passage) |
| `offsite` | `ok` (detail = fichier envoyé) | `no_local_backup`, `stale_local_backup`, `gzip_failed`, `failed` (rclone) | `not_configured` (R2 non branché) | `exitCode` en échec | 26 h |
| `disk` | `ok` | `over_threshold`, `df_failed` | — | `usedPct`, `thresholdPct` | 26 h |

« Inconnu » dans l'onglet = aucune ligne lisible. Trois causes, que l'écran
ne départage pas seul : fichier absent (tâche jamais passée depuis la création
du dossier : veille disque avant le premier 07:00, off-site jamais installé
par `vps-setup-offsite-r2.sh`), fichier invalide (JSON cassé, `"v"` d'un
script plus récent que l'application, date dans le futur), ou dossier non
monté — ce dernier cas a son bandeau (« dossier des fichiers d'état
introuvable ») : conteneur relancé à la main sans le `-v`. Lecture à la main :
`sudo cat /var/lib/le-pillaveur-status/*.json`.

Le `detail` ne porte **jamais de chemin** du serveur : les scripts n'écrivent
que des noms de fichiers (le journal à lire est dans le tableau du haut), et
l'application réduit par sécurité tout chemin absolu d'un détail à son nom de
fichier (un message d'erreur de curl peut en citer un).
`src/lib/shell-scripts.test.ts` vérifie les scripts.

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
| healthchecks `site` rouge via `/fail` | onglet Surveillance (ligne « sonde ») ou `sudo tail -20 /var/log/le-pillaveur-probe.log` | `http_error` 503 : le détail recopie la réponse — `db: down` → `docker logs --tail 50 le-pillaveur` ; `freePct` < 5 → section « Disque ». `http_error` 52x : Cloudflare n'atteint pas Caddy → `systemctl status caddy`, `docker ps`. `unreachable` : DNS, certificat (`curl 60`) ou délai de 15 s dépassé |
| healthchecks `site` rouge sans `/fail` (silence) | `ssh` : le VPS répond-il ? puis `sudo crontab -l`, `sudo tail /var/log/le-pillaveur-probe.log` | VPS éteint ou sans réseau sortant, cron retiré, script absent de `/usr/local/bin` (rejouer `vps-secure-max.sh`) |
| sonde UptimeRobot (facultative) : `"ok":true` absent | `curl -s https://lepillaveur.fr/api/health` | mêmes pistes que `site` ; si `site` reste vert, le problème ne touche que certains visiteurs (DNS, réseau) |
| onglet Surveillance : une tâche « en retard » | le journal de la tâche (tableau du haut) ; `sudo crontab -l` | le cron ne passe plus, ou le script n'a pas pu écrire son état (ligne « etat … non ecrit » dans son journal : droits de `/var/lib/le-pillaveur-status`) |
| onglet Surveillance : dossier d'état absent | `docker inspect le-pillaveur --format '{{json .Mounts}}'` | conteneur lancé sans le montage `ops-status` : redéployer avec un `prod-deploy.sh` à jour |
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
