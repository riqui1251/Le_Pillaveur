import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGameById } from '@/lib/games'
import type { Player } from '@/lib/players'
import { revancheOf } from './actions'
import {
  SOIREE_CANDIDATE_IDS,
  SOIREE_GAME_IDS,
  isSoireeCandidate,
  playableSoireeGameIds,
  soireeCap,
  soireeCounting,
  soireeGameIdsWith,
  soireeHeat,
  soireeMinutes,
} from './catalog'
import { defaultVibesForLevel } from './vibes'
import { SOIREE_LENGTH_ROUNDS, SOIREE_MAX_ROUNDS, addRound, buildProgram, monteQuotas, moveRound, programHeat, removeRound, replaceRound } from './program'
import {
  closeRound,
  createSoiree,
  finishSoiree,
  isRoundComplete,
  playingRoundOf,
  recordRoundStats,
  replaceUpcoming,
  setRoundTally,
  setRoundVote,
  setSoireeVote,
  skipRound,
  soireeStandings,
  startRound,
  upcomingProgram,
  upcomingRoom,
  withinRoundCap,
  withoutHiddenGames,
  withoutRetiredGames,
  type Soiree,
} from './state'
import { soireeSummary, toHistoryEntry } from './summary'
import { isSoiree, noteSoireeStats, pushHistory, readBandes, readHistory, readSoiree, saveBande, writeSoiree } from './storage'
import { gameDrinkStats, historyStats, topDrinkers } from './device-stats'

/** Générateur déterministe (LCG) : mêmes tirages à chaque passage. */
function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const PLAYERS = [
  { id: 'lea', name: 'Léa' },
  { id: 'sam', name: 'Sam' },
  { id: 'theo', name: 'Théo' },
  { id: 'nina', name: 'Nina' },
]

function soiree(program: string[], soft = false): Soiree {
  return createSoiree({ id: 's1', now: 1000, bandeId: null, bandeName: 'La bande', players: PLAYERS, vibe: 'monte', soft, length: 'carte', program })
}

/** Joue la manche courante : chaque joueur remonte ses gorgées et victoires, puis on la clôt. */
function play(s: Soiree, results: Record<string, [drinks: number, wins: number]>): Soiree {
  let next = startRound(s, 2000)
  const gameId = next.rounds[next.current].gameId
  for (const [id, [drinks, wins]] of Object.entries(results)) {
    next = recordRoundStats(next, gameId, id, { gamesPlayed: 1, totalDrinks: drinks, wins }) ?? next
  }
  return closeRound(next, 3000)
}

afterEach(() => vi.unstubAllGlobals())

describe('catalogue de la soirée', () => {
  it('prend tous les jeux locaux visibles sauf la Pyramide et Dégaine', () => {
    expect(SOIREE_GAME_IDS).toHaveLength(16)
    expect(SOIREE_GAME_IDS).not.toContain('pyramide')
    expect(SOIREE_GAME_IDS).not.toContain('degaine')
    for (const id of SOIREE_GAME_IDS) {
      const game = getGameById(id)
      expect(game && !game.hidden && !game.onlineOnly).toBe(true)
    }
  })

  it('écarte les jeux qui demandent plus de joueurs que la bande', () => {
    expect(playableSoireeGameIds(1)).toEqual(['blackjack'])
    expect(playableSoireeGameIds(4)).toHaveLength(16)
  })

  it('borne chaque jeu sans fin naturelle, et lui seul', () => {
    const capped = SOIREE_GAME_IDS.filter((id) => soireeCap(id) !== null)
    expect(capped.sort()).toEqual(['1220', 'blackjack', 'cap-ou-pas-cap', 'doigt-du-destin', 'purple'])
    for (const id of capped) expect(soireeCap(id)).toBeGreaterThan(0)
    expect(soireeCap('vue-de-nez')).toBeNull()
  })

  it('annonce la borne dans les quatre langues', async () => {
    for (const locale of ['fr', 'en', 'es', 'it']) {
      const messages = (await import(`../../../messages/${locale}.json`)).default as {
        soireeBar: { cap: Record<string, string>; nextHand: string; capReached: string; seeResults: string }
        soiree: { programme: { full: string } }
      }
      for (const key of ['hands', 'tableRounds', 'rolls', 'draws']) {
        expect(messages.soireeBar.cap[key], `${locale} cap.${key}`).toMatch(/\{current\}.*\{max\}/)
      }
      expect(messages.soireeBar.seeResults, locale).toBeTruthy()
      expect(messages.soiree.programme.full, locale).toContain('{max}')
    }
  })

  it('la liste effective ajoute et retire des jeux au défaut du code', () => {
    expect(soireeGameIdsWith({})).toEqual([...SOIREE_GAME_IDS])
    const ids = soireeGameIdsWith({ pyramide: true, purple: false })
    expect(ids).toContain('pyramide')
    expect(ids).not.toContain('purple')
    // Ordre du catalogue, jeux hors candidats ignorés.
    expect(ids).toEqual(SOIREE_CANDIDATE_IDS.filter((id) => ids.includes(id)))
    expect(soireeGameIdsWith({ 'loup-garou': true })).toEqual([...SOIREE_GAME_IDS])
    expect(playableSoireeGameIds(4, [], ids)).toContain('pyramide')
  })

  it('un jeu ajouté sans fiche prend les défauts (10 minutes, ardoise à la main, pas de borne)', () => {
    expect(SOIREE_GAME_IDS).not.toContain('pyramide')
    expect(soireeMinutes('pyramide')).toBe(10)
    expect(soireeCounting('pyramide')).toBe('manual')
    expect(soireeCap('pyramide')).toBeNull()
    expect(soireeHeat('pyramide')).toBe(getGameById('pyramide')?.drinkLevel)
  })

  it('ne propose pas un jeu que l’équipe a caché', () => {
    const ids = playableSoireeGameIds(4, ['hi-lo', 'purple'])
    expect(ids).toHaveLength(14)
    expect(ids).not.toContain('hi-lo')
    expect(ids).not.toContain('purple')
    expect(playableSoireeGameIds(4, [])).toEqual(playableSoireeGameIds(4))
  })
})

