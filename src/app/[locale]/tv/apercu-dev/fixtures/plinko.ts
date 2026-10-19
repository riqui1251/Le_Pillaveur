import type { PlinkoCastFrame, PlinkoCastState } from '@/lib/cast-types'
import type { SpecialPinType } from '@/lib/plinko-pins'
import {
  applyScoreEffect,
  calculateFinalSips,
  emptyScoringEffects,
  isScoreEffectType,
  tallyTurn,
  type BallColor,
  type ScoringEffects,
} from '@/app/[locale]/games/plinko/plinko-scoring'
import {
  createLiveBalls,
  snapshotEffects,
  withHit,
  withLanding,
  withSpawn,
  type LiveBalls,
  type LivePinHit,
} from '@/app/[locale]/games/plinko/plinko-live'
import { castRoom, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/** Grande tablée : beaucoup de noms longs, pour éprouver les troncatures. */
const LONG_NAMES = [
  'Jean-Baptiste',
  'Léa',
  'Marie-Charlotte',
  'Maxime-Alexandre',
  'Sofiane',
  'Anne-Sophie',
  'Pierre-Emmanuel',
  'Camille',
  'Thomas',
  'Zoé',
  'Inès',
  'Hugo',
]
const FEW_NAMES = ['Léa', 'Jean-Baptiste', 'Nora']

type Board = PlinkoCastState['board']
type Turn = { redSips: number; greenSips: number; powerups: SpecialPinType[] }

/** Même construction que le plateau du téléphone (rangées régulières, pions espacés), en déterministe. */
function makeBoard(seed: number, specials: SpecialPinType[], slots: number[]): Board {
  const pinsPerRow = [7, 8, 10, 9, 11, 12, 9, 10]
  const rows = pinsPerRow.length
  const normalPins: { x: number; y: number }[] = []
  pinsPerRow.forEach((count, row) => {
    const y = (row + 1) * (100 / (rows + 1))
    const spacing = 100 / (count + 1)
    for (let i = 0; i < count; i++) normalPins.push({ x: spacing * (i + 1), y })
  })
  const specialPins = specials.map((type, i) => {
    const pin = normalPins[(seed + i * 7) % normalPins.length]
    return { x: pin.x, y: pin.y, type }
  })
  return { normalPins, specialPins, slots }
}

const BOARD_A = makeBoard(
  3,
  ['multiplier', 'addSip', 'colorSwap', 'mystery', 'subtractSip', 'magnetLeft', 'doubleEffect', 'gravityFlip', 'addBall', 'jackpot', 'shake', 'scoreSwap', 'slowMotion', 'roundDrinks', 'magnetRight', 'split', 'teleportation', 'cancellation', 'multiplier', 'addSip'],
  [3, 1, 2, 4, 1, 2, 3, 1, 4, 2],
)
const BOARD_B = makeBoard(5, ['addSip', 'multiplier', 'magnetRight', 'mystery', 'subtractSip', 'colorSwap', 'gravityFlip', 'addBall', 'jackpot', 'slowMotion', 'shake', 'cancellation'], [2, 3, 1, 1, 3, 2, 2, 1, 3, 1])

/** Tours déjà joués (une manche = un lancer par joueur). */
const PAST_TURNS: Turn[] = [
  { redSips: 4, greenSips: 2, powerups: ['multiplier', 'addSip'] },
  { redSips: 1, greenSips: 7, powerups: ['jackpot'] },
  { redSips: 3, greenSips: 3, powerups: [] },
  { redSips: 0, greenSips: 5, powerups: ['subtractSip', 'magnetLeft', 'addSip'] },
  { redSips: 6, greenSips: 1, powerups: ['colorSwap', 'multiplier', 'multiplier', 'roundDrinks'] },
  { redSips: 2, greenSips: 2, powerups: ['gravityFlip'] },
  { redSips: 8, greenSips: 0, powerups: ['doubleEffect', 'addSip', 'addSip', 'scoreSwap'] },
  { redSips: 2, greenSips: 4, powerups: ['mystery', 'addBall', 'shake', 'teleportation', 'gravityFlip', 'split'] },
  { redSips: 1, greenSips: 3, powerups: [] },
  { redSips: 5, greenSips: 2, powerups: ['split', 'teleportation'] },
  { redSips: 3, greenSips: 6, powerups: ['shake', 'slowMotion', 'magnetRight'] },
  { redSips: 4, greenSips: 4, powerups: ['cancellation'] },
]

function scoreboard(names: string[], turnsByPlayer: Turn[][]): PlinkoCastState['scoreboard'] {
  return names.map((name, i) => {
    const turns = turnsByPlayer[i] ?? []
    return {
      name,
      totalRed: turns.reduce((s, r) => s + r.redSips, 0),
      totalGreen: turns.reduce((s, r) => s + r.greenSips, 0),
      turns,
    }
  })
}

/** `played` premiers joueurs ayant déjà lancé. */
function playedTurns(names: string[], played: number): Turn[][] {
  return names.map((_, i) => (i < played ? [PAST_TURNS[i % PAST_TURNS.length]] : []))
}

function castState(names: string[], over: Partial<PlinkoCastState> & { turns: Turn[][]; current: number }): PlinkoCastState {
  const { turns, current, ...rest } = over
  return {
    castKind: 'plinko',
    phase: 'ready',
    currentPlayerName: names[current] ?? null,
    currentPlayerIndex: current,
    board: BOARD_A,
    lastDrop: null,
    scoreboard: scoreboard(names, turns),
    roundDrinks: 0,
    cumulative: false,
    live: null,
    extraSlot: null,
    results: null,
    ...rest,
  }
}

function step(label: string, state: PlinkoCastState, frame: PlinkoCastFrame | null = null): TvPreviewStep {
  return { label, room: castRoom(state), frame }
}

/** Balle simulée comme dans la boucle du téléphone : les pions de score mutent ses effets. */
type SimBall = { id: string; color: BallColor; effects: ScoringEffects }

function simBall(id: string, color: BallColor, effects: ScoringEffects = emptyScoringEffects()): SimBall {
  return { id, color, effects: { ...effects } }
}

function source(b: SimBall) {
  return { id: b.id, color: b.color, effects: snapshotEffects(b.effects) }
}

function hit(live: LiveBalls, ball: SimBall, type: SpecialPinType, extra: Partial<LivePinHit> = {}): LiveBalls {
  const applied = extra.resolved ?? type
  if (applied && isScoreEffectType(applied)) applyScoreEffect(ball, applied)
  return withHit(live, source(ball), { type, doubled: false, ...extra })
}

function land(live: LiveBalls, ball: SimBall, slot: number, slots: number[], cumulative: boolean): { live: LiveBalls; sips: number } {
  const base = slots[slot] ?? 0
  const sips = calculateFinalSips(base, ball.effects, cumulative)
  return { live: withLanding(live, source(ball), slot, sips, base), sips }
}

function frameOf(balls: { x: number; y: number; color: BallColor }[]): PlinkoCastFrame {
  return { balls }
}

/** Un lancer complet, étape par étape, du joueur `current` (les précédents ont déjà joué). */
function dropSequence(names: string[], current: number, label: string): TvPreviewStep[] {
  const slots = BOARD_A.slots
  const cumulative = false
  const turns = playedTurns(names, current)
  const base = { turns, current }
  const red = simBall('red', 'red')
  const green = simBall('green', 'green')

  const steps: TvPreviewStep[] = [step(`${label} — prêt à lancer`, castState(names, base))]

  let live = createLiveBalls()
  steps.push(step('lâcher (aucun effet encore)', castState(names, { ...base, phase: 'dropping', live }), frameOf([
    { x: 48, y: 4, color: 'red' },
    { x: 53, y: 4, color: 'green' },
  ])))

  live = hit(live, red, 'multiplier')
  live = hit(live, green, 'magnetLeft')
  steps.push(step('premiers pions (×2, aimant)', castState(names, { ...base, phase: 'dropping', live }), frameOf([
    { x: 40, y: 24, color: 'red' },
    { x: 58, y: 22, color: 'green' },
  ])))

  live = hit(live, red, 'doubleEffect')
  applyScoreEffect(red, 'addSip')
  live = hit(live, red, 'addSip', { doubled: true })
  live = hit(live, green, 'mystery', { resolved: 'addBall' })
  const extra = simBall('extra-1', 'green')
  live = withSpawn(live, [source(extra)])
  live = hit(live, green, 'colorSwap')
  steps.push(step('mystère → balle bonus, changement de couleur', castState(names, { ...base, phase: 'dropping', live }), frameOf([
    { x: 33, y: 47, color: 'red' },
    { x: 62, y: 44, color: 'red' },
    { x: 55, y: 30, color: 'green' },
  ])))

  live = hit(live, extra, 'subtractSip')
  live = hit(live, green, 'scoreSwap')
  const redLanding = land(live, red, 3, slots, cumulative)
  live = redLanding.live
  steps.push(step('rouge arrivée, la verte compte inversé', castState(names, { ...base, phase: 'dropping', live }), frameOf([
    { x: 70, y: 74, color: 'red' },
    { x: 49, y: 63, color: 'green' },
  ])))

  const greenLanding = land(live, green, 7, slots, cumulative)
  live = greenLanding.live
  const extraLanding = land(live, extra, 5, slots, cumulative)
  live = extraLanding.live
  steps.push(step('toutes les balles arrivées', castState(names, { ...base, phase: 'dropping', live, extraSlot: 5 }), frameOf([])))

  const totals = tallyTurn(
    { color: red.color, effects: red.effects, finalSipResult: redLanding.sips },
    { color: green.color, effects: green.effects, finalSipResult: greenLanding.sips },
    [{ color: extra.color, effects: extra.effects, finalSipResult: extraLanding.sips }],
  )
  const turn: Turn = { ...totals, powerups: ['multiplier', 'magnetLeft', 'doubleEffect', 'addSip', 'mystery', 'colorSwap', 'subtractSip', 'scoreSwap'] }
  const afterTurns = turns.map((tt, i) => (i === current ? [turn] : tt))
  const next = Math.min(names.length - 1, current + 1)
  steps.push(step('résultat (1,5 s sur le téléphone)', castState(names, {
    turns: afterTurns,
    current: next,
    phase: 'result',
    live,
    extraSlot: 5,
    lastDrop: { playerName: names[current], redSlot: 3, greenSlot: 7, redSips: totals.redSips, greenSips: totals.greenSips },
  })))
  steps.push(step('joueur suivant, nouveau plateau', castState(names, { turns: afterTurns, current: next, board: BOARD_B })))
  return steps
}

/**
 * Pire cas en hauteur et en largeur du panneau : balles bonus des deux côtés (dont deux
 * vertes, arrivées dans l'ordre inverse de leur création), rouge ×2 · +1 · compte inversé,
 * puis résultat avec tournée générale.
 */
function crowdedSequence(names: string[], current: number): TvPreviewStep[] {
  const slots = BOARD_A.slots
  const cumulative = false
  const turns = playedTurns(names, current)
  const base = { turns, current, roundDrinks: 2 }
  const red = simBall('red', 'red')
  const green = simBall('green', 'green')

  let live = createLiveBalls()
  live = hit(live, red, 'multiplier')
  live = hit(live, red, 'addSip')
  live = hit(live, red, 'mystery', { resolved: 'addBall' })
  const extraRed = simBall('extra-1', 'red', red.effects)
  live = withSpawn(live, [source(extraRed)])
  live = hit(live, green, 'addBall')
  const extraGreenA = simBall('extra-2', 'green', green.effects)
  live = withSpawn(live, [source(extraGreenA)])
  live = hit(live, green, 'subtractSip')
  live = hit(live, extraGreenA, 'addBall')
  const extraGreenB = simBall('extra-3', 'green', extraGreenA.effects)
  live = withSpawn(live, [source(extraGreenB)])
  live = hit(live, extraRed, 'addSip')
  live = hit(live, extraGreenB, 'multiplier')
  live = hit(live, red, 'scoreSwap')

  const redLanding = land(live, red, 2, slots, cumulative)
  live = redLanding.live
  const greenALanding = land(live, extraGreenA, 8, slots, cumulative)
  live = greenALanding.live
  const greenBLanding = land(live, extraGreenB, 4, slots, cumulative)
  live = greenBLanding.live
  const greenLanding = land(live, green, 6, slots, cumulative)
  live = greenLanding.live
  const dropping = step(
    'chute : balles bonus des deux côtés, la 1re créée arrive en dernier (case dorée = sa case)',
    castState(names, { ...base, phase: 'dropping', live, extraSlot: 4 }),
    frameOf([{ x: 12, y: 86, color: 'red' }]),
  )
  const extraRedLanding = land(live, extraRed, 1, slots, cumulative)
  live = extraRedLanding.live
  const landed = step(
    'toutes arrivées : case dorée = la dernière balle bonus arrivée (case 2)',
    castState(names, { ...base, phase: 'dropping', live, extraSlot: 1 }),
    frameOf([]),
  )

  const totals = tallyTurn(
    { color: red.color, effects: red.effects, finalSipResult: redLanding.sips },
    { color: green.color, effects: green.effects, finalSipResult: greenLanding.sips },
    [
      { color: extraRed.color, effects: extraRed.effects, finalSipResult: extraRedLanding.sips },
      { color: extraGreenA.color, effects: extraGreenA.effects, finalSipResult: greenALanding.sips },
      { color: extraGreenB.color, effects: extraGreenB.effects, finalSipResult: greenBLanding.sips },
    ],
  )
  const turn: Turn = { ...totals, powerups: ['multiplier', 'addSip', 'mystery', 'addBall', 'subtractSip', 'addBall', 'addSip', 'multiplier', 'scoreSwap'] }
  const afterTurns = turns.map((tt, i) => (i === current ? [turn] : tt))
  const next = Math.min(names.length - 1, current + 1)
  const result = step('résultat + tournée générale + balles bonus des deux côtés', castState(names, {
    turns: afterTurns,
    current: next,
    roundDrinks: 2,
    phase: 'result',
    live,
    extraSlot: 1,
    lastDrop: { playerName: names[current], redSlot: 2, greenSlot: 6, redSips: totals.redSips, greenSips: totals.greenSips },
  }))
  return [dropping, landed, result]
}

function finishedSteps(names: string[], roundDrinks: number): TvPreviewStep[] {
  const turns = playedTurns(names, names.length)
  const finished = (results: PlinkoCastState['results']) =>
    castState(names, { turns, current: names.length - 1, phase: 'finished', roundDrinks, results })
  const steps: TvPreviewStep[] = []
  if (roundDrinks > 0) steps.push(step('tournées générales', finished({ phase: 'tournees', playerIndex: 0 })))
  steps.push(step('détail : 1er joueur', finished({ phase: 'details', playerIndex: 0 })))
  const longest = names.findIndex((n) => n === 'Marie-Charlotte' || n === 'Maxime-Alexandre')
  if (longest > 0) steps.push(step(`détail : ${names[longest]}`, finished({ phase: 'details', playerIndex: longest })))
  steps.push(step('détail : dernier joueur', finished({ phase: 'details', playerIndex: names.length - 1 })))
  steps.push(step('totaux', finished({ phase: 'final', playerIndex: names.length - 1 })))
  return steps
}

export function build(): TvPreviewFixture[] {
  const big = LONG_NAMES
  const few = FEW_NAMES
  return [
    { id: 'chute-12', label: '12 joueurs, noms longs : lancer complet de Marie-Charlotte', steps: dropSequence(big, 2, 'Marie-Charlotte') },
    { id: 'chute-3', label: '3 joueurs : lancer complet', steps: dropSequence(few, 1, 'Jean-Baptiste') },
    {
      id: 'charge-12',
      label: '12 joueurs : balles bonus des deux côtés, arrivées dans le désordre, résultat avec tournée (pire cas du panneau)',
      steps: crowdedSequence(big, 3),
    },
    {
      id: 'pret-12',
      label: '12 joueurs, milieu de partie, tournée générale',
      steps: [step('prêt', castState(big, { turns: playedTurns(big, 7), current: 7, roundDrinks: 1 }))],
    },
    { id: 'fin-12', label: '12 joueurs : tournées → détail → totaux', steps: finishedSteps(big, 2) },
    { id: 'fin-3', label: '3 joueurs sans tournée : détail → totaux', steps: finishedSteps(few, 0) },
    {
      id: 'ancien-telephone',
      label: 'Téléphone sans les champs récents (live, results, turns)',
      steps: [
        step('en chute', {
          castKind: 'plinko',
          phase: 'dropping',
          currentPlayerName: 'Marie-Charlotte',
          board: BOARD_A,
          lastDrop: null,
          scoreboard: big.slice(0, 6).map((name, i) => ({ name, totalRed: i < 2 ? 3 : 0, totalGreen: i < 2 ? 2 : 0 })),
          roundDrinks: 0,
        }, frameOf([{ x: 45, y: 40, color: 'red' }, { x: 60, y: 52, color: 'green' }])),
        step('fin', {
          castKind: 'plinko',
          phase: 'finished',
          currentPlayerName: null,
          board: BOARD_A,
          lastDrop: null,
          scoreboard: big.slice(0, 6).map((name, i) => ({ name, totalRed: i + 1, totalGreen: 6 - i })),
          roundDrinks: 1,
        }),
      ],
    },
  ]
}
