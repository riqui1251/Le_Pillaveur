import { describe, expect, it } from 'vitest'
import {
  createBluffState,
  currentBluffActorId,
  bluffActive,
  reduceBluff,
  toBluffClientView,
  toBluffSpectatorView,
  BluffEngineError,
  BLUFF_COUNTDOWN_MS,
  BLUFF_SUBMIT_MS,
  BLUFF_VOTE_MS,
  BLUFF_POINTS_FOUND_REAL,
  BLUFF_POINTS_PER_FOOLED,
  type BluffState,
  type BluffPrompt,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const PROMPTS: BluffPrompt[] = [
  { id: 'q1', q: 'Capitale du Japon ?', answer: 'Tokyo', decoys: ['Osaka', 'Kyoto', 'Nagoya'] },
  { id: 'q2', q: 'Capitale de l’Italie ?', answer: 'Rome', decoys: ['Milan', 'Turin', 'Naples'] },
  { id: 'q3', q: 'Capitale de l’Espagne ?', answer: 'Madrid', decoys: ['Séville', 'Valence', 'Bilbao'] },
]

const T0 = 1_000_000
const FOUR = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }))

/** Partie créée puis countdown consommé : phase submit pile à T0. */
function make(n = 4, seed: string | number = 'seed', rounds = 3): BluffState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createBluffState(players, PROMPTS, seed, T0 - BLUFF_COUNTDOWN_MS, rounds)
  return reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Fait soumettre un bluff distinct à tout le monde (jamais la vraie réponse). */
function submitAll(state: BluffState, now = T0): BluffState {
  let s = state
  for (const p of bluffActive(s)) {
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: p.id, text: `bluff-${p.id}`, now })
  }
  return s
}

describe('createBluffState', () => {
  it('borne 3-16 joueurs, countdown au lancement puis phase submit chronométrée', () => {
    expect(() => createBluffState(FOUR.slice(0, 2), PROMPTS, 1, T0)).toThrow(BluffEngineError)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createBluffState(seventeen, PROMPTS, 1, T0)).toThrow(BluffEngineError)
    const raw = createBluffState(FOUR, PROMPTS, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + BLUFF_COUNTDOWN_MS)
    expect(() =>
      reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    ).toThrow('NOT_EXPIRED')
    const s = make(4)
    expect(s.phase).toBe('submit')
    expect(s.phaseEndsAt).toBe(T0 + BLUFF_SUBMIT_MS)
  })

  it('tire les manches sans répétition, plafonné au nombre de prompts, reproductible', () => {
    const s = createBluffState(FOUR, PROMPTS, 'seed-x', T0, 10)
    expect(s.roundPrompts).toHaveLength(PROMPTS.length) // plafonné à 3
    const ids = s.roundPrompts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(createBluffState(FOUR, PROMPTS, 'seed-x', T0, 10)).toEqual(
      createBluffState(FOUR, PROMPTS, 'seed-x', T0, 10)
    )
  })

  it('refuse un pool de questions vide ou un nombre de manches invalide', () => {
    expect(() => createBluffState(FOUR, [], 1, T0)).toThrow('NO_PROMPTS')
    expect(() => createBluffState(FOUR, PROMPTS, 1, T0, 0)).toThrow('INVALID_ROUNDS_COUNT')
  })
})

describe('SUBMIT_FAKE', () => {
  it('valide la longueur, refuse hors phase et la double soumission', () => {
    const s = make(4)
    expect(() =>
      reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p0', text: '', now: T0 })
    ).toThrow('INVALID_FAKE')
    expect(() =>
      reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'x'.repeat(61), now: T0 })
    ).toThrow('INVALID_FAKE')
    const next = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'Osaka', now: T0 })
    expect(next.pendingFakes.p0).toBe('Osaka')
    expect(() =>
      reduceBluff(next, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'Kyoto', now: T0 })
    ).toThrow('ALREADY_SUBMITTED')
    const voteState = submitAll(s)
    expect(() =>
      reduceBluff(voteState, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'Osaka', now: T0 })
    ).toThrow('NOT_SUBMIT_PHASE')
  })

  it('passe en phase vote dès que tous les joueurs actifs ont soumis (résolution anticipée)', () => {
    const s = make(4)
    const next = submitAll(s)
    expect(next.phase).toBe('vote')
    expect(next.phaseEndsAt).toBe(T0 + BLUFF_VOTE_MS)
    // 1 vraie réponse + 4 bluffs.
    expect(next.candidates).toHaveLength(5)
    expect(next.candidates.filter((c) => c.isReal)).toHaveLength(1)
  })

  it('ADVANCE en phase submit construit le vote même avec des retardataires', () => {
    const s = make(4)
    const partial = reduceBluff(s, {
      type: 'SUBMIT_FAKE',
      playerId: 'p0',
      text: 'Osaka',
      now: T0,
    })
    const timedOut = reduceBluff(partial, {
      type: 'ADVANCE',
      claimedKey: phaseKey(partial),
      now: T0 + BLUFF_SUBMIT_MS,
    })
    expect(timedOut.phase).toBe('vote')
    // 1 vraie réponse + 1 seul bluff (les 3 autres n'ont rien soumis).
    expect(timedOut.candidates).toHaveLength(2)
  })

  it('un bluff identique (normalisé) à la vraie réponse est remplacé par un leurre', () => {
    const s = make(4)
    const currentPrompt = s.roundPrompts[s.promptIdx]
    let next = s
    for (const p of bluffActive(s)) {
      next = reduceBluff(next, {
        type: 'SUBMIT_FAKE',
        playerId: p.id,
        text: p.id === 'p0' ? currentPrompt.answer.toLowerCase() : `bluff-${p.id}`, // collision volontaire (casse différente)
        now: T0,
      })
    }
    expect(next.phase).toBe('vote')
    const p0Candidate = next.candidates.find((c) => c.authorId === 'p0')
    expect(p0Candidate?.text).not.toBe(currentPrompt.answer.toLowerCase())
    expect(currentPrompt.decoys).toContain(p0Candidate?.text)
  })
})

