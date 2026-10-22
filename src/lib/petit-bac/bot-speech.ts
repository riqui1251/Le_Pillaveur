import { pick, readSpeechTable, type SpeechPlayer, type SpeechTable } from '@/lib/online/bot-speech'
import {
  pbcNormalize,
  PBC_SPEECH_CAP,
  type PbcClientView,
  type PbcSayMove,
  type PbcSpeech,
  type PbcSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU PETIT BAC. Ses bots sont des déserteurs convertis :
 * copie blanche, aucune voix de contestation (le moteur la leur refuse).
 * Ils ne font que commenter, à deux moments, une bulle au plus chacun pour
 * toute la table :
 *   • au STOP d'un humain : « Déjà ?! » — la table est gelée, les copies
 *     encore secrètes : seul le nom de qui a crié est lu ;
 *   • à la révélation, quand la grille devient publique : un doublon entre
 *     humains (twin, « t'as copié ? »), une réponse à 2 points qui fait
 *     tiquer (contest — une invitation à la contestation des humains, pas
 *     une voix), ou le meneur humain (tease).
 *
 * CE QUE LE BOT A LE DROIT DE SAVOIR : le planificateur ne lit que la vue
 * PUBLIQUE (spectateur). Avant la mise en commun, elle ne porte aucune
 * réponse (ni `revealGrid`, ni `myAnswers` pour un spectateur) : rien à
 * trahir.
 *
 * Sobriété : au plus min(2, bavardage) bulles par bot et par manche, et
 * rien sans humain présent pour les lire. Les paroles ne pèsent pas sur le
 * jeu : aucun moteur ne lit le fil.
 *
 * PUR : `rand` injecté.
 */

/** Chance de commenter le STOP, par point de bavardage (un converti, 2 : une fois sur trois). */
export const PBC_STOP_TALK_PER_BAVARDAGE = 1 / 6
/** Chance de commenter la grille, par point de bavardage (un converti : une fois sur deux). */
export const PBC_REVEAL_TALK_PER_BAVARDAGE = 1 / 4
/** Bulles max pour toute la table à chacun des deux moments. */
export const PBC_TALKERS_PER_MOMENT = 1
/** Longueur max d'une réponse citée dans une bulle (au-delà, « … »). */
export const PBC_CITED_MAX = 24

type Seat = SpeechPlayer & { total: number }

function tableOf(view: PbcClientView): SpeechTable<PbcSpeechKind, Seat> {
  const seats: Seat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    total: p.total + (view.roundTotals?.[p.id] ?? 0),
  }))
  return readSpeechTable({
    players: seats,
    speech: view.speech ?? [],
    round: view.round,
    engineCap: PBC_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
}

function rotation<T>(list: readonly T[], rand: () => number): T[] {
  if (list.length === 0) return []
  const start = Math.min(list.length - 1, Math.floor(rand() * list.length))
  return [...list.slice(start), ...list.slice(0, start)]
}

/** Les bots à qui il reste une parole, dans un ordre tournant tiré au sort. */
function speakers(table: SpeechTable<PbcSpeechKind, Seat>, rand: () => number): Seat[] {
  return rotation(table.bots, rand).filter((b) => table.underCap(b.id))
}

/** Le premier bot dont le dé tombe sous bavardage × `perBavardage`, ou null. */
function firstTalker(
  table: SpeechTable<PbcSpeechKind, Seat>,
  perBavardage: number,
  rand: () => number
): Seat | null {
  for (const bot of speakers(table, rand)) {
    if (rand() < table.traits(bot).bavardage * perBavardage) return bot
  }
  return null
}

/** « Déjà ?! » : 0 ou 1 parole, vers l'humain qui vient de crier STOP. */
export function pbcStopSay(view: PbcClientView, rand: () => number): PbcSayMove[] {
  if (view.phase !== 'flush' && view.phase !== 'reveal') return []
  const table = tableOf(view)
  const stopper = table.humans.find((h) => h.id === view.stopperId)
  if (!stopper) return []
  if (table.speech.some((sp) => sp.kind === 'stop')) return []
  const bot = firstTalker(table, PBC_STOP_TALK_PER_BAVARDAGE, rand)
  return bot ? [{ playerId: bot.id, kind: 'stop', targetId: stopper.id }] : []
}

/** Rang d'un commentaire de grille : le doublon d'abord (le plus rare, le plus drôle). */
const REVEAL_RANK: Partial<Record<PbcSpeechKind, number>> = { twin: 3, contest: 2, tease: 1 }

/**
 * Ce que la grille publique offre à commenter, au mieux classé : un doublon
 * entre humains, sinon une réponse à 2 points d'un humain, sinon le meneur
 * humain, seul en tête, points de la manche compris.
 */
function revealComment(
  view: PbcClientView,
  table: SpeechTable<PbcSpeechKind, Seat>,
  botId: string,
  rand: () => number
): PbcSayMove | null {
  const grid = view.revealGrid ?? []
  const isHuman = (id: string) => table.humans.some((h) => h.id === id)
  const twins: { targetId: string; category: number }[] = []
  const uniques: { targetId: string; category: number }[] = []
  grid.forEach((cells, category) => {
    const human = cells.filter((c) => isHuman(c.playerId) && !c.rejected)
    for (const cell of human) {
      if (cell.points === 2) uniques.push({ targetId: cell.playerId, category })
      if (cell.points !== 1) continue
      const key = pbcNormalize(cell.answer)
      const sharedWithHuman = human.some((o) => o !== cell && o.points === 1 && pbcNormalize(o.answer) === key)
      if (sharedWithHuman) twins.push({ targetId: cell.playerId, category })
    }
  })
  if (twins.length > 0) return { playerId: botId, kind: 'twin', ...pick(twins, rand) }
  if (uniques.length > 0) return { playerId: botId, kind: 'contest', ...pick(uniques, rand) }
  const top = Math.max(...table.alive.map((p) => p.total))
  const leaders = table.alive.filter((p) => p.total === top)
  if (top > 0 && leaders.length === 1 && !leaders[0].isBot) {
    return { playerId: botId, kind: 'tease', targetId: leaders[0].id }
  }
  return null
}

/** Le commentaire de la grille qui vient d'être révélée : 0 ou 1 parole. */
export function pbcRevealSay(view: PbcClientView, rand: () => number): PbcSayMove[] {
  if (view.phase !== 'reveal' || !view.revealGrid) return []
  const table = tableOf(view)
  if (table.humans.length === 0) return []
  const said = table.speech.filter((sp) => REVEAL_RANK[sp.kind] !== undefined).length
  if (said >= PBC_TALKERS_PER_MOMENT) return []
  const bot = firstTalker(table, PBC_REVEAL_TALK_PER_BAVARDAGE, rand)
  if (!bot) return []
  const move = revealComment(view, table, bot.id, rand)
  return move ? [move] : []
}

/**
 * La réponse citée par une parole (contest, twin), lue dans la grille
 * publique de la révélation, raccourcie pour la bulle ; un tiret si la
 * grille ne la porte plus (manche suivante, onglet périmé).
 */
export function pbcCitedAnswer(view: Pick<PbcClientView, 'revealGrid'>, speech: PbcSpeech): string {
  const cell = view.revealGrid?.[speech.category ?? -1]?.find((c) => c.playerId === speech.targetId)
  const answer = cell?.answer.trim() ?? ''
  if (!answer) return '—'
  return [...answer].length > PBC_CITED_MAX ? `${[...answer].slice(0, PBC_CITED_MAX - 1).join('')}…` : answer
}
