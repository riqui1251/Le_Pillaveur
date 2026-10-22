import {
  BOARD_SIZE,
  CASES_INTERACTIVE,
  CASES_INTERACTIVE_TARGET,
  CASES_META,
  CASES_NO_SELF_TARGET,
  CASES_NO_TARGET,
  needsTarget,
  type CaseType,
  type Difficulty,
  type EngineCase,
} from './types'
import { rngFromState, hashSeed, type RngState, type SeededRng } from './rng'
import { generateCase } from './case-generator'

/**
 * Moteur Petit Buveur — pur, déterministe, serveur-autoritaire.
 *
 * `reduce(state, action)` ne dépend que de l'état (RNG inclus via `rngState`)
 * et de l'action : rejouer la même graine + la même suite d'actions reproduit
 * exactement la partie. Aucune dépendance UI ni i18n.
 *
 * Règles communes au jeu local et au jeu en ligne (contrat de règles) :
 *  - victoire dès qu'un déplacement, quel qu'il soit, pose un joueur sur la
 *    dernière case ; à égalité, l'acteur, puis l'ordre de jeu après lui ;
 *  - la protection bloque les effets négatifs imposés par la case d'un AUTRE
 *    joueur (gorgées, reculs, échanges, liens, statuts), jamais les positifs ;
 *  - Défi / Question : le joueur au tour arbitre (réussi / raté), sauf cible
 *    protégée par un autre : bloqué d'office, comme en local ;
 *  - Pile ou face : la CIBLE choisit son côté (étape `side`) ;
 *  - Chance : « Relancer » (nouveau lancer complet) ou « +2 cases » ;
 *  - Répétition / Rewind rejouent la dernière case effective ; Double case
 *    applique deux cases simples à la même cible dans le même tour ;
 *  - Duel : arrivé au dé sur une case occupée (hors départ), l'acteur peut
 *    défier un joueur présent avant la case ; pile ou face, le perdant recule
 *    d'une case, sauf s'il est protégé (même règle que applyDuelResult).
 */

export interface EnginePlayer {
  id: string
  name: string
  /** Joueur contrôlé par le serveur (remplaçant d'un humain parti/inactif). */
  isBot?: boolean
  /** Timestamp (ms) du départ du joueur en cours de partie — null/absent s'il est là. */
  leftAt?: number | null
  position: number
  drinks: number
  protected: boolean
  /** Tours restants de protection (durée : un tour de table). */
  protectionTurnsLeft?: number
  /** Tours de malédiction restants (boit 1 gorgée en début de tour). */
  cursed: number
  skipNextTurn: boolean
  anchored: boolean
  /** Défi-chaîne : lié à ce joueur (boivent ensemble). */
  linkedTo?: string
  linkedTurns?: number
  /** Miroir inversé : quand ce joueur boit, sa cible boit aussi. */
  mirrorDrinkTargetId?: string
  mirrorDrinkTurns?: number
}

export interface EngineSettings {
  difficulty: Difficulty
  /** Gorgées par défi (donnée i18n canonique). */
  defiDrinks: number[]
  /**
   * Indices de défis autorisés au tirage (en ligne : uniquement les défis
   * vérifiables, pas de défi physique). Absent (états existants) = tous.
   */
  defiAllowed?: number[]
}

export type EnginePhase = 'playing' | 'awaiting-interaction' | 'finished'

/**
 * Résultat PUBLIC de la dernière case interactive résolue — permet au client
 * d'animer le tirage (roue qui tourne, pièce qui retombe, dé qui roule) vers
 * un résultat déjà décidé par le serveur, chez TOUS les joueurs (acteur,
 * spectateurs, tours de bots). Aucune information secrète ici.
 */
export type LastInteraction =
  | { kind: 'de-honte'; actorId: string; value: number }
  | {
      kind: 'pile-face'
      actorId: string
      targetId: string | null
      /** Côté choisi par la CIBLE. */
      side: 'pile' | 'face'
      flip: 'pile' | 'face'
      /** Gorgées réellement bues par la cible (0 si gagné ou protégée). */
      drinks: number
    }
  | { kind: 'roue'; actorId: string; segment: number; drinks: number }
  | { kind: 'roue-defis'; actorId: string; drinks: number }
  | ({ kind: 'duel'; actorId: string } & DuelNote)

/** Duel sur case partagée : l'acteur (challenger) contre `opponentId`. */
export type DuelNote = {
  opponentId: string
  /** Le challenger gagne : son adversaire recule d'une case. */
  challengerWins: boolean
  /** Le perdant était protégé : il ne recule pas. */
  loserProtected: boolean
}

/** Ce qu'un joueur a subi lors de la dernière case résolue (gorgées, déplacement). */
export type LastOutcomeChange = { playerId: string; drinks: number; from: number; to: number }

/**
 * Ce que la case a fait SANS que les gorgées ou les positions le montrent —
 * le client en tire un message explicite au lieu de « Aucun dégât ».
 */
export type OutcomeNote =
  /** Effet négatif bloqué : le joueur est protégé. */
  | { kind: 'protected'; playerId: string }
  /** Recul demandé depuis la case de départ : le pion ne bouge pas. */
  | { kind: 'cannot-move-back'; playerId: string }
  /** Roulette russe : la balle n'est pas partie. */
  | { kind: 'spared'; playerId: string }
  /** Pont : case du pont (index 0..29) et sens tiré pour ceux qui s'y trouvaient. */
  | { kind: 'bridge'; position: number; delta: 1 | -1 }
  /** Répétition / Rewind sans case effective jouée auparavant. */
  | { kind: 'nothing-to-replay' }
  /** Case normale. */
  | { kind: 'safe' }
  /** Personne n'est concerné (grappin en tête, loterie à deux, téléport sur soi…). */
  | { kind: 'no-effect' }

export type ChanceChoice = 'reroll' | 'plus2'

/**
 * Résultat PUBLIC de la dernière case appliquée — calculé par diff avant/après
 * pour que le client affiche lisiblement CE QUE la case a fait (« Wanda +6 🍺 »,
 * « Momo → case 12 ») avant de passer au joueur suivant.
 */
