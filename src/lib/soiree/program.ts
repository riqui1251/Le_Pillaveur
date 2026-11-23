import { playableSoireeGameIds, soireeHeat, soireeMinutes, type SoireeHeat } from './catalog'

/** L'ambiance choisit quels jeux entrent au programme, et dans quelle proportion. */
export const SOIREE_VIBES = ['apero', 'monte', 'grosse'] as const
export type SoireeVibe = (typeof SOIREE_VIBES)[number]

export const SOIREE_LENGTHS = ['court', 'normal', 'long'] as const
export type SoireeLength = (typeof SOIREE_LENGTHS)[number]

/** Manches d'un programme composé. */
export const SOIREE_LENGTH_ROUNDS: Readonly<Record<SoireeLength, number>> = { court: 3, normal: 5, long: 7 }

/** Plafond d'un programme composé à la main : au-delà, la soirée ne se termine plus. */
export const SOIREE_MAX_ROUNDS = 12

const VIBE_WEIGHTS: Readonly<Record<SoireeVibe, Readonly<Record<SoireeHeat, number>>>> = {
  apero: { 1: 4, 2: 2, 3: 0.5 },
  monte: { 1: 2, 2: 2, 3: 2 },
  grosse: { 1: 0.5, 2: 2, 3: 4 },
}

export type Rng = () => number

export function isSoireeVibe(value: unknown): value is SoireeVibe {
  return typeof value === 'string' && (SOIREE_VIBES as readonly string[]).includes(value)
}

export function isSoireeLength(value: unknown): value is SoireeLength {
  return typeof value === 'string' && (SOIREE_LENGTHS as readonly string[]).includes(value)
}

/**
 * Compose un programme : des jeux tirés au sort selon l'ambiance (sans
 * doublon), rangés de la chauffe au plus intense. À moins de jeux jouables
 * que de manches, le programme est simplement plus court. Les jeux cachés
 * par l'équipe (`hiddenIds`) ne sont jamais tirés.
 */
export function buildProgram(options: {
  rounds: number
  vibe: SoireeVibe
  playerCount: number
  hiddenIds?: readonly string[]
  rng?: Rng
}): string[] {
  const rng = options.rng ?? Math.random
  const left = playableSoireeGameIds(options.playerCount, options.hiddenIds)
  const wanted = Math.max(0, Math.min(left.length, options.rounds))
  const weights = VIBE_WEIGHTS[options.vibe]

  const picked: string[] = []
  while (picked.length < wanted && left.length > 0) {
    const total = left.reduce((sum, id) => sum + weights[soireeHeat(id)], 0)
    let draw = rng() * total
    let index = left.length - 1
    for (let i = 0; i < left.length; i++) {
      draw -= weights[soireeHeat(left[i])]
      if (draw < 0) {
        index = i
        break
      }
    }
    picked.push(left.splice(index, 1)[0])
  }

  return picked
    .map((id) => ({ id, key: soireeHeat(id) + rng() * 0.9 }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.id)
}

/** Déplace la manche `from` à la place `to` (bornes ramenées dans le programme). */
export function moveRound<T>(program: readonly T[], from: number, to: number): T[] {
  const next = program.slice()
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(next.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

export function removeRound<T>(program: readonly T[], index: number): T[] {
  return program.filter((_, i) => i !== index)
}

export function replaceRound<T>(program: readonly T[], index: number, item: T): T[] {
  return program.map((current, i) => (i === index ? item : current))
}

/** Ajoute un jeu en fin de programme, dans la limite de SOIREE_MAX_ROUNDS. */
export function addRound(program: readonly string[], gameId: string): string[] {
  if (program.length >= SOIREE_MAX_ROUNDS) return program.slice()
  return [...program, gameId]
}

export function programMinutes(program: readonly string[]): number {
  return program.reduce((sum, id) => sum + soireeMinutes(id), 0)
}

/** Intensité de chaque manche, pour la courbe du programme. */
export function programHeat(program: readonly string[]): SoireeHeat[] {
  return program.map((id) => soireeHeat(id))
}
