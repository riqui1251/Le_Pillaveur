import { describe, expect, it } from 'vitest'
import {
  emptySyncedView,
  isOnlineGameFinished,
  parse1220State,
  parseBluffSyncedState,
  parseCrobardSyncedState,
  parseEspionSyncedState,
  parseHiLoState,
  parseImposteurSyncedState,
  parseLoupGarouSyncedState,
  parseMenteurSyncedState,
  parseMonsieur3State,
  parseOnlineGameState,
  parsePetitBuveurState,
  parsePlinkoState,
  parsePmuState,
  parsePurpleState,
  parseQuizSyncedState,
  parseRoomSettings,
  parseSimplePhaseSyncedState,
  parseTabouSyncedState,
  parseTelephoneSyncedState,
  parseToucherCouleState,
  type AnyOnlineGameState,
  type HiLoSyncedState,
  type Monsieur3SyncedState,
  type PlinkoSyncedState,
  type PmuSyncedState,
  type RoomSettings,
} from '@/lib/online-game-state'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import { buildTCState } from '@/lib/toucher-coule/server-adapter'
import { buildMenteurState } from '@/lib/menteur/server-adapter'
import { buildImposteurState } from '@/lib/imposteur/server-adapter'
import { buildQuizState } from '@/lib/quiz/server-adapter'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import { buildGame1220State } from '@/lib/1220/server-adapter'
import { buildPurpleState } from '@/lib/purple/server-adapter'
import { buildBluffState } from '@/lib/bluff/server-adapter'
import { buildEspionState } from '@/lib/espion/server-adapter'
import { buildTabouState } from '@/lib/tabou/server-adapter'
import { buildCrobardState } from '@/lib/crobard/server-adapter'
import { buildTelephoneState } from '@/lib/telephone-dessine/server-adapter'
import { buildSFState } from '@/lib/sans-filtre/server-adapter'
import { buildMCState } from '@/lib/mots-codes/server-adapter'
import { buildDilState } from '@/lib/dilemmes/server-adapter'
import { buildPbcState } from '@/lib/petit-bac/server-adapter'
import { buildPreState } from '@/lib/president/server-adapter'

type Plain = Record<string, unknown>
type Parser = (json: string | null | undefined) => unknown

// ─── États valides : ceux des MOTEURS, tels que la base et le client les voient ──
// Pour chaque jeu serveur-autoritaire : l'état complet (lu par le serveur,
// ex. vote « Rejouer ») ET les vues joueur/spectateur (lues par le client).

const MEMBERS = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((userId) => ({
  userId,
  displayName: `Joueur ${userId}`,
  user: { displayName: `Joueur ${userId}` },
}))
const table = (n: number) => MEMBERS.slice(0, n)
const SEED = 'seed-parseurs'

const ENGINE_STATES: Record<string, () => unknown> = {
  'petit-buveur': () => buildPetitBuveurEngineState(table(3), 'normal', SEED),
  'toucher-coule': () => buildTCState(table(2), '1v1', {}, SEED),
  menteur: () => buildMenteurState(table(3), 0, SEED),
  imposteur: () => buildImposteurState(table(4), 'fr', 0, SEED),
  quiz: () => buildQuizState(table(3), 'fr', 10, 0, SEED),
  'loup-garou': () => buildLGState(table(6), undefined, 0, SEED),
  '1220': () => buildGame1220State(table(3), 0, SEED),
  purple: () => buildPurpleState(table(3), 0, SEED),
  bluff: () => buildBluffState(table(4), 'fr', 0, SEED),
  espion: () => buildEspionState(table(4), 'fr', 0, SEED),
  tabou: () => buildTabouState(table(4), {}, 'fr', 0, SEED),
  crobard: () => buildCrobardState(table(4), 'fr', 0, SEED),
  'telephone-dessine': () => buildTelephoneState(table(4), SEED),
  'sans-filtre': () => buildSFState(table(4), 'alcool', 0, SEED),
  'mots-codes': () => buildMCState(table(4), {}, 'fr', SEED),
  dilemmes: () => buildDilState(table(4), 'alcool', 0, SEED),
  'petit-bac': () => buildPbcState(table(4), SEED),
  president: () => buildPreState(table(4), 0, SEED),
}

/** État complet + vue du joueur u1 + vue spectateur, en JSON simple. */
function engineVariants(gameId: string): Plain[] {
  const adapter = getGameAdapter(gameId)
  if (!adapter) throw new Error(`adaptateur manquant : ${gameId}`)
  const state = ENGINE_STATES[gameId]()
  return [
    JSON.parse(adapter.serialize(state)),
    JSON.parse(adapter.clientViewJson(state, 'u1')),
    JSON.parse(adapter.spectatorViewJson(state)),
  ]
}

