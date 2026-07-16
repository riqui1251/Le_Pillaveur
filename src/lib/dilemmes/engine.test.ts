import { describe, expect, it } from 'vitest'
import {
  createDilState,
  currentDilActorId,
  dilActive,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DilEngineError,
  DIL_COUNTDOWN_MS,
  DIL_VOTE_MS,
  type DilCard,
  type DilState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000
const CARDS: DilCard[] = [
  { kind: 'prefer', a: 'option A', b: 'option B' },
  { kind: 'never', text: 'dormi au travail' },
  { kind: 'who', text: 'finirait en garde à vue en premier ?' },
]

function fourPlayers(botLast = false) {
  return Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: botLast && i === 3,
  }))
}

function make(botLast = false, rounds = 3): DilState {
  const raw = createDilState(fourPlayers(botLast), CARDS, 'seed', T0 - DIL_COUNTDOWN_MS, rounds)
  return reduceDil(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

function voteAll(state: DilState, choice = 'A'): DilState {
  let s = state
  for (const p of dilActive(s)) {
    if (s.votes[p.id]) continue
    s = reduceDil(s, { type: 'VOTE', playerId: p.id, choice, now: T0 })
  }
  return s
}

describe('createDilState / début', () => {
  it('bornes 3-16, cartes tirées sans doublon, reproductible, bots votent dès l’entrée', () => {
    expect(() => createDilState(fourPlayers().slice(0, 2), CARDS, 1, T0)).toThrow(DilEngineError)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createDilState(seventeen, CARDS, 1, T0)).toThrow(DilEngineError)
    expect(createDilState(fourPlayers(), CARDS, 'x', T0)).toEqual(createDilState(fourPlayers(), CARDS, 'x', T0))

    const s = make(true)
    expect(s.phase).toBe('vote')
    expect(s.phaseEndsAt).toBe(T0 + DIL_VOTE_MS)
    expect(Object.keys(s.votes)).toEqual(['p3']) // le bot a déjà voté
  })
})

describe('VOTE', () => {
  it('valide le choix selon la carte, refuse le double vote ; dernier vote → reveal', () => {
    const s = make()
    expect(() =>
      reduceDil(s, { type: 'VOTE', playerId: 'p0', choice: 'Z', now: T0 })
    ).toThrow('INVALID_CHOICE')
    const once = reduceDil(s, { type: 'VOTE', playerId: 'p0', choice: 'A', now: T0 })
    expect(() =>
      reduceDil(once, { type: 'VOTE', playerId: 'p0', choice: 'B', now: T0 })
    ).toThrow('ALREADY_VOTED')
    const all = voteAll(s)
    expect(all.phase).toBe('reveal')
    expect(all.lastReveal).toHaveLength(4)
    expect(currentDilActorId(all)).toBe('p0')
  })

  it('carte « qui de la table » : vote pour un joueur actif, jamais soi-même', () => {
    let s = make(false, 3)
    s = voteAll(s)
    s = reduceDil(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    s = voteAll(s, 'A') // carte 2 (never) → A/B valides
    s = reduceDil(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    // carte 3 : who
    expect(s.cards[s.round].kind).toBe('who')
    expect(() =>
      reduceDil(s, { type: 'VOTE', playerId: 'p0', choice: 'p0', now: T0 })
    ).toThrow('INVALID_CHOICE')
    const ok = reduceDil(s, { type: 'VOTE', playerId: 'p0', choice: 'p2', now: T0 })
    expect(ok.votes.p0).toBe('p2')
  })

  it('timeout de vote : les retardataires s’abstiennent, révélation quand même', () => {
    let s = make()
    s = reduceDil(s, { type: 'VOTE', playerId: 'p1', choice: 'B', now: T0 })
    s = reduceDil(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + DIL_VOTE_MS })
    expect(s.phase).toBe('reveal')
    expect(s.lastReveal).toHaveLength(1)
  })
})

describe('CONTINUE / fin', () => {
  it('enchaîne les cartes puis finit sans vainqueur (pas de classement, par design)', () => {
    let s = make(false, 2)
    s = voteAll(s)
    s = reduceDil(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('vote')
    expect(s.round).toBe(1)
    s = voteAll(s, 'B')
    s = reduceDil(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
  })
})

describe('vues', () => {
  it('votes secrets pendant le vote, publics au reveal, jamais les cartes à venir', () => {
    const s = reduceDil(make(), { type: 'VOTE', playerId: 'p1', choice: 'A', now: T0 })
    const view = toDilClientView(s, 'p0')
    expect(view.myVote).toBeNull()
    expect(view.players.find((p) => p.id === 'p1')?.hasVoted).toBe(true)
    expect(JSON.stringify(view)).not.toContain('"votes"')
    expect(view.card).toEqual(CARDS.find((c) => c.kind === s.cards[0].kind))
    expect(view.totalRounds).toBe(3)

    const done = voteAll(s)
    const reveal = toDilSpectatorView(done)
    expect(reveal.lastReveal).toHaveLength(4)
  })
})
