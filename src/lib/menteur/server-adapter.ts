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
  MENTEUR_MAX_PLAYERS,
  type MenteurBid,
  type MenteurRules,
  type MenteurState,
} from './engine'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
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

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur
 * (rematch après départs).
 */
export function buildMenteurState(
  members: MenteurRoomMember[],
  botsCount: number = 0,
  seed?: string | number,
  rules?: MenteurRules
): MenteurState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(MENTEUR_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, MENTEUR_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < 2) addBot()
  return createMenteurState(players, seed ?? randomSeed(), rules)
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
  | { type: 'calza' }
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
      case 'calza':
        return { ok: true, state: reduceMenteur(state, { type: 'CALZA', playerId: userId }) }
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

/** Dés du joueur qui comptent pour une face (jokers 1 inclus hors enchère aux 1, désactivés en Palifico). */
function countMine(dice: number[], face: number, palifico = false): number {
  return dice.filter((d) => d === face || (!palifico && face !== 1 && d === 1)).length
}

/**
 * Décision du bot, probabiliste : espérance de la face enchérie =
 * (mes dés qui matchent) + (dés inconnus × 1/3, ou 1/6 pour les 1, ou 1/6
 * pour toute face en manche Palifico où les 1 ne sont plus jokers).
 * Enchère trop au-dessus → « Menteur ! » (ou « Calza ! » si pile dessus et
 * la règle est activée), sinon relance plausible.
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
    const { palifico } = state

    if (bid) {
      const perDieOdds = palifico ? 1 / 6 : bid.face === 1 ? 1 / 6 : 1 / 3
      const expected = countMine(actor.dice, bid.face, palifico) + unknown * perDieOdds
      // Pile dessus et Calza dispo → tenté de temps en temps plutôt que de relancer.
      if (state.ruleCalza && Math.abs(bid.qty - expected) < 0.5 && Math.random() < 0.4) {
        return { ok: true, state: reduceMenteur(state, { type: 'CALZA', playerId: actor.id }) }
      }
      // Marge légèrement aléatoire pour ne pas être prévisible.
      if (bid.qty > expected + 0.6 + Math.random() * 0.8) {
        return { ok: true, state: reduceMenteur(state, { type: 'DUDO', playerId: actor.id }) }
      }
      const candidate = pickRaise(bid, actor.dice, totalDice, palifico)
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
    const bestFace = bestOwnFace(actor.dice, palifico)
    const qty = Math.max(
      1,
      Math.min(totalDice, countMine(actor.dice, bestFace, palifico) + Math.floor(unknown / 4))
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

/** Face 2-6 la plus représentée dans sa main (jokers inclus hors Palifico). */
function bestOwnFace(dice: number[], palifico = false): number {
  let best = 2
  let bestCount = -1
  for (let face = 2; face <= 6; face += 1) {
    const c = countMine(dice, face, palifico)
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
  totalDice: number,
  palifico = false
): { qty: number; face: number } | null {
  const bestFace = bestOwnFace(dice, palifico)
  const candidates: { qty: number; face: number }[] = []
  if (palifico) {
    // Face verrouillée pour la manche : seule la quantité peut monter.
    candidates.push({ qty: bid.qty + 1, face: bid.face })
  } else {
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
  }

  for (const c of candidates) {
    if (isLegalRaise(bid, c.qty, c.face, totalDice, palifico)) return c
  }
  return null
}

export { isMenteurAlive }
