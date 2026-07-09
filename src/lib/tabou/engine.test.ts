import { describe, expect, it } from 'vitest'
import {
  createTabouState,
  currentTabouActorId,
  tabouActive,
  reduceTabou,
  toTabouClientView,
  toTabouSpectatorView,
  TabouEngineError,
  TABOU_COUNTDOWN_MS,
  TABOU_ROUND_MS,
  TABOU_BOT_DESCRIBER_ROUND_MS,
  type TabouState,
  type TabouEntry,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
  { word: 'Vélo', taboo: ['roue', 'pédale', 'guidon', 'chaîne'], diff: 1 },
  { word: 'Noël', taboo: ['sapin', 'cadeau', 'décembre', 'père Noël'], diff: 1 },
]
const T0 = 1_000_000

function make(n = 4, seed: string | number = 'seed', targetScore = 20): TabouState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
  }))
  const raw = createTabouState(players, WORDS, seed, T0 - TABOU_COUNTDOWN_MS, targetScore)
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

describe('createTabouState', () => {
  it('borne 4-12 joueurs, countdown au lancement puis description chronométrée', () => {
    const three = [
      { id: 'p0', name: 'P0', team: 'A' as const },
      { id: 'p1', name: 'P1', team: 'B' as const },
      { id: 'p2', name: 'P2', team: 'A' as const },
    ]
    expect(() => createTabouState(three, WORDS, 1, T0)).toThrow(TabouEngineError)
    const thirteen = Array.from({ length: 13 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    }))
    expect(() => createTabouState(thirteen, WORDS, 1, T0)).toThrow(TabouEngineError)
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    }))
    const raw = createTabouState(four, WORDS, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + TABOU_COUNTDOWN_MS)
    const s = make(4)
    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS)
  })

  it('refuse des équipes déséquilibrées (moins de 2 par équipe)', () => {
    const unbalanced = [
      { id: 'p0', name: 'P0', team: 'A' as const },
      { id: 'p1', name: 'P1', team: 'A' as const },
      { id: 'p2', name: 'P2', team: 'A' as const },
      { id: 'p3', name: 'P3', team: 'B' as const },
    ]
    expect(() => createTabouState(unbalanced, WORDS, 1, T0)).toThrow('UNBALANCED_TEAMS')
  })

  it('alterne strictement le décrivant entre équipes A/B, reproductible avec la même graine', () => {
    const s = make(4)
    const describer0 = s.players.find((p) => p.id === s.describerId)!
    expect(s.describerOrder[0]).toBe(describer0.id)
    expect(s.describerOrder[1]).not.toBe(undefined)
    const teams = s.describerOrder.map((id) => s.players.find((p) => p.id === id)!.team)
    expect(teams).toEqual(['A', 'B', 'A', 'B'])
    expect(make(4)).toEqual(make(4))
  })

  it('refuse un pool de mots vide', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    }))
    expect(() => createTabouState(four, [], 1, T0)).toThrow('NO_WORDS')
  })
})

describe('FOUND / PASS / TABOO_CALLED', () => {
  it('FOUND par un coéquipier marque un point et tire un nouveau mot, sans changer de phase', () => {
    const s = make(4)
    const describer = s.players.find((p) => p.id === s.describerId)!
    const teammate = s.players.find((p) => p.team === describer.team && p.id !== describer.id)!
    const wordBefore = s.currentWord
    const next = reduceTabou(s, { type: 'FOUND', playerId: teammate.id, now: T0 })
    expect(next.phase).toBe('describing')
    expect(next.scores[describer.team]).toBe(1)
    expect(next.roundStats.found).toBe(1)
    expect(next.currentWord).not.toEqual(wordBefore)
  })

  it('refuse FOUND du décrivant lui-même ou d’un adversaire', () => {
    const s = make(4)
    const describer = s.players.find((p) => p.id === s.describerId)!
    const opponent = s.players.find((p) => p.team !== describer.team)!
    expect(() =>
      reduceTabou(s, { type: 'FOUND', playerId: describer.id, now: T0 })
    ).toThrow('DESCRIBER_CANNOT_FOUND')
    expect(() =>
      reduceTabou(s, { type: 'FOUND', playerId: opponent.id, now: T0 })
    ).toThrow('NOT_TEAMMATE')
  })

  it('PASS uniquement par le décrivant, ne change aucun score', () => {
    const s = make(4)
    const describer = s.players.find((p) => p.id === s.describerId)!
    const teammate = s.players.find((p) => p.team === describer.team && p.id !== describer.id)!
    expect(() => reduceTabou(s, { type: 'PASS', playerId: teammate.id, now: T0 })).toThrow('NOT_DESCRIBER')
    const next = reduceTabou(s, { type: 'PASS', playerId: describer.id, now: T0 })
    expect(next.roundStats.passed).toBe(1)
    expect(next.scores).toEqual({ A: 0, B: 0 })
  })

  it('TABOO_CALLED uniquement par un adversaire, ne change aucun score', () => {
    const s = make(4)
    const describer = s.players.find((p) => p.id === s.describerId)!
    const teammate = s.players.find((p) => p.team === describer.team && p.id !== describer.id)!
    const opponent = s.players.find((p) => p.team !== describer.team)!
    expect(() =>
      reduceTabou(s, { type: 'TABOO_CALLED', playerId: teammate.id, now: T0 })
    ).toThrow('NOT_OPPONENT')
    const next = reduceTabou(s, { type: 'TABOO_CALLED', playerId: opponent.id, now: T0 })
    expect(next.roundStats.taboo).toBe(1)
    expect(next.scores).toEqual({ A: 0, B: 0 })
  })
})

