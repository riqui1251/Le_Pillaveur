import { describe, expect, it } from 'vitest'
import {
  createLGState,
  currentLGActorId,
  lgAlive,
  lgRolesFor,
  reduceLG,
  toLGClientView,
  toLGSpectatorView,
  LGEngineError,
  LG_DAWN_MS,
  LG_DEBATE_DEFAULT_MS,
  LG_REVEAL_MS,
  LG_SEER_MS,
  LG_SIPS_BAD_LYNCH,
  LG_SIPS_DEATH,
  LG_SIPS_POTION,
  LG_SIPS_WOLF_LYNCHED,
  LG_VOTE_MS,
  LG_WITCH_MS,
  LG_WOLVES_MS,
  type LGPlayer,
  type LGPhase,
  type LGState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

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

/** État artisanal à rôles CONNUS pour tester chaque phase isolément. */
function craft(
  players: LGPlayer[],
  phase: LGPhase,
  over: Partial<LGState> = {}
): LGState {
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
    dayVotes: {},
    debateSkips: [],
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

/** Village témoin : 1 loup, voyante, sorcière, chasseur, 2 villageois (6+... 7 rôles ? Non : 6). */
const SIX = [
  P('loup1', 'loup'),
  P('voy', 'voyante'),
  P('sor', 'sorciere'),
  P('cha', 'chasseur'),
  P('vil1', 'villageois'),
  P('vil2', 'villageois'),
]

const advance = (s: LGState, now: number) =>
  reduceLG(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now })

describe('création et rôles', () => {
  it('distribution des rôles selon l’effectif', () => {
    expect(lgRolesFor(5).filter((r) => r === 'loup')).toHaveLength(1)
    expect(lgRolesFor(5)).toContain('voyante')
    expect(lgRolesFor(5)).not.toContain('sorciere')
    expect(lgRolesFor(7).filter((r) => r === 'loup')).toHaveLength(2)
    expect(lgRolesFor(7)).toContain('sorciere')
    expect(lgRolesFor(9)).toContain('chasseur')
    expect(lgRolesFor(11).filter((r) => r === 'loup')).toHaveLength(3)
    expect(lgRolesFor(12)).toHaveLength(12)
  })

  it('création : bornes 5-12, reproductible, phase reveal-role chronométrée', () => {
    const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const s = createLGState(players, 'seed', LG_DEBATE_DEFAULT_MS, T0)
    expect(s.phase).toBe('reveal-role')
    expect(s.phaseEndsAt).toBe(T0 + LG_REVEAL_MS)
    expect(s).toEqual(createLGState(players, 'seed', LG_DEBATE_DEFAULT_MS, T0))
    expect(() => createLGState(players.slice(0, 4), 1, LG_DEBATE_DEFAULT_MS, T0)).toThrow(
      LGEngineError
    )
    const thirteen = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createLGState(thirteen, 1, LG_DEBATE_DEFAULT_MS, T0)).toThrow(LGEngineError)
  })

  it('reveal-role → ADVANCE → nuit de la voyante (round 1)', () => {
    const s = craft(SIX, 'reveal-role', { round: 0, phaseEndsAt: T0 + LG_REVEAL_MS })
    const night = advance(s, T0 + LG_REVEAL_MS)
    expect(night.phase).toBe('night-seer')
    expect(night.round).toBe(1)
    expect(night.phaseEndsAt).toBe(T0 + LG_REVEAL_MS + LG_SEER_MS)
  })

  it('voyante morte → la nuit saute directement aux loups', () => {
    const dead = SIX.map((p) => (p.id === 'voy' ? { ...p, alive: false } : p))
    const s = craft(dead, 'reveal-role', { round: 0, phaseEndsAt: T0 + LG_REVEAL_MS })
    expect(advance(s, T0 + LG_REVEAL_MS).phase).toBe('night-wolves')
  })
})

