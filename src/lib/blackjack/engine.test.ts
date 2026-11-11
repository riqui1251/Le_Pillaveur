import { describe, expect, it } from 'vitest'
import {
  applyBjBotTurn,
  bjBotMove,
  BjEngineError,
  createBjState,
  currentBjActorId,
  currentBjHand,
  freshShoe,
  handTotal,
  reduceBj,
  toBjClientView,
  type BjCard,
  type BjRank,
  type BjState,
} from './engine'
import { applyBjRoomAction, buildBjState, convertBjPlayerToBot, markBjPlayerLeft, parseBjState, serializeBjState } from './server-adapter'

const c = (rank: BjRank, suit: BjCard['suit'] = '♠'): BjCard => ({ rank, suit })

const TWO = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
]

/**
 * Table truquée : le sabot commence par `top` (distribution p1, p2…, croupier,
 * puis second tour), le reste du sabot suit pour ne jamais manquer de cartes.
 */
function rigged(top: BjCard[], players = TWO): BjState {
  const s = createBjState(players, 'seed-bj')
  return { ...s, shoe: [...top, ...freshShoe()] }
}

function betAll(s: BjState, stake = 1): BjState {
  return s.players.reduce((acc, p) => (p.stake === null ? reduceBj(acc, { type: 'BET', playerId: p.id, stake }) : acc), s)
}

