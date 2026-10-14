import {
  createImposteurState,
  currentImposteurActorId,
  imposteurAlive,
  maxImposteurCount,
  reduceImposteur,
  toImposteurClientView,
  toImposteurSpectatorView,
  ImposteurEngineError,
  IMPOSTEUR_EMPTY_CLUE,
  isEmptyClueText,
  IMPOSTEUR_MIN_PLAYERS,
  IMPOSTEUR_MAX_PLAYERS,
  IMPOSTEUR_REVEAL_MS,
  IMPOSTEUR_BOT_VOTE_MARGIN_MS,
  IMPOSTEUR_HUMAN_SPEAK_KINDS,
  type ImposteurHumanSpeakKind,
  type ImposteurLang,
  type ImposteurPlayer,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, botTraitsFor, pickBotPersonas } from '@/lib/online/bot-personas'
import { getImposteurPairs, imposteurLangOf } from './data'
import { imposteurClueListFor } from './data/clues'
import { imposteurBotClue, imposteurBotVoteNow, type ImposteurClueBook } from './bot-brain'
import { imposteurBotSpeechMove } from './bot-speech'
import { randomSeed } from '@/lib/petit-buveur/rng'

/**
 * Adaptateur serveur de l'Imposteur : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface ImposteurRoomMember {
  userId: string
  user: { displayName: string }
}

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur
 * (rematch après départs — leçon du Menteur).
 */
export function buildImposteurState(
  members: ImposteurRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  imposteurCount?: number
): ImposteurState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(IMPOSTEUR_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, IMPOSTEUR_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < IMPOSTEUR_MIN_PLAYERS) addBot()
  const count = imposteurCount ? Math.min(imposteurCount, maxImposteurCount(players.length)) : undefined
  return createImposteurState(
    players,
    getImposteurPairs(lang),
    seed ?? randomSeed(),
    Date.now(),
    count,
    imposteurLangOf(lang)
  )
}

export function serializeImposteurState(state: ImposteurState): string {
  return JSON.stringify(state)
}

export function parseImposteurState(json: string | null): ImposteurState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as ImposteurState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      pendingVotes: raw.pendingVotes ?? {},
      imposteurCount: raw.imposteurCount ?? raw.players.filter((p) => p.team === 'imposteur').length,
      // Parties lancées avant le champ : la langue de leur paire est inconnue,
      // on les lit comme françaises (paire absente du catalogue → « … »).
      lang: imposteurLangOf(raw.lang),
      previousReveal: raw.previousReveal ?? null,
      speech: Array.isArray(raw.speech) ? raw.speech : [],
      // Parties lancées avant l'horloge de révélation : leur reveal n'a pas
      // d'échéance et attendrait indéfiniment un clic. On lui en pose une.
      phaseEndsAt:
        raw.phase === 'reveal' && raw.phaseEndsAt == null
          ? Date.now() + IMPOSTEUR_REVEAL_MS
          : raw.phaseEndsAt,
    }
  } catch {
    return null
  }
}

export type ImposteurRoomActionInput =
  | { type: 'clue'; text: string }
  | { type: 'vote'; targetId: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'speak'; kind: string; targetId: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type ImposteurRoomActionResult =
  | { ok: true; state: ImposteurState }
  | { ok: false; error: string }

export function applyImposteurRoomAction(
  state: ImposteurState,
  userId: string,
  input: ImposteurRoomActionInput
): ImposteurRoomActionResult {
  try {
    switch (input.type) {
      case 'clue':
        // « … » est réservé à l'indice automatique (échéance, bot sans
        // catalogue), que le moteur doit accepter. Le client ne le propose
        // pas ; un client modifié ne doit pas s'en servir pour passer son
        // tour sur-le-champ.
        if (isEmptyClueText(input.text)) return { ok: false, error: 'INVALID_CLUE' }
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'CLUE',
            playerId: userId,
            text: input.text,
            now: Date.now(),
          }),
        }
      case 'vote':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'VOTE',
            playerId: userId,
            targetId: input.targetId,
            now: Date.now(),
          }),
        }
      case 'advance':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'ADVANCE',
            claimedKey: input.phaseKey,
            now: Date.now(),
          }),
        }
      case 'continue':
        return {
          ok: true,
          state: reduceImposteur(state, { type: 'CONTINUE', playerId: userId, now: Date.now() }),
        }
      case 'speak':
        // Un humain n'a que les boutons Accuser / Me défendre ; les autres
        // paroles (annonce de vote, interpellation…) sont celles des bots.
        if (!(IMPOSTEUR_HUMAN_SPEAK_KINDS as readonly string[]).includes(input.kind)) {
          return { ok: false, error: 'INVALID_KIND' }
        }
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'SPEAK',
            playerId: userId,
            kind: input.kind as ImposteurHumanSpeakKind,
            targetId: input.targetId,
          }),
        }
      case 'bot':
        return applyImposteurBotAction(state)
      case 'replace-left':
        return {
          ok: true,
          state: reduceImposteur(state, {
            type: 'REPLACE_LEFT',
            now: Date.now(),
            graceMs: input.graceMs,
          }),
        }
    }
  } catch (e) {
    if (e instanceof ImposteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export function markImposteurPlayerLeft(
  state: ImposteurState,
  playerId: string,
  at: number
): ImposteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceImposteur(state, { type: 'LEAVE', playerId, at })
}

export function rejoinImposteurPlayer(
  state: ImposteurState,
  playerId: string
): ImposteurState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceImposteur(state, { type: 'REJOIN', playerId })
}

