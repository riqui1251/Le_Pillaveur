import { seededReactions, type ReactionCandidate } from '@/lib/online/bot-speech'
import { BLUFF_SPEECH_CAP, type BluffClientView, type BluffSpeech, type BluffSpeechKind } from './engine'

/**
 * RÉACTIONS À LA RÉVÉLATION DU GRAND BLUFF : quand la vraie réponse tombe,
 * un bot réagit à ce que LA RÉVÉLATION vient de rendre public — et à rien
 * d'autre :
 *   • gotYou : son bluff a trompé quelqu'un, il chambre un des piégés ;
 *   • fooled : il a voté le bluff d'un autre, il salue (ou maudit) l'auteur ;
 *   • found : il a trouvé la vraie réponse, il nargue un humain qui s'est
 *     fait avoir ;
 *   • bravo : il n'y est pour rien, il félicite l'humain dont le bluff a
 *     trompé le plus de monde (deux au moins, seul en tête).
 *
 * DÉRIVÉES, JAMAIS ÉCRITES : aucune action, aucun tick. Tout se lit sur la
 * vue publique (lastReveal, le fil `speech`, les noms des bots) et une graine
 * tirée de la manche : chaque téléphone et la TV calculent les mêmes bulles.
 * Deux réactions au plus, priorité à celles qui visent un humain ; chacune
 * dans le plafond de la manche de son bot (seededReactions). Rien sans humain
 * encore à table, ni cible partie.
 */

/** Réactions max à une révélation. */
export const BLUFF_REVEAL_REACTIONS_MAX = 2
/** Piégés qu'il faut à un bluff humain pour qu'un bot témoin le félicite. */
export const BLUFF_BRAVO_MIN_FOOLED = 2

/** Ce que les réactions lisent : rien que du public, le même pour chaque téléphone et la TV. */
export type BluffReactionView = Pick<BluffClientView, 'phase' | 'promptIdx' | 'lastReveal' | 'speech'> & {
  players: readonly { id: string; name: string; isBot: boolean; leftAt: number | null }[]
}

export function bluffRevealReactions(view: BluffReactionView): BluffSpeech[] {
  const reveal = view.lastReveal
  if (view.phase !== 'reveal' || !reveal) return []
  const seated = view.players.filter((p) => !p.leftAt)
  const seatedIds = new Set(seated.map((p) => p.id))
  const isHuman = (id: string | null) => seated.some((p) => p.id === id && !p.isBot)
  if (!seated.some((p) => !p.isBot)) return []

  const round = view.promptIdx
  const fakes = reveal.candidates.filter((c) => !c.isReal && c.authorId)
  const fooledBy = (id: string) => fakes.find((c) => c.votes.includes(id))
  // Le meilleur bluff humain de la manche, seul en tête et assez voté pour qu'on le salue.
  const most = Math.max(0, ...fakes.map((c) => c.votes.length))
  const topFakes = fakes.filter((c) => c.votes.length === most)
  const star = most >= BLUFF_BRAVO_MIN_FOOLED && topFakes.length === 1 && isHuman(topFakes[0].authorId) ? topFakes[0] : null
  const fooledHumans = seated.filter((p) => !p.isBot && fooledBy(p.id))

  const candidates: ReactionCandidate<BluffSpeechKind>[] = []
  const add = (playerId: string, kind: BluffSpeechKind, targetId: string | null | undefined) => {
    if (!targetId || targetId === playerId || !seatedIds.has(targetId)) return
    candidates.push({ speech: { playerId, kind, targetId, round }, aimsHuman: isHuman(targetId) })
  }
  for (const bot of seated.filter((p) => p.isBot)) {
    const mine = fakes.find((c) => c.authorId === bot.id)
    const fooledVoters = mine?.votes.filter((id) => seatedIds.has(id)) ?? []
    add(bot.id, 'gotYou', fooledVoters.find((id) => isHuman(id)) ?? fooledVoters[0])
    const voted = reveal.candidates.find((c) => c.votes.includes(bot.id))
    if (voted && !voted.isReal) add(bot.id, 'fooled', voted.authorId)
    if (voted?.isReal) add(bot.id, 'found', fooledHumans[0]?.id)
    if (star && voted !== star) add(bot.id, 'bravo', star.authorId)
  }

  return seededReactions({
    candidates,
    players: view.players,
    speech: view.speech ?? [],
    round,
    engineCap: BLUFF_SPEECH_CAP,
    max: BLUFF_REVEAL_REACTIONS_MAX,
    seed: `bluff#${round}#${reveal.prompt}`,
  })
}
