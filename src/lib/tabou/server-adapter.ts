import {
  addTabouSpeech,
  createTabouState,
  currentTabouActorId,
  reduceTabou,
  toTabouClientView,
  toTabouSpectatorView,
  TabouEngineError,
  TABOU_MAX_PLAYERS,
  TABOU_DEFAULT_TARGET_SCORE,
  type TabouState,
  type TabouTeam,
  type TabouInitialPlayer,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { getTabouWords } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { tabouBotSay, type TabouSpeechEvent } from './bot-speech'

/**
 * Adaptateur serveur de Tabou Vocal : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface TabouRoomMember {
  userId: string
  displayName: string
}

const TABOU_MAX_PER_TEAM = TABOU_MAX_PLAYERS / 2

/**
 * Répartit les humains dans les 2 équipes (choix du lobby honorés tant
 * qu'une équipe n'est pas pleine, le reste équilibré automatiquement), puis
 * comble avec des bots — d'abord pour garantir au moins 2 par équipe
 * (contrainte du moteur), ensuite jusqu'au nombre de bots CHOISI par l'hôte.
 */
export function buildTabouPlayers(
  members: TabouRoomMember[],
  teamChoices: Record<string, TabouTeam>,
  botsCount: number = 0
): TabouInitialPlayer[] {
  const counts: Record<TabouTeam, number> = { A: 0, B: 0 }
  const players: TabouInitialPlayer[] = []

  const withChoice = members.filter((m) => teamChoices[m.userId])
  const withoutChoice = members.filter((m) => !teamChoices[m.userId])

  for (const m of withChoice) {
    const wanted = teamChoices[m.userId]
    const team = counts[wanted] < TABOU_MAX_PER_TEAM ? wanted : wanted === 'A' ? 'B' : 'A'
    counts[team] += 1
    players.push({ id: m.userId, name: m.displayName, team, isBot: false })
  }
  for (const m of withoutChoice) {
    const team: TabouTeam = counts.A <= counts.B ? 'A' : 'B'
    counts[team] += 1
    players.push({ id: m.userId, name: m.displayName, team, isBot: false })
  }

  let botIndex = 0
  const botPersonas = pickBotPersonas(TABOU_MAX_PLAYERS)
  const addBot = (team: TabouTeam) => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      team,
      isBot: true,
    })
    counts[team] += 1
    botIndex += 1
  }
  while (counts.A < 2) addBot('A')
  while (counts.B < 2) addBot('B')

  const wanted = Math.max(0, Math.min(botsCount, TABOU_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) {
    const team: TabouTeam = counts.A <= counts.B ? 'A' : 'B'
    if (counts[team] >= TABOU_MAX_PER_TEAM) break
    addBot(team)
  }

  return players
}

export function buildTabouState(
  members: TabouRoomMember[],
  teamChoices: Record<string, TabouTeam>,
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  targetScore?: number
): TabouState {
  const players = buildTabouPlayers(members, teamChoices, botsCount)
  return createTabouState(
    players,
    getTabouWords(lang),
    seed ?? randomSeed(),
    Date.now(),
    targetScore ?? TABOU_DEFAULT_TARGET_SCORE
  )
}

export function serializeTabouState(state: TabouState): string {
  return JSON.stringify(state)
}

export function parseTabouState(json: string | null): TabouState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as TabouState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      remainingWords: raw.remainingWords ?? [],
      speech: raw.speech ?? [],
    }
  } catch {
    return null
  }
}

export type TabouRoomActionInput =
  | { type: 'found' }
  | { type: 'pass' }
  | { type: 'taboo-called' }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type TabouRoomActionResult =
  | { ok: true; state: TabouState }
  | { ok: false; error: string }

/**
 * `sayRand` tire les paroles des bots (bot-speech.ts) : les tests le fixent,
 * la route garde Math.random. Il ne touche jamais le RNG du jeu, qui vit
 * dans l'état : une partie se rejoue à l'identique avec ou sans paroles.
 */
export function applyTabouRoomAction(
  state: TabouState,
  userId: string,
  input: TabouRoomActionInput,
  sayRand: () => number = Math.random
): TabouRoomActionResult {
  if (input.type === 'bot') return applyTabouBotAction(state, sayRand)
  try {
    const next = reduceTabouInput(state, userId, input)
    return { ok: true, state: withTabouSpeech(next, tabouSpeechEvent(state, next, userId, input.type), sayRand) }
  } catch (e) {
    if (e instanceof TabouEngineError) return { ok: false, error: e.message }
    throw e
  }
}