export function convertImposteurPlayerToBot(
  state: ImposteurState,
  playerId: string
): ImposteurState | null {
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

export function imposteurClientViewJson(state: ImposteurState, viewerId: string): string {
  return JSON.stringify(toImposteurClientView(state, viewerId))
}

export function imposteurSpectatorViewJson(state: ImposteurState): string {
  return JSON.stringify(toImposteurSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/** Accès au catalogue d'indices, injectable (tests : listes factices). */
export type ImposteurBotDeps = {
  clueListFor: (lang: ImposteurLang, pair: ImposteurWordPair, word: string) => string[] | null
}

const DEFAULT_BOT_DEPS: ImposteurBotDeps = { clueListFor: imposteurClueListFor }

/**
 * Paire de la partie, déduite des deux mots distincts à table — elle n'est
 * pas stockée dans l'état. Null si la table ne porte pas exactement deux mots.
 */
function pairOf(state: ImposteurState): ImposteurWordPair | null {
  const words = [...new Set(state.players.map((p) => p.word))]
  return words.length === 2 ? { a: words[0], b: words[1] } : null
}

/**
 * Liste d'indices du mot de `player` — et de lui seul : la paire ne sert qu'à
 * retrouver l'entrée du catalogue, l'autre liste n'en sort jamais. Null si la
 * paire manque au catalogue.
 */
function ownCluesOf(
  state: ImposteurState,
  player: ImposteurPlayer,
  deps: ImposteurBotDeps
): string[] | null {
  const pair = pairOf(state)
  return pair ? deps.clueListFor(state.lang ?? 'fr', pair, player.word) : null
}

/**
 * Carnet d'indices de `player` : la liste d'un mot PUBLIC pour lui — le sien,
 * ou celui d'un éliminé, lus dans SA vue client —, null pour tout autre mot.
 * C'est ici que tient le contrat du bluff informé : la liste de l'autre mot
 * de la paire ne sort qu'une fois ce mot annoncé à une révélation.
 */
export function imposteurClueBookFor(
  state: ImposteurState,
  playerId: string,
  deps: ImposteurBotDeps = DEFAULT_BOT_DEPS
): ImposteurClueBook {
  const pair = pairOf(state)
  const known = new Set(
    toImposteurClientView(state, playerId)
      .players.map((p) => p.word)
      .filter((w) => w !== '')
  )
  return (word) => (pair && known.has(word) ? deps.clueListFor(state.lang ?? 'fr', pair, word) : null)
}

/**
 * Indice d'un bot au tour, décidé sur SA vue client, la liste de SON mot et
 * son carnet des mots publics (bot-brain.ts) : il ne lit ni son camp ni un
 * mot encore secret. Paire absente du catalogue → « … », comme avant.
 */
function botClueFor(
  state: ImposteurState,
  actor: ImposteurPlayer,
  rand: () => number,
  deps: ImposteurBotDeps
): string {
  const ownClues = ownCluesOf(state, actor, deps)
  if (!ownClues || ownClues.length === 0) return IMPOSTEUR_EMPTY_CLUE
  return imposteurBotClue(
    toImposteurClientView(state, actor.id),
    actor.id,
    ownClues,
    botTraitsFor(actor.name),
    rand,
    imposteurClueBookFor(state, actor.id, deps)
  )
}

/**
 * Vote groupé : chaque bot retardataire vote sur SA vue, la liste de SON mot
 * et son carnet des mots publics — ce qu'il a annoncé, sauf si quelqu'un est
 * passé devant depuis.
 */
function voteAllBots(
  state: ImposteurState,
  pendingBots: readonly ImposteurPlayer[],
  rand: () => number,
  now: number,
  deps: ImposteurBotDeps
): ImposteurState {
  let next = state
  for (const bot of pendingBots) {
    if (next.phase !== 'vote') break
    const targetId = imposteurBotVoteNow(
      toImposteurClientView(next, bot.id),
      bot.id,
      ownCluesOf(next, bot, deps) ?? [],
      botTraitsFor(bot.name),
      rand,
      imposteurClueBookFor(next, bot.id, deps)
    )
    if (!targetId) continue
    next = reduceImposteur(next, { type: 'VOTE', playerId: bot.id, targetId, now })
  }
  return next
}

/**
 * Tick « bot » : UN coup par tick.
 *   • indices : une parole due (réaction, remarque d'ouverture — bot-speech.ts)
 *     passe avant l'indice du bot au tour, pour suivre de près ce qu'elle
 *     commente ; sinon le bot au tour donne son indice ; sinon NOT_BOT_TURN ;
 *   • vote : une parole (réaction, annonce de vote, interpellation), sinon
 *     TOUS les bots retardataires votent d'un coup — score recalculé à cet
 *     instant, une accusation après l'annonce peut le retourner. À
 *     IMPOSTEUR_BOT_VOTE_MARGIN_MS de l'échéance, ils votent sans plus parler.
 *     Tant qu'un bot n'a pas voté, le tick réussit donc toujours : le filet
 *     serveur (skipBot après un refus) ne peut pas laisser des bots muets
 *     jusqu'à l'échéance, où ils s'abstiendraient ;
 *   • révélation : le premier vivant, s'il est bot, « continue ».
 * Chaque décision ne lit que la vue client du bot, la liste de SON mot et
 * celles des mots publics de sa vue (imposteurClueBookFor).
 * `rand`, `now` et `deps` sont injectables : une partie est rejouable à
 * l'identique.
 */
export function applyImposteurBotAction(
  state: ImposteurState,
  rand: () => number = Math.random,
  now: number = Date.now(),
  deps: ImposteurBotDeps = DEFAULT_BOT_DEPS
): ImposteurRoomActionResult {
  try {
    const speechDeps = {
      ownCluesOf: (botId: string) => {
        const bot = state.players.find((p) => p.id === botId)
        return (bot && ownCluesOf(state, bot, deps)) ?? []
      },
      clueBookOf: (botId: string) => imposteurClueBookFor(state, botId, deps),
    }

    if (state.phase === 'vote') {
      const pendingBots = imposteurAlive(state).filter((p) => p.isBot && !state.pendingVotes[p.id])
      const forced =
        pendingBots.length > 0 &&
        state.phaseEndsAt !== null &&
        state.phaseEndsAt - now <= IMPOSTEUR_BOT_VOTE_MARGIN_MS
      const move = forced ? null : imposteurBotSpeechMove(state, now, rand, speechDeps)
      if (move) return { ok: true, state: reduceImposteur(state, move) }
      if (pendingBots.length === 0) return { ok: false, error: 'NOT_BOT_TURN' }
      const next = voteAllBots(state, pendingBots, rand, now, deps)
      return next === state ? { ok: false, error: 'NOT_BOT_TURN' } : { ok: true, state: next }
    }

    if (state.phase === 'clue') {
      const move = imposteurBotSpeechMove(state, now, rand, speechDeps)
      if (move) return { ok: true, state: reduceImposteur(state, move) }
    }

    const actorId = currentImposteurActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'clue') {
      return {
        ok: true,
        state: reduceImposteur(state, {
          type: 'CLUE',
          playerId: actor.id,
          text: botClueFor(state, actor, rand, deps),
          now,
        }),
      }
    }
    if (state.phase === 'reveal') {
      return {
        ok: true,
        state: reduceImposteur(state, { type: 'CONTINUE', playerId: actor.id, now }),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof ImposteurEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
