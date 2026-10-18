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
  ESPION_QUESTION_TIMEOUT_MS,
  ESPION_SPEECH_CAP,
  espionAskError,
  espionQuestionCap,
  pendingEspionQuestion,
  type EspionSpeech,
  type EspionState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  ESPION_LOCATION_IDS,
  espionLocationIdOf,
  espionLocationName,
  espionLocationsFor,
  getEspionLocations,
  normalizeEspionLocationName,
} from './data'
import { ESPION_QUESTION_IDS, ESPION_QUESTIONS } from './data/questions'

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

  it('la cible ne soutient pas sa propre accusation', () => {
    const s = make(4)
    const accused = reduceEspion(s, { type: 'ACCUSE', playerId: 'p0', targetId: 'p1', now: T0 })
    expect(() => reduceEspion(accused, { type: 'SUPPORT', playerId: 'p1', now: T0 })).toThrow('CANNOT_SUPPORT_SELF')
    expect(reduceEspion(accused, { type: 'SUPPORT', playerId: 'p2', now: T0 }).activeAccusation?.supporters).toEqual([
      'p0',
      'p2',
    ])
  })

  it('refuse un second soutien du même joueur ou un soutien après expiration', () => {
    const s = make(4)
    const crew = crewOf(s)
    const next = reduceEspion(s, { type: 'ACCUSE', playerId: crew[0], targetId: crew[1], now: T0 })
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

  it('par identifiant : le bon id gagne, un autre perd', () => {
    const s = make(4)
    const spy = spyOf(s)
    const rightId = espionLocationIdOf(s.location)!
    expect(rightId).not.toBeNull()
    const right = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spy, locationId: rightId, now: T0 })
    expect(right.lastReveal?.outcome).toBe('spy-guessed-right')
    const wrongId = espionLocationsFor('fr').find((l) => l.id !== rightId)!.id
    const wrong = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spy, locationId: wrongId, now: T0 })
    expect(wrong.lastReveal?.outcome).toBe('spy-guessed-wrong')
    const unknown = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spy, locationId: 'nulle-part', now: T0 })
    expect(unknown.lastReveal?.outcome).toBe('spy-guessed-wrong')
  })

  it('par nom (client resté ouvert) : comparé après normalisation', () => {
    const s = make(4)
    const spy = spyOf(s)
    const shouted = `  ${s.location.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `
    const right = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spy, location: shouted, now: T0 })
    expect(right.lastReveal?.outcome).toBe('spy-guessed-right')
  })

  it('sans id ni nom : refusé, la manche continue', () => {
    const s = make(4)
    expect(() => reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spyOf(s), now: T0 })).toThrow('INVALID_GUESS')
  })

  it('salle en anglais, grille de l’espion en français : la devinette est juste', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    for (const seed of ['en-1', 'en-2', 'en-3']) {
      const raw = createEspionState(players, getEspionLocations('en'), seed, T0 - ESPION_COUNTDOWN_MS, DISCUSSION_MS)
      const s = reduceEspion(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
      const frEntry = espionLocationsFor('fr').find((l) => l.id === espionLocationIdOf(s.location))!
      expect(frEntry).toBeDefined()
      const byId = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spyOf(s), locationId: frEntry.id, now: T0 })
      expect(byId.lastReveal?.outcome).toBe('spy-guessed-right')
      // Un ancien client envoyait le nom français : l'id réconcilie aussi les deux langues.
      const byName = reduceEspion(s, { type: 'GUESS_LOCATION', playerId: spyOf(s), location: frEntry.name, now: T0 })
      expect(byName.lastReveal?.outcome).toBe('spy-guessed-right')
    }
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
    // Le reveal de la manche 1 reste lisible en manche 2 : les remarques des bots visent son espion.
    expect(s.lastReveal).toMatchObject({ round: 1, outcome: 'timeout' })
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

  it('ne tire jamais espion un joueur parti (200 graines)', () => {
    const spies = new Set<string>()
    for (let seed = 0; seed < 200; seed += 1) {
      let s = make(5, seed, 3)
      s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + DISCUSSION_MS })
      s = reduceEspion(s, { type: 'LEAVE', playerId: 'p1', at: T0 })
      s = reduceEspion(s, { type: 'LEAVE', playerId: 'p3', at: T0 })
      s = reduceEspion(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
      const spy = s.players.filter((p) => p.role === 'spy')
      expect(spy, `graine ${seed}`).toHaveLength(1)
      expect(spy[0].leftAt, `graine ${seed}`).toBeNull()
      spies.add(spy[0].id)
    }
    expect([...spies].sort()).toEqual(['p0', 'p2', 'p4'])
  })

  it('table entièrement partie : le tirage retombe sur toute la table', () => {
    let s = make(3)
    s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + DISCUSSION_MS })
    for (const id of ['p0', 'p1', 'p2']) s = reduceEspion(s, { type: 'LEAVE', playerId: id, at: T0 })
    s = reduceEspion(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.players.filter((p) => p.role === 'spy')).toHaveLength(1)
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