export type LastOutcome = {
  /** Case sur laquelle l'acteur est tombé (méta-case comprise : 'repetition', 'double-case'…). */
  caseType: CaseType
  actorId: string
  changes: LastOutcomeChange[]
  /** Joueur visé, quand la case en demandait un. */
  targetId?: string | null
  /** Répétition / Rewind : la case rejouée (absente s'il n'y avait rien à rejouer). */
  effectiveCase?: EngineCase
  /** Double case : les deux cases appliquées, dans l'ordre. */
  cases?: EngineCase[]
  /** Double case : ce que chacune des deux cases a fait (deux effets peuvent s'annuler dans `changes`). */
  caseChanges?: LastOutcomeChange[][]
  notes?: OutcomeNote[]
  /**
   * Présents quand le dé a été lancé DANS LA MÊME action que l'effet (case
   * résolue d'office, relance Chance) : départ et case d'arrivée du DÉ, avant
   * l'effet. Le client anime dé → pion jusqu'à `diceLanding` → effet.
   */
  diceFrom?: number
  diceLanding?: number
  /** Case tirée après « Relancer » de la case Chance. */
  rerolled?: boolean
  /** Défi / Question : verdict de l'arbitre. */
  succeeded?: boolean
  chanceChoice?: ChanceChoice
  /** Duel joué juste avant cette case, sur la case d'arrivée. */
  duel?: DuelNote
}

/** Entrée d'historique : un effet résolu, daté par tour et dé. */
export type OutcomeEntry = LastOutcome & { turn: number; dice: number | null }

const OUTCOME_HISTORY_LIMIT = 25

/** Ajoute un effet à l'historique public (borné, plus récent en dernier). */
function pushOutcomeEntry(history: OutcomeEntry[] | undefined, entry: OutcomeEntry): OutcomeEntry[] {
  return [...(history ?? []).slice(-(OUTCOME_HISTORY_LIMIT - 1)), entry]
}

export interface LogEntry {
  turn: number
  playerId: string
  message: string
}

/**
 * Case en attente. Sans `stage`, l'acteur résout la case (cible et/ou choix).
 * `stage: 'verdict'` : l'acteur arbitre le défi de `targetId` (`succeeded`).
 * `stage: 'side'` : `targetId` choisit pile ou face (`side`), avant `deadlineAt`.
 * `stage: 'duel'` : avant la case tirée (`case`), l'acteur défie un joueur de
 * `opponents` (`targetId`) ou passe (sans `targetId`).
 */
export interface EnginePending {
  /** Type de la case à résoudre : la case REJOUÉE pour Répétition / Rewind, 'double-case' sinon. */
  caseType: CaseType
  /** Acteur (joueur au tour). */
  playerId: string
  /** La résolution attend un `targetId` pour une case à cible (Double case comprise). */
  needsTarget: boolean
  /** Case effective (valeurs d'effet). Absente sur les états anciens : `lastCase`. */
  case?: EngineCase
  /** Méta-case qui rejoue `case`. */
  via?: 'repetition' | 'rewind'
  /** Double case : les deux cases simples à appliquer à la même cible. */
  cases?: EngineCase[]
  stage?: 'verdict' | 'side' | 'duel'
  targetId?: string
  /** Étape `duel` : adversaires présents sur la case d'arrivée. */
  opponents?: string[]
  /** Étape `side` : échéance (epoch ms, horloge serveur) avant tirage au hasard. */
  deadlineAt?: number
  /**
   * VUE CLIENT seulement (jamais dans l'état du moteur) : case tirée cachée
   * pendant un choix de cible à l'aveugle — `caseType` n'y vaut rien, voir
   * hidesDrawnCase (server-adapter.ts).
   */
  hidden?: boolean
}

export interface EngineState {
  /** Version logique (incrémentée à chaque action appliquée). */
  version: number
  /** Position persistée du RNG. */
  rngState: RngState
  settings: EngineSettings
  players: EnginePlayer[]
  /** Index du joueur courant. */
  currentPlayer: number
  turnCount: number
  lastDice: number | null
  /** Delta de déplacement réellement appliqué (0 si le joueur était ancré, distinct de lastDice). */
  lastMoveDelta: number | null
  /** Somme des déplacements au dé de l'acteur pendant ce tour (relance Chance comprise). Absent : lastMoveDelta. */
  turnDiceTotal?: number
  lastCase: EngineCase | null
  /** Dernière case effective jouée (hors méta-cases et Normale) : ce que Répétition / Rewind rejouent. */
  lastEffectiveCase?: EngineCase | null
  pending: EnginePending | null
  /** Spectacle client : résultat public du dernier tirage interactif (absent sur les états anciens). */
  lastInteraction?: LastInteraction | null
  /** Lisibilité client : effets appliqués par la dernière case (absent sur les états anciens). */
  lastOutcome?: LastOutcome | null
  /** Historique public des effets résolus (borné, absent sur les états anciens). */
  outcomeHistory?: OutcomeEntry[]
  /** Duel joué ce tour, rattaché au prochain effet enregistré (la case peut attendre une cible). */
  duelNote?: DuelNote | null
  phase: EnginePhase
  /** Id du joueur gagnant, ou null. */
  winner: string | null
  log: LogEntry[]
}

/** Choix joueur pour résoudre une case interactive (cible, côté de pièce, option…). */
export type InteractionChoice = {
  targetId?: string
  /** Pile ou face, étape `side` : côté choisi par la cible. */
  side?: 'pile' | 'face'
  /** Téléport : 'leader' | 'last'. */
  option?: string
  /** Défi / Question : verdict de l'arbitre. */
  succeeded?: boolean
  chanceChoice?: ChanceChoice
}

export type EngineAction =
  | { type: 'ROLL'; playerId: string }
  | { type: 'RESOLVE_INTERACTION'; playerId: string; choice?: InteractionChoice }

export type EnginePlayerInit = { id: string; name: string }

export class EngineError extends Error {}

/** Choix mal formé (côté, verdict, option Chance) : refus, jamais de valeur par défaut. */
export const INVALID_CHOICE = 'INVALID_CHOICE'
/** Cible absente, inconnue ou interdite (soi-même pour Échange / Défi en chaîne). */
export const INVALID_TARGET = 'INVALID_TARGET'

const LOG_LIMIT = 40
const DEFAULT_CURSE_TURNS = 3
const DEFAULT_CHAIN_TURNS = 5
const DEFAULT_MIRROR_TURNS = 1

function clampPos(pos: number): number {
  return Math.max(0, Math.min(BOARD_SIZE - 1, pos))
}

export function createInitialState(
  players: EnginePlayerInit[],
  settings: EngineSettings,
  seed: string | number
): EngineState {
  return {
    version: 0,
    rngState: hashSeed(seed),
    settings,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      position: 0,
      drinks: 0,
      protected: false,
      cursed: 0,
      skipNextTurn: false,
      anchored: false,
    })),
    currentPlayer: 0,
    turnCount: 1,
    lastDice: null,
    lastMoveDelta: null,
    lastCase: null,
    pending: null,
    lastInteraction: null,
    lastOutcome: null,
    outcomeHistory: [],
    phase: 'playing',
    winner: null,
    log: [],
  }
}

