import { describe, expect, it } from 'vitest'
import {
  createMCState,
  currentMCActorId,
  mcRemainingFor,
  mcSpymasterOf,
  reduceMC,
  toMCClientView,
  toMCSpectatorView,
  MCEngineError,
  MC_CLUE_MS,
  MC_COUNTDOWN_MS,
  MC_GRID,
  type MCState,
  type MCTeam,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000
const WORDS = Array.from({ length: 40 }, (_, i) => `mot${i}`)

function sixPlayers() {
  return [
    { id: 'g1', name: 'G1', team: 'gold' as MCTeam },
    { id: 'g2', name: 'G2', team: 'gold' as MCTeam },
    { id: 'g3', name: 'G3', team: 'gold' as MCTeam },
    { id: 'r1', name: 'R1', team: 'red' as MCTeam },
    { id: 'r2', name: 'R2', team: 'red' as MCTeam },
    { id: 'r3', name: 'R3', team: 'red' as MCTeam },
  ]
}

/** Partie créée puis countdown consommé : phase clue de l'équipe qui commence. */
function make(seed: string | number = 'seed'): MCState {
  const raw = createMCState(sixPlayers(), WORDS, seed, T0 - MC_COUNTDOWN_MS)
  return reduceMC(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** L'équipe active donne un indice valide → phase guess. */
function withClue(state: MCState, count = 2): MCState {
  const master = mcSpymasterOf(state, state.activeTeam)!
  return reduceMC(state, { type: 'GIVE_CLUE', playerId: master.id, word: 'indice', count, now: T0 })
}

function guesserOf(state: MCState): string {
  return state.players.find((p) => p.team === state.activeTeam && !p.isSpymaster && !p.leftAt)!.id
}

function tileOfKind(state: MCState, kind: string, exceptRevealed = true): number {
  return state.kinds.findIndex((k, i) => k === kind && (!exceptRevealed || !state.revealed[i]))
}

describe('createMCState', () => {
  it('grille 25 : 9 pour l’équipe qui commence, 8 pour l’autre, 7 neutres, 1 assassin', () => {
    const s = createMCState(sixPlayers(), WORDS, 'x', T0)
    expect(s.words).toHaveLength(MC_GRID)
    expect(new Set(s.words).size).toBe(MC_GRID)
    const counts = s.kinds.reduce<Record<string, number>>((acc, k) => {
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {})
    expect(counts[s.startingTeam]).toBe(9)
    expect(counts[s.startingTeam === 'gold' ? 'red' : 'gold']).toBe(8)
    expect(counts.neutral).toBe(7)
    expect(counts.assassin).toBe(1)
    expect(s.activeTeam).toBe(s.startingTeam)
    expect(createMCState(sixPlayers(), WORDS, 'x', T0)).toEqual(createMCState(sixPlayers(), WORDS, 'x', T0))
  })

  it('exige 2 humains par équipe et assez de mots ; premier de chaque équipe = maître-mot', () => {
    const unbalanced = sixPlayers().map((p) => (p.id === 'r2' || p.id === 'r3' ? { ...p, isBot: true } : p))
    expect(() => createMCState(unbalanced, WORDS, 1, T0)).toThrow('NEEDS_TWO_HUMANS_PER_TEAM')
    expect(() => createMCState(sixPlayers(), WORDS.slice(0, 20), 1, T0)).toThrow('NOT_ENOUGH_WORDS')
    const s = createMCState(sixPlayers(), WORDS, 1, T0)
    expect(mcSpymasterOf(s, 'gold')?.id).toBe('g1')
    expect(mcSpymasterOf(s, 'red')?.id).toBe('r1')
  })
})

describe('GIVE_CLUE', () => {
  it('réservé au maître-mot actif ; valide le mot (un seul, pas sur la grille) et le nombre', () => {
    const s = make()
    const master = mcSpymasterOf(s, s.activeTeam)!
    const enemyMaster = mcSpymasterOf(s, s.activeTeam === 'gold' ? 'red' : 'gold')!
    expect(() =>
      reduceMC(s, { type: 'GIVE_CLUE', playerId: enemyMaster.id, word: 'x', count: 1, now: T0 })
    ).toThrow('NOT_THE_SPYMASTER')
    expect(() =>
      reduceMC(s, { type: 'GIVE_CLUE', playerId: master.id, word: 'deux mots', count: 1, now: T0 })
    ).toThrow('INVALID_CLUE')
    expect(() =>
      reduceMC(s, { type: 'GIVE_CLUE', playerId: master.id, word: s.words[3], count: 1, now: T0 })
    ).toThrow('CLUE_ON_GRID')
    expect(() =>
      reduceMC(s, { type: 'GIVE_CLUE', playerId: master.id, word: 'ok', count: 0, now: T0 })
    ).toThrow('INVALID_COUNT')
    const g = withClue(s, 3)
    expect(g.phase).toBe('guess')
    expect(g.clue).toEqual({ word: 'indice', count: 3 })
    expect(g.guessesLeft).toBe(4)
  })
})

describe('GUESS', () => {
  it('le maître-mot ne devine pas ; l’adversaire non plus', () => {
    const g = withClue(make())
    const master = mcSpymasterOf(g, g.activeTeam)!
    expect(() =>
      reduceMC(g, { type: 'GUESS', playerId: master.id, tile: 0, now: T0 })
    ).toThrow('SPYMASTER_CANNOT_GUESS')
    const enemy = g.players.find((p) => p.team !== g.activeTeam && !p.isSpymaster)!
    expect(() =>
      reduceMC(g, { type: 'GUESS', playerId: enemy.id, tile: 0, now: T0 })
    ).toThrow('NOT_YOUR_TURN')
  })

  it('bonne couleur : décrémente ; épuise les essais → la main passe', () => {
    const g = withClue(make(), 1) // 2 essais
    const own1 = tileOfKind(g, g.activeTeam)
    const afterOne = reduceMC(g, { type: 'GUESS', playerId: guesserOf(g), tile: own1, now: T0 })
    expect(afterOne.phase).toBe('guess')
    expect(afterOne.guessesLeft).toBe(1)
    const own2 = tileOfKind(afterOne, afterOne.activeTeam)
    const afterTwo = reduceMC(afterOne, { type: 'GUESS', playerId: guesserOf(afterOne), tile: own2, now: T0 })
    expect(afterTwo.phase).toBe('clue')
    expect(afterTwo.activeTeam).not.toBe(g.activeTeam)
  })

  it('tuile neutre → la main passe ; assassin → défaite immédiate', () => {
    const g = withClue(make(), 3)
    const neutral = tileOfKind(g, 'neutral')
    const passed = reduceMC(g, { type: 'GUESS', playerId: guesserOf(g), tile: neutral, now: T0 })
    expect(passed.phase).toBe('clue')
    expect(passed.activeTeam).not.toBe(g.activeTeam)

    const g2 = withClue(make('autre'), 3)
    const assassin = tileOfKind(g2, 'assassin')
    const dead = reduceMC(g2, { type: 'GUESS', playerId: guesserOf(g2), tile: assassin, now: T0 })
    expect(dead.phase).toBe('finished')
    expect(dead.loseReason).toBe('assassin')
    expect(dead.winnerTeam).not.toBe(g2.activeTeam)
  })

  it('révéler son dernier mot → victoire', () => {
    let s = make()
    // Révèle hors-moteur tous les mots de l'équipe active sauf un.
    const team = s.activeTeam
    const indexes = s.kinds.map((k, i) => (k === team ? i : -1)).filter((i) => i >= 0)
    const revealed = [...s.revealed]
    for (const i of indexes.slice(0, -1)) revealed[i] = true
    s = { ...s, revealed }
    const g = withClue(s, 1)
    const last = indexes[indexes.length - 1]
    const done = reduceMC(g, { type: 'GUESS', playerId: guesserOf(g), tile: last, now: T0 })
    expect(done.phase).toBe('finished')
    expect(done.winnerTeam).toBe(team)
    expect(done.loseReason).toBeNull()
  })
})

describe('PASS / SKIP_TURN / ADVANCE', () => {
  it('un devineur peut passer, le maître-mot peut rendre la main, les timeouts passent le tour', () => {
    const g = withClue(make())
    const passed = reduceMC(g, { type: 'PASS', playerId: guesserOf(g), now: T0 })
    expect(passed.phase).toBe('clue')

    const s = make()
    const master = mcSpymasterOf(s, s.activeTeam)!
    const skipped = reduceMC(s, { type: 'SKIP_TURN', playerId: master.id, now: T0 })
    expect(skipped.activeTeam).not.toBe(s.activeTeam)

    const timedOut = reduceMC(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + MC_CLUE_MS })
    expect(timedOut.phase).toBe('clue')
    expect(timedOut.activeTeam).not.toBe(s.activeTeam)
    expect(currentMCActorId(timedOut)).toBe(mcSpymasterOf(timedOut, timedOut.activeTeam)?.id)
  })
})

describe('REPLACE_LEFT', () => {
  it('un maître-mot parti devient bot et passe le rôle à un humain de son équipe', () => {
    let s = make()
    const master = mcSpymasterOf(s, 'gold')!
    s = reduceMC(s, { type: 'LEAVE', playerId: master.id, at: T0 })
    s = reduceMC(s, { type: 'REPLACE_LEFT', now: T0 + 10_000, graceMs: 5_000 })
    const newMaster = mcSpymasterOf(s, 'gold')
    expect(newMaster?.id).not.toBe(master.id)
    expect(newMaster?.isBot).toBe(false)
    expect(s.players.find((p) => p.id === master.id)?.isBot).toBe(true)
  })
})

describe('vues anti-triche', () => {
  it('le maître-mot voit la solution, le devineur et la TV seulement le révélé', () => {
    const g = withClue(make())
    const master = mcSpymasterOf(g, g.activeTeam)!
    const masterView = toMCClientView(g, master.id)
    expect(masterView.iSeeSolution).toBe(true)
    expect(masterView.tiles.every((t) => t.kind !== null)).toBe(true)

    const guesser = toMCClientView(g, guesserOf(g))
    expect(guesser.iSeeSolution).toBe(false)
    expect(guesser.tiles.filter((t) => !t.revealed).every((t) => t.kind === null)).toBe(true)
    expect(JSON.stringify(guesser)).not.toContain('"kinds"')

    const tv = toMCSpectatorView(g)
    expect(tv.iSeeSolution).toBe(false)
    expect(tv.remaining.gold + tv.remaining.red).toBe(17)
  })

  it('à la fin, tout le monde voit la solution', () => {
    const g = withClue(make(), 3)
    const dead = reduceMC(g, { type: 'GUESS', playerId: guesserOf(g), tile: tileOfKind(g, 'assassin'), now: T0 })
    const view = toMCSpectatorView(dead)
    expect(view.tiles.every((t) => t.kind !== null)).toBe(true)
    expect(mcRemainingFor(dead, 'gold')).toBeGreaterThan(0)
  })
})