// ─── Fil de questions et réponses (lot 2) ────────────────────────────────────

const ask = (s: EspionState, playerId: string, targetId: string, questionId: string, now = T0) =>
  reduceEspion(s, { type: 'ASK', playerId, targetId, questionId, now })
const answer = (s: EspionState, playerId: string, value: string, now = T0) =>
  reduceEspion(s, { type: 'ANSWER', playerId, value, now })
/** Question puis réponse : la main se libère tout de suite. */
const exchange = (s: EspionState, asker: string, target: string, questionId: string, now = T0, value = 'any') =>
  answer(ask(s, asker, target, questionId, now), target, value, now)
const accuse = (s: EspionState, playerId: string, targetId: string, now = T0) =>
  reduceEspion(s, { type: 'ACCUSE', playerId, targetId, now })
const support = (s: EspionState, playerId: string, now = T0) => reduceEspion(s, { type: 'SUPPORT', playerId, now })
const decline = (s: EspionState, playerId: string, now = T0) => reduceEspion(s, { type: 'DECLINE', playerId, now })
const speak = (s: EspionState, playerId: string, kind: EspionSpeech['kind'], targetId: string, now = T0) =>
  reduceEspion(s, { type: 'SPEAK', playerId, kind, targetId, now })
const leave = (s: EspionState, playerId: string) => reduceEspion(s, { type: 'LEAVE', playerId, at: T0 })
const roundSpeech = (s: EspionState) => (s.speech ?? []).filter((sp) => sp.round === s.round)
const lastEntry = (s: EspionState) => roundSpeech(s).slice(-1)[0]
/** Partie encore au compte à rebours. */
const counting = () =>
  createEspionState(
    Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    LOCATIONS,
    'seed',
    T0 - ESPION_COUNTDOWN_MS,
    DISCUSSION_MS
  )

