import type { EnginePlayer } from '@/lib/petit-buveur/engine'

/**
 * Ce que l'écran TV du Petit Buveur affiche, déjà calé sur la chronologie du
 * téléphone (positions et gorgées AFFICHÉES, carte seulement une fois le pion
 * posé…). Rempli par la partie en ligne (état du moteur) comme par la partie
 * locale diffusée (payload du téléphone) : le rendu ne lit que ce modèle.
 */

export type TvPbPlayer = {
  id: string
  name: string
  /** Rang dans l'ordre de jeu : couleur stable du pion. */
  index: number
  /** Icône du joueur comme sur les téléphones (emoji ou portrait), sinon l'initiale. */
  icon: string | null
  /** Case affichée (0..29) : le pion marche, l'état a déjà sauté. */
  position: number
  /** Gorgées affichées : celles d'un effet pas encore joué à l'écran en sont retirées. */
  drinks: number
}

export type TvPbEffectKind = 'protection' | 'curse' | 'chain' | 'skip' | 'anchor' | 'mirror'

export type TvPbEffect = {
  id: string
  kind: TvPbEffectKind
  playerId: string
  /** Partenaire d'une chaîne ou cible d'un miroir. */
  partnerId?: string
  /** Tours restants, tels que le téléphone les affiche. */
  remaining: number
}

export type TvPbChange = { playerId: string; drinks: number; from: number; to: number }

/** Carte de la dernière case jouée, persistante jusqu'au lancer suivant (comme au téléphone). */
export type TvPbCard = {
  /** Change à chaque nouvelle case : rejoue le retournement. */
  key: string
  caseType: string
  title: string
  /** Case (1..30) où l'acteur est tombé. */
  caseNumber: number | null
  dice: number | null
  /** Texte du défi, ou consigne de la case. */
  detail: string | null
  changes: TvPbChange[]
  /** Verdict, choix, notes du moteur : ce que les gorgées et positions ne disent pas. */
  lines: string[]
  /** « Aucun dégât — sauvé ! » */
  nothing: boolean
  /** Joueur visé, montré à part quand la case ne l'a ni fait boire ni bouger (protection, malédiction…). */
  targetId?: string | null
}

export type TvPbWaiting =
  | { kind: 'choice'; name: string }
  | { kind: 'verdict'; judge: string; target: string }
  | { kind: 'side'; name: string; deadlineAt: number | null }

/** Case en attente d'une décision : visible par toute la table, avec qui doit décider. */
export type TvPbPending = {
  caseType: string
  title: string
  detail: string | null
  targetId: string | null
  waiting: TvPbWaiting
  /** Pictogramme à la place de celui de la case, quand le téléphone la garde cachée (choix de cible, duel). */
  icon?: string
  /** Ce que le téléphone affiche à la place de l'attente : tirage en cours, puis son résultat. */
  status?: { text: string; rolling: boolean; die?: number | null } | null
}

export type TvPbScreenModel = {
  /** Ordre de jeu. */
  players: TvPbPlayer[]
  /** Joueur que le téléphone montre « au tour » (l'acteur tant que son pion marche). */
  turnPlayerId: string | null
  turnCount: number | null
  effects: TvPbEffect[]
  card: TvPbCard | null
  pending: TvPbPending | null
  /** Lancer déjà lu à l'écran, pendant que le pion marche vers sa case. */
  roll: { playerId: string; value: number } | null
  /** Joueur attendu quand rien d'autre n'est à montrer. */
  waitingName: string | null
  /** Joueurs partis, en attente de leur retour avant remplacement par un bot. */
  absents: { name: string; endsAt: number }[]
  soft: boolean
}