describe('tuto des jeux de la soirée', () => {
  it('existe en trois temps pour chaque jeu, dans les quatre langues', async () => {
    for (const locale of ['fr', 'en', 'es', 'it']) {
      const messages = (await import(`../../../messages/${locale}.json`)).default as {
        soiree: { tutorials: Record<string, Record<'a' | 'b' | 'c', string>> }
      }
      for (const id of SOIREE_GAME_IDS) {
        for (const step of ['a', 'b', 'c'] as const) {
          expect(messages.soiree.tutorials[id]?.[step], `${locale} ${id}.${step}`).toBeTruthy()
        }
      }
    }
  })
})

describe('programme', () => {
  it('monte en intensité, sans doublon ni final imposé', () => {
    for (const seed of [1, 3, 7, 11]) {
      const program = buildProgram({ rounds: 5, vibe: 'monte', playerCount: 4, rng: seeded(seed) })
      expect(program).toHaveLength(5)
      expect(new Set(program).size).toBe(5)
      expect(program).not.toContain('degaine')
      const heats = program.map(soireeHeat)
      expect(heats).toEqual([...heats].sort((a, b) => a - b))
    }
  })

  it("prend l'intensité du niveau « Fait boire » du jeu", () => {
    for (const id of SOIREE_GAME_IDS) expect(soireeHeat(id)).toBe(getGameById(id)?.drinkLevel)
  })

  it("suit le barème réglé par l'équipe, pour le tirage et la courbe", () => {
    const heatOf = (id: string) => (id === 'purple' ? 3 : 1)
    for (const seed of [1, 3, 7, 11]) {
      const program = buildProgram({ rounds: 5, vibe: 'monte', playerCount: 4, rng: seeded(seed), heatOf })
      const heats = programHeat(program, heatOf)
      expect(heats).toEqual([...heats].sort((a, b) => a - b))
      if (program.includes('purple')) expect(program[program.length - 1]).toBe('purple')
    }
    expect(programHeat(['purple', 'pmu'], heatOf)).toEqual([3, 1])
  })

  it('l’apéro ne tire que des jeux « Peu » ou « Moyen », la grosse soirée que « Moyen » ou « Beaucoup »', () => {
    for (const seed of [1, 3, 7, 11, 19]) {
      const apero = buildProgram({ rounds: 7, vibe: 'apero', playerCount: 4, rng: seeded(seed) })
      expect(apero).toHaveLength(7)
      expect(apero.map(soireeHeat)).not.toContain(3)
      const grosse = buildProgram({ rounds: 7, vibe: 'grosse', playerCount: 4, rng: seeded(seed) })
      expect(grosse).toHaveLength(7)
      expect(grosse.map(soireeHeat)).not.toContain(1)
    }
  })

  it('« Ça monte » répartit les manches entre les trois niveaux, du plus doux au plus fort', () => {
    expect(monteQuotas(3)).toEqual({ 1: 1, 2: 1, 3: 1 })
    expect(monteQuotas(5)).toEqual({ 1: 1, 2: 2, 3: 2 })
    expect(monteQuotas(7)).toEqual({ 1: 2, 2: 3, 3: 2 })
    for (const seed of [1, 3, 7, 11]) {
      const heats = buildProgram({ rounds: 5, vibe: 'monte', playerCount: 4, rng: seeded(seed) }).map(soireeHeat)
      expect(heats).toEqual([1, 2, 2, 3, 3])
    }
  })

  it('complète avec les autres niveaux quand ceux de l’ambiance manquent', () => {
    // Deux jeux « Beaucoup » seulement : la grosse soirée prend aussi des « Peu » pour tenir ses 5 manches.
    const heatOf = (id: string) => (id === 'purple' || id === 'pmu' ? 3 : 1)
    const program = buildProgram({ rounds: 5, vibe: 'grosse', playerCount: 4, rng: seeded(), heatOf })
    expect(program).toHaveLength(5)
    expect(program.slice(-2).sort()).toEqual(['pmu', 'purple'])
  })

  describe('ambiances réglées par l’équipe', () => {
    type Vibe = 'apero' | 'monte' | 'grosse'
    const draw = (vibe: Vibe, rounds: number, vibesOf: (id: string) => readonly Vibe[], seed = 1) =>
      buildProgram({ rounds, vibe, playerCount: 4, rng: seeded(seed), vibesOf })
    const byDefault = (id: string) => defaultVibesForLevel(soireeHeat(id))
    const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34]

    it('sans vibesOf, le défaut est celui du niveau « Fait boire »', () => {
      for (const seed of SEEDS) {
        expect(buildProgram({ rounds: 6, vibe: 'apero', playerCount: 4, rng: seeded(seed) })).toEqual(draw('apero', 6, byDefault, seed))
      }
    })

    it('un jeu retiré d’une ambiance n’y est jamais tiré tant qu’il en reste assez', () => {
      const without = (gone: string) => (id: string) => (id === gone ? byDefault(id).filter((v) => v !== 'apero') : byDefault(id))
      for (const seed of SEEDS) {
        expect(draw('apero', 11, without('monsieur-3'), seed)).not.toContain('monsieur-3')
        expect(draw('apero', 5, without('purple'), seed)).not.toContain('purple')
      }
    })

    it('un jeu « Beaucoup » rangé dans l’apéro peut y sortir', () => {
      const withBig = (id: string): readonly Vibe[] => (id === 'coupe-du-roi' ? ['apero'] : byDefault(id))
      expect(draw('apero', 1, (id) => (id === 'coupe-du-roi' ? ['apero'] : []))).toEqual(['coupe-du-roi'])
      expect(SEEDS.some((seed) => draw('apero', 11, withBig, seed).includes('coupe-du-roi'))).toBe(true)
      for (const seed of SEEDS) expect(draw('apero', 11, byDefault, seed)).not.toContain('coupe-du-roi')
    })

    it('un jeu « Peu » rangé dans la grosse soirée peut y sortir', () => {
      const withLight = (id: string): readonly Vibe[] => (id === 'purple' ? ['grosse'] : byDefault(id))
      expect(SEEDS.some((seed) => draw('grosse', 11, withLight, seed).includes('purple'))).toBe(true)
      for (const seed of SEEDS) expect(draw('grosse', 11, byDefault, seed)).not.toContain('purple')
    })

    it('une liste vide : le jeu ne sort jamais, sauf pour compléter', () => {
      const none = (id: string): readonly Vibe[] => (id === 'purple' ? [] : byDefault(id))
      for (const vibe of ['apero', 'monte', 'grosse'] as const) {
        for (const seed of SEEDS) expect(draw(vibe, 5, none, seed), vibe).not.toContain('purple')
      }
      expect(draw('apero', playableSoireeGameIds(4).length, none)).toContain('purple')
    })

    it('complète avec les autres jeux jouables quand l’ambiance manque de jeux rangés', () => {
      const onlyPmu = (id: string): readonly Vibe[] => (id === 'pmu' ? ['apero'] : [])
      for (const vibe of ['apero', 'monte', 'grosse'] as const) {
        const program = draw(vibe, 3, onlyPmu)
        expect(program, vibe).toHaveLength(3)
        expect(new Set(program).size).toBe(3)
        expect(program.includes('pmu')).toBe(vibe === 'apero')
      }
      expect(draw('grosse', 3, () => [])).toHaveLength(3)
    })

    it('ne rend jamais un jeu en double ni plus de manches que de jeux jouables', () => {
      const program = draw('monte', 50, byDefault)
      expect(program).toHaveLength(playableSoireeGameIds(4).length)
      expect(new Set(program).size).toBe(program.length)
    })

    it('« Ça monte » répartit par niveaux parmi les jeux rangés, et sort du niveau vide avant de sortir de l’ambiance', () => {
      for (const seed of SEEDS) {
        expect(draw('monte', 5, byDefault, seed).map(soireeHeat)).toEqual([1, 2, 2, 3, 3])
      }
      // Plus aucun jeu « Beaucoup » dans « Ça monte » : ses deux manches vont aux autres niveaux de l'ambiance.
      const noBig = (id: string): readonly Vibe[] => (soireeHeat(id) === 3 ? ['grosse'] : byDefault(id))
      for (const seed of SEEDS) {
        const program = draw('monte', 5, noBig, seed)
        expect(program).toHaveLength(5)
        expect(program.map(soireeHeat)).not.toContain(3)
      }
    })

    it('les poids ne penchent que dans l’ambiance : l’apéro préfère les « Peu », la grosse soirée les « Beaucoup »', () => {
      const all = (): readonly Vibe[] => ['apero', 'grosse']
      const count = (vibe: Vibe, heat: 1 | 3) =>
        Array.from({ length: 200 }, (_, i) => draw(vibe, 2, all, (i + 1) * 1_000_003))
          .flat()
          .filter((id) => soireeHeat(id) === heat).length
      expect(count('apero', 1)).toBeGreaterThan(count('apero', 3))
      expect(count('grosse', 3)).toBeGreaterThan(count('grosse', 1))
    })

    it('une revanche tire avec les mêmes ambiances', () => {
      const base = createSoiree({
        id: 's',
        now: 1,
        bandeId: null,
        bandeName: '',
        players: ['lea', 'sam', 'theo', 'nina'].map((id) => ({ id, name: id })),
        vibe: 'apero',
        soft: false,
        length: 'court',
        program: ['pmu', 'hi-lo', 'purple'],
      })
      const rematch = revancheOf(base, 2, [], undefined, (id): readonly Vibe[] => (['pmu', 'hi-lo', 'plinko'].includes(id) ? ['apero'] : []))
      expect(rematch.rounds.map((r) => r.gameId).sort()).toEqual(['hi-lo', 'plinko', 'pmu'])
    })
  })

  it('ne tire jamais un jeu caché, même sur toutes les ambiances', () => {
    const hiddenIds = SOIREE_GAME_IDS.filter((_, i) => i % 2 === 0)
    for (const vibe of ['apero', 'monte', 'grosse'] as const) {
      for (const seed of [1, 5, 9]) {
        const program = buildProgram({ rounds: 7, vibe, playerCount: 4, hiddenIds, rng: seeded(seed) })
        expect(program).toHaveLength(7)
        for (const id of program) expect(hiddenIds).not.toContain(id)
      }
    }
  })

  it('tire un jeu que l’équipe a ajouté à la soirée, et plus un jeu qu’elle en a sorti', () => {
    const withPyramide = soireeGameIdsWith({ pyramide: true })
    const count = playableSoireeGameIds(4, [], withPyramide).length
    const program = buildProgram({ rounds: count, vibe: 'monte', playerCount: 4, rng: seeded(), soireeIds: withPyramide })
    expect(program).toHaveLength(count)
    expect(program).toContain('pyramide')
    expect(buildProgram({ rounds: count, vibe: 'monte', playerCount: 4, rng: seeded() })).not.toContain('pyramide')

    const withoutPurple = soireeGameIdsWith({ purple: false })
    for (const vibe of ['apero', 'monte', 'grosse'] as const) {
      for (const seed of [1, 5, 9]) {
        const drawn = buildProgram({ rounds: withoutPurple.length, vibe, playerCount: 4, rng: seeded(seed), soireeIds: withoutPurple })
        expect(drawn).not.toContain('purple')
        expect(drawn).toHaveLength(withoutPurple.length)
      }
    }
  })

  it('une revanche suit la liste réglée : la carte recopiée perd un jeu sorti, le tirage ajoute un jeu ajouté', () => {
    const carte = createSoiree({
      id: 's',
      now: 1,
      bandeId: null,
      bandeName: '',
      players: ['lea', 'sam', 'theo', 'nina'].map((id) => ({ id, name: id })),
      vibe: 'monte',
      soft: false,
      length: 'carte',
      program: ['hi-lo', 'purple', 'pyramide'],
    })
    const ids = soireeGameIdsWith({ purple: false, pyramide: true })
    expect(revancheOf(carte, 2, [], undefined, undefined, ids).rounds.map((r) => r.gameId)).toEqual(['hi-lo', 'pyramide'])
    const tout = { ...carte, length: 'long' as const }
    const tire = revancheOf(tout, 2, [], undefined, undefined, soireeGameIdsWith({ purple: false }))
    expect(tire.rounds.map((r) => r.gameId)).not.toContain('purple')
  })

  it('plus court quand presque tout est caché', () => {
    const all = [...SOIREE_GAME_IDS]
    const keep = all.slice(0, 2)
    const program = buildProgram({ rounds: 5, vibe: 'monte', playerCount: 4, hiddenIds: all.slice(2), rng: seeded() })
    expect(program.slice().sort()).toEqual(keep.slice().sort())
    expect(buildProgram({ rounds: 5, vibe: 'monte', playerCount: 4, hiddenIds: all, rng: seeded() })).toEqual([])
  })

  it('une revanche ne reprend ni ne tire un jeu caché, et garde la longueur demandée', () => {
    const hiddenIds = SOIREE_GAME_IDS.filter((_, i) => i % 2 === 0)
    const carte = createSoiree({
      id: 's',
      now: 1,
      bandeId: null,
      bandeName: '',
      players: ['lea', 'sam', 'theo', 'nina'].map((id) => ({ id, name: id })),
      vibe: 'monte',
      soft: false,
      length: 'carte',
      program: [hiddenIds[0], SOIREE_GAME_IDS[1], hiddenIds[1], SOIREE_GAME_IDS[3]],
    })
    const rematch = revancheOf(carte, 2, hiddenIds)
    expect(rematch.rounds.map((r) => r.gameId)).toEqual([SOIREE_GAME_IDS[1], SOIREE_GAME_IDS[3]])

    const courte = { ...carte, length: 'normal' as const }
    const tire = revancheOf(courte, 2, hiddenIds)
    expect(tire.rounds).toHaveLength(SOIREE_LENGTH_ROUNDS.normal)
    for (const r of tire.rounds) expect(hiddenIds).not.toContain(r.gameId)
  })

  it('plus court quand la bande ne peut pas jouer assez de jeux', () => {
    expect(buildProgram({ rounds: 5, vibe: 'apero', playerCount: 1, rng: seeded() })).toEqual(['blackjack'])
  })

  it('réordonne, retire, remplace et ajoute en fin de programme', () => {
    const p = ['a', 'b', 'c']
    expect(moveRound(p, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveRound(p, 2, -5)).toEqual(['c', 'a', 'b'])
    expect(removeRound(p, 1)).toEqual(['a', 'c'])
    expect(replaceRound(p, 1, 'z')).toEqual(['a', 'z', 'c'])
    expect(addRound(['hi-lo', 'plinko'], 'purple')).toEqual(['hi-lo', 'plinko', 'purple'])
    expect(addRound(['hi-lo'], 'purple')).toEqual(['hi-lo', 'purple'])
    const full = Array.from({ length: SOIREE_MAX_ROUNDS }, () => 'hi-lo')
    expect(addRound(full, 'purple')).toHaveLength(SOIREE_MAX_ROUNDS)
  })
})

