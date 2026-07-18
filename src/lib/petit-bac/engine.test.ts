import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createPbcState,
  currentPbcActorId,
  pbcIsValid,
  pbcNormalize,
  reducePbc,
  toPbcClientView,
  PBC_CATEGORY_COUNT,
  PBC_FLUSH_MS,
  PBC_WRITE_MS,
  type PbcState,
} from './engine'

const NOW = 1_000_000

function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Joueur ${i + 1}` }))
}

/** Amène l'état en phase write (saute le countdown). */
function inWrite(n = 3, rounds = 3): PbcState {
  const state = createPbcState(makePlayers(n), 'seed', NOW, rounds)
  return reducePbc(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: NOW + 5_000 })
}

/** Cinq réponses commençant par la lettre courante (valides et uniques par joueur). */
function validAnswers(state: PbcState, suffix: string): string[] {
  const letter = state.letters[state.round]
  return Array.from({ length: PBC_CATEGORY_COUNT }, (_, i) => `${letter}${suffix}${i}`)
}

describe('petit-bac — création', () => {
  it('tire 5 catégories PAR MANCHE et une lettre par manche, sans doublon', () => {
    const state = createPbcState(makePlayers(4), 'x', NOW, 8)
    expect(state.phase).toBe('countdown')
    expect(state.categories).toHaveLength(5)
    expect(new Set(state.categories).size).toBe(5)
    expect(state.letters).toHaveLength(8)
    expect(new Set(state.letters).size).toBe(8)
    // Roulement : un jeu de 5 par manche, chaque jeu sans doublon interne.
    expect(state.categoryRounds).toHaveLength(8)
    expect(state.categories).toEqual(state.categoryRounds[0])
    for (const set of state.categoryRounds) expect(new Set(set).size).toBe(5)
    // Pool de 24 → les 4 premières manches (20 catégories) sont toutes distinctes.
    const firstFour = state.categoryRounds.slice(0, 4).flat()
    expect(new Set(firstFour).size).toBe(20)
  })

  it('refuse moins de 2 joueurs', () => {
    expect(() => createPbcState(makePlayers(1), 'x', NOW)).toThrow('NOT_ENOUGH_PLAYERS')
  })
})

describe('petit-bac — normalisation', () => {
  it('ignore accents, casse et espaces', () => {
    expect(pbcNormalize('  Éléphant ')).toBe('elephant')
    expect(pbcNormalize('São  Paulo')).toBe('sao paulo')
  })

  it('valide lettre + longueur', () => {
    expect(pbcIsValid('Éléphant', 'E')).toBe(true)
    expect(pbcIsValid('Girafe', 'E')).toBe(false)
    expect(pbcIsValid('E', 'E')).toBe(false)
    expect(pbcIsValid('', 'E')).toBe(false)
  })
})

describe('petit-bac — STOP et flush', () => {
  it('refuse un STOP incomplet', () => {
    const state = inWrite()
    const answers = validAnswers(state, 'a')
    answers[2] = '  '
    expect(() =>
      reducePbc(state, { type: 'STOP', playerId: 'p1', answers, now: NOW + 10_000 })
    ).toThrow('INCOMPLETE_STOP')
  })

  it('STOP complet gèle la table en flush, les autres déposent puis reveal', () => {
    const state = inWrite()
    const s1 = reducePbc(state, {
      type: 'STOP',
      playerId: 'p1',
      answers: validAnswers(state, 'a'),
      now: NOW + 10_000,
    })
    expect(s1.phase).toBe('flush')
    expect(s1.stopperId).toBe('p1')
    expect(s1.phaseEndsAt).toBe(NOW + 10_000 + PBC_FLUSH_MS)

    const s2 = reducePbc(s1, {
      type: 'SUBMIT',
      playerId: 'p2',
      answers: validAnswers(state, 'b'),
      now: NOW + 11_000,
    })
    expect(s2.phase).toBe('flush')
    const s3 = reducePbc(s2, {
      type: 'SUBMIT',
      playerId: 'p3',
      answers: validAnswers(state, 'c'),
      now: NOW + 12_000,
    })
    expect(s3.phase).toBe('reveal')
    expect(s3.roundPoints).not.toBeNull()
  })

  it('le chrono d’écriture passe en flush, puis le chrono du flush révèle (absents = 0)', () => {
    const state = inWrite()
    const s1 = reducePbc(state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(state),
      now: NOW + 5_000 + PBC_WRITE_MS,
    })
    expect(s1.phase).toBe('flush')
    const s2 = reducePbc(s1, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s1),
      now: NOW + 5_000 + PBC_WRITE_MS + PBC_FLUSH_MS,
    })
    expect(s2.phase).toBe('reveal')
    expect(s2.roundPoints?.p1.every((pts) => pts === 0)).toBe(true)
  })
})

describe('petit-bac — comptage', () => {
  function revealWith(answersByPlayer: Record<string, string[]>): PbcState {
    let state = inWrite(Object.keys(answersByPlayer).length)
    const ids = Object.keys(answersByPlayer)
    state = reducePbc(state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(state),
      now: NOW + 5_000 + PBC_WRITE_MS,
    })
    for (const id of ids) {
      if (state.phase !== 'flush') break
      state = reducePbc(state, {
        type: 'SUBMIT',
        playerId: id,
        answers: answersByPlayer[id],
        now: NOW + 6_000 + PBC_WRITE_MS,
      })
    }
    return state
  }

  it('2 pts unique, 1 pt doublon (accents ignorés), 0 mauvaise lettre ou vide', () => {
    const base = inWrite(3)
    const L = base.letters[0]
    const state = revealWith({
      p1: [`${L}éponse`, `${L}iche`, '', `${L}o`, `${L}avion`],
      p2: [`${L}eponse  `, `${L}ouette`, `${L}iel`, 'Zèbre', `${L}avion2`],
      p3: [`${L}autre`, `${L}iche`, `${L}iel`, `${L}o`, ''],
    })
    expect(state.phase).toBe('reveal')
    // cat 0 : p1/p2 doublon (accents/espaces ignorés), p3 unique.
    expect(state.roundPoints?.p1[0]).toBe(1)
    expect(state.roundPoints?.p2[0]).toBe(1)
    expect(state.roundPoints?.p3[0]).toBe(2)
    // cat 1 : p1/p3 doublon, p2 unique.
    expect(state.roundPoints?.p1[1]).toBe(1)
    expect(state.roundPoints?.p2[1]).toBe(2)
    // cat 2 : p1 vide = 0 ; cat 3 : « Xo » trop court seulement si ≠ lettre… ici valide (2 lettres).
    expect(state.roundPoints?.p1[2]).toBe(0)
    // cat 3 : mauvaise lettre pour p2.
    expect(state.roundPoints?.p2[3]).toBe(0)
    expect(state.roundPoints?.p1[3]).toBe(1)
    expect(state.roundPoints?.p3[3]).toBe(1)
  })

  it('la vue cache les réponses pendant write/flush et les montre au reveal', () => {
    let state = inWrite(2)
    state = reducePbc(state, {
      type: 'STOP',
      playerId: 'p1',
      answers: validAnswers(state, 'a'),
      now: NOW + 10_000,
    })
    const during = toPbcClientView(state, 'p2')
    expect(during.revealGrid).toBeNull()
    expect(during.myAnswers).toBeNull()
    expect(during.players.find((p) => p.id === 'p1')?.hasSubmitted).toBe(true)

    state = reducePbc(state, {
      type: 'SUBMIT',
      playerId: 'p2',
      answers: validAnswers(state, 'b'),
      now: NOW + 11_000,
    })
    const after = toPbcClientView(state, 'p2')
    expect(after.phase).toBe('reveal')
    expect(after.revealGrid).toHaveLength(PBC_CATEGORY_COUNT)
    expect(after.revealGrid?.[0].map((c) => c.playerId)).toEqual(['p1', 'p2'])
  })
})

describe('petit-bac — contestation', () => {
  function inReveal(n = 4): PbcState {
    let state = inWrite(n)
    state = reducePbc(state, {
      type: 'STOP',
      playerId: 'p1',
      answers: validAnswers(state, 'a'),
      now: NOW + 10_000,
    })
    for (let i = 2; i <= n; i += 1) {
      if (state.phase !== 'flush') break
      state = reducePbc(state, {
        type: 'SUBMIT',
        playerId: `p${i}`,
        answers: validAnswers(state, String.fromCharCode(96 + i)),
        now: NOW + 11_000,
      })
    }
    return state
  }

  it('la majorité des AUTRES joueurs invalide la case', () => {
    let state = inReveal(4) // 3 autres joueurs → seuil 2.
    state = reducePbc(state, { type: 'CONTEST', playerId: 'p2', targetId: 'p1', category: 0, now: NOW + 12_000 })
    expect(state.rejected).toHaveLength(0)
    expect(state.roundPoints?.p1[0]).toBe(2)
    state = reducePbc(state, { type: 'CONTEST', playerId: 'p3', targetId: 'p1', category: 0, now: NOW + 13_000 })
    expect(state.rejected).toContain('p1:0')
    expect(state.roundPoints?.p1[0]).toBe(0)
    // Une case déjà rejetée ne se reconteste pas.
    expect(() =>
      reducePbc(state, { type: 'CONTEST', playerId: 'p4', targetId: 'p1', category: 0, now: NOW + 14_000 })
    ).toThrow('ALREADY_REJECTED')
  })

  it('interdit de contester sa propre case, une case à 0 ou deux fois', () => {
    const state = inReveal(4)
    expect(() =>
      reducePbc(state, { type: 'CONTEST', playerId: 'p1', targetId: 'p1', category: 0, now: NOW })
    ).toThrow('CANNOT_CONTEST_SELF')
    const once = reducePbc(state, { type: 'CONTEST', playerId: 'p2', targetId: 'p1', category: 1, now: NOW })
    expect(() =>
      reducePbc(once, { type: 'CONTEST', playerId: 'p2', targetId: 'p1', category: 1, now: NOW })
    ).toThrow('ALREADY_CONTESTED')
  })

  it('à 2 joueurs, une seule contestation suffit', () => {
    let state = inReveal(2)
    state = reducePbc(state, { type: 'CONTEST', playerId: 'p2', targetId: 'p1', category: 0, now: NOW })
    expect(state.rejected).toContain('p1:0')
  })
})

describe('petit-bac — continue et fin', () => {
  it('CONTINUE additionne les totaux puis lance la manche suivante ; la dernière termine', () => {
    let state = inWrite(2, 2)
    state = reducePbc(state, {
      type: 'STOP',
      playerId: 'p1',
      answers: validAnswers(state, 'a'),
      now: NOW + 10_000,
    })
    state = reducePbc(state, {
      type: 'SUBMIT',
      playerId: 'p2',
      answers: validAnswers(state, 'b'),
      now: NOW + 11_000,
    })
    expect(state.phase).toBe('reveal')
    expect(currentPbcActorId(state)).toBe('p1')
    // Toutes uniques et valides → 10 pts chacun.
    state = reducePbc(state, { type: 'CONTINUE', playerId: 'p1', now: NOW + 20_000 })
    expect(state.phase).toBe('write')
    expect(state.round).toBe(1)
    expect(state.players.map((p) => p.total)).toEqual([10, 10])
    expect(state.answers).toEqual({})
    // Les catégories ont tourné (tranches disjointes du pool).
    expect(state.categories).toEqual(state.categoryRounds[1])
    expect(state.categories.some((c) => state.categoryRounds[0].includes(c))).toBe(false)

    state = reducePbc(state, {
      type: 'STOP',
      playerId: 'p2',
      answers: validAnswers(state, 'c'),
      now: NOW + 25_000,
    })
    state = reducePbc(state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(state),
      now: NOW + 25_000 + PBC_FLUSH_MS,
    })
    state = reducePbc(state, { type: 'CONTINUE', playerId: 'p1', now: NOW + 40_000 })
    expect(state.phase).toBe('finished')
    expect(state.players.find((p) => p.id === 'p2')?.total).toBe(20)
    expect(state.players.find((p) => p.id === 'p1')?.total).toBe(10)
  })
})

describe('petit-bac — départs', () => {
  it('un déserteur devient bot et dépose copie blanche en plein flush', () => {
    let state = inWrite(3)
    state = reducePbc(state, { type: 'LEAVE', playerId: 'p3', at: NOW + 6_000 })
    state = reducePbc(state, {
      type: 'STOP',
      playerId: 'p1',
      answers: validAnswers(state, 'a'),
      now: NOW + 200_000,
    })
    expect(state.phase).toBe('flush')
    state = reducePbc(state, {
      type: 'SUBMIT',
      playerId: 'p2',
      answers: validAnswers(state, 'b'),
      now: NOW + 201_000,
    })
    // p3 est parti (inactif) → le flush s'est déjà résolu sans lui.
    expect(state.phase).toBe('reveal')

    // Grâce écoulée → conversion en bot (copie blanche déjà sans effet ici).
    const replaced = reducePbc(state, { type: 'REPLACE_LEFT', now: NOW + 400_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'p3')?.isBot).toBe(true)
  })
})
