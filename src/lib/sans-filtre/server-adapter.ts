import {
  createSFState,
  currentSFActorId,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SFEngineError,
  SF_DEFAULT_ROUNDS,
  SF_MIN_PLAYERS,
  SF_MAX_PLAYERS,
  type SFPlayer,
  type SFState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { sfContentFor } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { botDisplayName, personaForBotName, pickBotPersonas } from '@/lib/online/bot-personas'

/**
 * Adaptateur serveur de Sans Filtre : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface SFRoomMember {
  userId: string
  user: { displayName: string }
}

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte (filet jusqu'au minimum moteur pour le rematch après départs).
 * Les bots sont des personas partagés (bot-personas) : nom + emoji stockés
 * dans `name`, le trait est retrouvé par le nom. Le contenu est filtré selon
 * l'ambiance de l'HÔTE (Soft = cartes sages).
 */
export function buildSFState(
  members: SFRoomMember[],
  ambiance: 'soft' | 'alcool',
  botsCount: number = 0,
  seed?: string | number,
  roundsCount?: number
): SFState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  const botPersonas = pickBotPersonas(SF_MAX_PLAYERS)
  let botIndex = 0
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, SF_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < SF_MIN_PLAYERS) addBot()

  const { blacks, whites } = sfContentFor(ambiance)
  return createSFState(
    players,
    blacks,
    whites,
    seed ?? randomSeed(),
    Date.now(),
    roundsCount ?? SF_DEFAULT_ROUNDS
  )
}

export function serializeSFState(state: SFState): string {
  return JSON.stringify(state)
}

export function parseSFState(json: string | null): SFState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as SFState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      submissions: raw.submissions ?? [],
      rematchVotes: raw.rematchVotes ?? [],
      whiteDeck: raw.whiteDeck ?? [],
    }
  } catch {
    return null
  }
}

export type SFRoomActionInput =
  | { type: 'play-card'; card: number }
  | { type: 'judge-pick'; card: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type SFRoomActionResult = { ok: true; state: SFState } | { ok: false; error: string }

export function applySFRoomAction(
  state: SFState,
  userId: string,
  input: SFRoomActionInput
): SFRoomActionResult {
  try {
    switch (input.type) {
      case 'play-card':
        return {
          ok: true,
          state: reduceSF(state, {
            type: 'PLAY_CARD',
            playerId: userId,
            card: input.card,
            now: Date.now(),
          }),
        }
      case 'judge-pick':
        return {
          ok: true,
          state: reduceSF(state, {
            type: 'JUDGE_PICK',
            playerId: userId,
            card: input.card,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceSF(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceSF(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applySFBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceSF(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof SFEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markSFPlayerLeft(state: SFState, playerId: string, at: number): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceSF(state, { type: 'LEAVE', playerId, at })
}

export function rejoinSFPlayer(state: SFState, playerId: string): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceSF(state, { type: 'REJOIN', playerId })
}

export function convertSFPlayerToBot(state: SFState, playerId: string): SFState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  let next: SFState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
  // Un juge AFK devenu bot passe la main au prochain humain — même règle que
  // REPLACE_LEFT dans le moteur, pour ne pas geler la table jusqu'au timeout.
  if (next.judgeId === playerId && next.phase === 'judging') {
    const humans = sfActive(next).filter((p) => !p.isBot)
    const order = next.players.map((p) => p.id)
    const start = order.indexOf(playerId)
    for (let step = 1; step <= order.length && humans.length > 0; step++) {
      const candidate = next.players[(start + step) % order.length]
      if (!candidate.isBot && !candidate.leftAt) {
        next = { ...next, judgeId: candidate.id }
        break
      }
    }
  }
  return next
}

export function sfClientViewJson(state: SFState, viewerId: string): string {
  return JSON.stringify(toSFClientView(state, viewerId))
}

export function sfSpectatorViewJson(state: SFState): string {
  return JSON.stringify(toSFSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Choix de carte léger par trait : le farceur tire 3 cartes au hasard de sa
 * main et garde la plus COURTE (la punchline sèche) ; les autres traits (et
 * les déserteurs convertis, sans persona) abattent au hasard.
 */
function sfBotCardChoice(state: SFState, bot: SFPlayer, rand: () => number): number {
  const persona = personaForBotName(bot.name)
  if (persona?.trait === 'farceur' && bot.hand.length > 1) {
    const pool = [...bot.hand]
    const picks: number[] = []
    for (let i = 0; i < 3 && pool.length > 0; i += 1) {
      picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
    }
    return picks.reduce((best, card) =>
      (state.whites[card] ?? '').length < (state.whites[best] ?? '').length ? card : best
    )
  }
  return bot.hand[Math.floor(rand() * bot.hand.length)]
}

/**
 * Couronnement d'un juge-bot : pondéré 3:1 en faveur des soumissions
 * HUMAINES (poids 3 par humain, 1 par bot) — le joueur solo gagne plus
 * souvent que le hasard uniforme, sans être assuré de tout rafler.
 */
function sfWeightedCrownPick(
  state: SFState,
  rand: () => number
): { playerId: string; card: number } {
  const entries = state.submissions.map((s) => ({
    submission: s,
    weight: state.players.find((p) => p.id === s.playerId)?.isBot ? 1 : 3,
  }))
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  let r = rand() * total
  for (const entry of entries) {
    r -= entry.weight
    if (r <= 0) return entry.submission
  }
  return entries[entries.length - 1].submission
}

/**
 * Tick bot (action `bot` envoyée par le client « arbitre ») : fait soumettre
 * UN SEUL bot en attente par tick (le premier de la liste) — jamais tous
 * d'un coup, pour que les pastilles « a joué » s'allument au rythme des
 * personas —, couronne quand le juge est un bot (pondéré 3:1 pro-humains),
 * mène le « continuer » du reveal. `rand` : stub de test, Math.random sinon.
 */
export function applySFBotAction(
  state: SFState,
  rand: () => number = Math.random
): SFRoomActionResult {
  try {
    if (state.phase === 'submit') {
      const bot = sfActive(state).find(
        (p) =>
          p.isBot &&
          p.id !== state.judgeId &&
          p.hand.length > 0 &&
          !state.submissions.some((s) => s.playerId === p.id)
      )
      if (!bot) return { ok: false, error: 'NOT_BOT_TURN' }
      const card = sfBotCardChoice(state, bot, rand)
      return {
        ok: true,
        state: reduceSF(state, { type: 'PLAY_CARD', playerId: bot.id, card, now: Date.now() }),
      }
    }

    if (state.phase === 'judging') {
      const judge = state.players.find((p) => p.id === state.judgeId)
      if (!judge?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      const pick = sfWeightedCrownPick(state, rand)
      return {
        ok: true,
        state: reduceSF(state, {
          type: 'JUDGE_PICK',
          playerId: judge.id,
          card: pick.card,
          now: Date.now(),
        }),
      }
    }

    if (state.phase === 'reveal') {
      const actorId = currentSFActorId(state)
      const actor = state.players.find((p) => p.id === actorId)
      if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceSF(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }

    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof SFEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
