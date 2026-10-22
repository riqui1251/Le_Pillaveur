import { personaForBotName, type BotTraits } from '@/lib/online/bot-personas'
import { pick, type SpeechMove } from '@/lib/online/bot-speech'
import { DIL_SAY_KINDS, DIL_SPEECH_CAP, type DilClientView, type DilSpeechKind } from './engine'

/**
 * PAROLES DES BOTS DE DILEMMES : une bulle au plus, portée par le vote du bot
 * et écrite dans la même réduction — aucun tick de plus.
 *
 * Le vote reste SECRET jusqu'à la révélation : aucun kind ne dit ce que le
 * bot a choisi, ni ne vise quelqu'un d'une façon qui le laisserait deviner.
 * Le planificateur ne lit que la vue CLIENT du bot — la carte, qui a déjà
 * voté (jamais quoi), le fil —, jamais son propre choix : la bulle ne peut
 * donc pas le trahir. Le ton suit le trait :
 *   • l'agressif tranche (easy), la prudente et le suiveur hésitent (tough),
 *     le farceur dit l'un ou l'autre au gré de son audace ;
 *   • sur un « Je n'ai jamais », les audacieux taquinent un humain (confess,
 *     sous audace/2) — une taquinerie au hasard, pas une information.
 * La bulle vise un humain qui n'a pas encore voté de préférence.
 *
 * Sobriété : une bulle de bot par manche pendant le vote — Dilemmes enchaîne
 * vite les cartes —, min(2, bavardage) par bot réactions comprises, et la
 * chance de parler croît avec le bavardage. Personne ne parle sans humain à
 * table, ni un converti. Les bots ne lisent jamais le fil.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler avec son vote, par point de bavardage. */
export const DIL_TALK_PER_BAVARDAGE = 1 / 6
/** Bulles de bots max pendant le vote, par manche. */
export const DIL_VOTE_TALK_MAX = 1

export type DilSayMove = SpeechMove<DilSpeechKind>

function voteTone(traits: BotTraits, rand: () => number): 'easy' | 'tough' {
  switch (traits.trait) {
    case 'agressif':
      return 'easy'
    case 'farceur':
      return rand() < traits.audace ? 'easy' : 'tough'
    case 'prudent':
    case 'suiveur':
    default:
      return 'tough'
  }
}

/** La parole jointe au vote du bot `botId`, ou null. `view` est SA vue client, avant son vote. */
export function dilBotSay(view: DilClientView, botId: string, traits: BotTraits, rand: () => number): DilSayMove | null {
  if (view.phase !== 'vote' || !view.card) return null
  const me = view.players.find((p) => p.id === botId)
  if (!me?.isBot || me.leftAt || !personaForBotName(me.name)) return null
  const humans = view.players.filter((p) => !p.isBot && !p.leftAt)
  if (humans.length === 0) return null

  const roundSpeech = (view.speech ?? []).filter((sp) => sp.round === view.round)
  if (roundSpeech.filter((sp) => sp.playerId === botId).length >= Math.min(DIL_SPEECH_CAP, traits.bavardage)) return null
  if (roundSpeech.filter((sp) => DIL_SAY_KINDS.includes(sp.kind)).length >= DIL_VOTE_TALK_MAX) return null
  if (!(rand() < traits.bavardage * DIL_TALK_PER_BAVARDAGE)) return null

  const voting = humans.filter((h) => !h.hasVoted)
  const target = pick(voting.length > 0 ? voting : humans, rand).id
  if (view.card.kind === 'never' && rand() < traits.audace / 2) return { playerId: botId, kind: 'confess', targetId: target }
  return { playerId: botId, kind: voteTone(traits, rand), targetId: target }
}
