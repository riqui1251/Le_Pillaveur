import { describe, expect, it } from 'vitest'
import {
  createEspionState,
  currentEspionActorId,
  espionActive,
  reduceEspion,
  toEspionClientView,
  toEspionSpectatorView,
  EspionEngineError,
  ESPION_COUNTDOWN_MS,
  ESPION_ACCUSATION_WINDOW_MS,
  type EspionState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const LOCATIONS = ['Hôpital', 'Plage', 'École', 'Aéroport', 'Casino']
const T0 = 1_000_000
const DISCUSSION_MS = 60_000

function make(n = 4, seed: string | number = 'seed', roundsToWin = 3): EspionState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createEspionState(players, LOCATIONS, seed, T0 - ESPION_COUNTDOWN_MS, DISCUSSION_MS, roundsToWin)
  return reduceEspion(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

function spyOf(state: EspionState): string {
  return state.players.find((p) => p.role === 'spy')!.id
}

function crewOf(state: EspionState): string[] {
  return state.players.filter((p) => p.role === 'crew').map((p) => p.id)
}

describe('createEspionState', () => {
  it('borne 3-16 joueurs, countdown au lancement puis discussion chronométrée', () => {
    const three = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createEspionState(three.slice(0, 2), LOCATIONS, 1, T0)).toThrow(EspionEngineError)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createEspionState(seventeen, LOCATIONS, 1, T0)).toThrow(EspionEngineError)
    const raw = createEspionState(three, LOCATIONS, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + ESPION_COUNTDOWN_MS)
    const s = make(4)
    expect(s.phase).toBe('discussion')
    expect(s.phaseEndsAt).toBe(T0 + DISCUSSION_MS)
  })

  it('assigne exactement 1 espion, reproductible avec la même graine', () => {
    const s = make(4)
    expect(s.players.filter((p) => p.role === 'spy')).toHaveLength(1)
    expect(s.players.filter((p) => p.role === 'crew')).toHaveLength(3)
    expect(make(4)).toEqual(make(4))
  })

  it('refuse un pool de lieux vide', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createEspionState(four, [], 1, T0)).toThrow('NO_LOCATIONS')
  })
})

