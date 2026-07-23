import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import { sanitizeStrokes, type Stroke } from '@/lib/crobard/engine'

/**
 * TÉLÉPHONE DESSINÉ (cadavre exquis phrase/dessin) — moteur PUR,
 * serveur-autoritaire. Réutilise tel quel le canvas et l'action
 * `DRAW_STROKE` de Crobard.
 *
 * N joueurs = N manches = longueur de chaque chaîne. Manche 0 : chacun
 * écrit une phrase de départ (sa propre chaîne). Manches suivantes
 * (simultanées, ALTERNANCE stricte phrase→dessin→phrase) : chaque joueur
 * reçoit le DERNIER maillon d'une chaîne qui tourne (rotation fixe) et doit
 * soit la dessiner (si phrase reçue) soit la deviner en une phrase (si
 * dessin reçu). Résolution dès que tout le monde a soumis, ou au timeout
 * (soumission vide acceptée = maillon « blanc »). Pas de score : à la fin,
 * chaque chaîne complète est révélée dans l'ordre, un salon à la fois.
 */

export const TELEPHONE_MIN_PLAYERS = 3
export const TELEPHONE_MAX_PLAYERS = 8
/** Compte à rebours d'échauffement au lancement. */
export const TELEPHONE_COUNTDOWN_MS = 5_000
/** Durée d'une manche d'écriture. */
export const TELEPHONE_WRITE_MS = 60_000
/** Durée d'une manche de dessin. */
export const TELEPHONE_DRAW_MS = 80_000
/** Longueur maximale d'une phrase (écriture ou devinette). */
export const TELEPHONE_TEXT_MAX_LEN = 140

export type TelephoneContribution =
  | { type: 'text'; text: string }
  | { type: 'draw'; strokes: Stroke[] }

export type TelephonePlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
}

export type TelephonePhase = 'countdown' | 'contributing' | 'reveal' | 'finished'

export type TelephoneState = TimedPhaseState & {
  version: number
  phase: TelephonePhase
  /** Ordre fixe = index de chaîne (chains[players[i].id] = chaîne DÉMARRÉE par players[i]). */
  players: TelephonePlayer[]
  /** 0 = écriture initiale, puis 1..totalRounds-1 (alternance phrase/dessin). */
  round: number
  /** = players.length (chaque manche ajoute UN maillon à chaque chaîne). */
  totalRounds: number
  /** chainOwnerId → maillons dans l'ordre (1er → dernier). PUBLIC seulement au reveal. */
  chains: Record<string, TelephoneContribution[]>
  /** SECRET — contributions de la manche en cours, avant résolution. */
  pendingSubmissions: Record<string, TelephoneContribution>
  /** PUBLIC — qui a déjà soumis cette manche (juste le compte, jamais le contenu). */
  submittedIds: string[]
  /** Ordre de révélation des chaînes (mélangé une fois, à l'entrée en reveal). */
  revealOrder: string[]
  revealIdx: number
  rematchVotes: string[]
  /** SECRET serveur — sert UNIQUEMENT à l'ordre de reveal, aucun tirage de contenu. */
  rngState: number
}

export type TelephoneAction =
  | { type: 'WRITE'; playerId: string; text: string; now: number }
  | { type: 'DRAW_STROKE'; playerId: string; stroke: Stroke }
  | { type: 'CLEAR'; playerId: string }
  | { type: 'SUBMIT'; playerId: string; strokes?: Stroke[]; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'PREVIOUS'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class TelephoneEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'TelephoneEngineError'
  }
}

export type TelephoneInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function telephoneActive(state: TelephoneState): TelephonePlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

/** Type d'action attendu à une manche donnée : écriture (pair) ou dessin (impair). */
export function telephoneActionTypeForRound(round: number): 'write' | 'draw' {
  return round % 2 === 0 ? 'write' : 'draw'
}

function blankFor(actionType: 'write' | 'draw'): TelephoneContribution {
  return actionType === 'write' ? { type: 'text', text: '' } : { type: 'draw', strokes: [] }
}