function reduceTabouInput(
  state: TabouState,
  userId: string,
  input: Exclude<TabouRoomActionInput, { type: 'bot' }>
): TabouState {
  const now = Date.now()
  switch (input.type) {
    case 'found':
      return reduceTabou(state, { type: 'FOUND', playerId: userId, now })
    case 'pass':
      return reduceTabou(state, { type: 'PASS', playerId: userId, now })
    case 'taboo-called':
      return reduceTabou(state, { type: 'TABOO_CALLED', playerId: userId, now })
    case 'advance':
      return reduceTabou(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now })
    case 'continue':
      return reduceTabou(state, { type: 'CONTINUE', playerId: userId, now })
    case 'replace-left':
      return reduceTabou(state, { type: 'REPLACE_LEFT', now, graceMs: input.graceMs })
  }
}

// ─── Paroles des bots ────────────────────────────────────────────────────────

/**
 * Le fait que la table vient de voir, d'après l'état avant et après le coup :
 * une manche qui commence (lancement ou « manche suivante », d'un humain ou
 * d'un bot) ou s'achève (temps écoulé), un mot trouvé, passé ou buzzé — ces
 * trois-là par un HUMAIN seulement, en pleine manche. Null : rien à dire.
 */
export function tabouSpeechEvent(
  before: TabouState,
  after: TabouState,
  actorId: string | null,
  inputType: TabouRoomActionInput['type']
): TabouSpeechEvent | null {
  if (after.phase === 'describing' && (before.phase !== 'describing' || before.round !== after.round)) {
    return { type: 'roundStart' }
  }
  if (before.phase === 'describing' && after.phase === 'roundEnd') return { type: 'roundEnd' }
  const actor = before.players.find((p) => p.id === actorId)
  if (!actor || actor.isBot || before.phase !== 'describing' || after.phase !== 'describing') return null
  if (inputType === 'found') return { type: 'found', by: actor.id, scoresBefore: before.scores }
  if (inputType === 'pass') return { type: 'pass' }
  if (inputType === 'taboo-called') return { type: 'taboo', by: actor.id }
  return null
}

/**
 * L'état après le coup, avec la réaction d'un bot s'il en a une. Le
 * planificateur ne lit que la vue SPECTATEUR (jamais le mot en cours) ; une
 * parole que le moteur refuserait laisse le coup intact, sans parole.
 */
export function withTabouSpeech(
  after: TabouState,
  event: TabouSpeechEvent | null,
  sayRand: () => number
): TabouState {
  if (!event) return after
  const say = tabouBotSay(toTabouSpectatorView(after), event, sayRand)
  if (!say) return after
  try {
    return addTabouSpeech(after, say)
  } catch (e) {
    if (e instanceof TabouEngineError) return after
    throw e
  }
}

export function markTabouPlayerLeft(state: TabouState, playerId: string, at: number): TabouState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceTabou(state, { type: 'LEAVE', playerId, at })
}

export function rejoinTabouPlayer(state: TabouState, playerId: string): TabouState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceTabou(state, { type: 'REJOIN', playerId })
}

export function convertTabouPlayerToBot(state: TabouState, playerId: string): TabouState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function tabouClientViewJson(state: TabouState, viewerId: string): string {
  return JSON.stringify(toTabouClientView(state, viewerId))
}

export function tabouSpectatorViewJson(state: TabouState): string {
  return JSON.stringify(toTabouSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot ne clique JAMAIS FOUND/PASS/TABOO_CALLED (IA volontairement
 * faible, assumée — les bots n'existent qu'en REMPLACEMENT d'un joueur
 * parti ou en complément choisi par l'hôte). Quand le décrivant tiré est un
 * bot, la manche s'écourte d'elle-même côté moteur (`TABOU_BOT_DESCRIBER_ROUND_MS`)
 * — rien à faire ici, le tick `advance` générique suffit. Seul le bilan de
 * manche (`roundEnd`) a besoin d'un bot qui « continue » s'il est le premier
 * joueur actif restant ; la manche qu'il ouvre peut porter une réaction.
 */
export function applyTabouBotAction(
  state: TabouState,
  sayRand: () => number = Math.random
): TabouRoomActionResult {
  try {
    const actorId = currentTabouActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'roundEnd') {
      const next = reduceTabou(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() })
      return { ok: true, state: withTabouSpeech(next, tabouSpeechEvent(state, next, actor.id, 'bot'), sayRand) }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof TabouEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
