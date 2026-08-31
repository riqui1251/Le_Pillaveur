import {
  createDilState,
  currentDilActorId,
  dilActive,
  dilCurrentCard,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DilEngineError,
  DIL_DEFAULT_ROUNDS,
  DIL_MIN_PLAYERS,
  DIL_MAX_PLAYERS,
  type DilCard,
  type DilPlayer,
  type DilState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { dilContentFor } from './data'
import { createRng, randomSeed } from '@/lib/petit-buveur/rng'
import { botDisplayName, personaForBotName, pickBotPersonas } from '@/lib/online/bot-personas'

/**
 * Adaptateur serveur de Dilemmes : sérialisation, mapping HTTP → actions
 * moteur, bots, vues. Pas de classement (aucun skill) — assumé.
 */

export interface DilRoomMember {
  userId: string
  user: { displayName: string }
}

export function buildDilState(
  members: DilRoomMember[],
  ambiance: 'soft' | 'alcool',
  botsCount: number = 0,
  seed?: string | number,
  roundsCount?: number,
  coquin: boolean = false
): DilState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  const wanted = Math.max(0, Math.min(botsCount, DIL_MAX_PLAYERS - players.length))
  // Complète jusqu'au minimum jouable — personas sans doublon, reproductibles
  // à graine égale (suffixe pour ne pas corréler avec le mélange des cartes).
  const totalBots = Math.max(wanted, DIL_MIN_PLAYERS - players.length)
  const resolvedSeed = seed ?? randomSeed()
  const personas = pickBotPersonas(totalBots, createRng(`${resolvedSeed}#bots`).next)
  personas.forEach((persona, i) => {
    players.push({ id: `bot-${i + 1}`, name: botDisplayName(persona), isBot: true })
  })

  return createDilState(
    players,
    dilContentFor(ambiance, coquin),
    resolvedSeed,
    Date.now(),
    roundsCount ?? DIL_DEFAULT_ROUNDS
  )
}

export function serializeDilState(state: DilState): string {
  return JSON.stringify(state)
}

export function parseDilState(json: string | null): DilState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as DilState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return { ...raw, votes: raw.votes ?? {}, rematchVotes: raw.rematchVotes ?? [] }
  } catch {
    return null
  }
}

