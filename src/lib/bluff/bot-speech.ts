import { personaForBotName, type BotTraits } from '@/lib/online/bot-personas'
import { pick, type SpeechMove } from '@/lib/online/bot-speech'
import {
  bluffSoleLeader,
  BLUFF_SAY_KINDS_OF,
  BLUFF_SPEECH_CAP,
  type BluffClientView,
  type BluffSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU GRAND BLUFF : une bulle au plus, portée par le bluff
 * ou le vote du bot et écrite dans la même réduction — aucun tick de plus.
 *
 * Ce que dit un bot ne dit RIEN de ce qui est caché : le planificateur ne lit
 * que la vue CLIENT du bot (jamais la vraie réponse, ni l'auteur d'une
 * proposition, ni le vote d'un autre), et aucun kind ne nomme un texte. Le
 * vote d'un bot est tiré au hasard : son « facile, je la connais » est du
 * bagout, au ton de son trait — l'agressif crâne, la prudente doute, le
 * farceur dit l'un ou l'autre au gré de son audace, le suiveur hésite.
 *   • au bluff : chase pique l'humain seul en tête du score (avec une
 *     probabilité égale à l'audace), sinon proud, à un humain qui écrit
 *     encore de préférence ;
 *   • au vote : sniff (« je reconnais ta plume ») vise un humain dont un
 *     bluff est en lice — public, sans dire lequel —, sinon sure / unsure, à
 *     un humain qui n'a pas encore voté de préférence.
 *
 * Sobriété : une bulle de bot au plus par phase (bluff, vote) et par manche,
 * min(2, bavardage) par bot, réactions de la révélation comprises ; la
 * chance de parler croît avec le bavardage. Personne ne parle sans humain à
 * table (rien à lire), ni un converti (il garde son pseudo humain). Les
 * phrases ne pèsent pas sur le jeu : les bots ne lisent jamais le fil.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler avec son bluff ou son vote, par point de bavardage. */
export const BLUFF_TALK_PER_BAVARDAGE = 1 / 6
/** Bulles de bots max par phase (bluff, vote) et par manche. */
export const BLUFF_PHASE_TALK_MAX = 1

export type BluffSayMove = SpeechMove<BluffSpeechKind>

const talks = (chance: number, rand: () => number) => chance > 0 && rand() < chance

/** Le ton d'un vote : du bagout, jamais une information (le vote d'un bot est au hasard). */
function voteTell(traits: BotTraits, rand: () => number): 'sure' | 'unsure' {
  switch (traits.trait) {
    case 'agressif':
      return 'sure'
    case 'farceur':
      return rand() < traits.audace ? 'sure' : 'unsure'
    case 'prudent':
    case 'suiveur':
    default:
      return 'unsure'
  }
}

/**
 * La parole jointe au bluff (phase `submit`) ou au vote (phase `vote`) du bot
 * `botId`, ou null. `view` est SA vue client, prise avant son coup.
 */
export function bluffBotSay(
  view: BluffClientView,
  botId: string,
  traits: BotTraits,
  rand: () => number
): BluffSayMove | null {
  if (view.phase !== 'submit' && view.phase !== 'vote') return null
  const me = view.players.find((p) => p.id === botId)
  if (!me?.isBot || me.leftAt || !personaForBotName(me.name)) return null
  const humans = view.players.filter((p) => !p.isBot && !p.leftAt && p.id !== botId)
  if (humans.length === 0) return null

  const round = view.promptIdx
  const roundSpeech = (view.speech ?? []).filter((sp) => sp.round === round)
  if (roundSpeech.filter((sp) => sp.playerId === botId).length >= Math.min(BLUFF_SPEECH_CAP, traits.bavardage)) {
    return null
  }
  const phaseKinds: readonly BluffSpeechKind[] =
    view.phase === 'submit' ? BLUFF_SAY_KINDS_OF.SUBMIT_FAKE : BLUFF_SAY_KINDS_OF.VOTE
  if (roundSpeech.filter((sp) => phaseKinds.includes(sp.kind)).length >= BLUFF_PHASE_TALK_MAX) return null
  if (!talks(traits.bavardage * BLUFF_TALK_PER_BAVARDAGE, rand)) return null

  const say = (kind: BluffSpeechKind, targetId: string): BluffSayMove => ({ playerId: botId, kind, targetId })

  if (view.phase === 'submit') {
    const leader = bluffSoleLeader(view.players)
    if (leader && !leader.isBot && leader.id !== botId && leader.score > me.score && rand() < traits.audace) {
      return say('chase', leader.id)
    }
    const writing = humans.filter((h) => !h.hasSubmitted)
    return say('proud', pick(writing.length > 0 ? writing : humans, rand).id)
  }

  const writers = humans.filter((h) => h.hasSubmitted)
  if (writers.length > 0 && rand() < traits.audace / 2) return say('sniff', pick(writers, rand).id)
  const kind = voteTell(traits, rand)
  const voting = humans.filter((h) => !h.hasVoted)
  return say(kind, pick(voting.length > 0 ? voting : humans, rand).id)
}
