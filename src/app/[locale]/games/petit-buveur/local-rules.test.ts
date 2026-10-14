import { describe, expect, it } from 'vitest'
import type { GamePlayer } from './case-types'
import {
  addDrinks,
  applyDuelResult,
  caseNeedsTarget,
  classifyDefiWheelSegment,
  drawSimpleCases,
  isNoTargetCase,
  isReplayableCase,
  isSimpleCase,
  resetPlayersForNewGame,
  shuffle,
  tickInitiatorLinks,
  tickTurnEnd,
  type DrinkEntry,
} from './local-rules'

function mk(id: string, extra: Partial<GamePlayer> = {}): GamePlayer {
  return {
    id,
    name: id,
    preferences: { color: '' },
    position: 0,
    drinks: 0,
    protected: false,
    cursed: 0,
    linkedTurns: 0,
    ...extra,
  }
}

const shieldedExtra = { protected: true, protectionTurnsLeft: 3 }

describe('addDrinks', () => {
  it('bloque la case d’un autre joueur pour un protégé, pas sa propre case (règle 2)', () => {
    const list = [mk('a'), mk('b', shieldedExtra)]
    expect(addDrinks(list, 'b', 2, { sourceId: 'a' })).toBe(true)
    expect(list[1].drinks).toBe(0)
    expect(addDrinks(list, 'b', 2, { sourceId: 'b' })).toBe(false)
    expect(list[1].drinks).toBe(2)
  })

  it('malédiction (sans source) bloquée pour un protégé', () => {
    const list = [mk('a', shieldedExtra)]
    expect(addDrinks(list, 'a', 1)).toBe(true)
    expect(list[0].drinks).toBe(0)
  })

  it('miroir inversé à sens unique : l’acteur boit → la cible boit, pas l’inverse (règle 5)', () => {
    const list = [mk('a', { mirrorDrinkTargetId: 'b', mirrorDrinkTurns: 1 }), mk('b')]
    addDrinks(list, 'a', 2, { sourceId: 'a' })
    expect(list.map(p => p.drinks)).toEqual([2, 2])
    addDrinks(list, 'b', 3, { sourceId: 'b' })
    expect(list.map(p => p.drinks)).toEqual([2, 5])
  })

  it('défi en chaîne dans les deux sens, gorgées journalisées pour les statistiques', () => {
    const list = [mk('a', { linkedTo: 'b', linkedTurns: 5 }), mk('b')]
    const log: DrinkEntry[] = []
    addDrinks(list, 'b', 1, { sourceId: 'b' }, log)
    expect(list.map(p => p.drinks)).toEqual([1, 1])
    expect(log).toEqual([
      { playerId: 'b', count: 1 },
      { playerId: 'a', count: 1 },
    ])
  })
})

