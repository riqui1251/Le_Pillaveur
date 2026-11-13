import { hashSeed, rngFromState, type RngState } from '@/lib/petit-buveur/rng'
import {
  CAP_KINDS,
  CAP_LEVELS,
  CAP_THEMES,
  type CapCardMeta,
  type CapKind,
  type CapLevel,
  type CapTheme,
} from './data/types'

/**
 * Moteur pur de « Cap ou Pas Cap ? » (LOCAL : un téléphone qui fait le tour de la table).
 *
 * À son tour, le joueur choisit Vérité ou Action. La carte tirée (niveau du moment, thèmes
 * choisis, jamais deux fois la même tant qu'il en reste) annonce son prix, de 1 à 5.
 * « Cap ! » : il relève et distribue le prix ; « Pas cap » : il le boit. Joker « Retour à
 * l'envoyeur », un par joueur et par partie : la carte part chez un autre joueur au double du
 * prix, et le tour du lanceur est joué.
 *
 * Le moteur ne compte que des événements neutres (cartes relevées ou refusées, prix cumulés) :
 * gorgées et points se calculent à l'affichage, selon l'ambiance. L'aléatoire vit dans
 * `rngState` (src/lib/petit-buveur/rng), la graine est donnée à `createGame`.
 */

export { CAP_KINDS, CAP_LEVELS, CAP_THEMES }
export type { CapCardMeta, CapKind, CapLevel, CapTheme }

export const CAP_LEVEL_SETTINGS = ['apero', 'soiree', 'apres-minuit', 'progressif'] as const
export type CapLevelSetting = (typeof CAP_LEVEL_SETTINGS)[number]

/** Prix le plus haut inscrit sur une carte (les pastilles de prix en montrent autant). */
export const CAP_PRICE_MAX = 5

export type CapSettings = {
  level: CapLevelSetting
  /** Jamais vide : une liste vide vaut « tout mélanger ». */
  themes: CapTheme[]
}

/** Carte jouable : méta neutre + texte dans la langue de la table. */
export type CapCard = CapCardMeta & { readonly text: string }

/** Jeton du texte remplacé par un autre joueur de la table, tiré au sort. */
export const CAP_PLAYER_TOKEN = '{player}'

export type CapOutcome = 'done' | 'refused'

export type CapCurrent = {
  cardId: string
  kind: CapKind
  /** Prix inscrit sur la carte, avant tout doublement. */
  price: number
  /** Joueur qui remplace {player} dans le texte ; null si la carte n'en parle pas. */
  targetPlayer: string | null
  /** Joueur qui a reçu la carte par « Retour à l'envoyeur ». */
  returnedTo: string | null
}

/** Événements neutres d'un joueur : gorgées et points s'en déduisent à l'affichage. */
export type CapTally = {
  done: number
  refused: number
  /** Somme des prix des cartes relevées (doublés pour une carte renvoyée). */
  donePrice: number
  /** Somme des prix des cartes refusées (doublés pour une carte renvoyée). */
  refusedPrice: number
}

export type CapState = {
  settings: CapSettings
  /** Table, dans l'ordre du tour. */
  playerIds: string[]
  firstPlayerIndex: number
  /** Tours joués depuis le début de la partie. */
  turn: number
  /** Tour de table en cours, à partir de 1. */
  round: number
  /** Cartes déjà tirées, dans l'ordre du tirage. */
  deckUsed: string[]
  current: CapCurrent | null
  /** Joueurs qui ont déjà joué leur joker. */
  jokersUsed: string[]
  tallies: Record<string, CapTally>
  rngState: RngState
  ended: boolean
}

const emptyTally = (): CapTally => ({ done: 0, refused: 0, donePrice: 0, refusedPrice: 0 })

function roundForTurn(turn: number, tableSize: number): number {
  return Math.floor(turn / Math.max(1, tableSize)) + 1
}

/** Thèmes valides, dans l'ordre du catalogue, sans doublon ; aucun thème = tous. */
export function normalizeCapThemes(themes: readonly string[]): CapTheme[] {
  const picked = CAP_THEMES.filter((theme) => themes.includes(theme))
  return picked.length > 0 ? picked : [...CAP_THEMES]
}