describe('nuit : voyante', () => {
  it('sonde une fois, résultat bufferisé, la phase garde sa durée pleine', () => {
    const s = craft(SIX, 'night-seer', { phaseEndsAt: T0 + LG_SEER_MS })
    expect(() =>
      reduceLG(s, { type: 'SEER_PEEK', playerId: 'vil1', targetId: 'loup1' })
    ).toThrow('NOT_SEER')
    const peeked = reduceLG(s, { type: 'SEER_PEEK', playerId: 'voy', targetId: 'loup1' })
    expect(peeked.phase).toBe('night-seer') // pas d'avance anticipée (anti-leak)
    expect(peeked.seerPeeks).toEqual([{ round: 1, targetId: 'loup1', team: 'loups' }])
    expect(() =>
      reduceLG(peeked, { type: 'SEER_PEEK', playerId: 'voy', targetId: 'vil1' })
    ).toThrow('ALREADY_PEEKED')
    expect(advance(peeked, T0 + LG_SEER_MS).phase).toBe('night-wolves')
  })
})

describe('nuit : loups puis sorcière', () => {
  it('seuls les loups votent, cible non-loup, vote modifiable, majorité', () => {
    const seven = [...SIX, P('loup2', 'loup')]
    let s = craft(seven, 'night-wolves', { phaseEndsAt: T0 + LG_WOLVES_MS })
    expect(() =>
      reduceLG(s, { type: 'WOLF_VOTE', playerId: 'vil1', targetId: 'vil2' })
    ).toThrow('NOT_WOLF')
    expect(() =>
      reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup1', targetId: 'loup2' })
    ).toThrow('INVALID_TARGET')
    s = reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup1', targetId: 'vil1' })
    s = reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup1', targetId: 'vil2' }) // change d'avis
    s = reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup2', targetId: 'vil2' })
    const witchPhase = advance(s, T0 + LG_WOLVES_MS)
    expect(witchPhase.phase).toBe('night-witch')
    expect(witchPhase.nightVictimId).toBe('vil2')
  })

  it('aucun vote loup → pas de victime ; sorcière morte → aube directe', () => {
    const noWitch = SIX.map((p) => (p.id === 'sor' ? { ...p, alive: false } : p))
    const s = craft(noWitch, 'night-wolves', { phaseEndsAt: T0 + LG_WOLVES_MS })
    const dawn = advance(s, T0 + LG_WOLVES_MS)
    expect(dawn.phase).toBe('dawn')
    expect(dawn.nightVictimId).toBeNull()
    expect(dawn.lastNightDeaths).toEqual([])
  })

  it('sorcière : sauvetage (victime survit, potion consommée, 1 gorgée)', () => {
    let s = craft(SIX, 'night-witch', {
      nightVictimId: 'vil1',
      phaseEndsAt: T0 + LG_WITCH_MS,
    })
    s = reduceLG(s, { type: 'WITCH_ACTION', playerId: 'sor', action: 'save' })
    expect(s.witchSaveUsed).toBe(true)
    expect(s.players.find((p) => p.id === 'sor')?.sips).toBe(LG_SIPS_POTION)
    expect(() =>
      reduceLG(s, { type: 'WITCH_ACTION', playerId: 'sor', action: 'none' })
    ).toThrow('ALREADY_ACTED')
    const dawn = advance(s, T0 + LG_WITCH_MS)
    expect(dawn.phase).toBe('dawn')
    expect(dawn.lastNightDeaths).toEqual([]) // sauvée !
    expect(dawn.players.find((p) => p.id === 'vil1')?.alive).toBe(true)
  })

  it('sorcière : potion de mort → deux morts possibles à l’aube (+3 gorgées chacun)', () => {
    let s = craft(SIX, 'night-witch', {
      nightVictimId: 'vil1',
      phaseEndsAt: T0 + LG_WITCH_MS,
    })
    s = reduceLG(s, { type: 'WITCH_ACTION', playerId: 'sor', action: 'kill', targetId: 'vil2' })
    const dawn = advance(s, T0 + LG_WITCH_MS)
    expect(dawn.lastNightDeaths.map((d) => [d.playerId, d.cause])).toEqual([
      ['vil1', 'loups'],
      ['vil2', 'sorciere'],
    ])
    expect(dawn.players.filter((p) => !p.alive)).toHaveLength(2)
    expect(dawn.players.find((p) => p.id === 'vil1')?.sips).toBe(LG_SIPS_DEATH)
    expect(dawn.deaths).toHaveLength(2) // rôles révélés dans l'historique public
  })
})

