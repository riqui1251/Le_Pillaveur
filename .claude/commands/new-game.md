# /new-game — Créer un nouveau jeu

Tu es l'agent de création de jeux pour **Le Pillaveur**.

## Contexte
- Un jeu = un id kebab-case, une entrée dans `GAMES` (`src/lib/games.ts`, `path: '/games/<id>'`) et un dossier `src/app/[locale]/games/<id>/`. `src/app/[locale]/jeux/` est le hub (catalogue) : pas un dossier de jeu, il lit `GAMES` tout seul, comme la landing, les collections et le sitemap.
- Deux formes, cumulables : **local** (un téléphone qui tourne autour de la table) et **en ligne** (chacun sur son téléphone, serveur-autoritaire).
- Références : local → `hi-lo`, `pyramide` (`pendu` aussi, mais masqué) ; en ligne seul → `president` (`git show --stat 3f3b611` liste les fichiers touchés ; `layout.tsx`, `games.meta`, `soloFit` et le classement sont venus après), page type `quiz/page.tsx` ; local + en ligne → `purple`, `1220`.

## Structure d'un jeu
- `src/lib/<id>/engine.ts` : règles en fonctions pures (ni React, ni Prisma, ni `window`), testées dans `engine.test.ts` à côté.
- `games/<id>/page.tsx` (client) + `layout.tsx` serveur copié de `games/hi-lo/layout.tsx` en changeant `GAME_ID` (SEO + tranche de messages `gameSlice` ; sans lui, `src/i18n/messages-coverage.test.ts` échoue). La page ne lit que `games.<id>` (+ le `lobby` des autres jeux en ligne) : la tranche ne transporte rien d'autre.
- Local : écran dans `games/<id>/components/game.tsx`, joueurs via `useSelectedPlayers` + `usePlayers`, stats via `usePlayers().updatePlayerStats`, écran de fin avec `<FirstGameFeedbackCard mode="local" gameId="<id>" />` (pas d'écran de fin → id dans `LOCAL_GAMES_WITHOUT_END_SCREEN` de `src/lib/local-game-beacon.ts` ; l'un ou l'autre, jamais les deux : `local-game-beacon.test.ts`). Jeu local seul : `localMinPlayers` dans `GAMES`.
- En ligne : `src/lib/<id>/server-adapter.ts` ; adaptateur dans `GAME_ADAPTERS` (`src/lib/online/game-adapters.ts`) ; lanceur `src/lib/online-<id>.ts` branché dans `src/lib/online-room-launch.ts` ; cas dans `parseOnlineGameState` ET `isOnlineGameFinished` de `src/lib/online-game-state.ts` (mini-parseur, jamais le registre d'adaptateurs : fichier importé côté client ; sans ces cas, « Rejouer » est refusé) ; cas dans `src/lib/online/match-results.ts` (issue de partie → XP, succès, classement) ; `src/components/online/<Jeu>Online.tsx` chargé par `next/dynamic` dans la page, avec `GameShowcase` / `TryBotsGate` hors mode en ligne ; vue TV `src/components/tv/Tv<Jeu>.tsx` + `TvRoomView.tsx` ; `RANKED_GAME_IDS` de `OnlineRankingBoard.tsx` si `match-results.ts` donne des victoires.
- Réglages de table (manches…) : `RoomSettings` (`online-game-state.ts`), route existante `src/app/api/online/rooms/[roomId]/settings/route.ts`, `useOnlineRoom.ts`, `GameOnlineLobby.tsx` ; textes sous `games.<id>.lobby`.
- UI : Tailwind + Framer Motion, composants `src/components/ui/`, icône SVG dans `src/components/icons/GameIcons.tsx` + `src/components/hub/GameIconById.tsx`.
- Textes : `games.catalog.<id>` (`title`, `description`), `games.meta.<id>` (jeu visible : `title` ≤ 60 car. et unique, `description` ≤ 160, `src/lib/seo/seo.test.ts`), `games.<id>` (textes du jeu ; tout jeu en ligne a `tutorial` et `about`, lus par `GameTutorialModal` / `GameShowcase` ; en ligne seul : `page`, `lobby`, `game`, `tutorial`, `about` comme `games.president`).
- Ni nouvelle route API ni migration : l'état en ligne vit dans `OnlineRoom.gameStateJson`, les succès sont attribués par `match-results.ts`. `/api/stats` et `/api/achievements` n'ont qu'un GET.

## Règles dures
- Aucun texte visible en dur, `<Jeu>Online.tsx` et vue TV compris (`src/i18n/no-hardcoded-text.test.ts` ne relève que `games/<id>/page.tsx` et `components/*.tsx`) ; `fr.json` d'abord, puis `en.json`, `es.json`, `it.json` clé pour clé (`src/i18n/messages-parity.test.ts`).
- Jeu visible : `suit` + `rank` + `games.meta` obligatoires ; `featured` limité à 5 (jamais masqué, `onlineReady` exigé) ; `beta` exige visible + `onlineReady`. Jeu pas prêt → `hidden: true` (noindex, hors sitemap, aucune table en ligne, pas de page règles). Contenu (cartes, mots…) absent d'une langue → `contentLangs`.
- En ligne seul : `onlineOnly: true` (sinon `local-game-beacon.test.ts` le prend pour un jeu local sans écran de fin).
- En ligne : jamais client-autoritaire ; `onlineReady: true` et `minPlayers` / `maxPlayers` / `botsFillable` identiques dans `GAMES` et l'adaptateur (`game-adapters.test.ts`). `botsFillable` ⇒ `soloFit` renseigné (`'great'` seulement aux conditions du commentaire de `soloFit`, sinon `'group'`) ET ajouté à `EXPECTED` dans `src/lib/games.test.ts`.
- En ligne et visible : page règles, comme tous les jeux de `GAME_ADAPTERS` — id dans `src/lib/rules/rules-ids.ts`, `RULES_META` dans `rules-content.ts` (≤ 60 / 160 car.), article `docs/rules/fr/<id>.md` : titre `# Règles …`, « X à Y joueurs » du chapeau = bornes en ligne, `## Questions fréquentes` de 4 à 6 `### … ?` (`rules-consistency.test.ts`).

## Tâche
$ARGUMENTS

## Process
1. Fixer l'id, la forme (local / en ligne / les deux), l'effectif, les règles et l'état du moteur
2. Lire le jeu de référence le plus proche (voir Contexte)
3. Écrire `src/lib/<id>/engine.ts` + `engine.test.ts`, puis `npx vitest run src/lib/<id>/engine.test.ts`
4. Ajouter l'entrée dans `GAMES` (`src/lib/games.ts`)
5. Créer `games/<id>/page.tsx` + `layout.tsx` (+ `components/game.tsx` en local, câblage en ligne ci-dessus)
6. Ajouter les textes dans les 4 fichiers de `messages/`
7. Icône ; page règles si en ligne et visible
8. Lancer `/validate` (`npm test`, `npm run lint` zéro erreur, `npx tsc --noEmit -p .`, `npm run build`)