describe('shuffle (règle 15)', () => {
  it('Fisher-Yates : les 6 permutations de 3 éléments sont équiprobables', () => {
    let seed = 7
    const rng = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const counts = new Map<string, number>()
    const runs = 60000
    for (let i = 0; i < runs; i++) {
      const key = shuffle([0, 1, 2], rng).join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    for (const n of counts.values()) expect(Math.abs(n / runs - 1 / 6)).toBeLessThan(0.01)
  })

  it('ne modifie pas le tableau d’origine', () => {
    const src = [1, 2, 3]
    shuffle(src, () => 0)
    expect(src).toEqual([1, 2, 3])
  })
})

describe('tickInitiatorLinks', () => {
  it('un lien posé ce tour n’est pas décompté (règles 4 et 5)', () => {
    const p = mk('a', { linkedTo: 'b', linkedTurns: 5, mirrorDrinkTargetId: 'c', mirrorDrinkTurns: 1 })
    tickInitiatorLinks(p, { mirror: true, chain: true })
    expect([p.linkedTurns, p.mirrorDrinkTurns]).toEqual([5, 1])
    tickInitiatorLinks(p)
    expect([p.linkedTurns, p.mirrorDrinkTurns, p.mirrorDrinkTargetId]).toEqual([4, 0, undefined])
  })

  it('la chaîne expire après 5 tours de l’initiateur', () => {
    const p = mk('a', { linkedTo: 'b', linkedTurns: 5 })
    for (let i = 0; i < 5; i++) tickInitiatorLinks(p)
    expect(p.linkedTo).toBeUndefined()
  })
})

describe('classement des cases', () => {
  it('Normale : sans cible (règle 12)', () => {
    expect(isNoTargetCase('normal')).toBe(true)
    expect(caseNeedsTarget('normal')).toBe(false)
  })

  it('Chance, Échange, Défi en chaîne : jamais par le ciblage générique (règles 7 et 16)', () => {
    for (const type of ['chance', 'echange', 'defi-chaine'] as const) expect(caseNeedsTarget(type)).toBe(false)
    expect(caseNeedsTarget('gorgée')).toBe(true)
  })

  it('rejouables : ni méta-case ni Normale (règle 10)', () => {
    expect(isReplayableCase({ type: 'repetition', effect: 0 })).toBe(false)
    expect(isReplayableCase({ type: 'double-case', effect: 0 })).toBe(false)
    expect(isReplayableCase({ type: 'normal', effect: 0 })).toBe(false)
    expect(isReplayableCase({ type: 'vote', effect: 3 })).toBe(true)
  })

  it('Double case : ne tire que des cases simples (règle 11)', () => {
    const queue = [
      { type: 'vote', effect: 3 },
      { type: 'normal', effect: 0 },
      { type: 'defi', effect: 2 },
      { type: 'gorgée', effect: 2 },
      { type: 'rewind', effect: 0 },
      { type: 'recul', effect: -1 },
    ] as const
    let i = 0
    const [a, b] = drawSimpleCases(() => ({ ...queue[i++] }))
    expect([a.type, b.type]).toEqual(['gorgée', 'recul'])
    expect(isSimpleCase({ type: 'pile-face', effect: 2 })).toBe(false)
  })
})

describe('applyDuelResult (règle 17)', () => {
  it('le perdant recule d’une case', () => {
    const r = applyDuelResult([mk('a', { position: 6 }), mk('b', { position: 6 })], 'a', 'b', true)
    expect(r.players.map(p => p.position)).toEqual([6, 5])
    expect(r.loserProtected).toBe(false)
  })

  it('un perdant protégé ne recule pas', () => {
    const r = applyDuelResult([mk('a', { position: 6 }), mk('b', { position: 6, ...shieldedExtra })], 'a', 'b', true)
    expect(r.players.map(p => p.position)).toEqual([6, 6])
    expect(r.loserProtected).toBe(true)
  })
})

describe('classifyDefiWheelSegment', () => {
  it('le segment « boit » se lit à sa position, quelle que soit la langue', () => {
    expect(classifyDefiWheelSegment(10, 'Bevi 2 sorsi', 'SAFE', 10)).toBe('drink')
    expect(classifyDefiWheelSegment(3, 'SAFE', 'SAFE', 10)).toBe('safe')
    expect(classifyDefiWheelSegment(4, 'Chante', 'SAFE', 10)).toBe('challenge')
  })
})

describe('tickTurnEnd (règles 2 et 4, constat 31)', () => {
  it('tour joué : protection et liens de l’initiateur décomptés', () => {
    const list = [mk('a', { linkedTo: 'b', linkedTurns: 5 }), mk('b', shieldedExtra)]
    tickTurnEnd(list, 0)
    expect([list[0].linkedTurns, list[1].protectionTurnsLeft]).toEqual([4, 2])
  })

  it('tour sauté (Passe-ton-tour) : comme en ligne, ni protection ni lien décomptés', () => {
    const list = [mk('a', { linkedTo: 'b', linkedTurns: 5 }), mk('b', shieldedExtra)]
    tickTurnEnd(list, 0, { skipped: true })
    expect([list[0].linkedTurns, list[1].protectionTurnsLeft]).toEqual([5, 3])
  })
})

describe('resetPlayersForNewGame (constat 30)', () => {
  it('« Rejouer » garde les joueurs de la partie (même repris) et efface tout effet', () => {
    const played = [
      mk('a', { position: 29, drinks: 12, cursed: 2, linkedTo: 'b', linkedTurns: 3, anchored: true }),
      mk('b', { position: 7, ...shieldedExtra, skipNextTurn: true, mirrorDrinkTargetId: 'a', mirrorDrinkTurns: 1 }),
    ]
    const next = resetPlayersForNewGame(played)
    expect(next.map(p => p.id)).toEqual(['a', 'b'])
    for (const p of next) {
      expect(p).toMatchObject({ position: 0, drinks: 0, protected: false, cursed: 0, linkedTurns: 0, skipNextTurn: false, anchored: false, mirrorDrinkTurns: 0 })
      expect(p.linkedTo).toBeUndefined()
      expect(p.mirrorDrinkTargetId).toBeUndefined()
    }
    expect(played[0].position).toBe(29)
  })
})
