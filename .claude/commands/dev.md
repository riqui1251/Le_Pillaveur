---
model: opus
effort: high
---
# /dev — Agent Développeur

Tu es un développeur expert du projet **Le Pillaveur**.

## Contexte projet
- **Framework** : Next.js 15 App Router, React 18, TypeScript strict, imports via `@/` (= `src/`)
- **UI** : Tailwind CSS, Radix UI (`src/components/ui/`), Framer Motion, Lucide icons
- **i18n** : next-intl, 4 langues — toutes les pages dans `src/app/[locale]/`, textes dans `messages/fr.json` (référence) puis `en.json`, `es.json`, `it.json` clé pour clé
- **DB** : Prisma ORM + SQLite (WAL, une seule connexion), client dans `src/lib/prisma.ts`
- **Auth** : sessions manuelles par token + connexion Google. Serveur : `getCurrentUser()`, `requireAdminUser()`, `requireSupervisionUser()` dans `src/lib/auth-server.ts` ; client : `useAuth()` de `@/hooks/useAuth`
- **API** : Next.js Route Handlers dans `src/app/api/`, helpers dans `src/lib/api-route.ts`
- **Jeux** : moteur pur dans `src/lib/<jeu>/engine.ts` (+ `engine.test.ts`) ; écrans dans `src/app/[locale]/games/<jeu>/` (`components/game.tsx` en local, `*Online.tsx` sous `src/components/online/`) ; logique serveur en ligne dans `src/lib/<jeu>/server-adapter.ts`, branchée dans le registre `GAME_ADAPTERS` de `src/lib/online/game-adapters.ts` ; registre `src/lib/games.ts`, règles dans `src/lib/rules/`. `src/app/[locale]/jeux/` n'est que le hub (catalogue des jeux)

## Conventions à respecter
- Pas de commentaires sauf le POURQUOI non évident (en français)
- Composants en PascalCase, fonctions utilitaires en camelCase
- Aucun texte visible en dur : `useTranslations` / `getTranslations`, clé ajoutée dans les 4 `messages/*.json` (`src/i18n/messages-parity.test.ts` échoue sinon) ; textes d'un jeu sous `games.<id>`, servis au client sur les seules pages de ce jeu (`src/i18n/messages-slices.ts`, vérifié par `messages-coverage.test.ts`)
- Liens et navigation internes : `Link`, `useRouter`, `redirect` de `@/i18n/navigation` (gardent la langue), pas `next/link`
- API : valider les inputs avant d'appeler Prisma (corps JSON borné via `readApiJson`) ; nouvelle route enveloppée dans `withApiRoute`, refus via `apiError(code, status)`. Le champ `error` porte un code de `ONLINE_ERROR_CODES` (`src/lib/online-errors.ts`), jamais une phrase française. Nouveau code = registre + `ONLINE_ERROR_TEXT_FR` + `onlineLobby.errors` dans les 4 langues
- Prisma : dans `prisma.$transaction(async (tx) => …)`, n'utiliser QUE `tx` (une seule connexion : interblocage sinon) ; préférer la forme tableau `$transaction([...])`
- Changement de schéma : passer par `/db` (migration SQL écrite à la main, jamais `prisma migrate dev`)
- Pas de `any` TypeScript sauf si vraiment inévitable ; pas de `console.log` (seuls `console.warn` / `console.error`)
- Texte qui porte une information : 12 px (`text-xs`) minimum ; 11 px toléré pour une métadonnée décorative ; jamais `text-[8px]` / `text-[9px]` (règle ESLint)

## Tâche
$ARGUMENTS

## Process
1. Lire les fichiers existants similaires pour comprendre les patterns
2. Implémenter le minimum nécessaire pour la tâche
3. Vérifier pour de vrai, pas mentalement : `npm test` (`npx vitest run <fichier>` pour un seul), `npm run lint` (zéro erreur), `npx tsc --noEmit -p .`, `npm run build`
   - Dans un worktree (pas de `node_modules` propre, ceux du dépôt principal servent) : tsc sort des centaines d'erreurs préexistantes (client Prisma généré périmé, paquets absents comme `qrcode.react`). Comparer à HEAD et ne juger que les fichiers touchés. Ne lancer ni `prisma generate`, ni `npm run build` (son `prebuild` lance `prisma generate`), ni `npm run dev` (`scripts/sync-prisma-client.mjs` lance `prisma generate` faute de client dans le worktree) sans accord de l'utilisateur : ils réécrivent le client Prisma des `node_modules` partagés
4. Lister les fichiers créés/modifiés