// Formes historiques (Hi-Lo, Monsieur 3, PMU, Plinko en ligne) : AUCUN moteur
// ne les produit plus — états bâtis sur leur type déclaré, faute de mieux.

const HI_LO_STATE: HiLoSyncedState = {
  version: 3,
  memberUserIds: ['u1', 'u2'],
  gameStarted: true,
  currentPlayer: 1,
  gameMode: 'standard',
  deck: [{ value: '7', suit: '♠', color: 'black' }],
  currentCard: { value: 'D', suit: '♥', color: 'red' },
  nextCard: null,
  drinkCounter: 2,
  gameOver: false,
  showResult: false,
  lastGuess: null,
  isCorrect: null,
  gameResults: { u1: 3 },
  showGameOver: false,
  showIncorrectDialog: false,
  isFlipping: false,
  isProcessing: false,
  isUnguessedEqual: false,
  activePlayerIds: [],
  correctGuessesInRow: 0,
  targetGuesses: 5,
  rematchVotes: [],
}

const MONSIEUR_3_STATE: Monsieur3SyncedState = {
  version: 2,
  memberUserIds: ['u1', 'u2'],
  gameStarted: true,
  currentPlayer: 0,
  gamePhase: 'play',
  players: [
    { id: 'u1', name: 'Joueur u1', isMonsieur3: true, score: 0 },
    { id: 'u2', name: 'Joueur u2', isMonsieur3: false, score: 2 },
  ],
  dice: { dice1: 2, dice2: 1 },
  rolling: false,
  message: '',
  rollHistory: [],
  specialMessage: null,
  canRoll: true,
  setupRolls: [],
  monsieur3Found: true,
  gameEnded: false,
  monsieur3Index: 0,
  victoryScreen: false,
  rematchVotes: [],
}

const PMU_STATE: PmuSyncedState = {
  version: 4,
  memberUserIds: ['u1', 'u2'],
  gameStarted: true,
  currentPlayer: 0,
  phase: 'betting',
  mode: 'paris',
  horses: [{ name: 'Éclair', emoji: '🐎', position: 0, colorFrom: '#fff', colorTo: '#000', playerIds: ['u1'] }],
  bets: { u1: 2 },
  payoutTargets: {},
  distSips: 0,
  winnerIndex: null,
  raceSeed: null,
  rematchVotes: [],
}

const PLINKO_STATE: PlinkoSyncedState = {
  version: 5,
  memberUserIds: ['u1', 'u2'],
  gameStarted: true,
  currentPlayer: 1,
  difficulty: 'medium',
  isCumulativeMode: false,
  pinPositions: [{ x: 10, y: 20, row: 0 }],
  slotSipValues: [1, 2, 3],
  specialPins: [],
  currentPlayerIndex: 1,
  isAnimating: false,
  turnResult: null,
  playerResults: { u1: { drinks: 2, given: 0 } },
  roundDrinksCount: 0,
  gameOver: false,
  resultDisplayPhase: null,
  boardSeed: 42,
  rematchVotes: [],
}

// ─── Table des parseurs ──────────────────────────────────────────────────────

type ParserCase = {
  name: string
  parse: Parser
  /** gameIds servis par ce parseur dans parseOnlineGameState. */
  gameIds: string[]
  states: () => Plain[]
  /** Champs dont l'absence rend l'état inutilisable → null. */
  required: string[]
  /** Champs que le parseur complète quand ils manquent. */
  defaults: Plain
}

const REMATCH = { rematchVotes: [] }
const PHASED = ['version', 'phase']

const phased = (name: string, parse: Parser, gameIds: string[]): ParserCase => ({
  name,
  parse,
  gameIds,
  states: () => gameIds.flatMap(engineVariants),
  required: PHASED,
  defaults: REMATCH,
})