/** Diff avant/après d'une résolution de case : gorgées prises et déplacements. */
function diffOutcome(before: EnginePlayer[], after: EnginePlayer[]): LastOutcomeChange[] {
  const changes: LastOutcomeChange[] = []
  for (const b of before) {
    const a = after.find((p) => p.id === b.id)
    if (!a) continue
    const drinks = a.drinks - b.drinks
    if (drinks > 0 || a.position !== b.position) {
      changes.push({ playerId: a.id, drinks: Math.max(0, drinks), from: b.position, to: a.position })
    }
  }
  return changes
}

function pushLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log.slice(-(LOG_LIMIT - 1)), entry]
}

/** Protection active pendant un tour de table complet. */
function isProtected(p: EnginePlayer): boolean {
  return p.protected && (p.protectionTurnsLeft ?? 0) > 0
}

/** La protection ne couvre que ce qu'impose la case d'un AUTRE joueur. */
function shielded(target: EnginePlayer, actor: EnginePlayer): boolean {
  return target.id !== actor.id && isProtected(target)
}

/**
 * `sourceId` : joueur dont la case fait boire (sa propre case ne lui est jamais
 * bloquée). Absent : gorgée propagée par un lien ou malédiction, toujours
 * bloquée chez un protégé — même règle que le jeu local (local-rules.ts).
 */
type Propagation = { sourceId?: string; skipMirror?: boolean; skipChain?: boolean }

/** Fait boire un joueur, avec propagation miroir/chaîne. Retourne true si la protection a bloqué. */
function addDrinks(
  players: EnginePlayer[],
  target: EnginePlayer,
  n: number,
  prop: Propagation = {}
): boolean {
  if (n <= 0) return false
  if (isProtected(target) && target.id !== prop.sourceId) return true
  target.drinks += n

  if (!prop.skipMirror) {
    const partnerId =
      (target.mirrorDrinkTurns ?? 0) > 0 ? target.mirrorDrinkTargetId : undefined
    const partner = partnerId ? players.find((p) => p.id === partnerId) : undefined
    if (partner) {
      addDrinks(players, partner, n, { skipMirror: true, skipChain: prop.skipChain })
    }
  }

  if (!prop.skipChain) {
    for (const init of players) {
      if (!init.linkedTo || (init.linkedTurns ?? 0) <= 0) continue
      if (target.id === init.id) {
        const partner = players.find((p) => p.id === init.linkedTo)
        if (partner) {
          addDrinks(players, partner, n, { skipChain: true, skipMirror: prop.skipMirror })
        }
        break
      }
      if (target.id === init.linkedTo) {
        addDrinks(players, init, n, { skipChain: true, skipMirror: prop.skipMirror })
        break
      }
    }
  }
  return false
}

/** Id du gagnant : l'acteur s'il est sur la dernière case, sinon le premier dans l'ordre de jeu après lui. */
function findWinner(players: EnginePlayer[], actorIndex: number): string | null {
  const n = players.length
  for (let k = 0; k < n; k += 1) {
    const p = players[(actorIndex + k) % n]
    if (p && p.position === BOARD_SIZE - 1) return p.id
  }
  return null
}

/** Case qui peut être rejouée par Répétition / Rewind. */
function isReplayable(c: EngineCase): boolean {
  return !CASES_META.has(c.type) && c.type !== 'normal'
}

/** Case applicable dans une Double case : sans modale, sans arbitrage, ni méta ni Normale. */
function isSimpleCase(c: EngineCase): boolean {
  return (
    isReplayable(c) && !CASES_INTERACTIVE.has(c.type) && c.type !== 'defi' && c.type !== 'question'
  )
}

// ─── Contexte d'une action ──────────────────────────────────────────────────

type Roll = { from: number; landing: number; rerolled?: boolean }

/** État de travail d'une action : copie mutable, appliquée en un seul nouvel état. */
type Work = {
  state: EngineState
  players: EnginePlayer[]
  rng: SeededRng
  actorIndex: number
  outcomes: LastOutcome[]
  lastCase: EngineCase | null
  lastEffectiveCase: EngineCase | null
  lastDice: number | null
  lastMoveDelta: number | null
  turnDiceTotal: number
  lastInteraction: LastInteraction | null
  pending: EnginePending | null
  winner: string | null
  duelNote: DuelNote | null
}

/** États d'avant le champ : la dernière case tirée, si elle est rejouable, en tient lieu. */
function knownEffectiveCase(state: EngineState): EngineCase | null {
  if (state.lastEffectiveCase !== undefined) return state.lastEffectiveCase
  return state.lastCase && isReplayable(state.lastCase) ? state.lastCase : null
}

function startWork(state: EngineState): Work {
  return {
    state,
    players: state.players.map((p) => ({ ...p })),
    rng: rngFromState(state.rngState),
    actorIndex: state.currentPlayer,
    outcomes: [],
    lastCase: state.lastCase,
    lastEffectiveCase: knownEffectiveCase(state),
    lastDice: state.lastDice,
    lastMoveDelta: state.lastMoveDelta,
    turnDiceTotal: state.turnDiceTotal ?? state.lastMoveDelta ?? 0,
    lastInteraction: null,
    pending: null,
    winner: null,
    duelNote: state.duelNote ?? null,
  }
}

function actorOf(w: Work): EnginePlayer {
  return w.players[w.actorIndex]
}

function snapshot(players: EnginePlayer[]): EnginePlayer[] {
  return players.map((p) => ({ ...p }))
}

/** Victoire vérifiée après chaque déplacement : la première trouvée fige la partie. */
function checkWin(w: Work): boolean {
  if (w.winner) return true
  w.winner = findWinner(w.players, w.actorIndex)
  return w.winner !== null
}

type OutcomeExtra = Omit<LastOutcome, 'caseType' | 'actorId' | 'changes'>

function recordOutcome(
  w: Work,
  before: EnginePlayer[],
  caseType: CaseType,
  extra: OutcomeExtra,
  roll: Roll | null
): void {
  const outcome: LastOutcome = {
    caseType,
    actorId: actorOf(w).id,
    changes: diffOutcome(before, w.players),
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue
    if (key === 'notes' && Array.isArray(value) && value.length === 0) continue
    ;(outcome as Record<string, unknown>)[key] = value
  }
  if (roll) {
    outcome.diceFrom = roll.from
    outcome.diceLanding = roll.landing
    if (roll.rerolled) outcome.rerolled = true
  }
  if (w.duelNote) {
    outcome.duel = w.duelNote
    w.duelNote = null
  }
  w.outcomes.push(outcome)
}

// ─── Effets ─────────────────────────────────────────────────────────────────

/** Effet en cours : l'acteur dont la case s'applique et les notes à afficher. */
type Fx = { w: Work; actor: EnginePlayer; notes: OutcomeNote[] }

function newFx(w: Work): Fx {
  return { w, actor: actorOf(w), notes: [] }
}

