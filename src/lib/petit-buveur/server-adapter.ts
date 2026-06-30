import { createInitialState, type EngineState, type EngineSettings } from './engine'
import { DEFI_DRINKS } from './game-data'
import type { Difficulty } from './types'

/**
 * Pont entre une salle en ligne (`OnlineRoom` + membres) et le moteur pur.
 *
 * Côté serveur uniquement. L'identifiant moteur d'un joueur est son `userId`,
 * ce qui permet de valider le tour via `currentPlayerId(state) === user.id`.
 *
 * ANTI-TRICHE : la vue envoyée au client masque `rngState`. Sans cela, un client
 * pourrait rejouer le générateur et prédire les prochains dés / cases.
 */

export interface RoomMemberLite {
  userId: string
  displayName: string
}

export function buildPetitBuveurEngineState(
  members: RoomMemberLite[],
  difficulty: Difficulty,
  seed: string | number
): EngineState {
  const settings: EngineSettings = { difficulty, defiDrinks: DEFI_DRINKS }
  const players = members.map((m) => ({ id: m.userId, name: m.displayName }))
  return createInitialState(players, settings, seed)
}

export function serializeEngineState(state: EngineState): string {
  return JSON.stringify(state)
}

export function parseEngineState(json: string | null): EngineState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as EngineState
    if (!parsed || !Array.isArray(parsed.players)) return null
    return parsed
  } catch {
    return null
  }
}

/** Vue client : tout l'état SAUF `rngState` (secret serveur). */
export type EngineClientView = Omit<EngineState, 'rngState'>

export function toClientView(state: EngineState): EngineClientView {
  const view: EngineState = { ...state }
  delete (view as Partial<EngineState>).rngState
  return view as EngineClientView
}
