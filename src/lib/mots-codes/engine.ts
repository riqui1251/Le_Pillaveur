import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import type { BotSpeech, SpeechMove } from '@/lib/online/bot-speech'

/**
 * MOTS CODÉS — moteur PUR, serveur-autoritaire.
 *
 * Deux équipes (Or et Rouge), une grille de 25 mots. Le MAÎTRE-MOT de chaque
 * équipe voit la solution et donne un indice « UN MOT · un nombre » au vocal ;
 * son équipe touche les tuiles pour deviner. Tuile adverse ou neutre → la
 * main passe ; l'ASSASSIN (dos de carte) → défaite immédiate. Première équipe
 * à révéler tous ses mots : victoire.
 *
 * Pas de bots au lancement (un bot ne donne pas d'indice) — le remplacement
 * en cours de partie reste possible : un maître-mot devenu bot passe le rôle
 * au prochain humain de l'équipe, une équipe muette passe son tour.
 */

export const MC_MIN_PLAYERS = 4
export const MC_MAX_PLAYERS = 16
export const MC_COUNTDOWN_MS = 5_000
/** Temps du maître-mot pour donner son indice. */
export const MC_CLUE_MS = 90_000
/** Temps de l'équipe pour deviner (toutes tuiles confondues). */
export const MC_GUESS_MS = 120_000
/** Longueur maximale du mot-indice. */
export const MC_CLUE_MAX_LEN = 24
/** Grille. */
export const MC_GRID = 25
export const MC_STARTING_WORDS = 9
export const MC_OTHER_WORDS = 8

export type MCTeam = 'gold' | 'red'
export type MCTileKind = 'gold' | 'red' | 'neutral' | 'assassin'

export type MCPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  team: MCTeam
  isSpymaster: boolean
}

export type MCPhase = 'countdown' | 'clue' | 'guess' | 'finished'

/**
 * Parole PUBLIQUE d'un bot (`botSay.<kind>` sous games.mots-codes.game) : une
 * RÉACTION à une tuile que toute la table vient de voir se retourner, ou à
 * une équipe qui passe la main. Écrite par l'adaptateur dans la même
 * réduction que le coup (aucun tick de plus) ; le kind ne se calcule que sur
 * la vue spectateur — la couleur d'une tuile révélée, les mots restants —,
 * jamais sur la grille de clés, et un bot qui tient la clé (maître-mot) ne
 * parle jamais.
 *   • tuile de son équipe : nice (bien vu), lead (on passe devant) ;
 *   • tuile neutre : miss ; tuile adverse : oops (un coéquipier), thanks (un
 *     adversaire remercie du cadeau) ;
 *   • assassin : assassin (un coéquipier), saved (un adversaire) ;
 *   • dernier mot : win (un coéquipier), thanks (le dernier mot adverse) ;
 *   • main passée : tease (un adversaire).
 */
export type MCSpeechKind =
  | 'nice'
  | 'lead'
  | 'miss'
  | 'oops'
  | 'thanks'
  | 'assassin'
  | 'saved'
  | 'win'
  | 'tease'
export type MCSpeech = BotSpeech<MCSpeechKind>
/** Une parole à écrire : le bot qui parle, son kind, le joueur qu'il nomme. */
export type MCSay = SpeechMove<MCSpeechKind>

/** Les phases où chaque kind peut naître : celle qu'ouvre la tuile retournée. */
const MC_SPEECH_PHASES: Record<MCSpeechKind, readonly MCPhase[]> = {
  nice: ['guess', 'clue'],
  lead: ['guess', 'clue'],
  miss: ['clue'],
  oops: ['clue'],
  thanks: ['clue', 'finished'],
  assassin: ['finished'],
  saved: ['finished'],
  win: ['finished'],
  tease: ['clue'],
}

export const MC_SPEECH_KINDS = Object.keys(MC_SPEECH_PHASES) as MCSpeechKind[]
/** Paroles max par bot et par tour d'équipe ; le bavardage du persona borne en dessous. */
export const MC_SPEECH_CAP = 2
/** Bulles max de toute la table par tour d'équipe. */
export const MC_TURN_SPEECH_MAX = 3

