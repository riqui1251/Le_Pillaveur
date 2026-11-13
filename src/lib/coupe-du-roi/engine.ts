/**
 * Moteur pur de « La Coupe du Roi » (LOCAL : le téléphone posé au centre de la table).
 *
 * Un paquet de 52 cartes mélangé par une graine (`@/lib/petit-buveur/rng`), puis
 * chacun tire à son tour dans l'ordre de la table, à partir d'un premier joueur
 * tiré au sort. Chaque rang déclenche une règle ; le moteur ne garde que ce qui
 * DURE : maître du pouce (5) et maître des questions (10) jusqu'au prochain du
 * même rang, binôme de chaque joueur (8) jusqu'à SON prochain 8, règles
 * inventées au Valet (toute la partie) et rois sortis. Le quatrième roi finit la
 * partie. Aucune gorgée n'est comptée : qui boit quoi se joue autour de la
 * table, et l'écran adapte ses textes au mode Sans alcool.
 *
 * Une règle personnalisée par la table (`settings.overrides`) remplace aussi le
 * rôle de sa carte : un 8 réécrit ne demande plus de binôme. Les rois comptent
 * toujours pour la coupe.
 */

import { createRng, rngFromState, type RngState } from '@/lib/petit-buveur/rng'

export const COUPE_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type CoupeRank = (typeof COUPE_RANKS)[number]

/** Mêmes valeurs que `GameSuit` (src/lib/games.ts) : la carte se dessine avec PlayingCard. */
export const COUPE_SUITS = ['spade', 'heart', 'diamond', 'club'] as const
export type CoupeSuit = (typeof COUPE_SUITS)[number]

export type CoupeCard = { rank: CoupeRank; suit: CoupeSuit }

export const COUPE_DECK_SIZE = COUPE_RANKS.length * COUPE_SUITS.length
export const COUPE_KINGS_TO_FINISH = 4
export const COUPE_RULE_MAX_LENGTH = 140

/** 'solo' : sans verre commun, le 4e roi boit 5 gorgées ; 'shared' : coupe commune. */
export const COUPE_CUP_MODES = ['solo', 'shared'] as const
export type CoupeCupMode = (typeof COUPE_CUP_MODES)[number]

/** Idées de règle pour le Valet ; les textes vivent dans games.coupe-du-roi.suggestions. */
export const COUPE_SUGGESTION_KEYS = [
  'noNames',
  'noPointing',
  'noYesNo',
  'thirdPerson',
  'raiseHand',
  'accent',
  'leftHand',
  'tRex',
  'compliment',
  'captain',
  'noPhones',
  'noSwearing',
] as const
export type CoupeSuggestionKey = (typeof COUPE_SUGGESTION_KEYS)[number]

/** Textes de la table qui remplacent la règle d'origine d'un rang. */
export type CoupeOverrides = Partial<Record<CoupeRank, string>>

export type CoupeSettings = { cup: CoupeCupMode; overrides: CoupeOverrides }

export type CoupeDraw = { card: CoupeCard; playerId: string }

/** Ce que le joueur d'un 8 ou d'un Valet doit trancher avant la carte suivante. */
export type CoupePending = { kind: 'pair' | 'rule'; playerId: string }

export type CoupeCustomRule = { text: string; playerId: string }

export type CoupeState = {
  settings: CoupeSettings
  /** Table, dans l'ordre de passage. */
  playerIds: string[]
  /** Cartes restantes, la prochaine en tête. */
  deck: CoupeCard[]
  /** Cartes tirées, dans l'ordre, avec leur tireur. */
  drawn: CoupeDraw[]
  /** Index dans `playerIds` du prochain à tirer. */
  turn: number
  kingsDrawn: number
  thumbMaster: string | null
  questionMaster: string | null
  /** Tireur d'un 8 → son binôme (il boit chaque fois que le tireur boit). */
  pairs: Record<string, string>
  customRules: CoupeCustomRule[]
  pending: CoupePending | null
  finished: boolean
  /** Tireur du quatrième roi. */
  cupHolder: string | null
  rngState: RngState
}

export function isCoupeRank(value: unknown): value is CoupeRank {
  return typeof value === 'string' && (COUPE_RANKS as readonly string[]).includes(value)
}

function isCoupeSuit(value: unknown): value is CoupeSuit {
  return typeof value === 'string' && (COUPE_SUITS as readonly string[]).includes(value)
}

export function isCoupeCupMode(value: unknown): value is CoupeCupMode {
  return typeof value === 'string' && (COUPE_CUP_MODES as readonly string[]).includes(value)
}

/** Paquet neuf, enseigne par enseigne (♠, ♥, ♦, ♣), de l'As au Roi. */
export function createCoupeDeck(): CoupeCard[] {
  const deck: CoupeCard[] = []
  for (const suit of COUPE_SUITS) {
    for (const rank of COUPE_RANKS) deck.push({ rank, suit })
  }
  return deck
}