/** Chaîne assignée au joueur d'index `playerIdx` à la manche `round` (rotation fixe). */
function assignedChainOwnerId(state: TelephoneState, playerIdx: number, round: number): string {
  const n = state.players.length
  const ownerIdx = ((playerIdx - round) % n + n) % n
  return state.players[ownerIdx].id
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createTelephoneState(
  players: TelephoneInitialPlayer[],
  seed: string | number,
  now: number = Date.now()
): TelephoneState {
  if (players.length < TELEPHONE_MIN_PLAYERS) throw new TelephoneEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > TELEPHONE_MAX_PLAYERS) throw new TelephoneEngineError('TOO_MANY_PLAYERS')

  const rng: SeededRng = createRng(seed)
  const withPlayers: TelephonePlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
  }))
  const chains: Record<string, TelephoneContribution[]> = {}
  for (const p of withPlayers) chains[p.id] = []

  return {
    version: 1,
    ...enterPhase(0, 'countdown', TELEPHONE_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withPlayers,
    round: 0,
    totalRounds: withPlayers.length,
    chains,
    pendingSubmissions: {},
    submittedIds: [],
    revealOrder: [],
    revealIdx: 0,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Assigne les contributions de la manche courante aux chaînes, puis avance. */
function resolveRound(state: TelephoneState, now: number): TelephoneState {
  const n = state.players.length
  const actionType = telephoneActionTypeForRound(state.round)
  const chains: Record<string, TelephoneContribution[]> = {}
  for (const key of Object.keys(state.chains)) chains[key] = [...state.chains[key]]

  state.players.forEach((p, idx) => {
    const contribution = state.pendingSubmissions[p.id] ?? blankFor(actionType)
    const ownerId = state.round === 0 ? p.id : assignedChainOwnerId(state, idx, state.round)
    chains[ownerId] = [...chains[ownerId], contribution]
  })

  const nextRound = state.round + 1
  if (nextRound >= state.totalRounds) {
    const rng = rngFromState(state.rngState)
    const revealOrder = rng.shuffle(state.players.map((p) => p.id))
    return {
      ...state,
      chains,
      pendingSubmissions: {},
      submittedIds: [],
      revealOrder,
      revealIdx: 0,
      ...enterPhase(state.phaseSeq, 'reveal', null, now),
      phase: 'reveal',
      rngState: rng.getState(),
      version: state.version + 1,
    }
  }

  const nextActionType = telephoneActionTypeForRound(nextRound)
  const duration = nextActionType === 'write' ? TELEPHONE_WRITE_MS : TELEPHONE_DRAW_MS
  return {
    ...state,
    chains,
    pendingSubmissions: {},
    submittedIds: [],
    round: nextRound,
    ...enterPhase(state.phaseSeq, 'contributing', duration, now),
    phase: 'contributing',
    version: state.version + 1,
  }
}

/** Résout la manche dès que tous les joueurs actifs ont soumis. */
function maybeResolveRound(state: TelephoneState, now: number): TelephoneState {
  const active = telephoneActive(state)
  if (state.submittedIds.length < active.length) return state
  return resolveRound(state, now)
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceTelephone(state: TelephoneState, action: TelephoneAction): TelephoneState {
  switch (action.type) {
    case 'WRITE': {
      if (state.phase !== 'contributing') throw new TelephoneEngineError('NOT_CONTRIBUTING_PHASE')
      if (telephoneActionTypeForRound(state.round) !== 'write') {
        throw new TelephoneEngineError('NOT_WRITE_ROUND')
      }
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TelephoneEngineError('UNKNOWN_PLAYER')
      if (state.submittedIds.includes(player.id)) throw new TelephoneEngineError('ALREADY_SUBMITTED')
      const pendingSubmissions = {
        ...state.pendingSubmissions,
        [player.id]: { type: 'text' as const, text: action.text.trim().slice(0, TELEPHONE_TEXT_MAX_LEN) },
      }
      const submittedIds = [...state.submittedIds, player.id]
      return maybeResolveRound(
        { ...state, pendingSubmissions, submittedIds, version: state.version + 1 },
        action.now
      )
    }

    case 'DRAW_STROKE': {
      if (state.phase !== 'contributing') throw new TelephoneEngineError('NOT_CONTRIBUTING_PHASE')
      if (telephoneActionTypeForRound(state.round) !== 'draw') {
        throw new TelephoneEngineError('NOT_DRAW_ROUND')
      }
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TelephoneEngineError('UNKNOWN_PLAYER')
      if (state.submittedIds.includes(player.id)) throw new TelephoneEngineError('ALREADY_SUBMITTED')
      const current = state.pendingSubmissions[player.id]
      const strokes = current?.type === 'draw' ? current.strokes : []
      const pendingSubmissions = {
        ...state.pendingSubmissions,
        [player.id]: { type: 'draw' as const, strokes: [...strokes, action.stroke] },
      }
      return { ...state, pendingSubmissions, version: state.version + 1 }
    }

    case 'CLEAR': {
      if (state.phase !== 'contributing') throw new TelephoneEngineError('NOT_CONTRIBUTING_PHASE')
      if (telephoneActionTypeForRound(state.round) !== 'draw') {
        throw new TelephoneEngineError('NOT_DRAW_ROUND')
      }
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TelephoneEngineError('UNKNOWN_PLAYER')
      if (state.submittedIds.includes(player.id)) throw new TelephoneEngineError('ALREADY_SUBMITTED')
      const pendingSubmissions = {
        ...state.pendingSubmissions,
        [player.id]: { type: 'draw' as const, strokes: [] },
      }
      return { ...state, pendingSubmissions, version: state.version + 1 }
    }

    case 'SUBMIT': {
      if (state.phase !== 'contributing') throw new TelephoneEngineError('NOT_CONTRIBUTING_PHASE')
      if (telephoneActionTypeForRound(state.round) !== 'draw') {
        throw new TelephoneEngineError('NOT_DRAW_ROUND')
      }
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new TelephoneEngineError('UNKNOWN_PLAYER')
      if (state.submittedIds.includes(player.id)) throw new TelephoneEngineError('ALREADY_SUBMITTED')
      // Le dessin COMPLET arrive avec le SUBMIT (dessin local, une seule
      // requête — le streaming trait par trait perdait des traits sous
      // concurrence). Filet : sans `strokes`, on garde l'accumulé serveur
      // (compat parties en cours / vieux clients).
      const current = state.pendingSubmissions[player.id]
      const contribution: TelephoneContribution = Array.isArray(action.strokes)
        ? { type: 'draw', strokes: sanitizeStrokes(action.strokes) }
        : current?.type === 'draw'
          ? current
          : { type: 'draw', strokes: [] }
      const pendingSubmissions = { ...state.pendingSubmissions, [player.id]: contribution }
      const submittedIds = [...state.submittedIds, player.id]
      return maybeResolveRound(
        { ...state, pendingSubmissions, submittedIds, version: state.version + 1 },
        action.now
      )
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new TelephoneEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'contributing', TELEPHONE_WRITE_MS, action.now),
          phase: 'contributing',
          version: state.version + 1,
        }
      }
      if (state.phase === 'contributing') {
        return resolveRound(state, action.now)
      }
      throw new TelephoneEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new TelephoneEngineError('NOT_REVEAL')
      if (action.playerId !== currentTelephoneActorId(state)) throw new TelephoneEngineError('NOT_LEADER')
      const nextIdx = state.revealIdx + 1
      if (nextIdx >= state.revealOrder.length) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          version: state.version + 1,
        }
      }
      return { ...state, revealIdx: nextIdx, version: state.version + 1 }
    }

    case 'PREVIOUS': {
      if (state.phase !== 'reveal') throw new TelephoneEngineError('NOT_REVEAL')
      if (action.playerId !== currentTelephoneActorId(state)) throw new TelephoneEngineError('NOT_LEADER')
      if (state.revealIdx <= 0) throw new TelephoneEngineError('ALREADY_FIRST_CHAIN')
      return { ...state, revealIdx: state.revealIdx - 1, version: state.version + 1 }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new TelephoneEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new TelephoneEngineError('UNKNOWN_PLAYER')
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
      if (!player || player.isBot || !player.leftAt) {
        throw new TelephoneEngineError('CANNOT_REJOIN')
      }
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
      if (expired.length === 0) throw new TelephoneEngineError('NOTHING_TO_REPLACE')
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
      throw new TelephoneEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * `contributing` est simultané (tous agissent en parallèle) → pas d'acteur
 * unique. En `reveal`, le premier joueur encore en jeu mène le « continuer ».
 */
export function currentTelephoneActorId(state: TelephoneState): string | null {
  if (state.phase === 'reveal') return telephoneActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type TelephonePlayerView = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
}

export type TelephoneClientView = Omit<
  TelephoneState,
  'rngState' | 'chains' | 'pendingSubmissions' | 'players'
> & {
  players: TelephonePlayerView[]
  phaseKey: string
  submittedCount: number
  totalToSubmit: number
  haveISubmitted: boolean
  /** Le SEUL maillon assigné au viewer cette manche — jamais la chaîne complète. */
  received: TelephoneContribution | null
  /** Ce que le viewer doit produire cette manche. */
  actionType: 'write' | 'draw' | null
  /** Pendant reveal/finished : la chaîne actuellement affichée, complète et publique. */
  revealChain: { ownerName: string; links: TelephoneContribution[] } | null
}

function buildRevealChain(
  state: TelephoneState
): { ownerName: string; links: TelephoneContribution[] } | null {
  if (state.phase !== 'reveal' && state.phase !== 'finished') return null
  const ownerId = state.revealOrder[state.revealIdx]
  if (!ownerId) return null
  const owner = state.players.find((p) => p.id === ownerId)
  return { ownerName: owner?.name ?? '—', links: state.chains[ownerId] ?? [] }
}

/**
 * Vue PAR JOUEUR : ne voit QUE le maillon qui lui est assigné cette manche
 * (`received`), jamais les autres maillons en cours ni les chaînes
 * complètes avant `reveal`.
 */
export function toTelephoneClientView(state: TelephoneState, viewerId: string): TelephoneClientView {
  const { rngState: _rng, chains: _chains, pendingSubmissions: _ps, players, ...rest } = state
  void _rng
  void _chains
  void _ps
  const active = telephoneActive(state)
  const actionType = state.phase === 'contributing' ? telephoneActionTypeForRound(state.round) : null

  let received: TelephoneContribution | null = null
  if (state.phase === 'contributing' && state.round >= 1) {
    const viewerIdx = state.players.findIndex((p) => p.id === viewerId)
    if (viewerIdx >= 0) {
      const ownerId = assignedChainOwnerId(state, viewerIdx, state.round)
      received = state.chains[ownerId]?.[state.round - 1] ?? null
    }
  }

  return {
    ...rest,
    phaseKey: phaseKey(state),
    submittedCount: state.submittedIds.length,
    totalToSubmit: active.length,
    haveISubmitted: state.submittedIds.includes(viewerId),
    received,
    actionType,
    revealChain: buildRevealChain(state),
    players: players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, leftAt: p.leftAt })),
  }
}

/**
 * Vue SPECTATEUR NEUTRE (TV) : jamais de maillon personnel (rien à «
 * recevoir »), juste le compte de soumissions pendant le jeu — et la
 * vitrine complète pendant `reveal`.
 */
export function toTelephoneSpectatorView(state: TelephoneState): TelephoneClientView {
  const { rngState: _rng, chains: _chains, pendingSubmissions: _ps, players, ...rest } = state
  void _rng
  void _chains
  void _ps
  const active = telephoneActive(state)
  const actionType = state.phase === 'contributing' ? telephoneActionTypeForRound(state.round) : null
  return {
    ...rest,
    phaseKey: phaseKey(state),
    submittedCount: state.submittedIds.length,
    totalToSubmit: active.length,
    haveISubmitted: false,
    received: null,
    actionType,
    revealChain: buildRevealChain(state),
    players: players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, leftAt: p.leftAt })),
  }
}