export function createGame(options: {
  playerIds: readonly string[]
  settings: CapSettings
  seed: string | number
}): CapState {
  const rng = rngFromState(hashSeed(options.seed))
  const playerIds = [...options.playerIds]
  const tallies: Record<string, CapTally> = {}
  for (const id of playerIds) tallies[id] = emptyTally()
  return {
    settings: { level: options.settings.level, themes: normalizeCapThemes(options.settings.themes) },
    playerIds,
    firstPlayerIndex: playerIds.length > 0 ? rng.pickIndex(playerIds.length) : 0,
    turn: 0,
    round: 1,
    deckUsed: [],
    current: null,
    jokersUsed: [],
    tallies,
    rngState: rng.getState(),
    ended: false,
  }
}

/** Progressif : Apéro au 1er tour de table, Soirée aux 2e et 3e, Après minuit à partir du 4e. */
export function levelForRound(level: CapLevelSetting, round: number): CapLevel {
  if (level !== 'progressif') return level
  if (round >= 4) return 'apres-minuit'
  if (round >= 2) return 'soiree'
  return 'apero'
}

export function currentLevel(state: CapState): CapLevel {
  return levelForRound(state.settings.level, state.round)
}

/**
 * Progressif : le niveau qui vient de monter, au premier tour d'un nouveau tour de table
 * (avant tout tirage) ; null sinon. L'écran l'annonce une fois.
 */
export function capLevelUp(state: CapState): CapLevel | null {
  const n = state.playerIds.length
  if (state.settings.level !== 'progressif' || state.current || n === 0) return null
  if (state.turn === 0 || state.turn % n !== 0) return null
  const level = levelForRound('progressif', state.round)
  return level === levelForRound('progressif', state.round - 1) ? null : level
}

/** Joueur au tour : celui qui choisit Vérité ou Action. */
export function currentPlayerId(state: CapState): string | null {
  const n = state.playerIds.length
  if (n === 0) return null
  return state.playerIds[(state.firstPlayerIndex + state.turn) % n] ?? null
}

/** Joueur qui doit répondre à la carte : le destinataire d'un renvoi, sinon le joueur au tour. */
export function cardHolderId(state: CapState): string | null {
  return state.current?.returnedTo ?? currentPlayerId(state)
}

/** Ce que coûte la carte en jeu : son prix, doublé si elle a été renvoyée. */
export function cardStake(current: Pick<CapCurrent, 'price' | 'returnedTo'>): number {
  return current.returnedTo ? current.price * 2 : current.price
}

export function capPool(
  cards: readonly CapCard[],
  filter: { level: CapLevel; themes: readonly CapTheme[]; kind: CapKind },
): CapCard[] {
  return cards.filter(
    (card) => card.level === filter.level && card.kind === filter.kind && filter.themes.includes(card.theme),
  )
}

/** Pioche du moment pour un type : niveau du tour de table, thèmes de la partie. */
export function capPoolFor(state: CapState, kind: CapKind, cards: readonly CapCard[]): CapCard[] {
  return capPool(cards, { level: currentLevel(state), themes: state.settings.themes, kind })
}

export function hasPlayerToken(text: string): boolean {
  return text.indexOf(CAP_PLAYER_TOKEN) !== -1
}

/** Le texte découpé autour de {player} : un nom s'insère entre deux morceaux. */
export function splitPlayerToken(text: string): string[] {
  return text.split(CAP_PLAYER_TOKEN)
}

export function fillPlayerToken(text: string, name: string): string {
  return splitPlayerToken(text).join(name)
}

/**
 * Joueur qui remplace {player} dans le texte de la carte en jeu. Le tirage le fixe ; si le
 * texte en cite un sans tirage (partie reprise dans une autre langue), c'est le voisin du
 * joueur qui tient la carte.
 */