describe('aube, chasseur et victoire de nuit', () => {
  it('chasseur tué la nuit → phase de tir → sa cible meurt → débat', () => {
    const eight = [...SIX, P('vil3', 'villageois'), P('vil4', 'villageois')]
    let s = craft(eight, 'night-wolves', { phaseEndsAt: T0 + LG_WOLVES_MS })
    s = reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup1', targetId: 'cha' })
    s = advance(s, T0 + LG_WOLVES_MS) // → night-witch
    s = reduceLG(s, { type: 'WITCH_ACTION', playerId: 'sor', action: 'none' })
    s = advance(s, T0 + LG_WOLVES_MS + LG_WITCH_MS) // → dawn (chasseur mort)
    expect(s.phase).toBe('dawn')
    expect(s.pendingHunterId).toBe('cha')
    s = advance(s, T0 + LG_WOLVES_MS + LG_WITCH_MS + LG_DAWN_MS) // → hunter-shot
    expect(s.phase).toBe('hunter-shot')
    expect(currentLGActorId(s)).toBe('cha') // public : il est mort annoncé
    expect(() =>
      reduceLG(s, { type: 'HUNTER_SHOT', playerId: 'vil1', targetId: 'loup1', now: T0 })
    ).toThrow('NOT_HUNTER')
    const shot = reduceLG(s, { type: 'HUNTER_SHOT', playerId: 'cha', targetId: 'vil3', now: T0 })
    expect(shot.players.find((p) => p.id === 'vil3')?.alive).toBe(false)
    expect(shot.phase).toBe('day-debate')
    expect(shot.deaths.some((d) => d.cause === 'chasseur')).toBe(true)
  })

  it('le tir du chasseur peut donner la victoire au village', () => {
    // 1 loup vivant, chasseur lynché → il abat le loup → village gagne.
    const s = craft(SIX, 'hunter-shot', {
      players: SIX.map((p) => (p.id === 'cha' ? { ...p, alive: false } : p)),
      pendingHunterId: 'cha',
      afterHunter: 'night',
    })
    const shot = reduceLG(s, { type: 'HUNTER_SHOT', playerId: 'cha', targetId: 'loup1', now: T0 })
    expect(shot.phase).toBe('finished')
    expect(shot.winnerTeam).toBe('village')
  })

  it('silence du chasseur (timeout) → pas de tir, la partie continue', () => {
    const eight = [...SIX, P('vil3', 'villageois'), P('vil4', 'villageois')]
    const s = craft(eight, 'hunter-shot', {
      players: eight.map((p) => (p.id === 'cha' ? { ...p, alive: false } : p)),
      pendingHunterId: 'cha',
      afterHunter: 'day',
      phaseEndsAt: T0 + 20_000,
    })
    const after = advance(s, T0 + 20_000)
    expect(after.phase).toBe('day-debate')
    expect(after.players.filter((p) => !p.alive)).toHaveLength(1)
  })

  it('les loups gagnent quand ils égalent le reste du village', () => {
    // 1 loup + 2 villageois vivants → les loups tuent 1 → 1v1 → victoire loups.
    const five = [
      P('loup1', 'loup'),
      P('vil1', 'villageois'),
      P('vil2', 'villageois'),
      P('voy', 'voyante', { alive: false }),
      P('sor', 'sorciere', { alive: false }),
    ]
    let s = craft(five, 'night-wolves', { phaseEndsAt: T0 + LG_WOLVES_MS })
    s = reduceLG(s, { type: 'WOLF_VOTE', playerId: 'loup1', targetId: 'vil1' })
    s = advance(s, T0 + LG_WOLVES_MS) // sorcière morte → aube directe
    expect(s.phase).toBe('dawn')
    const day = advance(s, T0 + LG_WOLVES_MS + LG_DAWN_MS)
    expect(day.phase).toBe('finished')
    expect(day.winnerTeam).toBe('loups')
  })
})

