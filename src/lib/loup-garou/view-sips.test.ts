import { describe, expect, it } from 'vitest'
import {
  reduceLG,
  toLGClientView,
  toLGSpectatorView,
  LG_DEBATE_DEFAULT_MS,
  LG_SIPS_DEATH,
  LG_SIPS_POTION,
  LG_SIPS_WOLF_LYNCHED,
  LG_VOTE_MS,
  LG_WITCH_MS,
  type LGPlayer,
  type LGPhase,
  type LGState,
} from './engine'

/**
 * Les gorgées d'un vivant trahissent son rôle : seuls les loups vivants
 * trinquent quand un complice est lynché, seule la Sorcière boit une potion.
 * Elles ne sont lisibles que par lui-même, les fantômes et tous en fin de
 * partie ; celles des morts restent publiques.
 */

const T0 = 1_000_000

const P = (id: string, role: LGPlayer['role'], extra: Partial<LGPlayer> = {}): LGPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: false,
  leftAt: null,
  role,
  alive: true,
  sips: 0,
  ...extra,
})

function craft(players: LGPlayer[], phase: LGPhase, over: Partial<LGState> = {}): LGState {
  return {
    version: 1,
    phase,
    phaseSeq: 1,
    phaseEndsAt: T0 + 60_000,
    players,
    round: 1,
    debateMs: LG_DEBATE_DEFAULT_MS,
    wolfVotes: {},
    seerPeeks: [],
    witchSaveUsed: false,
    witchKillUsed: false,
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    guardProtectedId: null,
    guardLastProtectedId: null,
    ravenTargetId: null,
    elderLifeUsed: false,
    elderAttackedRound: null,
    mayorId: null,
    mayorVotes: {},
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
    lastNightDeaths: [],
    lastVoteResult: null,
    deaths: [],
    winnerTeam: null,
    rematchVotes: [],
    rngState: 424242,
    ...over,
  }
}

const SEVEN = [
  P('loup1', 'loup'),
  P('loup2', 'loup'),
  P('voy', 'voyante'),
  P('sor', 'sorciere'),
  P('cha', 'chasseur'),
  P('vil1', 'villageois'),
  P('vil2', 'villageois'),
]

const sipsOf = (state: LGState, viewerId: string, id: string) =>
  toLGClientView(state, viewerId).players.find((p) => p.id === id)?.sips

/** loup1 lynché : loup2, complice vivant, trinque seul. */
function afterWolfLynch(): LGState {
  let s = craft(SEVEN, 'day-vote', { phaseEndsAt: T0 + LG_VOTE_MS })
  for (const voter of ['voy', 'sor', 'cha', 'vil1', 'vil2', 'loup2']) {
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: voter, targetId: 'loup1', now: T0 })
  }
  s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'loup1', targetId: 'vil1', now: T0 })
  expect(s.phase).not.toBe('finished')
  expect(s.players.find((p) => p.id === 'loup2')?.sips).toBe(LG_SIPS_WOLF_LYNCHED)
  return s
}

describe('gorgées des vivants : privées', () => {
  it('lynchage d’un loup : le complice survivant est à 0 pour un villageois, à 3 pour lui-même', () => {
    const s = afterWolfLynch()
    expect(sipsOf(s, 'vil1', 'loup2')).toBe(0)
    expect(sipsOf(s, 'voy', 'loup2')).toBe(0)
    expect(sipsOf(s, 'loup2', 'loup2')).toBe(LG_SIPS_WOLF_LYNCHED)
  })

  it('le lynché, mort, garde ses gorgées publiques', () => {
    const s = afterWolfLynch()
    expect(sipsOf(s, 'vil1', 'loup1')).toBe(LG_SIPS_DEATH)
    expect(toLGSpectatorView(s).players.find((p) => p.id === 'loup1')?.sips).toBe(LG_SIPS_DEATH)
  })

  it('potion de la Sorcière : 0 pour les autres, 1 pour elle', () => {
    let s = craft(SEVEN, 'night-witch', { nightVictimId: 'vil1', phaseEndsAt: T0 + LG_WITCH_MS })
    s = reduceLG(s, { type: 'WITCH_ACTION', playerId: 'sor', action: 'save' })
    expect(sipsOf(s, 'sor', 'sor')).toBe(LG_SIPS_POTION)
    for (const viewer of ['loup1', 'voy', 'cha', 'vil1']) {
      expect(sipsOf(s, viewer, 'sor')).toBe(0)
    }
  })

  it('spectateur (TV) : aucune gorgée de vivant', () => {
    const s = afterWolfLynch()
    const tv = toLGSpectatorView(s)
    for (const p of tv.players.filter((q) => q.alive)) {
      expect(p.sips).toBe(0)
    }
  })

  it('fantôme : vue omnisciente, toutes les gorgées', () => {
    const s = afterWolfLynch()
    const withGhost = {
      ...s,
      players: s.players.map((p) => (p.id === 'vil2' ? { ...p, alive: false } : p)),
    }
    expect(toLGClientView(withGhost, 'vil2').ghost).toBe(true)
    expect(sipsOf(withGhost, 'vil2', 'loup2')).toBe(LG_SIPS_WOLF_LYNCHED)
  })

  it('fin de partie : toutes les gorgées pour tous', () => {
    const s = { ...afterWolfLynch(), phase: 'finished' as const, winnerTeam: 'village' as const }
    expect(sipsOf(s, 'vil1', 'loup2')).toBe(LG_SIPS_WOLF_LYNCHED)
    expect(toLGSpectatorView(s).players.find((p) => p.id === 'loup2')?.sips).toBe(LG_SIPS_WOLF_LYNCHED)
  })
})
