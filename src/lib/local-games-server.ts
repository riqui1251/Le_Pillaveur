import { prisma } from '@/lib/prisma'
import { parisDayString } from '@/lib/paris-time'
import {
  LOCAL_DRINKS_EVENT,
  LOCAL_DRINKS_MAX_CORRECTION,
  LOCAL_DRINKS_MAX_PER_PLAY,
  LOCAL_DRINKS_MAX_PLAYS,
  isLocalGameEvent,
  isMeasuredLocalGameId,
  type LocalDrinksReport,
  type LocalGameReport,
} from '@/lib/local-game-beacon'

/**
 * Compteurs AGRÉGÉS des parties locales (LocalGameDaily) — côté serveur.
 *
 * Une ligne par (jour de Paris, jeu), deux entiers : parties lancées et
 * parties arrivées à leur écran de fin. Rien ne relie un compteur à qui que
 * ce soit : la route n'écrit ni compte, ni visiteur, ni IP (l'adresse ne sert
 * qu'à la clé de quota, en mémoire). Le nombre de lignes est borné par
 * construction (jours × jeux locaux du catalogue, purgées à 13 mois par
 * retention-sweep.ts) : un script ne peut pas faire grossir la table, au plus
 * fausser des compteurs — d'où les quotas de la route.
 *
 * Lecture et agrégats pour la Supervision : supervision-overview-server.ts.
 *
 * Le relevé des gorgées (`event: 'drinks'`) arrive par la même route mais
 * s'écrit ailleurs : GameDrinkDaily, mode 'local' (game-drinks-server.ts).
 */

/**
 * Corps reçu → rapport, ou null s'il est hors contrat. Strict, comme les
 * autres routes publiques : un champ en trop n'est pas grave, mais un jeu
 * inconnu, un jeu en ligne uniquement ou un événement inconnu sont refusés,
 * pas réparés — sans quoi n'importe quelle chaîne deviendrait une ligne.
 */
export function parseLocalGameReport(body: unknown): LocalGameReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { gameId, event } = body as Record<string, unknown>
  if (!isMeasuredLocalGameId(gameId) || !isLocalGameEvent(event)) return null
  return { gameId, event }
}

/**
 * Corps reçu → relevé des gorgées (`event: 'drinks'`), ou null. Même rigueur
 * que parseLocalGameReport : jeu LOCAL du catalogue, puis l'une des deux
 * formes du contrat (local-game-beacon.ts) :
 * - une partie : participations entières de 1 à LOCAL_DRINKS_MAX_PLAYS,
 *   gorgées entières de 0 à LOCAL_DRINKS_MAX_PER_PLAY par participation ;
 * - une correction : 0 participation, gorgées entières de 1 à
 *   LOCAL_DRINKS_MAX_CORRECTION.
 * Hors bornes, refusé et non écrêté : le téléphone découpe et écrête déjà
 * (local-drink-tally.ts), un relevé hors bornes ne vient donc pas de lui.
 */
export function parseLocalDrinksReport(body: unknown): LocalDrinksReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { gameId, event, drinks, plays } = body as Record<string, unknown>
  if (event !== LOCAL_DRINKS_EVENT || !isMeasuredLocalGameId(gameId)) return null
  if (typeof plays !== 'number' || !Number.isInteger(plays) || plays < 0 || plays > LOCAL_DRINKS_MAX_PLAYS) return null
  if (typeof drinks !== 'number' || !Number.isInteger(drinks)) return null
  const [min, max] = plays === 0 ? [1, LOCAL_DRINKS_MAX_CORRECTION] : [0, LOCAL_DRINKS_MAX_PER_PLAY * plays]
  if (drinks < min || drinks > max) return null
  return { gameId, event, drinks, plays }
}

/** Violation d'unicité Prisma (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

/**
 * Incrémente le compteur du jour de Paris de l'événement, comme le journal
 * des parties en ligne : une partie lancée à 0 h 30 compte pour le jour qui
 * commence, quel que soit le fuseau du conteneur (UTC en production).
 *
 * Un upsert : la première partie du jour d'un jeu crée la ligne. Deux
 * premières parties simultanées (deux tables) peuvent se disputer la
 * création ; la perdante lève P2002 et repasse UNE fois — la ligne existe
 * alors, c'est l'incrément qui s'applique.
 */
export async function recordLocalGameEvent(report: LocalGameReport, now: Date = new Date()): Promise<void> {
  const day = parisDayString(now)
  const start = report.event === 'start'
  const write = () =>
    prisma.localGameDaily.upsert({
      where: { day_gameId: { day, gameId: report.gameId } },
      create: { day, gameId: report.gameId, starts: start ? 1 : 0, ends: start ? 0 : 1 },
      update: start ? { starts: { increment: 1 } } : { ends: { increment: 1 } },
    })
  try {
    await write()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    await write()
  }
}
