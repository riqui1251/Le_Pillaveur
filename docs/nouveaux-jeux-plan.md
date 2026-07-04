# Plan — 4 nouveaux jeux en ligne : Menteur, Imposteur, Quiz Buzzer, Loup-Garou

## Vue d'ensemble

Quatre jeux sociaux serveur-autoritaires, construits dans un ordre qui fait que
**chaque jeu livre les briques du suivant** :

| # | Jeu | Joueurs | Patterns NOUVEAUX introduits | Effort |
|---|-----|---------|------------------------------|--------|
| 0 | Lot 0 : fondations | — | registre d'adaptateurs, horloge de phase | ~1 session |
| 1 | 🎲 Le Menteur (Perudo) | 2-6 | aucun (100 % réutilisation) — rode le registre | ~2 sessions |
| 2 | 🕵️ L'Imposteur | 4-10 | timers de phase, votes secrets simultanés, contenu localisé, éliminés-spectateurs | ~3 sessions |
| 3 | 📺 Quiz Buzzer | 2-12 | réponses simultanées horodatées serveur, TV interactive | ~3 sessions |
| 4 | 🐺 Loup-Garou | 5-12 | machine à états multi-phases, 3 niveaux de vue | ~5-6 sessions |

Chaque jeu est **déployable indépendamment** dès qu'il est fini.

### Briques existantes réutilisées (gratuites)
- Salles online complètes : code, lobby, visibilité, amis, invitations (`GameOnlineLobby`).
- Serveur-autoritaire + SSE : `room-bus`, route `action`, pattern `engine.ts` pur + `server-adapter.ts`.
- Vues secrètes par joueur : pattern `stripEngineSecretForUser` (Toucher-Coulé).
- Bots de remplacement : contrat `players[{id, isBot?, leftAt?}]` + ticks `bot`/`replace-left`/`replace-afk` (`src/lib/online/replacement.ts`).
- Validation d'horloge serveur : pattern AFK (`updatedAt`, `afkCandidate` dans la route action).
- Vocal WebRTC (VoiceDock générique) — cœur du fun de l'Imposteur et du Loup-Garou.
- Mode TV spectateur : `/tv/[code]`, `stripEngineSecretForSpectator`, `TvRoomView`.
- RNG seedé reproductible : `src/lib/petit-buveur/rng.ts` (à généraliser).

### Checklist d'intégration IDENTIQUE pour chaque jeu
1. Entrée `GAMES` dans `src/lib/games.ts` (`onlineReady: true`, `onlineOnly: true` — les 4 reposent sur de l'info cachée multi-écrans).
2. `src/lib/online-<jeu>.ts` (launch) + branche dans `launchOnlineRoom` (`src/lib/online-room-launch.ts`).
3. Adaptateur enregistré dans le registre (voir Lot 0) → route `action` inchangée.
4. `parseOnlineGameState` / `isOnlineGameFinished` (`src/lib/online-game-state.ts`).
5. Contrat remplacement bots (isBot/leftAt + IA bot minimale).
6. `stripEngineSecretForUser` + `stripEngineSecretForSpectator` (TV) dans `online-room.ts`.
7. Page `src/app/[locale]/games/<jeu>/` + composant `components/online/<Jeu>Online.tsx`.
8. Renderer TV si pertinent + branche `TvRoomView`.
9. i18n fr/en/es/it, tests moteur vitest, `tsc`/`eslint`/`next build`.

---

## Lot 0 — Fondations communes (~1 session)

### 0.1 Registre d'adaptateurs de jeu — `src/lib/online/game-adapters.ts`
La route `action/route.ts` importe EN DUR les adaptateurs petit-buveur et
toucher-coulé (imports + branches). Avec 4 jeux de plus, elle devient
ingérable. Interface commune :

```ts
export type GameAdapter<S> = {
  parse(json: string | null): S | null
  serialize(state: S): string
  applyAction(state: S, userId: string, input: unknown): { state: S; error?: string }
  applyBot?(state: S): { state: S } | null
  convertToBot(state: S, userId: string): S
  clientViewJson(state: S, viewerId: string): string
  spectatorViewJson(state: S): string
  currentActorId(state: S): string | null
  isFinished(state: S): boolean
  minPlayers: number
  maxPlayers: number
}
export const GAME_ADAPTERS: Record<string, GameAdapter<any>>
```

- Refactor de la route `action` + `online-room.ts` (strip par jeu) + `online-game-state.ts` vers ce registre. PB et TC migrés SANS changement de comportement (les 143 tests le garantissent).
- `minPlayers`/`maxPlayers` : enforcement au launch (nécessaire : Loup-Garou ≥5, Imposteur ≥4).

### 0.2 Horloge de phase serveur — `src/lib/online/phase-clock.ts`
Pour toutes les phases chronométrées (vote 60 s, question 15 s, débat 3 min…) :
- Convention moteur : `state.phase` + `state.phaseEndsAt` (epoch ms, posé par le serveur).
- Action générique `ADVANCE` : n'importe quel membre l'envoie à l'échéance ; le
  serveur ne l'accepte que si `Date.now() >= phaseEndsAt` (même philosophie que
  `afkCandidate` : **l'horloge serveur est la seule autorité**) ; idempotence par
  identité de phase (phase + round) — deux ticks concurrents = un seul avance.
- Résolutions au timeout DÉTERMINISTES via `rngState` (testable).
- Client : compte à rebours affiché + tick à l'échéance (le SSE + polling de
  secours existants rattrapent un client endormi).