describe('jour : débat et vote', () => {
  it('skip unanime des vivants → vote sans attendre', () => {
    let s = craft(SIX, 'day-debate', { phaseEndsAt: T0 + LG_DEBATE_DEFAULT_MS })
    for (const p of SIX.slice(0, 5)) {
      s = reduceLG(s, { type: 'DEBATE_SKIP', playerId: p.id, now: T0 })
      expect(s.phase).toBe('day-debate')
    }
    s = reduceLG(s, { type: 'DEBATE_SKIP', playerId: 'vil2', now: T0 + 1000 })
    expect(s.phase).toBe('day-vote')
    expect(s.phaseEndsAt).toBe(T0 + 1000 + LG_VOTE_MS)
  })

  it('vote secret : lynchage d’un LOUP → les loups vivants trinquent, victoire', () => {
    let s = craft(SIX, 'day-vote', { phaseEndsAt: T0 + LG_VOTE_MS })
    for (const voter of ['voy', 'sor', 'cha', 'vil1', 'vil2']) {
      s = reduceLG(s, { type: 'DAY_VOTE', playerId: voter, targetId: 'loup1', now: T0 })
    }
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'loup1', targetId: 'vil1', now: T0 })
    expect(s.phase).toBe('finished') // plus de loups
    expect(s.winnerTeam).toBe('village')
    expect(s.lastVoteResult).toMatchObject({ eliminatedId: 'loup1', role: 'loup' })
    // Le lynché boit sa mort ; le bonus « loup démasqué » ne touche que ses
    // complices VIVANTS (ici aucun).
    expect(s.players.find((p) => p.id === 'loup1')?.sips).toBe(LG_SIPS_DEATH)
  })

  it('lynchage d’un loup avec complice : le complice vivant trinque', () => {
    const seven = [...SIX, P('loup2', 'loup')]
    let s = craft(seven, 'day-vote', { phaseEndsAt: T0 + LG_VOTE_MS })
    for (const voter of ['voy', 'sor', 'cha', 'vil1', 'vil2', 'loup2']) {
      s = reduceLG(s, { type: 'DAY_VOTE', playerId: voter, targetId: 'loup1', now: T0 })
    }
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'loup1', targetId: 'vil1', now: T0 })
    expect(s.players.find((p) => p.id === 'loup2')?.sips).toBe(LG_SIPS_WOLF_LYNCHED)
    expect(s.phase).toBe('night-seer') // loup2 encore là → la partie continue
  })

  it('lynchage d’un INNOCENT → tous les vivants boivent, la partie continue', () => {
    const seven = [...SIX, P('vil3', 'villageois')]
    let s = craft(seven, 'day-vote', { phaseEndsAt: T0 + LG_VOTE_MS })
    for (const voter of ['loup1', 'voy', 'sor', 'cha', 'vil2', 'vil3']) {
      s = reduceLG(s, { type: 'DAY_VOTE', playerId: voter, targetId: 'vil1', now: T0 })
    }
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'vil1', targetId: 'loup1', now: T0 })
    expect(s.lastVoteResult).toMatchObject({ eliminatedId: 'vil1', role: 'villageois' })
    expect(s.phase).toBe('night-seer') // nuit suivante
    expect(s.round).toBe(2)
    // Les 6 vivants ont bu la honte du mauvais lynchage.
    for (const p of s.players.filter((q) => q.alive)) {
      expect(p.sips).toBe(LG_SIPS_BAD_LYNCH)
    }
    // La bannière du lynchage PERSISTE pendant la nuit.
    expect(s.lastVoteResult?.eliminatedId).toBe('vil1')
  })

  it('égalité → revote restreint aux ex-aequo ; re-égalité → personne ne sort', () => {
    let s = craft(SIX, 'day-vote', { phaseEndsAt: T0 + LG_VOTE_MS })
    // 3 votes cha, 3 votes vil1 → égalité.
    for (const [voter, target] of [
      ['loup1', 'cha'],
      ['voy', 'cha'],
      ['vil1', 'cha'],
      ['sor', 'vil1'],
      ['vil2', 'vil1'],
      ['cha', 'vil1'],
    ] as const) {
      s = reduceLG(s, { type: 'DAY_VOTE', playerId: voter, targetId: target, now: T0 })
    }
    expect(s.phase).toBe('day-revote')
    expect(s.revoteCandidates?.sort()).toEqual(['cha', 'vil1'])
    expect(() =>
      reduceLG(s, { type: 'DAY_VOTE', playerId: 'voy', targetId: 'vil2', now: T0 })
    ).toThrow('INVALID_TARGET') // hors ex-aequo
    // Revote qui expire avec une nouvelle égalité 1-1 → personne.
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'voy', targetId: 'cha', now: T0 })
    s = reduceLG(s, { type: 'DAY_VOTE', playerId: 'sor', targetId: 'vil1', now: T0 })
    const resolved = advance(s, T0 + LG_VOTE_MS * 2)
    expect(resolved.lastVoteResult?.tie).toBe(true)
    expect(resolved.lastVoteResult?.eliminatedId).toBeNull()
    expect(lgAlive(resolved)).toHaveLength(6)
    expect(resolved.phase).toBe('night-seer')
  })
})