describe('ADVANCE : fin de manche', () => {
  it('manche écoulée → bilan avec le mot en cours révélé publiquement', () => {
    const s = make(4)
    const wordInPlay = s.currentWord
    const ended = reduceTabou(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + TABOU_ROUND_MS,
    })
    expect(ended.phase).toBe('roundEnd')
    expect(ended.lastRoundWord).toEqual(wordInPlay)
    expect(ended.phaseEndsAt).toBeNull()
  })

  it('refuse ADVANCE avant expiration', () => {
    const s = make(4)
    expect(() =>
      reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 })
    ).toThrow('NOT_EXPIRED')
  })
})

describe('CONTINUE', () => {
  it('enchaîne la manche suivante avec le décrivant opposé, puis termine au score cible', () => {
    let s = make(4, 'seed', 1)
    const describer = s.players.find((p) => p.id === s.describerId)!
    const teammate = s.players.find((p) => p.team === describer.team && p.id !== describer.id)!
    s = reduceTabou(s, { type: 'FOUND', playerId: teammate.id, now: T0 })
    expect(s.scores[describer.team]).toBe(1)
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + TABOU_ROUND_MS })
    expect(s.phase).toBe('roundEnd')
    s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
    expect(s.winnerTeam).toBe(describer.team)
  })

  it('sans score cible atteint, repart en description avec le prochain décrivant de la rotation', () => {
    let s = make(4, 'seed', 100)
    const firstDescriber = s.describerId
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + TABOU_ROUND_MS })
    s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('describing')
    expect(s.round).toBe(2)
    expect(s.describerId).not.toBe(firstDescriber)
    expect(s.describerId).toBe(s.describerOrder[1])
    expect(s.lastRoundWord).toBeNull()
    expect(s.roundStats).toEqual({ found: 0, passed: 0, taboo: 0 })
  })

  it('refuse hors phase roundEnd ou pour un joueur inconnu', () => {
    const s = make(4)
    expect(() => reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })).toThrow('NOT_ROUND_END')
  })
})

describe('décrivant bot', () => {
  it('écourte la manche quand le décrivant tiré est un bot (ne peut pas décrire à voix haute)', () => {
    const players = [
      { id: 'p0', name: 'P0', team: 'A' as const },
      { id: 'bot-1', name: 'Bot', team: 'B' as const, isBot: true },
      { id: 'p2', name: 'P2', team: 'A' as const },
      { id: 'p3', name: 'P3', team: 'B' as const },
    ]
    const raw = createTabouState(players, WORDS, 'seed', T0 - TABOU_COUNTDOWN_MS, 100)
    let s = reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    // Le premier décrivant (p0) est humain → manche normale.
    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS)
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + TABOU_ROUND_MS })
    s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: T0 + TABOU_ROUND_MS })
    // Le décrivant suivant (bot-1) est un bot → manche écourtée.
    expect(s.describerId).toBe('bot-1')
    expect(s.phaseEndsAt).toBe(T0 + TABOU_ROUND_MS + TABOU_BOT_DESCRIBER_ROUND_MS)
  })
})

describe('LEAVE / REJOIN / REPLACE_LEFT', () => {
  it('REJOIN restaure un joueur parti ; REPLACE_LEFT le convertit en bot après le délai', () => {
    let s = make(4)
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceTabou(s, { type: 'REJOIN', playerId: 'p0' })
    expect(s.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    expect(tabouActive(s)).toHaveLength(3)
    expect(() =>
      reduceTabou(s, { type: 'REPLACE_LEFT', now: T0 + 1000, graceMs: 180_000 })
    ).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceTabou(s, { type: 'REPLACE_LEFT', now: T0 + 200_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
  })
})

describe('currentTabouActorId', () => {
  it('le décrivant en describing, le premier joueur actif en roundEnd', () => {
    const s = make(4)
    expect(currentTabouActorId(s)).toBe(s.describerId)
    const ended = reduceTabou(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + TABOU_ROUND_MS,
    })
    expect(currentTabouActorId(ended)).toBe('p0')
  })
})

describe('vues anti-triche', () => {
  it('seul le décrivant voit le mot courant pendant la description', () => {
    const s = make(4)
    const describerView = toTabouClientView(s, s.describerId)
    expect(describerView.isDescriber).toBe(true)
    expect(describerView.currentWord).toEqual(s.currentWord)
    const otherId = s.players.find((p) => p.id !== s.describerId)!.id
    const otherView = toTabouClientView(s, otherId)
    expect(otherView.isDescriber).toBe(false)
    expect(otherView.currentWord).toBeNull()
  })

  it('le spectateur (TV) ne voit jamais le mot courant', () => {
    const s = make(4)
    const spectator = toTabouSpectatorView(s)
    expect(spectator.currentWord).toBeNull()
    expect(JSON.stringify(spectator)).not.toContain(s.currentWord!.word)
  })

  it('lastRoundWord devient public pour tout le monde (décrivant, autres, spectateur) au bilan', () => {
    const s = make(4)
    const wordInPlay = s.currentWord
    const ended = reduceTabou(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + TABOU_ROUND_MS,
    })
    const otherId = ended.players.find((p) => p.id !== ended.describerId)!.id
    expect(toTabouClientView(ended, otherId).lastRoundWord).toEqual(wordInPlay)
    expect(toTabouSpectatorView(ended).lastRoundWord).toEqual(wordInPlay)
  })

  it('allWords/remainingWords ne fuient jamais dans la vue client', () => {
    const s = make(4)
    const view = toTabouClientView(s, 'p0')
    expect(view).not.toHaveProperty('allWords')
    expect(view).not.toHaveProperty('remainingWords')
    expect(view).not.toHaveProperty('rngState')
  })
})
