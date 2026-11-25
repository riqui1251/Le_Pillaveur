import { playableSoireeGameIds, SOIREE_GAME_IDS, soireeHeat, soireeMinutes, type SoireeHeat } from './catalog'
import { defaultVibesForLevel, isSoireeVibe, SOIREE_VIBES, type SoireeVibe } from './vibes'

// Les imports existants (state, storage, AmbianceStep) viennent encore d'ici.
export { isSoireeVibe, SOIREE_VIBES, type SoireeVibe }

export const SOIREE_LENGTHS = ['court', 'normal', 'long'] as const
export type SoireeLength = (typeof SOIREE_LENGTHS)[number]

/** Manches d'un programme composé. */
export const SOIREE_LENGTH_ROUNDS: Readonly<Record<SoireeLength, number>> = { court: 3, normal: 5, long: 7 }

/**
 * Plafond d'une soirée, manches jouées, passées et à venir comprises : sans
 * lui, chaque entracte pouvait rallonger le programme et la soirée ne se
 * terminait jamais.
 */
export const SOIREE_MAX_ROUNDS = 12

/**
 * Poids d'un jeu rangé dans l'ambiance, selon son niveau « Fait boire » : le
 * tirage ne prend que les jeux que l'équipe a rangés dans l'ambiance (vibesOf),
 * le niveau ne fait que pencher la balance. « Ça monte » n'a pas de poids : il
 * répartit le programme entre les trois niveaux (monteQuotas), puis le
 * classement le fait monter.
 */
const VIBE_WEIGHTS: Readonly<Record<Exclude<SoireeVibe, 'monte'>, Readonly<Record<SoireeHeat, number>>>> = {
  apero: { 1: 3, 2: 1, 3: 1 },
  grosse: { 1: 1, 2: 1, 3: 3 },
}

const HEATS: readonly SoireeHeat[] = [1, 2, 3]

export type Rng = () => number

/** Tire `count` jeux de `pool` sans remise, chacun selon son poids (> 0). */
function drawWeighted(pool: string[], count: number, weightOf: (id: string) => number, rng: Rng): string[] {
  const left = pool.filter((id) => weightOf(id) > 0)
  const picked: string[] = []
  while (picked.length < count && left.length > 0) {
    const total = left.reduce((sum, id) => sum + weightOf(id), 0)
    let draw = rng() * total
    let index = left.length - 1
    for (let i = 0; i < left.length; i++) {
      draw -= weightOf(left[i])
      if (draw < 0) {
        index = i
        break
      }
    }
    picked.push(left.splice(index, 1)[0])
  }
  return picked
}

/**
 * « Ça monte » : autant de manches de chaque niveau que possible, le reste
 * au milieu puis au plus fort (5 manches : 1 Peu, 2 Moyen, 2 Beaucoup).
 */
export function monteQuotas(rounds: number): Record<SoireeHeat, number> {
  const base = Math.floor(rounds / 3)
  const extra = rounds - base * 3
  return { 1: base, 2: base + (extra >= 1 ? 1 : 0), 3: base + (extra >= 2 ? 1 : 0) }
}

export function isSoireeLength(value: unknown): value is SoireeLength {
  return typeof value === 'string' && (SOIREE_LENGTHS as readonly string[]).includes(value)
}

/**
 * Compose un programme : des jeux tirés au sort parmi ceux rangés dans
 * l'ambiance (vibesOf : le réglage de l'équipe, sinon ce que leur niveau
 * « Fait boire » permet), sans doublon, rangés de la chauffe au plus intense.
 * Quand l'ambiance manque de jeux rangés (petite bande, jeux cachés, cases
 * décochées), on complète avec les autres jeux jouables plutôt que de raccourcir
 * la soirée ; à moins de jeux jouables que de manches, le programme est plus
 * court. Les jeux cachés par l'équipe (`hiddenIds`) ne sont jamais tirés, ni ceux qu'elle a sortis
 * de la soirée (`soireeIds` : la liste réglée, ajouts compris).
 */
export function buildProgram(options: {
  rounds: number
  vibe: SoireeVibe
  playerCount: number
  hiddenIds?: readonly string[]
  rng?: Rng
  /** Intensité d'un jeu : le niveau « Fait boire » réglé par l'équipe (useGameDrinkLevel), sinon celui du code. */
  heatOf?: (gameId: string) => SoireeHeat
  /** Ambiances où un jeu peut être tiré (useGameVibes) ; par défaut, celles de son niveau « Fait boire ». */
  vibesOf?: (gameId: string) => readonly SoireeVibe[]
  /** Les jeux de la soirée tels que l'équipe les a réglés (useSoireeGameIds) ; par défaut, ceux du code. */
  soireeIds?: readonly string[]
}): string[] {
  const rng = options.rng ?? Math.random
  const heatOf = options.heatOf ?? soireeHeat
  const vibesOf = options.vibesOf ?? ((id: string) => defaultVibesForLevel(heatOf(id)))
  const pool = playableSoireeGameIds(options.playerCount, options.hiddenIds, options.soireeIds ?? SOIREE_GAME_IDS)
  const ranged = pool.filter((id) => vibesOf(id).includes(options.vibe))
  const wanted = Math.max(0, Math.min(pool.length, options.rounds))

  const picked: string[] = []
  if (options.vibe === 'monte') {
    const quotas = monteQuotas(wanted)
    for (const heat of HEATS) {
      picked.push(...drawWeighted(ranged.filter((id) => heatOf(id) === heat), quotas[heat], () => 1, rng))
    }
    // Un niveau sans assez de jeux rangés : ses manches vont aux autres niveaux de l'ambiance avant d'en sortir.
    if (picked.length < wanted) {
      picked.push(...drawWeighted(ranged.filter((id) => !picked.includes(id)), wanted - picked.length, () => 1, rng))
    }
  } else {
    const weights = VIBE_WEIGHTS[options.vibe]
    picked.push(...drawWeighted(ranged, wanted, (id) => weights[heatOf(id)], rng))
  }
  if (picked.length < wanted) {
    picked.push(...drawWeighted(pool.filter((id) => !picked.includes(id)), wanted - picked.length, () => 1, rng))
  }

  return picked
    .map((id) => ({ id, key: heatOf(id) + rng() * 0.9 }))
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

/** Ajoute un jeu en fin de programme, dans la limite de `max` manches (SOIREE_MAX_ROUNDS par défaut). */
export function addRound(program: readonly string[], gameId: string, max: number = SOIREE_MAX_ROUNDS): string[] {
  if (program.length >= max) return program.slice()
  return [...program, gameId]
}

export function programMinutes(program: readonly string[]): number {
  return program.reduce((sum, id) => sum + soireeMinutes(id), 0)
}

/** Intensité de chaque manche, pour la courbe du programme. */
export function programHeat(program: readonly string[], heatOf: (gameId: string) => SoireeHeat = soireeHeat): SoireeHeat[] {
  return program.map((id) => heatOf(id))
}
