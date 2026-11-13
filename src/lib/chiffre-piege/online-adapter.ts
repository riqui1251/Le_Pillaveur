import type { GameAdapter, ServiceTick, ServiceTickOptions } from '@/lib/online/game-adapters'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import {
  applyChiffrePiegeRoomAction,
  chiffrePiegeClientViewJson,
  chiffrePiegeSpectatorViewJson,
  convertChiffrePiegePlayerToBot,
  markChiffrePiegePlayerLeft,
  parseChiffrePiegeState,
  rejoinChiffrePiegePlayer,
  serializeChiffrePiegeState,
  toChiffrePiegeClientView,
  type ChiffrePiegeRoomActionInput,
} from './server-adapter'
import {
  CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS,
  CHIFFRE_PIEGE_ONLINE_MIN_PLAYERS,
  chiffrePiegeBotTickDelayMs,
  currentChiffrePiegeActorId,
  type ChiffrePiegeOnlineState,
} from './online-state'

// ─── Ticks de service : copie des helpers internes de game-adapters.ts ──────
// (non exportés là-bas ; import de TYPE seulement, aucun cycle à l'exécution).

/** Le serveur prend la BORNE HAUTE du tempo d'un bot : il reste un filet derrière le téléphone arbitre. */
const SERVICE_TEMPO = (): number => 1

type ServicePlayer = { id: string; name?: string; isBot?: boolean; leftAt?: number | null }

/** Tick « advance » à l'échéance de la phase courante (null : phase sans chrono). */
function advanceAt(state: TimedPhaseState, dueAt: number | null = state.phaseEndsAt): ServiceTick | null {
  return dueAt === null ? null : { body: { action: 'advance', phaseKey: phaseKey(state) }, dueAt }
}

/** Retient le PREMIER dû entre bot et échéance ; à égalité, le bot. Aucun humain présent → null. */
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

// ─── Le Chiffre Piégé ────────────────────────────────────────────────────────

/** Courses attendues entre téléphones et serveur : 409, muettes chez le joueur. */
const CONFLICT_CODES = new Set([
  'NOTHING_TO_REPLACE',
  'NOT_EXPIRED',
  'PHASE_CHANGED',
  'NO_DEADLINE',
  'NOTHING_TO_ADVANCE',
  'NOT_BOT_TURN',
])

/** Corps HTTP → intention ; null si mal formé (400 `invalid_action`). */
function readInput(body: Record<string, unknown>): ChiffrePiegeRoomActionInput | null {
  switch (body.action) {
    case 'guess':
      return typeof body.value === 'number' && Number.isInteger(body.value) ? { type: 'guess', value: body.value } : null
    case 'pass':
      return { type: 'pass' }
    case 'next':
      return typeof body.phaseKey === 'string' ? { type: 'next', phaseKey: body.phaseKey } : null
    case 'advance':
      return typeof body.phaseKey === 'string' ? { type: 'advance', phaseKey: body.phaseKey } : null
    case 'bot':
      return { type: 'bot' }
    case 'replace-left':
      return { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    default:
      return null
  }
}

/**
 * Le Chiffre Piégé dans le registre des jeux en ligne (GAME_ADAPTERS) :
 * tour par tour, un seul secret (le piège) que ni les téléphones ni la TV ne
 * reçoivent avant le BOUM. Bots au tour via `useBotReferee` et le filet du
 * serveur ; BOUM chronométré via `useAdvanceTick` et `advanceAt`.
 */
export const chiffrePiegeAdapter: GameAdapter = {
  minPlayers: CHIFFRE_PIEGE_ONLINE_MIN_PLAYERS,
  maxPlayers: CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseChiffrePiegeState(json),
  serialize: (state) => serializeChiffrePiegeState(state as ChiffrePiegeOnlineState),
  applyAction(rawState, userId, body) {
    const input = readInput(body)
    if (!input) return { ok: false, error: 'invalid_action', status: 400 }
    const result = applyChiffrePiegeRoomAction(rawState as ChiffrePiegeOnlineState, userId, input, Date.now())
    if (!result.ok) return { ok: false, error: result.error, status: CONFLICT_CODES.has(result.error) ? 409 : 403 }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertChiffrePiegePlayerToBot(state as ChiffrePiegeOnlineState, userId),
  isFinished: (state) => (state as ChiffrePiegeOnlineState).phase === 'finished',
  currentActorId: (state) => currentChiffrePiegeActorId(state as ChiffrePiegeOnlineState),
  clientViewJson: (state) => chiffrePiegeClientViewJson(state as ChiffrePiegeOnlineState),
  spectatorViewJson: (state) => chiffrePiegeSpectatorViewJson(state as ChiffrePiegeOnlineState),
  actionResponse: (state) => ({
    view: toChiffrePiegeClientView(state as ChiffrePiegeOnlineState),
    viewJson: chiffrePiegeClientViewJson(state as ChiffrePiegeOnlineState),
  }),
  markLeft: (state, userId, at) => markChiffrePiegePlayerLeft(state as ChiffrePiegeOnlineState, userId, at),
  rejoin: (state, userId) => rejoinChiffrePiegePlayer(state as ChiffrePiegeOnlineState, userId),
  // ChiffrePiegeOnline : bot au tour (même formule que son botTick) et
  // échéance du BOUM (même clé que son useAdvanceTick).
  serviceTick(rawState, now, options) {
    const state = rawState as ChiffrePiegeOnlineState
    return serviceTickOf(state.players, now, options, {
      advance: advanceAt(state),
      botDelayMs: (rand) => chiffrePiegeBotTickDelayMs(state, rand),
    })
  },
}