/** Effets en cours de chaque joueur, dans l'ordre du téléphone (puis le miroir, que la liste locale montre). */
export function engineEffects(
  players: readonly Pick<
    EnginePlayer,
    | 'id'
    | 'protected'
    | 'protectionTurnsLeft'
    | 'cursed'
    | 'linkedTo'
    | 'linkedTurns'
    | 'skipNextTurn'
    | 'anchored'
    | 'mirrorDrinkTargetId'
    | 'mirrorDrinkTurns'
  >[]
): TvPbEffect[] {
  const out: TvPbEffect[] = []
  for (const p of players) {
    if (p.protected && (p.protectionTurnsLeft ?? 0) > 0) {
      out.push({ id: `prot-${p.id}`, kind: 'protection', playerId: p.id, remaining: p.protectionTurnsLeft ?? 1 })
    }
    if (p.cursed > 0) out.push({ id: `curse-${p.id}`, kind: 'curse', playerId: p.id, remaining: p.cursed })
    if (p.linkedTo && (p.linkedTurns ?? 0) > 0) {
      out.push({ id: `link-${p.id}`, kind: 'chain', playerId: p.id, partnerId: p.linkedTo, remaining: p.linkedTurns ?? 1 })
    }
    if (p.skipNextTurn) out.push({ id: `skip-${p.id}`, kind: 'skip', playerId: p.id, remaining: 1 })
    if (p.anchored) out.push({ id: `anchor-${p.id}`, kind: 'anchor', playerId: p.id, remaining: 1 })
    if (p.mirrorDrinkTargetId && (p.mirrorDrinkTurns ?? 0) > 0) {
      out.push({
        id: `mirror-${p.id}`,
        kind: 'mirror',
        playerId: p.id,
        partnerId: p.mirrorDrinkTargetId,
        remaining: p.mirrorDrinkTurns ?? 1,
      })
    }
  }
  return out
}

export const EFFECT_ICON: Record<TvPbEffectKind, string> = {
  protection: '🛡️',
  curse: '👻',
  chain: '🔗',
  skip: '⏭️',
  anchor: '⚓',
  mirror: '🪞',
}

/** Clé de titre sous `games.petit-buveur.game.effects`. */
export const EFFECT_TITLE_KEY: Record<TvPbEffectKind, string> = {
  protection: 'protection',
  curse: 'curse',
  chain: 'chain',
  skip: 'skipTurn',
  anchor: 'anchor',
  mirror: 'mirror',
}

export const EFFECT_ACCENT: Record<TvPbEffectKind, string> = {
  protection: 'border-blue-400/50 bg-blue-500/[0.15]',
  curse: 'border-red-400/50 bg-red-500/[0.15]',
  chain: 'border-chip-blue/60 bg-chip-blue/20',
  skip: 'border-slate-400/50 bg-slate-500/[0.15]',
  anchor: 'border-cyan-400/50 bg-cyan-500/[0.15]',
  mirror: 'border-red-400/50 bg-red-500/[0.15]',
}

/** Intérieur utile d'une case du plateau (5,05 rem moins `inset-1`). */
export const CELL_INNER_REM = 4.55
/** Écart entre deux pions d'une même case. */
export const PAWN_GAP_REM = 0.125
/** Hauteur de la ligne « +N » sous les pions d'une case bondée (text-lg leading-none). */
export const PAWN_OVERFLOW_REM = 1.125

/**
 * Taille des pions (rem), colonnes et pions dessinés dans une case, selon le
 * nombre de pions qui s'y trouvent : au départ, toute la table partage la
 * case 1 (jusqu'à 99 joueurs en ligne avec les bots). Au-delà de 16, douze
 * pions et une ligne « +N ».
 */
export function pawnGrid(count: number): { size: number; cols: number; visible: number } {
  if (count <= 1) return { size: 2.75, cols: 1, visible: count }
  if (count === 2) return { size: 2.1, cols: 2, visible: 2 }
  if (count <= 4) return { size: 1.95, cols: 2, visible: count }
  if (count <= 9) return { size: 1.4, cols: 3, visible: count }
  if (count <= 16) return { size: 1, cols: 4, visible: count }
  return { size: 1, cols: 4, visible: 12 }
}