function note(fx: Fx, n: OutcomeNote): void {
  const dup = fx.notes.some((x) => JSON.stringify(x) === JSON.stringify(n))
  if (!dup) fx.notes.push(n)
}

function drink(fx: Fx, target: EnginePlayer, n: number): void {
  if (addDrinks(fx.w.players, target, n, { sourceId: fx.actor.id })) {
    note(fx, { kind: 'protected', playerId: target.id })
  }
}

function forward(target: EnginePlayer, n: number): void {
  target.position = clampPos(target.position + n)
}

function back(fx: Fx, target: EnginePlayer, n: number): void {
  if (shielded(target, fx.actor)) {
    note(fx, { kind: 'protected', playerId: target.id })
    return
  }
  if (target.position === 0) {
    note(fx, { kind: 'cannot-move-back', playerId: target.id })
    return
  }
  target.position = clampPos(target.position - n)
}

/** Statut négatif posé sur la cible, sauf protection. Retourne true s'il est posé. */
function canAfflict(fx: Fx, target: EnginePlayer): boolean {
  if (!shielded(target, fx.actor)) return true
  note(fx, { kind: 'protected', playerId: target.id })
  return false
}

/** Échange de positions acteur ↔ partenaire, annulé si le partenaire est protégé. */
function swapWith(fx: Fx, partner: EnginePlayer): void {
  if (partner.id === fx.actor.id) {
    note(fx, { kind: 'no-effect' })
    return
  }
  if (!canAfflict(fx, partner)) return
  if (partner.position === fx.actor.position) {
    note(fx, { kind: 'no-effect' })
    return
  }
  const ap = fx.actor.position
  fx.actor.position = partner.position
  partner.position = ap
}

/** Case résolue d'office (sans cible). */
function applyNoTargetCase(fx: Fx, c: EngineCase): void {
  const { players, rng } = fx.w
  const actor = fx.actor
  switch (c.type) {
    case 'normal':
      note(fx, { kind: 'safe' })
      break
    case 'solo':
      drink(fx, actor, c.effect)
      break
    case 'case-bonus':
      forward(actor, c.effect)
      break
    // Les joueurs derrière reculent d'une case
    case 'recul-groupe': {
      const behind = players.filter((p) => p.position < actor.position)
      if (behind.length === 0) note(fx, { kind: 'no-effect' })
      for (const p of behind) back(fx, p, 1)
      break
    }
    // L'acteur rejoint le joueur juste devant lui
    case 'grappin': {
      const ahead = players
        .filter((p) => p.position > actor.position)
        .sort((a, b) => a.position - b.position)[0]
      if (ahead) actor.position = ahead.position
      else note(fx, { kind: 'no-effect' })
      break
    }
    case 'pont': {
      const delta: 1 | -1 = rng.chance(0.5) ? 1 : -1
      const bridge = actor.position
      // Liste figée AVANT de déplacer : l'acteur bouge aussi, et la comparer à
      // sa position vivante déplacerait les voisins de la case d'arrivée.
      const onBridge = players.filter((p) => p.position === bridge)
      note(fx, { kind: 'bridge', position: bridge, delta })
      for (const p of onBridge) {
        if (delta > 0) forward(p, 1)
        else back(fx, p, 1)
      }
      break
    }
    // Deux joueurs au hasard : l'un boit 2, l'autre avance d'une case
    case 'loterie': {
      const pool = players.filter((p) => p.id !== actor.id)
      if (pool.length < 2) {
        note(fx, { kind: 'no-effect' })
        break
      }
      const shuffled = rng.shuffle(pool)
      drink(fx, shuffled[0], 2)
      forward(shuffled[1], 1)
      break
    }
    default:
      note(fx, { kind: 'no-effect' })
      break
  }
}

/** Case à cible appliquée à `target` (Défi / Question : `succeeded` requis). */
function applyTargetedCase(fx: Fx, target: EnginePlayer, c: EngineCase, succeeded?: boolean): void {
  const { players, rng } = fx.w
  const actor = fx.actor
  switch (c.type) {
    case 'gorgée':
      drink(fx, target, c.effect)
      break
    case 'defi':
    case 'question':
      if (!succeeded) drink(fx, target, c.effect)
      break
    case 'tous':
      for (const p of players) if (p.id !== target.id) drink(fx, p, c.effect)
      break
    case 'avance':
      forward(target, Math.abs(c.effect) || 1)
      break
    case 'recul':
      back(fx, target, Math.abs(c.effect) || 1)
      break
    case 'bombe':
      for (const p of players) drink(fx, p, p.id === target.id ? c.effect * 2 : c.effect)
      break
    case 'protection':
      target.protected = true
      target.protectionTurnsLeft = Math.max(players.length, 1)
      break
    case 'malediction':
      if (canAfflict(fx, target)) target.cursed = c.effect || DEFAULT_CURSE_TURNS
      break
    // Les protégés gardent leur case ; les autres sont miroités entre les cases restantes.
    case 'miroir': {
      for (const p of players) if (shielded(p, actor)) note(fx, { kind: 'protected', playerId: p.id })
      const sorted = players.filter((p) => !shielded(p, actor)).sort((a, b) => b.position - a.position)
      const positions = sorted.map((p) => p.position)
      sorted.forEach((p, i) => {
        p.position = positions[positions.length - 1 - i]
      })
      break
    }
    case 'piege':
      drink(fx, target, target.position + 1)
      break
    case 'passe-tour':
      if (canAfflict(fx, target)) target.skipNextTurn = true
      break
    case 'double-peine':
      drink(fx, target, c.effect * 2)
      break
    // Positif : la cible rejoue tout le déplacement au dé de l'acteur pendant ce tour.
    case 'copie': {
      const total = fx.w.turnDiceTotal
      if (total > 0) forward(target, total)
      else note(fx, { kind: 'no-effect' })
      break
    }
    case 'roulette-russe':
      if (!canAfflict(fx, target)) break
      if (rng.chance(1 / 3)) drink(fx, target, c.effect)
      else note(fx, { kind: 'spared', playerId: target.id })
      break
    case 'ancre':
      if (canAfflict(fx, target)) target.anchored = true
      break
    case 'inversion': {
      const last = players.reduce((min, p) => (p.position < min.position ? p : min))
      drink(fx, last, c.effect)
      break
    }
    // Les protégés gardent leur case ; Fisher-Yates sur les cases des autres.
    case 'melange': {
      for (const p of players) if (shielded(p, actor)) note(fx, { kind: 'protected', playerId: p.id })
      const movable = players.filter((p) => !shielded(p, actor))
      const shuffled = rng.shuffle(movable.map((p) => p.position))
      movable.forEach((p, i) => {
        p.position = shuffled[i]
      })
      break
    }
    // Le tour de création ne compte pas : le lien couvre aussi le prochain tour de l'acteur.
    case 'miroir-inverse':
      if (!canAfflict(fx, target)) break
      actor.mirrorDrinkTargetId = target.id
      actor.mirrorDrinkTurns = (c.effect || DEFAULT_MIRROR_TURNS) + 1
      break
    default:
      if (CASES_NO_TARGET.has(c.type)) applyNoTargetCase(fx, c)
      else note(fx, { kind: 'no-effect' })
      break
  }
}

