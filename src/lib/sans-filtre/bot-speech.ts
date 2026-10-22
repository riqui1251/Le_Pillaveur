import { personaForBotName, type BotTraits } from '@/lib/online/bot-personas'
import { pick, type SpeechMove } from '@/lib/online/bot-speech'
import { sfSoleCrownLeader, SF_SAY_KINDS, SF_SPEECH_CAP, type SFClientView, type SFSpeechKind } from './engine'

/**
 * PAROLES DES BOTS DE SANS FILTRE : une bulle au plus, portée par la carte
 * que le bot abat et écrite dans la même réduction — aucun tick de plus.
 *
 * Ce que dit un bot ne trahit RIEN : le planificateur ne lit que la vue
 * CLIENT du bot (jamais la main d'un autre ni l'auteur d'une réponse), et
 * aucune phrase ne cite sa carte — le juge ne peut pas la reconnaître parmi
 * les réponses anonymes.
 *   • juge humain : le bot lui vend sa carte (pitch) ou, au gré de son
 *     audace, tente un pot-de-vin pour rire (bribe) ;
 *   • juge bot (table solo, où les bots jugent aussi) : il chambre un humain
 *     de la manche (rival) — une bulle à un juge bot ne parlerait à personne ;
 *   • dans les deux cas, l'humain seul en tête aux couronnes, devant lui, se
 *     fait piquer (chase) avec une probabilité égale à son audace.
 *
 * Sobriété : une bulle de bot par manche pendant l'abattage, min(2,
 * bavardage) par bot réactions comprises, et la chance de parler croît avec
 * le bavardage. Personne ne parle sans humain à table, ni un converti. Les
 * bots ne lisent jamais le fil : le jeu n'en dépend pas.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler avec sa carte, par point de bavardage. */
export const SF_TALK_PER_BAVARDAGE = 1 / 6
/** Bulles de bots max pendant l'abattage, par manche. */
export const SF_SUBMIT_TALK_MAX = 1

export type SFSayMove = SpeechMove<SFSpeechKind>

/** La parole jointe à la carte que le bot `botId` abat, ou null. `view` est SA vue client, avant son coup. */
export function sfBotSay(view: SFClientView, botId: string, traits: BotTraits, rand: () => number): SFSayMove | null {
  if (view.phase !== 'submit') return null
  const me = view.players.find((p) => p.id === botId)
  if (!me?.isBot || me.leftAt || me.isJudge || !personaForBotName(me.name)) return null
  const humans = view.players.filter((p) => !p.isBot && !p.leftAt)
  if (humans.length === 0) return null

  const roundSpeech = (view.speech ?? []).filter((sp) => sp.round === view.round)
  if (roundSpeech.filter((sp) => sp.playerId === botId).length >= Math.min(SF_SPEECH_CAP, traits.bavardage)) return null
  if (roundSpeech.filter((sp) => SF_SAY_KINDS.includes(sp.kind)).length >= SF_SUBMIT_TALK_MAX) return null
  if (!(rand() < traits.bavardage * SF_TALK_PER_BAVARDAGE)) return null

  const say = (kind: SFSpeechKind, targetId: string): SFSayMove => ({ playerId: botId, kind, targetId })
  const leader = sfSoleCrownLeader(view.players)
  if (leader && !leader.isBot && leader.id !== botId && leader.crowns > me.crowns && rand() < traits.audace) {
    return say('chase', leader.id)
  }
  const judge = view.players.find((p) => p.isJudge && !p.leftAt)
  if (judge && !judge.isBot) return say(rand() < traits.audace / 2 ? 'bribe' : 'pitch', judge.id)
  const rivals = humans.filter((h) => !h.isJudge)
  if (rivals.length === 0) return null
  const waiting = rivals.filter((h) => !h.hasPlayed)
  return say('rival', pick(waiting.length > 0 ? waiting : rivals, rand).id)
}
