import { personaForBotName } from '@/lib/online/bot-personas'
import { seededReactions, type ReactionCandidate } from '@/lib/online/bot-speech'
import { SF_SPEECH_CAP, type SFClientView, type SFSpeech, type SFSpeechKind } from './engine'

/**
 * RÉACTIONS AU COURONNEMENT DE SANS FILTRE : la carte couronnée et son auteur
 * deviennent publics, un bot réagit à CE fait-là, et à rien d'autre :
 *   • crown : le juge bot (table solo) salue l'auteur qu'il a couronné ;
 *   • thanks : le bot couronné remercie le juge humain ; won : couronné par un
 *     juge bot, il nargue un humain de la manche ;
 *   • bravo / robbed : un bot qui a joué sans être couronné félicite l'humain
 *     couronné, ou râle contre le juge humain — le prudent et le suiveur
 *     félicitent d'abord, l'agressif et le farceur râlent d'abord.
 *
 * DÉRIVÉES, JAMAIS ÉCRITES : tout se lit sur la vue publique (crowned, le
 * juge, qui a joué, le fil `speech`) et une graine tirée de la manche et de
 * la carte couronnée — chaque téléphone et la TV rendent les mêmes bulles.
 * Deux au plus, priorité à celles qui visent un humain, dans le plafond de
 * chaque bot (seededReactions). Rien sans couronnement ni humain à table.
 */

/** Réactions max à un couronnement. */
export const SF_REVEAL_REACTIONS_MAX = 2

/** Ce que les réactions lisent : rien que du public, le même pour chaque téléphone et la TV. */
export type SFReactionView = Pick<SFClientView, 'phase' | 'round' | 'crowned' | 'speech'> & {
  players: readonly {
    id: string
    name: string
    isBot: boolean
    leftAt: number | null
    isJudge: boolean
    hasPlayed: boolean
  }[]
}

export function sfRevealReactions(view: SFReactionView): SFSpeech[] {
  const crowned = view.crowned
  if (view.phase !== 'reveal' || !crowned) return []
  const seated = view.players.filter((p) => !p.leftAt)
  const seatedIds = new Set(seated.map((p) => p.id))
  const isHuman = (id: string | null | undefined) => seated.some((p) => p.id === id && !p.isBot)
  if (!seated.some((p) => !p.isBot)) return []

  const judge = seated.find((p) => p.isJudge)
  const humanJudge = judge && !judge.isBot ? judge : null
  const crownedHuman = isHuman(crowned.playerId)
  const round = view.round

  const candidates: ReactionCandidate<SFSpeechKind>[] = []
  const add = (playerId: string, kind: SFSpeechKind, targetId: string | null | undefined) => {
    if (!targetId || targetId === playerId || !seatedIds.has(targetId)) return
    candidates.push({ speech: { playerId, kind, targetId, round }, aimsHuman: isHuman(targetId) })
  }
  for (const bot of seated.filter((p) => p.isBot)) {
    if (bot.isJudge) {
      add(bot.id, 'crown', crowned.playerId)
    } else if (bot.id === crowned.playerId) {
      if (humanJudge) add(bot.id, 'thanks', humanJudge.id)
      else add(bot.id, 'won', seated.find((p) => !p.isBot && p.hasPlayed)?.id)
    } else if (bot.hasPlayed) {
      const trait = personaForBotName(bot.name)?.trait
      const sore = trait === 'agressif' || trait === 'farceur'
      const moves: [SFSpeechKind, string | null | undefined][] = [
        ['bravo', crownedHuman ? crowned.playerId : null],
        ['robbed', humanJudge?.id],
      ]
      for (const [kind, targetId] of sore ? moves.reverse() : moves) add(bot.id, kind, targetId)
    }
  }

  return seededReactions({
    candidates,
    players: view.players,
    speech: view.speech ?? [],
    round,
    engineCap: SF_SPEECH_CAP,
    max: SF_REVEAL_REACTIONS_MAX,
    seed: `sans-filtre#${round}#${crowned.card}`,
  })
}
