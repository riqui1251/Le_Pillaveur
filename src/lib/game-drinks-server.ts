import { prisma } from '@/lib/prisma'
import { getGameById } from '@/lib/games'
import { parisDayOffset, parisDayString } from '@/lib/paris-time'

/**
 * « Quel jeu fait le plus boire ? » tous joueurs confondus — côté serveur.
 *
 * GameDrinkDaily : une ligne par (jour de Paris, jeu, mode), deux entiers
 * (gorgées, participations). Rien ne relie un compteur à qui que ce soit, et
 * le nombre de lignes est borné par construction (jours × jeux du catalogue ×
 * 2 modes, purgées à 13 mois par retention-sweep.ts).
 *
 * Deux sources écrivent ici, jamais en ambiance « Sans alcool » (les gorgées
 * y deviennent des gages, une partie à 0 gorgée fausserait la moyenne) :
 * - 'local' : le téléphone en fin de partie (POST /api/analytics/local-game) ;
 * - 'online' : le serveur à la fin d'une partie en ligne (état final du moteur).
 */

export const GAME_DRINK_MODES = ['local', 'online'] as const
export type GameDrinkMode = (typeof GAME_DRINK_MODES)[number]

export type GameDrinkTally = {
  gameId: string
  mode: GameDrinkMode
  /** Gorgées distribuées pendant la partie, tous joueurs confondus. */
  drinks: number
  /** Participations : une partie jouée par un joueur. */
  plays: number
}

/** Violation d'unicité Prisma (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

const isCount = (value: number) => Number.isInteger(value) && value >= 0

/**
 * Ajoute une partie aux compteurs du jour de Paris. Ignore un relevé vide
 * (ni participation ni gorgée) ou mal formé, et un jeu absent du catalogue :
 * les appelants valident déjà, ceci est le dernier rempart avant la base.
 * Des gorgées sans participation sont une correction locale arrivée après
 * le départ de sa partie (local-game-beacon.ts) : elles s'ajoutent au jour.
 *
 * Un upsert, comme LocalGameDaily : la première partie du jour d'un jeu crée
 * la ligne ; deux premières parties simultanées se disputent la création, la
 * perdante lève P2002 et repasse UNE fois — c'est alors l'incrément qui
 * s'applique.
 */
export async function recordGameDrinks(tally: GameDrinkTally, now: Date = new Date()): Promise<void> {
  const { gameId, mode, drinks, plays } = tally
  if (!getGameById(gameId) || !(GAME_DRINK_MODES as readonly string[]).includes(mode)) return
  if (!isCount(drinks) || !isCount(plays) || (plays === 0 && drinks === 0)) return
  const day = parisDayString(now)
  const write = () =>
    prisma.gameDrinkDaily.upsert({
      where: { day_gameId_mode: { day, gameId, mode } },
      create: { day, gameId, mode, drinks, plays },
      update: { drinks: { increment: drinks }, plays: { increment: plays } },
    })
  try {
    await write()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    await write()
  }
}

export type GameDrinkRankingRow = {
  gameId: string
  drinks: number
  plays: number
  /** Gorgées moyennes par joueur et par partie : ce qui classe les jeux. */
  perPlay: number
  /** Participations par mode, pour dire d'où vient le chiffre. */
  localPlays: number
  onlinePlays: number
}

/** Fenêtre du classement : 90 jours, assez pour lisser une soirée isolée. */
export const GAME_DRINK_RANKING_DAYS = 90
/**
 * En dessous, un jeu n'a pas assez de parties pour être classé. Assez haut
 * pour qu'une poignée de relevés anonymes (bornés par la route) ne suffise
 * pas à placer un jeu en tête.
 */
export const GAME_DRINK_RANKING_MIN_PLAYS = 30

/**
 * Les jeux du plus arrosé au moins arrosé sur les `days` derniers jours de
 * Paris, local et en ligne additionnés, dès `minPlays` participations. Les
 * jeux sortis du catalogue sont écartés ; le masquage depuis la Supervision
 * (game-catalog) est laissé à l'appelant, qui le connaît.
 */
export async function gameDrinkRanking(
  options: { days?: number; minPlays?: number; now?: Date } = {}
): Promise<GameDrinkRankingRow[]> {
  const { days = GAME_DRINK_RANKING_DAYS, minPlays = GAME_DRINK_RANKING_MIN_PLAYS, now = new Date() } = options
  // `days` jours de Paris, aujourd'hui compris (parisDayOffset : positif = passé).
  const since = parisDayOffset(days - 1, now)
  const rows = await prisma.gameDrinkDaily.findMany({
    where: { day: { gte: since } },
    select: { gameId: true, mode: true, drinks: true, plays: true },
  })
  const byGame = new Map<string, GameDrinkRankingRow>()
  for (const row of rows) {
    if (!getGameById(row.gameId)) continue
    const acc = byGame.get(row.gameId) ?? { gameId: row.gameId, drinks: 0, plays: 0, perPlay: 0, localPlays: 0, onlinePlays: 0 }
    acc.drinks += row.drinks
    acc.plays += row.plays
    if (row.mode === 'online') acc.onlinePlays += row.plays
    else acc.localPlays += row.plays
    byGame.set(row.gameId, acc)
  }
  return [...byGame.values()]
    // Aucune gorgée en 90 jours = jeu qui ne les enregistre pas (Coupe du
    // Roi, Pyramide, Roue…), pas un jeu sobre : il sortirait faussement dernier.
    .filter((row) => row.plays >= minPlays && row.drinks > 0)
    .map((row) => ({ ...row, perPlay: row.drinks / row.plays }))
    .sort((a, b) => b.perPlay - a.perPlay || b.drinks - a.drinks || a.gameId.localeCompare(b.gameId))
}
