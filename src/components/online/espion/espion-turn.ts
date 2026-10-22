import { espionAskBlock, espionRoundSpeech, pendingEspionQuestion, type EspionClientView } from '@/lib/espion/engine'

export type EspionTurn =
  /** Une question attend sa réponse : c'est à l'interrogé. */
  | { kind: 'answer'; playerId: string; askerId: string }
  /** À la Spyfall, la main revient à qui vient de répondre : à lui de poser. */
  | { kind: 'ask'; playerId: string }

/**
 * Qui la table attend dans le fil des questions (tables avec bots), pour le
 * bandeau « à qui le tour » : l'interrogé tant que sa question attend, sinon
 * qui vient de répondre — s'il est toujours là et peut encore interroger
 * quelqu'un (questions épuisées, plafond de la manche). Null sinon : en début
 * de manche, ou quand plus personne n'a la main, chacun peut lancer.
 */
export function espionTurn(view: EspionClientView, now: number): EspionTurn | null {
  const pending = pendingEspionQuestion(view, now)
  if (pending) return { kind: 'answer', playerId: pending.targetId, askerId: pending.askerId }
  const lastAnswer = [...espionRoundSpeech(view)].reverse().find((sp) => sp.kind === 'answer')
  if (!lastAnswer) return null
  const holder = lastAnswer.playerId
  const active = view.players.filter((p) => !p.leftAt)
  if (!active.some((p) => p.id === holder)) return null
  const canAsk = active.some((p) => p.id !== holder && espionAskBlock(view, holder, p.id, now) === null)
  return canAsk ? { kind: 'ask', playerId: holder } : null
}