describe('fil : ASK (questions par boutons)', () => {
  it('seulement en discussion, sans accusation en cours ni question en attente', () => {
    expect(() => ask(counting(), 'p0', 'p1', 'where')).toThrow('NOT_DISCUSSION_PHASE')
    const s = make(4)
    expect(() => ask(accuse(s, 'p2', 'p3'), 'p0', 'p1', 'where')).toThrow('ACCUSATION_IN_PROGRESS')
    const asked = ask(s, 'p0', 'p1', 'where')
    expect(roundSpeech(asked)).toEqual([
      { playerId: 'p0', kind: 'question', targetId: 'p1', round: 1, at: T0, questionId: 'where' },
    ])
    expect(asked.version).toBe(s.version + 1)
    expect(() => ask(asked, 'p2', 'p3', 'when', T0 + 1_000)).toThrow('QUESTION_PENDING')
  })

  it('une question sans réponse expire à 25 s et libère la main', () => {
    const asked = ask(make(4), 'p0', 'p1', 'where')
    const justBefore = T0 + ESPION_QUESTION_TIMEOUT_MS - 1
    expect(pendingEspionQuestion(asked, justBefore)).toEqual({
      askerId: 'p0',
      targetId: 'p1',
      questionId: 'where',
      askedAt: T0,
    })
    expect(() => ask(asked, 'p2', 'p3', 'when', justBefore)).toThrow('QUESTION_PENDING')
    const expired = T0 + ESPION_QUESTION_TIMEOUT_MS
    expect(pendingEspionQuestion(asked, expired)).toBeNull()
    expect(() => answer(asked, 'p1', 'inside', expired)).toThrow('NO_PENDING_QUESTION')
    expect(pendingEspionQuestion(ask(asked, 'p2', 'p3', 'when', expired), expired)?.askerId).toBe('p2')
  })

  it('un interrogé parti libère la main sans attendre l’expiration', () => {
    const asked = ask(make(4), 'p0', 'p1', 'where')
    expect(pendingEspionQuestion(leave(asked, 'p1'), T0 + 1)).toBeNull()
  })

  it('l’interrogé ne devient pas l’acteur courant (ni tour, ni AFK)', () => {
    expect(currentEspionActorId(ask(make(4), 'p0', 'p1', 'where'))).toBeNull()
  })

  it('cible active autre que soi, question connue, demandeur présent', () => {
    const s = make(4)
    expect(() => ask(s, 'p0', 'p0', 'where')).toThrow('CANNOT_ASK_SELF')
    expect(() => ask(s, 'p0', 'p9', 'where')).toThrow('INVALID_TARGET')
    const left = leave(s, 'p3')
    expect(() => ask(left, 'p0', 'p3', 'where')).toThrow('INVALID_TARGET')
    expect(() => ask(left, 'p3', 'p1', 'where')).toThrow('UNKNOWN_PLAYER')
    expect(() => ask(s, 'p0', 'p1', 'weather')).toThrow('UNKNOWN_QUESTION')
  })

  it('NO_ASK_BACK : on ne renvoie pas la question à qui vient de nous la poser', () => {
    let s = exchange(make(4), 'p0', 'p1', 'where')
    expect(() => ask(s, 'p1', 'p0', 'when')).toThrow('NO_ASK_BACK')
    s = exchange(s, 'p1', 'p2', 'when')
    s = exchange(s, 'p2', 'p3', 'price')
    expect(() => ask(s, 'p3', 'p2', 'food')).toThrow('NO_ASK_BACK')
    // D'autres questions sont passées depuis : p1 peut de nouveau interroger p0.
    expect(lastEntry(ask(s, 'p1', 'p0', 'food'))).toMatchObject({ playerId: 'p1', targetId: 'p0', questionId: 'food' })
  })

  it('une même question au plus 2 fois par manche', () => {
    let s = exchange(make(4), 'p0', 'p1', 'where')
    s = exchange(s, 'p2', 'p3', 'where')
    expect(() => ask(s, 'p1', 'p2', 'where')).toThrow('QUESTION_EXHAUSTED')
    expect(() => ask(s, 'p1', 'p2', 'when')).not.toThrow()
  })

  it('3 questions par joueur et par manche', () => {
    let s = make(4)
    s = exchange(s, 'p0', 'p1', 'where')
    s = exchange(s, 'p0', 'p2', 'when')
    s = exchange(s, 'p0', 'p3', 'price')
    expect(() => ask(s, 'p0', 'p1', 'food')).toThrow('ASK_LIMIT')
    expect(() => ask(s, 'p1', 'p2', 'food')).not.toThrow()
  })

  it('plafond de la manche : deux questions par joueur actif, entre 6 et 14', () => {
    expect([1, 3, 4, 5, 7, 8, 16].map(espionQuestionCap)).toEqual([6, 6, 8, 10, 14, 14, 14])
    let s = make(3)
    const plan: [string, string, string][] = [
      ['p0', 'p1', 'where'],
      ['p1', 'p2', 'when'],
      ['p2', 'p0', 'price'],
      ['p0', 'p1', 'outfit'],
      ['p1', 'p2', 'noise'],
      ['p2', 'p0', 'food'],
    ]
    for (const [asker, target, q] of plan) s = exchange(s, asker, target, q)
    expect(roundSpeech(s).filter((sp) => sp.kind === 'question')).toHaveLength(6)
    expect(() => ask(s, 'p0', 'p1', 'crowd')).toThrow('QUESTION_LIMIT')
  })

  it('lues sur la vue d’un joueur, les règles rendent le même verdict que sur l’état', () => {
    let s = exchange(make(4), 'p0', 'p1', 'where')
    s = ask(s, 'p2', 'p3', 'when', T0 + 1_000)
    const view = toEspionClientView(s, 'p1')
    for (const now of [T0 + 2_000, T0 + 1_000 + ESPION_QUESTION_TIMEOUT_MS]) {
      expect(pendingEspionQuestion(view, now)).toEqual(pendingEspionQuestion(s, now))
      for (const [asker, target, q] of [
        ['p1', 'p0', 'food'],
        ['p0', 'p2', 'food'],
        ['p0', 'p1', 'where'],
      ]) {
        expect(espionAskError(view, asker, target, q, now)).toBe(espionAskError(s, asker, target, q, now))
      }
    }
  })
})

