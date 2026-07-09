import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'

/**
 * LE MENTEUR (Perudo apéro) — moteur PUR, serveur-autoritaire.
 *
 * Chaque joueur cache 5 dés sous son gobelet. À ton tour : surenchérir
 * (« il y a au moins Q dés de face F sur la table ») ou crier « Menteur ! ».
 * Les 1 — les « Pillaveurs » — sont jokers : ils comptent pour toutes les
 * faces (sauf quand l'enchère porte sur les 1 eux-mêmes).
 *
 * Défi (« Menteur ! ») → révélation : si l'enchère tient, l'accusateur perd
 * un dé, sinon l'enchérisseur. Le perdant boit (gorgées = total de ses dés
 * perdus). Plus de dés = éliminé (cul sec). Dernier en lice = vainqueur.
 *
 * Déterminisme : tous les lancers passent par le RNG seedé sérialisé dans
 * l'état (`rngState`) — jamais envoyé au client (anti-triche).
 */

export const MENTEUR_START_DICE = 5
export const MENTEUR_MIN_PLAYERS = 2
export const MENTEUR_MAX_PLAYERS = 6

export type MenteurPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — dés sous le gobelet (vide = éliminé). */
  dice: number[]
  /** Dés perdus au total (= gorgées bues au fil des manches). */
  lostCount: number
}

export type MenteurBid = { qty: number; face: number; by: string }

/** Résultat PUBLIC d'un défi — tous les gobelets sont levés. */
export type MenteurReveal = {
  bid: MenteurBid
  challengerId: string
  /** Dés de chaque joueur encore en lice AU MOMENT du défi. */
  allDice: { playerId: string; dice: number[] }[]
  matchCount: number
  bidHeld: boolean
  /** DUDO, ou Calza raté : qui boit. Calza réussi : null (personne ne boit). */
  loserId: string | null
  /** Gorgées du perdant (= son total de dés perdus). */
  sips: number
  /** Joueur éliminé sur ce défi (cul sec), sinon null. */
  eliminatedId: string | null
  /** 'dudo' (par défaut) ou 'calza' (pari « pile la quantité »). */
  mode?: 'dudo' | 'calza'
  /** Calza réussi seulement : qui regagne un dé. */
  gainedId?: string | null
}

export type MenteurPhase = 'bidding' | 'reveal' | 'finished'

export type MenteurState = {
  version: number
  phase: MenteurPhase
  players: MenteurPlayer[]
  /** Index (dans players) du joueur au tour pendant les enchères. */
  turnIdx: number
  currentBid: MenteurBid | null
  lastReveal: MenteurReveal | null
  round: number
  winnerId: string | null
  rematchVotes: string[]
  /** SECRET serveur — jamais dans une vue client. */
  rngState: number
  /** Règle Palifico activée pour la partie (choix hôte, figé au lancement). */
  rulePalifico: boolean
  /** Règle Calza activée pour la partie (choix hôte, figé au lancement). */
  ruleCalza: boolean
  /** Manche Palifico en cours (un joueur vivant n'a plus qu'un dé) : les 1 ne
   * sont plus jokers et la face de l'enchère est verrouillée sur la manche. */
  palifico: boolean
}

export type MenteurAction =
  | { type: 'BID'; playerId: string; qty: number; face: number }
  | { type: 'DUDO'; playerId: string }
  | { type: 'CALZA'; playerId: string }
  | { type: 'CONTINUE'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class MenteurEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'MenteurEngineError'
  }
}

export type MenteurInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isMenteurAlive(p: MenteurPlayer): boolean {
  return p.dice.length > 0
}

export function menteurAlivePlayers(state: MenteurState): MenteurPlayer[] {
  return state.players.filter(isMenteurAlive)
}

export function menteurTotalDice(state: MenteurState): number {
  return state.players.reduce((sum, p) => sum + p.dice.length, 0)
}

/** Prochain index VIVANT strictement après `fromIdx` (ordre de table circulaire). */
function nextAliveIdx(state: MenteurState, fromIdx: number): number {
  const n = state.players.length
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIdx + step) % n
    if (isMenteurAlive(state.players[idx])) return idx
  }
  throw new MenteurEngineError('NO_ALIVE_PLAYER')
}

/**
 * Nombre de dés sur la table qui satisfont une face d'enchère :
 * la face exacte + les 1 jokers (sauf si l'enchère porte sur les 1, ou en
 * manche Palifico où les 1 perdent leur statut de joker).
 */
export function countMatches(players: MenteurPlayer[], face: number, palifico = false): number {
  let count = 0
  for (const p of players) {
    for (const d of p.dice) {
      if (d === face || (!palifico && face !== 1 && d === 1)) count += 1
    }
  }
  return count
}