describe('VOTE', () => {
  function voteState(): BluffState {
    return submitAll(make(4))
  }

  it('refuse de voter pour son propre bluff, hors phase, ou deux fois', () => {
    const s = voteState()
    const ownCandidate = s.candidates.find((c) => c.authorId === 'p0')!
    expect(() =>
      reduceBluff(s, { type: 'VOTE', playerId: 'p0', candidateId: ownCandidate.candidateId, now: T0 })
    ).toThrow('CANNOT_VOTE_OWN_FAKE')
    const realCandidate = s.candidates.find((c) => c.isReal)!
    const next = reduceBluff(s, {
      type: 'VOTE',
      playerId: 'p0',
      candidateId: realCandidate.candidateId,
      now: T0,
    })
    expect(next.pendingVotes.p0).toBe(realCandidate.candidateId)
    expect(() =>
      reduceBluff(next, {
        type: 'VOTE',
        playerId: 'p0',
        candidateId: realCandidate.candidateId,
        now: T0,
      })
    ).toThrow('ALREADY_VOTED')
    const submitPhase = make(4)
    expect(() =>
      reduceBluff(submitPhase, {
        type: 'VOTE',
        playerId: 'p0',
        candidateId: realCandidate.candidateId,
        now: T0,
      })
    ).toThrow('NOT_VOTE_PHASE')
  })

  it('résout et attribue les points : trouver le vrai + tromper les autres', () => {
    const s = voteState()
    const currentPrompt = s.roundPrompts[s.promptIdx]
    const realCandidate = s.candidates.find((c) => c.isReal)!
    const fakeOfP1 = s.candidates.find((c) => c.authorId === 'p1')!
    // p0 et p2 votent la vraie réponse ; p3 se fait avoir par le bluff de p1.
    let next = reduceBluff(s, {
      type: 'VOTE',
      playerId: 'p0',
      candidateId: realCandidate.candidateId,
      now: T0,
    })
    next = reduceBluff(next, {
      type: 'VOTE',
      playerId: 'p2',
      candidateId: realCandidate.candidateId,
      now: T0,
    })
    next = reduceBluff(next, {
      type: 'VOTE',
      playerId: 'p3',
      candidateId: fakeOfP1.candidateId,
      now: T0,
    })
    next = reduceBluff(next, {
      type: 'VOTE',
      playerId: 'p1',
      candidateId: realCandidate.candidateId,
      now: T0,
    })
    expect(next.phase).toBe('reveal')
    const scoreOf = (id: string) => next.players.find((p) => p.id === id)!.score
    expect(scoreOf('p0')).toBe(BLUFF_POINTS_FOUND_REAL)
    expect(scoreOf('p2')).toBe(BLUFF_POINTS_FOUND_REAL)
    expect(scoreOf('p1')).toBe(BLUFF_POINTS_FOUND_REAL + BLUFF_POINTS_PER_FOOLED) // a trouvé + a trompé p3
    expect(scoreOf('p3')).toBe(0)
    expect(next.lastReveal?.realAnswer).toBe(currentPrompt.answer)
    expect(next.lastReveal?.pointsAwarded.p1).toBe(BLUFF_POINTS_FOUND_REAL + BLUFF_POINTS_PER_FOOLED)
  })
})