describe('totaux', () => {
  it("l'as vaut 11 ou 1, les figures 10", () => {
    expect(handTotal([c('A'), c('R')])).toEqual({ total: 21, soft: true })
    expect(handTotal([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true })
    expect(handTotal([c('A'), c('9'), c('5')])).toEqual({ total: 15, soft: false })
    expect(handTotal([c('V'), c('D'), c('2')]).total).toBe(22)
  })
})

describe('mises et donne', () => {
  it('attend toutes les mises avant de distribuer', () => {
    let s = createBjState(TWO, 'x')
    expect(s.phase).toBe('betting')
    expect(currentBjActorId(s)).toBe('p1')
    s = reduceBj(s, { type: 'BET', playerId: 'p1', stake: 2 })
    expect(s.phase).toBe('betting')
    expect(currentBjActorId(s)).toBe('p2')
    expect(() => reduceBj(s, { type: 'BET', playerId: 'p1', stake: 1 })).toThrow(BjEngineError)
    expect(() => reduceBj(s, { type: 'BET', playerId: 'p2', stake: 9 })).toThrow('INVALID_STAKE')
    s = reduceBj(s, { type: 'BET', playerId: 'p2', stake: 1 })
    expect(s.phase).toBe('playing')
    expect(s.players.every((p) => p.hands[0].cards.length === 2)).toBe(true)
    expect(s.dealer).toHaveLength(2)
  })

  it('les bots misent seuls ; une table de bots se distribue d’emblée', () => {
    const s = createBjState([{ id: 'b', name: 'Bot', isBot: true }], 'y')
    expect(s.phase).not.toBe('betting')
    expect(s.players[0].stake).not.toBeNull()
  })
})

describe('tour de jeu', () => {
  it('tirer, dépasser 21 et passer la main', () => {
    // p1 : 10 + 6 ; p2 : 9 + 9 ; croupier : 10 + 7
    let s = betAll(rigged([c('10'), c('9'), c('10'), c('6'), c('9'), c('7'), c('R')]))
    expect(currentBjActorId(s)).toBe('p1')
    s = reduceBj(s, { type: 'HIT', playerId: 'p1' })
    expect(s.players[0].hands[0].cards).toHaveLength(3)
    expect(currentBjActorId(s)).toBe('p2')
    expect(() => reduceBj(s, { type: 'STAND', playerId: 'p1' })).toThrow('NOT_YOUR_TURN')
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    expect(s.phase).toBe('results')
    expect(s.players[0].results[0]).toMatchObject({ outcome: 'bust', drink: 1 })
    expect(s.players[1].results[0]).toMatchObject({ outcome: 'win', give: 1 })
    expect(s.totals.p1.drunk).toBe(1)
    expect(s.totals.p2.given).toBe(1)
  })

  it('le croupier tire jusqu’à 17 et peut sauter', () => {
    // p1 : 10+8 ; p2 : 10+7 ; croupier 10+6, puis tire un 9
    let s = betAll(rigged([c('10'), c('10'), c('10'), c('8'), c('7'), c('6'), c('9')]))
    s = reduceBj(s, { type: 'STAND', playerId: 'p1' })
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    expect(handTotal(s.dealer).total).toBe(25)
    expect(s.players.every((p) => p.results[0].outcome === 'win')).toBe(true)
  })

  it('doubler : une carte, mise doublée', () => {
    // p1 : 6+5 → double, tire un 10 ; p2 : 10+8 ; croupier 10+9
    let s = betAll(rigged([c('6'), c('10'), c('10'), c('5'), c('8'), c('9'), c('10')]), 2)
    s = reduceBj(s, { type: 'DOUBLE', playerId: 'p1' })
    expect(s.players[0].hands[0]).toMatchObject({ doubled: true, stood: true })
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    expect(s.players[0].results[0]).toMatchObject({ outcome: 'win', give: 4 })
    expect(s.players[1].results[0]).toMatchObject({ outcome: 'lose', drink: 2 })
  })

  it('séparer une paire : deux mains jouées l’une après l’autre', () => {
    // p1 : 8+8 ; p2 : 10+10 ; croupier 10+7 ; puis 3 et 2 pour les mains séparées
    let s = betAll(rigged([c('8'), c('10'), c('10'), c('8', '♥'), c('10'), c('7'), c('3'), c('2')]))
    s = reduceBj(s, { type: 'SPLIT', playerId: 'p1' })
    expect(s.players[0].hands).toHaveLength(2)
    expect(s.turn).toEqual({ player: 0, hand: 0 })
    s = reduceBj(s, { type: 'STAND', playerId: 'p1' })
    expect(s.turn).toEqual({ player: 0, hand: 1 })
    s = reduceBj(s, { type: 'STAND', playerId: 'p1' })
    expect(currentBjActorId(s)).toBe('p2')
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    expect(s.players[0].results).toHaveLength(2)
    expect(s.totals.p1.hands).toBe(2)
  })

  it('refuse de séparer deux cartes différentes', () => {
    const s = betAll(rigged([c('8'), c('10'), c('10'), c('9'), c('10'), c('7')]))
    expect(() => reduceBj(s, { type: 'SPLIT', playerId: 'p1' })).toThrow('CANNOT_SPLIT')
  })
})

describe('Black Jack naturel', () => {
  it('se joue tout seul et rapporte une fois et demie la mise', () => {
    // p1 : A+R ; p2 : 10+8 ; croupier 10+7
    let s = betAll(rigged([c('A'), c('10'), c('10'), c('R'), c('8'), c('7')]), 3)
    expect(currentBjActorId(s)).toBe('p2')
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    expect(s.players[0].results[0]).toMatchObject({ outcome: 'blackjack', give: 5 })
    expect(s.totals.p1.blackjacks).toBe(1)
  })

  it('celui du croupier clôt la manche aussitôt', () => {
    // p1 : A+R (égalité) ; p2 : 10+9 (perd) ; croupier A+D
    const s = betAll(rigged([c('A'), c('10'), c('A'), c('R'), c('9'), c('D')]))
    expect(s.phase).toBe('results')
    expect(s.dealerBlackjack).toBe(true)
    expect(s.players[0].results[0].outcome).toBe('push')
    expect(s.players[1].results[0]).toMatchObject({ outcome: 'lose', drink: 1 })
  })
})

describe('manches et fin', () => {
  it('manche suivante : nouvelles mises, totaux conservés', () => {
    let s = betAll(rigged([c('10'), c('9'), c('10'), c('6'), c('9'), c('7'), c('R')]))
    s = reduceBj(s, { type: 'STAND', playerId: 'p1' })
    s = reduceBj(s, { type: 'STAND', playerId: 'p2' })
    const totals = s.totals
    s = reduceBj(s, { type: 'NEXT_ROUND', playerId: 'p2' })
    expect(s.phase).toBe('betting')
    expect(s.round).toBe(2)
    expect(s.totals).toEqual(totals)
    expect(s.players.every((p) => p.stake === null && p.hands.length === 0)).toBe(true)
  })

  it('terminer fige la partie', () => {
    const s = reduceBj(createBjState(TWO, 'z'), { type: 'END', playerId: 'p1' })
    expect(s.phase).toBe('finished')
    expect(currentBjActorId(s)).toBeNull()
  })
})

describe('départs et bots', () => {
  it('un joueur qui part pendant les mises ne bloque pas la donne', () => {
    let s = reduceBj(createBjState(TWO, 'a'), { type: 'BET', playerId: 'p1', stake: 1 })
    s = markBjPlayerLeft(s, 'p2', 1000)!
    expect(s.phase).toBe('playing')
    expect(s.players[1].hands).toHaveLength(0)
  })

  it('un joueur qui part à son tour voit sa main restée', () => {
    let s = betAll(rigged([c('10'), c('9'), c('10'), c('6'), c('9'), c('7'), c('R')]))
    s = markBjPlayerLeft(s, 'p1', 1000)!
    expect(currentBjActorId(s)).toBe('p2')
  })

  it('remplacé par un bot pendant les mises, il mise aussitôt', () => {
    const s = convertBjPlayerToBot(reduceBj(createBjState(TWO, 'b'), { type: 'BET', playerId: 'p1', stake: 1 }), 'p2')!
    expect(s.players[1].isBot).toBe(true)
    expect(s.phase).toBe('playing')
  })

  it('stratégie de base des bots', () => {
    const player = { id: 'b', name: 'B', isBot: true, leftAt: null, stake: 1, hands: [], results: [] }
    const hand = (cards: BjCard[]) => ({ cards, stake: 1, doubled: false, stood: false, fromSplit: false })
    expect(bjBotMove({ ...player, hands: [hand([c('8'), c('8')])] }, hand([c('8'), c('8')]), c('10'))).toBe('split')
    expect(bjBotMove(player, hand([c('6'), c('5')]), c('6'))).toBe('double')
    expect(bjBotMove(player, hand([c('10'), c('7')]), c('A'))).toBe('stand')
    expect(bjBotMove(player, hand([c('10'), c('4')]), c('10'))).toBe('hit')
    expect(bjBotMove(player, hand([c('10'), c('4')]), c('5'))).toBe('stand')
  })

  it('le tick bot ne joue que la main d’un bot', () => {
    const s = betAll(rigged([c('10'), c('9'), c('10'), c('6'), c('9'), c('7'), c('R')]))
    expect(applyBjBotTurn(s)).toBeNull()
  })

  it('une partie de bots se termine toujours en résultats', () => {
    for (let i = 0; i < 30; i += 1) {
      let s = createBjState(
        [
          { id: 'b1', name: 'B1', isBot: true },
          { id: 'b2', name: 'B2', isBot: true },
        ],
        `bots-${i}`
      )
      let guard = 0
      while (s.phase === 'playing' && guard < 50) {
        s = applyBjBotTurn(s)!
        guard += 1
      }
      expect(s.phase).toBe('results')
    }
  })
})

describe('vue client et adaptateur', () => {
  it('masque le sabot, la graine et la carte fermée du croupier en cours de jeu', () => {
    const s = betAll(rigged([c('10'), c('9'), c('10'), c('6'), c('9'), c('7'), c('R')]))
    const view = toBjClientView(s)
    expect(view.dealer).toEqual([s.dealer[0], null])
    expect('shoe' in view).toBe(false)
    expect('rngState' in view).toBe(false)
    expect(view.shoeCount).toBe(s.shoe.length)
    const done = reduceBj(reduceBj(s, { type: 'STAND', playerId: 'p1' }), { type: 'STAND', playerId: 'p2' })
    expect(toBjClientView(done).dealer.every(Boolean)).toBe(true)
  })

  it('sérialise, relit et applique les actions HTTP', () => {
    const s = buildBjState([{ userId: 'u1', user: { displayName: 'Alice' } }], 1, 'seed')
    expect(s.players).toHaveLength(2)
    const back = parseBjState(serializeBjState(s))!
    expect(back.players).toEqual(s.players)
    expect(parseBjState('{oops')).toBeNull()
    const res = applyBjRoomAction(back, 'u1', { action: 'bet', stake: 2 }, 1000)
    expect(res.ok).toBe(true)
    expect(applyBjRoomAction(back, 'u1', { action: 'nope' }, 1000)).toEqual({ ok: false, error: 'invalid_action' })
    if (res.ok) expect(currentBjHand(res.state) === null || res.state.phase === 'playing').toBe(true)
  })
})