/**
 * Texte saisi par la table (règle du Valet, règle personnalisée) : une seule
 * ligne, sans caractère de contrôle, coupée à COUPE_RULE_MAX_LENGTH caractères
 * (par point de code : un emoji n'est jamais coupé en deux). Vide si illisible.
 */
export function cleanCoupeText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let printable = ''
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    printable += code < 32 || code === 127 ? ' ' : ch
  }
  const collapsed = printable.replace(/\s+/g, ' ').trim()
  return Array.from(collapsed).slice(0, COUPE_RULE_MAX_LENGTH).join('').trim()
}

/** Règles personnalisées relues (stockage, sauvegarde) : rangs connus et textes non vides seulement. */
export function cleanCoupeOverrides(value: unknown): CoupeOverrides {
  if (!isRecord(value)) return {}
  const clean: CoupeOverrides = {}
  for (const rank of COUPE_RANKS) {
    const text = cleanCoupeText(value[rank])
    if (text) clean[rank] = text
  }
  return clean
}

export type CoupeRule = { kind: 'default'; rank: CoupeRank } | { kind: 'custom'; rank: CoupeRank; text: string }

/** La règle d'un rang pour cette table : la version de la table si elle existe, sinon celle d'origine. */
export function coupeRuleFor(rank: CoupeRank, overrides: CoupeOverrides): CoupeRule {
  const text = cleanCoupeText(overrides[rank])
  return text ? { kind: 'custom', rank, text } : { kind: 'default', rank }
}

/**
 * Durée du rôle donné par une carte : jusqu'au prochain du même rang (5, 10),
 * jusqu'au prochain 8 du MÊME joueur (binôme), toute la partie (Valet).
 */
export type CoupeRoleSpan = 'next' | 'own' | 'game'

export function coupeRoleSpan(rank: CoupeRank, overrides: CoupeOverrides): CoupeRoleSpan | null {
  if (coupeRuleFor(rank, overrides).kind === 'custom') return null
  if (rank === '5' || rank === '10') return 'next'
  if (rank === '8') return 'own'
  if (rank === 'J') return 'game'
  return null
}

/**
 * Nouvelle partie. Ordre des tirages : le mélange (51), puis le premier joueur.
 * La graine vient du composant (`randomSeed()`), les tests passent la leur.
 */
export function createCoupeGame(
  playerIds: readonly string[],
  settings: CoupeSettings,
  seed: number | string
): CoupeState {
  const rng = createRng(seed)
  const deck = rng.shuffle(createCoupeDeck())
  const turn = playerIds.length > 0 ? rng.pickIndex(playerIds.length) : 0
  return {
    settings: { cup: isCoupeCupMode(settings.cup) ? settings.cup : 'solo', overrides: cleanCoupeOverrides(settings.overrides) },
    playerIds: [...playerIds],
    deck,
    drawn: [],
    turn,
    kingsDrawn: 0,
    thumbMaster: null,
    questionMaster: null,
    pairs: {},
    customRules: [],
    pending: null,
    finished: false,
    cupHolder: null,
    rngState: rng.getState(),
  }
}

/**
 * Le prochain joueur tire la carte du dessus et la main passe. Sans effet (même
 * état rendu) si la partie est finie, si un 8 ou un Valet attend encore sa
 * décision, ou si le paquet est vide.
 */
export function drawCoupeCard(state: CoupeState): CoupeState {
  if (state.finished || state.pending || state.deck.length === 0) return state
  const playerId: string | undefined = state.playerIds[state.turn]
  if (playerId === undefined) return state
  const card = state.deck[0]
  const next: CoupeState = {
    ...state,
    deck: state.deck.slice(1),
    drawn: [...state.drawn, { card, playerId }],
    turn: (state.turn + 1) % state.playerIds.length,
  }

  if (card.rank === 'K') {
    const kingsDrawn = state.kingsDrawn + 1
    if (kingsDrawn >= COUPE_KINGS_TO_FINISH) return { ...next, kingsDrawn, finished: true, cupHolder: playerId }
    return { ...next, kingsDrawn }
  }

  if (coupeRuleFor(card.rank, state.settings.overrides).kind === 'custom') return next

  switch (card.rank) {
    case '5':
      return { ...next, thumbMaster: playerId }
    case '10':
      return { ...next, questionMaster: playerId }
    case '8': {
      const others = state.playerIds.filter((id) => id !== playerId)
      // À deux, le binôme ne se choisit pas : l'écran ne demande rien.
      if (others.length === 1) return { ...next, pairs: { ...state.pairs, [playerId]: others[0] } }
      return others.length > 1 ? { ...next, pending: { kind: 'pair', playerId } } : next
    }
    case 'J':
      return { ...next, pending: { kind: 'rule', playerId } }
    default:
      return next
  }
}

