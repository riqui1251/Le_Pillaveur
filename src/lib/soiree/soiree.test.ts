import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGameById } from '@/lib/games'
import type { Player } from '@/lib/players'
import { SOIREE_GAME_IDS, playableSoireeGameIds, soireeCap, soireeHeat } from './catalog'
import { SOIREE_MAX_ROUNDS, addRound, buildProgram, moveRound, removeRound, replaceRound } from './program'
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

  it('une soirée enregistrée avec Dégaine le perd de la suite, pas de l’ardoise', () => {
    const pending = play(soiree(['hi-lo', 'degaine', 'purple', 'degaine']), { lea: [2, 0] })
    const cleaned = withoutRetiredGames(pending)
    expect(cleaned.rounds.map((r) => r.gameId)).toEqual(['hi-lo', 'purple'])
    expect(cleaned.current).toBe(1)
    // Déjà jouée ou en cours : elle reste.
    const played = play(soiree(['degaine', 'hi-lo']), { lea: [3, 0] })
    expect(withoutRetiredGames(played)).toBe(played)
    const running = startRound(soiree(['degaine', 'hi-lo']), 2000)
    expect(withoutRetiredGames(running).rounds.map((r) => r.gameId)).toEqual(['degaine', 'hi-lo'])
    const clean = soiree(['hi-lo', 'purple'])
    expect(withoutRetiredGames(clean)).toBe(clean)
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

  it('relit une soirée enregistrée sans ses manches Dégaine à venir', () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })
    writeSoiree(soiree(['hi-lo', 'degaine']))
    expect(readSoiree()?.rounds.map((r) => r.gameId)).toEqual(['hi-lo'])
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
