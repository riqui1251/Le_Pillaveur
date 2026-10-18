import { botTickDelayMs } from '@/lib/online/bot-personas'
import type { MenteurPhase } from './engine'

/**
 * Délai du tick « bot » du Menteur, PARTAGÉ par le client (MenteurOnline →
 * useBotReferee, rand = Math.random) et par le filet serveur (serviceTick du
 * registre, rand = borne haute) : les deux calculent la même chose, seul le
 * tirage diffère, et le serveur ne devance donc jamais un client éveillé.
 * Pur, sans données — un composant client l'importe.
 *
 *   • enchères, bot au tour : le tempo de son persona ;
 *   • révélation menée par un bot : 5 s si un humain non parti est assis
 *     (vivant ou éliminé), 2,6 s sinon ;
 *   • sinon null : aucun bot n'a la main.
 */

/**
 * 5 s et non le plancher pile (MENTEUR_REVEAL_MIN_MS = 4 s) : la marge d'au
 * moins 1 s garantit que le moteur n'oppose jamais READING_TIME au tick, même
 * à l'arrondi d'horloge près. Un tick serveur refusé passerait en skipBot et
 * figerait la révélation, qui n'a pas d'échéance.
 */
export const MENTEUR_REVEAL_BOT_TICK_MS = 5000
/** Personne à faire lire : le rythme historique d'une table de bots. */
export const MENTEUR_REVEAL_BOTS_ONLY_TICK_MS = 2600

export type MenteurBotTickInput = {
  phase: MenteurPhase
  /** L'acteur courant (enchérisseur au tour, meneur de la révélation) est un bot. */
  actorIsBot: boolean
  actorName: string | null | undefined
  /** Un humain non parti est assis, vivant ou éliminé (menteurHumanSeated). */
  humanSeated: boolean
}

export function menteurBotTickDelayMs(
  { phase, actorIsBot, actorName, humanSeated }: MenteurBotTickInput,
  rand: () => number
): number | null {
  if (!actorIsBot) return null
  if (phase === 'bidding') return botTickDelayMs(actorName, rand)
  if (phase === 'reveal') return humanSeated ? MENTEUR_REVEAL_BOT_TICK_MS : MENTEUR_REVEAL_BOTS_ONLY_TICK_MS
  return null
}
