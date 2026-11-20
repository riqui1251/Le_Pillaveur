import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTabouState,
  reduceTabou,
  tabouRoundIsPlayable,
  TABOU_BOT_DESCRIBER_ROUND_MS,
  TABOU_COUNTDOWN_MS,
  TABOU_ROUND_MS,
  type TabouEntry,
  type TabouInitialPlayer,
  type TabouState,
} from './engine'
import { rejoinTabouPlayer } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
  { word: 'Vélo', taboo: ['roue', 'pédale', 'guidon', 'chaîne'], diff: 1 },
  { word: 'Noël', taboo: ['sapin', 'cadeau', 'décembre', 'père Noël'], diff: 1 },
]
const T0 = 1_000_000
/** Fin de la manche 1 puis « continuer » : la manche 2 s'ouvre à T1. */
const T1 = T0 + TABOU_ROUND_MS + 5_000

/** Joueurs pairs en équipe A, impairs en B : ordre de passage p0, p1, p2, p3… */
function table(n = 4, bots: string[] = []): TabouInitialPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    isBot: bots.includes(`p${i}`),
  }))
}

/** Manche 1 ouverte à T0 : p0 décrit. */
function describing(players = table()): TabouState {
  const raw = createTabouState(players, WORDS, 'seed-playable', T0 - TABOU_COUNTDOWN_MS, 20)
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const leave = (s: TabouState, playerId: string, at: number) => reduceTabou(s, { type: 'LEAVE', playerId, at })
const rejoin = (s: TabouState, playerId: string, now?: number) =>
  reduceTabou(s, { type: 'REJOIN', playerId, now })

/**
 * La manche 1 va à son terme, puis p0 lance la manche 2 (p1 décrit) à T1.
 * `atBilan` : ce qui se passe pendant le bilan, avant le « continuer ».
 */
function secondRound(s: TabouState, atBilan: (bilan: TabouState) => TabouState = (b) => b): TabouState {
  const ended = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + TABOU_ROUND_MS })
  const next = reduceTabou(atBilan(ended), { type: 'CONTINUE', playerId: 'p0', now: T1 })
  expect(next.describerId).toBe('p1')
  return next
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Tabou — décrivant de retour pendant sa manche écourtée', () => {
  it('sa manche repart entière : il ne lui restait que quelques secondes', () => {
    const short = secondRound(leave(describing(), 'p1', T0 + 10_000))
    expect(short.phaseEndsAt).toBe(T1 + TABOU_BOT_DESCRIBER_ROUND_MS)

    const s = rejoin(short, 'p1', T1 + 1_000)

    expect(s.phase).toBe('describing')
    expect(s.describerId).toBe('p1')
    expect(s.phaseEndsAt).toBe(T1 + 1_000 + TABOU_ROUND_MS)
    expect(s.phaseSeq).toBe(short.phaseSeq + 1)
    expect(s.currentWord).toEqual(short.currentWord)
    expect(s.round).toBe(short.round)
  })

  it('par la route de retour : même relance, à l’heure du serveur', () => {
    const short = secondRound(leave(describing(), 'p1', T0 + 10_000))
    vi.useFakeTimers()
    vi.setSystemTime(T1 + 2_000)

    const s = rejoinTabouPlayer(short, 'p1')

    expect(s?.phaseEndsAt).toBe(T1 + 2_000 + TABOU_ROUND_MS)
  })

  it('revenu alors que son seul coéquipier est parti : la manche reste écourtée', () => {
    let short = leave(describing(), 'p1', T0 + 10_000)
    short = secondRound(leave(short, 'p3', T0 + 11_000))

    const s = rejoin(short, 'p1', T1 + 1_000)

    expect(s.phaseEndsAt).toBe(T1 + TABOU_BOT_DESCRIBER_ROUND_MS)
    expect(s.phaseSeq).toBe(short.phaseSeq)
  })

  it('le retour d’un adversaire ne relance rien', () => {
    const short = secondRound(leave(describing(), 'p1', T0 + 10_000), (bilan) =>
      leave(bilan, 'p2', T0 + TABOU_ROUND_MS + 1_000)
    )

    const s = rejoin(short, 'p2', T1 + 1_000)

    expect(s.phaseEndsAt).toBe(T1 + TABOU_BOT_DESCRIBER_ROUND_MS)
  })

  it('un retour en manche pleine ne touche pas au chrono', () => {
    const full = leave(describing(), 'p3', T0 + 10_000)

    const s = rejoin(full, 'p3', T0 + 20_000)

    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS)
    expect(s.phaseSeq).toBe(full.phaseSeq)
  })
})

