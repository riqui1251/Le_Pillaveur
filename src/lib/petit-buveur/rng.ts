/**
 * RNG déterministe seedé pour le moteur Petit Buveur en ligne.
 *
 * Objectif : le serveur fait autorité. Toute opération aléatoire (dé, type de
 * case, effets aléatoires…) passe par ce RNG, dérivé d'une graine de partie.
 * L'état interne est sérialisable (un uint32) afin de persister la position du
 * générateur entre deux actions/tours et garantir une partie reproductible.
 */

/** État interne sérialisable du générateur (uint32). */
export type RngState = number

export interface SeededRng {
  /** Flottant dans [0, 1). */
  next(): number
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number
  /** Vrai avec une probabilité p (0..1). */
  chance(p: number): boolean
  /** Élément aléatoire d'un tableau non vide. */
  pick<T>(arr: readonly T[]): T
  /** Index aléatoire dans [0, length). */
  pickIndex(length: number): number
  /** Tirage pondéré parmi des entrées { weight }. */
  weightedPick<T extends { weight: number }>(entries: readonly T[]): T
  /** Copie mélangée (Fisher–Yates), sans muter l'entrée. */
  shuffle<T>(arr: readonly T[]): T[]
  /** État interne courant (pour persistance). */
  getState(): RngState
}

/** Hash 32 bits d'une graine string/number (xfnv1a-like), toujours déterministe. */
export function hashSeed(seed: string | number): number {
  const str = typeof seed === 'number' ? String(seed) : seed
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Avance l'état mulberry32 et retourne [état suivant, flottant [0,1)]. */
function mulberry32Step(state: number): [number, number] {
  let a = state | 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [a >>> 0, value]
}

function makeRng(initialState: number): SeededRng {
  let state = initialState >>> 0

  const next = (): number => {
    const [nextState, value] = mulberry32Step(state)
    state = nextState
    return value
  }

  const int = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min]
    const span = Math.floor(max) - Math.ceil(min) + 1
    return Math.ceil(min) + Math.floor(next() * span)
  }

  const pickIndex = (length: number): number => {
    if (length <= 0) throw new Error('pickIndex: longueur nulle')
    return Math.floor(next() * length)
  }

  const pick = <T,>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('pick: tableau vide')
    return arr[pickIndex(arr.length)]
  }

  const chance = (p: number): boolean => next() < p

  const weightedPick = <T extends { weight: number }>(entries: readonly T[]): T => {
    if (entries.length === 0) throw new Error('weightedPick: aucune entrée')
    const total = entries.reduce((s, e) => s + e.weight, 0)
    let r = next() * total
    for (const entry of entries) {
      r -= entry.weight
      if (r <= 0) return entry
    }
    return entries[entries.length - 1]
  }

  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = [...arr]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return {
    next,
    int,
    chance,
    pick,
    pickIndex,
    weightedPick,
    shuffle,
    getState: () => state,
  }
}

/** Crée un RNG à partir d'une graine (string ou number). */
export function createRng(seed: string | number): SeededRng {
  return makeRng(hashSeed(seed))
}

/** Reprend un RNG depuis un état interne persistant (uint32). */
export function rngFromState(state: RngState): SeededRng {
  return makeRng(state >>> 0)
}

/** Génère une graine de partie aléatoire (utilisée à la création d'une salle). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
