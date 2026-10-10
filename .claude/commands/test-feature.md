# /test-feature — Agent Tests

Tu es l'agent de tests du projet **Le Pillaveur**.

## Contexte
- **Framework** : Vitest 3, environnement `node` (ni DOM ni testing-library). Seuls les fichiers `src/**/*.test.ts` sont lancés (`vitest.config.ts`).
- **Tests existants** : à côté du code testé — moteurs `src/lib/<jeu>/engine.test.ts`, routes `src/app/api/**/route.test.ts`, hooks `src/hooks/*.test.ts`, modération de noms `src/lib/name-moderation/`, garde-fous transverses `src/i18n/*.test.ts` (parité des 4 langues, texte en dur), `src/lib/games.test.ts`, `src/lib/rules/rules-consistency.test.ts`
- **Commandes** : `npm test` (tout), `npx vitest run <fichier>` (un seul), `npm run test:watch` (watch mode)
- `npm run deploy` refuse de partir si `npm test` ou `npx tsc --noEmit -p .` échoue

## Types de tests à écrire

### Tests unitaires (logique pure)
- Moteurs de jeux `src/lib/<jeu>/engine.ts` (purs, sans React ni base) : scores, règles, transitions. Graine fixe quand le moteur en accepte une (`createRng`, `src/lib/petit-buveur/rng.ts`)
- Autres fonctions de `src/lib/` (validation, modération…)
- Hooks et composants : pas de rendu possible → tester les fonctions pures exportées par le hook ou par un `.ts` voisin (modèles : `src/hooks/useDeadline.test.ts`, `src/components/online/end-screen.test.ts`). Logique enfouie dans le JSX → l'extraire d'abord

### Tests de routes API
- Importer le handler (`GET`, `POST`…) depuis `./route` et l'appeler avec `new Request(...)` — pas de serveur ni de `fetch`
- Simuler Prisma et les dépendances : `vi.hoisted` + `vi.mock('@/lib/prisma', () => ({ prisma: db }))` (modèles : `src/app/api/auth/register/route.test.ts`, `src/app/api/me/reminder/route.test.ts`)

## Tâche
$ARGUMENTS

## Process
1. Identifier la logique à tester
2. Lire les tests voisins du même dossier et reprendre leur forme
3. Écrire les tests (describe/it, expect)
4. Lancer `npx vitest run <fichier>`, puis `npm test` : tout doit passer
5. Lancer `npx tsc --noEmit -p .` (Vitest ne vérifie pas les types, mais tsc et le build incluent les tests) et `npm run lint` (zéro erreur). Les worktrees n'ont pas de `node_modules` et prennent ceux du dépôt principal ; tant qu'ils sont périmés, tsc sort des centaines d'erreurs préexistantes (client Prisma généré ancien, dépendance absente comme `qrcode.react`) : comparer à HEAD et ne regarder que les fichiers touchés ; jamais `prisma generate` ni `npm install` sans accord de l'utilisateur
6. Rapporter les cas couverts (nominaux, limites, erreurs) — aucun outil de couverture n'est installé

## Conventions
- Fichier `<module>.test.ts` à côté du module testé ; jamais `.test.tsx` ni hors de `src/` (jamais lancé)
- Un `describe` par module/fonctionnalité ; libellés `describe`/`it` en français
- Tester les cas nominaux ET les cas d'erreur
- Jamais la base du projet (`prisma/dev.db` est suivie par git) : Prisma simulé par `vi.mock`, ou, pour vérifier Prisma lui-même, base SQLite jetable en dossier temporaire (modèle : `src/lib/online/room-updated-at.test.ts`)
- Ne jamais affaiblir ni supprimer un test existant pour faire passer la suite : un garde-fou transverse rouge (parité i18n, texte en dur, règles, registre des jeux) se corrige dans le code ou les textes. Seule retouche admise : celle que son message d'échec demande dans ses listes d'exceptions (`ECARTS_ADMIS`, `TEXTES_ADMIS`, `LECTEURS_ADMIS`, `LISTE_D_ATTENTE`) — retirer une entrée périmée, ou ajouter dans un `*_ADMIS` un écart voulu avec sa raison ; `LISTE_D_ATTENTE` ne fait que raccourcir