describe('ardoise', () => {
  it('ne compte que le jeu de la manche lancée et ses joueurs', () => {
    const s = startRound(soiree(['hi-lo', 'purple']), 2000)
    expect(recordRoundStats(s, 'purple', 'lea', { totalDrinks: 3 })).toBeNull()
    expect(recordRoundStats(s, 'hi-lo', 'inconnu', { totalDrinks: 3 })).toBeNull()
    expect(recordRoundStats(soiree(['hi-lo']), 'hi-lo', 'lea', { totalDrinks: 3 })).toBeNull()
    let next = recordRoundStats(s, 'hi-lo', 'lea', { gamesPlayed: 1, totalDrinks: 3, wins: 1 })!
    next = recordRoundStats(next, 'hi-lo', 'lea', { totalDrinks: 2 })!
    expect(next.rounds[0].results.lea).toEqual({ drinks: 5, wins: 1, played: 1 })
    expect(isRoundComplete(next.rounds[0])).toBe(false)
  })

  it('reconnaît la manche en jeu sur un jeu donné, et elle seule', () => {
    const s = soiree(['hi-lo', 'purple'])
    expect(playingRoundOf(null, 'hi-lo')).toBeNull()
    expect(playingRoundOf(s, 'hi-lo')).toBeNull()
    const started = startRound(s, 2000)
    expect(playingRoundOf(started, 'hi-lo')?.gameId).toBe('hi-lo')
    expect(playingRoundOf(started, 'purple')).toBeNull()
    expect(playingRoundOf(closeRound(started, 3000), 'hi-lo')).toBeNull()
  })

  it("classe l'ardoise, puis l'entracte s'ouvre", () => {
    const s = play(soiree(['hi-lo', 'purple']), { lea: [5, 0], sam: [2, 1], theo: [7, 0], nina: [0, 1] })
    expect(s.phase).toBe('entracte')
    expect(s.current).toBe(1)
    expect(soireeStandings(s).map((r) => r.playerId)).toEqual(['theo', 'lea', 'sam', 'nina'])
  })

  it('sans alcool, classe les victoires', () => {
    const s = play(soiree(['hi-lo'], true), { lea: [0, 0], sam: [0, 2], theo: [0, 1], nina: [0, 0] })
    expect(soireeStandings(s)[0].playerId).toBe('sam')
  })

  it('retient le vote de la table : sur une manche jouée seulement, puis sur la soirée', () => {
    const s = play(soiree(['hi-lo', 'purple']), { lea: [2, 0] })
    const voted = setRoundVote(s, 0, 4)
    expect(voted.rounds[0].vote).toBe(4)
    expect(setRoundVote(s, 0, 9).rounds[0].vote).toBe(5)
    // Manche pas encore jouée ou inexistante : rien ne bouge.
    expect(setRoundVote(s, 1, 3)).toBe(s)
    expect(setRoundVote(s, 7, 3)).toBe(s)
    expect(setSoireeVote(voted, 5).vote).toBe(5)
    // Le vote voyage avec la soirée enregistrée.
    expect(isSoiree(JSON.parse(JSON.stringify(setSoireeVote(voted, 2))))).toBe(true)
  })

  it('chaque manche se joue avec toute la bande, la dernière comprise', () => {
    let s = play(soiree(['hi-lo', 'purple']), { lea: [5, 0], sam: [2, 1], theo: [9, 0], nina: [0, 1] })
    s = startRound(s, 4000)
    expect(s.rounds[1].playerIds).toEqual(['lea', 'sam', 'theo', 'nina'])
  })

  it('une soirée enregistrée avec un jeu retiré du catalogue le perd de la suite, pas de l’ardoise', () => {
    const retired = 'loup-garou'
    expect(isSoireeCandidate(retired)).toBe(false)
    const pending = play(soiree(['hi-lo', retired, 'purple', retired]), { lea: [2, 0] })
    const cleaned = withoutRetiredGames(pending)
    expect(cleaned.rounds.map((r) => r.gameId)).toEqual(['hi-lo', 'purple'])
    expect(cleaned.current).toBe(1)
    // Déjà jouée ou en cours : elle reste.
    const played = play(soiree([retired, 'hi-lo']), { lea: [3, 0] })
    expect(withoutRetiredGames(played)).toBe(played)
    const running = startRound(soiree([retired, 'hi-lo']), 2000)
    expect(withoutRetiredGames(running).rounds.map((r) => r.gameId)).toEqual([retired, 'hi-lo'])
    const clean = soiree(['hi-lo', 'purple'])
    expect(withoutRetiredGames(clean)).toBe(clean)
  })

  it('une soirée enregistrée garde un jeu que l’équipe peut ajouter (Dégaine, Pyramide)', () => {
    const pending = play(soiree(['hi-lo', 'degaine', 'pyramide', 'purple']), { lea: [2, 0] })
    expect(withoutRetiredGames(pending)).toBe(pending)
  })

  it('un jeu caché quitte la suite de la soirée, pas l’ardoise ni la manche en cours', () => {
    const pending = play(soiree(['hi-lo', 'purple', 'plinko', 'purple']), { lea: [2, 0] })
    const cleaned = withoutHiddenGames(pending, ['purple'])
    expect(cleaned.rounds.map((r) => r.gameId)).toEqual(['hi-lo', 'plinko'])
    expect(cleaned.current).toBe(1)
    expect(cleaned.rounds[0].results.lea.drinks).toBe(2)
    // Même soirée rendue si rien n'est concerné.
    expect(withoutHiddenGames(pending, [])).toBe(pending)
    expect(withoutHiddenGames(pending, ['monsieur-3'])).toBe(pending)
    // Manche déjà jouée : elle reste.
    const played = play(soiree(['purple', 'hi-lo']), { lea: [3, 0] })
    expect(withoutHiddenGames(played, ['purple'])).toBe(played)
    // Manche en cours : elle va au bout.
    const running = startRound(soiree(['purple', 'hi-lo']), 2000)
    expect(withoutHiddenGames(running, ['purple']).rounds.map((r) => r.gameId)).toEqual(['purple', 'hi-lo'])
    // Une soirée finie garde son programme.
    const finished = finishSoiree(soiree(['purple', 'hi-lo']), 5000)
    expect(withoutHiddenGames(finished, ['hi-lo'])).toBe(finished)
    // En phase « programme », rien n'est lancé : tout ce qui est caché tombe.
    const programme = soiree(['purple', 'hi-lo'])
    expect(withoutHiddenGames(programme, ['purple']).rounds.map((r) => r.gameId)).toEqual(['hi-lo'])
  })

  it('corrige une manche à la main, saute, remplace la suite et ferme la soirée', () => {
    let s = play(soiree(['coupe-du-roi', 'hi-lo', 'purple']), {})
    s = setRoundTally(s, 0, 'sam', 'drinks', 4)
    expect(s.rounds[0].results.sam.drinks).toBe(4)
    expect(s.rounds[0].edited).toBe(true)
    s = skipRound(s)
    expect(s.rounds[1].status).toBe('skipped')
    s = replaceUpcoming(s, ['pile-poil', 'vue-de-nez'])
    expect(s.rounds.map((r) => r.gameId)).toEqual(['coupe-du-roi', 'hi-lo', 'pile-poil', 'vue-de-nez'])
    s = startRound(s, 5000)
    s = finishSoiree(s, 6000)
    expect(s.phase).toBe('finished')
    expect(s.rounds[2].status).toBe('skipped')
  })

  it('l’entracte ne rallonge pas la soirée au-delà du plafond', () => {
    const full = () => Array.from({ length: SOIREE_MAX_ROUNDS }, () => 'hi-lo')
    let s = play(soiree(full()), {})
    s = skipRound(s)
    expect(upcomingRoom(s)).toBe(SOIREE_MAX_ROUNDS - 2)
    s = replaceUpcoming(s, full())
    expect(s.rounds).toHaveLength(SOIREE_MAX_ROUNDS)
    expect(addRound(upcomingProgram(s), 'purple', upcomingRoom(s))).toHaveLength(SOIREE_MAX_ROUNDS - 2)
    for (let i = 2; i < SOIREE_MAX_ROUNDS; i++) s = skipRound(s)
    expect(upcomingRoom(s)).toBe(0)
    expect(replaceUpcoming(s, ['purple']).rounds).toHaveLength(SOIREE_MAX_ROUNDS)
  })

  it('une soirée déjà rallongée au-delà du plafond perd ses manches à venir en trop', () => {
    const long = soiree(Array.from({ length: SOIREE_MAX_ROUNDS + 6 }, () => 'hi-lo'))
    expect(withinRoundCap(long).rounds).toHaveLength(SOIREE_MAX_ROUNDS)
    let past = long
    for (let i = 0; i < SOIREE_MAX_ROUNDS + 2; i++) past = skipRound(past)
    expect(withinRoundCap(past).rounds).toHaveLength(SOIREE_MAX_ROUNDS + 2)
    const running = startRound(past, 3000)
    expect(withinRoundCap(running).rounds).toHaveLength(SOIREE_MAX_ROUNDS + 3)
    const short = soiree(['hi-lo'])
    expect(withinRoundCap(short)).toBe(short)
  })
})

