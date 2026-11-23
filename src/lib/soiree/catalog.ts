import { GAMES, getGameById } from '@/lib/games'

/** Intensité d'un jeu dans une soirée : 1 on se chauffe, 3 ça tape. */
export type SoireeHeat = 1 | 2 | 3

/**
 * Comment un jeu remplit l'ardoise :
 * - 'auto' : le jeu remonte lui-même les gorgées de chacun à la fin
 *   (updatePlayerStats → src/lib/soiree/storage.ts) ;
 * - 'partial' : il n'en compte qu'une partie (PMU en mode libre : les
 *   gagnants distribuent à voix haute) — l'entracte propose de vérifier ;
 * - 'manual' : impossible à compter par joueur (Coupe du Roi : gorgées
 *   réglées à la table ; Doigt du Destin : doigts anonymes) — l'entracte
 *   ouvre directement la saisie.
 */
export type SoireeCounting = 'auto' | 'partial' | 'manual'

type SoireeGameMeta = { heat: SoireeHeat; minutes: number; counting: SoireeCounting }

/**
 * Les jeux qu'une soirée peut enchaîner : les jeux LOCAUX visibles (un seul
 * téléphone), sauf la Pyramide et Dégaine, écartés par l'utilisateur le
 * 22/11/2026 (Dégaine fermait chaque soirée en duel final : il n'y a plus
 * de final imposé).
 * Minutes : une partie aux réglages par défaut, arrondie — sert au total
 * annoncé du programme, pas à minuter quoi que ce soit.
 */
const SOIREE_GAME_META: Readonly<Record<string, SoireeGameMeta>> = {
  'vue-de-nez': { heat: 1, minutes: 10, counting: 'auto' },
  'pile-poil': { heat: 1, minutes: 8, counting: 'auto' },
  purple: { heat: 1, minutes: 10, counting: 'auto' },
  blackjack: { heat: 1, minutes: 12, counting: 'auto' },
  // En soirée, la manche s'arrête quand chacun a loupé deux fois (forcé par le jeu).
  'hi-lo': { heat: 2, minutes: 6, counting: 'auto' },
  'chiffre-piege': { heat: 2, minutes: 8, counting: 'auto' },
  '1220': { heat: 2, minutes: 10, counting: 'auto' },
  plinko: { heat: 2, minutes: 8, counting: 'auto' },
  'monsieur-3': { heat: 2, minutes: 10, counting: 'auto' },
  // En soirée, une seule course en mode libre (forcé par le jeu) : les gorgées se distribuent à voix haute.
  pmu: { heat: 2, minutes: 4, counting: 'manual' },
  'front-colle': { heat: 2, minutes: 12, counting: 'auto' },
  'doigt-du-destin': { heat: 2, minutes: 3, counting: 'manual' },
  'patate-chaude': { heat: 3, minutes: 8, counting: 'auto' },
  'cap-ou-pas-cap': { heat: 3, minutes: 15, counting: 'auto' },
  'coupe-du-roi': { heat: 3, minutes: 20, counting: 'manual' },
  'petit-buveur': { heat: 3, minutes: 25, counting: 'auto' },
}

/**
 * Mode Soirée : la borne des jeux sans fin naturelle, pour que chaque manche
 * se termine. L'unité est celle du jeu :
 * - Purple, Cap ou pas Cap : tours de table (chacun a la main autant de fois) ;
 * - Blackjack : mains ;
 * - 1220 : lancers ;
 * - Doigt du Destin : tirages.
 * Ailleurs : Hi-Lo a sa propre borne (HI_LO_SOIREE_MISS_LIMIT), PMU une seule
 * course, Patate Chaude perd son option « Illimité » (10 manches à la place).
 * Les tutos de soirée (soiree.tutorials.<jeu>.c) annoncent ces nombres en
 * toutes lettres : les changer ensemble.
 */
const SOIREE_GAME_CAPS: Readonly<Record<string, number>> = {
  purple: 3,
  blackjack: 5,
  '1220': 10,
  'cap-ou-pas-cap': 3,
  'doigt-du-destin': 3,
}

/** Borne du jeu en soirée (SOIREE_GAME_CAPS), null s'il se termine tout seul. */
export function soireeCap(gameId: string): number | null {
  return SOIREE_GAME_CAPS[gameId] ?? null
}

/** Dans l'ordre du catalogue (src/lib/games.ts), jeux masqués et « en ligne uniquement » exclus. */
export const SOIREE_GAME_IDS: readonly string[] = GAMES.filter(
  (game) => !game.hidden && !game.onlineOnly && game.id in SOIREE_GAME_META
).map((game) => game.id)

const SOIREE_GAME_SET: ReadonlySet<string> = new Set(SOIREE_GAME_IDS)

export function isSoireeGame(gameId: string): boolean {
  return SOIREE_GAME_SET.has(gameId)
}

export function soireeHeat(gameId: string): SoireeHeat {
  return SOIREE_GAME_META[gameId]?.heat ?? 2
}

export function soireeMinutes(gameId: string): number {
  return SOIREE_GAME_META[gameId]?.minutes ?? 10
}

export function soireeCounting(gameId: string): SoireeCounting {
  return SOIREE_GAME_META[gameId]?.counting ?? 'manual'
}

/** Les deux couleurs du jeu (src/lib/games.ts) : chaque manche a sa teinte dans la soirée. */
export function soireeGameColors(gameId: string): { from: string; to: string } {
  const game = getGameById(gameId)
  const from = game?.colorFrom ?? game?.fallbackColor ?? '#D9A441'
  return { from, to: game?.colorTo ?? from }
}

/** Joueurs qu'il faut au minimum pour lancer le jeu en local (borne de la page du jeu). */
export function soireeMinPlayers(gameId: string): number {
  return getGameById(gameId)?.localMinPlayers ?? 2
}

/** Les jeux de la soirée jouables à `playerCount` joueurs. */
export function playableSoireeGameIds(playerCount: number): string[] {
  return SOIREE_GAME_IDS.filter((id) => playerCount >= soireeMinPlayers(id))
}