describe('fil : ANSWER', () => {
  it('réservé à l’interrogé de la question en attente', () => {
    const s = make(4)
    expect(() => answer(s, 'p1', 'inside')).toThrow('NO_PENDING_QUESTION')
    const asked = ask(s, 'p0', 'p1', 'where')
    expect(() => answer(asked, 'p2', 'inside')).toThrow('NO_PENDING_QUESTION')
    expect(() => answer(asked, 'p0', 'inside')).toThrow('NO_PENDING_QUESTION')
    const answered = answer(asked, 'p1', 'outside', T0 + 3_000)
    expect(lastEntry(answered)).toEqual({
      playerId: 'p1',
      kind: 'answer',
      targetId: 'p0',
      round: 1,
      at: T0 + 3_000,
      questionId: 'where',
      value: 'outside',
    })
    expect(pendingEspionQuestion(answered, T0 + 3_000)).toBeNull()
    expect(() => answer(answered, 'p1', 'inside', T0 + 3_000)).toThrow('NO_PENDING_QUESTION')
  })

  it('chaque question accepte ses valeurs et any, et seulement elles', () => {
    for (const q of ESPION_QUESTION_IDS) {
      const asked = ask(make(4), 'p0', 'p1', q)
      const own = ESPION_QUESTIONS[q] as readonly string[]
      for (const value of [...own, 'any']) expect(lastEntry(answer(asked, 'p1', value)).value).toBe(value)
      const foreign = ESPION_QUESTION_IDS.flatMap((other) => ESPION_QUESTIONS[other]).filter((v) => !own.includes(v))
      for (const value of [...foreign, 'plage', '']) {
        expect(() => answer(asked, 'p1', value), `${q} = ${value}`).toThrow('INVALID_ANSWER')
      }
    }
  })

  it('une réponse reste permise pendant une accusation', () => {
    const asked = ask(make(5), 'p0', 'p1', 'when')
    const answered = answer(accuse(asked, 'p2', 'p3', T0 + 1_000), 'p1', 'night', T0 + 2_000)
    expect(answered.activeAccusation).not.toBeNull()
    expect(roundSpeech(answered).map((sp) => sp.kind)).toEqual(['question', 'accuse', 'answer'])
  })
})

