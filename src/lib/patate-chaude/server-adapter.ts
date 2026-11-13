import { randomInt } from 'node:crypto'
import { checkAdvance, enterPhase, phaseKey } from '@/lib/online/phase-clock'
import { randomSeed } from '@/lib/petit-buveur/rng'
import {
  PC_CHALLENGE_MODES,
  PC_DEFAULT_SETTINGS,
  PC_FUSES,
  PC_ROUNDS_OPTIONS,
  contest,
  createClosedGame,
  createGame,
  finish,
  isPcPlayerActive,
  leave,
  nextRound,
  noteAttempt,
  pass,
  pcFuseRangeMs,
  rejoin,
  resolveIfExpired,
  startRound,
  type PcSettings,
  type PcState,
} from './engine'
import { pcLangOf } from './load'
import { pcServerSource } from './server-bank'
import {
  isPcSetAside,
  isPcTableTooSmall,
  pcPhaseDurationMs,
  toPcClientView,
  type PcOnlinePlayer,
  type PcOnlineState,
} from './online-shared'

/**
 * Adaptateur serveur de Patate Chaude : construction de la partie, lecture de l'état persisté,
 * actions de la route, départs et retours, vues. Le moteur (engine.ts) est celui du jeu local ;
 * cette enveloppe ajoute la version, la table, les votes « Rejouer », la langue de la salle,
 * l'horloge des phases publiques et le hasard du serveur. L'heure arrive en paramètre (`now`) :
 * la route passe Date.now(), les tests une horloge fixe.
 *
 * Pas de bot : un bot ne trouve pas de mots. `bot` et `replace-left` n'ont jamais rien à faire ;
 * un joueur parti est sauté à la passe, un joueur qui ne joue plus est mis de côté par le moteur
 * (deux explosions sans rien jouer, jamais à deux) jusqu'à ce qu'il touche « Je suis là » (`resume`).
 */

/**
 * Hasard du serveur, neuf à chaque manche. La mèche ne sort JAMAIS du flux qui tire les défis :
 * ceux-ci sont publics, et une graine de 32 bits se recalcule à partir de quelques défis et des
 * durées publiées après chaque BOUM — la mèche suivante avec. Les défis repartent eux aussi
 * d'une graine neuve à chaque manche : on ne devine pas le prochain.
 */
export type PcEntropy = {
  /** Graine des tirages de la manche (sorte et défi). */
  seed(): number
  /** Durée de la mèche (ms), bornes comprises. */
  fuseMs(range: { min: number; max: number }): number
}

export const PC_SERVER_ENTROPY: PcEntropy = {
  seed: () => randomInt(0, 2 ** 32),
  fuseMs: (range) => randomInt(range.min, range.max + 1),
}

export interface PcRoomMember {
  userId: string
  user: { displayName: string }
}

/** Réglages de la salle → réglages du moteur, champ par champ ; absent ou hors liste → défaut du jeu local. */
export function pcSettingsFromRoom(settings: Readonly<Record<string, unknown>>): PcSettings {
  return {
    challenge: PC_CHALLENGE_MODES.find((value) => value === settings.pcChallenge) ?? PC_DEFAULT_SETTINGS.challenge,
    fuse: PC_FUSES.find((value) => value === settings.pcFuse) ?? PC_DEFAULT_SETTINGS.fuse,
    rounds: PC_ROUNDS_OPTIONS.find((value) => value === settings.pcRounds) ?? PC_DEFAULT_SETTINGS.rounds,
  }
}

/**
 * Partie neuve : les membres dans l'ordre de la salle (la bombe commence chez le premier), en
 * attente du compte à rebours d'allumage. `lang` : langue de la salle, celle des défis.
 *
 * Jamais d'exception : une table tombée sous deux joueurs avant l'allumage (départ pendant le
 * briefing, relance sans garde) donne une partie déjà finie, sans manche jouée. Lever ici
 * laissait la salle « en cours » sans état : écran de chargement sans fin, « Retour à la table »
 * refusé, aucun minuteur.
 */
export function buildPcState(
  members: readonly PcRoomMember[],
  settings: Partial<PcSettings> = {},
  lang?: string | null,
  seed?: string | number,
  now: number = Date.now()
): PcOnlineState {
  const players: PcOnlinePlayer[] = []
  for (const member of members) {
    if (!member.userId || players.some((p) => p.id === member.userId)) continue
    players.push({ id: member.userId, name: member.user.displayName, isBot: false, leftAt: null })
  }
  const options = {
    playerIds: players.map((p) => p.id),
    settings: pcSettingsFromRoom({ pcChallenge: settings.challenge, pcFuse: settings.fuse, pcRounds: settings.rounds }),
    seed: seed ?? randomSeed(),
  }
  const created = createGame(options)
  const game = created.ok ? created.state : createClosedGame(options)
  return {
    version: 1,
    ...enterPhase(0, game.phase, pcPhaseDurationMs(game), now),
    phase: game.phase,
    players,
    rematchVotes: [],
    lang: pcLangOf(lang),
    game,
  }
}

