import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import { sanitizeStrokes, type Stroke } from '@/lib/crobard/engine'
import type { BotSpeech, SpeechMove } from '@/lib/online/bot-speech'

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
 * chaque chaîne est révélée dans l'ordre, une à la fois, maillon par maillon.
 */

export const TELEPHONE_MIN_PLAYERS = 3
export const TELEPHONE_MAX_PLAYERS = 8
/** Compte à rebours d'échauffement au lancement. */
export const TELEPHONE_COUNTDOWN_MS = 5_000
/** Durée d'une manche d'écriture. */
export const TELEPHONE_WRITE_MS = 60_000
/** Durée d'une manche de dessin. */
export const TELEPHONE_DRAW_MS = 80_000
/**
 * Durée d'affichage d'une chaîne ENTIÈREMENT dévoilée, avant la suivante. La
 * révélation est le moment qui fait tout l'intérêt du jeu : elle ne doit
 * dépendre d'AUCUN joueur en particulier. Le meneur garde la main (il dévoile
 * quand il veut, et revient à la chaîne précédente), mais l'horloge de phase
 * serveur prend le relais s'il est absent, endormi ou déconnecté — sans
 * jamais accélérer le déroulé normal, puisque le meneur passe toujours AVANT
 * l'échéance.
 */
export const TELEPHONE_REVEAL_MS = 45_000
/**
 * Délai de l'horloge entre deux maillons d'une même chaîne. La chaîne se
 * dévoile maillon par maillon : d'un bloc, chacun lisait la chute à son
 * rythme et le fou rire collectif se diluait.
 */
export const TELEPHONE_REVEAL_LINK_MS = 15_000
/**
 * Cadence d'un bot meneur du reveal : le temps de regarder un maillon, et
 * plus long sur la chaîne entière — d'un pas égal, il passait à la chaîne
 * suivante aussitôt la chute affichée, en plein fou rire.
 */
export const TELEPHONE_BOT_REVEAL_LINK_MS = 4_000
export const TELEPHONE_BOT_REVEAL_CHAIN_MS = 8_000
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

/**
 * Parole PUBLIQUE d'un bot (`botSay.<kind>` sous games.telephone-dessine.game)
 * — ici, un déserteur converti —, écrite par l'adaptateur dans la MÊME
 * écriture que le cran qui dévoile la chute d'une chaîne, et jamais avant :
 * le contenu d'une chaîne reste secret jusqu'à sa révélation entière.
 *   • laugh : on s'esclaffe devant la chaîne d'un autre ;
 *   • mine : c'était SA chaîne (« rendez-moi ma phrase ! ») ;
 *   • intact : la phrase d'arrivée est celle de départ ;
 *   • encore : la dernière chaîne vient de tomber, on en redemande.
 * `round` vaut `telephoneSpeechRound` : une « manche » de paroles par
 * chaîne révélée. Aucune phrase dans l'état, toute parole a une cible.
 */
export type TelephoneSpeechKind = 'laugh' | 'mine' | 'intact' | 'encore'
export type TelephoneSpeech = BotSpeech<TelephoneSpeechKind>
export type TelephoneSayMove = SpeechMove<TelephoneSpeechKind>

export const TELEPHONE_SPEECH_KINDS = ['laugh', 'mine', 'intact', 'encore'] as const satisfies readonly TelephoneSpeechKind[]
/** Paroles max par bot et par chaîne révélée ; le bavardage borne en dessous. */
export const TELEPHONE_SPEECH_CAP = 2

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
  /** Dernier maillon dévoilé de la chaîne affichée (0 = seulement le premier). */
  revealLinkIdx: number
  rematchVotes: string[]
  /** SECRET serveur — sert UNIQUEMENT à l'ordre de reveal, aucun tirage de contenu. */
  rngState: number
  /**
   * PUBLIC — paroles des bots, nées à la révélation seulement (une chaîne
   * entière à l'écran) : quelques-unes par partie, gardées jusqu'à la fin
   * pour qu'une chaîne revue garde sa bulle. Optionnel : un état sérialisé
   * avant leur arrivée n'en a pas (parseTelephoneState complète).
   */
  speech?: TelephoneSpeech[]
}