/** Hauteur (rem) des pions d'une case : rangées de pions, plus la ligne « +N » s'il y en a une. */
export function pawnGridHeight(count: number): number {
  const { size, cols, visible } = pawnGrid(count)
  const rows = Math.ceil(visible / cols) + (visible < count ? 1 : 0)
  const heights = Array.from({ length: rows }, (_, i) => (visible < count && i === rows - 1 ? PAWN_OVERFLOW_REM : size))
  return heights.reduce((a, b) => a + b, 0) + (rows - 1) * PAWN_GAP_REM
}

/** Hauteur de la liste du classement (colonne de droite, 37 rem moins son titre), un peu de marge comprise. */
export const RANKING_LIST_REM = 34.5

const RANKING_ROW: Record<'detailed' | 'single' | 'dense', { height: number; gap: number }> = {
  detailed: { height: 3.85, gap: 0.5 },
  single: { height: 2.475, gap: 0.25 },
  dense: { height: 2.125, gap: 0.125 },
}

/** Hauteur (rem) de `rows` lignes du classement dans le mode donné. */
export function rankingHeight(mode: 'detailed' | 'single' | 'dense', rows: number): number {
  const { height, gap } = RANKING_ROW[mode]
  return rows * height + Math.max(0, rows - 1) * gap
}

/**
 * Lignes du classement : avec la case sous le nom jusqu'à 7 joueurs, sur une
 * ligne jusqu'à 12, serrées au-delà ; ce qui ne tient pas (joueurs nombreux,
 * encadré des absents en tête de colonne) est résumé par « +N ».
 */
export function rankingDensity(
  count: number,
  reservedRem = 0
): { mode: 'detailed' | 'single' | 'dense'; visible: number } {
  const avail = RANKING_LIST_REM - reservedRem
  const modes: ('detailed' | 'single' | 'dense')[] =
    count <= 7 ? ['detailed', 'single', 'dense'] : count <= 12 ? ['single', 'dense'] : ['dense']
  for (const mode of modes) {
    if (rankingHeight(mode, count) <= avail) return { mode, visible: count }
  }
  const { height, gap } = RANKING_ROW.dense
  const rows = Math.max(2, Math.floor((avail + gap) / (height + gap)))
  return { mode: 'dense', visible: Math.min(count, rows - 1) }
}

/** Absents nommés dans l'encadré ; les autres résumés par « +N ». */
export const ABSENTS_VISIBLE = 2

/**
 * Hauteur (rem) de l'encadré « En attente du retour de X » en tête du
 * classement, écart compris : chaque absent sur deux lignes au plus.
 */
export function absentsBlockRem(count: number): number {
  if (count <= 0) return 0
  const named = Math.min(count, ABSENTS_VISIBLE)
  const line = 1.125 * 1.375
  let h = 0.875 + named * 2 * line + (named - 1) * 0.25
  if (count > named) h += 0.25 + line
  return h + 0.5
}

/** Lignes max de la bulle d'un bot au pied du classement (text-xl) ; au-delà, coupée. */
export const SPEECH_LINES = 4

/**
 * Hauteur (rem) réservée au pied du classement à la bulle d'un bot, écart
 * compris : SPEECH_LINES lignes de text-xl (1,75 rem), le rembourrage et le
 * filet de la bulle. Le classement la retire de sa hauteur, comme l'encadré
 * des absents ; une seule bulle (la dernière) tient dans la colonne.
 */
export const SPEECH_BLOCK_REM = SPEECH_LINES * 1.75 + 0.875 + 0.5

/** Hauteur de la liste des effets (bandeau sous le plateau, titre retiré), un peu de marge comprise. */
export const EFFECTS_LIST_REM = 11
const EFFECT_ROW_TWO_REM = 3.69
const EFFECT_ROW_LINE_REM = 2.25
const EFFECT_GAP_REM = 0.25
/** Pastilles sur deux colonnes, quatre rangées. */
const EFFECT_CHIPS_MAX = 8

