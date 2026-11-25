import { describe, expect, it } from 'vitest'
import { GAME_ADAPTERS } from './game-adapters'
import { humanDrinkTally } from './drink-tally'
import { phaseKey } from './phase-clock'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import type { EngineState } from '@/lib/petit-buveur/engine'
import { buildTCState } from '@/lib/toucher-coule/server-adapter'
import type { TCState } from '@/lib/toucher-coule/engine'
import { buildMenteurState } from '@/lib/menteur/server-adapter'
import { menteurSipsTotal, type MenteurState } from '@/lib/menteur/engine'
import {
  createImposteurState,
  imposteurAlive,
  reduceImposteur,
  IMPOSTEUR_COUNTDOWN_MS,
  IMPOSTEUR_SIPS_CIVIL_OUT,
  IMPOSTEUR_SIPS_PER_ALIVE,
  type ImposteurState,
} from '@/lib/imposteur/engine'
import { buildQuizState } from '@/lib/quiz/server-adapter'
import type { QuizState } from '@/lib/quiz/engine'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import type { LGState } from '@/lib/loup-garou/engine'
import { createGame1220State, reduceGame1220, type Game1220State } from '@/lib/1220/engine'
import { buildPurpleState } from '@/lib/purple/server-adapter'
import type { PurpleState } from '@/lib/purple/engine'
import { buildBjState } from '@/lib/blackjack/server-adapter'
import type { BjState, BjTally } from '@/lib/blackjack/engine'
import { buildVdnOnlineState, type VdnOnlineState } from '@/lib/vue-de-nez/server-adapter'
import { VDN_SIPS, type VdnTally } from '@/lib/vue-de-nez/engine'
import { buildPcState } from '@/lib/patate-chaude/server-adapter'
import { PC_EXPLOSION_SIPS, PC_PENALTY_SIPS } from '@/lib/patate-chaude/engine'
import type { PcOnlineState } from '@/lib/patate-chaude/online-shared'
import { buildChiffrePiegeState } from '@/lib/chiffre-piege/server-adapter'
import type { ChiffrePiegeOnlineState } from '@/lib/chiffre-piege/online-state'

const T0 = 1_790_000_000_000

/** Membres de salle au format des lanceurs (`user.displayName`). */
const roomMembers = (...ids: string[]) => ids.map((userId) => ({ userId, user: { displayName: userId } }))
/** Membres au format court (Petit Buveur, Toucher-Coulé). */
const flatMembers = (...ids: string[]) => ids.map((userId) => ({ userId, displayName: userId }))

const tallyOf = (gameId: string, state: unknown) => GAME_ADAPTERS[gameId].drinkTally!(state)

