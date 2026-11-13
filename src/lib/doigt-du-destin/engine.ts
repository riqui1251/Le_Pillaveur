/**
 * Moteur pur du « Doigt du Destin » : chacun pose un doigt sur l'écran, le
 * hasard en désigne un (ou forme des camps, un ordre, une survie).
 *
 * - Un doigt = un identifiant de chaîne (le composant le tire du `pointerId`),
 *   jamais une position : le moteur ne voit que des arrivées et des départs.
 * - Au moins MIN_FINGERS doigts et STABLE_MS sans ajout ni retrait → décompte
 *   de COUNTDOWN_MS. Tout ajout ou retrait relance l'attente.
 * - À zéro, le tirage porte sur les doigts posés à cet instant, puis vient
 *   l'animation (SELECTION_MS). Un doigt levé pendant l'animation reste dans
 *   le tirage mais est signalé « levé » (pénalité).
 * - Survie : un doigt éliminé par tirage. Le tirage suivant attend que
 *   l'éliminé se lève, puis part SURVIVAL_NEXT_MS plus tard, jusqu'au dernier.
 * - Doigt perdu sans avoir été levé (`cancel` : pointercancel, onglet caché) :
 *   jamais pénalisé. Pendant un tirage ou une survie, la manche est annulée et
 *   les doigts encore posés relancent l'attente : sinon l'ordre dans lequel le
 *   système rend les doigts ferait les levés, voire le survivant.
 *
 * Aléatoire : `rngState` dans l'état (graine posée par le composant).
 * Temps : `now` en millisecondes, sur une même horloge pour tous les
 * événements. Le moteur compte des événements neutres (victime, levés,
 * éliminés) : gorgées et gages se lisent à l'affichage, selon l'ambiance.
 */

import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'

export const DOIGT_MODES = ['victim', 'teams', 'order', 'survival'] as const
export type DoigtMode = (typeof DOIGT_MODES)[number]

export function isDoigtMode(value: unknown): value is DoigtMode {
  return typeof value === 'string' && (DOIGT_MODES as readonly string[]).includes(value)
}

/** Cercles suivis au plus : au-delà, les nouveaux doigts sont ignorés. */
export const MAX_FINGERS = 10
export const MIN_FINGERS = 2
/** Aucun ajout ni retrait pendant ce délai : le décompte démarre. */
export const STABLE_MS = 1_200
export const COUNTDOWN_MS = 3_000
/** Animation de sélection complète : allumages, puis le doigt désigné seul. */
export const SELECTION_MS = 1_500
/** Fin de l'animation où seul le doigt désigné reste allumé. */
export const SELECTION_HOLD_MS = 350
/** Allumages au minimum : même à deux doigts, le ralentissement se voit. */
export const SELECTION_MIN_STEPS = 12
/** Rapport entre le dernier et le premier écart d'allumage. */
const SELECTION_SLOWDOWN = 5
/** Survie : délai entre le retrait du doigt éliminé et le tirage suivant. */
export const SURVIVAL_NEXT_MS = 1_500

/** Barème, lu à l'affichage (gorgées en ambiance alcool, points en Soft). */
export const VICTIM_SIPS = 3
export const LIFTED_SIPS = 2
export const LIFTED_SOFT_POINTS = 2
export const ELIMINATED_SIPS = 1
export const SURVIVOR_SIPS = 5

export type DoigtFinger = {
  id: string
  /** Index dans la palette du composant (0 … MAX_FINGERS − 1), le plus petit libre. */
  color: number
}

export type FingerPoint = { id: string; x: number; y: number }

export type DoigtOutcome =
  | { mode: 'victim'; victim: string }
  | { mode: 'teams'; gold: string[]; blue: string[] }
  /** `order[0]` commence. */
  | { mode: 'order'; order: string[] }
  | { mode: 'survival'; eliminated: string }