export type EffectRow = 'two' | 'line'

export type EffectsLayout = { mode: 'rows'; rows: EffectRow[] } | { mode: 'chips'; visible: number }

function effectRowsHeight(rows: EffectRow[]): number {
  return (
    rows.reduce((h, r) => h + (r === 'two' ? EFFECT_ROW_TWO_REM : EFFECT_ROW_LINE_REM), 0) +
    Math.max(0, rows.length - 1) * EFFECT_GAP_REM
  )
}

/**
 * Liste des effets en cours : jusqu'à 4, une ligne par effet avec le pion et
 * le nom de son porteur ; le partenaire d'une chaîne ou d'un miroir sur sa
 * propre ligne quand elle tient (sinon son pion seul), le titre de l'effet de
 * même. Au-delà, des pastilles sur deux colonnes où pions et emoji
 * identifient joueurs et effet, puis « +N ».
 */
export function effectsLayout(effects: readonly Pick<TvPbEffect, 'partnerId'>[]): EffectsLayout {
  const n = effects.length
  if (n <= 4) {
    const rows: EffectRow[] = effects.map(() => 'line')
    if (effectRowsHeight(rows) <= EFFECTS_LIST_REM) {
      effects.forEach((e, i) => {
        if (!e.partnerId) return
        rows[i] = 'two'
        if (effectRowsHeight(rows) > EFFECTS_LIST_REM) rows[i] = 'line'
      })
      // Titres des effets sans partenaire : tous ou aucun, pour des lignes régulières.
      const titled = rows.map((r, i) => (effects[i].partnerId ? r : 'two'))
      return { mode: 'rows', rows: effectRowsHeight(titled) <= EFFECTS_LIST_REM ? titled : rows }
    }
  }
  return { mode: 'chips', visible: n <= EFFECT_CHIPS_MAX ? n : EFFECT_CHIPS_MAX - 1 }
}

/** Hauteur (rem) de la liste des effets telle que disposée. */
export function effectsLayoutHeight(layout: EffectsLayout, count: number): number {
  if (layout.mode === 'rows') return effectRowsHeight(layout.rows)
  const cells = layout.visible + (layout.visible < count ? 1 : 0)
  const rows = Math.ceil(cells / 2)
  return rows * EFFECT_ROW_LINE_REM + Math.max(0, rows - 1) * EFFECT_GAP_REM
}

/** Largeur (rem) laissée au titre d'une carte : intérieur de la carte moins l'emoji de la case et l'écart. */
export const CARD_TITLE_WIDTH_REM = 25

export type TitleLayout = { size: '4xl' | '3xl'; lines: 1 | 2; heightRem: number }

/**
 * Titre de case en entier : text-4xl s'il tient sur la largeur, sinon
 * text-3xl, sur deux lignes pour une double case aux noms longs.
 * Estimation large (un demi-cadratin par caractère, police font-black).
 */
export function titleLayout(title: string, widthRem = CARD_TITLE_WIDTH_REM): TitleLayout {
  const chars = title.length
  if (chars * 2.25 * 0.5 <= widthRem) return { size: '4xl', lines: 1, heightRem: 2.25 * 1.25 }
  if (chars * 1.875 * 0.5 <= widthRem) return { size: '3xl', lines: 1, heightRem: 1.875 * 1.25 }
  return { size: '3xl', lines: 2, heightRem: 2 * 1.875 * 1.25 }
}

/** Emoji de la case en tête de carte (text-6xl leading-none). */
const CARD_EMOJI_REM = 3.75
/** Ligne « Case N · dé » sous le titre : l'icône du dé (h-6) dépasse le text-lg leading-tight. */
const CARD_META_REM = 1.5