export type MCState = TimedPhaseState & {
  version: number
  phase: MCPhase
  players: MCPlayer[]
  words: string[]
  /** SECRET (sauf maîtres-mots) tant que la tuile n'est pas révélée. */
  kinds: MCTileKind[]
  revealed: boolean[]
  startingTeam: MCTeam
  activeTeam: MCTeam
  /** Indice courant (public une fois donné). */
  clue: { word: string; count: number } | null
  guessesLeft: number
  winnerTeam: MCTeam | null
  /** 'assassin' si la partie s'est finie sur la tuile noire. */
  loseReason: 'assassin' | null
  rematchVotes: string[]
  rngState: number
  /**
   * PUBLIC — numéro du tour d'équipe (un par phase d'indice), la « manche »
   * des paroles. Optionnel : un état sérialisé avant son arrivée n'en a pas
   * (compté depuis 0).
   */
  turn?: number
  /**
   * PUBLIC — paroles des bots, celles du tour en cours et du précédent au
   * plus (chaque nouveau tour ne garde que celui qui s'achève).
   */
  speech?: MCSpeech[]
}

export type MCAction =
  | { type: 'GIVE_CLUE'; playerId: string; word: string; count: number; now: number }
  | { type: 'GUESS'; playerId: string; tile: number; now: number }
  | { type: 'PASS'; playerId: string; now: number }
  | { type: 'SKIP_TURN'; playerId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class MCEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'MCEngineError'
  }
}

