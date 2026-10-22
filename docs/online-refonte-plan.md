# Refonte de la partie « online » + Petit Buveur en ligne

> Plan validé le 2026-06-30. Approche retenue : **refonte propre (serveur autoritaire + SSE)**, nettoyage du code mort en premier.

## Audit de l'existant (résumé)

Deux systèmes online parallèles, aucun pleinement fonctionnel :

### Système A — « Rooms » (utilisé par l'UI) — À GARDER ET CONSOLIDER
- Modèles `OnlineRoom` / `OnlineRoomMember`, API `/api/online/rooms/*`, hooks `useOnlineRoom` / `useOnlineGameSync`, UI `GameOnlineLobby` / `OpenLobbiesList`.
- Le lobby fonctionne (créer / rejoindre / prêt / lancer), polling adaptatif, concurrence optimiste par version.
- **Problèmes** : état autoritaire **côté client** (trichable) ; `useOnlineGameSync` **n'est branché par aucun jeu** → aucun jeu ne se joue réellement en ligne ; UI hardcodée en français (pas de next-intl).
  - **RÉSOLU (2026-09-19)** : l'état est passé côté serveur (adaptateurs + `POST /rooms/[roomId]/action`, `GET /state` en lecture seule). Les hooks `useOnlineGameSync` et `useSyncedOnlineGame`, jamais branchés, ont été **supprimés** avec le `PUT /state` qui les servait ; l'UI passe par next-intl. Les lignes ci-dessus décrivent l'audit d'origine, pas le code d'aujourd'hui.

### Système B — « Lobbies » (code mort) — À SUPPRIMER
- Modèles `OnlineLobby` / `OnlineLobbyPlayer`, `lib/online/engine.ts`, `server.ts`, **Socket.IO** (`pages/api/online/socket.ts` + `ws-bus.ts`).
- Jeu générique (plateau 24 cases + dé + défi aléatoire) **sans rapport avec le vrai Petit Buveur**.
- `/api/online/lobbies/[lobbyId]/action` appelé uniquement par son test → **aucune UI ne l'utilise**.
- Socket.IO en Pages Router = risque sur le déploiement standalone/Caddy.

### Déchets
- `game.tsx.temp` (corrompu UTF-16), `useOnlineRoom.ts` double-espacé, `OnlineGameGate` inutilisé, dépendances `socket.io*`.