describe('vues anti-triche (3 niveaux + TV)', () => {
  const night = craft([...SIX, P('loup2', 'loup')], 'night-wolves', {
    wolfVotes: { loup1: 'vil1' },
    seerPeeks: [{ round: 1, targetId: 'loup1', team: 'loups' }],
    nightVictimId: null,
  })

  it('villageois vivant : son rôle seul, rien de la nuit', () => {
    const v = toLGClientView(night, 'vil1')
    expect(v.myRole).toBe('villageois')
    expect(v.ghost).toBe(false)
    expect(v.players.find((p) => p.id === 'loup1')?.role).toBeNull()
    expect(v.players.find((p) => p.id === 'voy')?.role).toBeNull()
    expect(v.wolfVotes).toBeNull()
    expect(v.seerPeeks).toBeNull()
    expect(v.witchPotions).toBeNull()
    const json = JSON.stringify(v)
    expect(json).not.toContain('rngState')
    expect(json).not.toContain('witchSavedId')
  })

  it('loup vivant : ses complices + les votes loups, rien de la voyante', () => {
    const v = toLGClientView(night, 'loup2')
    expect(v.players.find((p) => p.id === 'loup1')?.role).toBe('loup')
    expect(v.players.find((p) => p.id === 'voy')?.role).toBeNull()
    expect(v.wolfVotes).toEqual({ loup1: 'vil1' })
    expect(v.seerPeeks).toBeNull()
  })

  it('voyante : ses visions ; sorcière : victime + potions pendant SA phase', () => {
    expect(toLGClientView(night, 'voy').seerPeeks).toHaveLength(1)
    expect(toLGClientView(night, 'voy').wolfVotes).toBeNull()
    const witchPhase = craft(SIX, 'night-witch', { nightVictimId: 'vil1' })
    const w = toLGClientView(witchPhase, 'sor')
    expect(w.nightVictimId).toBe('vil1')
    expect(w.witchPotions).toEqual({ save: true, kill: true })
    expect(toLGClientView(witchPhase, 'vil1').nightVictimId).toBeNull()
  })

  it('fantôme 👻 : vue omnisciente ; morts publics révélés à tous', () => {
    const withDead = craft(
      SIX.map((p) => (p.id === 'vil1' ? { ...p, alive: false } : p)),
      'night-wolves',
      { wolfVotes: { loup1: 'vil2' } }
    )
    const ghost = toLGClientView(withDead, 'vil1')
    expect(ghost.ghost).toBe(true)
    expect(ghost.players.every((p) => p.role !== null)).toBe(true)
    expect(ghost.wolfVotes).toEqual({ loup1: 'vil2' })
    // Un vivant voit le rôle du MORT (révélé publiquement), pas des autres.
    const alive = toLGClientView(withDead, 'vil2')
    expect(alive.players.find((p) => p.id === 'vil1')?.role).toBe('villageois')
    expect(alive.players.find((p) => p.id === 'loup1')?.role).toBeNull()
  })

  it('TV neutre : aucun secret de vivant ; vote du jour → « a voté » public, choix secret', () => {
    const tv = toLGSpectatorView(night)
    expect(tv.myRole).toBeNull()
    expect(tv.wolfVotes).toBeNull()
    expect(tv.players.every((p) => p.role === null)).toBe(true)
    const voting = craft(SIX, 'day-vote', { dayVotes: { voy: 'loup1' } })
    const v = toLGSpectatorView(voting)
    expect(v.hasVoted.voy).toBe(true)
    expect(v.myVote).toBeNull()
    expect(JSON.stringify(v)).not.toContain('"dayVotes"')
  })

  it('l’état des potions de la sorcière ne fuite pas aux autres vivants', () => {
    const s = craft(SIX, 'night-witch', {
      nightVictimId: 'vil1',
      witchSaveUsed: true,
      witchActed: true,
    })
    const villager = toLGClientView(s, 'vil1')
    expect(villager.witchPotions).toBeNull()
    expect(villager.witchActed).toBeNull()
    const json = JSON.stringify(villager)
    expect(json).not.toContain('witchSaveUsed')
    expect(json).not.toContain('witchKillUsed')
    // La sorcière et les fantômes, eux, voient tout.
    expect(toLGClientView(s, 'sor').witchPotions).toEqual({ save: false, kill: true })
    expect(toLGClientView(s, 'sor').witchActed).toBe(true)
  })

  it('currentActorId ne trahit jamais un rôle de vivant', () => {
    expect(currentLGActorId(craft(SIX, 'night-seer'))).toBeNull()
    expect(currentLGActorId(craft(SIX, 'night-wolves'))).toBeNull()
    expect(currentLGActorId(craft(SIX, 'night-witch'))).toBeNull()
    expect(currentLGActorId(craft(SIX, 'day-vote'))).toBeNull()
    expect(
      currentLGActorId(craft(SIX, 'hunter-shot', { pendingHunterId: 'cha' }))
    ).toBe('cha')
  })
})