describe('Tabou — équipe sans coéquipier humain présent pour deviner', () => {
  it('manche écourtée dès son ouverture : personne ne peut cliquer « trouvé »', () => {
    const s = secondRound(leave(describing(), 'p3', T0 + 10_000))

    // p1 est là, mais son seul coéquipier est parti : 60 s à décrire dans le vide.
    expect(tabouRoundIsPlayable(s.players, 'p1')).toBe(false)
    expect(s.phaseEndsAt).toBe(T1 + TABOU_BOT_DESCRIBER_ROUND_MS)
  })

  it('le dernier coéquipier humain part en pleine manche : bilan immédiat, points gardés', () => {
    let s = describing()
    s = reduceTabou(s, { type: 'FOUND', playerId: 'p2', now: T0 + 5_000 })
    const word = s.currentWord

    s = leave(s, 'p2', T0 + 20_000)

    expect(s.phase).toBe('roundEnd')
    expect(s.scores).toEqual({ A: 1, B: 0 })
    expect(s.lastRoundWord).toEqual(word)
    expect(s.winnerTeam).toBeNull()
  })

  it('un coéquipier bot ne compte pas : il ne clique jamais « trouvé »', () => {
    // p2, seul coéquipier de p0, est un bot (joueur parti puis remplacé).
    const s = describing(table(4, ['p2']))

    expect(s.describerId).toBe('p0')
    expect(s.phaseEndsAt).toBe(T0 + TABOU_BOT_DESCRIBER_ROUND_MS)
  })

  it('à 3 contre 3, il reste un coéquipier : la manche continue', () => {
    const before = describing(table(6))

    const s = leave(before, 'p2', T0 + 10_000)

    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(before.phaseEndsAt)
    expect(tabouRoundIsPlayable(s.players, 'p0')).toBe(true)
  })

  it('le coéquipier revient pendant la manche écourtée : elle repart entière', () => {
    const short = secondRound(leave(describing(), 'p3', T0 + 10_000))

    const s = rejoin(short, 'p3', T1 + 2_000)

    expect(s.describerId).toBe('p1')
    expect(s.phaseEndsAt).toBe(T1 + 2_000 + TABOU_ROUND_MS)
    expect(s.phaseSeq).toBe(short.phaseSeq + 1)
  })

  it('manche déjà écourtée : un autre départ ne la coupe pas davantage', () => {
    const short = secondRound(leave(describing(), 'p3', T0 + 10_000))

    const s = leave(short, 'p2', T1 + 1_000)

    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(short.phaseEndsAt)
  })

  it('partie d’avant le correctif, manche pleine où personne ne peut deviner : le retour ne rajoute pas de temps', () => {
    const before = describing()
    // État tel que l'ancien moteur le laissait : coéquipier parti, 60 s qui courent.
    const legacy: TabouState = {
      ...before,
      players: before.players.map((p) => (p.id === 'p2' ? { ...p, leftAt: T0 + 5_000 } : p)),
    }

    const s = rejoin(legacy, 'p2', T0 + 20_000)

    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS)
  })
})

describe('Tabou — durée de manche mémorisée et garde-fous', () => {
  it('l’état porte la durée à l’ouverture de la manche, relance comprise', () => {
    expect(describing().roundMs).toBe(TABOU_ROUND_MS)

    const short = secondRound(leave(describing(), 'p1', T0 + 10_000))
    expect(short.roundMs).toBe(TABOU_BOT_DESCRIBER_ROUND_MS)
    expect(rejoin(short, 'p1', T1 + 1_000).roundMs).toBe(TABOU_ROUND_MS)
  })

  it('« trouvé » est refusé tant que personne ne décrit', () => {
    const short = secondRound(leave(describing(), 'p1', T0 + 10_000))

    // p3 est là, son décrivant non : des points sans un mot décrit.
    expect(() => reduceTabou(short, { type: 'FOUND', playerId: 'p3', now: T1 + 1_000 })).toThrow(
      'ROUND_NOT_PLAYABLE'
    )
    const back = rejoin(short, 'p1', T1 + 2_000)
    expect(reduceTabou(back, { type: 'FOUND', playerId: 'p3', now: T1 + 3_000 }).scores).toEqual({ A: 0, B: 1 })
  })

  it('revenu après l’échéance de la manche écourtée : elle ne repart pas', () => {
    const short = secondRound(leave(describing(), 'p1', T0 + 10_000))

    const s = rejoin(short, 'p1', T1 + TABOU_BOT_DESCRIBER_ROUND_MS + 1)

    expect(s.phaseEndsAt).toBe(short.phaseEndsAt)
    expect(s.phaseSeq).toBe(short.phaseSeq)
  })

  it('partie d’avant le correctif, retour dans les dernières secondes d’une manche pleine : pas de manche en plus', () => {
    const before = describing()
    // État tel que l'ancien moteur le laissait : coéquipier parti, pas de durée mémorisée.
    const { roundMs: _roundMs, ...legacy } = {
      ...before,
      players: before.players.map((p) => (p.id === 'p2' ? { ...p, leftAt: T0 + 5_000 } : p)),
    }
    void _roundMs

    const s = rejoin(legacy, 'p2', T0 + TABOU_ROUND_MS - 3_000)

    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS)
  })
})