export function serializePcState(state: PcOnlineState): string {
  return JSON.stringify(state)
}

/** État persisté → enveloppe ; null si absent ou illisible (jamais d'exception). */
export function parsePcState(json: string | null): PcOnlineState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Partial<PcOnlineState> | null
    if (!raw || typeof raw !== 'object') return null
    if (typeof raw.version !== 'number' || typeof raw.phase !== 'string' || !Array.isArray(raw.players)) return null
    const game = raw.game
    if (!game || typeof game !== 'object' || !Array.isArray(game.playerIds) || typeof game.phase !== 'string') {
      return null
    }
    return {
      ...raw,
      version: raw.version,
      phase: raw.phase,
      phaseSeq: typeof raw.phaseSeq === 'number' ? raw.phaseSeq : 0,
      phaseEndsAt: typeof raw.phaseEndsAt === 'number' ? raw.phaseEndsAt : null,
      players: raw.players,
      rematchVotes: Array.isArray(raw.rematchVotes) ? raw.rematchVotes : [],
      lang: pcLangOf(raw.lang),
      // Compteur et liste venus après les premiers états : absents, tout le monde repart de zéro.
      game: {
        ...game,
        idleBooms: game.idleBooms && typeof game.idleBooms === 'object' ? game.idleBooms : {},
        played: Array.isArray(game.played) ? game.played : [],
      },
    }
  } catch {
    return null
  }
}

export type PcRoomActionInput =
  | { type: 'pass'; word: string }
  /** `index` : le mot ouvert tel que le joueur l'a vu (une passe entre-temps rend la contestation caduque). */
  | { type: 'contest'; index: number }
  | { type: 'advance'; phaseKey: string }
  | { type: 'end' }
  /** « Je suis là » : un joueur mis de côté pour inactivité reprend sa place. */
  | { type: 'resume' }
  /** Mot refusé : le porteur joue quand même (un refus, lui, n'écrit rien). Une fois par mèche. */
  | { type: 'attempt' }
  | { type: 'bot' }
  | { type: 'replace-left' }

export type PcRoomActionResult = { ok: true; state: PcOnlineState } | { ok: false; error: string }

const accept = (state: PcOnlineState): PcRoomActionResult => ({ ok: true, state })
const refuse = (error: string): PcRoomActionResult => ({ ok: false, error })

/** Nouvel état du moteur dans l'enveloppe : version +1, et une échéance neuve à chaque changement de phase. */
function withGame(state: PcOnlineState, game: PcState, now: number): PcOnlineState {
  const clock =
    game.phase === state.game.phase
      ? { phaseSeq: state.phaseSeq, phaseEndsAt: state.phaseEndsAt }
      : enterPhase(state.phaseSeq, game.phase, pcPhaseDurationMs(game), now)
  return {
    ...state,
    phase: game.phase,
    phaseSeq: clock.phaseSeq,
    phaseEndsAt: clock.phaseEndsAt,
    game,
    version: state.version + 1,
  }
}

function isActiveHuman(state: PcOnlineState, userId: string): boolean {
  const player = state.players.find((p) => p.id === userId)
  return Boolean(player && !player.isBot && !player.leftAt && isPcPlayerActive(state.game, userId))
}

/**
 * Échéances : le compte à rebours (allumage de la mèche), l'écran du BOUM (manche suivante ou
 * fin), et la mèche elle-même — que seul le serveur connaît, d'où sa vérification à part.
 */
function advance(state: PcOnlineState, claimedKey: string, now: number, entropy: PcEntropy): PcRoomActionResult {
  if (state.game.phase === 'burning') {
    if (claimedKey !== phaseKey(state)) return refuse('PHASE_CHANGED')
    const exploded = resolveIfExpired(state.game, now)
    return exploded === state.game ? refuse('NOT_EXPIRED') : accept(withGame(state, exploded, now))
  }
  const check = checkAdvance(state, claimedKey, now)
  if (!check.ok) return refuse(check.error)
  if (state.game.phase === 'ready') {
    const reseeded: PcState = { ...state.game, rngState: entropy.seed() >>> 0 }
    const fuseMs = entropy.fuseMs(pcFuseRangeMs(state.game.settings.fuse))
    const lit = startRound(reseeded, now, pcServerSource(state.lang), { fuseMs })
    if (lit.ok) return accept(withGame(state, lit.state, now))
    // Plus de défi à tirer ou plus assez de joueurs (départs) : la partie s'arrête ICI, par la
    // route d'action, qui enregistre les résultats et ferme le journal.
    const ended = finish(state.game, now)
    return ended.ok ? accept(withGame(state, ended.state, now)) : refuse(lit.error)
  }
  if (state.game.phase === 'boom') {
    // skipIdle : un joueur qui ne joue plus ne garde pas la table en otage (moteur, nextRound).
    const next = nextRound(state.game, { skipIdle: true })
    return next.ok ? accept(withGame(state, next.state, now)) : refuse(next.error)
  }
  return refuse('NOTHING_TO_ADVANCE')
}

