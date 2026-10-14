import type { SpecialPinType } from '@/lib/plinko-pins'
import { ballCategory, emptyScoringEffects, type BallColor, type ScoringEffects } from './plinko-scoring'

export interface LivePinHit {
  type: SpecialPinType
  /** Pour `mystery` : l'effet réellement appliqué, `null` si le tirage n'a rien fait. */
  resolved?: SpecialPinType | null
  doubled: boolean
  /** Pion touché sans rien faire (ex. « + balle » déjà utilisé par cette balle ce tour). */
  inert?: boolean
}

export interface LiveBall {
  id: string
  isMain: boolean
  category: BallColor
  effects: ScoringEffects
  hits: LivePinHit[]
  landed: boolean
  slot: number | null
  finalSips: number | null
  /** Valeur de la case au moment de l'arrivée (un mélange ultérieur ne la change plus). */
  landedBase: number | null
}

export interface LiveBalls {
  red: LiveBall
  green: LiveBall
  extras: LiveBall[]
}

export interface LiveBallSource {
  id: string
  color: BallColor
  effects: ScoringEffects
}

function newLiveBall(id: string, isMain: boolean, category: BallColor): LiveBall {
  return { id, isMain, category, effects: emptyScoringEffects(), hits: [], landed: false, slot: null, finalSips: null, landedBase: null }
}

export function createLiveBalls(): LiveBalls {
  return { red: newLiveBall('red', true, 'red'), green: newLiveBall('green', true, 'green'), extras: [] }
}

export function snapshotEffects(effects: ScoringEffects): ScoringEffects {
  return {
    multiplierCount: effects.multiplierCount,
    sipsToAdd: effects.sipsToAdd,
    sipsToSubtract: effects.sipsToSubtract,
    effectsReset: effects.effectsReset,
    jackpotHit: effects.jackpotHit,
    scoreSwap: effects.scoreSwap,
  }
}

function isMainId(id: string): id is 'red' | 'green' {
  return id === 'red' || id === 'green'
}

function withBall(live: LiveBalls, ball: LiveBallSource, change: (entry: LiveBall) => Partial<LiveBall>): LiveBalls {
  const isMain = isMainId(ball.id)
  const update = (entry: LiveBall): LiveBall => ({
    ...entry,
    category: ballCategory(ball, isMain),
    effects: snapshotEffects(ball.effects),
    ...change(entry),
  })
  if (isMainId(ball.id)) return { ...live, [ball.id]: update(live[ball.id]) }
  const index = live.extras.findIndex((e) => e.id === ball.id)
  if (index === -1) {
    return { ...live, extras: [...live.extras, update(newLiveBall(ball.id, false, ball.color))] }
  }
  return { ...live, extras: live.extras.map((e, i) => (i === index ? update(e) : e)) }
}

export function withHit(live: LiveBalls, ball: LiveBallSource, hit: LivePinHit): LiveBalls {
  return withBall(live, ball, (entry) => ({ hits: [...entry.hits, hit] }))
}

/** Balles supplémentaires nées pendant l'image : visibles dès leur création, avec les effets hérités de leur mère. */
export function withSpawn(live: LiveBalls, balls: LiveBallSource[]): LiveBalls {
  return balls.reduce(
    (acc, ball) => (isMainId(ball.id) || acc.extras.some((e) => e.id === ball.id) ? acc : withBall(acc, ball, () => ({}))),
    live,
  )
}

export function withLanding(live: LiveBalls, ball: LiveBallSource, slot: number, finalSips: number, landedBase: number): LiveBalls {
  return withBall(live, ball, () => ({ landed: true, slot, finalSips, landedBase }))
}

/** Balles dont les gorgées iront à `category`, principales d'abord. */
export function ballsInCategory(live: LiveBalls, category: BallColor): LiveBall[] {
  return [live.red, live.green, ...live.extras].filter((b) => b.category === category)
}

export type ModifierToken =
  | { kind: 'cancelled' }
  | { kind: 'jackpot'; value: number }
  | { kind: 'multiplier'; factor: number }
  | { kind: 'add'; n: number }
  | { kind: 'subtract'; n: number }
  | { kind: 'swapped' }

/** Modificateurs en cours, dans l'ordre où calculateFinalSips les applique. */
export function modifierSummary(effects: ScoringEffects, isCumulativeMode: boolean, isMain: boolean, jackpotValue: number): ModifierToken[] {
  const tokens: ModifierToken[] = []
  if (effects.effectsReset) {
    tokens.push({ kind: 'cancelled' })
  } else if (effects.jackpotHit) {
    tokens.push({ kind: 'jackpot', value: jackpotValue })
  } else {
    if (effects.multiplierCount > 0) {
      tokens.push({ kind: 'multiplier', factor: isCumulativeMode ? Math.pow(2, effects.multiplierCount) : 2 })
    }
    if (effects.sipsToAdd > 0) tokens.push({ kind: 'add', n: effects.sipsToAdd })
    if (effects.sipsToSubtract > 0) tokens.push({ kind: 'subtract', n: effects.sipsToSubtract })
  }
  if (isMain && effects.scoreSwap) tokens.push({ kind: 'swapped' })
  return tokens
}
