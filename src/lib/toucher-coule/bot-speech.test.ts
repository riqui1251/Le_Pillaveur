import { afterEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng, rngFromState } from '@/lib/petit-buveur/rng'
import {
  botChooseCell,
  botShouldUseBomb,
  createInitialTCState,
  currentTCPlayerId,
  reduceTC,
  tcSpeechRound,
  tcSpeechWindowTurns,
  toTCSpectatorView,
  withTCSpeech,
  TC_SPEECH_CAP,
  TC_SPEECH_KINDS,
  type TCSay,
  type TCSpeech,
  type TCSpeechKind,
  type TCState,
} from './engine'
import { tcBotSpeech, tcTalkBase } from './bot-speech'
import { reactionTalkChance } from '@/lib/online/reaction-speech'
import { buildTCState, withTCBotTalk } from './server-adapter'

const always = (v: number) => () => v
const seq = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/**
 * 2v2 sur 10×10 : Riqui (humain) et Raoul (agressif) en A, Gépéto (farceur)
 * et Bernadette (prudente) en B. Ordre de tir : h, b2, b1, b3. Chacun pose un
 * 4 en ligne 0 ou 2 et un 3 en ligne 1 ou 3 de la grille de son équipe.
 */
function battle(): TCState {
  let s = createInitialTCState(
    [
      { id: 'h', name: 'Riqui', team: 'A', isBot: false },
      { id: 'b1', name: 'Raoul', team: 'A', isBot: true },
      { id: 'b2', name: 'Gépéto', team: 'B', isBot: true },
      { id: 'b3', name: 'Bernadette', team: 'B', isBot: true },
    ],
    '2v2',
    'seed'
  )
  const fleets: Record<string, number[][]> = {
    h: [[0, 1, 2, 3], [10, 11, 12]],
    b1: [[20, 21, 22, 23], [30, 31, 32]],
    b2: [[0, 1, 2, 3], [10, 11, 12]],
    b3: [[20, 21, 22, 23], [30, 31, 32]],
  }
  for (const id of ['h', 'b1', 'b2', 'b3']) s = reduceTC(s, { type: 'PLACE', playerId: id, ships: fleets[id] })
  expect(s.phase).toBe('battle')
  expect(s.turnOrder).toEqual(['h', 'b2', 'b1', 'b3'])
  return s
}

const fire = (s: TCState, playerId: string, cell: number) => reduceTC(s, { type: 'FIRE', playerId, cell })
const speak = (s: TCState, rand: () => number) => tcBotSpeech(toTCSpectatorView(s), rand)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('le tir et ses réactions', () => {
  it('l’humain touche un bot : le bot touché râle (ouch), adressé au tireur', () => {
    const after = fire(battle(), 'h', 0)
    expect(after.lastShot?.result).toBe('hit')
    expect(speak(after, always(0))).toEqual([{ playerId: 'b2', kind: 'ouch', targetId: 'h' }])
    expect(speak(after, always(0.99))).toEqual([])
  })

  it('l’humain tire dans l’eau : UN bot de l’équipe visée le chambre (taunt), tiré au sort', () => {
    const after = fire(battle(), 'h', 99)
    expect(after.lastShot?.result).toBe('miss')
    expect(speak(after, always(0))).toEqual([{ playerId: 'b2', kind: 'taunt', targetId: 'h' }])
    expect(speak(after, always(0.6))).toEqual([])
    expect(speak(after, seq(0.9, 0))).toEqual([{ playerId: 'b3', kind: 'taunt', targetId: 'h' }])
  })

  it('un bot coule le navire d’un humain : « Coulé ! », adressé à l’armateur', () => {
    let s = battle()
    s = fire(s, 'h', 99)
    s = fire(s, 'b2', 10)
    s = fire(s, 'b2', 11)
    const sunk = fire(s, 'b2', 12)
    expect(sunk.lastShot?.result).toBe('sunk')
    expect(speak(sunk, always(0))).toEqual([{ playerId: 'b2', kind: 'sunk', targetId: 'h' }])
  })

  it('un bot coule le navire d’un bot : le tireur d’abord ; muet, l’armateur pleure son navire (lost)', () => {
    let s = battle()
    s = fire(s, 'h', 99)
    s = fire(s, 'b2', 98)
    s = fire(s, 'b1', 10)
    s = fire(s, 'b1', 11)
    const sunk = fire(s, 'b1', 12)
    expect(speak(sunk, always(0))).toEqual([{ playerId: 'b1', kind: 'sunk', targetId: 'b2' }])
    // Deux tirages par option : l'orateur, puis son dé de parole.
    expect(speak(sunk, seq(0, 0.99, 0, 0))).toEqual([{ playerId: 'b2', kind: 'lost', targetId: 'b1' }])
  })

  it('un bot tire dans l’eau : « Plouf », adressé au tireur suivant ; touché : hit à l’armateur', () => {
    let s = fire(battle(), 'h', 99)
    const miss = fire(s, 'b2', 98)
    expect(currentTCPlayerId(miss)).toBe('b1')
    expect(speak(miss, seq(0.99, 0))).toEqual([{ playerId: 'b2', kind: 'miss', targetId: 'b1' }])
    s = fire(miss, 'b1', 20)
    expect(speak(s, always(0))).toEqual([{ playerId: 'b1', kind: 'hit', targetId: 'b3' }])
  })

  it('la Bombe d’un bot qui ne coule rien : bomb', () => {
    const s0 = createInitialTCState(
      [
        { id: 'h', name: 'Riqui', team: 'A', isBot: false },
        { id: 'b2', name: 'Gépéto', team: 'B', isBot: true },
      ],
      '1v1',
      'seed',
      { powerups: true }
    )
    let s = reduceTC(s0, { type: 'PLACE', playerId: 'h', ships: [[0, 1, 2, 3], [16, 17, 18], [32, 33]] })
    s = reduceTC(s, { type: 'PLACE', playerId: 'b2', ships: [[0, 1, 2, 3], [16, 17, 18], [32, 33]] })
    s = fire(s, 'h', 63)
    const bombed = reduceTC(s, { type: 'FIRE', playerId: 'b2', cell: 0, bomb: true })
    expect(bombed.lastShot?.bombResults).toHaveLength(4)
    expect(speak(bombed, always(0))[0]).toMatchObject({ playerId: 'b2', kind: 'bomb', targetId: 'h' })
  })
})