const CASES: ParserCase[] = [
  {
    name: 'parsePetitBuveurState',
    parse: parsePetitBuveurState,
    gameIds: ['petit-buveur'],
    states: () => engineVariants('petit-buveur'),
    required: ['version', 'players'],
    defaults: { view: emptySyncedView(), rematchVotes: [] },
  },
  {
    name: 'parsePurpleState',
    parse: parsePurpleState,
    gameIds: ['purple'],
    states: () => engineVariants('purple'),
    // PurpleOnline dessine la table et le tour à partir de ce parseur.
    required: [...PHASED, 'players', 'currentPlayer'],
    defaults: REMATCH,
  },
  {
    name: 'parse1220State',
    parse: parse1220State,
    gameIds: ['1220'],
    states: () => engineVariants('1220'),
    required: PHASED,
    defaults: { rematchVotes: [], setupReady: [] },
  },
  {
    name: 'parseHiLoState',
    parse: parseHiLoState,
    gameIds: ['hi-lo'],
    states: () => [structuredClone(HI_LO_STATE) as Plain],
    required: ['version', 'memberUserIds', 'currentPlayer'],
    defaults: REMATCH,
  },
  {
    name: 'parseMonsieur3State',
    parse: parseMonsieur3State,
    gameIds: ['monsieur-3'],
    states: () => [structuredClone(MONSIEUR_3_STATE) as Plain],
    required: ['version', 'memberUserIds', 'gamePhase', 'players'],
    defaults: REMATCH,
  },
  {
    name: 'parsePmuState',
    parse: parsePmuState,
    gameIds: ['pmu'],
    states: () => [structuredClone(PMU_STATE) as Plain],
    required: ['version', 'memberUserIds', 'phase', 'horses'],
    defaults: REMATCH,
  },
  {
    name: 'parsePlinkoState',
    parse: parsePlinkoState,
    gameIds: ['plinko'],
    states: () => [structuredClone(PLINKO_STATE) as Plain],
    required: ['version', 'memberUserIds', 'currentPlayer'],
    defaults: { rematchVotes: [], playerResults: {} },
  },
  phased('parseToucherCouleState', parseToucherCouleState, ['toucher-coule']),
  phased('parseMenteurSyncedState', parseMenteurSyncedState, ['menteur']),
  phased('parseImposteurSyncedState', parseImposteurSyncedState, ['imposteur']),
  phased('parseQuizSyncedState', parseQuizSyncedState, ['quiz']),
  phased('parseLoupGarouSyncedState', parseLoupGarouSyncedState, ['loup-garou']),
  phased('parseBluffSyncedState', parseBluffSyncedState, ['bluff']),
  phased('parseEspionSyncedState', parseEspionSyncedState, ['espion']),
  phased('parseTabouSyncedState', parseTabouSyncedState, ['tabou']),
  phased('parseCrobardSyncedState', parseCrobardSyncedState, ['crobard']),
  phased('parseTelephoneSyncedState', parseTelephoneSyncedState, ['telephone-dessine']),
  phased('parseSimplePhaseSyncedState', parseSimplePhaseSyncedState, [
    'sans-filtre',
    'mots-codes',
    'dilemmes',
    'petit-bac',
    'president',
  ]),
]

/** Ce que doit rendre le parseur : l'état tel quel, complété de ses défauts s'ils manquent. */
function expectedAfterParse(state: Plain, defaults: Plain): Plain {
  const missing = Object.entries(defaults).filter(([key]) => state[key] === undefined)
  return { ...state, ...Object.fromEntries(missing) }
}

/** JSON illisible ou d'une autre forme : jamais une exception, toujours null. */
const GARBAGE: (string | null | undefined)[] = [
  null,
  undefined,
  '',
  '{',
  '{}',
  'null',
  '[]',
  '[{"version":1}]',
  '42',
  '"texte"',
  'true',
  '{"version":"1","phase":"playing","players":[]}',
]

describe.each(CASES)('$name', ({ parse, states, required, defaults }) => {
  it('aller-retour : parse(JSON.stringify(état)) rend l’état (état complet et vues client)', () => {
    const variants = states()
    expect(variants.length).toBeGreaterThan(0)
    for (const state of variants) {
      expect(parse(JSON.stringify(state))).toEqual(expectedAfterParse(state, defaults))
    }
  })

  it('le résultat est lui-même un état valide (idempotent)', () => {
    for (const state of states()) {
      const once = parse(JSON.stringify(state))
      expect(parse(JSON.stringify(once))).toEqual(once)
    }
  })

  it('null, vide, JSON tronqué, objet vide ou autre forme → null, sans lever', () => {
    for (const json of GARBAGE) {
      expect(() => parse(json)).not.toThrow()
      expect(parse(json)).toBeNull()
    }
  })

  it.each(required)('champ obligatoire « %s » absent ou nul → null', (field) => {
    for (const state of states()) {
      const withoutField = { ...state }
      delete withoutField[field]
      expect(parse(JSON.stringify(withoutField))).toBeNull()
      expect(parse(JSON.stringify({ ...state, [field]: null }))).toBeNull()
    }
  })

  it('votes « Rejouer » d’une autre forme : lus comme « aucun vote »', () => {
    const [state] = states()
    const parsed = parse(JSON.stringify({ ...state, rematchVotes: 'u1' })) as Plain
    expect(parsed.rematchVotes).toEqual([])
  })
})

