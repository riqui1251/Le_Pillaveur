import type { AbstractIntlMessages } from 'next-intl'
import { GAMES, getGameById } from '@/lib/games'

/**
 * Catalogue de messages par segment.
 *
 * Le layout de langue passait le catalogue ENTIER à NextIntlClientProvider :
 * 183 Ko de JSON minifié sérialisés dans le HTML de chaque page, landing et
 * règles comprises, alors que `games.<id>` (96 Ko, les textes des jeux) ne
 * sert qu'à la page de ce jeu et `supervision` (40 Ko) qu'à l'espace staff.
 * Sur un téléphone en soirée, réseau moyen, c'est du poids et du temps
 * d'analyse pour rien.
 *
 * Ce module découpe le catalogue, sans rien traduire ni rien inventer :
 * - le SOCLE (`coreMessages`) : tout sauf les textes des jeux et la
 *   supervision — c'est ce que le layout de langue fournit à toutes les pages ;
 * - une TRANCHE par segment (`gameSlice`, `supervisionSlice`, `tvSlice`) : le
 *   supplément que le layout du segment ajoute au socle (voir
 *   src/components/i18n/ClientMessages.tsx pour la fusion côté client) ;
 * - le catalogue EFFECTIF d'un segment (`gameMessages`, `supervisionMessages`,
 *   `tvMessages`) = socle + tranche : ce que les composants clients du segment
 *   voient réellement. C'est contre lui que src/i18n/messages-coverage.test.ts
 *   vérifie chaque `useTranslations('…')` atteignable depuis chaque page.
 *
 * Fonctions pures : aucune ne modifie le catalogue reçu (c'est l'objet JSON
 * importé une fois pour toutes par src/i18n/request.ts, partagé entre les
 * requêtes) — elles rendent des objets neufs dont les sous-arbres sont ceux
 * de l'original, par référence.
 */

/** Les identifiants de jeu, masqués compris : `games.<id>` est le sous-arbre de textes du jeu. */
export const GAME_IDS: readonly string[] = GAMES.map((game) => game.id)
const GAME_ID_SET: ReadonlySet<string> = new Set(GAME_IDS)

/**
 * Ce que le lobby commun (src/components/online/GameOnlineLobby.tsx) lit chez
 * CHAQUE jeu en ligne, quelle que soit la page où il est monté : les réglages
 * de table sous `lobby` — et, pour le Petit Buveur, antérieur à cette
 * convention, les niveaux de difficulté rangés sous `page`. Une page de jeu en
 * ligne embarque donc ces quelques clés des autres jeux (≈ 4 Ko en tout), pas
 * leurs textes de partie.
 */
const LOBBY_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  'petit-buveur': ['page'],
}
const DEFAULT_LOBBY_CHILDREN: readonly string[] = ['lobby']

/**
 * Sous-arbres qu'une page de jeu EMPRUNTE à un autre jeu. Dette connue : le
 * libellé « retour aux jeux » de Purple vit dans `games.1220`. On corrige la
 * tranche, pas la page — la ligne disparaît le jour où la clé rejoint
 * `games.purple`.
 */
const BORROWED_GAMES: Readonly<Record<string, readonly string[]>> = {
  purple: ['1220'],
}

/** Un nœud du catalogue (objet imbriqué) — les tableaux (étapes de tutoriel) sont des feuilles. */
function isNode(value: unknown): value is AbstractIntlMessages {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function gamesOf(all: AbstractIntlMessages): AbstractIntlMessages {
  const games = all.games
  return isNode(games) ? games : {}
}

/** Les enfants demandés d'un nœud, ou null s'il n'en a aucun. */
function pick(node: AbstractIntlMessages, children: readonly string[]): AbstractIntlMessages | null {
  const out: AbstractIntlMessages = {}
  let found = false
  for (const child of children) {
    if (child in node) {
      out[child] = node[child]
      found = true
    }
  }
  return found ? out : null
}

/**
 * Fusion de deux catalogues, nœud par nœud : `extra` l'emporte sur `base` aux
 * feuilles, les objets se combinent, les tableaux se remplacent. Ni `base` ni
 * `extra` ne sont modifiés.
 */
export function mergeMessages(base: AbstractIntlMessages, extra: AbstractIntlMessages): AbstractIntlMessages {
  const out: AbstractIntlMessages = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key]
    out[key] = isNode(current) && isNode(value) ? mergeMessages(current, value) : value
  }
  return out
}

/**
 * Le socle : tout le catalogue SAUF `supervision` et SAUF les `games.<id>` des
 * jeux. `games.catalog`, `games.meta` et tout autre enfant de `games` qui
 * n'est pas un identifiant de jeu restent : le hub, la navbar et les pages
 * serveur en lisent les titres.
 */
export function coreMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  const { supervision: _supervision, games, ...rest } = all
  void _supervision
  if (!isNode(games)) return rest
  const shared: AbstractIntlMessages = {}
  for (const [key, value] of Object.entries(games)) {
    if (!GAME_ID_SET.has(key)) shared[key] = value
  }
  return { ...rest, games: shared }
}

/**
 * La tranche d'une page de jeu : `games.<id>`, plus, si le jeu se joue en
 * ligne, ce que le lobby commun lit chez les autres jeux, plus les emprunts
 * déclarés. Rien d'autre — le socle vient du layout de langue.
 */
export function gameSlice(all: AbstractIntlMessages, gameId: string): AbstractIntlMessages {
  const games = gamesOf(all)
  const slice: AbstractIntlMessages = {}

  const own = games[gameId]
  if (isNode(own)) slice[gameId] = own

  if (getGameById(gameId)?.onlineReady) {
    for (const id of GAME_IDS) {
      if (id === gameId) continue
      const other = games[id]
      if (!isNode(other)) continue
      const shared = pick(other, LOBBY_CHILDREN[id] ?? DEFAULT_LOBBY_CHILDREN)
      if (shared) slice[id] = shared
    }
  }

  // Après le lobby : un jeu emprunté entier remplace ses seules clés de lobby.
  for (const id of BORROWED_GAMES[gameId] ?? []) {
    const borrowed = games[id]
    if (isNode(borrowed)) slice[id] = borrowed
  }

  return { games: slice }
}

/** La tranche de l'espace staff : `supervision` seul. */
export function supervisionSlice(all: AbstractIntlMessages): AbstractIntlMessages {
  return isNode(all.supervision) ? { supervision: all.supervision } : {}
}

/** La tranche de l'écran TV : les textes de TOUS les jeux — il affiche n'importe lequel. */
export function tvSlice(all: AbstractIntlMessages): AbstractIntlMessages {
  const games = gamesOf(all)
  const slice: AbstractIntlMessages = {}
  for (const id of GAME_IDS) {
    if (isNode(games[id])) slice[id] = games[id]
  }
  return { games: slice }
}

/** Catalogue effectif d'une page de jeu : socle + tranche du jeu. */
export function gameMessages(all: AbstractIntlMessages, gameId: string): AbstractIntlMessages {
  return mergeMessages(coreMessages(all), gameSlice(all, gameId))
}

/** Catalogue effectif de l'espace staff : socle + supervision. */
export function supervisionMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  return mergeMessages(coreMessages(all), supervisionSlice(all))
}

/** Catalogue effectif de l'écran TV : socle + tous les jeux. */
export function tvMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  return mergeMessages(coreMessages(all), tvSlice(all))
}
