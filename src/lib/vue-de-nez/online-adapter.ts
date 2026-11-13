import type { GameAdapter, ServiceTick, ServiceTickOptions } from '@/lib/online/game-adapters'
import { phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import { botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { VDN_MIN_PLAYERS } from './engine'
import { VDN_ONLINE_MAX_PLAYERS, vdnBotDueAt, vdnPendingBot } from './online-view'
import {
  applyVdnRoomAction,
  convertVdnPlayerToBot,
  markVdnPlayerLeft,
  parseVdnOnlineState,
  rejoinVdnPlayer,
  serializeVdnOnlineState,
  toVdnClientView,
  vdnClientViewJson,
  vdnPlayerRows,
  vdnSpectatorViewJson,
  type VdnOnlineState,
  type VdnRoomActionInput,
} from './server-adapter'

/**
 * Entrée du registre des jeux en ligne (src/lib/online/game-adapters.ts) pour
 * À Vue de Nez. Les aides de tick ci-dessous sont des COPIES de celles du
 * registre, qui ne les exporte pas ; elles doivent rester identiques.
 */

/** Le serveur prend la BORNE HAUTE du tempo d'un bot : un client arbitre éveillé tire toujours avant lui. */
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

/** Courses attendues entre arbitres, ticks et joueurs : 409, muettes côté client. */
const CONFLICTS: ReadonlySet<string> = new Set([
  'NOTHING_TO_REPLACE',
  'NOT_EXPIRED',
  'PHASE_CHANGED',
  'NO_DEADLINE',
  'NOTHING_TO_ADVANCE',
  'NOT_BOT_TURN',
  // Estimation ou « Question suivante » arrivée juste après le changement de phase.
  'WRONG_PHASE',
])

/** Une estimation illisible : le téléphone les filtre déjà, c'est un corps mal formé. */
const MALFORMED: ReadonlySet<string> = new Set(['NOT_A_NUMBER', 'TOO_LARGE', 'BELOW_MIN'])

function inputOf(body: Record<string, unknown>): VdnRoomActionInput | null {
  switch (body.action) {
    case 'estimate':
      return typeof body.value === 'number' && Number.isFinite(body.value) ? { type: 'estimate', value: body.value } : null
    case 'advance':
      return typeof body.phaseKey === 'string' ? { type: 'advance', phaseKey: body.phaseKey } : null
    case 'continue':
      return { type: 'continue' }
    case 'bot':
      return { type: 'bot' }
    case 'replace-left':
      return { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    default:
      return null
  }
}

export const vueDeNezAdapter: GameAdapter = {
  // Estimations simultanées ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildVdnOnlineState comble jusqu'à 2).
  minPlayers: VDN_MIN_PLAYERS,
  maxPlayers: VDN_ONLINE_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseVdnOnlineState(json),
  serialize: (state) => serializeVdnOnlineState(state as VdnOnlineState),
  applyAction(rawState, userId, body) {
    const input = inputOf(body)
    if (!input) return { ok: false, error: 'invalid_action', status: 400 }
    const result = applyVdnRoomAction(rawState as VdnOnlineState, userId, input)
    if (result.ok) return { ok: true, state: result.state }
    if (MALFORMED.has(result.error)) return { ok: false, error: 'invalid_action', status: 400 }
    return { ok: false, error: result.error, status: CONFLICTS.has(result.error) ? 409 : 403 }
  },
  convertToBot: (state, userId) => convertVdnPlayerToBot(state as VdnOnlineState, userId),
  isFinished: (state) => (state as VdnOnlineState).phase === 'finished',
  // Phases simultanées : personne « au tour », l'échéance fait l'arbitre (pas d'anti-AFK).
  currentActorId: () => null,
  clientViewJson: (state, viewerId) => vdnClientViewJson(state as VdnOnlineState, viewerId),
  spectatorViewJson: (state) => vdnSpectatorViewJson(state as VdnOnlineState),
  actionResponse: (state, viewerId) => ({
    view: toVdnClientView(state as VdnOnlineState, viewerId),
    viewJson: vdnClientViewJson(state as VdnOnlineState, viewerId),
  }),
  markLeft: (state, userId, at) => markVdnPlayerLeft(state as VdnOnlineState, userId, at),
  rejoin: (state, userId) => rejoinVdnPlayer(state as VdnOnlineState, userId),
  // VueDeNezOnline : échéance de phase (useAdvanceTick) + un bot en attente au
  // tempo de son persona compté depuis le début de la question (useBotReferee,
  // vdnBotDueAt) — MÊME formule de délai.
  serviceTick(rawState, now, options) {
    const state = rawState as VdnOnlineState
    const pending = vdnPendingBot(state.phase, vdnPlayerRows(state))
    return serviceTickOf(state.players, now, options, {
      advance: advanceAt(state),
      botDelayMs: (rand) =>
        pending ? vdnBotDueAt(state.phaseEndsAt, botTickDelayMs(pending.name, rand), now) - now : null,
    })
  },
}
