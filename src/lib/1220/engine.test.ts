import { describe, expect, it } from 'vitest'
import {
  createGame1220State,
  reduceGame1220,
  currentGame1220ActorId,
  Game1220EngineError,
  defaultChoices1220,
  GAME_1220_SETUP_MS,
  type Game1220State,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Chris' },
]

/** Horloge FIXE : les tests d'échéance doivent rester déterministes. */
const T0 = 1_700_000_000_000

function freshState(): Game1220State {
  return createGame1220State(PLAYERS, 'seed-1220', T0)
}

function readyAll(state: Game1220State): Game1220State {
  let s = state
  for (const p of PLAYERS) s = reduceGame1220(s, { type: 'READY', playerId: p.id })
  return s
}

describe('création', () => {
  it('démarre en setup, choix par défaut, personne prêt', () => {
    const s = freshState()
    expect(s.phase).toBe('setup')
    expect(s.configs).toBeNull()
    expect(s.setupReady).toEqual([])
    for (const p of PLAYERS) expect(s.draft[p.id]).toEqual(defaultChoices1220())
  })

  it('les bots sont prêts d’office', () => {
    const s = createGame1220State([...PLAYERS, { id: 'bot-1', name: 'Bot', isBot: true }], 'seed')
    expect(s.setupReady).toEqual(['bot-1'])
  })

  it('jeu simultané : jamais de tour unique', () => {
    expect(currentGame1220ActorId(freshState())).toBeNull()
  })
})

describe('setup → play', () => {
  it('SET_DRAFT met à jour uniquement le joueur ciblé', () => {
    const s = reduceGame1220(freshState(), { type: 'SET_DRAFT', playerId: 'p1', choices: { drinkNumber: 4 } })
    expect(s.draft.p1.drinkNumber).toBe(4)
    expect(s.draft.p2).toEqual(defaultChoices1220())
  })

  it('refuse SET_DRAFT une fois prêt', () => {
    const ready = reduceGame1220(freshState(), { type: 'READY', playerId: 'p1' })
    expect(() =>
      reduceGame1220(ready, { type: 'SET_DRAFT', playerId: 'p1', choices: { drinkNumber: 5 } })
    ).toThrow(Game1220EngineError)
  })

  it('refuse READY si drinkNumber === giveNumber (clash)', () => {
    const clashed = reduceGame1220(freshState(), {
      type: 'SET_DRAFT',
      playerId: 'p1',
      choices: { giveNumber: defaultChoices1220().drinkNumber },
    })
    expect(() => reduceGame1220(clashed, { type: 'READY', playerId: 'p1' })).toThrow(Game1220EngineError)
  })

  it('reste en setup tant que tout le monde n’est pas prêt', () => {
    const s = reduceGame1220(freshState(), { type: 'READY', playerId: 'p1' })
    expect(s.phase).toBe('setup')
    expect(s.setupReady).toEqual(['p1'])
  })

  it('verrouille les configs et passe en play quand tous sont prêts', () => {
    const s = readyAll(freshState())
    expect(s.phase).toBe('play')
    expect(s.configs).toHaveLength(3)
    expect(s.configs?.map((c) => c.playerId).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('refuse ROLL avant la phase play', () => {
    expect(() => reduceGame1220(freshState(), { type: 'ROLL', playerId: 'p1' })).toThrow(Game1220EngineError)
  })
})

describe('play', () => {
  it('ROLL tire d12/d20 déterministes (même graine → même résultat)', () => {
    const a = reduceGame1220(readyAll(freshState()), { type: 'ROLL', playerId: 'p1' })
    const b = reduceGame1220(readyAll(freshState()), { type: 'ROLL', playerId: 'p2' })
    expect(a.lastRoll?.d12).toBe(b.lastRoll?.d12)
    expect(a.lastRoll?.d20).toBe(b.lastRoll?.d20)
    expect(a.lastRoll?.d12).toBeGreaterThanOrEqual(1)
    expect(a.lastRoll?.d12).toBeLessThanOrEqual(12)
    expect(a.lastRoll?.d20).toBeGreaterThanOrEqual(1)
    expect(a.lastRoll?.d20).toBeLessThanOrEqual(20)
  })

  it('ROLL évalue TOUS les joueurs (même celui qui ne lance pas)', () => {
    const s = reduceGame1220(readyAll(freshState()), { type: 'ROLL', playerId: 'p1' })
    const ids = s.lastRoll?.results.map((r) => r.playerId).sort()
    expect(ids).toEqual(['p1', 'p2', 'p3'])
  })

  it('empile l’historique (borné) et avance le RNG à chaque tir', () => {
    let s = readyAll(freshState())
    const rngBefore = s.rngState
    s = reduceGame1220(s, { type: 'ROLL', playerId: 'p1' })
    expect(s.rngState).not.toBe(rngBefore)
    s = reduceGame1220(s, { type: 'ROLL', playerId: 'p2' })
    expect(s.history).toHaveLength(2)
    expect(s.history[0]).toEqual(s.lastRoll)
  })

  it('END termine la partie', () => {
    const s = reduceGame1220(readyAll(freshState()), { type: 'END', playerId: 'p1' })
    expect(s.phase).toBe('finished')
  })

  it('refuse ROLL une fois finished', () => {
    const s = reduceGame1220(readyAll(freshState()), { type: 'END', playerId: 'p1' })
    expect(() => reduceGame1220(s, { type: 'ROLL', playerId: 'p2' })).toThrow(Game1220EngineError)
  })
})

describe('échéance de mise en place', () => {
  const expired = T0 + GAME_1220_SETUP_MS + 1

  it('pose une échéance sur la phase setup', () => {
    const s = freshState()
    expect(s.phaseEndsAt).toBe(T0 + GAME_1220_SETUP_MS)
    expect(s.phaseSeq).toBe(1)
  })

  it('refuse d’avancer avant l’échéance', () => {
    const s = freshState()
    expect(() =>
      reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + 1000 })
    ).toThrow(Game1220EngineError)
  })

  it('refuse une clé de phase périmée (tick concurrent déjà passé)', () => {
    const s = freshState()
    expect(() =>
      reduceGame1220(s, { type: 'ADVANCE', claimedKey: 'setup#42', now: expired })
    ).toThrow(Game1220EngineError)
  })

  it('à l’échéance, les retardataires sont déclarés prêts et la partie démarre', () => {
    let s = freshState()
    s = reduceGame1220(s, { type: 'READY', playerId: 'p1' })
    expect(s.phase).toBe('setup')
    s = reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: expired })
    expect(s.phase).toBe('play')
    expect(s.setupReady.sort()).toEqual(['p1', 'p2', 'p3'])
    expect(s.configs?.map((c) => c.playerId).sort()).toEqual(['p1', 'p2', 'p3'])
    // Le retardataire part avec les choix affichés à son écran.
    expect(s.configs?.find((c) => c.playerId === 'p2')).toMatchObject(defaultChoices1220())
  })

  it('conserve le brouillon d’un retardataire déclaré prêt d’office', () => {
    let s = reduceGame1220(freshState(), {
      type: 'SET_DRAFT',
      playerId: 'p2',
      choices: { drinkNumber: 4, giveNumber: 9 },
    })
    s = reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: expired })
    const cfg = s.configs?.find((c) => c.playerId === 'p2')
    expect(cfg?.drinkNumber).toBe(4)
    expect(cfg?.giveNumber).toBe(9)
  })

  it('retombe sur les choix par défaut si le brouillon est en conflit', () => {
    let s = reduceGame1220(freshState(), {
      type: 'SET_DRAFT',
      playerId: 'p3',
      choices: { giveNumber: defaultChoices1220().drinkNumber },
    })
    s = reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: expired })
    expect(s.configs?.find((c) => c.playerId === 'p3')).toMatchObject(defaultChoices1220())
  })

  it('ignore les joueurs partis et n’avance pas hors de la phase setup', () => {
    let s = reduceGame1220(freshState(), { type: 'LEAVE', playerId: 'p3', at: T0 + 10 })
    s = reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: expired })
    expect(s.phase).toBe('play')
    expect(s.configs?.map((c) => c.playerId).sort()).toEqual(['p1', 'p2'])
    // La phase play n'a plus d'échéance : le tick n'a plus rien à faire.
    expect(s.phaseEndsAt).toBeNull()
    expect(() =>
      reduceGame1220(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: expired })
    ).toThrow(Game1220EngineError)
  })
})