describe('addition', () => {
  it('désigne le payeur, le palmarès et les moments', () => {
    let s = soiree(['hi-lo', 'patate-chaude', 'purple'])
    s = play(s, { lea: [5, 0], sam: [2, 1], theo: [7, 0], nina: [0, 0] })
    s = play(s, { lea: [1, 1], sam: [2, 1], theo: [3, 0], nina: [0, 0] })
    s = play(s, { theo: [0, 0], nina: [0, 1] })
    const sum = soireeSummary(s)
    expect(sum.payerId).toBe('theo')
    expect(sum.totalDrinks).toBe(20)
    const kinds = Object.fromEntries(sum.awards.map((a) => [a.kind, a]))
    expect(kinds.pilier.playerId).toBe('theo')
    expect(kinds.survivant.playerId).toBe('nina')
    expect(kinds.roi.playerId).toBe('sam')
    expect(kinds['gros-coup']).toMatchObject({ playerId: 'theo', gameId: 'hi-lo', value: 7 })
    expect(kinds.arrose).toMatchObject({ gameId: 'hi-lo', value: 14 })
    expect(sum.moments[0]).toMatchObject({ kind: 'round-drinks', gameId: 'hi-lo', total: 14, topPlayerId: 'theo' })
    const entry = toHistoryEntry(finishSoiree(s, 9000), sum, 9000)
    expect(entry.rounds).toHaveLength(3)
    expect(entry.payerId).toBe('theo')
  })

  it("ne désigne personne en cas d'égalité", () => {
    const s = play(soiree(['hi-lo']), { lea: [3, 0], sam: [3, 0], theo: [1, 0], nina: [0, 0] })
    expect(soireeSummary(s).payerId).toBeNull()
  })
})