export function capTargetId(state: CapState, text: string): string | null {
  if (!state.current || !hasPlayerToken(text)) return null
  if (state.current.targetPlayer) return state.current.targetPlayer
  const holder = cardHolderId(state)
  const n = state.playerIds.length
  const from = holder === null ? -1 : state.playerIds.indexOf(holder)
  for (let step = 1; step < n; step += 1) {
    const id = state.playerIds[(from + step + n) % n]
    if (id !== undefined && id !== holder) return id
  }
  return null
}

function lastDrawnAmong(deckUsed: readonly string[], ids: ReadonlySet<string>): string | null {
  for (let i = deckUsed.length - 1; i >= 0; i -= 1) {
    if (ids.has(deckUsed[i])) return deckUsed[i]
  }
  return null
}

/**
 * Tire une carte du type choisi au niveau du moment, parmi les thèmes de la partie.
 * Sans remise : quand toutes les cartes de ce filtre sont sorties, elles retournent dans la
 * pioche, sauf la dernière vue (jamais deux fois de suite). Null si la pioche est vide, si une
 * carte attend déjà sa réponse ou si la partie est finie.
 */
export function drawCard(state: CapState, kind: CapKind, cards: readonly CapCard[]): CapState | null {
  if (state.ended || state.current) return null
  const holder = currentPlayerId(state)
  if (holder === null) return null
  const pool = capPool(cards, { level: currentLevel(state), themes: state.settings.themes, kind })
  if (pool.length === 0) return null

  const poolIds = new Set(pool.map((card) => card.id))
  const seen = new Set(state.deckUsed)
  let deckUsed = state.deckUsed
  let candidates = pool.filter((card) => !seen.has(card.id))
  if (candidates.length === 0) {
    const last = lastDrawnAmong(state.deckUsed, poolIds)
    deckUsed = state.deckUsed.filter((id) => !poolIds.has(id))
    candidates = pool.length > 1 ? pool.filter((card) => card.id !== last) : pool
  }

  const rng = rngFromState(state.rngState)
  const card = rng.pick(candidates)
  const others = state.playerIds.filter((id) => id !== holder)
  const targetPlayer = hasPlayerToken(card.text) && others.length > 0 ? rng.pick(others) : null
  return {
    ...state,
    deckUsed: [...deckUsed, card.id],
    current: { cardId: card.id, kind: card.kind, price: card.price, targetPlayer, returnedTo: null },
    rngState: rng.getState(),
  }
}

/**
 * « Cap ! » (done) ou « Pas cap » (refused) pour la carte en jeu, puis la main passe au voisin
 * du joueur au tour : après un renvoi, c'est le tour du lanceur qui est joué.
 */
export function resolve(state: CapState, outcome: CapOutcome): CapState | null {
  const current = state.current
  if (state.ended || !current) return null
  const playerId = cardHolderId(state)
  if (playerId === null) return null
  const stake = cardStake(current)
  const tally = state.tallies[playerId] ?? emptyTally()
  const nextTally: CapTally =
    outcome === 'done'
      ? { ...tally, done: tally.done + 1, donePrice: tally.donePrice + stake }
      : { ...tally, refused: tally.refused + 1, refusedPrice: tally.refusedPrice + stake }
  const turn = state.turn + 1
  return {
    ...state,
    tallies: { ...state.tallies, [playerId]: nextTally },
    current: null,
    turn,
    round: roundForTurn(turn, state.playerIds.length),
  }
}

export function hasJoker(state: CapState, playerId: string): boolean {
  return !state.jokersUsed.includes(playerId)
}

export function canReturnToSender(state: CapState): boolean {
  const sender = currentPlayerId(state)
  if (state.ended || !state.current || state.current.returnedTo || sender === null) return false
  return state.playerIds.length > 1 && hasJoker(state, sender)
}

