import type { BotTraits } from '@/lib/online/bot-personas'
import { pick, readSpeechTable, type SpeechPlayer, type SpeechTable } from '@/lib/online/bot-speech'
import { BOARD_SIZE } from './types'
import { PB_SPEECH_CAP, type LastOutcome, type PbSayMove, type PbSpeechKind } from './engine'
import type { EngineClientView } from './server-adapter'

/**
 * PAROLES DES BOTS DU PETIT BUVEUR EN LIGNE : un bot commente ce qui vient
 * de LUI arriver, dans l'écriture même du coup — sa case qui le fait boire ou
 * reculer (ouch), sa case qui touche un humain (aim), la case d'un humain qui
 * le touche (payback) ou le renvoie en arrière (sentBack), un humain qu'il
 * double (overtake), l'arrivée à un lancer (closeToWin), un duel ou un pile
 * ou face perdu face à un humain (duelLost, flipLost).
 *
 * CE QUE LE BOT A LE DROIT DE SAVOIR, et rien d'autre : le planificateur ne
 * lit que deux VUES CLIENT, celle d'avant le coup et celle d'après
 * (toClientView) — ni `rngState`, ni la case tirée tant qu'elle reste
 * cachée (cible choisie à l'aveugle, duel : la vue ne la porte pas). Il ne
 * réagit qu'au public : effet résolu (`lastOutcome`), tirage tombé
 * (`lastInteraction`), pions. Aucune phrase ne cite une case ni un chiffre.
 *
 * Sobriété : une bulle au plus par coup pour toute la table, au plus
 * min(PB_SPEECH_CAP, bavardage) par bot et PB_TABLE_SPEECH_PER_ROUND pour
 * la table par tour de table, et rien sans humain présent pour la lire. Le
 * moteur ne lit jamais le fil : les paroles ne pèsent pas sur le jeu.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler, par point de bavardage (Josiane 3 → 50 %, Gaston 1 → 17 %), avant l'humeur. */
export const PB_TALK_PER_BAVARDAGE = 1 / 6
/** Bulles max de toute la table par tour de table : le fil du téléphone et la TV restent lisibles. */
export const PB_TABLE_SPEECH_PER_ROUND = 4
/** Case (index) d'où un seul lancer peut gagner : un 6 pose le pion sur la dernière case. */
export const PB_FINISH_IN_REACH = BOARD_SIZE - 7

/** Ce qui arrive rarement passe avant le reste, et compte double au dé de parole. */
const RANK: Record<PbSpeechKind, number> = {
  duelLost: 5,
  flipLost: 5,
  sentBack: 4,
  closeToWin: 4,
  payback: 3,
  aim: 3,
  ouch: 2,
  overtake: 1,
}
const RARE_FROM_RANK = 4

type Seat = SpeechPlayer & { position: number }
type Event = { kind: PbSpeechKind; targets: Seat[] }
type Hurt = 'drink' | 'back' | 'status'

/**
 * L'humeur du persona : le fanfaron (audace) se vante, le rancunier
 * (rancune) promet la revanche ; râler devant sa propre case, tout le monde
 * le fait.
 */
function moodOf(kind: PbSpeechKind, traits: BotTraits): number {
  switch (kind) {
    case 'aim':
    case 'overtake':
    case 'closeToWin':
      return 0.5 + traits.audace
    case 'payback':
    case 'sentBack':
    case 'duelLost':
    case 'flipLost':
      return 0.5 + traits.rancune
    default:
      return 1
  }
}

/** Chance (0..1) qu'un bot de ce caractère dise une parole de ce kind. */
export function pbTalkChance(kind: PbSpeechKind, traits: BotTraits): number {
  const rare = RANK[kind] >= RARE_FROM_RANK ? 2 : 1
  return Math.min(1, traits.bavardage * PB_TALK_PER_BAVARDAGE * rare * moodOf(kind, traits))
}

/** L'effet résolu PAR CE COUP, s'il y en a un (un passage de tour sans case n'en a pas). */
function freshOutcome(before: EngineClientView, after: EngineClientView): LastOutcome | null {
  if (!after.lastOutcome) return null
  const key = (v: EngineClientView) => {
    const history = v.outcomeHistory ?? []
    return JSON.stringify([history.length, history[history.length - 1] ?? null, v.lastOutcome ?? null])
  }
  return key(after) === key(before) ? null : after.lastOutcome
}

function freshInteraction(before: EngineClientView, after: EngineClientView) {
  const li = after.lastInteraction
  if (!li) return null
  return JSON.stringify(li) === JSON.stringify(before.lastInteraction ?? null) ? null : li
}

/** Ce que l'effet `o` a fait subir à `id` : recul, gorgées, ou un sort posé (malédiction, ancre, tour passé). */
function hurtOf(o: LastOutcome, id: string, before: EngineClientView, after: EngineClientView): Hurt | null {
  const change = o.changes.find((c) => c.playerId === id)
  if (change && change.to < change.from) return 'back'
  if (change && change.drinks > 0) return 'drink'
  const b = before.players.find((p) => p.id === id)
  const a = after.players.find((p) => p.id === id)
  if (b && a && (a.cursed > b.cursed || (a.anchored && !b.anchored) || (a.skipNextTurn && !b.skipNextTurn))) {
    return 'status'
  }
  return null
}