describe('mémoire de l’appareil', () => {
  it('fait entrer les stats d’un jeu local dans la manche en cours', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })
    writeSoiree(startRound(soiree(['hi-lo']), 2000))
    noteSoireeStats('lea', 'hi-lo', { gamesPlayed: 1, totalDrinks: 4 })
    noteSoireeStats('lea', 'purple', { gamesPlayed: 1, totalDrinks: 9 })
    expect(readSoiree()?.rounds[0].results.lea).toEqual({ drinks: 4, wins: 0, played: 1 })
    expect(isSoiree({ version: 1 })).toBe(false)
  })

  it('relit une soirée enregistrée sans ses manches d’un jeu retiré du catalogue, mais avec celles d’un jeu ajoutable', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })
    writeSoiree(soiree(['hi-lo', 'loup-garou', 'degaine']))
    expect(readSoiree()?.rounds.map((r) => r.gameId)).toEqual(['hi-lo', 'degaine'])
  })

  it('garde les bandes et l’historique sans doublon', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })
    saveBande({ id: 'b1', name: 'Une', playerIds: ['lea'], createdAt: 1, lastPlayedAt: 1 })
    saveBande({ id: 'b2', name: 'Deux', playerIds: ['sam'], createdAt: 2, lastPlayedAt: 2 })
    saveBande({ id: 'b1', name: 'Une bis', playerIds: ['lea'], createdAt: 1, lastPlayedAt: 3 })
    expect(readBandes().map((b) => b.name)).toEqual(['Une bis', 'Deux'])
    const s = finishSoiree(play(soiree(['hi-lo']), { lea: [2, 0] }), 4000)
    const entry = toHistoryEntry(s, soireeSummary(s), 4000)
    pushHistory(entry)
    pushHistory(entry)
    expect(readHistory()).toHaveLength(1)
  })
})