/** Joker du joueur au tour : la carte en jeu part chez `targetPlayer`, au double du prix. */
export function returnToSender(state: CapState, targetPlayer: string): CapState | null {
  const sender = currentPlayerId(state)
  const current = state.current
  if (!canReturnToSender(state) || !current || sender === null) return null
  if (targetPlayer === sender || !state.playerIds.includes(targetPlayer)) return null
  return {
    ...state,
    current: {
      ...current,
      returnedTo: targetPlayer,
      // Le destinataire ne peut pas être le {player} de sa propre carte : elle vise alors l'envoyeur.
      targetPlayer: current.targetPlayer === targetPlayer ? sender : current.targetPlayer,
    },
    jokersUsed: [...state.jokersUsed, sender],
  }
}

/** Fin de partie demandée par la table : une carte encore en jeu ne compte pas. */
export function endGame(state: CapState): CapState {
  if (state.ended) return state
  return { ...state, ended: true, current: null }
}

/** Score d'audace (les points du mode Sans alcool) : prix relevés moins prix refusés. */
export function capPoints(tally: CapTally): number {
  return tally.donePrice - tally.refusedPrice
}

export function capCardsPlayed(state: CapState): number {
  let played = 0
  for (const id of state.playerIds) {
    const tally = state.tallies[id]
    if (tally) played += tally.done + tally.refused
  }
  return played
}

export type CapRankingEntry = CapTally & {
  playerId: string
  points: number
  /** 1 = en tête ; des points égaux partagent le rang. */
  rank: number
  /** En tête avec un score positif. */
  won: boolean
}

/** Classement par points, puis cartes relevées, puis moins de refus, puis ordre de la table. */
export function ranking(state: CapState): CapRankingEntry[] {
  const rows = state.playerIds.map((playerId, index) => {
    const tally = state.tallies[playerId] ?? emptyTally()
    return { index, playerId, tally, points: capPoints(tally) }
  })
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.tally.done - a.tally.done ||
      a.tally.refused - b.tally.refused ||
      a.index - b.index,
  )
  const entries: CapRankingEntry[] = []
  rows.forEach((row, i) => {
    const rank = i > 0 && row.points === rows[i - 1].points ? entries[i - 1].rank : i + 1
    entries.push({ ...row.tally, playerId: row.playerId, points: row.points, rank, won: rank === 1 && row.points > 0 })
  })
  return entries
}

// ─── Réglages de la pré-partie ───────────────────────────────────────────────

export function mixesAllCapThemes(themes: readonly CapTheme[]): boolean {
  return CAP_THEMES.every((theme) => themes.includes(theme))
}

/** « Tout mélanger » : tous les thèmes, ou aucun s'ils l'étaient déjà (la table choisit alors). */
export function toggleAllCapThemes(themes: readonly CapTheme[]): CapTheme[] {
  return mixesAllCapThemes(themes) ? [] : [...CAP_THEMES]
}