### 0.3 Conventions communes
- **Actions secrètes simultanées** : `pending: Record<playerId, payload>` dans
  l'état moteur, jamais dans les vues client (seul un booléen « a joué ✓ » sort).
  Résolution quand tous les acteurs attendus ont soumis OU au timeout.
- **Contenu localisé** : `src/lib/<jeu>/data/{fr,en,es,it}.ts` + tirage RNG seedé
  sans répétition dans la partie.

---

## Jeu 1 — 🎲 Le Menteur (Perudo) — `menteur` (2-6 joueurs)

**Pourquoi en premier** : zéro pattern nouveau. Tour par tour (comme PB/TC), dés
cachés par joueur (pattern TC), pas de timer, bots probabilistes simples. Il
valide le registre Lot 0 sur un périmètre minuscule. Et c'est le seul jeu de la
liste qui tourne bien à 2-3 joueurs.

### Règles V1
- 5 dés cachés chacun. À ton tour : **surenchérir** (« il y a au moins Q dés de
  face F sur la table ») ou crier **« Menteur ! »**.
- Les 1 (« Pillaveurs ») sont jokers : ils comptent pour toutes les faces.
- Surenchère : augmenter la quantité, OU même quantité + face supérieure.
  Passage aux 1 : quantité ÷ 2 arrondi sup. Sortie des 1 : quantité × 2 + 1.
- « Menteur ! » → révélation générale : si l'enchère tenait, l'accusateur perd
  un dé, sinon l'enchérisseur. Le perdant boit (gorgées = total de ses dés
  perdus). Dernier dé perdu = éliminé (cul sec). Dernier survivant = vainqueur.
- V2 (plus tard) : « Calza » (pile-poil → regagne un dé), mode palifico.

### Technique
- `src/lib/menteur/{types,engine,server-adapter}.ts` + tests.
- État : `players[{id,name,isBot,leftAt,dice[],lost}]`, `currentBid`, `turnIdx`,
  `phase: 'bidding'|'reveal'|'finished'`, `lastReveal` (public), `rngState`, `rematchVotes`.
- Actions : `BID{qty,face}`, `DUDO`, `CONTINUE`.
- Vues : le viewer voit SES dés ; les autres = nombre de dés seulement ; au
  reveal, tous les dés du round deviennent publics. TV : enchère + comptes + reveals.
- Bot : espérance binomiale (E ≈ désInconnus × 1/3 avec jokers) ; si l'enchère
  dépasse E + marge → DUDO, sinon surenchère minimale.
- UI : gobelet « tap pour regarder ses dés » (peek discret), steppers
  quantité/face, bouton MENTEUR ! dramatique, reveal animé (dés retournés un à
  un + compte qui monte), gorgées.

---

## Jeu 2 — 🕵️ L'Imposteur — `imposteur` (4-10 joueurs)

**Apporte** : timers de phase, votes secrets simultanés, contenu localisé,
éliminés-spectateurs — exactement les briques du Loup-Garou, en petit. Et le
vocal (déjà en prod) est son moteur de fun.

### Règles V1
- 1 imposteur (2 si ≥ 7 joueurs). Une paire de mots proches est tirée
  (ex. plage/piscine) : les civils reçoivent le mot A, l'imposteur le mot B.
  **Personne ne connaît son camp** — chacun voit juste « son » mot.
- Manche : chacun à son tour donne UN indice texte court (45 s/joueur ; le mot
  lui-même est interdit — validation simple) → **vote secret simultané** (60 s)
  → révélation dramatique du voté (son mot + son camp).
- Imposteur sorti → le village gagne, l'imposteur boit (2 × joueurs restants).
  Civil sorti → il boit 3, nouvelle manche d'indices. L'imposteur gagne s'il
  atteint les 3 derniers → tous les civils boivent.
- Égalité au vote : personne ne sort (une fois), sinon revote.

