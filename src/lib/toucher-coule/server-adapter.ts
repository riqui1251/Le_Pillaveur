import {
  advanceTCBots,
  createInitialTCState,
  reduceTC,
  toTCClientView,
  TCEngineError,
  TC_BOT_NAMES,
  TC_MODES,
  type TCClientView,
  type TCInitialPlayer,
  type TCMode,
  type TCState,
  type TeamId,
} from './engine'

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

export type TCRoomActionResult = { ok: true; state: TCState } | { ok: false; error: string }

/** Applique l'action d'un humain puis fait jouer les bots jusqu'au prochain humain. */
export function applyTCRoomAction(
  state: TCState,
  userId: string,
  input: TCRoomActionInput
): TCRoomActionResult {
  try {
    const afterHuman =
      input.type === 'place'
        ? reduceTC(state, { type: 'PLACE', playerId: userId, ships: input.ships })
        : reduceTC(state, { type: 'FIRE', playerId: userId, cell: input.cell })
    return { ok: true, state: advanceTCBots(afterHuman) }
  } catch (e) {
    return { ok: false, error: e instanceof TCEngineError ? e.message : 'ENGINE_ERROR' }
  }
}

export function tcClientViewJson(state: TCState, viewerUserId: string): string {
  return JSON.stringify(toTCClientView(state, viewerUserId))
}

export type { TCClientView }