describe('fil : accusations, soutiens et refus', () => {
  it('ACCUSE inscrit une entrée accuse affichée, avec une liste de refus vide', () => {
    const s = accuse(make(4), 'p0', 'p1')
    expect(s.activeAccusation?.declined).toEqual([])
    expect(roundSpeech(s)).toEqual([{ playerId: 'p0', kind: 'accuse', targetId: 'p1', round: 1, at: T0 }])
  })

  it('DECLINE : une seule fois, ni accusateur ni cible, ni après un soutien', () => {
    const s = make(6)
    expect(() => decline(s, 'p2')).toThrow('NO_ACTIVE_ACCUSATION')
    let a = accuse(s, 'p0', 'p1')
    expect(() => decline(a, 'p0')).toThrow('CANNOT_DECLINE')
    expect(() => decline(a, 'p1')).toThrow('CANNOT_DECLINE')
    a = support(a, 'p2')
    expect(() => decline(a, 'p2')).toThrow('ALREADY_SUPPORTED')
    a = decline(a, 'p3')
    expect(a.activeAccusation?.declined).toEqual(['p3'])
    expect(() => decline(a, 'p3')).toThrow('ALREADY_DECLINED')
    expect(() => support(a, 'p3')).toThrow('ALREADY_DECLINED')
    expect(() => decline(a, 'p4', T0 + ESPION_ACCUSATION_WINDOW_MS)).toThrow('ACCUSATION_EXPIRED')
    expect(() => decline(leave(a, 'p5'), 'p5')).toThrow('UNKNOWN_PLAYER')
  })

  it('seuls le premier soutien et le premier refus d’une accusation font une bulle', () => {
    // 8 actifs, majorité 5 : jamais atteinte ici, jamais hors d'atteinte non plus.
    let a = accuse(make(8), 'p0', 'p1')
    a = support(a, 'p2')
    a = support(a, 'p3')
    a = decline(a, 'p4')
    a = decline(a, 'p5')
    a = support(a, 'p6')
    expect(a.activeAccusation).not.toBeNull()
    const shown = (s: EspionState) => roundSpeech(s).map((sp) => [sp.playerId, sp.kind, sp.quiet ?? false])
    expect(shown(a)).toEqual([
      ['p0', 'accuse', false],
      ['p2', 'rally', false],
      ['p3', 'rally', true],
      ['p4', 'doubt', false],
      ['p5', 'doubt', true],
      ['p6', 'rally', true],
    ])
    expect(roundSpeech(a).every((sp) => sp.targetId === 'p1')).toBe(true)

    // L'accusation expire ; la suivante a de nouveau droit à ses deux bulles.
    let b = reduceEspion(a, { type: 'ADVANCE', claimedKey: phaseKey(a), now: a.activeAccusation!.endsAt })
    expect(b.activeAccusation).toBeNull()
    b = accuse(b, 'p7', 'p2', T0 + 20_000)
    b = decline(b, 'p3', T0 + 21_000)
    b = support(b, 'p4', T0 + 21_000)
    expect(shown(b).slice(-3)).toEqual([
      ['p7', 'accuse', false],
      ['p3', 'doubt', false],
      ['p4', 'rally', false],
    ])
  })

  it('rejet anticipé : soutiens + indécis sous la majorité, l’accusation s’efface sans pénalité', () => {
    // 5 actifs, majorité 3.
    let a = accuse(make(5), 'p0', 'p1')
    a = decline(a, 'p2')
    expect(a.activeAccusation).not.toBeNull() // 1 soutien + 2 indécis = 3
    a = decline(a, 'p3')
    expect(a.activeAccusation).toBeNull() // 1 + 1 = 2 < 3
    expect(a.phase).toBe('discussion')
    expect(a.roundWins).toEqual({ spy: 0, crew: 0 })
    expect(a.lastReveal).toBeNull()
    expect(roundSpeech(a).map((sp) => sp.kind)).toEqual(['accuse', 'doubt', 'doubt'])
    expect(accuse(a, 'p4', 'p0', T0 + 1).activeAccusation?.accuserId).toBe('p4')
  })

  it('rejet anticipé : les soutiens acquis comptent, les partis non', () => {
    // 6 actifs, majorité 4 : p0 accuse, p2 soutient.
    let a = support(accuse(make(6), 'p0', 'p1'), 'p2')
    a = decline(a, 'p3')
    expect(a.activeAccusation).not.toBeNull() // 2 + 2 (p4, p5) = 4
    a = decline(a, 'p4')
    expect(a.activeAccusation).toBeNull() // 2 + 1 = 3 < 4
  })

  it('sans refus, la règle reste inerte : une accusation sans issue attend sa fenêtre', () => {
    // 2 actifs sur 4 : majorité 2, et la cible ne peut pas soutenir.
    const a = accuse(leave(leave(make(4), 'p2'), 'p3'), 'p0', 'p1')
    expect(a.activeAccusation).not.toBeNull()
  })
})