/**
 * Légalité d'une surenchère (règles Perudo simplifiées V1) :
 * - normal → normal : quantité qui monte, OU même quantité + face supérieure ;
 * - normal → aux 1 : quantité ≥ moitié arrondie sup ;
 * - aux 1 → normal : quantité ≥ double + 1 ;
 * - aux 1 → aux 1 : quantité qui monte.
 * Première enchère : libre. Toujours 1 ≤ qty ≤ dés sur la table, face 1-6.
 * En manche Palifico : la première enchère fixe la face pour toute la manche,
 * les suivantes ne peuvent que monter la quantité (face inchangée).
 */
export function isLegalRaise(
  prev: MenteurBid | null,
  qty: number,
  face: number,
  totalDice: number,
  palifico = false
): boolean {
  if (!Number.isInteger(qty) || !Number.isInteger(face)) return false
  if (face < 1 || face > 6) return false
  if (qty < 1 || qty > totalDice) return false
  if (!prev) return true
  if (palifico) return qty > prev.qty && face === prev.face
  if (prev.face === 1 && face === 1) return qty > prev.qty
  if (prev.face === 1 && face > 1) return qty >= prev.qty * 2 + 1
  if (prev.face > 1 && face === 1) return qty >= Math.ceil(prev.qty / 2)
  return qty > prev.qty || (qty === prev.qty && face > prev.face)
}

function rollDice(rng: SeededRng, count: number): number[] {
  const dice: number[] = []
  for (let i = 0; i < count; i += 1) dice.push(rng.int(1, 6))
  return dice
}

/** Une manche Palifico débute quand un joueur vivant n'a plus qu'un dé. */
function computePalifico(players: MenteurPlayer[], rulePalifico: boolean): boolean {
  return rulePalifico && players.some((p) => p.dice.length === 1)
}

export type MenteurRules = { palifico?: boolean; calza?: boolean }

// ─── Création ────────────────────────────────────────────────────────────────