## Décisions
- **Transport temps réel** : SSE (Server-Sent Events) + fallback polling. Pas de Socket.IO.
- **Autorité** : serveur autoritaire (clients envoient des actions, serveur applique la logique et diffuse l'état).
- **i18n** : toute l'UI online passe par next-intl (fr/en/es/it).
- **Mono-instance** : bus mémoire par room suffisant ; relais (Redis/PG) seulement si multi-instances un jour.

## Plan par lots

### LOT 0 — Nettoyage (½ j, sans risque)
- Supprimer Système B : `lib/online/{engine,server,ws-bus,challenges,engine.test}.ts`, `pages/api/online/socket.ts`, `types/next-socket`, `api/online/lobbies/[lobbyId]/**`, `components/online/OnlineGameGate.tsx`.
- **Garder** `api/online/lobbies/route.ts` (liste, Système A) et `lib/online-members.ts` (utilisé par les jeux).
- Retirer `socket.io` + `socket.io-client`.
- Supprimer `game.tsx.temp` ; réparer le formatage de `useOnlineRoom.ts`.
- Migration Prisma : DROP `OnlineLobby` + `OnlineLobbyPlayer`.
- Valider : `npm run build` + `npm test`.

### LOT 1 — Fondations temps réel (1–2 j)
- Bus mémoire `lib/online/room-bus.ts` (EventEmitter par room).
- Endpoint SSE `GET /api/online/rooms/[roomId]/stream` (ReadableStream / text/event-stream).
- Hook client `useRoomStream` (EventSource), fallback polling.
- Squelette endpoint action serveur `POST /api/online/rooms/[roomId]/action`.
- i18n : namespace `online.*` (4 langues) + migrer `GameOnlineLobby` / `OpenLobbiesList`.

### LOT 2 — Moteur Petit Buveur + online (3–5 j, gros morceau)
- 2.1 Moteur pur `lib/petit-buveur/engine.ts` : `createInitialState(players, settings, seed)` + `reduce(state, action, rng)`. Réutiliser `resolve-case.ts`, `case-config.ts`, `outcome-helpers.ts`.
- 2.2 RNG seedé `lib/petit-buveur/rng.ts` (dés + cases déterministes).
- 2.3 Tests unitaires du moteur (même seed ⇒ même partie).
- 2.4 Refactor `game.tsx` (4057 l.) pour consommer le moteur (local : en mémoire ; online : état serveur + envoi d'actions). Même UI.
- 2.5 Serveur autoritaire : applique l'action via le moteur, version+1, fixe le tour, diffuse en SSE.
- 2.6 Déconnexion/reconnexion (grâce + bot/skip), rematch.

### LOT 3 — Finitions (1–2 j)
- Polish lobby (codes/invitations, statut joueurs, réglages), cas limites.
- Passe de tests complète + vérif manuelle.
- Bonus : le moteur SSE/autoritaire devient le patron pour passer les autres jeux en ligne.

## Risques
- **Principal** : extraire le moteur d'un composant de 4057 lignes sans casser le mode local → extraction incrémentale + tests, `game.tsx` fonctionnel à chaque étape.
- SSE derrière Caddy : OK par défaut (vérifier au déploiement, pas de buffering sur text/event-stream).
- Migration Prisma appliquée au démarrage du conteneur (déjà en place).

## Estimation : ~1,5 à 2 semaines de dev focalisé.

---

## Avancement (2026-06-30)

**Fait + commité + poussé sur GitHub (branche `claude/sweet-germain-9e26ce`) :**
- ✅ **LOT 0** — nettoyage Système B + migration de suppression des tables.
- ✅ **LOT 1** — temps réel SSE (bus mémoire, endpoint `/stream`, émission sur mutations, client abonné SSE + polling de secours allégé).
- ✅ **LOT 2.1/2.2** — moteur pur déterministe, testé (66 tests au total) :
  - `lib/petit-buveur/rng.ts` — RNG seedé (état persistable).
  - `lib/petit-buveur/types.ts` — types découplés de l'UI.
  - `lib/petit-buveur/case-generator.ts` — génération de cases déterministe (sans i18n, `defiIndex`).
  - `lib/petit-buveur/engine.ts` — réducteur `ROLL` / `RESOLVE_INTERACTION` ; boucle complète déterministe (déplacement, victoire, tours, skip/ancre), effets directs fidèles ; cases interactives en `pending`.
  - `lib/petit-buveur/game-data.ts` — données canoniques (gorgées par défi) pour alimenter le moteur côté serveur.

**Backend serveur-autoritaire — FAIT (commité + poussé) :**
- ✅ **Adaptateur serveur** `lib/petit-buveur/server-adapter.ts` : `buildPetitBuveurEngineState(members, difficulty, seed)` (engine player.id = userId), (dé)sérialisation, `toClientView` (masque `rngState` = anti-triche), `applyRoomAction` (validation + reduce, testé).
- ✅ **Endpoint action** `POST /api/online/rooms/[roomId]/action` : valide le tour, applique `reduce`, persiste (`gameStateJson`/`stateVersion`/`currentTurnUserId`), diffuse en SSE. Réponse = vue client.
- ✅ **Rewire du lancement** : `launchPetitBuveurRoom` construit un `EngineState` (graine aléatoire par partie). Compatible avec le parsing/finished/rematch existants (`EngineState` expose `winner` + `version`).

**JOUABLE EN LIGNE (UI minimale) — FAIT :**
- ✅ `components/online/PetitBuveurOnline.tsx` : écran de jeu online (joueurs/positions/gorgées, « Lancer le dé » / « Continuer » selon le tour, rematch en fin). Consomme l'état serveur (SSE + polling) et poste sur `/action`.
- ✅ Branchement de `page.tsx` : en `playMode === 'online'`, rend le lobby puis l'écran online (le flux local reste intact).
- ✅ **Anti-triche réel** : `stripEngineSecret` retire `rngState` sur TOUS les chemins de lecture client (`buildRoomDto`, `/state` GET, réponse `/action`). Le serveur garde l'état complet en base.

**Reste à faire (liste du 2026-06-30, soldée — état au 2026-10-22) :**
1. **Enrichir le moteur** : logique fine des cases interactives (roue, vote, échange, téléport, pile/face, dé de la honte, défi-chaîne, chance, double-case) + cases à ciblage, avec un payload `choice` dans `RESOLVE_INTERACTION`. **Porter fidèlement depuis `game.tsx`**. Tests par case.
   - **RÉSOLU (2026-10-22)** : toutes les cases sont dans `lib/petit-buveur/engine.ts` — cases à cible, cases à fenêtre (`resolveInteractive`), étapes `verdict` (le lanceur juge le défi), `side` (la cible choisit pile ou face, 20 s) et `duel` ; le `choice` porte `targetId`, `side`, `option`, `succeeded`, `chanceChoice`, et chaque champ est validé (refus `INVALID_TARGET` / `INVALID_CHOICE`, jamais de valeur par défaut). Les décisions sans humain (bot, joueur parti, délai dépassé) passent par `autoAction`, tirées par le RNG du moteur. Le **duel sur case partagée**, dernière règle locale absente en ligne, y est porté (le perdant recule d'une case, sauf protégé). Le contrat local / en ligne (`app/[locale]/games/petit-buveur/rules-parity.test.ts`) compare désormais **chaque case** (418 cas) : déterministes, à fenêtre une fois le choix fait (leur règle a quitté `game.tsx` pour des fonctions pures d'`apply-case.ts`, appelées par le jeu local), tirées au hasard avec le même générateur, duel compris ; `engine-rules.test.ts` couvre les scénarios et 2 000 parties aléatoires de bots. Hors contrat, par choix : la roue des défis et les défis physiques ne sont jamais tirés en ligne (invérifiables à distance, `defiAllowed`).
2. **Parité visuelle** : remplacer l'UI online minimale par l'expérience riche du mode local (rewire de `game.tsx`, 4057 l., pour afficher l'état serveur ; le moteur sert aussi en local). Objectif « même ressenti ».
   - **RÉSOLU (2026-10-22)**, sans réécrire `game.tsx` : l'écran en ligne (`components/online/PetitBuveurOnline.tsx` + `components/online/petit-buveur/`) monte les composants partagés de `components/petit-buveur/` (plateau, pions qui marchent case par case, dé, flash du tour, carte de la case, spectacle des tirages — roue, pièce, dé de la honte, duel —, gorgées flottantes, effets en cours, historique, écran de fin, mode Soft) et reprend les fenêtres locales : **cible choisie à l'aveugle** comme en local (« l'effet sera révélé après ton choix » : la vue client ne dit rien de la case tirée, `toClientView`), consigne de chaque case, invites du Vote, de l'Échange et du Défi en chaîne, Téléport nommant le 1er et le dernier, « Lancer la roue » / « Lancer le D6 », défi sur un protégé clos sans arbitrage, fenêtre du duel. La TV (`components/tv/petit-buveur/`) suit les mêmes règles d'affichage.
3. i18n de l'UI online (actuellement en français en dur, comme le lobby).
   - **RÉSOLU (2026-10-22)** : tout passe par next-intl (`games.petit-buveur.*`, `onlineLobby.*`), et les refus du serveur sont des codes traduits côté client (`onlineLobby.errors`), jamais une phrase. `src/i18n/no-hardcoded-text.test.ts` relève désormais l'écran en ligne, ses composants partagés et la TV du Petit Buveur (aucun texte en dur). Corrigé au passage : en anglais, espagnol et italien, le bouton du côté de la pièce (« Stack », « Pila »…) ne disait pas la même chose que la pièce (« HEADS », « CARA »…).
4. **Déconnexion/reconnexion** + robustesse rematch.
   - **RÉSOLU (2026-10-22)** : « Quitter » marque le joueur parti (`markPlayerLeft`) : s'il avait la main, elle passe aussitôt au suivant présent (`passDepartedTurns`), sa décision en attente est jouée au tempo d'un bot ; il a 3 min (`ONLINE_REPLACE_GRACE_MS`) pour revenir par le bandeau « Rejoindre » (`/rooms/rejoinable`, retour en compare-and-swap par `/rooms/join`), puis un bot prend sa place (`replace-left`). Onglet fermé sans quitter : la place reste, `/rooms/me` remet le joueur à sa table au retour ; s'il avait la main et ne revient pas, un autre humain obtient son remplacement par un bot après 3 min d'inactivité, horloge serveur à l'appui (`replace-afk`, avertissement la dernière minute). L'hôte qui part passe la main au plus ancien. Coups de bots et échéances sont tirés par les téléphones, arbitrés par rang (`useBotReferee`, `useAdvanceTick` — l'échéance de pile ou face aussi, depuis le 2026-10-22), et en filet par le minuteur de service du serveur (`online/room-ticker.ts`, réarmé au redémarrage). « Rejouer » relance au quorum des présents et retire les absents (`processRematchVote`, `dropAbsentMembers`). Un tour ne reste en attente que si plus aucun autre humain n'est à la table — personne n'attend alors : la table se fige jusqu'au retour du joueur, ou jusqu'à la purge des parties abandonnées.

**Ce qui reste vraiment** : rien de bloquant pour le Petit Buveur en ligne. À garder en tête : tout le temps réel reste mono-instance (bus SSE, minuteurs de service, registre des départs en mémoire), à revoir le jour où l'application tournerait sur plusieurs instances ; et la cible à l'aveugle change l'habitude des tables en ligne, qui voyaient la case avant de viser — choix aligné sur le jeu local, à confirmer à l'usage.

**Dette préexistante notée** : historique de migrations Prisma cassé (`visitor_ip`/`SitePresence`) → `migrate dev` inutilisable, contourner via `migrate diff` jusqu'à réparation.