describe('fil : SPEAK (paroles libres)', () => {
  it('kinds libres seulement, cible active autre que soi, en discussion', () => {
    const s = make(4)
    for (const kind of ['question', 'answer', 'accuse', 'rally', 'doubt'] as const) {
      expect(() => speak(s, 'p0', kind, 'p1'), kind).toThrow('INVALID_KIND')
    }
    expect(() => speak(s, 'p0', 'suspect', 'p0')).toThrow('INVALID_TARGET')
    expect(() => speak(leave(s, 'p1'), 'p0', 'suspect', 'p1')).toThrow('INVALID_TARGET')
    expect(() => speak(counting(), 'p0', 'suspect', 'p1')).toThrow('NOT_DISCUSSION_PHASE')
    expect(roundSpeech(speak(s, 'p0', 'defend', 'p1'))).toEqual([
      { playerId: 'p0', kind: 'defend', targetId: 'p1', round: 1, at: T0 },
    ])
  })

  it(`au plus ${ESPION_SPEECH_CAP} paroles libres par joueur et par manche ; questions et accusations n’y comptent pas`, () => {
    let s = exchange(make(4), 'p0', 'p1', 'where')
    s = accuse(s, 'p0', 'p2')
    s = speak(s, 'p0', 'suspect', 'p2')
    s = speak(s, 'p0', 'ally', 'p3')
    expect(() => speak(s, 'p0', 'wrong', 'p3')).toThrow('ALREADY_SPOKE')
    expect(() => speak(s, 'p1', 'suspect', 'p2')).not.toThrow()
  })
})

describe('fil : élagage et compatibilité', () => {
  const nextRound = (s: EspionState): EspionState => {
    const revealing = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    return reduceEspion(revealing, { type: 'CONTINUE', playerId: 'p0', now: s.phaseEndsAt! + 1 })
  }

  it('au CONTINUE, on ne garde que la manche courante et la précédente', () => {
    let s = exchange(make(4, 'seed', 5), 'p0', 'p1', 'where')
    s = nextRound(s)
    expect(s.round).toBe(2)
    expect(s.speech?.map((sp) => sp.round)).toEqual([1, 1])
    const start = s.phaseEndsAt! - DISCUSSION_MS
    // Les compteurs sont par manche : p1 peut de nouveau interroger p0, la question « where » est neuve.
    s = exchange(s, 'p1', 'p0', 'where', start)
    expect(s.speech?.map((sp) => sp.round)).toEqual([1, 1, 2, 2])
    s = nextRound(s)
    expect(s.round).toBe(3)
    expect(s.speech?.map((sp) => sp.round)).toEqual([2, 2])
  })

  it('une partie d’avant le fil (ni speech ni declined) se joue sans faute', () => {
    const accused = accuse(make(5), 'p0', 'p1')
    const { speech: _speech, ...base } = accused
    void _speech
    const { declined: _declined, ...oldAccusation } = accused.activeAccusation!
    void _declined
    let s: EspionState = { ...base, activeAccusation: oldAccusation }
    s = support(s, 'p2')
    s = decline(s, 'p3')
    expect(s.activeAccusation?.declined).toEqual(['p3'])
    expect(roundSpeech(s).map((sp) => [sp.kind, sp.quiet ?? false])).toEqual([
      ['rally', false],
      ['doubt', false],
    ])
    const calm: EspionState = { ...base, activeAccusation: null }
    expect(pendingEspionQuestion(calm, T0)).toBeNull()
    expect(roundSpeech(ask(calm, 'p0', 'p1', 'where'))).toHaveLength(1)
  })
})