/** Tire deux cases simples pour une Double case (le générateur en ligne ne filtre rien). */
function drawSimpleCases(w: Work): EngineCase[] {
  const out: EngineCase[] = []
  for (let guard = 0; out.length < 2 && guard < 200; guard += 1) {
    const c = generateCase(w.rng, {
      difficulty: w.state.settings.difficulty,
      defiDrinks: w.state.settings.defiDrinks,
      defiAllowed: w.state.settings.defiAllowed,
    })
    if (isSimpleCase(c)) out.push(c)
  }
  while (out.length < 2) out.push({ type: 'solo', effect: 1 })
  return out
}

// ─── Déroulé d'un tour ──────────────────────────────────────────────────────

/** Lance le dé de l'acteur (ancre consommée) et le déplace. */
function rollDice(w: Work): Roll {
  const me = actorOf(w)
  const wasAnchored = me.anchored
  if (wasAnchored) me.anchored = false
  const dice = w.rng.int(1, 6)
  const delta = wasAnchored ? 0 : dice
  const from = me.position
  me.position = clampPos(from + delta)
  w.lastDice = dice
  w.lastMoveDelta = delta
  w.turnDiceTotal += delta
  return { from, landing: me.position }
}

/** Adversaires d'un duel : les joueurs présents sur la case d'arrivée de l'acteur (jamais au départ). */
function duelOpponents(w: Work): EnginePlayer[] {
  const actor = actorOf(w)
  if (actor.position <= 0) return []
  return w.players.filter((p) => p.id !== actor.id && !p.leftAt && p.position === actor.position)
}

/** Tire la case d'arrivée et la joue (en attente si elle demande un choix, ou après le duel proposé). */
function drawAndPlay(w: Work, roll: Roll): void {
  const c = generateCase(w.rng, {
    difficulty: w.state.settings.difficulty,
    defiDrinks: w.state.settings.defiDrinks,
    defiAllowed: w.state.settings.defiAllowed,
  })
  w.lastCase = c
  const opponents = duelOpponents(w)
  if (opponents.length > 0) {
    w.pending = {
      caseType: c.type,
      playerId: actorOf(w).id,
      needsTarget: false,
      case: c,
      stage: 'duel',
      opponents: opponents.map((p) => p.id),
    }
    return
  }
  playDrawnCase(w, c, roll)
}

function playDrawnCase(w: Work, c: EngineCase, roll: Roll | null): void {
  if (c.type === 'repetition' || c.type === 'rewind') {
    const replay = w.lastEffectiveCase
    if (!replay) {
      recordOutcome(w, snapshot(w.players), c.type, { notes: [{ kind: 'nothing-to-replay' }] }, roll)
      return
    }
    playEffectiveCase(w, replay, roll, c.type)
    return
  }
  if (isReplayable(c)) w.lastEffectiveCase = c
  if (c.type === 'double-case') {
    const cases = drawSimpleCases(w)
    w.lastEffectiveCase = cases[cases.length - 1]
    if (cases.some((x) => needsTarget(x.type))) {
      w.pending = { caseType: 'double-case', playerId: actorOf(w).id, needsTarget: true, case: c, cases }
      return
    }
    applyCases(w, cases, null, roll)
    return
  }
  playEffectiveCase(w, c, roll, undefined)
}

/** Joue une case effective : en attente si elle demande une cible ou un choix, sinon d'office. */
function playEffectiveCase(
  w: Work,
  e: EngineCase,
  roll: Roll | null,
  via: 'repetition' | 'rewind' | undefined
): void {
  if (needsTarget(e.type) || CASES_INTERACTIVE.has(e.type)) {
    w.pending = {
      caseType: e.type,
      playerId: actorOf(w).id,
      needsTarget: needsTarget(e.type),
      case: e,
      ...(via ? { via } : {}),
    }
    return
  }
  const before = snapshot(w.players)
  const fx = newFx(w)
  applyNoTargetCase(fx, e)
  recordOutcome(w, before, via ?? e.type, { effectiveCase: via ? e : undefined, notes: fx.notes }, roll)
  checkWin(w)
}

/** Double case : les deux cases, l'une après l'autre, sur la même cible ; arrêt à la victoire. */
function applyCases(w: Work, cases: EngineCase[], target: EnginePlayer | null, roll: Roll | null): void {
  const before = snapshot(w.players)
  const fx = newFx(w)
  const caseChanges: LastOutcomeChange[][] = []
  for (const c of cases) {
    const stepBefore = snapshot(w.players)
    if (needsTarget(c.type) && target) applyTargetedCase(fx, target, c)
    else applyNoTargetCase(fx, c)
    caseChanges.push(diffOutcome(stepBefore, w.players))
    if (checkWin(w)) break
  }
  recordOutcome(w, before, 'double-case', { cases, caseChanges, targetId: target?.id, notes: fx.notes }, roll)
}

/**
 * Cible désignée par le choix. Inconnue ou absente : refus. Joueur qui vient de
 * quitter la table : l'effet passe au suivant encore présent dans l'ordre de jeu.
 */
function resolveTarget(w: Work, targetId: unknown, allowSelf: boolean): EnginePlayer {
  if (typeof targetId !== 'string') throw new EngineError(INVALID_TARGET)
  const players = w.players
  const actor = actorOf(w)
  const index = players.findIndex((p) => p.id === targetId)
  if (index < 0) throw new EngineError(INVALID_TARGET)
  const t = players[index]
  if (!allowSelf && t.id === actor.id) throw new EngineError(INVALID_TARGET)
  if (!t.leftAt) return t
  for (let k = 1; k < players.length; k += 1) {
    const q = players[(index + k) % players.length]
    if (!q.leftAt && (allowSelf || q.id !== actor.id)) return q
  }
  return t
}