describe('ACCUSE / SUPPORT', () => {
  it('refuse de saccuser soi-même, une cible partie, ou une accusation déjà en cours', () => {
    const s = make(4)
    expect(() =>
      reduceEspion(s, { type: 'ACCUSE', playerId: 'p0', targetId: 'p0', now: T0 })
    ).toThrow('CANNOT_ACCUSE_SELF')
    const next = reduceEspion(s, { type: 'ACCUSE', playerId: 'p0', targetId: 'p1', now: T0 })
    expect(next.activeAccusation).toMatchObject({ accuserId: 'p0', targetId: 'p1', supporters: ['p0'] })
    expect(() =>
      reduceEspion(next, { type: 'ACCUSE', playerId: 'p2', targetId: 'p3', now: T0 })
    ).toThrow('ACCUSATION_IN_PROGRESS')
  })

  it('résout dès que la majorité des joueurs actifs soutient : espion accusé → crew gagne', () => {
    const s = make(4)
    const spy = spyOf(s)
    const crew = crewOf(s)
    let next = reduceEspion(s, { type: 'ACCUSE', playerId: crew[0], targetId: spy, now: T0 })
    expect(next.phase).toBe('discussion') // 1 soutien sur 4 actifs, majorité = 3
    next = reduceEspion(next, { type: 'SUPPORT', playerId: crew[1], now: T0 })
    expect(next.phase).toBe('discussion') // 2/4, toujours pas majorité
    next = reduceEspion(next, { type: 'SUPPORT', playerId: crew[2], now: T0 })
    expect(next.phase).toBe('reveal') // 3/4 → majorité atteinte
    expect(next.lastReveal?.outcome).toBe('spy-caught')
    expect(next.lastReveal?.winner).toBe('crew')
    expect(next.roundWins.crew).toBe(1)
    expect(next.activeAccusation).toBeNull()
  })

  it('accusation ratée (cible innocente) → l’espion gagne la manche', () => {
    const s = make(4)
    const spy = spyOf(s)
    const crew = crewOf(s)
    const innocentTarget = crew.find((id) => id !== crew[0])!
    let next = reduceEspion(s, { type: 'ACCUSE', playerId: crew[0], targetId: innocentTarget, now: T0 })
    const others = s.players.map((p) => p.id).filter((id) => id !== crew[0] && id !== innocentTarget)
    for (const id of others) {
      if (next.phase === 'reveal') break
      next = reduceEspion(next, { type: 'SUPPORT', playerId: id, now: T0 })
    }
    expect(next.phase).toBe('reveal')
    expect(next.lastReveal?.outcome).toBe('accusation-failed')
    expect(next.lastReveal?.winner).toBe('spy')
    expect(next.lastReveal?.spyId).toBe(spy)
  })

  it('refuse un second soutien du même joueur ou un soutien après expiration', () => {
    const s = make(4)
    const crew = crewOf(s)
    let next = reduceEspion(s, { type: 'ACCUSE', playerId: crew[0], targetId: crew[1], now: T0 })
    expect(() =>
      reduceEspion(next, { type: 'SUPPORT', playerId: crew[0], now: T0 })
    ).toThrow('ALREADY_SUPPORTED')
    expect(() =>
      reduceEspion(next, {
        type: 'SUPPORT',
        playerId: crew[2],
        now: T0 + ESPION_ACCUSATION_WINDOW_MS,
      })
    ).toThrow('ACCUSATION_EXPIRED')
  })

  it("ADVANCE résout une fenêtre d'accusation expirée sans majorité, sans clore la partie", () => {
    const s = make(4)
    const crew = crewOf(s)
    const accused = reduceEspion(s, { type: 'ACCUSE', playerId: crew[0], targetId: crew[1], now: T0 })
    const lapsed = reduceEspion(accused, {
      type: 'ADVANCE',
      claimedKey: phaseKey(accused),
      now: T0 + ESPION_ACCUSATION_WINDOW_MS,
    })
    expect(lapsed.activeAccusation).toBeNull()
    expect(lapsed.phase).toBe('discussion') // la discussion continue, rien n'est résolu
  })
})

describe('GUESS_LOCATION', () => {
  it("seul l'espion peut deviner ; bonne réponse → espion gagne, mauvaise → crew gagne", () => {
    const s = make(4)
    const spy = spyOf(s)
    const crew = crewOf(s)
    expect(() =>
      reduceEspion(s, { type: 'GUESS_LOCATION', playerId: crew[0], location: s.location, now: T0 })
    ).toThrow('NOT_SPY')
    const wrong = reduceEspion(s, {
      type: 'GUESS_LOCATION',
      playerId: spy,
      location: LOCATIONS.find((l) => l !== s.location)!,
      now: T0,
    })
    expect(wrong.lastReveal?.outcome).toBe('spy-guessed-wrong')
    expect(wrong.lastReveal?.winner).toBe('crew')

    const s2 = make(4, 'seed2')
    const spy2 = spyOf(s2)
    const right = reduceEspion(s2, {
      type: 'GUESS_LOCATION',
      playerId: spy2,
      location: s2.location,
      now: T0,
    })
    expect(right.lastReveal?.outcome).toBe('spy-guessed-right')
    expect(right.lastReveal?.winner).toBe('spy')
  })
})

describe('ADVANCE : timeout principal', () => {
  it('discussion écoulée sans résolution → l’espion gagne par défaut', () => {
    const s = make(4)
    const timedOut = reduceEspion(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + DISCUSSION_MS,
    })
    expect(timedOut.phase).toBe('reveal')
    expect(timedOut.lastReveal?.outcome).toBe('timeout')
    expect(timedOut.lastReveal?.winner).toBe('spy')
    expect(timedOut.roundWins.spy).toBe(1)
  })
})

