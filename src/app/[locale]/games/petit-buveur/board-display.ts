import type {
  PetitBuveurCastChange,
  PetitBuveurCastEffect,
  PetitBuveurCastEffectKind,
  PetitBuveurCastReveal,
  PetitBuveurCastStage,
  PetitBuveurCastState,
} from '@/lib/cast-types'
import type { AmbianceMode } from './ambiance'
import type { PetitBuveurT } from './case-config'

type Positioned = { id: string; position: number }

/**
 * Case AFFICHÉE d'un pion : l'état saute à la position finale, le pion marche
 * case par case (useSteppedPositions). HUD, classement et surbrillance lisent
 * cette valeur pour ne pas annoncer l'arrivée avant le pion.
 */
export function shownPosition(player: Positioned, shown: Record<string, number>): number {
  return shown[player.id] ?? player.position
}

/** Classement par case affichée, du premier au dernier (ordre de jeu conservé à égalité). */
export function rankByShownPosition<T extends Positioned>(players: readonly T[], shown: Record<string, number>): T[] {
  return [...players].sort((a, b) => shownPosition(b, shown) - shownPosition(a, shown))
}

export type BoardHighlights = { leader: number; active: number }

export function boardHighlights(
  players: readonly Positioned[],
  currentIndex: number,
  shown: Record<string, number>
): BoardHighlights {
  const current = players[currentIndex]
  return {
    leader: players.length > 0 ? Math.max(...players.map(p => shownPosition(p, shown))) : -1,
    active: current ? shownPosition(current, shown) : -1,
  }
}

export function boardHighlightClass(index: number, { leader, active }: BoardHighlights): string {
  if (index === active && index === leader) return 'pb-board-highlight-both'
  if (index === active) return 'pb-board-highlight-active'
  if (index === leader) return 'pb-board-highlight-leader'
  return ''
}

/**
 * Mise en scène du dé local (DiceOverlay) : il roule, puis sa valeur reste
 * affichée avant que le pion parte. La TV tient le résultat aussi longtemps.
 */
export const LOCAL_DICE_ROLL_MS = 750
export const LOCAL_DICE_RESULT_MS = 700

/**
 * Signal TV (dé ou case) : `seq` ne redescend jamais, même après un remontage
 * du jeu (changement de langue). `after` : seq que celle-ci doit dépasser (la
 * case d'un tour vient après son dé, même si l'horloge recule).
 */
export function nextCastCue<T extends object>(
  prev: { seq: number } | null | undefined,
  payload: T,
  now: number,
  after = 0
): T & { seq: number } {
  return { ...payload, seq: Math.max((prev?.seq ?? 0) + 1, after + 1, now) }
}

export function buildLocalCastState(input: {
  players: readonly { id: string; name: string; position: number; drinks: number; icon?: string | null }[]
  currentPlayer: number
  winnerId: string | null
  dice: PetitBuveurCastState['dice']
  reveal: PetitBuveurCastReveal | null
  ambiance: AmbianceMode
  turnCount?: number
  difficulty?: string
  effects?: PetitBuveurCastEffect[]
  stage?: PetitBuveurCastStage | null
  snapKey?: number
}): PetitBuveurCastState {
  const state: PetitBuveurCastState = {
    castKind: 'petit-buveur',
    players: input.players.map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      drinks: p.drinks,
      ...(p.icon ? { icon: p.icon } : {}),
    })),
    currentPlayer: input.currentPlayer,
    phase: input.winnerId ? 'finished' : 'playing',
    winner: input.winnerId,
    dice: input.dice,
    reveal: input.reveal,
    ambiance: input.ambiance,
  }
  if (input.turnCount !== undefined) state.turnCount = input.turnCount
  if (input.difficulty !== undefined) state.difficulty = input.difficulty
  if (input.effects !== undefined) state.effects = input.effects
  if (input.stage !== undefined) state.stage = input.stage
  if (input.snapKey !== undefined) state.snapKey = input.snapKey
  return state
}

const EFFECT_KIND_BY_PREFIX: Record<string, PetitBuveurCastEffectKind> = {
  prot: 'protection',
  curse: 'curse',
  link: 'chain',
  skip: 'skip',
  anchor: 'anchor',
  mirror: 'mirror',
}

