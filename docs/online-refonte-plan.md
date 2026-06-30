# Refonte de la partie « online » + Petit Buveur en ligne

> Plan validé le 2026-06-30. Approche retenue : **refonte propre (serveur autoritaire + SSE)**, nettoyage du code mort en premier.

## Audit de l'existant (résumé)

Deux systèmes online parallèles, aucun pleinement fonctionnel :

### Système A — « Rooms » (utilisé par l'UI) — À GARDER ET CONSOLIDER
- Modèles `OnlineRoom` / `OnlineRoomMember`, API `/api/online/rooms/*`, hooks `useOnlineRoom` / `useOnlineGameSync`, UI `GameOnlineLobby` / `OpenLobbiesList`.
- Le lobby fonctionne (créer / rejoindre / prêt / lancer), polling adaptatif, concurrence optimiste par version.
- **Problèmes** : état autoritaire **côté client** (trichable) ; `useOnlineGameSync` **n'est branché par aucun jeu** → aucun jeu ne se joue réellement en ligne ; UI hardcodée en français (pas de next-intl).

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