describe('buildLGState (adaptateur)', () => {
  it('complète avec des bots jusqu’à 5 (résilience du rematch)', async () => {
    const { buildLGState } = await import('./server-adapter')
    const s = buildLGState([{ userId: 'u1', user: { displayName: 'Riri' } }], undefined, 42)
    expect(s.players).toHaveLength(5)
    expect(s.players.filter((p) => p.isBot)).toHaveLength(4)
    expect(s.players[0]).toMatchObject({ id: 'u1', isBot: false })
  })
})

describe('contrat remplacement', () => {
  it('LEAVE / REJOIN / REPLACE_LEFT', () => {
    let s = craft(SIX, 'day-debate')
    s = reduceLG(s, { type: 'LEAVE', playerId: 'vil1', at: T0 })
    expect(s.players.find((p) => p.id === 'vil1')?.leftAt).toBe(T0)
    expect(
      reduceLG(s, { type: 'REJOIN', playerId: 'vil1' }).players.find((p) => p.id === 'vil1')
        ?.leftAt
    ).toBeNull()
    const bot = reduceLG(s, { type: 'REPLACE_LEFT', now: T0 + 60_000, graceMs: 30_000 })
    expect(bot.players.find((p) => p.id === 'vil1')?.isBot).toBe(true)
  })
})