describe('CONTINUE', () => {
  it('enchaîne la manche suivante puis termine après la dernière (winnerId au score le plus haut)', () => {
    let s = submitAll(make(4, 'seed', 2))
    // Personne ne vote → ADVANCE résout par abstention.
    s = reduceBluff(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + BLUFF_VOTE_MS })
    expect(s.phase).toBe('reveal')
    s = reduceBluff(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('submit')
    expect(s.promptIdx).toBe(1)
    expect(s.lastReveal).toBeNull()
    s = submitAll(s)
    s = reduceBluff(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + BLUFF_VOTE_MS })
    s = reduceBluff(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
    // Tout le monde à 0 point (personne n'a voté) → égalité, pas de gagnant unique.
    expect(s.winnerId).toBeNull()
  })

  it('refuse hors phase reveal ou pour un joueur inconnu', () => {
    const s = make(4)
    expect(() => reduceBluff(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })).toThrow(
      'NOT_REVEAL'
    )
  })
})

describe('LEAVE / REJOIN / REPLACE_LEFT', () => {
  it('un joueur parti ne bloque plus la résolution anticipée', () => {
    let s = make(4)
    s = reduceBluff(s, { type: 'LEAVE', playerId: 'p3', at: T0 })
    expect(bluffActive(s)).toHaveLength(3)
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p2', text: 'c', now: T0 })
    expect(s.phase).toBe('vote') // les 3 actifs ont soumis, p3 (parti) n'est pas attendu
  })

  it('REJOIN restaure un joueur parti ; REPLACE_LEFT le convertit en bot après le délai', () => {
    let s = make(4)
    s = reduceBluff(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceBluff(s, { type: 'REJOIN', playerId: 'p0' })
    expect(s.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
    s = reduceBluff(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    expect(() =>
      reduceBluff(s, { type: 'REPLACE_LEFT', now: T0 + 1000, graceMs: 180_000 })
    ).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceBluff(s, {
      type: 'REPLACE_LEFT',
      now: T0 + 200_000,
      graceMs: 180_000,
    })
    expect(replaced.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
    expect(replaced.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
  })
})

describe('currentBluffActorId', () => {
  it('null pendant submit/vote (simultanés), premier joueur actif en reveal', () => {
    const s = make(4)
    expect(currentBluffActorId(s)).toBeNull()
    const voting = submitAll(s)
    expect(currentBluffActorId(voting)).toBeNull()
    const revealing = reduceBluff(voting, {
      type: 'ADVANCE',
      claimedKey: phaseKey(voting),
      now: T0 + BLUFF_VOTE_MS,
    })
    expect(currentBluffActorId(revealing)).toBe('p0')
  })
})

describe('vues anti-triche', () => {
  it('cache les bluffs des autres pendant submit, et isReal/authorId pendant vote', () => {
    const s = make(4)
    const withOneFake = reduceBluff(s, {
      type: 'SUBMIT_FAKE',
      playerId: 'p0',
      text: 'Osaka',
      now: T0,
    })
    const viewOfP1 = toBluffClientView(withOneFake, 'p1')
    expect(viewOfP1.myFake).toBeNull()
    expect(viewOfP1.players.find((p) => p.id === 'p0')?.hasSubmitted).toBe(true)
    // Le contenu du bluff de p0 n'apparaît nulle part dans la vue de p1.
    expect(JSON.stringify(viewOfP1)).not.toContain('Osaka')

    const voting = submitAll(s)
    const voteView = toBluffClientView(voting, 'p0')
    expect(voteView.voteOptions).toHaveLength(5)
    for (const opt of voteView.voteOptions!) {
      expect(opt).not.toHaveProperty('isReal')
      expect(opt).not.toHaveProperty('authorId')
    }
    expect(voteView.prompt).toBe(s.roundPrompts[s.promptIdx].q)
  })

  it('révèle tout au reveal ; le spectateur voit la même chose qu’un viewer neutre', () => {
    const base = make(4)
    const currentPrompt = base.roundPrompts[base.promptIdx]
    const s = submitAll(base)
    const resolved = reduceBluff(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + BLUFF_VOTE_MS,
    })
    const view = toBluffClientView(resolved, 'p0')
    expect(view.lastReveal?.realAnswer).toBe(currentPrompt.answer)
    expect(view.lastReveal?.candidates.every((c) => typeof c.isReal === 'boolean')).toBe(true)
    const spectator = toBluffSpectatorView(resolved)
    expect(spectator.lastReveal).toEqual(view.lastReveal)
    expect(spectator.myFake).toBeNull()
    expect(spectator.myVote).toBeNull()
  })

  it('roundPrompts (questions à venir) ne fuit jamais dans la vue client', () => {
    const s = make(4)
    const view = toBluffClientView(s, 'p0')
    expect(view).not.toHaveProperty('roundPrompts')
    expect(view.totalRounds).toBe(3)
  })
})
