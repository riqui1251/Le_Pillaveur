import {
  createMenteurState,
  currentMenteurActorId,
  isLegalRaise,
  isMenteurAlive,
  menteurTotalDice,
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  MenteurEngineError,
  type MenteurBid,
  type MenteurState,
} from './engine'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur du Menteur : sérialisation, mapping HTTP → actions
 * moteur, IA du bot, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface MenteurRoomMember {
  userId: string
  user: { displayName: string }
}

/** Noms des bots de complément (clin d'œil apéro). */
const MENTEUR_BOT_NAMES = ['Barnabé 🤖', 'Gépéto 🤖', 'Raoul 🤖', 'Suzette 🤖', 'Marcel 🤖']

/**
 * Construit l'état initial. Comme au Toucher-Coulé, les sièges vides sont
 * comblés par des bots : un joueur seul peut lancer (ou relancer) une partie —
 * indispensable aussi pour le rematch quand des joueurs sont partis.
 */
export function buildMenteurState(members: MenteurRoomMember[], seed?: string | number): MenteurState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  while (players.length < 2) {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: MENTEUR_BOT_NAMES[botIndex % MENTEUR_BOT_NAMES.length],
      isBot: true,
    })
    botIndex += 1
  }
  return createMenteurState(players, seed ?? randomSeed())
}

export function serializeMenteurState(state: MenteurState): string {
  return JSON.stringify(state)
}

export function parseMenteurState(json: string | null): MenteurState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as MenteurState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type MenteurRoomActionInput =
  | { type: 'bid'; qty: number; face: number }
  | { type: 'dudo' }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type MenteurRoomActionResult =
  | { ok: true; state: MenteurState }
  | { ok: false; error: string }

export function applyMenteurRoomAction(
  state: MenteurState,
  userId: string,
  input: MenteurRoomActionInput
): MenteurRoomActionResult {
  try {
    switch (input.type) {
      case 'bid':
        return { ok: true, state: reduceMenteur(state, { type: 'BID', playerId: userId, qty: input.qty, face: input.face }) }
      case 'dudo':
        return { ok: true, state: reduceMenteur(state, { type: 'DUDO', playerId: userId }) }
      case 'continue':
        return { ok: true, state: reduceMenteur(state, { type: 'CONTINUE', playerId: userId }) }
      case 'bot':
        return applyMenteurBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceMenteur(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof MenteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

/** Quitter en partie → marqué « parti » (grâce avant bot). Null = no-op. */
export function markMenteurPlayerLeft(
  state: MenteurState,
  playerId: string,
  at: number
): MenteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceMenteur(state, { type: 'LEAVE', playerId, at })
}

export function rejoinMenteurPlayer(state: MenteurState, playerId: string): MenteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceMenteur(state, { type: 'REJOIN', playerId })
}

/** Conversion directe en bot (expulsion AFK — validée par la route). */
export function convertMenteurPlayerToBot(state: MenteurState, playerId: string): MenteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
}

export function menteurClientViewJson(state: MenteurState, viewerId: string): string {
  return JSON.stringify(toMenteurClientView(state, viewerId))
}

export function menteurSpectatorViewJson(state: MenteurState): string {
  return JSON.stringify(toMenteurSpectatorView(state))
}

// ─── IA du bot ───────────────────────────────────────────────────────────────

/** Dés du joueur qui comptent pour une face (jokers 1 inclus hors enchère aux 1). */
function countMine(dice: number[], face: number): number {
  return dice.filter((d) => d === face || (face !== 1 && d === 1)).length
}

/**
 * Décision du bot, probabiliste : espérance de la face enchérie =
 * (mes dés qui matchent) + (dés inconnus × 1/3, ou 1/6 pour les 1).
 * Enchère trop au-dessus → « Menteur ! », sinon relance plausible.
 * Le hasard des CHOIX utilise Math.random (entrée « joueur ») ; les dés
 * restent tirés par le RNG seedé du moteur.
 */
export function applyMenteurBotAction(state: MenteurState): MenteurRoomActionResult {
  const actorId = currentMenteurActorId(state)
  const actor = state.players.find((p) => p.id === actorId)
  if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }

  try {
    if (state.phase === 'reveal') {
      return { ok: true, state: reduceMenteur(state, { type: 'CONTINUE', playerId: actor.id }) }
    }
    if (state.phase !== 'bidding') return { ok: false, error: 'NOT_BIDDING' }

    const totalDice = menteurTotalDice(state)
    const unknown = totalDice - actor.dice.length
    const bid = state.currentBid

    if (bid) {
      const expected =
        countMine(actor.dice, bid.face) + unknown * (bid.face === 1 ? 1 / 6 : 1 / 3)
      // Marge légèrement aléatoire pour ne pas être prévisible.
      if (bid.qty > expected + 0.6 + Math.random() * 0.8) {
        return { ok: true, state: reduceMenteur(state, { type: 'DUDO', playerId: actor.id }) }
      }
      const candidate = pickRaise(bid, actor.dice, totalDice)
      if (!candidate) {
        return { ok: true, state: reduceMenteur(state, { type: 'DUDO', playerId: actor.id }) }
      }
      return {
        ok: true,
        state: reduceMenteur(state, {
          type: 'BID',
          playerId: actor.id,
          qty: candidate.qty,
          face: candidate.face,
        }),
      }
    }

    // Première enchère de la manche : sa meilleure face, quantité prudente.
    const bestFace = bestOwnFace(actor.dice)
    const qty = Math.max(
      1,
      Math.min(totalDice, countMine(actor.dice, bestFace) + Math.floor(unknown / 4))
    )
    return {
      ok: true,
      state: reduceMenteur(state, { type: 'BID', playerId: actor.id, qty, face: bestFace }),
    }
  } catch (e) {
    if (e instanceof MenteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

/** Face 2-6 la plus représentée dans sa main (jokers inclus). */
function bestOwnFace(dice: number[]): number {
  let best = 2
  let bestCount = -1
  for (let face = 2; face <= 6; face += 1) {
    const c = countMine(dice, face)
    if (c > bestCount) {
      best = face
      bestCount = c
    }
  }
  return best
}

/** Première relance LÉGALE parmi des candidates plausibles, sinon null. */
function pickRaise(
  bid: MenteurBid,
  dice: number[],
  totalDice: number
): { qty: number; face: number } | null {
  const bestFace = bestOwnFace(dice)
  const candidates: { qty: number; face: number }[] = []
  // Même quantité, face supérieure que je possède.
  for (let face = bid.face + 1; face <= 6; face += 1) {
    if (countMine(dice, face) > 0) candidates.push({ qty: bid.qty, face })
  }
  // Quantité +1 sur ma meilleure face, puis sur la face courante.
  candidates.push({ qty: bid.qty + 1, face: bestFace })
  candidates.push({ qty: bid.qty + 1, face: bid.face })
  // Bascule vers les 1 si j'en tiens.
  if (dice.includes(1)) candidates.push({ qty: Math.ceil(bid.qty / 2), face: 1 })
  // Sortie des 1.
  if (bid.face === 1) candidates.push({ qty: bid.qty * 2 + 1, face: bestFace })

  for (const c of candidates) {
    if (isLegalRaise(bid, c.qty, c.face, totalDice)) return c
  }
  return null
}

export { isMenteurAlive }