/** Hauteur (rem) de l'en-tête d'une carte : emoji à gauche, titre et ligne « Case N · dé » à droite. */
export function cardHeaderRem(title: TitleLayout, meta: boolean): number {
  return Math.max(CARD_EMOJI_REM, title.heightRem + (meta ? CARD_META_REM : 0))
}

/**
 * Hauteurs (rem) de la carte de case sur la toile 16:9 : le bandeau sous le
 * plateau laisse ≈ 12,5 rem utiles à la carte (12,25 retenus, de la marge
 * pour les arrondis). Sert à choisir ce qui tient
 * en entier plutôt que de laisser `overflow-hidden` couper une ligne.
 */
const CARD = {
  budget: 12.25,
  gap: 0.5,
  textLine: 1.72,
  chipRow: 2.625,
  nothing: 2,
  width: 30,
  charWidth: 0.7,
}

function chipWidth(change: TvPbChange, name: string, plain: boolean): number {
  const digits = (n: number) => String(n).length
  let w = 0.25 + 2 + 0.75 + 0.125
  if (plain) w += 0.5 + Math.min(9, CARD.charWidth * name.length)
  if (change.drinks > 0) w += 0.5 + CARD.charWidth * (1 + digits(change.drinks)) + 0.25 + 1.5
  if (change.to !== change.from) w += 0.5 + CARD.charWidth * ((plain ? 7 : 2) + digits(change.to + 1))
  return w
}

function packRows(widths: number[]): number {
  let rows = 0
  let used = Infinity
  for (const w of widths) {
    if (used + 0.5 + w > CARD.width) {
      rows += 1
      used = w
    } else used += 0.5 + w
  }
  return rows
}

/** Cible à montrer en tête des pastilles : visée, mais absente des gorgées et déplacements. */
export function cardTargetId(card: Pick<TvPbCard, 'targetId' | 'changes'>): string | null {
  if (!card.targetId) return null
  return card.changes.some((c) => c.playerId === card.targetId) ? null : card.targetId
}

export type CardLayout = {
  /** Pastilles avec le nom du joueur (sinon pion seul). */
  plainChips: boolean
  /** Pastilles affichées ; le reste résumé par « +N ». */
  visibleChips: number
  detailClamp: 0 | 1 | 2
  lineCount: number
  lineClamp: 1 | 2
  title: TitleLayout
}

/** Ce que la carte peut montrer EN ENTIER : le titre, les pastilles, puis les notes, puis le texte du défi. */
export function cardLayout(
  card: Pick<TvPbCard, 'detail' | 'changes' | 'lines' | 'nothing' | 'targetId'> &
    Partial<Pick<TvPbCard, 'title' | 'caseNumber' | 'dice'>>,
  nameOf: (id: string) => string
): CardLayout {
  const title = titleLayout(card.title ?? '')
  let avail = CARD.budget - cardHeaderRem(title, card.caseNumber != null || card.dice != null)
  // Rangées de pastilles qui tiennent sous l'en-tête (deux au plus).
  const maxRows = Math.max(1, Math.min(2, Math.floor(avail / (CARD.chipRow + CARD.gap))))
  const target = cardTargetId(card)
  // Pastille « 🎯 cible » : pion, emoji et nom, toujours en entier.
  const targetWidth = target ? 0.25 + 2 + 0.75 + 0.125 + 0.5 + 2.25 + 0.5 + Math.min(9, CARD.charWidth * nameOf(target).length) : 0
  let plainChips = card.changes.length <= 2
  let visibleChips = card.changes.length
  const rowsFor = (plain: boolean, count: number) => {
    const widths = card.changes.slice(0, count).map((c) => chipWidth(c, nameOf(c.playerId), plain))
    if (target) widths.unshift(targetWidth)
    if (count < card.changes.length) widths.push(3)
    return packRows(widths)
  }
  let rows = card.changes.length > 0 || target ? rowsFor(plainChips, visibleChips) : 0
  // Les noms coûtent une rangée de pastilles : on les retire s'il faut la place pour les notes ou le défi.
  if (plainChips && (rows > maxRows || (rows === maxRows && maxRows > 1 && (card.lines.length > 0 || card.detail)))) {
    const compactRows = rowsFor(false, visibleChips)
    if (rows > maxRows || compactRows < rows) {
      plainChips = false
      rows = compactRows
    }
  }
  while (rows > maxRows && visibleChips > 1) {
    visibleChips -= 1
    rows = rowsFor(plainChips, visibleChips)
  }
  if (rows > 0) avail -= CARD.gap + rows * CARD.chipRow + (rows - 1) * CARD.gap
  if (card.nothing) avail -= CARD.gap + CARD.nothing

  const lineCost = (clamp: number) => CARD.gap + clamp * CARD.textLine
  let lineCount = 0
  while (lineCount < card.lines.length && avail >= lineCost(1)) {
    avail -= lineCost(1)
    lineCount += 1
  }
  let detailClamp: 0 | 1 | 2 = 0
  if (card.detail && avail >= lineCost(1)) {
    detailClamp = avail >= lineCost(2) ? 2 : 1
    avail -= lineCost(detailClamp)
  }
  const lineClamp: 1 | 2 = lineCount > 0 && avail >= lineCount * CARD.textLine ? 2 : 1
  return { plainChips, visibleChips, detailClamp, lineCount, lineClamp, title }
}

