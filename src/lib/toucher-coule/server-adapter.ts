import {
  advanceTCBots,
  botChooseCell,
  createInitialTCState,
  currentTCPlayerId,
  placeTCBots,
  reduceTC,
  toTCClientView,
  toTCSpectatorView,
  TCEngineError,
  TC_BOT_NAMES,
  TC_MODES,
  type TCClientView,
  type TCInitialPlayer,
  type TCMode,
  type TCState,
  type TeamId,
} from './engine'
import { rngFromState } from '@/lib/petit-buveur/rng'

/**
 * Pont serveur entre une salle en ligne et le moteur Toucher-Coulé.
 * Même philosophie que le Petit Buveur : le serveur détient l'état, les bots
 * sont joués côté serveur, et la vue client masque les navires ennemis.
 */

export interface TCRoomMember {
  userId: string
  displayName: string
}

/**
 * Répartit humains + bots dans les deux équipes selon le mode.
 * Les choix d'équipe du lobby sont honorés tant qu'une équipe n'est pas pleine ;
 * le reste est équilibré automatiquement, puis les bots comblent les trous.
 */
export function buildTCPlayers(
  members: TCRoomMember[],
  mode: TCMode,
  teamChoices: Record<string, TeamId>
): TCInitialPlayer[] {
  const perTeam = TC_MODES[mode].playersPerTeam
  const capacity = perTeam * 2
  if (members.length > capacity) throw new TCEngineError('TOO_MANY_PLAYERS')

  const counts: Record<TeamId, number> = { A: 0, B: 0 }
  const players: TCInitialPlayer[] = []

  const withChoice = members.filter((m) => teamChoices[m.userId])
  const withoutChoice = members.filter((m) => !teamChoices[m.userId])

  for (const m of withChoice) {
    const wanted = teamChoices[m.userId]
    const team = counts[wanted] < perTeam ? wanted : wanted === 'A' ? 'B' : 'A'
    counts[team] += 1
    players.push({ id: m.userId, name: m.displayName, team, isBot: false })
  }
  for (const m of withoutChoice) {
    const team: TeamId = counts.A <= counts.B ? 'A' : 'B'
    counts[team] += 1
    players.push({ id: m.userId, name: m.displayName, team, isBot: false })
  }

  let botIndex = 0
  for (const team of ['A', 'B'] as TeamId[]) {
    while (counts[team] < perTeam) {
      players.push({
        id: `bot-${botIndex + 1}`,
        name: TC_BOT_NAMES[botIndex % TC_BOT_NAMES.length],
        team,
        isBot: true,
      })
      counts[team] += 1
      botIndex += 1
    }
  }

  return players
}

export function buildTCState(
  members: TCRoomMember[],
  mode: TCMode,
  teamChoices: Record<string, TeamId>,
  seed: string | number
): TCState {
  const players = buildTCPlayers(members, mode, teamChoices)
  // Les bots placent leurs navires immédiatement.
  return advanceTCBots(createInitialTCState(players, mode, seed))
}

export function serializeTCState(state: TCState): string {
  return JSON.stringify(state)
}

export function parseTCState(json: string | null): TCState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as TCState
    if (!parsed || !Array.isArray(parsed.players) || !parsed.shotsAt) return null
    return parsed
  } catch {
    return null
  }
}

export type TCRoomActionInput =
  | { type: 'place'; ships: number[][] }
  | { type: 'fire'; cell: number }
  /** Tick client : fait jouer UN SEUL tir de bot (rythme visible, pas d'enchaînement invisible). */
  | { type: 'bot' }
  /** Tick client : remplace par des bots les joueurs partis depuis plus de 3 min (horloge SERVEUR). */
  | { type: 'replace-left' }

export type TCRoomActionResult = { ok: true; state: TCState } | { ok: false; error: string }

/**
 * Applique une action de salle. Les bots ne jouent qu'UN tir à la fois via le
 * tick `bot` (déclenché par un client quand c'est le tour d'un bot) : chaque
 * tir de bot est donc un état diffusé séparément, visible par tous.
 */
export function applyTCRoomAction(
  state: TCState,
  userId: string,
  input: TCRoomActionInput
): TCRoomActionResult {
  try {
    if (input.type === 'replace-left') {
      const next = reduceTC(state, { type: 'REPLACE_LEFT', now: Date.now() })
      if (next === state) return { ok: false, error: 'NOTHING_TO_REPLACE' }
      // Un remplacé en phase placement doit poser ses navires immédiatement.
      return { ok: true, state: placeTCBots(next) }
    }
    if (input.type === 'bot') {
      const activeId = currentTCPlayerId(state)
      const active = state.players.find((p) => p.id === activeId)
      if (!active?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      const rng = rngFromState(state.rngState)
      const cell = botChooseCell(state, active.id, rng)
      const next = reduceTC({ ...state, rngState: rng.getState() }, {
        type: 'FIRE',
        playerId: active.id,
        cell,
      })
      return { ok: true, state: next }
    }
    const next =
      input.type === 'place'
        ? reduceTC(state, { type: 'PLACE', playerId: userId, ships: input.ships })
        : reduceTC(state, { type: 'FIRE', playerId: userId, cell: input.cell })
    return { ok: true, state: next }
  } catch (e) {
    return { ok: false, error: e instanceof TCEngineError ? e.message : 'ENGINE_ERROR' }
  }
}

/** Conversion directe en bot (joueur inactif expulsé — validation AFK côté route). */
export function convertTCPlayerToBot(state: TCState, playerId: string): TCState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  const next: TCState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
  // Si le remplacé n'avait pas encore placé ses navires, le bot le fait.
  return placeTCBots(next)
}

export function tcClientViewJson(state: TCState, viewerUserId: string): string {
  return JSON.stringify(toTCClientView(state, viewerUserId))
}

/** Vue spectateur neutre en JSON (écran TV) : aucun navire intact révélé. */
export function tcSpectatorViewJson(state: TCState): string {
  return JSON.stringify(toTCSpectatorView(state))
}

export type { TCClientView }