### Technique
- `src/lib/imposteur/{types,engine,server-adapter}.ts` + `data/{fr,en,es,it}.ts`
  (~120 paires de mots par langue, générées puis relues).
- État : `players[{id,name,isBot,leftAt,word,team,eliminated}]`,
  `phase: 'clue'|'vote'|'reveal'|'finished'`, `clueTurnIdx`, `clues[]` (publics),
  `votes` (pending secret), `phaseEndsAt`, `round`, `rngState`.
- Actions : `CLUE{text}`, `VOTE{targetId}`, `ADVANCE`, `CONTINUE`.
- Vues : le viewer voit SON mot, jamais `team` ; votes → « a voté ✓ » ;
  **éliminé = spectateur NEUTRE** (pas les mots — il peut encore parler au
  vocal, il ne doit rien pouvoir souffler) ; révélation complète en fin de
  partie. TV : indices + votes agrégés, JAMAIS les mots.
- Bots (remplacement) : indice « … », vote aléatoire (hors soi). Assumé faible.
- UI : carte mot (flip, tap pour cacher), fil d'indices, grille de vote
  d'avatars, reveal théâtral, écran de fin avec les deux mots révélés.

---

## Jeu 3 — 📺 Quiz Buzzer « Le Grand Pillaveur » — `quiz` (2-12 joueurs)

**Apporte** : réponses simultanées horodatées, gros contenu localisé, et LE
scénario TV complet (question géante sur la télé, téléphones-buzzers — Jackbox).

### Règles V1
- 10/15/20 questions (réglage host au lobby, comme la difficulté PB), QCM 4
  choix, 15 s par question.
