import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import { readSpeechTable, type SpeechPlayer, type SpeechTable } from '@/lib/online/bot-speech'
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
 * celui d'un bot comme celui d'un humain. Aucun tick de plus.
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
 * Sobriété : chaque candidat parle si un tirage tombe sous sa chance (par
 * point de bavardage, bonus de trait), dans la limite de min(2, bavardage)
 * paroles par manche ; le premier qui parle clôt le coup. Une table sans
 * humain présent se tait : personne ne lit le fil. Les bots ne lisent jamais
 * le fil, les paroles ne pèsent pas sur le jeu.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler, par point de bavardage, selon le kind. */
export const PRE_TALK_PER_BAVARDAGE: Record<PreSpeechKind, number> = {
  out: 0.2,
  close: 0.2,
  cut: 0.15,
  brag: 0.15,
  ouRien: 0.08,
  grumble: 0.1,
  hail: 0.15,
  mockTrou: 0.15,
  sulk: 0.15,
}
/** Jamais systématique : même le plus bavard se tait parfois. */
export const PRE_TALK_MAX = 0.85
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

/** Chance de parler d'un bot pour ce kind : bavardage, puis le bonus de son trait. */
export function preTalkChance(kind: PreSpeechKind, traits: BotTraits): number {
  let chance = traits.bavardage * PRE_TALK_PER_BAVARDAGE[kind]
  const { trait } = traits
  if (kind === 'cut' && trait === 'agressif') chance += 0.2
  if (kind === 'ouRien' && (trait === 'farceur' || trait === 'agressif')) chance += 0.15
  if (kind === 'mockTrou' && (trait === 'farceur' || trait === 'agressif')) chance += 0.2
  if (kind === 'hail' && (trait === 'suiveur' || trait === 'prudent')) chance += 0.2
  if (kind === 'grumble' || kind === 'sulk') chance += 0.4 * traits.rancune
  return Math.min(PRE_TALK_MAX, chance)
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

type Candidate = { say: PreSay; chance: number }

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
  if (!after.players.some((p) => !p.isBot && !p.leftAt)) return []
  const seats: Seat[] = after.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    handCount: p.handCount,
  }))
  const table = readSpeechTable({
    players: seats,
    speech: after.speech ?? [],
    round: after.manche,
    engineCap: PRE_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
  const speaks = (id: string) => {
    const p = table.byId.get(id)
    return Boolean(p && p.isBot && p.alive && table.underCap(id))
  }
  const candidate = (playerId: string, kind: PreSpeechKind, targetId: string | null): Candidate | null => {
    const author = table.byId.get(playerId)
    if (!author || !targetId || targetId === playerId || !table.byId.has(targetId)) return null
    if (!speaks(playerId)) return null
    return { say: { playerId, kind, targetId }, chance: preTalkChance(kind, botTraitsFor(author.name)) }
  }

  const mancheEnded = before.phase === 'playing' && (after.phase === 'interlude' || after.phase === 'finished')
  const candidates = mancheEnded ? endRemarks(after, table, candidate) : event ? moveReactions(before, after, event, candidate) : []
  // Tri stable : l'humain visé d'abord, sinon l'ordre de la règle.
  const aimsHuman = (c: Candidate) => (table.byId.get(c.say.targetId)?.isBot === false ? 1 : 0)
  const ordered = [...candidates].sort((a, b) => aimsHuman(b) - aimsHuman(a))
  const max = mancheEnded ? PRE_END_REMARKS_MAX : 1
  const said: PreSay[] = []
  for (const { say, chance } of ordered) {
    if (said.length >= max) break
    if (said.some((s) => s.playerId === say.playerId)) continue
    if (rand() < chance) said.push(say)
  }
  return said
}

type CandidateOf = (playerId: string, kind: PreSpeechKind, targetId: string | null) => Candidate | null

/** Le coup d'un bot (une parole au plus, la plus marquante), puis la victime d'un 2 ou d'une fermeture. */
function moveReactions(
  before: PrePublicView,
  after: PrePublicView,
  event: PreSpeechEvent,
  candidate: CandidateOf
): Candidate[] {
  const actorId = event.playerId
  const covered = before.lastPlay
  const naturals = event.cards.filter((c) => !preIsJoker(c))
  // Jokers seuls : ils copient la pose recouverte (rang du pli).
  const rank = naturals.length > 0 ? preRankOf(naturals[0]) : covered ? preLastPlayRank(covered) : 0
  const victimId = covered && covered.playerId !== actorId ? covered.playerId : null
  const wentOut = after.outOrder.includes(actorId) && !before.outOrder.includes(actorId)
  const cut = event.type === 'play' && rank === PRE_TWO && victimId !== null
  const out: Candidate[] = []

  const own = wentOut
    ? candidate(actorId, 'out', mostCards(after, actorId))
    : event.type === 'close'
      ? candidate(actorId, 'close', victimId)
      : cut
        ? candidate(actorId, 'cut', victimId)
        : event.cards.length >= 3
          ? candidate(actorId, 'brag', answerer(after, actorId))
          : covered && rank === preLastPlayRank(covered)
            ? candidate(actorId, 'ouRien', answerer(after, actorId))
            : null
  if (own) out.push(own)
  if (victimId && (cut || event.type === 'close')) {
    const grumble = candidate(victimId, 'grumble', actorId)
    if (grumble) out.push(grumble)
  }
  return out
}

/** Fin de manche : le Trou boude, le Président chambre, puis les autres bots selon leur trait. */
function endRemarks(
  after: PrePublicView,
  table: SpeechTable<PreSpeechKind, Seat>,
  candidate: CandidateOf
): Candidate[] {
  const ranking = after.lastRanking ?? []
  if (ranking.length < 2) return []
  const presidentId = ranking[0]
  const trouId = ranking[ranking.length - 1]
  const out: Candidate[] = []
  const push = (c: Candidate | null) => {
    if (c) out.push(c)
  }
  push(candidate(trouId, 'sulk', presidentId))
  push(candidate(presidentId, 'mockTrou', trouId))
  for (const p of after.players) {
    if (p.id === presidentId || p.id === trouId) continue
    const author = table.byId.get(p.id)
    if (!author?.isBot) continue
    const { trait } = botTraitsFor(author.name)
    push(
      trait === 'agressif' || trait === 'farceur'
        ? candidate(p.id, 'mockTrou', trouId)
        : candidate(p.id, 'hail', presidentId)
    )
  }
  return out
}