/** Largeur (rem) des lignes de l'encadré « en attente » (intérieur de la carte). */
const PENDING_WIDTH_REM = 30
/** Ligne d'attente ou de tirage (text-2xl leading-snug). */
const PENDING_STATUS_LINE_REM = 1.5 * 1.375
/** Dé de la honte posé à côté du résultat. */
const PENDING_DIE_REM = 3.5
/** Rangée « 🎯 cible » sous le titre (pion de 2,25 rem). */
const PENDING_TARGET_REM = 2.25

export type PendingLayout = { title: TitleLayout; detailClamp: 0 | 1 | 2; statusClamp: 1 | 2 }

/**
 * Ce que l'encadré « en attente » montre en entier dans la hauteur de la
 * carte : le titre, la cible quand la ligne d'attente ne la nomme pas, qui
 * décide (au moins une ligne), puis le texte du défi, puis la seconde ligne
 * de chacun s'il reste la place.
 */
export function pendingLayout(p: {
  title: string
  detail: string | null
  targetRow: boolean
  /** Ligne d'attente ou de tirage, telle qu'affichée. */
  status: string
  die: boolean
}): PendingLayout {
  const title = titleLayout(p.title)
  let avail = CARD.budget - cardHeaderRem(title, false)
  if (p.targetRow) avail -= CARD.gap + PENDING_TARGET_REM
  const statusWidth = PENDING_WIDTH_REM - (p.die ? PENDING_DIE_REM + 1 : 0)
  const statusNeeds = p.status.length * 1.5 * 0.5 > statusWidth ? 2 : 1
  const statusRow = (lines: number) => Math.max(p.die ? PENDING_DIE_REM : 0, lines * PENDING_STATUS_LINE_REM)
  avail -= CARD.gap + statusRow(1)
  const detailNeeds = p.detail ? (p.detail.length * 1.25 * 0.5 > PENDING_WIDTH_REM ? 2 : 1) : 0
  let detailClamp: 0 | 1 | 2 = 0
  if (detailNeeds > 0 && avail >= CARD.gap + CARD.textLine) {
    detailClamp = 1
    avail -= CARD.gap + CARD.textLine
  }
  let statusClamp: 1 | 2 = 1
  const extra = statusRow(2) - statusRow(1)
  if (statusNeeds === 2 && avail >= extra) {
    statusClamp = 2
    avail -= extra
  }
  if (detailNeeds === 2 && detailClamp === 1 && avail >= CARD.textLine) detailClamp = 2
  return { title, detailClamp, statusClamp }
}