describe('plafond, sobriété et anti-triche', () => {
  it(`plafond min(${TC_SPEECH_CAP}, bavardage) par fenêtre de tours : qui l’a atteint se tait`, () => {
    const after = fire(battle(), 'h', 0)
    const round = tcSpeechRound(after)
    const said = (n: number, r: number): TCSpeech[] =>
      Array.from({ length: n }, () => ({ playerId: 'b2', kind: 'hit' as const, targetId: 'h', round: r }))
    expect(speak({ ...after, speech: said(2, round) }, always(0))).toEqual([])
    expect(speak({ ...after, speech: said(2, round - 1) }, always(0))).toHaveLength(1)
    // Bernadette (bavardage 1) : une parole par fenêtre.
    const bern = { ...after, players: after.players.map((p) => (p.id === 'b2' ? { ...p, name: 'Bernadette' } : p)) }
    expect(speak({ ...bern, speech: said(1, round) }, always(0))).toEqual([])
  })

  it('table sans humain présent : aucune bulle', () => {
    const after = fire(battle(), 'h', 0)
    const gone = { ...after, players: after.players.map((p) => (p.id === 'h' ? { ...p, leftAt: 1 } : p)) }
    expect(speak(gone, always(0))).toEqual([])
  })

  it('invariance : navires intacts déplacés ⇒ mêmes bulles (le planificateur lit la vue spectateur)', () => {
    const after = fire(battle(), 'h', 99)
    const moved: TCState = {
      ...after,
      ships: after.ships.map((ship) => (ship.hits.length === 0 ? { ...ship, cells: ship.cells.map((c) => c + 40) } : ship)),
      rngState: 7,
    }
    for (const v of [0, 0.3, 0.6, 0.9]) {
      expect(withTCBotTalk(moved, always(v)).speech).toEqual(withTCBotTalk(after, always(v)).speech)
    }
    expect(toTCSpectatorView(after).ships.every((ship) => ship.revealed === ship.sunk)).toBe(true)
  })

  it('pur : ni Math.random ni Date.now ; la parole ne touche que le fil', () => {
    const random = vi.spyOn(Math, 'random')
    const now = vi.spyOn(Date, 'now')
    const after = fire(battle(), 'h', 0)
    const talked = withTCBotTalk(after, always(0))
    expect(random).not.toHaveBeenCalled()
    expect(now).not.toHaveBeenCalled()
    expect(talked.speech).toEqual([{ playerId: 'b2', kind: 'ouch', targetId: 'h', round: 0 }])
    expect({ ...talked, speech: undefined, speechBase: undefined }).toEqual({ ...after, speech: undefined, speechBase: undefined })
  })

  it('les chances suivent le bavardage, le trait et la rancune, jamais systématiques', () => {
    const chance = (kind: TCSpeechKind, name: string) => reactionTalkChance(tcTalkBase(kind, botTraitsFor(name)), botTraitsFor(name))
    for (const kind of TC_SPEECH_KINDS) expect(chance(kind, 'Gépéto')).toBeLessThan(1)
    expect(chance('sunk', 'Raoul')).toBeGreaterThan(chance('sunk', 'Suzette'))
    expect(chance('lost', 'Germaine')).toBeGreaterThan(chance('lost', 'Lucien'))
  })
})

