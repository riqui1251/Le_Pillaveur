import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  LG_DEBATE_DEFAULT_MS,
  LG_SPEECH_CAP,
  type LGDebateSpeech,
  type LGPlayer,
  type LGPhase,
  type LGState,
} from './engine'
import { applyLGBotAction, applyLGRoomAction, LG_WOLF_RANDOM_SHARE } from './server-adapter'

/**
 * Réactions des bots à la parole HUMAINE par le tick `bot` : un bot accusé
 * par un humain se défend au tick suivant, un autre abonde au tick d'après,
 * la chaîne s'arrête d'elle-même, et l'accusation humaine entraîne le vote
 * des bots. Les bots « B1 »… n'ont pas de persona : tous suiveurs d'audace
 * 0,5 — et le tick seedé tire 0,76 en premier, donc aucun d'eux ne revient
 * une seconde fois à la charge (lot 5) : les tests qui veulent une seconde
 * réaction prennent un persona audacieux.
 */

const T0 = 1_000_000

/** Les joueurs dont l'identifiant commence par `b` sont des bots. */
const P = (id: string, role: LGPlayer['role'], extra: Partial<LGPlayer> = {}): LGPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: id.startsWith('b'),
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
    phaseEndsAt: T0 + LG_DEBATE_DEFAULT_MS,
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

const say = (
  playerId: string,
  kind: LGDebateSpeech['kind'],
  targetId: string,
  round = 1
): LGDebateSpeech => ({ playerId, kind, targetId, round })

/** 1 humain + 3 bots (1 loup) ; les bots ont ouvert (alliances, sans accusation) puis skippé. */
const SOLO = [P('h', 'villageois'), P('b1', 'loup'), P('b2', 'villageois'), P('b3', 'voyante')]
const botsDone = (): LGState =>
  craft(SOLO, 'day-debate', {
    debateSpeech: [say('b1', 'ally', 'b2'), say('b2', 'ally', 'b3'), say('b3', 'ally', 'b1')],
    debateSkips: ['b1', 'b2', 'b3'],
  })

function humanSpeaks(state: LGState, kind: 'suspect' | 'defend' | 'ally', targetId: string): LGState {
  const r = applyLGRoomAction(state, 'h', { type: 'debate-speak', kind, targetId })
  if (!r.ok) throw new Error(r.error)
  return r.state
}

