import { botTickDelayMs } from '@/lib/online/bot-personas'
import type { ImposteurPhase } from './engine'

/**
 * Délai du tick « bot » de l'Imposteur, PARTAGÉ par le client
 * (ImposteurOnline → useBotReferee, rand = Math.random) et par le filet
 * serveur (serviceTick du registre, rand = borne haute) : les deux doivent
 * calculer la même chose, seul le tirage diffère. Pur, sans données — un
 * composant client l'importe.
 *
 *   • révélation menée par un bot : 3,2 s de lecture ;
 *   • indice d'un bot au tour : le tempo de son persona ;
 *   • sinon, un bot vivant à table pendant les indices ou le vote : tick « au
 *     cas où » de 2,5 à 5,5 s (une réaction, une annonce, le vote groupé…) —
 *     le serveur répond NOT_BOT_TURN quand aucun bot n'a rien à faire, comme
 *     au Loup-Garou ;
 *   • sinon null : aucun bot n'a la main.
 */

export const IMPOSTEUR_REVEAL_BOT_TICK_MS = 3200
export const IMPOSTEUR_SPEECH_TICK_MIN_MS = 2500
export const IMPOSTEUR_SPEECH_TICK_SPAN_MS = 3000

export type ImposteurBotTickInput = {
  phase: ImposteurPhase
  /** L'acteur courant (donneur d'indice, meneur de la révélation) est un bot. */
  actorIsBot: boolean
  actorName: string | null | undefined
  /** Un bot non éliminé est assis à table. */
  hasAliveBot: boolean
}

export function imposteurBotTickDelayMs(
  { phase, actorIsBot, actorName, hasAliveBot }: ImposteurBotTickInput,
  rand: () => number
): number | null {
  if (phase === 'reveal') return actorIsBot ? IMPOSTEUR_REVEAL_BOT_TICK_MS : null
  if (phase !== 'clue' && phase !== 'vote') return null
  if (phase === 'clue' && actorIsBot) return botTickDelayMs(actorName, rand)
  return hasAliveBot ? IMPOSTEUR_SPEECH_TICK_MIN_MS + rand() * IMPOSTEUR_SPEECH_TICK_SPAN_MS : null
}