describe('CONTINUE', () => {
  it('enchaîne la manche suivante (nouveau lieu, nouvel espion) puis termine au score cible', () => {
    let s = make(4, 'seed', 2)
    s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + DISCUSSION_MS })
    expect(s.roundWins.spy).toBe(1)
    s = reduceEspion(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('discussion')
    expect(s.round).toBe(2)
    expect(s.lastReveal).toBeNull()
    s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + DISCUSSION_MS })
    expect(s.roundWins.spy).toBe(2)
    s = reduceEspion(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
    expect(s.winnerTeam).toBe('spy')
  })

  it('refuse hors phase reveal ou pour un joueur inconnu', () => {
    const s = make(4)
    expect(() => reduceEspion(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })).toThrow('NOT_REVEAL')
  })
})

describe('LEAVE / REJOIN / REPLACE_LEFT', () => {
  it('un joueur parti ne compte plus dans la majorité requise', () => {
    let s = make(5)
    s = reduceEspion(s, { type: 'LEAVE', playerId: 'p4', at: T0 })
    expect(espionActive(s)).toHaveLength(4) // majorité = 3 sur actifs, pas 5
  })

  it('REJOIN restaure un joueur parti ; REPLACE_LEFT le convertit en bot après le délai', () => {
    let s = make(4)
    s = reduceEspion(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceEspion(s, { type: 'REJOIN', playerId: 'p0' })
    expect(s.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
    s = reduceEspion(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    expect(() =>
      reduceEspion(s, { type: 'REPLACE_LEFT', now: T0 + 1000, graceMs: 180_000 })
    ).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceEspion(s, { type: 'REPLACE_LEFT', now: T0 + 200_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
  })
})

describe('currentEspionActorId', () => {
  it('null pendant discussion (le vocal fait tout), premier joueur actif en reveal', () => {
    const s = make(4)
    expect(currentEspionActorId(s)).toBeNull()
    const revealing = reduceEspion(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + DISCUSSION_MS,
    })
    expect(currentEspionActorId(revealing)).toBe('p0')
  })
})

describe('vues anti-triche', () => {
  it("l'espion ne voit jamais le lieu, les autres si ; aucun rôle exposé avant la fin", () => {
    const s = make(4)
    const spy = spyOf(s)
    const crewId = crewOf(s)[0]
    const spyView = toEspionClientView(s, spy)
    expect(spyView.isSpy).toBe(true)
    expect(spyView.location).toBeNull()
    expect(spyView.players.every((p) => p.role === null)).toBe(true)
    const crewView = toEspionClientView(s, crewId)
    expect(crewView.isSpy).toBe(false)
    expect(crewView.location).toBe(s.location)
    expect(crewView.players.every((p) => p.role === null)).toBe(true)
  })

  it('le spectateur (TV) ne voit jamais le lieu avant la fin, même si un non-espion le verrait', () => {
    const s = make(4)
    const spectator = toEspionSpectatorView(s)
    expect(spectator.location).toBeNull()
    expect(spectator.isSpy).toBe(false)
    expect(JSON.stringify(spectator)).not.toContain(s.location)
  })

  it('révèle tout au reveal (lieu + rôles)', () => {
    const s = make(4)
    const resolved = reduceEspion(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + DISCUSSION_MS,
    })
    const view = toEspionClientView(resolved, 'p0')
    expect(view.location).toBe(s.location)
    expect(view.players.some((p) => p.role === 'spy')).toBe(true)
    const spectator = toEspionSpectatorView(resolved)
    expect(spectator.location).toBe(s.location)
    expect(spectator.players.some((p) => p.role === 'spy')).toBe(true)
  })

  it("allLocations/remainingLocations ne fuient jamais dans la vue client", () => {
    const s = make(4)
    const view = toEspionClientView(s, 'p0')
    expect(view).not.toHaveProperty('allLocations')
    expect(view).not.toHaveProperty('remainingLocations')
  })
})