export type TelephoneAction =
  | { type: 'WRITE'; playerId: string; text: string; now: number }
  | { type: 'DRAW_STROKE'; playerId: string; stroke: Stroke }
  | { type: 'CLEAR'; playerId: string }
  | { type: 'SUBMIT'; playerId: string; strokes?: Stroke[]; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  /**
   * `claimedKey` : clé de phase de la vue du meneur. Absente (bots, vieux
   * clients), le cran s'applique à l'état courant.
   */
  | { type: 'CONTINUE'; playerId: string; now: number; claimedKey?: string }
  | { type: 'PREVIOUS'; playerId: string; now: number; claimedKey?: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }
  /** Paroles de bots (jamais d'un humain : l'adaptateur HTTP ne la mappe pas). */
  | { type: 'SAY'; moves: TelephoneSayMove[] }

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

/** Index du dernier maillon de la chaîne `revealIdx` (0 pour une chaîne vide). */
export function telephoneRevealLastLinkIdx(
  state: Pick<TelephoneState, 'chains' | 'revealOrder'>,
  revealIdx: number
): number {
  const ownerId = state.revealOrder[revealIdx]
  return Math.max(0, (ownerId ? state.chains[ownerId]?.length ?? 0 : 0) - 1)
}

/** Délai du prochain cran d'un bot meneur (tick de service serveur). */
export function telephoneBotRevealDelayMs(
  state: Pick<TelephoneState, 'chains' | 'revealOrder' | 'revealIdx' | 'revealLinkIdx'>
): number {
  return state.revealLinkIdx >= telephoneRevealLastLinkIdx(state, state.revealIdx)
    ? TELEPHONE_BOT_REVEAL_CHAIN_MS
    : TELEPHONE_BOT_REVEAL_LINK_MS
}

/**
 * « Manche » des paroles : une par chaîne révélée, après les manches de
 * contribution (où personne ne parle) — le fil ne montre que la chaîne à
 * l'écran.
 */
export function telephoneSpeechRound(
  state: Pick<TelephoneState, 'phase' | 'round' | 'totalRounds' | 'revealIdx'>
): number {
  return state.phase === 'reveal' || state.phase === 'finished' ? state.totalRounds + state.revealIdx : state.round
}

/** Une phrase ramenée à l'essentiel : casse, accents, ponctuation et espaces ignorés. */
function telephoneNormalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** La phrase d'arrivée est celle de départ (première et dernière phrases non vides, au mot près). */
export function telephoneChainIntact(links: readonly TelephoneContribution[]): boolean {
  const texts = links.filter((l): l is { type: 'text'; text: string } => l.type === 'text')
  if (texts.length < 2 || links[links.length - 1]?.type !== 'text') return false
  const first = telephoneNormalize(texts[0].text)
  return first !== '' && first === telephoneNormalize(texts[texts.length - 1].text)
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
    revealLinkIdx: 0,
    rematchVotes: [],
    rngState: rng.getState(),
    speech: [],
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Assigne les contributions de la manche courante aux chaînes, puis avance. */
function resolveRound(state: TelephoneState, now: number): TelephoneState {
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
    const firstChainDone = telephoneRevealLastLinkIdx({ chains, revealOrder }, 0) === 0
    return {
      ...state,
      chains,
      pendingSubmissions: {},
      submittedIds: [],
      revealOrder,
      revealIdx: 0,
      revealLinkIdx: 0,
      ...enterPhase(state.phaseSeq, 'reveal', revealDurationMs(firstChainDone), now),
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

/** Échéance d'un cran de révélation : courte entre deux maillons, pleine sur la chaîne entière. */
function revealDurationMs(chainComplete: boolean): number {
  return chainComplete ? TELEPHONE_REVEAL_MS : TELEPHONE_REVEAL_LINK_MS
}

/**
 * Cran suivant de la révélation : le maillon d'après, ou — chaîne entière à
 * l'écran — la chaîne suivante à partir de son premier maillon (la fin de
 * partie après la dernière). Chaque cran REARME l'échéance, qu'on y arrive
 * par le bouton du meneur ou par l'horloge serveur.
 */
function revealForward(state: TelephoneState, now: number): TelephoneState {
  const lastLinkIdx = telephoneRevealLastLinkIdx(state, state.revealIdx)
  if (state.revealLinkIdx < lastLinkIdx) {
    const revealLinkIdx = state.revealLinkIdx + 1
    return {
      ...state,
      revealLinkIdx,
      ...enterPhase(state.phaseSeq, 'reveal', revealDurationMs(revealLinkIdx >= lastLinkIdx), now),
      phase: 'reveal',
      version: state.version + 1,
    }
  }
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
  const nextChainDone = telephoneRevealLastLinkIdx(state, nextIdx) === 0
  return {
    ...state,
    revealIdx: nextIdx,
    revealLinkIdx: 0,
    ...enterPhase(state.phaseSeq, 'reveal', revealDurationMs(nextChainDone), now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

/** Retour à la chaîne précédente, déjà vue : elle revient ENTIÈRE, sans redévoiler ses maillons. */
function revealBack(state: TelephoneState, now: number): TelephoneState {
  const prevIdx = state.revealIdx - 1
  if (prevIdx < 0) throw new TelephoneEngineError('ALREADY_FIRST_CHAIN')
  return {
    ...state,
    revealIdx: prevIdx,
    revealLinkIdx: telephoneRevealLastLinkIdx(state, prevIdx),
    ...enterPhase(state.phaseSeq, 'reveal', TELEPHONE_REVEAL_MS, now),
    phase: 'reveal',
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
      // Révélation : l'échéance dévoile le cran suivant MÊME si le meneur a
      // disparu — c'est ce qui empêche la table de rester bloquée sur le
      // moment le plus attendu du jeu.
      if (state.phase === 'reveal') {
        return revealForward(state, action.now)
      }
      throw new TelephoneEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      // Idempotent comme ADVANCE : le geste du meneur qui croise l'échéance
      // vise un cran déjà passé, il ne doit pas en faire franchir un second.
      if (action.claimedKey && action.claimedKey !== phaseKey(state)) {
        throw new TelephoneEngineError('PHASE_CHANGED')
      }
      if (state.phase !== 'reveal') throw new TelephoneEngineError('NOT_REVEAL')
      if (action.playerId !== currentTelephoneActorId(state)) throw new TelephoneEngineError('NOT_LEADER')
      return revealForward(state, action.now)
    }

    case 'PREVIOUS': {
      if (action.claimedKey && action.claimedKey !== phaseKey(state)) {
        throw new TelephoneEngineError('PHASE_CHANGED')
      }
      if (state.phase !== 'reveal') throw new TelephoneEngineError('NOT_REVEAL')
      if (action.playerId !== currentTelephoneActorId(state)) throw new TelephoneEngineError('NOT_LEADER')
      return revealBack(state, action.now)
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

    case 'SAY': {
      // Seule une chaîne ENTIÈRE à l'écran se commente : rien de ce qui reste
      // secret (maillons à venir, chaînes en cours) ne peut nourrir une parole.
      if (state.phase !== 'reveal') throw new TelephoneEngineError('NOT_SPEECH_PHASE')
      if (state.revealLinkIdx < telephoneRevealLastLinkIdx(state, state.revealIdx)) {
        throw new TelephoneEngineError('CHAIN_NOT_REVEALED')
      }
      if (action.moves.length === 0) return state
      const ownerId = state.revealOrder[state.revealIdx]
      const round = telephoneSpeechRound(state)
      let speech = state.speech ?? []
      for (const move of action.moves) {
        if (!(TELEPHONE_SPEECH_KINDS as readonly string[]).includes(move.kind)) {
          throw new TelephoneEngineError('INVALID_KIND')
        }
        const actor = state.players.find((p) => p.id === move.playerId)
        if (!actor?.isBot || actor.leftAt) throw new TelephoneEngineError('NOT_BOT')
        const target = state.players.find((p) => p.id === move.targetId)
        if (!target || target.id === actor.id || target.leftAt) throw new TelephoneEngineError('INVALID_TARGET')
        const kindFits =
          move.kind === 'mine'
            ? actor.id === ownerId
            : move.kind === 'laugh'
              ? actor.id !== ownerId
              : move.kind === 'intact'
                ? telephoneChainIntact(state.chains[ownerId] ?? [])
                : state.revealIdx === state.revealOrder.length - 1
        if (!kindFits) throw new TelephoneEngineError('INVALID_KIND')
        const mine = speech.filter((sp) => sp.playerId === actor.id && sp.round === round)
        if (mine.length >= TELEPHONE_SPEECH_CAP) throw new TelephoneEngineError('ALREADY_SPOKE')
        speech = [...speech, { playerId: actor.id, kind: move.kind, targetId: target.id, round }]
      }
      return { ...state, speech, version: state.version + 1 }
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
  /**
   * Pendant reveal/finished : la chaîne affichée, publique. En reveal,
   * `links` s'arrête au dernier maillon DÉVOILÉ (la suite ne quitte pas le
   * serveur avant son tour) ; `linkCount` donne sa longueur totale.
   */
  revealChain: TelephoneRevealChain | null
}

export type TelephoneRevealChain = {
  ownerName: string
  links: TelephoneContribution[]
  linkCount: number
}

function buildRevealChain(state: TelephoneState): TelephoneRevealChain | null {
  if (state.phase !== 'reveal' && state.phase !== 'finished') return null
  const ownerId = state.revealOrder[state.revealIdx]
  if (!ownerId) return null
  const owner = state.players.find((p) => p.id === ownerId)
  const all = state.chains[ownerId] ?? []
  const links = state.phase === 'reveal' ? all.slice(0, Math.max(0, state.revealLinkIdx) + 1) : all
  return { ownerName: owner?.name ?? '—', links, linkCount: all.length }
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
 * recevoir »), juste le compte de soumissions pendant le jeu — et, pendant
 * `reveal`, la chaîne affichée jusqu'à son dernier maillon dévoilé.
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
