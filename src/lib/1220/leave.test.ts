import { describe, expect, it } from 'vitest'
import {
  createGame1220State,
  defaultChoices1220,
  reduceGame1220,
  type Game1220State,
} from './engine'
import { parseGame1220State, serializeGame1220State } from './server-adapter'

const PLAYERS = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Chris' },
]
const T0 = 1_700_000_000_000

const setup = () => createGame1220State(PLAYERS, 'seed-leave', T0)
const configIds = (s: Game1220State) => (s.configs ?? []).map((c) => c.playerId)
const rollIds = (s: Game1220State) => (s.lastRoll?.results ?? []).map((r) => r.playerId)

/** Alice part pendant la mise en place, Bob et Chris se déclarent prêts : la partie démarre sans elle. */
function startedWithoutAlice(draft?: Parameters<typeof reduceGame1220>[1]): Game1220State {
  let s = setup()
  if (draft) s = reduceGame1220(s, draft)
  s = reduceGame1220(s, { type: 'LEAVE', playerId: 'a', at: T0 + 1_000 })
  s = reduceGame1220(s, { type: 'READY', playerId: 'b' })
  s = reduceGame1220(s, { type: 'READY', playerId: 'c' })
  expect(s.phase).toBe('play')
  expect(configIds(s)).toEqual(['b', 'c'])
  return s
}

describe('12-20 — parti pendant la mise en place, la partie a démarré sans lui', () => {
  it('revenu : il retrouve ses paris et figure dans les verdicts', () => {
    let s = startedWithoutAlice({ type: 'SET_DRAFT', playerId: 'a', choices: { drinkNumber: 3, giveNumber: 9 } })

    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })

    // Sans cela : aucune ligne à son nom, il ne boit ni ne donne de toute la partie.
    expect(configIds(s)).toEqual(['a', 'b', 'c'])
    expect(s.configs?.[0]).toMatchObject({ playerId: 'a', name: 'Alice', drinkNumber: 3, giveNumber: 9 })

    s = reduceGame1220(s, { type: 'ROLL', playerId: 'a' })
    expect(rollIds(s)).toEqual(['a', 'b', 'c'])
  })

  it('revenu avec un brouillon en conflit : paris par défaut, comme à l’échéance', () => {
    let s = startedWithoutAlice({ type: 'SET_DRAFT', playerId: 'a', choices: { drinkNumber: 5, giveNumber: 5 } })

    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })

    expect(s.configs?.find((c) => c.playerId === 'a')).toMatchObject(defaultChoices1220())
  })

  it('remplacé par un bot après le délai : le bot joue avec ses paris', () => {
    let s = startedWithoutAlice()

    s = reduceGame1220(s, { type: 'REPLACE_LEFT', now: T0 + 200_000, graceMs: 180_000 })

    expect(s.players.find((p) => p.id === 'a')?.isBot).toBe(true)
    expect(configIds(s)).toEqual(['a', 'b', 'c'])
    s = reduceGame1220(s, { type: 'ROLL', playerId: 'b' })
    expect(rollIds(s)).toEqual(['a', 'b', 'c'])
  })

  it('brouillon forgé au nom d’un autre : une seule config, à son nom, même après plusieurs allers-retours', () => {
    let s = startedWithoutAlice({
      type: 'SET_DRAFT',
      playerId: 'a',
      choices: { drinkNumber: 3, giveNumber: 9, playerId: 'b', name: 'Bob' } as never,
    })

    for (let i = 0; i < 3; i += 1) {
      if (i > 0) s = reduceGame1220(s, { type: 'LEAVE', playerId: 'a', at: T0 + 10_000 + i })
      s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })
    }

    expect(configIds(s)).toEqual(['a', 'b', 'c'])
    expect(s.configs?.[0]).toMatchObject({ playerId: 'a', name: 'Alice', drinkNumber: 3 })
  })

  it('les lancers déjà faits ne sont pas réécrits', () => {
    let s = startedWithoutAlice()
    s = reduceGame1220(s, { type: 'ROLL', playerId: 'b' })
    const firstRoll = s.lastRoll

    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })

    expect(s.lastRoll).toEqual(firstRoll)
    expect(s.history).toEqual([firstRoll])
  })
})

describe('12-20 — brouillon forgé au verrouillage', () => {
  it('un brouillon portant le nom d’un autre ne lui vole pas ses paris', () => {
    let s = setup()
    s = reduceGame1220(s, {
      type: 'SET_DRAFT',
      playerId: 'a',
      choices: { drinkNumber: 3, giveNumber: 9, playerId: 'b', name: 'Bob' } as never,
    })
    for (const p of PLAYERS) s = reduceGame1220(s, { type: 'READY', playerId: p.id })

    // Sans cela : deux lignes « Bob », aucune pour Alice.
    expect(configIds(s)).toEqual(['a', 'b', 'c'])
    expect(s.configs?.map((c) => c.name)).toEqual(['Alice', 'Bob', 'Chris'])
    expect(s.configs?.[0]).toMatchObject({ drinkNumber: 3, giveNumber: 9 })

    s = reduceGame1220(s, { type: 'ROLL', playerId: 'a' })
    expect(rollIds(s)).toEqual(['a', 'b', 'c'])
  })
})

describe('12-20 — départs qui ne changent rien aux paris', () => {
  it('parti puis revenu en pleine partie : ses paris verrouillés ne bougent pas', () => {
    let s = setup()
    s = reduceGame1220(s, { type: 'SET_DRAFT', playerId: 'a', choices: { drinkNumber: 3, giveNumber: 9 } })
    for (const p of PLAYERS) s = reduceGame1220(s, { type: 'READY', playerId: p.id })
    const locked = s.configs

    s = reduceGame1220(s, { type: 'LEAVE', playerId: 'a', at: T0 + 5_000 })
    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })

    expect(s.configs).toEqual(locked)
  })

  it('revenu pendant la mise en place : rien n’est verrouillé pour lui', () => {
    let s = reduceGame1220(setup(), { type: 'LEAVE', playerId: 'a', at: T0 + 1_000 })

    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'a' })

    expect(s.phase).toBe('setup')
    expect(s.configs).toBeNull()
    expect(s.setupReady).not.toContain('a')
  })

  it('partie en base d’avant le correctif : le retour répare l’état relu', () => {
    const legacy = parseGame1220State(serializeGame1220State(startedWithoutAlice()))!

    const s = reduceGame1220(legacy, { type: 'REJOIN', playerId: 'a' })

    expect(configIds(s)).toEqual(['a', 'b', 'c'])
  })
})
