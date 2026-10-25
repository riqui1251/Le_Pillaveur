# /model-routing — Modèle et effort de chaque tâche

Choisit le modèle et la puissance de réflexion (effort) des agents du projet **Le Pillaveur**. Chaque commande fixe déjà les siens dans son frontmatter (`model`, `effort`) ; ce tableau sert à `/improve` quand il délègue, et à trancher un cas qui sort du lot.

## Modèles
- `haiku` (Haiku 5.5) : rapide, environ 40 fois moins cher qu'Opus. Lecture et recherche, jamais du code livré.
- `sonnet` (Sonnet 5.5) : moitié prix d'Opus. Tâches balisées : tests, vérifications, traductions, retouches.
- `opus` (Opus 5.5) : modèle par défaut pour concevoir et écrire le code du site.
- `fable` (Fable 5.1) : le plus capable, 2,5 fois le prix d'Opus, tours longs. Recours, jamais par défaut.

## Effort
`low` < `medium` < `high` < `xhigh` < `max` : plus haut, la réflexion va plus loin et coûte plus de tokens et de temps. `high` est l'équilibre pour du code ; `xhigh` pour ce qui peut casser la prod ou touche beaucoup de fichiers ; `max` seulement après un échec en `xhigh`.

## Tableau
| Tâche | Modèle | Effort | Pourquoi |
|---|---|---|---|
| `/improve` : analyser, planifier, déléguer, relire | `opus` | `high` | Décomposer et juger, peu de code écrit |
| `/db` : schéma Prisma, migration SQL à la main | `opus` | `xhigh` | Base de prod, reconstruction de tables SQLite, pas de retour arrière simple |
| `/new-game` : jeu complet | `opus` | `xhigh` | Long, des dizaines de fichiers et de registres tenus par des tests de cohérence |
| `/dev` : feature, bug, refacto | `opus` | `high` | Cas courant |
| `/dev` sur l'en-ligne serveur-autoritaire, l'auth, les sessions, le bannissement, la validation des API | `opus` | `xhigh` | Sécurité et triche : une erreur y passe les tests |
| `/dev` : retouche d'un fichier (texte, style Tailwind, renommage) | `sonnet` | `medium` | Mécanique |
| `/test-feature` : écrire des tests | `sonnet` | `high` | Tests voisins à recopier, mais la logique testée doit être comprise |
| `/validate` : tests, lint, tsc, build, rapport | `sonnet` | `medium` | Lancer des commandes et lire leur sortie |
| Traduire des clés en `en` / `es` / `it` | `sonnet` | `medium` | Clé pour clé depuis `fr.json` |
| Chercher du code, localiser un fichier (agent `Explore`) | `haiku` | `low` | Lecture seule |
| Bug resté introuvable après deux essais en `xhigh`, concurrence SQLite, désynchro d'une partie en ligne | `fable` | `high` | Dernier recours, à annoncer à l'utilisateur (coût) |

## Ajuster
- Monter d'un cran (l'effort d'abord, le modèle ensuite) : essai précédent raté, données de prod, sécurité, plus de 5 fichiers touchés.
- Descendre d'un cran : un seul fichier, changement mécanique, modèle existant à recopier.
- Monter l'effort avant de changer de modèle : Opus en `xhigh` coûte moins que Fable et suffit le plus souvent.
- Jamais `haiku` pour du code qui part en prod, jamais sous `xhigh` pour `/db`.

## Appliquer
- Déléguer avec l'outil Agent en passant `model` et `effort` (ils priment sur le frontmatter de l'agent).
- Pas de délégation par l'outil Skill : le `model` du frontmatter d'une commande vaut jusqu'à la fin du tour, orchestrateur compris.
- Commande tapée ou routée directement (`/dev …`) : son frontmatter s'applique jusqu'au prochain message de l'utilisateur.
- `fable` : prévenir l'utilisateur avant de le lancer.

## Tâche
$ARGUMENTS

Si une tâche est donnée, répondre en une ligne : `modèle · effort · pourquoi`, d'après le tableau et les règles d'ajustement.
