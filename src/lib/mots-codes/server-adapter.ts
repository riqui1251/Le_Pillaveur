import {
  createMCState,
  currentMCActorId,
  mcSpymasterOf,
  reduceMC,
  toMCClientView,
  toMCSpectatorView,
  MCEngineError,
  MC_MAX_PLAYERS,
  type MCState,
  type MCTeam,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { getMCWords } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { censorChatMessage } from '@/lib/chat-moderation'

/**
 * Adaptateur serveur de Mots Codés : sérialisation, mapping HTTP → actions
 * moteur, vues anti-triche. Pas de bots de complément (un bot ne donne pas
 * d'indice) — seulement le remplacement en cours de partie.
 */

export interface MCRoomMember {
  userId: string
  displayName: string
}

/**
 * Construit l'état initial à partir des choix d'équipe du lobby (façon
 * Tabou/TC) ; les non-assignés sont répartis en équilibrant les effectifs.
 */
export function buildMCState(
  members: MCRoomMember[],
  teamChoices: Record<string, MCTeam>,
  lang: string | null | undefined,
  seed?: string | number
): MCState {
  if (members.length > MC_MAX_PLAYERS) throw new MCEngineError('TOO_MANY_PLAYERS')
  const counts = { gold: 0, red: 0 }
  const assigned = members.map((m) => {
    const choice = teamChoices[m.userId]
    if (choice === 'gold' || choice === 'red') {
      counts[choice] += 1
      return { id: m.userId, name: m.displayName, team: choice }
    }
    return { id: m.userId, name: m.displayName, team: null as MCTeam | null }
  })
  for (const p of assigned) {
    if (p.team) continue
    p.team = counts.gold <= counts.red ? 'gold' : 'red'
    counts[p.team] += 1
  }
  return createMCState(
    assigned.map((p) => ({ id: p.id, name: p.name, team: p.team as MCTeam })),
    getMCWords(lang),
    seed ?? randomSeed()
  )
}

/**
 * Prévision de la répartition (choix du lobby + auto-équilibrage) — permet à
 * la route launch de refuser proprement une table où une équipe aurait moins
 * de 2 joueurs (le moteur l'exigerait de toute façon, mais en 500).
 */
export function mcTeamCounts(
  memberIds: string[],
  teamChoices: Record<string, MCTeam>
): { gold: number; red: number } {
  const counts = { gold: 0, red: 0 }
  const unassigned: string[] = []
  for (const id of memberIds) {
    const choice = teamChoices[id]
    if (choice === 'gold' || choice === 'red') counts[choice] += 1
    else unassigned.push(id)
  }
  for (const _ of unassigned) {
    counts[counts.gold <= counts.red ? 'gold' : 'red'] += 1
  }
  return counts
}

export function serializeMCState(state: MCState): string {
  return JSON.stringify(state)
}

export function parseMCState(json: string | null): MCState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as MCState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type MCRoomActionInput =
  | { type: 'clue'; word: string; count: number }
  | { type: 'guess'; tile: number }
  | { type: 'pass' }
  | { type: 'advance'; phaseKey: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type MCRoomActionResult = { ok: true; state: MCState } | { ok: false; error: string }

export function applyMCRoomAction(
  state: MCState,
  userId: string,
  input: MCRoomActionInput
): MCRoomActionResult {
  try {
    switch (input.type) {
      case 'clue': {
        // Filtre de vulgarité : l'indice est le seul texte libre du jeu.
        const { text } = censorChatMessage(input.word)
        return {
          ok: true,
          state: reduceMC(state, {
            type: 'GIVE_CLUE',
            playerId: userId,
            word: text,
            count: input.count,
            now: Date.now(),
          }),
        }
      }
      case 'guess':
        return {
          ok: true,
          state: reduceMC(state, {
            type: 'GUESS',
            playerId: userId,
            tile: input.tile,
            now: Date.now(),
          }),
        }
      case 'pass':
        return {
          ok: true,
          state: reduceMC(state, { type: 'PASS', playerId: userId, now: Date.now() }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceMC(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'bot':
        return applyMCBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceMC(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof MCEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markMCPlayerLeft(state: MCState, playerId: string, at: number): MCState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceMC(state, { type: 'LEAVE', playerId, at })
}

export function rejoinMCPlayer(state: MCState, playerId: string): MCState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceMC(state, { type: 'REJOIN', playerId })
}

export function convertMCPlayerToBot(state: MCState, playerId: string): MCState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  let players = state.players.map((p) =>
    p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
  )
  // Même règle que REPLACE_LEFT : le rôle de maître-mot revient à un humain.
  if (player.isSpymaster) {
    const human = players.find((p) => p.team === player.team && !p.isBot && !p.leftAt)
    if (human) {
      players = players.map((p) =>
        p.team !== player.team ? p : { ...p, isSpymaster: p.id === human.id }
      )
    }
  }
  return { ...state, players, version: state.version + 1 }
}

export function mcClientViewJson(state: MCState, viewerId: string): string {
  return JSON.stringify(toMCClientView(state, viewerId))
}

export function mcSpectatorViewJson(state: MCState): string {
  return JSON.stringify(toMCSpectatorView(state))
}

// ─── Bots (remplacement uniquement) ──────────────────────────────────────────

/**
 * Un maître-mot bot rend la main sans indice ; une équipe de devineurs 100 %
 * bots passe son tour. Aucun bot ne « devine » (il saboterait sa table).
 */
export function applyMCBotAction(state: MCState): MCRoomActionResult {
  try {
    if (state.phase === 'clue') {
      const master = mcSpymasterOf(state, state.activeTeam)
      if (!master?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceMC(state, { type: 'SKIP_TURN', playerId: master.id, now: Date.now() }),
      }
    }
    if (state.phase === 'guess') {
      const guessers = state.players.filter(
        (p) => p.team === state.activeTeam && !p.isSpymaster && !p.leftAt
      )
      if (guessers.length === 0 || guessers.some((p) => !p.isBot)) {
        return { ok: false, error: 'NOT_BOT_TURN' }
      }
      return {
        ok: true,
        state: reduceMC(state, { type: 'PASS', playerId: guessers[0].id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof MCEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey, currentMCActorId }