function outcomeLabel(p: EnginePending): CaseType {
  return p.via ?? p.caseType
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduce(state: EngineState, action: EngineAction): EngineState {
  if (state.phase === 'finished') {
    throw new EngineError('GAME_FINISHED')
  }
  if (action.type === 'ROLL') return reduceRoll(state, action.playerId)
  if (action.type === 'RESOLVE_INTERACTION') return reduceResolve(state, action.playerId, action.choice)
  throw new EngineError('UNKNOWN_ACTION')
}

function reduceRoll(state: EngineState, playerId: string): EngineState {
  if (state.phase !== 'playing') throw new EngineError('NOT_PLAYING')
  if (state.pending) throw new EngineError('INTERACTION_PENDING')
  const actor = state.players[state.currentPlayer]
  if (!actor || actor.id !== playerId) throw new EngineError('NOT_YOUR_TURN')

  // Nouveau tour de dé : le spectacle et l'effet du tour précédent sont terminés.
  const w = startWork({ ...state, lastInteraction: null, lastOutcome: null, duelNote: null })
  w.turnDiceTotal = 0
  const roll = rollDice(w)
  if (checkWin(w)) w.lastCase = null
  else drawAndPlay(w, roll)
  return commit(w, playerId, () => `case:${w.lastCase?.type ?? 'none'}`)
}

function reduceResolve(
  state: EngineState,
  playerId: string,
  rawChoice: InteractionChoice | undefined
): EngineState {
  const p = state.pending
  if (state.phase !== 'awaiting-interaction' || !p) {
    throw new EngineError('NO_PENDING_INTERACTION')
  }
  const deciderId = p.stage === 'side' ? p.targetId : p.playerId
  if (deciderId !== playerId) throw new EngineError('NOT_YOUR_INTERACTION')

  const choice: InteractionChoice = rawChoice && typeof rawChoice === 'object' ? rawChoice : {}
  const w = startWork(state)
  const effective: EngineCase = p.case ?? state.lastCase ?? { type: p.caseType, effect: 0 }
  const label = outcomeLabel(p)
  const effectiveExtra = { effectiveCase: p.via ? effective : undefined }
  const message = () => `resolved:${p.caseType}`

  if (p.stage === 'duel') {
    resolveDuel(w, p, effective, choice.targetId)
    // Pas le type de la case tirée dans le journal : elle peut rester cachée (cible à choisir).
    return commit(w, playerId, () => 'resolved:duel')
  }
  if (p.stage === 'side') {
    resolvePileFace(w, p, effective, choice.side)
    return commit(w, playerId, message)
  }
  if (p.stage === 'verdict') {
    if (typeof choice.succeeded !== 'boolean') throw new EngineError(INVALID_CHOICE)
    applyVerdict(w, p, effective, choice.succeeded)
    return commit(w, playerId, message)
  }

  // États d'avant : la méta-case attendait une cible sans rien savoir de la case à rejouer.
  if ((p.caseType === 'repetition' || p.caseType === 'rewind') && !p.via) {
    playDrawnCase(w, { type: p.caseType, effect: 0 }, null)
    if (w.pending && w.pending.needsTarget && typeof choice.targetId === 'string') {
      return reduceResolve(commit(w, playerId, message), playerId, choice)
    }
    return commit(w, playerId, message)
  }

  if (p.caseType === 'double-case') {
    const legacy = !p.cases
    const cases = p.cases ?? drawSimpleCases(w)
    if (legacy) w.lastEffectiveCase = cases[cases.length - 1]
    const wantsTarget = cases.some((x) => needsTarget(x.type))
    // État d'avant : la case attendait un simple « Continuer », la cible n'était pas encore demandée.
    if (legacy && wantsTarget && choice.targetId === undefined) {
      w.pending = { ...p, needsTarget: true, cases, case: p.case ?? effective }
      return commit(w, playerId, message)
    }
    const target = wantsTarget ? resolveTarget(w, choice.targetId, true) : null
    applyCases(w, cases, target, null)
    return commit(w, playerId, message)
  }

  if (p.needsTarget) {
    const target = resolveTarget(w, choice.targetId, true)
    if (effective.type === 'defi' || effective.type === 'question') {
      if (choice.succeeded !== undefined && typeof choice.succeeded !== 'boolean') {
        throw new EngineError(INVALID_CHOICE)
      }
      // Cible protégée : le défi d'un autre ne la touche pas, rien à arbitrer (comme en local).
      if (shielded(target, actorOf(w))) {
        const fx = newFx(w)
        note(fx, { kind: 'protected', playerId: target.id })
        recordOutcome(w, snapshot(w.players), label, { ...effectiveExtra, targetId: target.id, notes: fx.notes }, null)
        return commit(w, playerId, message)
      }
      const staged: EnginePending = { ...p, stage: 'verdict', targetId: target.id, needsTarget: false }
      if (typeof choice.succeeded === 'boolean') applyVerdict(w, staged, effective, choice.succeeded)
      else w.pending = staged
      return commit(w, playerId, message)
    }
    const before = snapshot(w.players)
    const fx = newFx(w)
    applyTargetedCase(fx, target, effective)
    recordOutcome(w, before, label, { ...effectiveExtra, targetId: target.id, notes: fx.notes }, null)
    checkWin(w)
    return commit(w, playerId, message)
  }

  resolveInteractive(w, p, effective, choice)
  return commit(w, playerId, message)
}

/** Défi / Question : raté → la cible boit ; réussi → personne. */
function applyVerdict(w: Work, p: EnginePending, effective: EngineCase, succeeded: boolean): void {
  const target = w.players.find((x) => x.id === p.targetId)
  if (!target) throw new EngineError(INVALID_TARGET)
  const before = snapshot(w.players)
  const fx = newFx(w)
  applyTargetedCase(fx, target, effective, succeeded)
  recordOutcome(
    w,
    before,
    outcomeLabel(p),
    { effectiveCase: p.via ? effective : undefined, targetId: target.id, succeeded, notes: fx.notes },
    null
  )
}

/**
 * Duel sur case partagée, puis la case tirée. Sans `opponentId`, l'acteur
 * passe le duel. Sinon pile ou face : le perdant recule d'une case, sauf
 * protégé (sa protection compte, même contre son propre duel — comme
 * applyDuelResult en local).
 */
function resolveDuel(w: Work, p: EnginePending, drawn: EngineCase, opponentId: unknown): void {
  if (opponentId !== undefined) {
    const actor = actorOf(w)
    const opponent =
      typeof opponentId === 'string'
        ? w.players.find((x) => x.id === opponentId && x.id !== actor.id && x.position === actor.position)
        : undefined
    if (!opponent) throw new EngineError(INVALID_TARGET)
    const challengerWins = w.rng.chance(0.5)
    const loser = challengerWins ? opponent : actor
    const loserProtected = isProtected(loser)
    if (!loserProtected) loser.position = clampPos(loser.position - 1)
    const duel: DuelNote = { opponentId: opponent.id, challengerWins, loserProtected }
    w.lastInteraction = { kind: 'duel', actorId: actor.id, ...duel }
    w.duelNote = duel
  }
  playDrawnCase(w, p.case ?? drawn, null)
}

/** Pile ou face, étape `side` : la cible a choisi, la pièce tombe, perdu → elle boit. */
function resolvePileFace(w: Work, p: EnginePending, effective: EngineCase, side: unknown): void {
  if (side !== 'pile' && side !== 'face') throw new EngineError(INVALID_CHOICE)
  const target = w.players.find((x) => x.id === p.targetId)
  if (!target) throw new EngineError(INVALID_TARGET)
  const before = snapshot(w.players)
  const fx = newFx(w)
  const flip: 'pile' | 'face' = w.rng.chance(0.5) ? 'pile' : 'face'
  const stake = effective.effect || 2
  const drunkBefore = target.drinks
  if (side !== flip) drink(fx, target, stake)
  w.lastInteraction = {
    kind: 'pile-face',
    actorId: fx.actor.id,
    targetId: target.id,
    side,
    flip,
    drinks: target.drinks - drunkBefore,
  }
  recordOutcome(
    w,
    before,
    outcomeLabel(p),
    { effectiveCase: p.via ? effective : undefined, targetId: target.id, notes: fx.notes },
    null
  )
}

/** Cases à modale (hors étapes) : roue, dé de la honte, téléport, vote, échange, chaîne, chance, pile ou face. */
function resolveInteractive(w: Work, p: EnginePending, effective: EngineCase, choice: InteractionChoice): void {
  const label = outcomeLabel(p)
  const effectiveCase = p.via ? effective : undefined
  const before = snapshot(w.players)
  const fx = newFx(w)
  const actor = fx.actor
  const rng = w.rng
  let targetId: string | undefined

  switch (effective.type) {
    case 'pile-face': {
      const target = resolveTarget(w, choice.targetId, true)
      w.pending = { ...p, stage: 'side', targetId: target.id, needsTarget: false }
      return
    }
    case 'chance': {
      const cc = choice.chanceChoice
      if (cc !== 'reroll' && cc !== 'plus2') throw new EngineError(INVALID_CHOICE)
      if (cc === 'plus2') {
        forward(actor, 2)
        recordOutcome(w, before, label, { effectiveCase, chanceChoice: cc }, null)
        checkWin(w)
        return
      }
      const roll = rollDice(w)
      recordOutcome(w, before, label, { effectiveCase, chanceChoice: cc }, roll)
      if (!checkWin(w)) drawAndPlay(w, { ...roll, rerolled: true })
      return
    }
    // Dé de la honte : dé 1-6 → ≤2 rien, 3-4 boit 2, 5 avance +1, 6 recule -1.
    case 'de-honte': {
      const r = rng.int(1, 6)
      if (r > 2 && r <= 4) drink(fx, actor, 2)
      else if (r === 5) forward(actor, 1)
      else if (r === 6) back(fx, actor, 1)
      w.lastInteraction = { kind: 'de-honte', actorId: actor.id, value: r }
      break
    }
    // Roue : 15 segments, 1 sur 3 « safe » (0), sinon 1-12 gorgées pour l'acteur.
    case 'roue': {
      const seg = rng.pickIndex(15)
      const value = (seg + 1) % 3 === 0 ? 0 : rng.int(1, 12)
      if (value > 0) drink(fx, actor, value)
      w.lastInteraction = { kind: 'roue', actorId: actor.id, segment: seg, drinks: value }
      break
    }
    // Roue des défis : ~1 fois sur 2, gorgées ; sinon défi (approximé sans pénalité).
    case 'roue-defis': {
      const hit = rng.chance(0.5)
      if (hit) drink(fx, actor, 2)
      w.lastInteraction = { kind: 'roue-defis', actorId: actor.id, drinks: hit ? 2 : 0 }
      break
    }
    // Téléport : l'acteur échange sa position avec le leader ou le dernier.
    case 'teleport': {
      const which = choice.option === 'last' ? 'last' : 'leader'
      const partner =
        which === 'leader'
          ? w.players.reduce((m, x) => (x.position > m.position ? x : m))
          : w.players.reduce((m, x) => (x.position < m.position ? x : m))
      targetId = partner.id
      swapWith(fx, partner)
      break
    }
    case 'vote': {
      const target = resolveTarget(w, choice.targetId, true)
      targetId = target.id
      drink(fx, target, effective.effect || 3)
      break
    }
    // Lien de N tours d'initiateur ; le tour de création ne compte pas.
    case 'defi-chaine': {
      const target = resolveTarget(w, choice.targetId, false)
      targetId = target.id
      if (canAfflict(fx, target)) {
        actor.linkedTo = target.id
        actor.linkedTurns = (effective.effect || DEFAULT_CHAIN_TURNS) + 1
      }
      break
    }
    case 'echange': {
      const target = resolveTarget(w, choice.targetId, false)
      targetId = target.id
      swapWith(fx, target)
      break
    }
    default:
      if (CASES_NO_TARGET.has(effective.type)) applyNoTargetCase(fx, effective)
      else note(fx, { kind: 'no-effect' })
      break
  }
  recordOutcome(w, before, label, { effectiveCase, targetId, notes: fx.notes }, null)
  checkWin(w)
}

/** Construit l'état suivant : fin de partie, case en attente, ou tour suivant. */
function commit(w: Work, playerId: string, message: () => string): EngineState {
  const s = w.state
  let outcomeHistory = s.outcomeHistory
  for (const o of w.outcomes) {
    outcomeHistory = pushOutcomeEntry(outcomeHistory, { ...o, turn: s.turnCount, dice: w.lastDice })
  }
  const common: EngineState = {
    ...s,
    version: s.version + 1,
    rngState: w.rng.getState(),
    players: w.players,
    lastDice: w.lastDice,
    lastMoveDelta: w.lastMoveDelta,
    turnDiceTotal: w.turnDiceTotal,
    lastCase: w.lastCase,
    lastEffectiveCase: w.lastEffectiveCase,
    lastInteraction: w.lastInteraction,
    lastOutcome: w.outcomes.length > 0 ? w.outcomes[w.outcomes.length - 1] : (s.lastOutcome ?? null),
    outcomeHistory: outcomeHistory ?? [],
    ...(w.duelNote || s.duelNote ? { duelNote: w.duelNote } : {}),
  }
  if (w.winner) {
    return {
      ...common,
      pending: null,
      phase: 'finished',
      winner: w.winner,
      log: pushLog(s.log, { turn: s.turnCount, playerId: w.winner, message: 'win' }),
    }
  }
  const log = pushLog(s.log, { turn: s.turnCount, playerId, message: message() })
  if (w.pending) {
    return { ...common, pending: w.pending, phase: 'awaiting-interaction', log }
  }
  const turn = advanceTurnOnPlayers(w.players, w.actorIndex, s.turnCount)
  return {
    ...common,
    pending: null,
    phase: 'playing',
    currentPlayer: turn.currentPlayer,
    turnCount: turn.turnCount,
    log,
  }
}

// ─── Fin de tour ────────────────────────────────────────────────────────────

/** Décrémente la durée de protection de tous les joueurs (expire après un tour de table). */
function tickProtection(players: EnginePlayer[]): void {
  players.forEach((p) => {
    if (!p.protected || p.protectionTurnsLeft == null) return
    p.protectionTurnsLeft -= 1
    if (p.protectionTurnsLeft <= 0) {
      p.protected = false
      p.protectionTurnsLeft = undefined
    }
  })
}

/** Fin du tour de l'initiateur : décrémente ses liens miroir/chaîne. */
function tickInitiatorLinks(p: EnginePlayer): void {
  if ((p.mirrorDrinkTurns ?? 0) > 0) {
    p.mirrorDrinkTurns = (p.mirrorDrinkTurns ?? 1) - 1
    if ((p.mirrorDrinkTurns ?? 0) <= 0) p.mirrorDrinkTargetId = undefined
  }
  if (p.linkedTo && (p.linkedTurns ?? 0) > 0) {
    p.linkedTurns = (p.linkedTurns ?? 1) - 1
    if ((p.linkedTurns ?? 0) <= 0) p.linkedTo = undefined
  }
}

/** Début du tour : malédiction (boit 1 gorgée si non protégé), décrémente la malédiction. */
function applyCurseAtTurnStart(players: EnginePlayer[], p: EnginePlayer): void {
  if (p.cursed <= 0) return
  addDrinks(players, p, 1)
  p.cursed -= 1
}

/**
 * Passe la main au joueur suivant (copie de joueurs déjà clonée). Les joueurs
 * partis sont sautés sans rien décompter ; un tour sauté par Passe-ton-tour
 * compte quand même pour la malédiction, comme en local.
 */
function advanceTurnOnPlayers(
  players: EnginePlayer[],
  from: number,
  turnCount: number
): { currentPlayer: number; turnCount: number } {
  if (players[from]) tickInitiatorLinks(players[from])
  tickProtection(players)

  const n = players.length
  let idx = from
  let tc = turnCount
  for (let step = 0; step < n; step += 1) {
    idx = (idx + 1) % n
    if (idx === 0) tc += 1
    const p = players[idx]
    if (p.leftAt) continue
    applyCurseAtTurnStart(players, p)
    if (p.skipNextTurn) {
      p.skipNextTurn = false
      continue
    }
    return { currentPlayer: idx, turnCount: tc }
  }
  return { currentPlayer: from, turnCount: tc }
}

// ─── Décisions automatiques (bots, délai dépassé, départ) ───────────────────

/** Joueur qui doit agir : la cible pendant l'étape `side`, sinon le joueur au tour. */
export function currentDeciderId(state: EngineState): string | null {
  if (state.phase === 'finished') return null
  if (state.pending?.stage === 'side' && state.pending.targetId) return state.pending.targetId
  return state.players[state.currentPlayer]?.id ?? null
}

function pickRandomTarget(state: EngineState, rng: SeededRng, allowSelf: boolean): string {
  const actor = state.players[state.currentPlayer]
  const others = state.players.filter((p) => p.id !== actor?.id)
  const present = others.filter((p) => !p.leftAt)
  const pool = present.length > 0 ? present : others.length > 0 ? others : allowSelf && actor ? [actor] : []
  if (pool.length === 0) throw new EngineError(INVALID_TARGET)
  return rng.pick(pool).id
}

/**
 * Décision au hasard du joueur qui doit agir, tirée par le RNG du moteur (bot,
 * délai dépassé, joueur parti). Retourne l'état au RNG avancé et l'action à
 * lui appliquer.
 */
export function autoAction(state: EngineState): { state: EngineState; action: EngineAction } {
  const deciderId = currentDeciderId(state)
  if (!deciderId) throw new EngineError('GAME_FINISHED')
  const p = state.pending
  if (!p) return { state, action: { type: 'ROLL', playerId: deciderId } }

  const rng = rngFromState(state.rngState)
  const choice: InteractionChoice = {}
  if (p.stage === 'side') choice.side = rng.chance(0.5) ? 'pile' : 'face'
  else if (p.stage === 'verdict') choice.succeeded = rng.chance(0.5)
  else if (p.stage === 'duel') {
    // Une fois sur deux, duel contre un adversaire de la case au hasard ; sinon il passe.
    const opponents = (p.opponents ?? []).filter((id) => state.players.some((x) => x.id === id))
    if (opponents.length > 0 && rng.chance(0.5)) choice.targetId = rng.pick(opponents)
  } else {
    const wantsTarget =
      p.needsTarget || CASES_INTERACTIVE_TARGET.has(p.caseType) || p.caseType === 'double-case'
    if (wantsTarget) choice.targetId = pickRandomTarget(state, rng, !CASES_NO_SELF_TARGET.has(p.caseType))
    if (p.caseType === 'teleport') choice.option = rng.chance(0.5) ? 'leader' : 'last'
    if (p.caseType === 'chance') choice.chanceChoice = rng.chance(0.5) ? 'reroll' : 'plus2'
  }
  return {
    state: { ...state, rngState: rng.getState() },
    action: { type: 'RESOLVE_INTERACTION', playerId: deciderId, choice },
  }
}

/**
 * Le joueur qui doit agir a quitté la table : son tour non joué passe au
 * suivant, jusqu'à rendre la main à un présent. Sa décision en attente est
 * tirée au hasard, sauf `resolvePending: false` : elle peut finir la partie,
 * ce que seule la route d'action sait enregistrer (classement, XP).
 */
export function passDepartedTurns(
  state: EngineState,
  options: { resolvePending?: boolean } = {}
): EngineState {
  const resolvePending = options.resolvePending ?? true
  let s = state
  for (let guard = 0; guard < 50 && s.phase !== 'finished'; guard += 1) {
    const deciderId = currentDeciderId(s)
    const decider = s.players.find((p) => p.id === deciderId)
    if (!decider?.leftAt || !s.players.some((p) => !p.leftAt)) return s
    if (s.pending) {
      if (!resolvePending) return s
      const next = autoAction(s)
      s = reduce(next.state, next.action)
    } else {
      const players = s.players.map((p) => ({ ...p }))
      const turn = advanceTurnOnPlayers(players, s.currentPlayer, s.turnCount)
      s = { ...s, players, currentPlayer: turn.currentPlayer, turnCount: turn.turnCount, version: s.version + 1 }
    }
  }
  return s
}

/** Aide de test/serveur : id du joueur au tour (voir currentDeciderId pour l'étape `side`). */
export function currentPlayerId(state: EngineState): string | null {
  return state.players[state.currentPlayer]?.id ?? null
}