/** Le joueur d'un 8 choisit son binôme ; il remplace son binôme précédent. */
export function setCoupePair(state: CoupeState, playerId: string, partnerId: string): CoupeState {
  if (state.pending?.kind !== 'pair' || state.pending.playerId !== playerId) return state
  if (partnerId === playerId || !state.playerIds.includes(partnerId)) return state
  return { ...state, pairs: { ...state.pairs, [playerId]: partnerId }, pending: null }
}

/** Le joueur d'un Valet ajoute sa règle aux règles en vigueur. Texte vide : sans effet. */
export function addCoupeRule(state: CoupeState, text: string): CoupeState {
  if (state.pending?.kind !== 'rule') return state
  const clean = cleanCoupeText(text)
  if (!clean) return state
  return {
    ...state,
    customRules: [...state.customRules, { text: clean, playerId: state.pending.playerId }],
    pending: null,
  }
}

/** Valet sans inspiration : la table passe sans nouvelle règle. */
export function skipCoupeRule(state: CoupeState): CoupeState {
  if (state.pending?.kind !== 'rule') return state
  return { ...state, pending: null }
}

/**
 * Tire une idée de règle pour le Valet, en évitant `exclude` (idées déjà
 * montrées) tant qu'il en reste d'autres. Le générateur avance dans l'état :
 * la partie reste rejouable à l'identique.
 */
export function pickCoupeSuggestion(
  state: CoupeState,
  exclude: readonly string[] = []
): { state: CoupeState; key: CoupeSuggestionKey } {
  const allowed = COUPE_SUGGESTION_KEYS.filter((key) => !exclude.includes(key))
  const rng = rngFromState(state.rngState)
  const key = rng.pick(allowed.length > 0 ? allowed : COUPE_SUGGESTION_KEYS)
  return { state: { ...state, rngState: rng.getState() }, key }
}

export function isCoupeFinished(state: CoupeState): boolean {
  return state.finished
}

/** Prochain joueur à tirer (null une fois la partie finie). */
export function currentCoupePlayerId(state: CoupeState): string | null {
  if (state.finished) return null
  return state.playerIds[state.turn] ?? null
}

/** Celui qui doit agir : le joueur d'un 8 ou d'un Valet en attente, sinon le prochain à tirer. */
export function coupeActorId(state: CoupeState): string | null {
  if (state.finished) return null
  return state.pending ? state.pending.playerId : currentCoupePlayerId(state)
}

export function lastCoupeDraw(state: CoupeState): CoupeDraw | null {
  return state.drawn.length > 0 ? state.drawn[state.drawn.length - 1] : null
}

/**
 * Binôme que la dernière carte vient de former : un 8 d'origine dont le choix
 * est fait (d'office à deux, validé dans la liste au-delà). Null pendant le
 * choix, pour un 8 réécrit par la table, ou si la dernière carte n'est pas un 8.
 */
export function coupeLastDrawPartner(state: CoupeState): string | null {
  const last = lastCoupeDraw(state)
  if (!last || last.card.rank !== '8' || state.pending) return null
  if (coupeRoleSpan('8', state.settings.overrides) !== 'own') return null
  return state.pairs[last.playerId] ?? null
}

export function coupeKingDraws(state: CoupeState): CoupeDraw[] {
  return state.drawn.filter((d) => d.card.rank === 'K')
}

/** Quelque chose à afficher dans le panneau « En vigueur ». */
export function coupeHasInForce(state: CoupeState): boolean {
  return (
    state.thumbMaster !== null ||
    state.questionMaster !== null ||
    Object.keys(state.pairs).length > 0 ||
    state.customRules.length > 0
  )
}

export type CoupeTallyRow = { playerId: string; cards: number; kings: number; cup: boolean }

