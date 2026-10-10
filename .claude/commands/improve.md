# /improve — Orchestrateur d'amélioration

Tu es l'orchestrateur principal du projet **Le Pillaveur** (jeux de soirée sur téléphone, en local ou en ligne, à boire ou « Sans alcool » ; Next.js 15 + TypeScript + SQLite/Prisma). Le `README.md` fait foi pour les commandes, les migrations et le déploiement.

## Ton rôle

Analyser la demande de l'utilisateur, la décomposer en tâches et déléguer à des agents spécialisés dans le bon ordre.

## Pipeline d'exécution

### Étape 1 — Analyse de la demande
Classe la demande dans une ou plusieurs catégories :
- **feature** : nouvelle fonctionnalité (nouveau jeu, nouvelle page, nouvelle option)
- **bug** : correction d'un comportement incorrect
- **db** : changement de schéma Prisma / nouvelle table / migration
- **ui** : amélioration visuelle ou UX sans logique métier
- **perf** : optimisation (requêtes, bundle, temps de chargement)
- **security** : faille, validation, auth, headers
- **test** : ajout ou correction de tests

### Étape 2 — Plan
Affiche un plan en bullet points avant d'agir. Exemple (fictif) :
```
Plan :
• [DB] Ajouter le modèle GameFavorite (userId, gameId) + migration SQL écrite à la main
• [DEV] Créer la route /api/me/favorites
• [DEV] Afficher les favoris dans le hub /[locale]/jeux, textes en fr/en/es/it
• [TEST] Tester la logique pure et la route (route.test.ts)
• [VALID] npm test, npm run lint, npx tsc --noEmit -p ., npm run build
```

### Étape 3 — Délégation aux agents spécialisés

Lance les agents dans le bon ordre (séquentiellement si dépendances, en parallèle sinon). Un nouveau jeu complet se délègue à `/new-game`, pas à l'agent Dev.

**Agent DB** (si schéma change) :
> Contexte projet : Next.js 15, Prisma 6 + SQLite, schéma `prisma/schema.prisma`, migrations dans `prisma/migrations/`. Tâche : [TÂCHE DB PRÉCISE]. Respecter les conventions des modèles existants (ids `String @id @default(cuid())`, champs camelCase, horodatage `DateTime @default(now())` (`createdAt` ou nommé d'après l'événement : `joinedAt`, `playedAt`…), `updatedAt DateTime @updatedAt` seulement sur une ligne réécrite après coup (`User`, `OnlineRoom`…), `onDelete` explicite sur les relations ; `bannedAt` marque un bannissement, pas une suppression douce : un compte se supprime physiquement via `deleteUserAccount`). Jamais `prisma migrate dev` : écrire `prisma/migrations/<AAAAMMJJHHMMSS>_<nom>/migration.sql` à la main, modifier le schéma en cohérence, puis `npx prisma db execute --file prisma/migrations/<dossier>/migration.sql`, `npx prisma migrate resolve --applied <dossier>`, `npx prisma generate`. Avant d'appliquer : `npx prisma migrate status` ne doit montrer en attente que la nouvelle migration, sinon ne rien appliquer et remonter (base locale en retard). Dans un worktree, pas de `prisma generate` sans accord (client partagé). `.claude/commands/db.md` fait foi pour le détail. La base locale est `prisma/prisma/dev.db` (avec le `.env` du dépôt principal, `file:./prisma/dev.db` se résout depuis `prisma/`) ; `prisma/dev.db` et `prisma/dev.db-journal` sont de vieux fichiers suivis par git malgré le `.gitignore` : ne jamais les committer.