export type DoigtRound = {
  /** Doigts du tirage, dans l'ordre du cycle d'allumage. */
  participants: string[]
  /** Ordre d'allumage : il finit sur le doigt mis en avant par le verdict. */
  sequence: string[]
  startedAt: number
  /** Verdict visible : fin de l'animation, ou tout de suite sans animation. */
  revealAt: number
  outcome: DoigtOutcome
  /** Doigts de `lifted` déjà levés avant ce tirage (survie) : déjà annoncés entre deux éliminations. */
  liftedBefore: number
}

export type DoigtSurvival = {
  /** Doigts encore en lice. */
  alive: string[]
  /** Éliminés par tirage, dans l'ordre. */
  eliminated: string[]
  /** Éliminé encore posé : le tirage suivant attend qu'il se lève. */
  awaiting: string | null
  nextDrawAt: number | null
  /** Dernier doigt en lice, une fois la survie finie (null : plus personne). */
  winner: string | null
  /**
   * Survie close par un tirage : son éliminé n'a pas eu d'écran à lui et se
   * découvre au verdict final. Faux quand des doigts levés l'ont close.
   */
  finishedByDraw: boolean
}

/**
 * - gathering : les doigts se posent (le décompte attend STABLE_MS sans changement) ;
 * - countdown : décompte en cours ;
 * - selecting : tirage fait, animation en cours ;
 * - between : survie, entre deux éliminations ;
 * - result : verdict affiché, jusqu'à « Rejouer » ou un nouveau doigt une fois tous levés.
 */
export type DoigtPhase = 'gathering' | 'countdown' | 'selecting' | 'between' | 'result'

export type DoigtState = {
  mode: DoigtMode
  phase: DoigtPhase
  /** Cercles affichés, dans l'ordre d'arrivée : posés, ou figés depuis le tirage. */
  fingers: DoigtFinger[]
  /** Doigts encore posés. */
  down: string[]
  /** Dernier ajout ou retrait (phase gathering/countdown). */
  changedAt: number
  /** Fin du décompte. */
  drawAt: number | null
  round: DoigtRound | null
  /** Doigts levés avant la fin d'un tirage (survie : de toute la partie). */
  lifted: string[]
  survival: DoigtSurvival | null
  rngState: RngState
}

export type DoigtEvent =
  | { type: 'down'; id: string; now: number }
  | { type: 'up'; id: string; now: number }
  /** Doigt perdu sans avoir été levé (pointercancel, onglet caché) : jamais pénalisé ; en plein tirage ou en survie, la manche est annulée. */
  | { type: 'cancel'; id: string; now: number }
  /**
   * `order` : doigts dans l'ordre d'allumage voulu (le composant passe le sens
   * des aiguilles d'une montre) ; sans lui, l'ordre d'arrivée.
   * `animate: false` (mouvement réduit) : verdict sans animation.
   */
  | { type: 'tick'; now: number; order?: readonly string[]; animate?: boolean }
  | { type: 'mode'; mode: DoigtMode; now: number }
  | { type: 'replay'; now: number }

// ─── Tirages ─────────────────────────────────────────────────────────────────

export function pickVictim(ids: readonly string[], rng: SeededRng): string {
  return rng.pick(ids)
}

/** Deux camps de tailles égales à un près ; le camp qui prend le doigt de trop est tiré lui aussi. */
export function splitTeams(ids: readonly string[], rng: SeededRng): { gold: string[]; blue: string[] } {
  const shuffled = rng.shuffle(ids)
  const half = Math.floor(shuffled.length / 2)
  const goldSize = shuffled.length % 2 === 0 ? half : half + (rng.chance(0.5) ? 1 : 0)
  return { gold: shuffled.slice(0, goldSize), blue: shuffled.slice(goldSize) }
}

/** Ordre de jeu : une permutation des doigts, le premier commence. */
export function assignOrder(ids: readonly string[], rng: SeededRng): string[] {
  return rng.shuffle(ids)
}