describe('socle minimal des jeux à phases', () => {
  it('{ version, phase } suffit (forme des états de test du vote « Rejouer »)', () => {
    const minimal = JSON.stringify({ version: 4, phase: 'finished', rematchVotes: ['u2'] })
    const parsed = parseOnlineGameState('president', minimal)
    expect(parsed).toEqual({ version: 4, phase: 'finished', rematchVotes: ['u2'] })
    expect(isOnlineGameFinished('president', parsed as AnyOnlineGameState)).toBe(true)
  })
})

describe('parseRoomSettings (jamais null : les appelants lisent settings.x sans garde)', () => {
  const SETTINGS: RoomSettings = {
    difficulty: 'difficile',
    lang: 'it',
    botsCount: 2,
    tabouTeams: { u1: 'A', u2: 'B' },
    tabouTargetScore: 25,
    menteurPalifico: true,
  }

  it('aller-retour : les réglages de l’hôte reviennent à l’identique', () => {
    expect(parseRoomSettings(JSON.stringify(SETTINGS))).toEqual(SETTINGS)
  })

  it('difficulté absente ou nulle → « normal », le reste est gardé', () => {
    expect(parseRoomSettings('{}')).toEqual({ difficulty: 'normal' })
    expect(parseRoomSettings(JSON.stringify({ lang: 'es', difficulty: null }))).toEqual({
      lang: 'es',
      difficulty: 'normal',
    })
  })

  it('absents, illisibles ou d’une autre forme → réglages par défaut, sans lever', () => {
    for (const json of [null, undefined, '', '{', 'null', '[]', '["a"]', '42', '"texte"', 'true']) {
      expect(() => parseRoomSettings(json)).not.toThrow()
      expect(parseRoomSettings(json)).toEqual({ difficulty: 'normal' })
    }
  })
})

describe('parseOnlineGameState', () => {
  const ROUTES = CASES.flatMap((c) => c.gameIds.map((gameId) => ({ gameId, parserCase: c })))

  it('couvre chaque jeu du registre serveur', () => {
    const routed = new Set(ROUTES.map((r) => r.gameId))
    for (const gameId of Object.keys(ENGINE_STATES)) expect(routed.has(gameId)).toBe(true)
  })

  it.each(ROUTES)('$gameId : délègue au parseur du jeu', ({ gameId, parserCase }) => {
    const variants = gameId in ENGINE_STATES ? engineVariants(gameId) : parserCase.states()
    for (const state of variants) {
      const json = JSON.stringify(state)
      expect(parseOnlineGameState(gameId, json)).toEqual(parserCase.parse(json))
      expect(parseOnlineGameState(gameId, json)).not.toBeNull()
    }
    for (const json of GARBAGE) {
      expect(() => parseOnlineGameState(gameId, json)).not.toThrow()
      expect(parseOnlineGameState(gameId, json)).toBeNull()
    }
  })

  it('jeu inconnu → null, même avec un état lisible', () => {
    const [state] = engineVariants('tabou')
    expect(parseOnlineGameState('jeu-inconnu', JSON.stringify(state))).toBeNull()
    expect(parseOnlineGameState('', JSON.stringify(state))).toBeNull()
  })
})

describe('isOnlineGameFinished sur des états parsés', () => {
  it('une partie qui démarre n’est terminée pour aucun jeu', () => {
    for (const gameId of Object.keys(ENGINE_STATES)) {
      for (const state of engineVariants(gameId)) {
        const parsed = parseOnlineGameState(gameId, JSON.stringify(state))
        expect(parsed).not.toBeNull()
        expect(isOnlineGameFinished(gameId, parsed as AnyOnlineGameState)).toBe(false)
      }
    }
  })

  it('une partie terminée le reste après parse', () => {
    const finishedMarks: Record<string, Plain> = {
      'petit-buveur': { phase: 'finished', winner: { id: 'u1' } },
      'toucher-coule': { phase: 'finished', winner: 'A' },
    }
    for (const gameId of Object.keys(ENGINE_STATES)) {
      const [state] = engineVariants(gameId)
      const finished = { ...state, ...(finishedMarks[gameId] ?? { phase: 'finished' }) }
      const parsed = parseOnlineGameState(gameId, JSON.stringify(finished))
      expect(isOnlineGameFinished(gameId, parsed as AnyOnlineGameState)).toBe(true)
    }
  })
})
