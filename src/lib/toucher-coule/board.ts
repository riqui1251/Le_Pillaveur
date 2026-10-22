/**
 * Géométrie de la grille CÔTÉ ÉCRAN (Toucher-Coulé en ligne) — fonctions pures.
 *
 * Le moteur revalide tout côté serveur ; ici on calcule seulement ce que le
 * joueur voit et vise : la coordonnée « C4 » qu'on se dit entre coéquipiers,
 * le bateau recalé quand il dépasse du bord, le carré de la bombe, et la
 * taille des cases au téléphone.
 */

/** Plancher d'une case au doigt : en dessous, un doigt qui glisse vise la voisine. */
export const TC_MIN_CELL_PX = 30
/** Plafond : au-delà, une grille 8×8 sur tablette occupe l'écran sans rien gagner. */
export const TC_MAX_CELL_PX = 48

/** Lettre de colonne : A pour la première, N pour la quatorzième. */
export function tcColumnLetter(col: number): string {
  return String.fromCharCode(65 + col)
}

/** Coordonnée lisible d'une case : colonne en lettre, ligne à partir de 1 (« C4 »). */
export function tcCoord(cell: number, size: number): string {
  return `${tcColumnLetter(cell % size)}${Math.floor(cell / size) + 1}`
}

/**
 * Cases d'un bateau posé depuis `origin`, RECALÉ pour tenir dans la grille :
 * toucher la dernière colonne avec un 4 cases horizontal le pose sur les 4
 * dernières colonnes au lieu de refuser sans rien dire.
 */
export function tcShipCells(origin: number, shipSize: number, size: number, horizontal: boolean): number[] {
  const row = Math.floor(origin / size)
  const col = origin % size
  const startRow = horizontal ? row : Math.max(0, Math.min(row, size - shipSize))
  const startCol = horizontal ? Math.max(0, Math.min(col, size - shipSize)) : col
  return Array.from({ length: shipSize }, (_, i) =>
    horizontal ? startRow * size + startCol + i : (startRow + i) * size + startCol
  )
}

/** Cases du carré 2×2 de la bombe ancré en `anchor` (coin haut-gauche), bornées à la grille. */
export function tcBombCells(anchor: number, size: number): number[] {
  const row = Math.floor(anchor / size)
  const col = anchor % size
  const cells: number[] = []
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
    if (row + dr < size && col + dc < size) cells.push((row + dr) * size + col + dc)
  }
  return cells
}

/** Vrai si le carré 2×2 ancré en `anchor` tient dans la grille et n'a encore reçu aucun tir. */
export function tcBombFits(anchor: number, size: number, shots: Readonly<Record<number, unknown>>): boolean {
  const cells = tcBombCells(anchor, size)
  return cells.length === 4 && cells.every((c) => shots[c] === undefined)
}

/**
 * Taille d'une case pour une largeur disponible `widthPx` (colonne des numéros
 * de ligne et écarts compris). Sous le plancher, la case GARDE le plancher et
 * la grille déborde : elle défile alors de côté plutôt que de rapetisser sous
 * le doigt (12×12 et 14×14 sur un téléphone de 375 px).
 */
export function tcCellPx(
  widthPx: number,
  size: number,
  gapPx: number,
  labelPx: number
): { cellPx: number; overflows: boolean } {
  if (!(widthPx > 0) || size <= 0) return { cellPx: TC_MIN_CELL_PX, overflows: false }
  const raw = Math.floor((widthPx - labelPx - gapPx * size) / size)
  return {
    cellPx: Math.min(TC_MAX_CELL_PX, Math.max(TC_MIN_CELL_PX, raw)),
    overflows: raw < TC_MIN_CELL_PX,
  }
}