export function toggleCapTheme(themes: readonly CapTheme[], theme: CapTheme): CapTheme[] {
  const next = themes.includes(theme) ? themes.filter((t) => t !== theme) : [...themes, theme]
  return CAP_THEMES.filter((t) => next.includes(t))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function parseSettings(value: unknown): CapSettings | null {
  if (!isRecord(value)) return null
  const { level, themes } = value
  if (typeof level !== 'string' || !(CAP_LEVEL_SETTINGS as readonly string[]).includes(level)) return null
  if (!isStringArray(themes) || themes.length === 0) return null
  if (!themes.every((theme) => (CAP_THEMES as readonly string[]).includes(theme))) return null
  return { level: level as CapLevelSetting, themes: normalizeCapThemes(themes) }
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const CAP_SAVE_ID = 'cap-ou-pas-cap'
/** À incrémenter dès que la forme de CapSave change : l'ancienne sauvegarde est jetée. */
export const CAP_SAVE_VERSION = 1

export type CapSave = {
  settings: CapSettings
  /** Identifiants seulement, dans l'ordre du tour : les profils viennent de la table courante. */
  playerIds: string[]
  firstPlayerIndex: number
  turn: number
  deckUsed: string[]
  current: CapCurrent | null
  jokersUsed: string[]
  tallies: Record<string, CapTally>
  rngState: number
}

export function toCapSave(state: CapState): CapSave {
  return {
    settings: state.settings,
    playerIds: state.playerIds,
    firstPlayerIndex: state.firstPlayerIndex,
    turn: state.turn,
    deckUsed: state.deckUsed,
    current: state.current,
    jokersUsed: state.jokersUsed,
    tallies: state.tallies,
    rngState: state.rngState,
  }
}

/** Joueur de la table, null, ou undefined si la valeur est illisible. */
function parseOptionalPlayer(value: unknown, table: readonly string[]): string | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && table.includes(value) ? value : undefined
}

/** Carte en jeu, null, ou undefined si la valeur est illisible. */
function parseCurrent(value: unknown, table: readonly string[]): CapCurrent | null | undefined {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return undefined
  const { cardId, kind, price } = value
  if (typeof cardId !== 'string' || cardId.length === 0) return undefined
  if (typeof kind !== 'string' || !(CAP_KINDS as readonly string[]).includes(kind)) return undefined
  if (!isCount(price) || price < 1 || price > 5) return undefined
  const targetPlayer = parseOptionalPlayer(value.targetPlayer, table)
  const returnedTo = parseOptionalPlayer(value.returnedTo, table)
  if (targetPlayer === undefined || returnedTo === undefined) return undefined
  return { cardId, kind: kind as CapKind, price, targetPlayer, returnedTo }
}

function parseTallies(value: unknown, table: readonly string[]): Record<string, CapTally> | null {
  if (!isRecord(value)) return null
  const tallies: Record<string, CapTally> = {}
  for (const id of table) {
    const raw = value[id]
    if (raw === undefined) {
      tallies[id] = emptyTally()
      continue
    }
    if (!isRecord(raw)) return null
    const { done, refused, donePrice, refusedPrice } = raw
    if (!isCount(done) || !isCount(refused) || !isCount(donePrice) || !isCount(refusedPrice)) return null
    tallies[id] = { done, refused, donePrice, refusedPrice }
  }
  return tallies
}

/**
 * Sauvegarde → état pour la table ACTUELLE (mêmes joueurs, l'ordre du tour de la sauvegarde
 * est gardé). Null si illisible : une partie neuve plutôt qu'un écran planté. Une carte en
 * jeu absente de `knownCardIds` (banque modifiée depuis) est écartée : le joueur re-tire.
 */
export function restoreCapSave(
  save: unknown,
  playerIds: readonly string[],
  knownCardIds?: ReadonlySet<string>,
): CapState | null {
  if (!isRecord(save)) return null
  const settings = parseSettings(save.settings)
  if (!settings) return null
  const { playerIds: order, firstPlayerIndex, turn, deckUsed, jokersUsed, rngState } = save
  if (!isStringArray(order) || order.length === 0 || order.length !== playerIds.length) return null
  if (new Set(order).size !== order.length || !order.every((id) => playerIds.includes(id))) return null
  if (!isCount(firstPlayerIndex) || firstPlayerIndex >= order.length) return null
  if (!isCount(turn) || !isStringArray(deckUsed)) return null
  if (!isStringArray(jokersUsed) || !jokersUsed.every((id) => order.includes(id))) return null
  if (!isCount(rngState) || rngState > 0xffffffff) return null
  const current = parseCurrent(save.current, order)
  if (current === undefined) return null
  const tallies = parseTallies(save.tallies, order)
  if (!tallies) return null
  return {
    settings,
    playerIds: [...order],
    firstPlayerIndex,
    turn,
    round: roundForTurn(turn, order.length),
    deckUsed: [...deckUsed],
    current: current && knownCardIds && !knownCardIds.has(current.cardId) ? null : current,
    jokersUsed: order.filter((id) => jokersUsed.includes(id)),
    tallies,
    rngState,
    ended: false,
  }
}

/**
 * Reprise proposée selon la table seule : la partie repart avec les réglages de SA sauvegarde.
 * La pré-partie revient aux réglages par défaut après un rechargement ; les comparer effaçait
 * sans prévenir toute partie lancée avec d'autres réglages.
 */
export function canResumeCapSave(save: unknown, playerIds: readonly string[]): boolean {
  return restoreCapSave(save, playerIds) !== null
}