describe('withTCSpeech', () => {
  it('refuse un humain, un kind inconnu, une cible absente ou soi-même, un plafond atteint', () => {
    const s = battle()
    const say = (over: Partial<TCSay>): TCSay => ({ playerId: 'b2', kind: 'hit', targetId: 'h', ...over })
    expect(() => withTCSpeech(s, [say({ playerId: 'h', targetId: 'b2' })])).toThrow('INVALID_SPEECH')
    expect(() => withTCSpeech(s, [say({ kind: 'spy' as TCSpeechKind })])).toThrow('INVALID_SPEECH')
    expect(() => withTCSpeech(s, [say({ targetId: 'nobody' })])).toThrow('INVALID_SPEECH')
    expect(() => withTCSpeech(s, [say({ targetId: 'b2' })])).toThrow('INVALID_SPEECH')
    expect(() => withTCSpeech(s, [say({}), say({}), say({})])).toThrow('ALREADY_SPOKE')
  })

  it('fenêtre de tours : une rotation, quatre tours au moins ; le fil garde deux fenêtres et compte l’élagué', () => {
    const s = battle()
    expect(tcSpeechWindowTurns(s)).toBe(4)
    expect(tcSpeechRound({ ...s, turnCount: 1 })).toBe(0)
    expect(tcSpeechRound({ ...s, turnCount: 5 })).toBe(1)
    const old: TCSpeech[] = [0, 0, 1, 2].map((round) => ({ playerId: 'b3', kind: 'miss', targetId: 'h', round }))
    const next = withTCSpeech({ ...s, turnCount: 9, speech: old, speechBase: 3 }, [{ playerId: 'b2', kind: 'hit', targetId: 'h' }])
    expect(next.speech?.map((sp) => sp.round)).toEqual([1, 2, 2])
    expect(next.speechBase).toBe(5)
    expect(next.version).toBe(s.version)
  })
})

describe('simulation : des parties entières, un humain et trois bots', () => {
  it('chaque parole est acceptée par le moteur, dans le plafond, et chaque kind finit par être dit', () => {
    const seen = new Set<TCSpeechKind>()
    let total = 0
    let windows = 0
    for (let game = 0; game < 40; game += 1) {
      const sayRng = createRng(`tc-say-${game}`)
      const sayRand = () => sayRng.next()
      let state = buildTCState([{ userId: 'h', displayName: 'Riqui' }], game % 2 ? '2v2' : '1v1', {}, `tc-${game}`, {
        powerups: game % 3 === 0,
      })
      state = reduceTC(state, { type: 'AUTO_PLACE', playerId: 'h' })
      for (let step = 0; step < 600 && state.phase === 'battle'; step += 1) {
        const shooterId = currentTCPlayerId(state)!
        const shooter = state.players.find((p) => p.id === shooterId)!
        const rng = rngFromState(state.rngState)
        const cell = botChooseCell(state, shooterId, rng)
        const bomb = botShouldUseBomb(state, shooter, cell, rng)
        const before = tcSpeechRound(state)
        state = reduceTC({ ...state, rngState: rng.getState() }, { type: 'FIRE', playerId: shooterId, cell, bomb })
        if (tcSpeechRound(state) !== before) windows += 1
        const says = tcBotSpeech(toTCSpectatorView(state), sayRand)
        expect(says.length).toBeLessThanOrEqual(1)
        state = withTCSpeech(state, says)
        for (const say of says) seen.add(say.kind)
        total += says.length
        const round = tcSpeechRound(state)
        for (const p of state.players) {
          const mine = (state.speech ?? []).filter((sp) => sp.playerId === p.id && sp.round === round)
          expect(mine.length).toBeLessThanOrEqual(p.isBot ? Math.min(TC_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0)
        }
        // Élagué à chaque parole : jamais plus de deux fenêtres au-delà de la dernière.
        expect((state.speech ?? []).every((sp) => sp.round >= (state.speech?.at(-1)?.round ?? 0) - 1)).toBe(true)
      }
      expect(state.phase).toBe('finished')
      windows += 1
    }
    expect([...seen].sort()).toEqual([...TC_SPEECH_KINDS].sort())
    // Sobre : une poignée de bulles par fenêtre de tours, pas un flot.
    expect(total / windows).toBeGreaterThan(0.5)
    expect(total / windows).toBeLessThan(3)
  })
})