- Points = 100 + bonus vitesse (jusqu'à +100, dégressif). Mauvaise réponse ou
  timeout = 2 gorgées. Streak ≥ 3 : badge 🔥 (cosmétique V1).
- Fin : podium + le dernier finit son verre (configurable).

### Technique
- `src/lib/quiz/{types,engine,server-adapter}.ts` + `data/questions.{fr,en,es,it}.ts`.
- **Anti-triche crucial** : la bonne réponse n'est JAMAIS dans le payload client
  pendant la phase question (elle ne sort qu'au reveal) ; l'horodatage de chaque
  réponse est pris CÔTÉ SERVEUR à la réception ; une seule réponse acceptée.
- État : `players[{id,score,streak,isBot,leftAt}]`, `questionIds[]` (tirage
  seedé sans répétition), `qIdx`, `phase: 'question'|'reveal'|'finished'`,
  `answers` (pending `{choice, answeredAt}`), `phaseEndsAt`, `rngState`.
- Actions : `ANSWER{choice}`, `ADVANCE`, `CONTINUE`.
- Contenu V1 : **200 questions × 4 langues**, 6 catégories (Culture G, Bouffe &
  Alcool, Musique, Sport, Ciné/Séries, Monde de la fête), difficulté 1-3.
  Format : `{id, cat, diff, q, choices[4], answer}`. Générées par lots, relues ;
  adaptation culturelle plutôt que traduction littérale quand nécessaire.
- Bots : répondent entre 3 et 10 s, proba de bonne réponse selon difficulté
  (70 / 50 / 35 %).
- UI téléphone : 4 gros boutons **couleur + forme** (▲ ■ ● ◆, type Kahoot,
  daltoniens-friendly), barre de temps, feedback immédiat « réponse envoyée ».
- **TV (`TvQuiz`)** : question + choix en très grand, barre de temps, avatars
  qui « buzzent » en direct (sans révéler leur choix), reveal + histogramme des
  réponses + gorgées + podium final. C'est la vitrine du mode TV.

---

## Jeu 4 — 🐺 Loup-Garou Pillaveur — `loup-garou` (5-12 joueurs)

**Le vaisseau amiral.** Réutilise TOUT : horloge de phase et votes secrets
(Imposteur), vues par joueur (TC/Menteur), registre (Lot 0), vocal (débats),
TV (place du village).

### Rôles V1 (selon effectif)
- 5-6 joueurs : 1 Loup, 1 Voyante, reste Villageois.
- 7-8 : 2 Loups, Voyante, Sorcière.
- 9-12 : 2-3 Loups, Voyante, Sorcière, Chasseur.
- V2 : Cupidon, Salvateur, et un rôle maison « L'Ivrogne » (boit pour espionner).

### Machine à états (phases serveur)
1. `reveal-role` (10 s) — carte rôle en flip.
2. `night-seer` (30 s) — la Voyante sonde un joueur → apprend son CAMP.
3. `night-wolves` (45 s) — les loups votent la victime (votes visibles ENTRE
   loups en direct) ; majorité, sinon tirage parmi les votés au timeout.
4. `night-witch` (30 s) — la Sorcière voit la victime ; potion de vie (1×) /
   potion de mort (1×) / rien.
5. `dawn` (10 s) — morts annoncés + gorgées ; si le Chasseur meurt →
   `hunter-shot` (20 s, il emporte quelqu'un).
6. `day-debate` (3 min, réglable 1-5 au lobby) — débat AU VOCAL ; bouton
   « passer au vote » (skip si tous les vivants le tapent).
7. `day-vote` (60 s) — vote secret simultané ; majorité → éliminé ; égalité →
   revote entre ex-aequo (45 s) ; re-égalité → personne. Chasseur éliminé → tire.
8. Boucle 2→7. Victoire : plus de loups → Village ; loups ≥ autres vivants → Loups.

**Anti-leak de timing** : pendant la nuit, TOUS les joueurs sans action en
cours voient le même écran « le village dort » — la durée des sous-phases est
fixe même si l'acteur a déjà joué (sinon le timing trahit la Voyante/Sorcière).

### Gorgées (table dans `game-data.ts`)
- Tu meurs = 3 gorgées (et tu deviens fantôme 👻).
- Le village lynche un innocent = tout le village boit 2.
- Un loup est lynché = chaque loup vivant boit 3.
- La Sorcière utilise une potion = elle trinque 1 (le prix du pouvoir).
- Victoire des loups = le village finit son verre ; victoire du village = les loups cul sec.

### Les 3 niveaux de vue (cœur de l'anti-triche)
Extension du pattern `stripEngineSecretForUser` avec un « profil de vue » :
1. **Vivant non-loup** : son rôle seulement + infos publiques.
2. **Loup vivant** : + identité des loups + votes loups pendant la nuit.
3. **Mort / spectateur** : vue OMNISCIENTE (tous les rôles) + bannière
   « chuuut, tu es un fantôme 👻 ». ⚠️ Le vocal est P2P : on ne peut pas couper
   le micro des morts côté serveur. V1 : règle sociale affichée + badge fantôme
   visible dans le VoiceDock. V2 : auto-mute local du VoiceDock quand mort.
4. **TV** : place du village publique (vivants/morts avec rôle révélé une fois
   mort, phase + compte à rebours, résultats de vote) — zéro secret des vivants.

### Technique
- `src/lib/loup-garou/{types,roles,engine,server-adapter,game-data}.ts` + tests
  (distribution des rôles, chaque phase, résolutions au timeout, victoires).
- Actions : `SEER_PEEK`, `WOLF_VOTE`, `WITCH_ACTION`, `HUNTER_SHOT`,
  `DEBATE_SKIP`, `DAY_VOTE`, `ADVANCE`, `CONTINUE`.
- **Min 5 joueurs humains au lancement** (bots interdits au launch — la
  déduction sociale avec bots n'a pas d'intérêt) ; bots en REMPLACEMENT
  uniquement : loup → victime aléatoire non-loup ; Voyante/Sorcière → passe ;
  vote du jour → suit la majorité courante sinon aléatoire.
- UI mobile : carte rôle flip (« tap pour cacher »), overlays nuit (ciel étoilé
  + action selon rôle), aube dramatique, débat (timer + vivants + vocal), grille
  de vote, mode fantôme (vue omnisciente grisée).
- `TvLoupGarou` : village, lune/soleil, compteurs, votes publics.

---

## Ordre d'exécution et jalons

1. **Lot 0** : registre + horloge de phase, PB/TC migrés, 143 tests verts. → commit.
2. **Menteur** : moteur + tests → UI → TV léger → i18n → vérif → commit/deploy possible.
3. **Imposteur** : contenu paires de mots → moteur + tests → UI → i18n → vérif → commit/deploy.
4. **Quiz** : moteur + tests → contenu 200×4 → UI buzzer → `TvQuiz` → vérif → commit/deploy.
5. **Loup-Garou** : moteur + rôles + tests (le plus gros lot de tests du projet)
   → UI nuit/jour → vues/TV → i18n → vérif multi-comptes → commit/deploy.

**Total estimé : ~14-15 sessions de travail.** Chaque jalon est shippable.

### Risques identifiés
- **Vocal + morts (Loup-Garou)** : pas de mute serveur possible (P2P) → règle
  sociale V1, auto-mute V2. Assumé.
- **Bots en déduction sociale** : volontairement basiques (remplacement
  uniquement) ; le launch exige des humains (min 5 LG / 4 Imposteur).
- **Volume de contenu (Quiz/Imposteur)** : généré par lots avec relecture ;
  format extensible pour en rajouter au fil de l'eau.
- **Refactor Lot 0** : touche la route action existante → filet des 143 tests
  existants + vérification manuelle PB/TC avant tout nouveau jeu.