describe('départ / retour / remplacement', () => {
  it('LEAVE marque le joueur, REJOIN l’efface', () => {
    let s = reduceGame1220(freshState(), { type: 'LEAVE', playerId: 'p1', at: 1000 })
    expect(s.players.find((p) => p.id === 'p1')?.leftAt).toBe(1000)
    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'p1' })
    expect(s.players.find((p) => p.id === 'p1')?.leftAt).toBeNull()
  })

  it('le départ du dernier retardataire complète le quorum de prêts', () => {
    let s = freshState()
    s = reduceGame1220(s, { type: 'READY', playerId: 'p1' })
    s = reduceGame1220(s, { type: 'READY', playerId: 'p2' })
    expect(s.phase).toBe('setup')
    s = reduceGame1220(s, { type: 'LEAVE', playerId: 'p3', at: 500 })
    expect(s.phase).toBe('play')
    expect(s.configs?.map((c) => c.playerId).sort()).toEqual(['p1', 'p2'])
  })

  it('REPLACE_LEFT convertit les partis expirés en bots', () => {
    let s = reduceGame1220(freshState(), { type: 'LEAVE', playerId: 'p1', at: 100 })
    expect(() => reduceGame1220(s, { type: 'REPLACE_LEFT', now: 200, graceMs: 500 })).toThrow(
      Game1220EngineError
    )
    s = reduceGame1220(s, { type: 'REPLACE_LEFT', now: 1000, graceMs: 500 })
    const p1 = s.players.find((p) => p.id === 'p1')
    expect(p1?.isBot).toBe(true)
    expect(p1?.leftAt).toBeNull()
  })
})