describe('humanDrinkTally', () => {
  it('ne compte que les sièges humains, aux deux bouts de la moyenne', () => {
    const players = [
      { id: 'u1', isBot: false, n: 4 },
      { id: 'bot-1', isBot: true, n: 9 },
      { id: 'u2', n: 0 },
    ]
    expect(humanDrinkTally(players, (p) => p.n)).toEqual({ drinks: 4, plays: 2 })
  })

  it('ignore une valeur absente, négative ou non entière', () => {
    const players: { id: string; isBot?: boolean }[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const values: Record<string, number | undefined> = { a: 3, b: -2, c: 1.5 }
    expect(humanDrinkTally(players, (p) => values[p.id])).toEqual({ drinks: 3, plays: 4 })
  })

  it('aucun humain : rien à relever', () => {
    expect(humanDrinkTally([{ isBot: true }], () => 5)).toBeNull()
  })
})

describe('jeux sans compteur de gorgées : pas de relevé', () => {
  it.each(['bluff', 'espion', 'tabou', 'crobard', 'telephone-dessine', 'sans-filtre', 'mots-codes', 'dilemmes', 'petit-bac', 'president'])(
    '%s',
    (gameId) => {
      expect(GAME_ADAPTERS[gameId].drinkTally).toBeUndefined()
    }
  )
})

describe('drinkTally par jeu, sur l’état final', () => {
  it('Petit Buveur : `drinks` des humains, le bot de l’hôte écarté', () => {
    const built = buildPetitBuveurEngineState(flatMembers('u1', 'u2'), 'normal', 'releve', 1)
    const drinks: Record<string, number> = { u1: 5, u2: 2, 'bot-1': 7 }
    const state: EngineState = {
      ...built,
      phase: 'finished',
      winner: 'u2',
      players: built.players.map((p) => ({ ...p, drinks: drinks[p.id] })),
    }
    expect(state.players.find((p) => p.id === 'bot-1')?.isBot).toBe(true)
    expect(tallyOf('petit-buveur', state)).toEqual({ drinks: 7, plays: 2 })
  })

  it('Toucher-Coulé : `drinks` des humains (2v2 complété par un bot)', () => {
    const built = buildTCState(flatMembers('u1', 'u2', 'u3'), '2v2', {}, 'releve', {}, T0)
    const drinks: Record<string, number> = { u1: 4, u2: 6, u3: 1, 'bot-1': 8 }
    const state: TCState = {
      ...built,
      phase: 'finished',
      winner: 'A',
      players: built.players.map((p) => ({ ...p, drinks: drinks[p.id] })),
    }
    expect(tallyOf('toucher-coule', state)).toEqual({ drinks: 11, plays: 3 })
  })

  it('Menteur : l’addition qui grimpe (n(n+1)/2), jamais lostCount', () => {
    const built = buildMenteurState(roomMembers('u1', 'u2'), 1, 'releve')
    const lost: Record<string, number> = { u1: 3, u2: 5, 'bot-1': 2 }
    const state: MenteurState = {
      ...built,
      phase: 'finished',
      players: built.players.map((p) => ({ ...p, lostCount: lost[p.id] })),
    }
    expect(menteurSipsTotal(3) + menteurSipsTotal(5)).toBe(6 + 15)
    expect(tallyOf('menteur', state)).toEqual({ drinks: 21, plays: 2 })
  })

  it('Quiz : `sips` cumulées des humains', () => {
    const built = buildQuizState(roomMembers('u1', 'u2'), 'fr', 10, 1, 'releve')
    const sips: Record<string, number> = { u1: 4, u2: 0, 'bot-1': 6 }
    const state: QuizState = {
      ...built,
      phase: 'finished',
      players: built.players.map((p) => ({ ...p, sips: sips[p.id] })),
    }
    expect(tallyOf('quiz', state)).toEqual({ drinks: 4, plays: 2 })
  })

  it('Loup-Garou : `sips` cumulées des humains', () => {
    const built = buildLGState(roomMembers('u1', 'u2', 'u3'), undefined, 2, 'releve')
    const state: LGState = {
      ...built,
      phase: 'finished',
      players: built.players.map((p) => ({ ...p, sips: p.isBot ? 5 : 3 })),
    }
    expect(tallyOf('loup-garou', state)).toEqual({ drinks: 9, plays: 3 })
  })

  it('Purple : cagnottes bues ; celle encore en jeu ne compte pas', () => {
    const built = buildPurpleState(roomMembers('u1', 'u2'), 1, 'releve')
    const state: PurpleState = {
      ...built,
      phase: 'finished',
      totalCardsDrawn: 14,
      drinkCounter: 6,
      gameResults: { u1: 5, u2: 3, 'bot-1': 4 },
    }
    expect(tallyOf('purple', state)).toEqual({ drinks: 8, plays: 2 })
  })

  it('Purple : « Terminer » avant la première carte n’est pas une partie', () => {
    const built = buildPurpleState(roomMembers('u1', 'u2'), 0, 'releve')
    expect(tallyOf('purple', { ...built, phase: 'finished' })).toBeNull()
  })

  it('Black Jack : mises perdues ; les gorgées distribuées n’ont pas de destinataire', () => {
    const built = buildBjState(roomMembers('u1', 'u2'), 1, 'releve')
    const tally = (drunk: number, given: number): BjTally => ({ drunk, given, wins: 0, blackjacks: 0, hands: 3 })
    const state: BjState = {
      ...built,
      phase: 'finished',
      totals: { u1: tally(4, 6), u2: tally(2, 0), 'bot-1': tally(9, 1) },
    }
    expect(tallyOf('blackjack', state)).toEqual({ drinks: 6, plays: 2 })
  })

  it('Black Jack : « Terminer » avant la première main jouée n’est pas une partie', () => {
    const built = buildBjState(roomMembers('u1', 'u2'), 0, 'releve')
    expect(tallyOf('blackjack', { ...built, phase: 'finished' })).toBeNull()
  })

  it('À Vue de Nez : gorgées BUES (plus loin), pas celles données', () => {
    const built = buildVdnOnlineState(roomMembers('u1', 'u2'), { seed: 'releve', botsCount: 1 })
    const tally = (farthest: number, closest: number, bullseye: number): VdnTally => ({ farthest, closest, bullseye })
    const state: VdnOnlineState = {
      ...built,
      phase: 'finished',
      game: { ...built.game, phase: 'finished', tallies: { u1: tally(2, 1, 1), u2: tally(1, 3, 0), 'bot-1': tally(4, 0, 0) } },
    }
    expect(tallyOf('vue-de-nez', state)).toEqual({ drinks: 3 * VDN_SIPS.farthest, plays: 2 })
  })

  it('Patate Chaude : explosions et pénalités au barème alcool ; un remplacé sort du relevé', () => {
    const built = buildPcState(roomMembers('u1', 'u2', 'u3'), {}, 'fr', 'releve', T0)
    const state: PcOnlineState = {
      ...built,
      phase: 'finished',
      players: built.players.map((p) => (p.id === 'u3' ? { ...p, isBot: true } : p)),
      game: { ...built.game, explosions: { u1: 2, u2: 0, u3: 5 }, penalties: { u1: 1, u2: 3, u3: 0 } },
    }
    expect(tallyOf('patate-chaude', state)).toEqual({
      drinks: 2 * PC_EXPLOSION_SIPS + 4 * PC_PENALTY_SIPS,
      plays: 2,
    })
  })

  it('Patate Chaude : « Terminer » avant la première explosion n’est pas une partie', () => {
    const built = buildPcState(roomMembers('u1', 'u2'), {}, 'fr', 'releve', T0)
    expect(Object.values(built.game.explosions).every((n) => n === 0)).toBe(true)
    expect(tallyOf('patate-chaude', { ...built, phase: 'finished' })).toBeNull()
  })

  it('Patate Chaude : une pénalité seule suffit à faire une partie', () => {
    const built = buildPcState(roomMembers('u1', 'u2'), {}, 'fr', 'releve', T0)
    const state: PcOnlineState = {
      ...built,
      phase: 'finished',
      game: { ...built.game, penalties: { ...built.game.penalties, u2: 1 } },
    }
    expect(tallyOf('patate-chaude', state)).toEqual({ drinks: PC_PENALTY_SIPS, plays: 2 })
  })

  it('Chiffre Piégé : pénalités cumulées des humains', () => {
    const built = buildChiffrePiegeState(roomMembers('u1', 'u2'), 1, 'releve', { max: 100, rounds: 3 })
    const state: ChiffrePiegeOnlineState = {
      ...built,
      phase: 'finished',
      game: { ...built.game, phase: 'finished', penalties: { u1: 6, u2: 1, 'bot-1': 9 } },
    }
    expect(tallyOf('chiffre-piege', state)).toEqual({ drinks: 7, plays: 2 })
  })
})

describe('1220 : cumul tenu par le moteur (l’historique ne garde que 15 lancers)', () => {
  const HUMANS = new Set(['u1', 'u2'])
  const start = (): Game1220State => {
    let s = createGame1220State(
      [
        { id: 'u1', name: 'u1' },
        { id: 'u2', name: 'u2' },
        { id: 'bot-1', name: 'Bot', isBot: true },
      ],
      'releve-1220',
      T0
    )
    for (const id of HUMANS) s = reduceGame1220(s, { type: 'READY', playerId: id })
    return s
  }

  it('toutes les gorgées bues des humains, au-delà de l’historique', () => {
    let s = start()
    expect(s.phase).toBe('play')
    let expected = 0
    let rolls = 0
    while ((rolls <= 15 || expected < 2) && rolls < 2000) {
      s = reduceGame1220(s, { type: 'ROLL', playerId: 'u1' })
      rolls += 1
      expected += s.lastRoll!.results.filter((r) => HUMANS.has(r.playerId)).reduce((sum, r) => sum + r.drinkSips, 0)
    }
    s = reduceGame1220(s, { type: 'END', playerId: 'u2' })
    expect(s.history).toHaveLength(15)
    expect(expected).toBeGreaterThanOrEqual(2)
    expect(tallyOf('1220', s)).toEqual({ drinks: expected, plays: 2 })
  })

  it('« Terminer » avant le premier lancer n’est pas une partie', () => {
    const s = reduceGame1220(start(), { type: 'END', playerId: 'u1' })
    expect(tallyOf('1220', s)).toBeNull()
  })

  it('un humain parti, pas encore remplacé, ne boit pas pendant son absence', () => {
    let s = reduceGame1220(start(), { type: 'LEAVE', playerId: 'u2', at: T0 + 1 })
    let absentSips = 0
    let rolls = 0
    while (absentSips === 0 && rolls < 2000) {
      s = reduceGame1220(s, { type: 'ROLL', playerId: 'u1' })
      rolls += 1
      absentSips += s.lastRoll!.results.find((r) => r.playerId === 'u2')?.drinkSips ?? 0
    }
    expect(absentSips).toBeGreaterThan(0)
    expect(s.drunk?.u2).toBeUndefined()
    expect(s.history[0].results.some((r) => r.playerId === 'u2' && r.drinkSips > 0)).toBe(true)

    s = reduceGame1220(s, { type: 'REJOIN', playerId: 'u2' })
    let backSips = 0
    while (backSips === 0 && rolls < 4000) {
      s = reduceGame1220(s, { type: 'ROLL', playerId: 'u1' })
      rolls += 1
      backSips += s.lastRoll!.results.find((r) => r.playerId === 'u2')?.drinkSips ?? 0
    }
    expect(s.drunk?.u2).toBe(backSips)
  })

  it('partie lancée avant le compteur : pas de compte partiel', () => {
    const { drunk: _drunk, ...old } = start()
    const rolled = reduceGame1220(old, { type: 'ROLL', playerId: 'u1' })
    expect(rolled.drunk).toBeUndefined()
    expect(tallyOf('1220', reduceGame1220(rolled, { type: 'END', playerId: 'u1' }))).toBeNull()
  })
})

describe('Imposteur : cumul tenu par le moteur (lastReveal ne garde que la dernière révélation)', () => {
  const PAIRS = [{ a: 'plage', b: 'piscine' }]

  const begin = (): ImposteurState => {
    const players = ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => ({ id, name: id }))
    const raw = createImposteurState(players, PAIRS, 'releve-imposteur', T0 - IMPOSTEUR_COUNTDOWN_MS)
    return reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  }

  /** Indices de tous, puis tout le monde vote contre `targetId` (lui vote ailleurs). */
  const eliminate = (state: ImposteurState, targetId: string): ImposteurState => {
    let s = state
    while (s.phase === 'clue') {
      s = reduceImposteur(s, { type: 'CLUE', playerId: s.clueOrder[s.clueTurnIdx], text: 'indice', now: T0 })
    }
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const other = imposteurAlive(s).find((q) => q.id !== targetId)!
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: p.id === targetId ? other.id : targetId, now: T0 })
    }
    return reduceImposteur(s, { type: 'CONTINUE', playerId: targetId, now: s.phaseEndsAt ?? T0 })
  }

  it('civil puis imposteur éliminés : 3 + 2 × 3 gorgées, le bot à table hors relevé', () => {
    const s0 = begin()
    const civils = s0.players.filter((p) => p.team === 'civil')
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!
    const [eliminatedCivil, botCivil] = civils
    const withBot: ImposteurState = {
      ...s0,
      players: s0.players.map((p) => (p.id === botCivil.id ? { ...p, isBot: true } : p)),
    }
    const afterCivil = eliminate(withBot, eliminatedCivil.id)
    expect(afterCivil.phase).toBe('clue')
    expect(afterCivil.drunk).toEqual({ [eliminatedCivil.id]: IMPOSTEUR_SIPS_CIVIL_OUT })
    const done = eliminate(afterCivil, imposteur.id)
    expect(done.phase).toBe('finished')
    expect(done.drunk).toEqual({
      [eliminatedCivil.id]: IMPOSTEUR_SIPS_CIVIL_OUT,
      [imposteur.id]: IMPOSTEUR_SIPS_PER_ALIVE * 3,
    })
    expect(tallyOf('imposteur', done)).toEqual({ drinks: IMPOSTEUR_SIPS_CIVIL_OUT + IMPOSTEUR_SIPS_PER_ALIVE * 3, plays: 4 })
  })

  it('partie lancée avant le compteur : pas de compte partiel', () => {
    const s0 = begin()
    const { drunk: _drunk, ...old } = s0
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!
    const done = eliminate(old, imposteur.id)
    expect(done.phase).toBe('finished')
    expect(done.drunk).toBeUndefined()
    expect(tallyOf('imposteur', done)).toBeNull()
  })
})
