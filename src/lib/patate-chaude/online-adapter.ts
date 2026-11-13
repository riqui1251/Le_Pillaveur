import type { GameAdapter, ServiceTick, ServiceTickOptions } from '@/lib/online/game-adapters'
import { phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import {
  PC_ONLINE_MAX_PLAYERS,
  PC_ONLINE_MIN_PLAYERS,
  currentPcActorId,
  toPcClientView,
  type PcOnlineState,
} from './online-shared'
import {
  applyPcRoomAction,
  markPcPlayerLeft,
  parsePcState,
  pcClientViewJson,
  pcSpectatorViewJson,
  rejoinPcPlayer,
  serializePcState,
  type PcRoomActionInput,
} from './server-adapter'

// ─── Copie locale des aides de src/lib/online/game-adapters.ts (non exportées là-bas) ───

const SERVICE_TEMPO = (): number => 1

type ServicePlayer = { id: string; name?: string; isBot?: boolean; leftAt?: number | null }

function advanceAt(state: TimedPhaseState, dueAt: number | null = state.phaseEndsAt): ServiceTick | null {
  return dueAt === null ? null : { body: { action: 'advance', phaseKey: phaseKey(state) }, dueAt }
}

function serviceTickOf(
  players: readonly ServicePlayer[],
  now: number,
  options: ServiceTickOptions | undefined,
  ticks: { advance?: ServiceTick | null; botDelayMs?: (rand: () => number) => number | null }
): ServiceTick | null {
  if (!players.some((p) => !p.isBot && !p.leftAt)) return null
  const advance = ticks.advance ?? null
  const delayMs = options?.skipBot || !ticks.botDelayMs ? null : ticks.botDelayMs(options?.rand ?? SERVICE_TEMPO)
  const bot: ServiceTick | null = delayMs === null ? null : { body: { action: 'bot' }, dueAt: now + delayMs }
  if (!bot || !advance) return bot ?? advance
  return bot.dueAt <= advance.dueAt ? bot : advance
}

// ─── Refus ───────────────────────────────────────────────────────────────────

/** Courses attendues (tick concurrent, passe partie juste avant le BOUM, double toucher…) : 409, muettes chez le client. */
const RACES: ReadonlySet<string> = new Set([
  'WRONG_PHASE',
  'NOTHING_TO_CONTEST',
  'NOT_EXPIRED',
  'PHASE_CHANGED',
  'NO_DEADLINE',
  'NOTHING_TO_ADVANCE',
  'NOT_SET_ASIDE',
  // Signe « mot tenté » déjà noté ou devenu sans objet : il n'est jamais montré au joueur.
  'NOTHING_TO_NOTE',
  'NOT_BOT_TURN',
  'NOTHING_TO_REPLACE',
])

/**
 * Refus du moteur → code stable de src/lib/online-errors.ts, traduit chez le joueur. Les codes
 * propres au jeu sont traduits ICI et non par LEGACY_ALIASES : le Petit Bac lève déjà
 * ALREADY_CONTESTED, NOTHING_TO_CONTEST et CONTEST_NEEDS_MORE_PLAYERS (« … une réponse »), un
 * alias global changerait ses messages ou parlerait de réponses ici.
 */
const STABLE_CODES: Readonly<Record<string, string>> = {
  WORD_TOO_SHORT: 'word_too_short',
  WORD_TOO_LONG: 'word_too_long',
  WORD_ALREADY_SAID: 'word_already_said',
  WORD_WRONG_LETTER: 'word_wrong_letter',
  WORD_MISSING_SYLLABLE: 'word_missing_syllable',
  NOT_HOLDER: 'not_your_turn',
  OWN_WORD: 'contest_unavailable',
  HOLDER_CANNOT_CONTEST: 'contest_unavailable',
  CONTEST_NEEDS_MORE_PLAYERS: 'contest_unavailable',
  ALREADY_CONTESTED: 'contest_unavailable',
}

export function pcActionError(code: string): { ok: false; error: string; status: number } {
  if (RACES.has(code)) return { ok: false, error: code, status: 409 }
  return { ok: false, error: STABLE_CODES[code] ?? code, status: 403 }
}

/** Corps HTTP → intention ; null si mal formé. */
function readInput(body: Record<string, unknown>): PcRoomActionInput | null {
  if (body.action === 'pass' && typeof body.word === 'string') return { type: 'pass', word: body.word }
  if (body.action === 'contest' && typeof body.index === 'number' && Number.isInteger(body.index)) {
    return { type: 'contest', index: body.index }
  }
  if (body.action === 'advance' && typeof body.phaseKey === 'string') return { type: 'advance', phaseKey: body.phaseKey }
  if (body.action === 'end') return { type: 'end' }
  if (body.action === 'resume') return { type: 'resume' }
  if (body.action === 'attempt') return { type: 'attempt' }
  if (body.action === 'bot') return { type: 'bot' }
  if (body.action === 'replace-left') return { type: 'replace-left' }
  return null
}

// ─── Adaptateur ──────────────────────────────────────────────────────────────

export const patateChaudeAdapter: GameAdapter = {
  // Pas de complément par bots (botsFillable absent) : un bot ne trouve pas de mots. Le lancement
  // exige deux humains ; « Rejouer » aussi (garde de processRematchVote).
  minPlayers: PC_ONLINE_MIN_PLAYERS,
  maxPlayers: PC_ONLINE_MAX_PLAYERS,
  parse: (json) => parsePcState(json),
  serialize: (state) => serializePcState(state as PcOnlineState),
  applyAction(rawState, userId, body) {
    const input = readInput(body)
    if (!input) return { ok: false, error: 'invalid_action', status: 400 }
    const result = applyPcRoomAction(rawState as PcOnlineState, userId, input, Date.now())
    return result.ok ? { ok: true, state: result.state } : pcActionError(result.error)
  },
  // Aucun bot ne joue à Patate Chaude : un porteur inactif explose, puis le moteur le met de
  // côté (deux explosions sans rien jouer, jamais à deux) jusqu'à son « Je suis là ». Rien à remplacer.
  convertToBot: () => null,
  isFinished: (state) => (state as PcOnlineState).phase === 'finished',
  currentActorId: (state) => currentPcActorId(state as PcOnlineState),
  clientViewJson: (state) => pcClientViewJson(state as PcOnlineState),
  spectatorViewJson: (state) => pcSpectatorViewJson(state as PcOnlineState),
  actionResponse: (state) => ({
    view: toPcClientView(state as PcOnlineState),
    viewJson: pcClientViewJson(state as PcOnlineState),
  }),
  markLeft: (state, userId, at) => markPcPlayerLeft(state as PcOnlineState, userId, at),
  rejoin: (state, userId) => rejoinPcPlayer(state as PcOnlineState, userId),
  // PatateChaudeOnline : compte à rebours et écran du BOUM (échéances publiques, aussi tirées
  // par useAdvanceTick). Pendant la mèche, le client ignore l'échéance : ce tick est SEUL à
  // faire exploser la bombe d'un porteur qui ne joue plus.
  serviceTick(rawState, now, options) {
    const state = rawState as PcOnlineState
    if (state.phase === 'finished') return null
    const advance = state.phase === 'burning' ? advanceAt(state, state.game.explodeAt) : advanceAt(state)
    return serviceTickOf(state.players, now, options, { advance })
  },
}