export function createMenteurState(
  players: MenteurInitialPlayer[],
  seed: string | number,
  rules: MenteurRules = {}
): MenteurState {
  if (players.length < MENTEUR_MIN_PLAYERS) throw new MenteurEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > MENTEUR_MAX_PLAYERS) throw new MenteurEngineError('TOO_MANY_PLAYERS')
  const rng = createRng(seed)
  const withDice: MenteurPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    dice: rollDice(rng, MENTEUR_START_DICE),
    lostCount: 0,
  }))
  const rulePalifico = Boolean(rules.palifico)
  return {
    version: 1,
    phase: 'bidding',
    players: withDice,
    turnIdx: rng.pickIndex(withDice.length),
    currentBid: null,
    lastReveal: null,
    round: 1,
    winnerId: null,
    rematchVotes: [],
    rngState: rng.getState(),
    rulePalifico,
    ruleCalza: Boolean(rules.calza),
    palifico: computePalifico(withDice, rulePalifico),
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceMenteur(state: MenteurState, action: MenteurAction): MenteurState {
  switch (action.type) {
    case 'BID': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      if (!isLegalRaise(state.currentBid, action.qty, action.face, menteurTotalDice(state), state.palifico)) {
        throw new MenteurEngineError('ILLEGAL_BID')
      }
      return {
        ...state,
        currentBid: { qty: action.qty, face: action.face, by: actor.id },
        turnIdx: nextAliveIdx(state, state.turnIdx),
        version: state.version + 1,
      }
    }

    case 'DUDO': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      const bid = state.currentBid
      if (!bid) throw new MenteurEngineError('NO_BID_TO_CHALLENGE')

      const alive = menteurAlivePlayers(state)
      const matchCount = countMatches(alive, bid.face, state.palifico)
      const bidHeld = matchCount >= bid.qty
      const loserId = bidHeld ? actor.id : bid.by
      const allDice = alive.map((p) => ({ playerId: p.id, dice: [...p.dice] }))

      let eliminatedId: string | null = null
      let sips = 0
      const players = state.players.map((p) => {
        if (p.id !== loserId) return p
        const dice = p.dice.slice(0, -1)
        const lostCount = p.lostCount + 1
        sips = lostCount
        if (dice.length === 0) eliminatedId = p.id
        return { ...p, dice, lostCount }
      })

      return {
        ...state,
        players,
        phase: 'reveal',
        lastReveal: {
          bid,
          challengerId: actor.id,
          allDice,
          matchCount,
          bidHeld,
          loserId,
          sips,
          eliminatedId,
          mode: 'dudo',
          gainedId: null,
        },
        version: state.version + 1,
      }
    }

    case 'CALZA': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      if (!state.ruleCalza) throw new MenteurEngineError('CALZA_DISABLED')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      const bid = state.currentBid
      if (!bid) throw new MenteurEngineError('NO_BID_TO_CHALLENGE')

      const alive = menteurAlivePlayers(state)
      const matchCount = countMatches(alive, bid.face, state.palifico)
      const exact = matchCount === bid.qty
      const allDice = alive.map((p) => ({ playerId: p.id, dice: [...p.dice] }))

      if (exact) {
        // Pari gagné : le joueur regagne un dé (plafonné au départ), rien à boire.
        const rng = rngFromState(state.rngState)
        let gainedId: string | null = null
        const players = state.players.map((p) => {
          if (p.id !== actor.id || p.dice.length >= MENTEUR_START_DICE) return p
          gainedId = p.id
          return { ...p, dice: [...p.dice, rng.int(1, 6)] }
        })
        return {
          ...state,
          players,
          phase: 'reveal',
          lastReveal: {
            bid,
            challengerId: actor.id,
            allDice,
            matchCount,
            bidHeld: true,
            loserId: null,
            sips: 0,
            eliminatedId: null,
            mode: 'calza',
            gainedId,
          },
          rngState: rng.getState(),
          version: state.version + 1,
        }
      }

      // Pari raté : le joueur perd un dé, comme un DUDO manqué contre lui-même.
      let eliminatedId: string | null = null
      let sips = 0
      const players = state.players.map((p) => {
        if (p.id !== actor.id) return p
        const dice = p.dice.slice(0, -1)
        const lostCount = p.lostCount + 1
        sips = lostCount
        if (dice.length === 0) eliminatedId = p.id
        return { ...p, dice, lostCount }
      })

      return {
        ...state,
        players,
        phase: 'reveal',
        lastReveal: {
          bid,
          challengerId: actor.id,
          allDice,
          matchCount,
          bidHeld: matchCount >= bid.qty,
          loserId: actor.id,
          sips,
          eliminatedId,
          mode: 'calza',
          gainedId: null,
        },
        version: state.version + 1,
      }
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new MenteurEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new MenteurEngineError('UNKNOWN_PLAYER')
      }
      const alive = menteurAlivePlayers(state)
      if (alive.length <= 1) {
        return {
          ...state,
          phase: 'finished',
          winnerId: alive[0]?.id ?? null,
          currentBid: null,
          version: state.version + 1,
        }
      }
      // Nouvelle manche : tout le monde relance ses dés (RNG seedé), et le
      // perdant du défi rouvre les enchères (s'il est éliminé, ou en cas de
      // Calza réussi sans perdant : le joueur central du défi ; sinon le suivant).
      const rng = rngFromState(state.rngState)
      const players = state.players.map((p) =>
        isMenteurAlive(p) ? { ...p, dice: rollDice(rng, p.dice.length) } : p
      )
      const leaderId = state.lastReveal?.loserId ?? state.lastReveal?.challengerId
      const leaderIdx = state.players.findIndex((p) => p.id === leaderId)
      const base: MenteurState = { ...state, players }
      const turnIdx =
        leaderIdx >= 0 && isMenteurAlive(players[leaderIdx])
          ? leaderIdx
          : nextAliveIdx(base, Math.max(0, leaderIdx))
      return {
        ...base,
        phase: 'bidding',
        turnIdx,
        currentBid: null,
        lastReveal: null,
        round: state.round + 1,
        rngState: rng.getState(),
        palifico: computePalifico(players, state.rulePalifico),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new MenteurEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new MenteurEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new MenteurEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new MenteurEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    default: {
      const exhaustive: never = action
      throw new MenteurEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant (tour, AFK, bots) ────────────────────────────────────────

/**
 * Joueur « au tour » : l'enchérisseur pendant les enchères ; pendant la
 * révélation, le PERDANT mène le « continuer » (s'il est éliminé : le joueur
 * vivant suivant) — cela donne une cible aux ticks bot/AFK à chaque phase.
 */
export function currentMenteurActorId(state: MenteurState): string | null {
  if (state.phase === 'bidding') return state.players[state.turnIdx]?.id ?? null
  if (state.phase === 'reveal') {
    const loserIdx = state.players.findIndex((p) => p.id === state.lastReveal?.loserId)
    if (loserIdx >= 0 && isMenteurAlive(state.players[loserIdx])) {
      return state.players[loserIdx].id
    }
    const alive = menteurAlivePlayers(state)
    return alive[0]?.id ?? null
  }
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type MenteurPlayerView = Omit<MenteurPlayer, 'dice'> & {
  /** Ses propres dés uniquement (vide pour les autres). */
  dice: number[]
  diceCount: number
}

export type MenteurClientView = Omit<MenteurState, 'rngState' | 'players'> & {
  players: MenteurPlayerView[]
}

/** Vue PAR JOUEUR : ses dés visibles, ceux des autres réduits à un compte. */
export function toMenteurClientView(state: MenteurState, viewerId: string): MenteurClientView {
  const { rngState: _rng, players, ...rest } = state
  void _rng
  return {
    ...rest,
    players: players.map((p) => ({
      ...p,
      dice: p.id === viewerId ? [...p.dice] : [],
      diceCount: p.dice.length,
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : aucun gobelet ouvert hors révélations. */
export function toMenteurSpectatorView(state: MenteurState): MenteurClientView {
  return toMenteurClientView(state, '')
}