describe('stats de l’appareil', () => {
  const player = (id: string, games: Record<string, [plays: number, drinks: number]>): Player =>
    ({
      id,
      name: id,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        totalDrinks: Object.values(games).reduce((s, [, d]) => s + d, 0),
        gameStats: Object.fromEntries(Object.entries(games).map(([g, [plays, drinks]]) => [g, { gamesPlayed: plays, wins: 0, totalDrinks: drinks }])),
      },
    }) as unknown as Player

  it('classe les jeux par gorgées par joueur et par partie', () => {
    const players = [player('lea', { 'hi-lo': [2, 10], purple: [2, 2], plinko: [1, 9] }), player('sam', { 'hi-lo': [2, 4], purple: [2, 6] })]
    const rows = gameDrinkStats(players, ['hi-lo', 'purple', 'plinko'])
    expect(rows.map((r) => r.gameId)).toEqual(['hi-lo', 'purple'])
    expect(rows[0]).toMatchObject({ drinks: 14, plays: 4, perPlay: 3.5, topPlayerId: 'lea', topDrinks: 10 })
    expect(topDrinkers(players).map((d) => d.playerId)).toEqual(['lea', 'sam'])
  })

  it('résume les soirées avec alcool', () => {
    const base = { bandeId: null, bandeName: '', players: [], totals: [], payerId: null }
    const stats = historyStats([
      { ...base, id: 'a', date: 1, soft: false, rounds: [{ gameId: 'hi-lo', drinks: 10, wins: 0 }] },
      { ...base, id: 'b', date: 2, soft: false, rounds: [{ gameId: 'hi-lo', drinks: 4, wins: 0 }, { gameId: 'purple', drinks: 2, wins: 0 }] },
      { ...base, id: 'c', date: 3, soft: true, rounds: [{ gameId: 'purple', drinks: 0, wins: 2 }] },
    ])
    expect(stats).toMatchObject({ count: 3, drinkingCount: 2, totalDrinks: 16, averageDrinks: 8, favoriteGameId: 'hi-lo' })
    expect(stats.record?.id).toBe('a')
  })
})