/** Bilan dans l'ordre de la table : cartes et rois tirés par chacun, et qui a la coupe. */
export function coupeTally(state: CoupeState): CoupeTallyRow[] {
  return state.playerIds.map((playerId) => {
    const own = state.drawn.filter((d) => d.playerId === playerId)
    return {
      playerId,
      cards: own.length,
      kings: own.filter((d) => d.card.rank === 'K').length,
      cup: state.cupHolder === playerId,
    }
  })
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const COUPE_SAVE_ID = 'coupe-du-roi'
/** À incrémenter dès que la forme de CoupeSave change : l'ancienne sauvegarde est jetée. */
export const COUPE_SAVE_VERSION = 1

/** L'état d'une partie EN COURS (une partie finie ne se sauvegarde pas). */
export type CoupeSave = Omit<CoupeState, 'finished' | 'cupHolder'>

export function toCoupeSave(state: CoupeState): CoupeSave {
  return {
    settings: state.settings,
    playerIds: state.playerIds,
    deck: state.deck,
    drawn: state.drawn,
    turn: state.turn,
    kingsDrawn: state.kingsDrawn,
    thumbMaster: state.thumbMaster,
    questionMaster: state.questionMaster,
    pairs: state.pairs,
    customRules: state.customRules,
    pending: state.pending,
    rngState: state.rngState,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCoupeCard(value: unknown): value is CoupeCard {
  return isRecord(value) && isCoupeRank(value.rank) && isCoupeSuit(value.suit)
}

const cardKey = (card: CoupeCard) => `${card.rank}-${card.suit}`

/**
 * Sauvegarde → partie, pour la table ACTUELLE (mêmes joueurs, comparés comme
 * ensemble ; l'ordre de passage reste celui de la sauvegarde, auquel `turn` et
 * les tirages se rapportent). Null au moindre écart : paquet incomplet ou en
 * double, joueur inconnu, roi en trop… Une partie neuve plutôt qu'un écran
 * planté. Les réglages viennent de la sauvegarde : reprendre, c'est continuer
 * la partie telle qu'elle était.
 */
export function restoreCoupeSave(save: unknown, playerIds: readonly string[]): CoupeState | null {
  if (!isRecord(save)) return null

  const savedIds = save.playerIds
  if (!Array.isArray(savedIds) || savedIds.length === 0 || savedIds.length !== playerIds.length) return null
  const order = savedIds.filter((id): id is string => typeof id === 'string' && playerIds.includes(id))
  if (order.length !== playerIds.length || new Set(order).size !== order.length) return null
  const known = (id: unknown): id is string => typeof id === 'string' && order.includes(id)

  const settings = save.settings
  if (!isRecord(settings) || !isCoupeCupMode(settings.cup)) return null
  const cup = settings.cup

  const deck = save.deck
  if (!Array.isArray(deck) || !deck.every(isCoupeCard)) return null
  const rawDrawn = save.drawn
  if (!Array.isArray(rawDrawn)) return null
  const drawn: CoupeDraw[] = []
  for (const entry of rawDrawn) {
    if (!isRecord(entry) || !isCoupeCard(entry.card) || !known(entry.playerId)) return null
    drawn.push({ card: { rank: entry.card.rank, suit: entry.card.suit }, playerId: entry.playerId })
  }
  const cards = [...deck, ...drawn.map((d) => d.card)]
  if (cards.length !== COUPE_DECK_SIZE || new Set(cards.map(cardKey)).size !== COUPE_DECK_SIZE) return null
  const kingsDrawn = drawn.filter((d) => d.card.rank === 'K').length
  if (save.kingsDrawn !== kingsDrawn || kingsDrawn >= COUPE_KINGS_TO_FINISH) return null

  const turn = save.turn
  if (typeof turn !== 'number' || !Number.isInteger(turn) || turn < 0 || turn >= order.length) return null

  const thumbMaster = save.thumbMaster
  const questionMaster = save.questionMaster
  if (thumbMaster !== null && !known(thumbMaster)) return null
  if (questionMaster !== null && !known(questionMaster)) return null

  const rawPairs = save.pairs
  if (!isRecord(rawPairs)) return null
  const pairs: Record<string, string> = {}
  for (const [from, to] of Object.entries(rawPairs)) {
    if (!known(from) || !known(to) || from === to) return null
    pairs[from] = to
  }

  const rawRules = save.customRules
  if (!Array.isArray(rawRules)) return null
  const customRules: CoupeCustomRule[] = []
  for (const rule of rawRules) {
    if (!isRecord(rule) || !known(rule.playerId)) return null
    const text = cleanCoupeText(rule.text)
    if (!text) return null
    customRules.push({ text, playerId: rule.playerId })
  }

  let pending: CoupePending | null = null
  const rawPending = save.pending
  if (rawPending !== null) {
    if (!isRecord(rawPending)) return null
    const kind = rawPending.kind
    const pendingPlayer = rawPending.playerId
    if ((kind !== 'pair' && kind !== 'rule') || !known(pendingPlayer)) return null
    pending = { kind, playerId: pendingPlayer }
  }

  const rngState = save.rngState
  if (typeof rngState !== 'number' || !Number.isFinite(rngState)) return null

  return {
    settings: { cup, overrides: cleanCoupeOverrides(settings.overrides) },
    playerIds: order,
    deck: deck.map((card) => ({ rank: card.rank, suit: card.suit })),
    drawn,
    turn,
    kingsDrawn,
    thumbMaster,
    questionMaster,
    pairs,
    customRules,
    pending,
    finished: false,
    cupHolder: null,
    rngState: rngState >>> 0,
  }
}