/** Les événements de ce coup, par bot : ce que chacun aurait à dire, et à quels humains. */
function eventsOf(
  before: EngineClientView,
  after: EngineClientView,
  table: SpeechTable<PbSpeechKind, Seat>
): Map<string, Event[]> {
  const events = new Map<string, Event[]>()
  const add = (botId: string, kind: PbSpeechKind, targets: Seat[]) => {
    if (targets.length === 0) return
    events.set(botId, [...(events.get(botId) ?? []), { kind, targets }])
  }
  const bot = (id: string | null | undefined) => (id ? table.bots.find((b) => b.id === id) : undefined)
  const human = (id: string | null | undefined) => (id ? table.humans.find((h) => h.id === id) : undefined)
  const posBefore = (id: string) => before.players.find((p) => p.id === id)?.position ?? 0
  const posAfter = (id: string) => after.players.find((p) => p.id === id)?.position ?? 0

  const o = freshOutcome(before, after)
  if (o) {
    const actorBot = bot(o.actorId)
    const actorHuman = human(o.actorId)
    if (actorBot) {
      if (hurtOf(o, actorBot.id, before, after)) add(actorBot.id, 'ouch', table.humans)
      const hit = table.humans.filter((h) => hurtOf(o, h.id, before, after))
      const aimed = hit.find((h) => h.id === o.targetId)
      add(actorBot.id, 'aim', aimed ? [aimed] : hit)
    }
    if (actorHuman) {
      for (const b of table.bots) {
        const hurt = hurtOf(o, b.id, before, after)
        if (hurt) add(b.id, hurt === 'back' ? 'sentBack' : 'payback', [actorHuman])
      }
    }
  }

  const li = freshInteraction(before, after)
  if (li?.kind === 'duel') {
    const loserId = li.challengerWins ? li.opponentId : li.actorId
    const winner = human(li.challengerWins ? li.actorId : li.opponentId)
    const loser = bot(loserId)
    if (loser && winner) add(loser.id, 'duelLost', [winner])
  }
  if (li?.kind === 'pile-face' && li.side !== li.flip) {
    const loser = bot(li.targetId)
    const sender = human(li.actorId)
    if (loser && sender) add(loser.id, 'flipLost', [sender])
  }

  // Le joueur au tour avant le coup est celui qui a joué (la cible du pile ou face ne fait que choisir).
  const mover = bot(before.players[before.currentPlayer]?.id)
  if (mover) {
    const from = posBefore(mover.id)
    const to = posAfter(mover.id)
    if (to > from) add(mover.id, 'overtake', table.humans.filter((h) => posBefore(h.id) > from && posAfter(h.id) < to))
  }

  for (const b of table.bots) {
    const from = posBefore(b.id)
    const to = posAfter(b.id)
    if (from < PB_FINISH_IN_REACH && to >= PB_FINISH_IN_REACH && to < BOARD_SIZE - 1) {
      const best = Math.max(...table.humans.map((h) => h.position))
      add(b.id, 'closeToWin', table.humans.filter((h) => h.position === best))
    }
  }
  return events
}

/**
 * La parole jointe au coup qui fait passer la table de `before` à `after`
 * (vues client), 0 ou 1. Chaque bot à qui il reste une parole propose son
 * événement le plus rare ; les plus rares passent d'abord (à rang égal, un
 * ordre tournant tiré au sort) et chacun parle si son dé tombe sous
 * pbTalkChance. Le premier qui parle clôt le coup.
 */
export function petitBuveurBotSay(
  before: EngineClientView,
  after: EngineClientView,
  rand: () => number
): PbSayMove[] {
  if (after.phase === 'finished') return []
  const seats: Seat[] = after.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    alive: !p.leftAt,
    position: p.position,
  }))
  const table = readSpeechTable<PbSpeechKind, Seat>({
    players: seats,
    speech: after.speech ?? [],
    round: after.turnCount,
    engineCap: PB_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
  if (table.humans.length === 0 || table.speech.length >= PB_TABLE_SPEECH_PER_ROUND) return []
  const events = eventsOf(before, after, table)
  if (events.size === 0) return []

  const start = Math.min(table.bots.length - 1, Math.floor(rand() * table.bots.length))
  const order = [...table.bots.slice(start), ...table.bots.slice(0, start)]
  const candidates = order
    .filter((b) => table.underCap(b.id) && events.has(b.id))
    .map((b) => ({
      bot: b,
      event: events.get(b.id)!.reduce((best, e) => (RANK[e.kind] > RANK[best.kind] ? e : best)),
    }))
    // Tri stable : à rang égal, l'ordre tournant.
    .sort((x, y) => RANK[y.event.kind] - RANK[x.event.kind])
  for (const { bot, event } of candidates) {
    if (rand() < pbTalkChance(event.kind, table.traits(bot))) {
      return [{ playerId: bot.id, kind: event.kind, targetId: pick(event.targets, rand).id }]
    }
  }
  return []
}
