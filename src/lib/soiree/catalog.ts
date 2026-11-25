import { GAMES, getGameById, type GameDrinkLevel } from '@/lib/games'

/** Intensité d'un jeu dans une soirée : 1 on se chauffe, 3 ça tape. C'est le barème « Fait boire » du jeu (GameMeta.drinkLevel). */
export type SoireeHeat = GameDrinkLevel

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

type SoireeGameMeta = { minutes: number; counting: SoireeCounting }

/**
 * Fiches des jeux de la liste PAR DÉFAUT d'une soirée : les jeux LOCAUX visibles
 * (un seul téléphone), sauf la Pyramide et Dégaine, écartés par l'utilisateur le
 * 22/11/2026 (Dégaine fermait chaque soirée en duel final : il n'y a plus
 * de final imposé). L'équipe peut ensuite ajouter un jeu : ceux de SOIREE_EXTRA_META ont
 * leur fiche, les autres prennent les défauts de soireeMinutes et soireeCounting.
 * Minutes : une partie aux réglages par défaut, arrondie — sert au total
 * annoncé du programme, pas à minuter quoi que ce soit.
 */
const SOIREE_GAME_META: Readonly<Record<string, SoireeGameMeta>> = {
  'vue-de-nez': { minutes: 10, counting: 'auto' },
  'pile-poil': { minutes: 8, counting: 'auto' },
  purple: { minutes: 10, counting: 'auto' },
  blackjack: { minutes: 12, counting: 'auto' },
  // En soirée, la manche s'arrête quand chacun a loupé deux fois (forcé par le jeu).
  'hi-lo': { minutes: 6, counting: 'auto' },
  'chiffre-piege': { minutes: 8, counting: 'auto' },
  '1220': { minutes: 10, counting: 'auto' },
  plinko: { minutes: 8, counting: 'auto' },
  'monsieur-3': { minutes: 10, counting: 'auto' },
  // En soirée, une seule course en mode libre (forcé par le jeu) : les gorgées se distribuent à voix haute.
  pmu: { minutes: 4, counting: 'manual' },
  'front-colle': { minutes: 12, counting: 'auto' },
  'doigt-du-destin': { minutes: 3, counting: 'manual' },
  'patate-chaude': { minutes: 8, counting: 'auto' },
  'cap-ou-pas-cap': { minutes: 15, counting: 'auto' },
  'coupe-du-roi': { minutes: 20, counting: 'manual' },
  'petit-buveur': { minutes: 25, counting: 'auto' },
}

/**
 * Fiches des jeux que l'équipe peut AJOUTER à la Soirée sans qu'ils soient dans
 * la liste par défaut : ils n'entrent donc pas dans SOIREE_GAME_IDS. Sans elles
 * l'ardoise les annoncerait « à saisir » alors que Dégaine remonte lui-même
 * parties, victoires et gorgées ; la Pyramide, elle, ne remonte que la partie.
 */
const SOIREE_EXTRA_META: Readonly<Record<string, SoireeGameMeta>> = {
  degaine: { minutes: 8, counting: 'auto' },
  pyramide: { minutes: 10, counting: 'manual' },
}

function soireeMeta(gameId: string): SoireeGameMeta | undefined {
  return SOIREE_GAME_META[gameId] ?? SOIREE_EXTRA_META[gameId]
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

/**
 * Les jeux que l'équipe peut ajouter à la Soirée ou en sortir : tout jeu du
 * catalogue que le code n'a pas retiré et qui se joue sur un seul téléphone,
 * Pyramide et Dégaine compris (écartés par défaut, pas interdits). Ordre du catalogue.
 */
export const SOIREE_CANDIDATE_IDS: readonly string[] = GAMES.filter((game) => !game.hidden && !game.onlineOnly).map(
  (game) => game.id
)

const SOIREE_CANDIDATE_SET: ReadonlySet<string> = new Set(SOIREE_CANDIDATE_IDS)

export function isSoireeCandidate(gameId: string): boolean {
  return SOIREE_CANDIDATE_SET.has(gameId)
}

/** La liste PAR DÉFAUT du code, dans l'ordre du catalogue (src/lib/games.ts) : les candidats qui ont une fiche. */
export const SOIREE_GAME_IDS: readonly string[] = SOIREE_CANDIDATE_IDS.filter((id) => id in SOIREE_GAME_META)

const SOIREE_GAME_SET: ReadonlySet<string> = new Set(SOIREE_GAME_IDS)

/** Un jeu de la liste par défaut du code ; la liste effective passe par soireeGameIdsWith. */
export function isSoireeGame(gameId: string): boolean {
  return SOIREE_GAME_SET.has(gameId)
}

/**
 * La liste effective de la Soirée : les candidats retenus, dans l'ordre du
 * catalogue. `overrides` = les écarts de l'équipe au défaut du code (id → ajouté
 * ou sorti) ; un id qui n'est pas candidat est ignoré.
 */
export function soireeGameIdsWith(overrides: Readonly<Record<string, boolean>>): string[] {
  return SOIREE_CANDIDATE_IDS.filter((id) => overrides[id] ?? SOIREE_GAME_SET.has(id))
}

/**
 * Intensité de départ d'un jeu : son niveau « Fait boire » du code. Le réglage
 * de l'équipe (Supervision) passe par `heatOf`, voir buildProgram.
 */
export function soireeHeat(gameId: string): SoireeHeat {
  return getGameById(gameId)?.drinkLevel ?? 2
}

export function soireeMinutes(gameId: string): number {
  return soireeMeta(gameId)?.minutes ?? 10
}

export function soireeCounting(gameId: string): SoireeCounting {
  return soireeMeta(gameId)?.counting ?? 'manual'
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

/**
 * Les jeux de la soirée jouables à `playerCount` joueurs, hors ceux que l'équipe a cachés (`hiddenIds`).
 * `soireeIds` : la liste effective (soireeGameIdsWith), par défaut celle du code.
 */
export function playableSoireeGameIds(
  playerCount: number,
  hiddenIds: readonly string[] = [],
  soireeIds: readonly string[] = SOIREE_GAME_IDS
): string[] {
  return soireeIds.filter((id) => playerCount >= soireeMinPlayers(id) && !hiddenIds.includes(id))
}