/** « Je suis là » : le joueur mis de côté reprend sa place (un parti, lui, revient par la salle). */
function resume(state: PcOnlineState, userId: string, now: number): PcRoomActionResult {
  if (state.phase === 'finished') return refuse('WRONG_PHASE')
  // Double toucher, ou déjà revenu : rien à faire, 409 muet.
  if (!isPcSetAside(state, userId)) return refuse('NOT_SET_ASIDE')
  // Une mèche arrivée au bout explose d'abord, comme pour toute écriture.
  const settled = resolveIfExpired(state.game, now)
  const back = rejoin(settled, userId)
  return back.ok ? accept(withGame(state, back.state, now)) : refuse(back.error)
}

function contestWord(state: PcOnlineState, userId: string, index: number, now: number): PcRoomActionResult {
  // Une mèche arrivée au bout explose d'abord, comme pour une passe tardive.
  const exploded = resolveIfExpired(state.game, now)
  if (exploded !== state.game) return accept(withGame(state, exploded, now))
  if (state.game.phase !== 'burning') return refuse('WRONG_PHASE')
  if (index !== state.game.openWord) return refuse('NOTHING_TO_CONTEST')
  const result = contest(state.game, { by: userId, now })
  return result.ok ? accept(withGame(state, result.state, now)) : refuse(result.error)
}

/**
 * Une action de la route, jugée à l'instant `now` (horloge serveur). `entropy` : le hasard du
 * serveur (fixé dans les tests).
 */
export function applyPcRoomAction(
  state: PcOnlineState,
  userId: string,
  input: PcRoomActionInput,
  now: number,
  entropy: PcEntropy = PC_SERVER_ENTROPY
): PcRoomActionResult {
  switch (input.type) {
    case 'pass': {
      const result = pass(state.game, { now, by: userId, word: input.word })
      return result.ok ? accept(withGame(state, result.state, now)) : refuse(result.error)
    }
    case 'contest':
      return contestWord(state, userId, input.index, now)
    case 'advance':
      return advance(state, input.phaseKey, now, entropy)
    case 'end': {
      // Tout joueur actif, pas seulement l'hôte : un hôte au téléphone verrouillé ne doit pas
      // retenir une partie illimitée. L'écran demande confirmation.
      if (!isActiveHuman(state, userId)) return refuse('UNKNOWN_PLAYER')
      const result = finish(state.game, now)
      return result.ok ? accept(withGame(state, result.state, now)) : refuse(result.error)
    }
    case 'resume':
      return resume(state, userId, now)
    case 'attempt': {
      // Déjà noté pendant cette mèche, ou plus de mèche : rien à écrire, 409 muet.
      const result = noteAttempt(state.game, { by: userId, now })
      if (!result.ok || result.state === state.game) return refuse('NOTHING_TO_NOTE')
      return accept(withGame(state, result.state, now))
    }
    case 'bot':
      return refuse('NOT_BOT_TURN')
    case 'replace-left':
      return refuse('NOTHING_TO_REPLACE')
  }
}

/**
 * Départ en cours de partie : le joueur est sauté ; s'il tenait la bombe, elle passe au suivant
 * actif. Null si rien à faire.
 *
 * Moins de deux joueurs actifs : la partie n'est PAS close ici (la route DELETE et le changement
 * de table n'enregistrent aucun résultat). Le moteur éteint la mèche et l'enveloppe ouvre un
 * compte à rebours échu : le prochain `advance` (téléphone restant, ou minuteur de service à
 * +1,5 s) termine la partie par la route d'action — XP, séries, succès et journal compris.
 */
export function markPcPlayerLeft(state: PcOnlineState, userId: string, at: number): PcOnlineState | null {
  if (state.phase === 'finished') return null
  const player = state.players.find((p) => p.id === userId)
  if (!player || player.isBot || player.leftAt) return null
  const result = leave(state.game, userId, at)
  if (!result.ok) return null
  const players = state.players.map((p) => (p.id === userId ? { ...p, leftAt: at } : p))
  const next = withGame({ ...state, players }, result.state, at)
  if (next.game.phase !== 'ready' || !isPcTableTooSmall(next)) return next
  const clock = enterPhase(state.phaseSeq, 'ready', 0, at)
  return { ...next, phaseSeq: clock.phaseSeq, phaseEndsAt: clock.phaseEndsAt }
}

/** Retour d'un joueur parti : il reprend sa place dans l'ordre de passe. Null si ce n'est pas un parti. */
export function rejoinPcPlayer(state: PcOnlineState, userId: string): PcOnlineState | null {
  const player = state.players.find((p) => p.id === userId)
  if (!player || player.isBot || !player.leftAt) return null
  const result = rejoin(state.game, userId)
  if (!result.ok) return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === userId ? { ...p, leftAt: null } : p)),
    game: result.state,
    version: state.version + 1,
  }
}

export function pcClientViewJson(state: PcOnlineState): string {
  return JSON.stringify(toPcClientView(state))
}

/** La TV voit exactement ce que voit un joueur : la vue ne porte rien de personnel. */
export function pcSpectatorViewJson(state: PcOnlineState): string {
  return JSON.stringify(toPcClientView(state))
}
