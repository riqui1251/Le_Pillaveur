# Corriger la 404 sur Dokploy (Le Pillaveur)

## A. Environment (copier-coller exact)

**Uniquement ces 2 lignes** dans **Environment Settings** :

```env
NODE_ENV=production
DATABASE_URL=file:/app/prisma/prod.db
```

**Supprimer** si présent :
- `NODE_OPTIONS`
- `NEXT_PUBLIC_BASE_PATH`

→ **Save** puis **Rebuild** + **Deploy**.

---

## B. Domains

| Champ | Valeur |
|--------|--------|
| Host | `146.59.199.22` |
| Port | `3000` |
| Path | *(vide)* |
| Strip Path | **OFF** |
| HTTPS | **OFF** |

→ **Save**

---

## C. URLs à tester (dans le navigateur)

1. http://146.59.199.22/api/health → doit afficher `{"ok":true,...}`
2. http://146.59.199.22/joueurs → page joueurs
3. http://146.59.199.22 → redirige vers `/joueurs`

**Ne pas utiliser** `:3000` pour le site (c’est Dokploy admin).

---

## D. Si toujours 404

Dans Dokploy → application → **Generate Domain** (domaine auto Dokploy).
Si ce domaine **fonctionne** mais pas l’IP → problème de réglage Host IP (contacter support ou utiliser le domaine généré).

---

## E. Test SSH sur le VPS

```bash
curl http://127.0.0.1:3000/api/health
```

(Remplacer 3000 par le port du conteneur si différent, voir `docker ps`)
