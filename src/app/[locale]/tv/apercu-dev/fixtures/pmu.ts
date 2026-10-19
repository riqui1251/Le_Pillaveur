import type { PmuCastFrame, PmuCastState } from '@/lib/cast-types'
import fr from '../../../../../../messages/fr.json'
import { castRoom, PREVIEW_NAMES, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/**
 * Course PMU (jeu LOCAL diffusé) : pas de moteur séparé, la course vit dans
 * `games/pmu/components/game.tsx`. Ces états reprennent sa simulation (mêmes
 * pas, vitesses et accélérations, tirées d'une graine) et la forme exacte de
 * son `buildCastState`, pour que l'aperçu reçoive ce qu'un téléphone pousserait.
 */

const FINISH = 100

const HORSE_DEFS = [
  { key: 'tonnerre', emoji: '🔴', colorFrom: '#ef4444', colorTo: '#f97316' },
  { key: 'eclair', emoji: '🔵', colorFrom: '#3b82f6', colorTo: '#6366f1' },
  { key: 'tempete', emoji: '🟢', colorFrom: '#10b981', colorTo: '#14b8a6' },
  { key: 'ouragan', emoji: '🟡', colorFrom: '#f59e0b', colorTo: '#eab308' },
] as const

type HorseKey = (typeof HORSE_DEFS)[number]['key']
type Mode = 'libre' | 'paris'

const LONG_NAMES = [
  'Jean-Baptiste',
  'Marie-Charlotte',
  'Maxime-Alexandre',
  'Anne-Sophie',
  'Pierre-Emmanuel',
  'Marie-Antoinette',
  'Charles-Henri',
  'Sofiane',
  'Camille',
  'Inès',
  'Thomas',
  'Zoé',
  'Hugo',
  'Nora',
  'Bastien',
  'Léa',
  'Jean-Philippe',
  'Marie-Laure',
  'Paul-Henri',
  'Louise',
  'Gaspard',
  'Margaux',
] as const

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Même course que `startRace` (tick de 50 ms) ; rend les positions à chaque tick jusqu'au vainqueur. */
function simulateRace(seed: number): { ticks: Record<HorseKey, number>[]; winner: HorseKey } {
  const rnd = mulberry32(seed)
  const targetWinnerMs = 15000 + rnd() * 20000
  const baseTicks = (targetWinnerMs / 50) * 1.09
  const baseStep = (FINISH / baseTicks) * 2
  let speed = HORSE_DEFS.map(() => 0.85 + rnd() * 0.3)
  let accel = HORSE_DEFS.map(() => 0)
  let pos = HORSE_DEFS.map(() => 0)
  const ticks: Record<HorseKey, number>[] = []
  for (let guard = 0; guard < 10_000; guard += 1) {
    accel = accel.map((a) => Math.max(-0.25, Math.min(0.25, a + (rnd() - 0.5) * 0.05)))
    speed = speed.map((f, i) => Math.max(0.3, Math.min(1.9, f + accel[i])))
    pos = pos.map((p, i) => p + rnd() * baseStep * speed[i])
    ticks.push(Object.fromEntries(HORSE_DEFS.map((h, i) => [h.key, pos[i]])) as Record<HorseKey, number>)
    const w = HORSE_DEFS.findIndex((_, i) => pos[i] >= FINISH)
    if (w !== -1) return { ticks, winner: HORSE_DEFS[w].key }
  }
  throw new Error(`Course PMU sans vainqueur (graine ${seed})`)
}

type Table = {
  mode: Mode
  /** Parieurs par cheval (ordre de HORSE_DEFS). */
  riders: Record<HorseKey, string[]>
  /** Mises (mode paris), par nom ; 2 par défaut comme sur le téléphone. */
  bets?: Record<string, number>
}

function castState(
  table: Table,
  opts: {
    phase: PmuCastState['phase']
    stage?: PmuCastState['stage']
    race: number
    positions?: Record<HorseKey, number>
    winner?: HorseKey | null
    distSips?: number | null
    targets?: Record<string, string>
  }
): PmuCastState {
  const betOf = (name: string) => table.bets?.[name] ?? 2
  const winner = opts.winner ?? null
  const parisEnd = table.mode === 'paris' && winner != null && opts.phase === 'finished'
  return {
    castKind: 'pmu',
    phase: opts.phase,
    finish: FINISH,
    horses: HORSE_DEFS.map((h) => ({
      key: h.key,
      name: fr.games.pmu.horses[h.key],
      emoji: h.emoji,
      colorFrom: h.colorFrom,
      colorTo: h.colorTo,
      players: table.riders[h.key],
      position: Math.min(opts.positions?.[h.key] ?? 0, FINISH),
      ...(table.mode === 'paris' && opts.stage !== 'setup' ? { bets: table.riders[h.key].map(betOf) } : {}),
    })),
    winnerKey: winner,
    mode: table.mode,
    stage: opts.stage,
    race: opts.race,
    distSips: table.mode === 'libre' && opts.stage === 'results' ? (opts.distSips ?? null) : null,
    payouts: parisEnd
      ? table.riders[winner].map((name) => ({ name, sips: betOf(name) * 2, target: opts.targets?.[name] ?? null }))
      : [],
    ...(parisEnd ? { noTargets: HORSE_DEFS.every((h) => h.key === winner || table.riders[h.key].length === 0) } : {}),
  }
}

function frameAt(positions: Record<HorseKey, number>, race: number): PmuCastFrame {
  return {
    positions: Object.fromEntries(Object.entries(positions).map(([k, v]) => [k, Math.min(v, FINISH)])),
    race,
  }
}

/**
 * Partie complète, telle qu'une TV la voit : la diffusion ne démarre que sur
 * l'écran de course, donc l'attente (assignation, paris) n'existe qu'après une
 * revanche — course 1 finie (sa dernière trame encore en mémoire), course 2 à venir.
 */
function fullGame(table: Table, seed: number, extra: { distSips?: number; targets?: Record<string, string> } = {}): TvPreviewStep[] {
  const race = 2
  const { ticks, winner } = simulateRace(seed)
  const last = ticks[ticks.length - 1]
  const at = (f: number) => ticks[Math.min(ticks.length - 1, Math.floor((ticks.length - 1) * f))]
  const previous = frameAt(simulateRace(seed + 101).ticks.at(-1)!, race - 1)
  const steps: TvPreviewStep[] = [
    {
      label: 'attente (assignation, après revanche)',
      room: castRoom(castState(table, { phase: 'waiting', stage: 'setup', race: race - 1 })),
      frame: previous,
    },
  ]
  if (table.mode === 'paris') {
    steps.push({
      label: 'paris',
      room: castRoom(castState(table, { phase: 'waiting', stage: 'betting', race: race - 1 })),
      frame: previous,
    })
  }
  const racing = castRoom(castState(table, { phase: 'racing', race }))
  steps.push(
    { label: 'départ (sans trame)', room: racing, frame: null },
    { label: 'course 35 %', room: racing, frame: frameAt(at(0.35), race) },
    { label: 'course 80 %', room: racing, frame: frameAt(at(0.8), race) },
    { label: 'avant l’arrivée', room: racing, frame: frameAt(at(0.97), race) }
  )
  const others = HORSE_DEFS.filter((h) => h.key !== winner).flatMap((h) => table.riders[h.key])
  const targets =
    extra.targets ??
    Object.fromEntries(
      others.length === 0 ? [] : table.riders[winner].map((name, i) => [name, others[i % others.length]])
    )
  if (table.mode === 'paris') {
    steps.push({
      label: 'distribution (cibles pas encore choisies)',
      room: castRoom(castState(table, { phase: 'finished', stage: 'payout', race, positions: last, winner })),
      frame: frameAt(last, race),
    })
    const first = table.riders[winner][0]
    if (first && targets[first]) {
      steps.push({
        label: 'distribution (une cible choisie)',
        room: castRoom(
          castState(table, { phase: 'finished', stage: 'payout', race, positions: last, winner, targets: { [first]: targets[first] } })
        ),
        frame: frameAt(last, race),
      })
    }
  }
  steps.push({
    label: 'résultats',
    room: castRoom(
      castState(table, { phase: 'finished', stage: 'results', race, positions: last, winner, distSips: extra.distSips, targets })
    ),
    frame: frameAt(last, race),
  })
  return steps
}

/** Graine dont la course est gagnée par `want` (pour placer la grosse tablée sur le vainqueur). */
function seedWinning(want: HorseKey, from = 1): number {
  for (let s = from; s < from + 500; s += 1) if (simulateRace(s).winner === want) return s
  throw new Error(`Aucune graine ne fait gagner ${want}`)
}

export function build(): TvPreviewFixture[] {
  const twelve = LONG_NAMES.slice(0, 12)
  const paris12: Table = {
    mode: 'paris',
    riders: {
      tonnerre: [twelve[0], twelve[7], twelve[8]],
      eclair: [twelve[1], twelve[9], twelve[10]],
      tempete: [twelve[2], twelve[3], twelve[11]],
      ouragan: [twelve[4], twelve[5], twelve[6]],
    },
    bets: Object.fromEntries(twelve.map((n, i) => [n, 1 + ((i * 3) % 8)])),
  }

  const sixteen = LONG_NAMES.slice(0, 16)
  const crowdWinner: HorseKey = 'eclair'
  const paris16: Table = {
    mode: 'paris',
    riders: {
      tonnerre: [sixteen[10], sixteen[11]],
      eclair: sixteen.slice(0, 10),
      tempete: [sixteen[12], sixteen[13]],
      ouragan: [sixteen[14], sixteen[15]],
    },
    bets: Object.fromEntries(sixteen.map((n, i) => [n, 2 + (i % 5)])),
  }

  const libre3: Table = {
    mode: 'libre',
    riders: { tonnerre: [PREVIEW_NAMES[0]], eclair: [], tempete: [PREVIEW_NAMES[1]], ouragan: [PREVIEW_NAMES[2]] },
  }

  const paris5Empty: Table = {
    mode: 'paris',
    riders: {
      tonnerre: [LONG_NAMES[0], LONG_NAMES[7]],
      eclair: [LONG_NAMES[1]],
      tempete: [LONG_NAMES[2], LONG_NAMES[8]],
      ouragan: [],
    },
    bets: { [LONG_NAMES[0]]: 3, [LONG_NAMES[7]]: 5 },
  }

  const allOnOne: Table = {
    mode: 'paris',
    riders: { tonnerre: [], eclair: [], tempete: [...PREVIEW_NAMES.slice(0, 3)], ouragan: [] },
    bets: { [PREVIEW_NAMES[0]]: 4 },
  }

  const twentyTwo = [...LONG_NAMES]
  const paris22: Table = {
    mode: 'paris',
    riders: { tonnerre: twentyTwo.slice(0, 20), eclair: [twentyTwo[20]], tempete: [twentyTwo[21]], ouragan: [] },
    bets: Object.fromEntries(twentyTwo.map((n, i) => [n, 1 + (i % 9)])),
  }

  const libre2: Table = {
    mode: 'libre',
    riders: { tonnerre: [PREVIEW_NAMES[0]], eclair: [], tempete: [PREVIEW_NAMES[1]], ouragan: [] },
  }

  const replay = castState(paris12, { phase: 'racing', race: 2 })
  const stale = simulateRace(7).ticks.at(-1)!

  const legacy: PmuCastState = {
    castKind: 'pmu',
    phase: 'finished',
    finish: FINISH,
    horses: HORSE_DEFS.map((h, i) => ({
      key: h.key,
      name: fr.games.pmu.horses[h.key],
      emoji: h.emoji,
      colorFrom: h.colorFrom,
      colorTo: h.colorTo,
      players: [PREVIEW_NAMES[i]],
      position: [100, 88, 93, 71][i],
    })),
    winnerKey: 'tonnerre',
  }

  return [
    { id: 'paris-12', label: 'Paris, 12 joueurs aux noms longs (partie complète)', steps: fullGame(paris12, 7) },
    {
      id: 'paris-16-foule',
      label: 'Paris, 16 joueurs dont 10 sur le cheval gagnant',
      steps: fullGame(paris16, seedWinning(crowdWinner)),
    },
    { id: 'libre-3', label: 'Libre, 3 joueurs (un cheval sans parieur)', steps: fullGame(libre3, 3, { distSips: 6 }) },
    {
      id: 'paris-22-gagnants',
      label: 'Paris, 22 joueurs dont 20 sur le cheval gagnant',
      steps: fullGame(paris22, seedWinning('tonnerre')),
    },
    {
      id: 'paris-gagnant-sans-parieur',
      label: 'Paris, le cheval gagnant n’a aucun parieur',
      steps: fullGame(paris5Empty, seedWinning('ouragan')),
    },
    {
      id: 'paris-tous-gagnants',
      label: 'Paris, tous les joueurs sur le cheval gagnant',
      steps: fullGame(allOnOne, seedWinning('tempete')),
    },
    {
      id: 'libre-gagnant-sans-parieur',
      label: 'Libre, le cheval gagnant n’a aucun parieur',
      steps: fullGame(libre2, seedWinning('eclair'), { distSips: 4 }),
    },
    {
      id: 'rejouer-trame-perimee',
      label: 'Revanche : trame de la course précédente encore en mémoire',
      steps: [{ label: 'départ course 2, trame course 1', room: castRoom(replay), frame: frameAt(stale, 1) }],
    },
    {
      id: 'ancien-payload',
      label: 'Payload sans les champs optionnels (téléphone pas à jour)',
      steps: [{ label: 'fin', room: castRoom(legacy) }],
    },
  ]
}