export function eliminateOne(ids: readonly string[], rng: SeededRng): { eliminated: string; remaining: string[] } {
  const eliminated = rng.pick(ids)
  return { eliminated, remaining: ids.filter((id) => id !== eliminated) }
}

/**
 * Ordre d'allumage de l'animation : on tourne dans l'ordre de `ids` à partir
 * d'un doigt tiré au sort, et le nombre de pas (au moins `minSteps`) est
 * choisi pour que le dernier tombe sur `winner`.
 */
export function selectionSequence(
  ids: readonly string[],
  winner: string,
  rng: SeededRng,
  minSteps = SELECTION_MIN_STEPS
): string[] {
  const target = ids.indexOf(winner)
  if (target < 0) throw new Error('selectionSequence : le doigt désigné ne fait pas partie du tirage')
  const count = ids.length
  if (count === 1) return [winner]
  const start = rng.pickIndex(count)
  let steps = Math.max(1, minSteps)
  while ((start + steps - 1) % count !== target) steps += 1
  return Array.from({ length: steps }, (_, i) => ids[(start + i) % count])
}

/**
 * Instants (ms depuis le début de l'animation) où s'allume chaque pas : les
 * écarts grandissent d'un facteur SELECTION_SLOWDOWN du premier au dernier,
 * et le dernier pas tombe à `lightMs` (le reste de SELECTION_MS laisse le
 * doigt désigné seul allumé).
 */
export function selectionSchedule(steps: number, lightMs = SELECTION_MS - SELECTION_HOLD_MS): number[] {
  if (steps <= 0) return []
  if (steps === 1) return [0]
  const gaps = steps - 1
  const ratio = gaps > 1 ? Math.pow(SELECTION_SLOWDOWN, 1 / (gaps - 1)) : 1
  const first = ratio === 1 ? lightMs / gaps : (lightMs * (ratio - 1)) / (Math.pow(ratio, gaps) - 1)
  const offsets = [0]
  let at = 0
  for (let i = 0; i < gaps; i += 1) {
    at += first * Math.pow(ratio, i)
    offsets.push(at)
  }
  return offsets
}

/** Pas allumé `elapsedMs` après le début de l'animation. */
export function selectionStepIndex(schedule: readonly number[], elapsedMs: number): number {
  let index = 0
  for (let i = 1; i < schedule.length; i += 1) {
    if (schedule[i] > elapsedMs) break
    index = i
  }
  return index
}

/**
 * Doigts dans le sens des aiguilles d'une montre autour de leur barycentre
 * (coordonnées d'écran, y vers le bas) : l'allumage fait le tour de la table.
 */
