# Le Pillaveur — Guide Claude Code

Plateforme de jeux de soirée multijoueur pour amis (jeux à boire, ambiance « Sans alcool » possible). Next.js 15 + TypeScript + SQLite/Prisma, déployé sur un VPS (conteneur Docker derrière Caddy puis Cloudflare). Le `README.md` fait foi pour les commandes, les migrations et le déploiement.

## ⚡ Routage automatique des demandes (PRIORITAIRE)

À **chaque** demande de l'utilisateur, avant de répondre ou d'agir, analyse l'intention et déclenche automatiquement le bon skill — l'utilisateur n'a PAS besoin de taper la slash command lui-même.

Règles de routage :
- Demande **vague, large, ou multi-étapes** (ex. « ajoute un mode équipe », « améliore X ») → invoque **`/improve`** (l'orchestrateur décompose et délègue).
- Demande de **créer un jeu** (nom + règles d'un nouveau jeu) → invoque **`/new-game`**.
- Demande de **coder une feature précise / corriger un bug / refacto** → invoque **`/dev`**.
- Demande touchant le **schéma de données, Prisma, migrations, modèles** → invoque **`/db`**.
- Demande d'**écrire ou lancer des tests** → invoque **`/test-feature`**.
- Demande de **vérifier que c'est prêt à déployer** (build, tests, cohérence) → invoque **`/validate`**.

En cas de doute entre plusieurs skills, ou si la demande mélange plusieurs domaines → privilégie **`/improve`**.
Si la demande est une simple question/explication sans action de code → réponds directement, sans skill.

## Stack
- **Frontend** : Next.js 15 App Router, React 18, TypeScript strict, Tailwind CSS, Radix UI, Framer Motion
- **Backend** : Next.js Route Handlers (API), Prisma ORM, SQLite
- **Auth** : Sessions manuelles (bcryptjs + token) + connexion Google
- **i18n** : next-intl, 4 langues (fr, en, es, it) dans `/messages/`
- **Email** : Resend API
- **Analytics** : pays via l'en-tête Cloudflare `CF-IPCountry` (geoip-lite retiré), tracking visiteurs custom
- **Tests** : Vitest

## Structure clé
```
/src/app/[locale]/          ← Pages (toutes les routes passent par [locale])
/src/app/api/               ← API Routes
/src/components/            ← Composants React réutilisables
/src/hooks/                 ← Hooks React (useAuth, usePlayers, useOnlineRoom…)
/src/lib/                   ← Utilitaires, helpers, moteurs de jeux (src/lib/<jeu>/engine.ts)
/prisma/schema.prisma       ← Schéma DB
/messages/fr.json           ← Traductions françaises (principale)
```

## Commandes
```bash
npm run dev           # Dev server (dans un worktree : copier .env du dépôt principal avant)
npm run build         # Build production
npm test              # Tests Vitest
npm run lint          # Zéro erreur exigé
npx tsc --noEmit -p . # Vérification des types
npx prisma studio     # Interface DB visuelle
```
Dans un worktree, les `node_modules` du dépôt principal servent, avec un client Prisma généré périmé : `tsc` y sort des centaines d'erreurs préexistantes (comparer à HEAD, ne juger que les fichiers touchés). `npx prisma generate`, `npm run build` (prebuild) et `npm run dev` (`scripts/sync-prisma-client.mjs`) réécrivent ce client partagé : demander avant.

## Migrations : écrites à la main
Jamais `prisma migrate dev`. Créer `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql`, modifier `prisma/schema.prisma` en cohérence, puis en local :
```bash
npx prisma db execute --file prisma/migrations/<dossier>/migration.sql
npx prisma migrate resolve --applied <dossier>
npx prisma generate
```
Avant d'appliquer : `npx prisma migrate status` ne doit montrer en attente que la nouvelle migration (la base locale peut être très en retard). Détails et garde-fous : `/db`.

## Déploiement
- Docker multi-stage, Node 22 alpine, Next.js standalone
- Jamais `npm run deploy` ni push sur `main` sans accord explicite de l'utilisateur
- `npm run deploy` → `scripts/deploy-from-local.sh` : refuse un arbre non propre ou un HEAD dont `origin/main` n'est pas l'ancêtre, `npm test` + `tsc`, `git archive` du HEAD, `scp` vers le VPS, puis `scripts/prod-deploy.sh` (reconstruit l'image, migre, relance, vérifie `/api/health`, imprime `DONE_DEPLOY`)
- Pas de migration au démarrage du conteneur : `prod-deploy.sh` prend un instantané de la base puis applique les migrations en attente, **site arrêté le temps de la migration** (SQLite en WAL, verrou exclusif)
- `main` sur GitHub se pousse APRÈS un déploiement réussi : il reflète la prod, le pousser ne déploie rien
- Dokploy est retiré (`DOKPLOY.md` supprimé) : aucun déploiement par Dokploy ni par simple push

## Système d'agents (slash commands)

| Commande | Rôle |
|---|---|
| `/improve [demande]` | **Orchestrateur** — analyse la demande et délègue aux bons agents |
| `/dev [tâche]` | Implémente du code (feature, bug fix, refacto) |
| `/db [tâche]` | Modifie le schéma Prisma et écrit les migrations |
| `/test-feature [quoi tester]` | Écrit et lance des tests Vitest |
| `/validate` | Vérifie build + tests + cohérence avant déploiement |
| `/new-game [nom + règles]` | Crée un nouveau jeu complet |

### Workflow recommandé
```
Toi : /improve ajouter des jeux favoris sur le compte
  → L'orchestrateur analyse, planifie, et lance /db puis /dev puis /test-feature puis /validate
```

## Conventions
- Pas de commentaires sauf WHY non-évident
- Nouveaux textes → toujours dans `/messages/fr.json` (jamais hardcodé), puis traduits clé pour clé dans `en.json`, `es.json`, `it.json` (`src/i18n/messages-parity.test.ts` échoue sinon)
- Nouvelles pages → toujours dans `/src/app/[locale]/`
- API routes : valider les inputs, nouvelle route enveloppée dans `withApiRoute`, refus via `apiError(code, status)` (`src/lib/api-route.ts`) : `error` porte un code de `src/lib/online-errors.ts`, jamais une phrase française
- Ne pas casser le build standalone Docker