**Agent Dev** :
> Contexte projet : Le Pillaveur, Next.js 15 App Router, React 18, TypeScript strict, Tailwind CSS, Radix UI, next-intl (`messages/fr.json` référence, `en`/`es`/`it` clé pour clé). API routes dans `src/app/api/`. Pages dans `src/app/[locale]/`. Composants dans `src/components/`, hooks dans `src/hooks/`. Jeux : moteur pur `src/lib/<jeu>/engine.ts`, écrans `src/app/[locale]/games/<jeu>/`, registre `src/lib/games.ts` (`src/app/[locale]/jeux/` n'est que le hub des jeux). Nouvelle route API : l'envelopper dans `withApiRoute` et refuser par `apiError(code, status)` (`src/lib/api-route.ts`), code déclaré dans `src/lib/online-errors.ts` et traduit sous `onlineLobby.errors` — jamais de phrase française dans la réponse. Tâche : [TÂCHE DEV PRÉCISE]. Respecter le style existant, pas de commentaires inutiles, pas de features non demandées.

**Agent Test** :
> Contexte projet : Le Pillaveur, Vitest en environnement `node` (pas de DOM), fichiers `*.test.ts` colocalisés à côté du code (seul motif ramassé : `src/**/*.test.ts`). Tâche : [TÂCHE TEST PRÉCISE]. Écrire des tests unitaires pour la logique métier (ex. `src/lib/<jeu>/engine.test.ts`) et, pour les API routes critiques, un `route.test.ts` à côté du `route.ts` (Prisma mocké par `vi.mock('@/lib/prisma')`). Lancer `npm test` pour valider.

**Agent Validation** :
> Vérifier que les changements fonctionnent : 1) `npm test` passe (parité des 4 langues comprise), 2) `npm run lint` sans erreur, 3) `npx tsc --noEmit -p .` sans nouvelle erreur, 4) `npm run build` passe, 5) la feature est accessible dans l'app (`npm run dev`). Dans un worktree : 3) se compare à `origin/main` (centaines d'erreurs préexistantes), 4) et 5) seulement avec accord de l'utilisateur (ils lancent `prisma generate` sur les `node_modules` partagés), sinon le dire. Rapporter les erreurs précisément.

### Étape 4 — Rapport final
Résumer ce qui a été fait, les fichiers modifiés, et les points d'attention pour le déploiement : migration (appliquée par `npm run deploy` via `scripts/prod-deploy.sh`, site arrêté le temps de la migration), nouvelle variable d'env (à poser dans `/opt/le-pillaveur/.env` sur le VPS avant le déploiement ; ce fichier n'est lu qu'au lancement du conteneur et `.env*` est exclu de l'image : une `NEXT_PUBLIC_*` lue dans le navigateur, figée au build, ne le verra pas), etc.

## Règles importantes
- Toujours lire les fichiers existants avant d'en créer de nouveaux
- Ne jamais forcer un push ou supprimer des fichiers sans confirmation
- Pas de `npm run deploy` ni de push sur `main` sans accord explicite : `main` se pousse APRÈS un déploiement réussi (il reflète la prod, le pousser ne déploie rien)
- Les migrations Prisma s'écrivent à la main (voir Agent DB), jamais `prisma migrate dev`
- Respecter next-intl : toutes les nouvelles pages dans `src/app/[locale]/`, aucun texte en dur ; chaque clé ajoutée dans `messages/fr.json` est traduite clé pour clé dans `en.json`, `es.json`, `it.json` (`src/i18n/messages-parity.test.ts` échoue sinon)
- Ne pas casser le build Docker standalone (`output: 'standalone'`)
- Dans un worktree : pas de `node_modules` propre, ceux du dépôt principal servent et sont périmés (client Prisma généré ancien, paquets absents comme `qrcode.react`). `tsc` y sort des centaines d'erreurs préexistantes, surtout Prisma, et `npm run build` y échoue déjà (`qrcode.react` introuvable) : comparer à HEAD, ne juger que les fichiers touchés. `prisma generate` (lancé par `npm run build` en prebuild, et par `npm run dev` via `scripts/sync-prisma-client.mjs` quand le worktree n'a pas de client) écrit dans ces `node_modules` partagés : demander avant. Copier `.env` du dépôt principal avant `npm run dev`.

## Demande utilisateur
$ARGUMENTS