/**
 * Une ligne de la liste « Effets en cours » du téléphone (collectActiveEffects,
 * dont l'id commence par le genre d'effet), telle que la TV la reçoit.
 */
export function castEffectOf(item: {
  id: string
  player: { id: string }
  linkedPlayer?: { id: string }
  remainingTurns: number
}): PetitBuveurCastEffect | null {
  const kind = EFFECT_KIND_BY_PREFIX[item.id.split('-')[0]]
  if (!kind) return null
  return {
    kind,
    playerId: item.player.id,
    ...(item.linkedPlayer ? { partnerId: item.linkedPlayer.id } : {}),
    remaining: item.remainingTurns,
  }
}

type Tracked = { id: string; position: number; drinks: number }

/** Qui a bu, qui a bougé depuis l'arrivée du pion sur la case : les pastilles de la carte TV. */
export function castChanges(before: readonly Tracked[], after: readonly Tracked[]): PetitBuveurCastChange[] {
  const out: PetitBuveurCastChange[] = []
  for (const p of after) {
    const prev = before.find(b => b.id === p.id)
    if (!prev) continue
    const drinks = Math.max(0, p.drinks - prev.drinks)
    if (drinks > 0 || p.position !== prev.position) {
      out.push({ playerId: p.id, drinks, from: prev.position, to: p.position })
    }
  }
  return out
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

/**
 * Texte d'une notification du jeu (HTML : noms stylés, gras) en paragraphes
 * de texte brut, pour que la TV l'affiche en texte, jamais en HTML.
 */
export function htmlToLines(html: string): string[] {
  return html
    .split(/\n\s*\n|<br\s*\/?>/i)
    .map(part => decodeEntities(part.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * Contenu de la carte TV d'un effet de case : le texte de la fenêtre du
 * téléphone (sans le résumé des effets, que la TV liste à part), le texte de
 * la case à part quand l'effet le reprend, et les pastilles depuis l'arrivée.
 */
export function localRevealContent(input: {
  caseType: string
  mainHtml: string
  /** Texte de la case (défi, question) quand la fenêtre l'affiche, sinon null. */
  caseText: string | null
  landing: { players: readonly Tracked[]; caseNumber: number | null; dice: number | null } | null
  players: readonly Tracked[]
  targetId: string | null
  verdictPending: boolean
}): Omit<PetitBuveurCastReveal, 'seq'> {
  const detail = input.caseText ? htmlToLines(input.caseText).join(' ') || null : null
  const lines = htmlToLines(input.mainHtml)
  const detailIndex = detail ? lines.indexOf(detail) : -1
  if (detailIndex >= 0) lines.splice(detailIndex, 1)
  return {
    caseType: input.caseType,
    detail,
    lines,
    caseNumber: input.landing?.caseNumber ?? null,
    dice: input.landing?.dice ?? null,
    targetId: input.targetId,
    changes: input.landing ? castChanges(input.landing.players, input.players) : [],
    verdictPending: input.verdictPending,
  }
}

export type SlotPart = string | { slot: string }

const slotMarker = (name: string) => `__SLOT_${name}__`

/**
 * Traduit une phrase dont certains paramètres sont des composants (nom de
 * joueur stylé) : next-intl n'accepte de nœud React qu'entre balises, or les
 * messages du jeu portent des `{player}` simples.
 */
export function translateWithSlots(
  t: PetitBuveurT,
  key: string,
  slots: readonly string[],
  plain?: Record<string, string | number>
): SlotPart[] {
  const values: Record<string, string | number> = { ...plain }
  for (const slot of slots) values[slot] = slotMarker(slot)
  return splitSlots(t(key, values), slots)
}

export function splitSlots(text: string, slots: readonly string[]): SlotPart[] {
  if (slots.length === 0) return text ? [text] : []
  const bySlot = new Map(slots.map(s => [slotMarker(s), s]))
  const pattern = new RegExp(`(${[...bySlot.keys()].join('|')})`)
  return text
    .split(pattern)
    .filter(part => part !== '')
    .map(part => (bySlot.has(part) ? { slot: bySlot.get(part)! } : part))
}