/** Tick bot déterministe, à 60 s de la fin du débat. */
function tick(state: LGState, now = T0): LGState {
  const r = applyLGBotAction(state, createRng('tick').next, now)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

const NOT_BOT_TURN = { ok: false, error: 'NOT_BOT_TURN' }
const botTurn = (state: LGState, now = T0) => applyLGBotAction(state, createRng('tick').next, now)

describe('débat : un bot accusé par un humain se défend, un autre abonde', () => {
  it('tick 1 : un seul « defend » visant l’accusateur ; tick 2 : un « rally » ; tick 3 : NOT_BOT_TURN', () => {
    const accused = humanSpeaks(botsDone(), 'suspect', 'b2')
    const defended = tick(accused)
    expect(defended.debateSpeech).toHaveLength(accused.debateSpeech.length + 1)
    expect(defended.debateSpeech.at(-1)).toEqual(say('b2', 'defend', 'h'))
    expect(defended.phase).toBe('day-debate')
    const rallied = tick(defended)
    expect(rallied.debateSpeech).toHaveLength(defended.debateSpeech.length + 1)
    expect(rallied.debateSpeech.at(-1)).toEqual(say('b1', 'rally', 'b2'))
    expect(botTurn(rallied)).toEqual(NOT_BOT_TURN)
  })

  it('une seule réponse par accusation : réaccuser relance un audacieux, le cap du bot clôt sa part', () => {
    // Kéké : agressif, audacieux (0,8 > 0,76 du dé) et bavard (3 paroles) — Dédé n'en a que deux.
    const keke = (): LGState => {
      const base = botsDone()
      return { ...base, players: base.players.map((p) => (p.id === 'b2' ? { ...p, name: 'Kéké 🛵' } : p)) }
    }
    let s = tick(humanSpeaks(keke(), 'suspect', 'b2'))
    expect(s.debateSpeech.at(-1)).toEqual(say('b2', 'suspect', 'h'))
    s = tick(humanSpeaks(s, 'suspect', 'b2'))
    expect(s.debateSpeech.at(-1)).toEqual(say('b2', 'suspect', 'h'))
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b2')).toHaveLength(LG_SPEECH_CAP)
    // 3e accusation (dernière parole de l'humain) : b2 est au cap, un autre bot abonde à sa place.
    s = tick(humanSpeaks(s, 'suspect', 'b2'))
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b2')).toHaveLength(LG_SPEECH_CAP)
    expect(s.debateSpeech.at(-1)).toEqual(say('b1', 'rally', 'b2'))
    expect(() => humanSpeaks(s, 'suspect', 'b2')).toThrow('ALREADY_SPOKE')
  })

  it('réaccusé, un converti (audace 0,5) ne revient pas à la charge quand le dé le dit (0,76) : un autre bot abonde à sa place', () => {
    const s = tick(humanSpeaks(tick(humanSpeaks(botsDone(), 'suspect', 'b2')), 'suspect', 'b2'))
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b2')).toHaveLength(2)
    expect(s.debateSpeech.at(-1)).toEqual(say('b1', 'rally', 'b2'))
  })

  it('une accusation venant d’un BOT ne déclenche aucune défense : le tick interpelle l’humain muet', () => {
    // Gépéto (3 paroles) garde de quoi réagir après son interpellation.
    const s = craft(SOLO, 'day-debate', {
      players: SOLO.map((p) => (p.id === 'b1' ? { ...p, name: 'Gépéto 🤠' } : p)),
      debateSpeech: [say('b2', 'ally', 'b3'), say('b3', 'ally', 'b1'), say('b1', 'suspect', 'b2')],
      debateSkips: ['b1', 'b2', 'b3'],
    })
    const asked = tick(s)
    expect(asked.debateSpeech.at(-1)).toEqual(say('b1', 'ask', 'h'))
    expect(asked.debateSpeech.filter((sp) => sp.kind === 'defend')).toHaveLength(0)
    expect(botTurn(asked)).toEqual(NOT_BOT_TURN)
    // À moins de 20 s de la fin, on n'interpelle plus : rien à faire.
    expect(botTurn(s, T0 + LG_DEBATE_DEFAULT_MS - 15_000)).toEqual(NOT_BOT_TURN)
  })

  it('une alliance humaine est rendue par un suiveur ; une défense humaine ne déclenche rien', () => {
    const allied = tick(humanSpeaks(botsDone(), 'ally', 'b2'))
    expect(allied.debateSpeech.at(-1)).toEqual(say('b2', 'ally', 'h'))
    expect(botTurn(allied)).toEqual(NOT_BOT_TURN)
    expect(botTurn(humanSpeaks(botsDone(), 'defend', 'b2'))).toEqual(NOT_BOT_TURN)
  })

  it('accusé avant l’ouverture des bots : la défense EST son ouverture, un bot par tick ensuite', () => {
    const s = humanSpeaks(craft(SOLO, 'day-debate'), 'suspect', 'b2')
    const defended = tick(s)
    expect(defended.debateSpeech.filter((sp) => sp.playerId === 'b2')).toEqual([say('b2', 'defend', 'h')])
    const rallied = tick(defended)
    expect(rallied.debateSpeech.at(-1)).toEqual(say('b1', 'rally', 'b2'))
    const opened = tick(rallied)
    expect(opened.debateSpeech.at(-1)?.playerId).toBe('b3')
    expect(opened.debateSkips).toEqual([])
    // Tous ont parlé, l'humain aussi : skip groupé en une écriture, puis plus rien.
    const skipped = tick(opened)
    expect(skipped.debateSpeech).toHaveLength(opened.debateSpeech.length)
    expect(skipped.debateSpeech.filter((sp) => sp.playerId === 'b2')).toHaveLength(1)
    expect(skipped.debateSkips).toEqual(['b1', 'b2', 'b3'])
    expect(botTurn(skipped)).toEqual(NOT_BOT_TURN)
  })

  it('« Passer au vote » de l’humain seul : les bots suivent au tick suivant, même muets', () => {
    const r = applyLGRoomAction(craft(SOLO, 'day-debate'), 'h', { type: 'debate-skip' })
    if (!r.ok) throw new Error(r.error)
    expect(r.state.phase).toBe('day-debate')
    expect(tick(r.state).phase).toBe('day-vote')
  })
})

describe('vote : l’accusation humaine entraîne la table', () => {
  function toVote(state: LGState): LGState {
    const r = applyLGRoomAction(state, 'h', { type: 'debate-skip' })
    if (!r.ok) throw new Error(r.error)
    expect(r.state.phase).toBe('day-vote')
    return r.state
  }

  it('l’humain accuse X (non loup) → tous les bots votent X', () => {
    const voted = tick(toVote(humanSpeaks(botsDone(), 'suspect', 'b2')))
    expect(voted.dayVotes.b1).toBe('b2')
    expect(voted.dayVotes.b3).toBe('b2')
    expect(voted.dayVotes.b2).toBeDefined()
    expect(voted.dayVotes.b2).not.toBe('b2')
  })

  it('l’humain accuse un loup → le loup bot complice ne le vote pas, les autres si', () => {
    const PACK = [
      P('h', 'villageois'),
      P('b1', 'loup'),
      P('b2', 'loup'),
      P('b3', 'villageois'),
      P('b4', 'voyante'),
    ]
    const s = craft(PACK, 'day-debate', {
      debateSpeech: [
        say('b1', 'ally', 'b3'),
        say('b2', 'ally', 'b4'),
        say('b3', 'ally', 'b1'),
        say('b4', 'ally', 'b2'),
      ],
      debateSkips: ['b1', 'b2', 'b3', 'b4'],
    })
    const voted = tick(toVote(humanSpeaks(s, 'suspect', 'b1')))
    expect(voted.dayVotes.b3).toBe('b1')
    expect(voted.dayVotes.b4).toBe('b1')
    expect(voted.dayVotes.b2).toBeDefined()
    expect(voted.dayVotes.b2).not.toBe('b1')
  })
})

describe('nuit : la meute des loups bots et la voyante bot jouent sur le score (lot 3)', () => {
  /** Tirages successifs : le premier décide « hasard ou cible commune », le suivant pioche. */
  const seq = (values: number[]) => {
    let i = 0
    return () => values[Math.min(i++, values.length - 1)]
  }
  const PACK = [P('h', 'villageois'), P('b1', 'loup'), P('b2', 'loup'), P('b3', 'villageois'), P('b4', 'voyante')]
  const named = () => craft(PACK, 'night-wolves', { round: 2, debateSpeech: [say('h', 'suspect', 'b1', 1)] })

  it('deux loups bots visent la même victime : celui qui a nommé un loup la veille', () => {
    const r = applyLGBotAction(named(), () => 0.5, T0)
    expect(r.ok && r.state.wolfVotes).toEqual({ b1: 'h', b2: 'h' })
  })

  it('une nuit sur quatre, la meute frappe au hasard — ensemble, jamais un loup ni un mort', () => {
    expect(LG_WOLF_RANDOM_SHARE).toBe(0.25)
    const r = applyLGBotAction(named(), seq([0.1, 0.9]), T0)
    expect(r.ok && r.state.wolfVotes).toEqual({ b1: 'b4', b2: 'b4' })
    const dead = craft(
      PACK.map((p) => (p.id === 'b4' ? { ...p, alive: false } : p)),
      'night-wolves',
      { round: 2 }
    )
    for (const draw of [0.1, 0.2, 0.5, 0.9]) {
      const res = applyLGBotAction(dead, seq([0.1, draw]), T0)
      if (!res.ok) throw new Error(res.error)
      const votes = Object.values(res.state.wolfVotes)
      expect(votes).toHaveLength(2)
      expect(new Set(votes).size).toBe(1)
      expect(['h', 'b3']).toContain(votes[0])
    }
  })

  it('table muette (première nuit) : la meute tire une victime commune au hasard, pas le premier siège', () => {
    // buildLGState place l'hôte humain en premier : une table sans débat ne
    // doit pas le désigner d'office trois nuits sur quatre.
    const quiet = craft(PACK, 'night-wolves')
    const last = applyLGBotAction(quiet, seq([0.5, 0.99]), T0)
    expect(last.ok && last.state.wolfVotes).toEqual({ b1: 'b4', b2: 'b4' })
    const first = applyLGBotAction(quiet, seq([0.5, 0.01]), T0)
    expect(first.ok && first.state.wolfVotes).toEqual({ b1: 'h', b2: 'h' })
    // Le maire, lui, reste la cible désignée d'une table muette.
    const mayor = applyLGBotAction({ ...quiet, mayorId: 'b3' }, seq([0.5, 0.99]), T0)
    expect(mayor.ok && mayor.state.wolfVotes).toEqual({ b1: 'b3', b2: 'b3' })
  })

  it('voyante bot : sonde le plus suspect qu’elle n’a pas encore vu', () => {
    const first = tick(craft(SOLO, 'night-seer', { round: 2, debateSpeech: [say('h', 'suspect', 'b1', 1)] }))
    expect(first.seerPeeks).toEqual([{ round: 2, targetId: 'b1', team: 'loups' }])
    const again = craft(SOLO, 'night-seer', {
      round: 3,
      debateSpeech: [say('h', 'suspect', 'b1', 2)],
      seerPeeks: [{ round: 2, targetId: 'b1', team: 'loups' }],
    })
    const second = tick(again).seerPeeks.at(-1)
    expect(second?.round).toBe(3)
    expect(['h', 'b2']).toContain(second?.targetId)
  })
})

describe('vote : le plus soupçonné, toujours un bulletin', () => {
  it('au revote, le bot vote parmi les candidats, le plus voté au premier tour', () => {
    const s = craft(SOLO, 'day-revote', {
      revoteCandidates: ['b2', 'h'],
      lastVoteResult: { round: 1, tally: { b2: 3, h: 2 }, eliminatedId: null, tie: true, role: null },
    })
    expect(tick(s).dayVotes).toEqual({ b1: 'b2', b3: 'b2', b2: 'h' })
  })

  it('le rancunier accusé vote son accusateur (Raoul, 0,9) ; Suzette (0,05) suit la table', () => {
    // Villageois tous deux : un loup bot viserait de toute façon qui l'a nommé.
    const accused = (name: string) =>
      craft([P('h', 'villageois'), P('b1', 'villageois', { name }), P('b2', 'villageois'), P('b3', 'voyante')], 'day-vote', {
        debateSpeech: [say('b2', 'suspect', 'b3'), say('h', 'suspect', 'b1')],
      })
    expect(tick(accused('Raoul 🦊')).dayVotes.b1).toBe('h')
    expect(tick(accused('Suzette 🌸')).dayVotes.b1).toBe('b3')
  })

  it('le fidèle ne vote pas l’allié qu’il s’est choisi (Bernadette, 0,95) ; le traître si (Dédé, 0,1)', () => {
    // b2 est marqué par le Corbeau et accusé par l'humain, mais b1 s'est allié à lui.
    const allied = (name: string) =>
      craft([P('h', 'villageois'), P('b1', 'villageois', { name }), P('b2', 'villageois'), P('b3', 'voyante')], 'day-vote', {
        ravenTargetId: 'b2',
        debateSpeech: [say('b1', 'ally', 'b2'), say('h', 'suspect', 'b2')],
      })
    expect(tick(allied('Dédé 🎲')).dayVotes.b1).toBe('b2')
    expect(tick(allied('Bernadette 🧶')).dayVotes.b1).not.toBe('b2')
  })
})
