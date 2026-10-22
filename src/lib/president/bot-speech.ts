import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
import {
  preIsJoker,
  preLastPlayRank,
  preRankOf,
  PRE_SPEECH_CAP,
  PRE_TWO,
  type PreClientView,
  type PreSay,
  type PreSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU PRÉSIDENT : au plus une bulle par coup (deux à la fin
 * d'une manche), écrite dans la même écriture que le coup qui la provoque —
 * celui d'un bot comme celui d'un humain. Aucun tick de plus. Le dé et le
 * plafond sont ceux des jeux à réactions (reaction-speech.ts : reactionSay).
 *
 * ANTI-FUITE : le planificateur ne lit que la vue PUBLIQUE (la vue spectateur
 * du moteur : mains réduites à un compte, cartes d'échange vides) et le coup
 * qui vient d'être joué, cartes posées sur le tapis. Il ne voit aucune main :
 * aucune parole ne peut dire vrai sur ce qu'un bot garde en main. Les phrases
 * (catalogue games.president.game) ne parlent que de ce que la table a vu.
 *
 *   • le coup d'un bot : out (il vide sa main), close (carré fermé hors
 *     tour), cut (son 2 coupe la pose d'un autre), brag (brelan ou carré),
 *     ouRien (pose égale) — un seul, dans cet ordre ;
 *   • la victime d'un 2 ou d'une fermeture râle (grumble), sa rancune aidant ;
 *   • fin de manche : le Trou boude (sulk), on chambre le Trou (mockTrou :
 *     le Président d'abord, les agressifs et les farceurs ensuite) ou on
 *     salue le Président (hail : les suiveurs et les prudents).
 * Une réaction qui vise un humain passe devant : c'est elle qu'il vient lire.
 *
 * Sobriété : une option par orateur possible, un dé de parole chacune
 * (PRE_TALK à bavardage 2, bonus de trait), plafond min(2, bavardage) par
 * bot et par manche ; le premier qui parle clôt le coup. Une table sans
 * humain présent se tait. Les bots ne lisent jamais le fil.
 *
 * PUR : `rand` injecté.
 */

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const PRE_TALK: Record<PreSpeechKind, number> = {
  out: 0.4,
  close: 0.4,
  cut: 0.3,
  brag: 0.3,
  ouRien: 0.16,
  grumble: 0.2,
  hail: 0.3,
  mockTrou: 0.3,
  sulk: 0.3,
}
/** Remarques max à la fin d'une manche (deux auteurs différents). */
export const PRE_END_REMARKS_MAX = 2

/** Ce que le planificateur lit : la vue spectateur (aucune main, aucune carte d'échange). */
export type PrePublicView = Pick<
  PreClientView,
  'phase' | 'manche' | 'players' | 'currentTurnId' | 'lastPlay' | 'outOrder' | 'lastRanking' | 'speech'
>

/** Le coup qui vient d'être joué : cartes posées, donc publiques. */
export type PreSpeechEvent =
  | { type: 'play'; playerId: string; cards: readonly number[] }
  | { type: 'close'; playerId: string; cards: readonly number[] }

type Seat = SpeechPlayer & { handCount: number }
type Option = ReactionOption<PreSpeechKind, Seat>

/** La chance de base d'un orateur DÉSIGNÉ, teintée de son caractère : l'agressif coupe, le rancunier râle. */
export function preTalkBase(kind: PreSpeechKind, traits: BotTraits): number {
  let base = PRE_TALK[kind]
  if (kind === 'cut' && traits.trait === 'agressif') base += 0.3
  if (kind === 'ouRien' && (traits.trait === 'farceur' || traits.trait === 'agressif')) base += 0.2
  if (kind === 'grumble' || kind === 'sulk') base += 0.6 * traits.rancune
  return base
}

/** Le prochain joueur encore en course après `fromId` dans l'ordre de table (lui exclu). */
function nextInRace(view: PrePublicView, fromId: string): string | null {
  const n = view.players.length
  const at = view.players.findIndex((p) => p.id === fromId)
  if (at < 0) return null
  for (let step = 1; step < n; step += 1) {
    const p = view.players[(at + step) % n]
    if (!p.leftAt && p.handCount > 0) return p.id
  }
  return null
}

/** Qui doit répondre à la pose : le joueur au tour, ou le suivant en course si le poseur remène. */
function answerer(after: PrePublicView, actorId: string): string | null {
  const turn = after.currentTurnId
  return turn && turn !== actorId ? turn : nextInRace(after, actorId)
}

/** Celui qui garde le plus de cartes (comptes publics), lui exclu ; égalité : ordre de table. */
function mostCards(view: PrePublicView, exceptId: string): string | null {
  let best: { id: string; count: number } | null = null
  for (const p of view.players) {
    if (p.id === exceptId || p.leftAt || p.handCount === 0) continue
    if (!best || p.handCount > best.count) best = { id: p.id, count: p.handCount }
  }
  return best?.id ?? null
}

/**
 * Les paroles à joindre à la transition `before` → `after` (vues publiques),
 * provoquée par `event` (null : passe, minuteur, continuer). Au plus une
 * parole pour un coup, PRE_END_REMARKS_MAX à la fin d'une manche.
 */
export function presidentBotSpeech(
  before: PrePublicView,
  after: PrePublicView,
  event: PreSpeechEvent | null,
  rand: () => number
): PreSay[] {
  const seats: Seat[] = after.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    handCount: p.handCount,
  }))
  const table = readReactionTable<PreSpeechKind, Seat>(seats, after.speech ?? [], after.manche, PRE_SPEECH_CAP)
  /** L'option d'un orateur désigné (l'auteur du coup, sa victime, le Trou…). */
  const own = (playerId: string, kind: PreSpeechKind, targetId: string | null): Option | null => {
    const speaker = table.byId.get(playerId)
    if (!speaker || !targetId) return null
    return { speakers: [speaker], kind, targetId, base: preTalkBase(kind, table.traits(speaker)) }
  }
  const aimsHuman = (o: Option) =>
    typeof o.targetId === 'string' && table.byId.get(o.targetId)?.isBot === false ? 1 : 0
  // Tri stable : l'humain visé d'abord, sinon l'ordre de la règle.
  const ordered = (options: (Option | null)[]) =>
    options.filter((o): o is Option => o !== null).sort((a, b) => aimsHuman(b) - aimsHuman(a))

  const mancheEnded = before.phase === 'playing' && (after.phase === 'interlude' || after.phase === 'finished')
  if (mancheEnded) {
    const options = ordered(endRemarks(after, table.bots, own))
    const said: PreSay[] = []
    for (let i = 0; i < PRE_END_REMARKS_MAX; i += 1) {
      const spoke = new Set(said.map((s) => s.playerId))
      const left = options
        .map((o) => ({ ...o, speakers: o.speakers.filter((b) => !spoke.has(b.id)) }))
        .filter((o) => o.speakers.length > 0)
      const say = reactionSay(table, left, Infinity, rand)
      if (!say?.targetId) break
      said.push({ playerId: say.playerId, kind: say.kind, targetId: say.targetId })
    }
    return said
  }
  if (!event) return []
  const say = reactionSay(table, ordered(moveReactions(before, after, event, own)), Infinity, rand)
  return say?.targetId ? [{ playerId: say.playerId, kind: say.kind, targetId: say.targetId }] : []
}

type OwnOption = (playerId: string, kind: PreSpeechKind, targetId: string | null) => Option | null

/** Le coup d'un bot (une parole au plus, la plus marquante), puis la victime d'un 2 ou d'une fermeture. */
function moveReactions(
  before: PrePublicView,
  after: PrePublicView,
  event: PreSpeechEvent,
  own: OwnOption
): (Option | null)[] {
  const actorId = event.playerId
  const covered = before.lastPlay
  const naturals = event.cards.filter((c) => !preIsJoker(c))
  // Jokers seuls : ils copient la pose recouverte (rang du pli).
  const rank = naturals.length > 0 ? preRankOf(naturals[0]) : covered ? preLastPlayRank(covered) : 0
  const victimId = covered && covered.playerId !== actorId ? covered.playerId : null
  const wentOut = after.outOrder.includes(actorId) && !before.outOrder.includes(actorId)
  const cut = event.type === 'play' && rank === PRE_TWO && victimId !== null

  const mine = wentOut
    ? own(actorId, 'out', mostCards(after, actorId))
    : event.type === 'close'
      ? own(actorId, 'close', victimId)
      : cut
        ? own(actorId, 'cut', victimId)
        : event.cards.length >= 3
          ? own(actorId, 'brag', answerer(after, actorId))
          : covered && rank === preLastPlayRank(covered)
            ? own(actorId, 'ouRien', answerer(after, actorId))
            : null
  const grumble = victimId && (cut || event.type === 'close') ? own(victimId, 'grumble', actorId) : null
  return [mine, grumble]
}

/** Fin de manche : le Trou boude, le Président chambre, puis les autres bots selon leur trait. */
function endRemarks(after: PrePublicView, bots: readonly Seat[], own: OwnOption): (Option | null)[] {
  const ranking = after.lastRanking ?? []
  if (ranking.length < 2) return []
  const presidentId = ranking[0]
  const trouId = ranking[ranking.length - 1]
  const others = bots.filter((b) => b.id !== presidentId && b.id !== trouId)
  const bold = (b: Seat) => ['agressif', 'farceur'].includes(botTraitsFor(b.name).trait)
  return [
    own(trouId, 'sulk', presidentId),
    own(presidentId, 'mockTrou', trouId),
    { speakers: others.filter(bold), kind: 'mockTrou', targetId: trouId, base: PRE_TALK.mockTrou },
    { speakers: others.filter((b) => !bold(b)), kind: 'hail', targetId: presidentId, base: PRE_TALK.hail },
  ]
}