export type DilRoomActionInput =
  | { type: 'vote'; choice: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type DilRoomActionResult = { ok: true; state: DilState } | { ok: false; error: string }

export function applyDilRoomAction(
  state: DilState,
  userId: string,
  input: DilRoomActionInput
): DilRoomActionResult {
  try {
    switch (input.type) {
      case 'vote':
        return {
          ok: true,
          state: reduceDil(state, {
            type: 'VOTE',
            playerId: userId,
            choice: input.choice,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceDil(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now: Date.now() }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceDil(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'bot':
        return applyDilBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceDil(state, { type: 'REPLACE_LEFT', now: Date.now(), graceMs: input.graceMs }),
        }
    }
  } catch (e) {
    if (e instanceof DilEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markDilPlayerLeft(state: DilState, playerId: string, at: number): DilState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceDil(state, { type: 'LEAVE', playerId, at })
}

export function rejoinDilPlayer(state: DilState, playerId: string): DilState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceDil(state, { type: 'REJOIN', playerId })
}

export function convertDilPlayerToBot(state: DilState, playerId: string): DilState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
}

export function dilClientViewJson(state: DilState, viewerId: string): string {
  return JSON.stringify(toDilClientView(state, viewerId))
}

export function dilSpectatorViewJson(state: DilState): string {
  return JSON.stringify(toDilSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Mots qui trahissent l'option manifestement la plus « osée » d'un « Tu préfères ». */
const DIL_OSE_RX =
  /\b(ex|hontes?|torride|fantasmes?|strip|crush|jacuzzi|embrasser|ivre|dignité|nuit|coquins?)\b/gi

function dilOseScore(text: string): number {
  return text.match(DIL_OSE_RX)?.length ?? 0
}

/**
 * Choix d'un bot pour la carte courante, piloté par son persona (retrouvé par
 * le NOM — un déserteur converti sans persona joue « moyen » : audace 0.5,
 * aucun trait).
 * - « Je n'ai jamais » : P(A = « je l'ai fait ») = audace — Bernadette reste
 *   sage toute la partie, Dédé assume tout.
 * - « Tu préfères » : le suiveur colle à la majorité déjà posée, l'agressif
 *   prend l'opposé du premier vote humain ; sinon l'audace penche vers
 *   l'option la plus osée quand il y en a une, sinon 50/50.
 * - « Qui de la table » : un HUMAIN visé 3 fois sur 4 (drôle d'être désigné,
 *   pas de voir Gépéto voter Marcel) ; le suiveur copie la cible du premier
 *   vote humain.
 */
export function dilBotChoice(
  state: DilState,
  bot: DilPlayer,
  card: DilCard,
  rand: () => number = Math.random
): string | null {
  const persona = personaForBotName(bot.name)
  const audace = persona?.audace ?? 0.5
  const trait = persona?.trait ?? null
  // Votes humains déjà posés, dans l'ordre d'arrivée (ordre d'insertion des clés).
  const humanChoices = Object.entries(state.votes)
    .filter(([voterId]) => state.players.some((p) => p.id === voterId && !p.isBot))
    .map(([, choice]) => choice)

  if (card.kind === 'who') {
    const targets = dilActive(state).filter((t) => t.id !== bot.id)
    if (targets.length === 0) return null
    if (trait === 'suiveur') {
      const copied = humanChoices.find((c) => targets.some((t) => t.id === c))
      if (copied) return copied
    }
    const humans = targets.filter((t) => !t.isBot)
    const bots = targets.filter((t) => t.isBot)
    let pool = humans
    if (humans.length === 0) pool = bots
    else if (bots.length > 0 && rand() >= 0.75) pool = bots
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))].id
  }

  if (card.kind === 'never') {
    return rand() < audace ? 'A' : 'B'
  }

  // « Tu préfères » (A/B)
  const abVotes = Object.values(state.votes).filter((c) => c === 'A' || c === 'B')
  if (trait === 'suiveur' && abVotes.length > 0) {
    const countA = abVotes.filter((c) => c === 'A').length
    const countB = abVotes.length - countA
    if (countA !== countB) return countA > countB ? 'A' : 'B'
  }
  if (trait === 'agressif') {
    const first = humanChoices.find((c) => c === 'A' || c === 'B')
    if (first) return first === 'A' ? 'B' : 'A'
  }
  const oseA = dilOseScore(card.a)
  const oseB = dilOseScore(card.b)
  if (oseA !== oseB) {
    const osee = oseA > oseB ? 'A' : 'B'
    const sage = osee === 'A' ? 'B' : 'A'
    return rand() < audace ? osee : sage
  }
  return rand() < 0.5 ? 'A' : 'B'
}

/**
 * Tick bot : fait voter UN SEUL bot en attente (les votes s'étalent dans la
 * manche au tempo des personas) ; au reveal, le bot meneur continue. La fin
 * anticipée « tout le monde a voté » arrive naturellement au dernier tick.
 */
export function applyDilBotAction(
  state: DilState,
  rand: () => number = Math.random
): DilRoomActionResult {
  try {
    if (state.phase === 'vote') {
      const bot = dilActive(state).find((p) => p.isBot && !state.votes[p.id])
      const card = dilCurrentCard(state)
      if (!bot || !card) return { ok: false, error: 'NOT_BOT_TURN' }
      const choice = dilBotChoice(state, bot, card, rand)
      if (choice === null) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceDil(state, { type: 'VOTE', playerId: bot.id, choice, now: Date.now() }),
      }
    }
    if (state.phase === 'reveal') {
      const actor = state.players.find((p) => p.id === currentDilActorId(state))
      if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
      return {
        ok: true,
        state: reduceDil(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof DilEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