describe('fil : vues anti-triche', () => {
  const LANGS = ['fr', 'en', 'es', 'it'] as const
  /** Mots normalisés, bornés : « Mine » ne se lit pas dans « minutes ». */
  const words = (text: string) => ` ${normalizeEspionLocationName(text).replace(/[^a-z0-9]+/g, ' ').trim()} `

  /** Une manche animée : des échanges, une question en attente, une accusation soutenue et refusée. */
  function busy(s: EspionState): EspionState {
    let t = exchange(s, 'p0', 'p1', 'where', T0 + 1_000, 'inside')
    t = exchange(t, 'p1', 'p2', 'price', T0 + 2_000, 'pricey')
    t = exchange(t, 'p2', 'p3', 'company', T0 + 3_000, 'any')
    t = exchange(t, 'p3', 'p4', 'mood', T0 + 4_000, 'fun')
    t = ask(t, 'p4', 'p0', 'when', T0 + 4_500)
    t = accuse(t, 'p4', 'p0', T0 + 5_000)
    t = support(t, 'p1', T0 + 6_000)
    t = decline(t, 'p2', T0 + 6_500)
    return speak(t, 'p0', 'defend', 'p4', T0 + 7_000)
  }

  it('à fil égal, la vue de l’espion est identique quel que soit le lieu', () => {
    const s = busy(make(5))
    expect(s.activeAccusation).not.toBeNull()
    const spy = spyOf(s)
    const elsewhere: EspionState = {
      ...s,
      location: LOCATIONS.find((l) => l !== s.location)!,
      allLocations: [...s.allLocations].reverse(),
      remainingLocations: [],
    }
    expect(JSON.stringify(toEspionClientView(elsewhere, spy))).toBe(JSON.stringify(toEspionClientView(s, spy)))
  })

  it('la vue d’un équipier est identique quel que soit l’espion parmi les autres', () => {
    const s = busy(make(5))
    const withSpy = (spyId: string): EspionState => ({
      ...s,
      players: s.players.map((p) => ({ ...p, role: p.id === spyId ? 'spy' : 'crew' })),
    })
    for (const viewer of s.players) {
      const views = s.players
        .filter((p) => p.id !== viewer.id)
        .map((p) => JSON.stringify(toEspionClientView(withSpy(p.id), viewer.id)))
      expect(new Set(views).size, viewer.id).toBe(1)
    }
  })

  it('avant le reveal, la vue TV ne nomme le lieu dans aucune langue, ni par son id', () => {
    for (const roomLang of ['fr', 'en'] as const) {
      const names = getEspionLocations(roomLang)
      ESPION_LOCATION_IDS.forEach((id, i) => {
        const s = busy({ ...make(5), location: names[i] })
        const tv = words(JSON.stringify(toEspionSpectatorView(s)))
        for (const needle of [id, ...LANGS.map((lang) => espionLocationName(id, lang))]) {
          expect(tv.includes(words(needle)), `${roomLang} ${id} : ${needle}`).toBe(false)
        }
        // Témoin : le même relevé trouve bien le lieu dans la vue d'un équipier.
        expect(words(JSON.stringify(toEspionClientView(s, crewOf(s)[0]))).includes(words(names[i]))).toBe(true)
      })
    }
  })

  it('aucune vue ne porte de repère « colle au lieu » (décision du propriétaire)', () => {
    const s = busy(make(5))
    expect(pendingEspionQuestion(s, T0 + 7_000)?.targetId).toBe('p0')
    const views = [...s.players.map((p) => toEspionClientView(s, p.id)), toEspionSpectatorView(s)]
    for (const view of views) expect(JSON.stringify(view)).not.toContain('"hint"')
  })
})