export function clockwiseOrder(points: readonly FingerPoint[]): string[] {
  if (points.length === 0) return []
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return points
    .map((p) => ({ id: p.id, angle: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.angle - b.angle || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => p.id)
}

// ─── Arène ───────────────────────────────────────────────────────────────────

export function createDoigtState(options: { seed: string | number; now: number; mode?: DoigtMode }): DoigtState {
  return {
    mode: options.mode ?? 'victim',
    phase: 'gathering',
    fingers: [],
    down: [],
    changedAt: options.now,
    drawAt: null,
    round: null,
    lifted: [],
    survival: null,
    rngState: createRng(options.seed).getState(),
  }
}

/** Nouvelle graine, rien d'autre ne bouge : le composant ne la tire qu'après le montage, des doigts ont pu se poser avant. */
export function seedDoigt(state: DoigtState, seed: string | number): DoigtState {
  return { ...state, rngState: createRng(seed).getState() }
}

export function reduceDoigt(state: DoigtState, event: DoigtEvent): DoigtState {
  switch (event.type) {
    case 'down':
      return fingerDown(state, event.id, event.now)
    case 'up':
      return fingerUp(state, event.id, event.now)
    case 'cancel':
      return fingerCancel(state, event.id, event.now)
    case 'tick':
      return advance(state, event.now, event.order, event.animate ?? true)
    case 'mode':
      return changeMode(state, event.mode, event.now)
    case 'replay':
      return state.phase === 'result' ? restart(state, event.now) : state
  }
}

/** Un nouveau doigt serait-il suivi ? `full` : MAX_FINGERS atteint ; `closed` : tirage en cours ou verdict affiché. */
export function fingerAdmission(state: DoigtState): 'open' | 'full' | 'closed' {
  if (state.phase === 'gathering' || state.phase === 'countdown') {
    return state.fingers.length >= MAX_FINGERS ? 'full' : 'open'
  }
  return state.phase === 'result' && state.down.length === 0 ? 'open' : 'closed'
}

/** Prochain instant où un `tick` (ou le chiffre du décompte) change quelque chose. */
export function nextDoigtDeadline(state: DoigtState, now: number): number | null {
  switch (state.phase) {
    case 'gathering':
      return state.down.length >= MIN_FINGERS ? state.changedAt + STABLE_MS : null
    case 'countdown': {
      if (state.drawAt === null) return null
      const left = state.drawAt - now
      if (left <= 0) return now
      return now + (left % 1_000 || 1_000)
    }
    case 'selecting':
      return state.round ? state.round.revealAt : null
    case 'between':
      return state.survival ? state.survival.nextDrawAt : null
    case 'result':
      return null
  }
}

/** Chiffre du décompte (3, 2, 1), ou null hors décompte. */
export function countdownSecondsLeft(state: DoigtState, now: number): number | null {
  if (state.phase !== 'countdown' || state.drawAt === null) return null
  return Math.max(1, Math.ceil((state.drawAt - now) / 1_000))
}

/**
 * Doigts levés que l'écran annonce : entre deux éliminations, ceux du tirage
 * qui vient de tomber et de l'attente qui le suit (les autres ont eu leur
 * écran) ; au verdict, le récapitulatif de toute la partie.
 */
export function liftedToAnnounce(state: DoigtState): string[] {
  if (state.phase === 'between' && state.round) return state.lifted.slice(state.round.liftedBefore)
  return state.lifted
}

/**
 * Survie close par un tirage : son éliminé n'a pas eu d'écran à lui, le
 * verdict final l'annonce, qu'il reste un survivant ou plus personne.
 */
export function eliminatedAtVerdict(state: DoigtState): string | null {
  const survival = state.survival
  if (state.phase !== 'result' || !survival || !survival.finishedByDraw) return null
  return survival.eliminated[survival.eliminated.length - 1] ?? null
}

/** Ce que montre le cercle d'un doigt, selon la phase et le verdict. */
export type FingerRole =
  | { kind: 'idle' }
  | { kind: 'counting' }
  /** Allumé par l'animation de sélection. */
  | { kind: 'lit' }
  /** Dans le tirage en cours, pas allumé. */
  | { kind: 'waiting' }
  | { kind: 'victim' }
  /** Victime : épargné. */
  | { kind: 'spared' }
  | { kind: 'team'; team: 'gold' | 'blue' }
  /** Ordre : 1 commence. */
  | { kind: 'rank'; rank: number }
  /** Survie ; `latest` : celui qu'on vient d'éliminer, en attente de son retrait. */
  | { kind: 'eliminated'; latest: boolean }
  | { kind: 'alive' }
  | { kind: 'survivor' }
  /** Levé avant la fin, sans autre rôle à montrer. */
  | { kind: 'lifted' }

/** Rôle du doigt `id`, et `lifted` s'il a été levé avant la fin (pénalité, à signaler en plus du rôle). */
export function fingerRole(state: DoigtState, id: string, litId: string | null): { role: FingerRole; lifted: boolean } {
  const lifted = state.lifted.includes(id)
  switch (state.phase) {
    case 'gathering':
      return { role: { kind: 'idle' }, lifted }
    case 'countdown':
      return { role: { kind: 'counting' }, lifted }
    case 'selecting': {
      const inDraw = state.round ? state.round.participants.includes(id) : false
      if (!inDraw) return { role: earlierRole(state, id, lifted), lifted }
      if (lifted) return { role: { kind: 'lifted' }, lifted }
      return { role: id === litId ? { kind: 'lit' } : { kind: 'waiting' }, lifted }
    }
    case 'between':
    case 'result':
      return { role: verdictRole(state, id, lifted), lifted }
  }
}

/** Survie, pendant un tirage : les doigts sortis aux tirages précédents. */
function earlierRole(state: DoigtState, id: string, lifted: boolean): FingerRole {
  if (state.survival && state.survival.eliminated.includes(id)) return { kind: 'eliminated', latest: false }
  return lifted ? { kind: 'lifted' } : { kind: 'idle' }
}

function verdictRole(state: DoigtState, id: string, lifted: boolean): FingerRole {
  const fallback: FingerRole = lifted ? { kind: 'lifted' } : { kind: 'idle' }
  const outcome = state.round ? state.round.outcome : null
  if (!outcome) return fallback
  switch (outcome.mode) {
    case 'victim':
      if (id === outcome.victim) return { kind: 'victim' }
      return lifted ? { kind: 'lifted' } : { kind: 'spared' }
    case 'teams':
      if (outcome.gold.includes(id)) return { kind: 'team', team: 'gold' }
      return outcome.blue.includes(id) ? { kind: 'team', team: 'blue' } : fallback
    case 'order': {
      const rank = outcome.order.indexOf(id)
      return rank >= 0 ? { kind: 'rank', rank: rank + 1 } : fallback
    }
    case 'survival': {
      const survival = state.survival
      if (!survival) return fallback
      if (survival.winner === id) return { kind: 'survivor' }
      const at = survival.eliminated.indexOf(id)
      if (at >= 0) return { kind: 'eliminated', latest: at === survival.eliminated.length - 1 }
      return lifted ? { kind: 'lifted' } : { kind: 'alive' }
    }
  }
}

function lowestFreeColor(fingers: readonly DoigtFinger[]): number {
  const used = new Set(fingers.map((f) => f.color))
  let color = 0
  while (used.has(color)) color += 1
  return color
}

function fingerDown(state: DoigtState, id: string, now: number): DoigtState {
  if (state.down.includes(id) || state.fingers.some((f) => f.id === id)) return state
  const admission = fingerAdmission(state)
  if (admission !== 'open') return state
  if (state.phase === 'result') {
    return { ...restart(state, now), fingers: [{ id, color: 0 }], down: [id] }
  }
  return {
    ...state,
    phase: 'gathering',
    drawAt: null,
    changedAt: now,
    fingers: [...state.fingers, { id, color: lowestFreeColor(state.fingers) }],
    down: [...state.down, id],
  }
}

function fingerUp(state: DoigtState, id: string, now: number): DoigtState {
  if (!state.down.includes(id)) return state
  const down = state.down.filter((d) => d !== id)
  switch (state.phase) {
    case 'gathering':
    case 'countdown':
      return {
        ...state,
        phase: 'gathering',
        drawAt: null,
        changedAt: now,
        down,
        fingers: state.fingers.filter((f) => f.id !== id),
      }
    case 'selecting': {
      const inDraw = state.round ? state.round.participants.includes(id) : false
      const lifted = inDraw && !state.lifted.includes(id) ? [...state.lifted, id] : state.lifted
      return { ...state, down, lifted }
    }
    case 'between':
      return survivalLift(state, id, down, now)
    case 'result':
      return { ...state, down }
  }
}

/** Hors tirage, un retrait ordinaire (sans pénalité) ; pendant un tirage ou une survie, la manche est annulée. */
function fingerCancel(state: DoigtState, id: string, now: number): DoigtState {
  if (!state.down.includes(id)) return state
  const drawing = state.phase === 'selecting' || state.phase === 'between'
  // L'éliminé qu'on attendait : son départ est justement celui qu'on attendait.
  const awaited = state.phase === 'between' && state.survival !== null && state.survival.awaiting === id
  if (!drawing || awaited) return fingerUp(state, id, now)
  return restart({ ...state, down: state.down.filter((d) => d !== id) }, now)
}

function survivalLift(state: DoigtState, id: string, down: string[], now: number): DoigtState {
  const survival = state.survival
  if (!survival) return { ...state, down }
  if (id === survival.awaiting) {
    return { ...state, down, survival: { ...survival, awaiting: null, nextDrawAt: now + SURVIVAL_NEXT_MS } }
  }
  if (!survival.alive.includes(id)) return { ...state, down }
  const alive = survival.alive.filter((a) => a !== id)
  const lifted = state.lifted.includes(id) ? state.lifted : [...state.lifted, id]
  if (alive.length < MIN_FINGERS) return finishSurvival({ ...state, down, lifted }, { ...survival, alive }, false)
  return { ...state, down, lifted, survival: { ...survival, alive } }
}

function finishSurvival(state: DoigtState, survival: DoigtSurvival, byDraw: boolean): DoigtState {
  return {
    ...state,
    phase: 'result',
    survival: {
      ...survival,
      awaiting: null,
      nextDrawAt: null,
      winner: survival.alive[0] ?? null,
      finishedByDraw: byDraw,
    },
  }
}

/** Nouvelle partie (ou manche annulée) : ne restent que les doigts encore posés. */
function restart(state: DoigtState, now: number): DoigtState {
  return {
    ...state,
    phase: 'gathering',
    fingers: state.fingers.filter((f) => state.down.includes(f.id)),
    changedAt: now,
    drawAt: null,
    round: null,
    lifted: [],
    survival: null,
  }
}

function changeMode(state: DoigtState, mode: DoigtMode, now: number): DoigtState {
  if (mode === state.mode) return state
  switch (state.phase) {
    case 'gathering':
    case 'countdown':
      return { ...state, mode, phase: 'gathering', drawAt: null, changedAt: now }
    case 'result':
      return { ...restart(state, now), mode }
    case 'selecting':
    case 'between':
      return state
  }
}

/** Plusieurs échéances peuvent être passées d'un coup (onglet gelé par iOS) : on les enchaîne. */
function advance(state: DoigtState, now: number, order: readonly string[] | undefined, animate: boolean): DoigtState {
  let current = state
  for (let guard = 0; guard < 8; guard += 1) {
    const next = advanceOnce(current, now, order, animate)
    if (next === current) return current
    current = next
  }
  return current
}

function advanceOnce(state: DoigtState, now: number, order: readonly string[] | undefined, animate: boolean): DoigtState {
  switch (state.phase) {
    case 'gathering':
      if (state.down.length < MIN_FINGERS || now < state.changedAt + STABLE_MS) return state
      return { ...state, phase: 'countdown', drawAt: state.changedAt + STABLE_MS + COUNTDOWN_MS }
    case 'countdown':
      if (state.drawAt === null || now < state.drawAt) return state
      return startDraw(state, now, order, animate)
    case 'selecting':
      if (!state.round || now < state.round.revealAt) return state
      return reveal(state, now)
    case 'between':
      if (!state.survival || state.survival.nextDrawAt === null || now < state.survival.nextDrawAt) return state
      return nextSurvivalDraw(state, now, order, animate)
    case 'result':
      return state
  }
}

/** Les doigts tirés, dans l'ordre d'allumage voulu (doigts inconnus de `order` en fin, ordre d'arrivée). */
function cycleOrder(ids: readonly string[], order: readonly string[] | undefined): string[] {
  if (!order) return [...ids]
  const wanted = new Set(ids)
  const ordered: string[] = []
  for (const id of order) {
    if (wanted.has(id) && !ordered.includes(id)) ordered.push(id)
  }
  return [...ordered, ...ids.filter((id) => !ordered.includes(id))]
}

function drawOutcome(mode: DoigtMode, participants: readonly string[], rng: SeededRng): { outcome: DoigtOutcome; focus: string } {
  switch (mode) {
    case 'victim': {
      const victim = pickVictim(participants, rng)
      return { outcome: { mode, victim }, focus: victim }
    }
    case 'teams': {
      const { gold, blue } = splitTeams(participants, rng)
      return { outcome: { mode, gold, blue }, focus: gold[0] }
    }
    case 'order': {
      const order = assignOrder(participants, rng)
      return { outcome: { mode, order }, focus: order[0] }
    }
    case 'survival': {
      const { eliminated } = eliminateOne(participants, rng)
      return { outcome: { mode, eliminated }, focus: eliminated }
    }
  }
}

function makeRound(
  participants: string[],
  outcome: DoigtOutcome,
  focus: string,
  rng: SeededRng,
  now: number,
  animate: boolean,
  liftedBefore: number
): DoigtRound {
  return {
    participants,
    sequence: animate ? selectionSequence(participants, focus, rng) : [focus],
    startedAt: now,
    revealAt: animate ? now + SELECTION_MS : now,
    outcome,
    liftedBefore,
  }
}

function startDraw(state: DoigtState, now: number, order: readonly string[] | undefined, animate: boolean): DoigtState {
  const rng = rngFromState(state.rngState)
  const participants = cycleOrder(state.down, order)
  const { outcome, focus } = drawOutcome(state.mode, participants, rng)
  const round = makeRound(participants, outcome, focus, rng, now, animate, 0)
  return {
    ...state,
    phase: 'selecting',
    fingers: state.fingers.filter((f) => state.down.includes(f.id)),
    drawAt: null,
    round,
    lifted: [],
    survival:
      state.mode === 'survival'
        ? { alive: participants, eliminated: [], awaiting: null, nextDrawAt: null, winner: null, finishedByDraw: false }
        : null,
    rngState: rng.getState(),
  }
}

function reveal(state: DoigtState, now: number): DoigtState {
  const round = state.round
  if (!round || round.outcome.mode !== 'survival' || !state.survival) return { ...state, phase: 'result' }
  const out = round.outcome.eliminated
  const survival: DoigtSurvival = {
    ...state.survival,
    alive: state.survival.alive.filter((id) => id !== out && !state.lifted.includes(id)),
    eliminated: [...state.survival.eliminated, out],
  }
  if (survival.alive.length < MIN_FINGERS) return finishSurvival(state, survival, true)
  const stillDown = state.down.includes(out)
  return {
    ...state,
    phase: 'between',
    survival: { ...survival, awaiting: stillDown ? out : null, nextDrawAt: stillDown ? null : now + SURVIVAL_NEXT_MS },
  }
}

function nextSurvivalDraw(state: DoigtState, now: number, order: readonly string[] | undefined, animate: boolean): DoigtState {
  const survival = state.survival
  if (!survival) return state
  const pool = survival.alive.filter((id) => state.down.includes(id))
  if (pool.length < MIN_FINGERS) return finishSurvival(state, { ...survival, alive: pool }, false)
  const rng = rngFromState(state.rngState)
  const participants = cycleOrder(pool, order)
  const { eliminated } = eliminateOne(participants, rng)
  const round = makeRound(participants, { mode: 'survival', eliminated }, eliminated, rng, now, animate, state.lifted.length)
  return {
    ...state,
    phase: 'selecting',
    round,
    survival: { ...survival, alive: pool, nextDrawAt: null },
    rngState: rng.getState(),
  }
}
