# Déployer Le Pillaveur avec Dokploy

Guide pas à pas (VPS Ubuntu/Debian + GitHub).

## Ce que vous obtenez

| URL | Rôle |
|-----|------|
| `http://IP_DU_VPS:3000` | **Dokploy** : panneau (deploy, restart, logs, GitHub) |
| `http://IP_DU_VPS/jeux` | **Le Pillaveur** (option sous-chemin, voir § Domaines) |
| ou `http://jeux.votre-domaine.fr` | Même app, plus simple (recommandé) |

---

## 1. Prérequis VPS

- **OS** : Ubuntu 22.04/24.04 ou Debian 12
- **RAM** : 2 Go minimum (4 Go conseillé pour les builds Next.js)
- **Ports ouverts** : `22` (SSH), `80`, `443`, `3000` (Dokploy au début)
- Accès **root** ou utilisateur avec `sudo`

---

## 2. Installer Dokploy

Connectez-vous en SSH, puis :

```bash
curl -sSL https://dokploy.com/install.sh | sudo sh
```

Attendre 2–5 minutes. Ouvrir dans le navigateur :

`http://VOTRE_IP:3000`

Créer le compte **admin** (mot de passe fort).

---

## 3. Lier GitHub

1. Dokploy → **Settings** → **Git**
2. **GitHub** → autoriser l’accès au compte `riqui1251`
3. Cocher le dépôt **Le_Pillaveur**

---

## 4. Créer l’application

1. **Create Project** → nom : `Le Pillaveur`
2. **Add Service** → **Application**
3. Onglet **Git** :
   - Repository : `riqui1251/Le_Pillaveur`
   - Branch : `main`
   - Build path : `/`
4. Onglet **Build** :
   - Type : **Dockerfile** (fichier `Dockerfile` à la racine du repo)
   - Port du conteneur : **3000**
5. **Autodeploy** : laisser activé (déploiement à chaque `git push`)

---

## 5. Variables d’environnement

Onglet **Environment** de l’application :

```env
NODE_ENV=production
NODE_OPTIONS=--no-webstorage
DATABASE_URL=file:/app/prisma/prod.db
```

### Sous-chemin `/jeux` (optionnel)

Si vous voulez `http://IP/jeux` et pas un sous-domaine :

```env
NEXT_PUBLIC_BASE_PATH=/jeux
```

Puis **redéployer** (rebuild obligatoire après changement de `basePath`).

---

## 6. Base SQLite (données persistantes)

Sans volume, la base est effacée à chaque redeploy.

1. Onglet **Volumes** (ou **Advanced** selon version Dokploy)
2. Monter : `/app/prisma` → volume nommé `le-pillaveur-prisma`
3. Au **premier** déploiement réussi, exécuter les migrations (onglet **Terminal** du conteneur ou commande one-shot) :

```bash
npx prisma migrate deploy
```

---

## 7. Domaines et URLs

### Option A — Recommandée : sous-domaine

Dokploy → application → **Domains** :

- Host : `jeux.votredomaine.fr` (ou domaine généré par Dokploy)
- Port : `3000`
- HTTPS : Let's Encrypt si vous avez un nom de domaine

DNS : enregistrement **A** `jeux` → IP du VPS.

### Option B : `http://IP/jeux`

1. Variable `NEXT_PUBLIC_BASE_PATH=/jeux` (§5)
2. **Domains** :
   - Host : `VOTRE_IP` ou votre domaine
   - **Path** : `/jeux`
   - **Strip Path** : selon tests ; si les assets 404, essayer avec/sans strip (voir [doc Dokploy Domains](https://docs.dokploy.com/docs/core/domains))

Le panneau Dokploy reste sur le port **3000**, l’app sur le port **80/443** via Traefik.

---

## 8. Premier déploiement

1. Cliquer **Deploy**
2. Suivre les **Logs** (build 5–15 min la première fois)
3. Si échec ESLint/TypeScript : corriger en local, commit, push → autodeploy

---

## 9. Mises à jour depuis GitHub (v1.0.2, etc.)

1. Sur votre PC : modifications → commit → `git push`
2. Dokploy détecte le push (webhook) et rebuild
3. Dans Dokploy : **Deployments** → historique, **Restart** si besoin

Boutons **Stop / Restart** : fiche de l’application → actions du conteneur.

---

## 10. Sécurité

- Ne pas exposer Dokploy (`:3000`) au monde entier sans firewall : limiter par IP ou VPN si possible
- Mot de passe admin Dokploy unique
- Ne jamais commiter `.env` (déjà dans `.gitignore`)
- HTTPS dès qu’un nom de domaine est disponible

---

## Dépannage rapide

| Problème | Piste |
|----------|--------|
| Build échoue Prisma | Vérifier logs ; `prisma generate` est dans le Dockerfile |
| 502 Bad Gateway | App pas démarrée ; vérifier port **3000** dans Domains |
| Assets cassés sous `/jeux` | `NEXT_PUBLIC_BASE_PATH=/jeux` + rebuild |
| Base vide après redeploy | Volume sur `/app/prisma` manquant |

---

## Fichiers ajoutés pour Dokploy

- `Dockerfile` — build production
- `.dockerignore` — allège l’image
- `next.config.js` — `output: 'standalone'` (+ `basePath` si variable définie)

Après modification de ce guide ou des fichiers Docker, committer et pousser sur `main` pour déclencher un déploiement.