export type MCInitialPlayer = { id: string; name: string; team: MCTeam; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function mcActive(state: MCState): MCPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

function otherTeam(team: MCTeam): MCTeam {
  return team === 'gold' ? 'red' : 'gold'
}

export function mcSpymasterOf(state: MCState, team: MCTeam): MCPlayer | null {
  return state.players.find((p) => p.team === team && p.isSpymaster) ?? null
}

/** Nombre de mots restant à trouver pour une équipe. */
export function mcRemainingFor(state: MCState, team: MCTeam): number {
  return state.kinds.filter((k, i) => k === team && !state.revealed[i]).length
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * L'indice est-il un mot encore visible sur la grille (interdit, règle
 * classique) ? Partagé avec le téléphone du maître-mot, qui le signale avant
 * l'envoi au lieu d'un refus générique du serveur.
 */
export function mcClueOnGrid(
  tiles: readonly { word: string; revealed: boolean }[],
  clue: string
): boolean {
  const key = normalize(clue)
  return tiles.some((tile) => !tile.revealed && normalize(tile.word) === key)
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createMCState(
  players: MCInitialPlayer[],
  words: string[],
  seed: string | number,
  now: number = Date.now()
): MCState {
  if (players.length < MC_MIN_PLAYERS) throw new MCEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > MC_MAX_PLAYERS) throw new MCEngineError('TOO_MANY_PLAYERS')
  for (const team of ['gold', 'red'] as const) {
    const humans = players.filter((p) => p.team === team && !p.isBot)
    if (humans.length < 2) throw new MCEngineError('NEEDS_TWO_HUMANS_PER_TEAM')
  }
  if (words.length < MC_GRID) throw new MCEngineError('NOT_ENOUGH_WORDS')

  const rng: SeededRng = createRng(seed)
  const gridWords = rng.shuffle(words).slice(0, MC_GRID)
  const startingTeam: MCTeam = rng.chance(0.5) ? 'gold' : 'red'
  const kinds: MCTileKind[] = rng.shuffle([
    ...Array<MCTileKind>(MC_STARTING_WORDS).fill(startingTeam),
    ...Array<MCTileKind>(MC_OTHER_WORDS).fill(otherTeam(startingTeam)),
    ...Array<MCTileKind>(MC_GRID - MC_STARTING_WORDS - MC_OTHER_WORDS - 1).fill('neutral'),
    'assassin',
  ])

  // Le premier joueur listé de chaque équipe devient maître-mot.
  const spymasterIds = new Set<string>()
  for (const team of ['gold', 'red'] as const) {
    const first = players.find((p) => p.team === team && !p.isBot)
    if (first) spymasterIds.add(first.id)
  }

  return {
    version: 1,
    ...enterPhase(0, 'countdown', MC_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      team: p.team,
      isSpymaster: spymasterIds.has(p.id),
    })),
    words: gridWords,
    kinds,
    revealed: Array(MC_GRID).fill(false),
    startingTeam,
    activeTeam: startingTeam,
    clue: null,
    guessesLeft: 0,
    winnerTeam: null,
    loseReason: null,
    rematchVotes: [],
    rngState: rng.getState(),
    turn: 0,
    speech: [],
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function enterCluePhase(state: MCState, team: MCTeam, now: number): MCState {
  const turn = state.turn ?? 0
  return {
    ...state,
    turn: turn + 1,
    // Le fil ne garde que le tour qui s'achève : jamais plus de deux tours.
    speech: (state.speech ?? []).filter((sp) => sp.round === turn),
    activeTeam: team,
    clue: null,
    guessesLeft: 0,
    ...enterPhase(state.phaseSeq, 'clue', MC_CLUE_MS, now),
    phase: 'clue',
    version: state.version + 1,
  }
}

function finish(state: MCState, winner: MCTeam, loseReason: 'assassin' | null): MCState {
  return {
    ...state,
    phase: 'finished',
    phaseSeq: state.phaseSeq + 1,
    phaseEndsAt: null,
    winnerTeam: winner,
    loseReason,
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceMC(state: MCState, action: MCAction): MCState {
  switch (action.type) {
    case 'GIVE_CLUE': {
      if (state.phase !== 'clue') throw new MCEngineError('NOT_CLUE_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new MCEngineError('UNKNOWN_PLAYER')
      if (actor.team !== state.activeTeam || !actor.isSpymaster) {
        throw new MCEngineError('NOT_THE_SPYMASTER')
      }
      const word = action.word.trim()
      if (word.length < 1 || word.length > MC_CLUE_MAX_LEN || /\s/.test(word)) {
        throw new MCEngineError('INVALID_CLUE')
      }
      const tiles = state.words.map((w, i) => ({ word: w, revealed: state.revealed[i] }))
      if (mcClueOnGrid(tiles, word)) throw new MCEngineError('CLUE_ON_GRID')
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > 9) {
        throw new MCEngineError('INVALID_COUNT')
      }
      return {
        ...state,
        clue: { word, count: action.count },
        guessesLeft: action.count + 1,
        ...enterPhase(state.phaseSeq, 'guess', MC_GUESS_MS, action.now),
        phase: 'guess',
        version: state.version + 1,
      }
    }

    case 'GUESS': {
      if (state.phase !== 'guess') throw new MCEngineError('NOT_GUESS_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new MCEngineError('UNKNOWN_PLAYER')
      if (actor.team !== state.activeTeam) throw new MCEngineError('NOT_YOUR_TURN')
      if (actor.isSpymaster) throw new MCEngineError('SPYMASTER_CANNOT_GUESS')
      if (action.tile < 0 || action.tile >= MC_GRID || state.revealed[action.tile]) {
        throw new MCEngineError('INVALID_TILE')
      }

      const revealed = [...state.revealed]
      revealed[action.tile] = true
      const kind = state.kinds[action.tile]
      const next = { ...state, revealed, version: state.version + 1 }

      if (kind === 'assassin') {
        return finish(next, otherTeam(state.activeTeam), 'assassin')
      }
      // Une équipe peut gagner sur une tuile révélée PAR l'adversaire.
      for (const team of ['gold', 'red'] as const) {
        if (mcRemainingFor(next, team) === 0) return finish(next, team, null)
      }
      if (kind === state.activeTeam) {
        const guessesLeft = state.guessesLeft - 1
        if (guessesLeft <= 0) return enterCluePhase(next, otherTeam(state.activeTeam), action.now)
        return { ...next, guessesLeft }
      }
      // Neutre ou adverse : la main passe.
      return enterCluePhase(next, otherTeam(state.activeTeam), action.now)
    }

    case 'PASS': {
      if (state.phase !== 'guess') throw new MCEngineError('NOT_GUESS_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new MCEngineError('UNKNOWN_PLAYER')
      if (actor.team !== state.activeTeam || actor.isSpymaster) {
        throw new MCEngineError('NOT_YOUR_TURN')
      }
      return enterCluePhase(state, otherTeam(state.activeTeam), action.now)
    }

    case 'SKIP_TURN': {
      // Le maître-mot (souvent devenu bot) rend la main sans indice.
      if (state.phase !== 'clue') throw new MCEngineError('NOT_CLUE_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.team !== state.activeTeam || !actor.isSpymaster) {
        throw new MCEngineError('NOT_THE_SPYMASTER')
      }
      return enterCluePhase(state, otherTeam(state.activeTeam), action.now)
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new MCEngineError(check.error)
      if (state.phase === 'countdown') {
        return enterCluePhase(state, state.startingTeam, action.now)
      }
      if (state.phase === 'clue' || state.phase === 'guess') {
        // Temps écoulé : la main passe à l'autre équipe.
        return enterCluePhase(state, otherTeam(state.activeTeam), action.now)
      }
      throw new MCEngineError('NOTHING_TO_ADVANCE')
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new MCEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new MCEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new MCEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new MCEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      let players = state.players.map((p) =>
        ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
      )
      // Un maître-mot devenu bot passe le rôle au prochain humain de l'équipe.
      for (const team of ['gold', 'red'] as const) {
        const master = players.find((p) => p.team === team && p.isSpymaster)
        if (master?.isBot) {
          const human = players.find((p) => p.team === team && !p.isBot && !p.leftAt)
          if (human) {
            players = players.map((p) =>
              p.team !== team
                ? p
                : { ...p, isSpymaster: p.id === human.id }
            )
          }
        }
      }
      return { ...state, players, version: state.version + 1 }
    }

    default: {
      const exhaustive: never = action
      throw new MCEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Paroles des bots ────────────────────────────────────────────────────────

/**
 * Le fil après la parole `say`, écrite au tour courant. La réaction
 * accompagne le coup qui l'a fait naître : même version d'état. Refusée
 * (MCEngineError) hors de ses phases, d'un orateur qui n'est pas un bot
 * assis ou qui tient la clé (un maître-mot bot se tait : sa parole aurait
 * l'air informée), vers un joueur absent ou vers soi, au-delà du plafond du
 * bot ou de la table — l'adaptateur garde alors le coup sans la parole.
 */
export function addMCSpeech(state: MCState, say: MCSay): MCState {
  if (!MC_SPEECH_KINDS.includes(say.kind)) throw new MCEngineError('INVALID_KIND')
  if (!MC_SPEECH_PHASES[say.kind].includes(state.phase)) throw new MCEngineError('SPEECH_OUT_OF_PHASE')
  const speaker = state.players.find((p) => p.id === say.playerId)
  if (!speaker || !speaker.isBot || speaker.leftAt || speaker.isSpymaster) {
    throw new MCEngineError('INVALID_SPEAKER')
  }
  const target = state.players.find((p) => p.id === say.targetId)
  if (!target || target.leftAt || target.id === speaker.id) throw new MCEngineError('INVALID_TARGET')
  const turn = state.turn ?? 0
  const speech = state.speech ?? []
  const current = speech.filter((sp) => sp.round === turn)
  if (current.length >= MC_TURN_SPEECH_MAX) throw new MCEngineError('TABLE_TALK_FULL')
  if (current.filter((sp) => sp.playerId === speaker.id).length >= MC_SPEECH_CAP) {
    throw new MCEngineError('ALREADY_SPOKE')
  }
  return {
    ...state,
    speech: [...speech, { playerId: speaker.id, kind: say.kind, targetId: target.id, round: turn }],
  }
}

// ─── Acteur courant (anti-AFK) ───────────────────────────────────────────────

/** En `clue` : le maître-mot actif. En `guess` : phase d'équipe (pas d'acteur unique). */
export function currentMCActorId(state: MCState): string | null {
  if (state.phase === 'clue') return mcSpymasterOf(state, state.activeTeam)?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type MCTileView = {
  word: string
  revealed: boolean
  /** Couleur : révélée pour tous, sinon uniquement pour les maîtres-mots. */
  kind: MCTileKind | null
}

export type MCPlayerView = Omit<MCPlayer, never>

export type MCClientView = Omit<MCState, 'rngState' | 'words' | 'kinds' | 'revealed'> & {
  phaseKey: string
  tiles: MCTileView[]
  /** true si le viewer voit la solution (maître-mot). */
  iSeeSolution: boolean
  remaining: { gold: number; red: number }
}

export function toMCClientView(state: MCState, viewerId: string): MCClientView {
  const { rngState: _rng, words, kinds, revealed, ...rest } = state
  void _rng
  const viewer = state.players.find((p) => p.id === viewerId)
  const seeSolution = Boolean(viewer?.isSpymaster) || state.phase === 'finished'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    iSeeSolution: seeSolution,
    tiles: words.map((word, i) => ({
      word,
      revealed: revealed[i],
      kind: revealed[i] || seeSolution ? kinds[i] : null,
    })),
    remaining: {
      gold: mcRemainingFor(state, 'gold'),
      red: mcRemainingFor(state, 'red'),
    },
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : jamais la solution avant la fin. */
export function toMCSpectatorView(state: MCState): MCClientView {
  return toMCClientView(state, '')
}
