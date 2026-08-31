import { describe, expect, it } from 'vitest'
import {
  createSFState,
  currentSFActorId,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SFEngineError,
  SF_COUNTDOWN_MS,
  SF_HAND_SIZE,
  SF_JUDGE_MS,
  SF_SUBMIT_MS,
  type SFState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.']
const WHITES = Array.from({ length: 48 }, (_, i) => `réponse ${i}`)

function fourPlayers(botLast = false) {
  return Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: botLast && i === 3,
  }))
}

/** Partie créée puis countdown consommé : première manche à T0. */
function make(botLast = false, seed: string | number = 'seed', rounds = 3): SFState {
  const raw = createSFState(fourPlayers(botLast), BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS, rounds)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Tous les joueurs de la manche (hors juge, hors bots déjà servis) abattent une carte. */
function playAll(state: SFState, now = T0): SFState {
  let s = state
  for (const p of sfActive(s)) {
    if (p.id === s.judgeId || p.isBot) continue
    if (s.submissions.some((sub) => sub.playerId === p.id)) continue
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: p.id, card: p.hand[0], now })
  }
  return s
}

describe('createSFState', () => {
  it('borne 4-16 joueurs, countdown au lancement puis manche chronométrée', () => {
    const three = fourPlayers().slice(0, 3)
    expect(() => createSFState(three, BLACKS, WHITES, 1, T0)).toThrow(SFEngineError)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const bigWhites = Array.from({ length: 200 }, (_, i) => `r${i}`)
    expect(() => createSFState(seventeen, BLACKS, bigWhites, 1, T0)).toThrow(SFEngineError)
    const raw = createSFState(fourPlayers(), BLACKS, WHITES, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + SF_COUNTDOWN_MS)
    const s = make()
    expect(s.phase).toBe('submit')
    expect(s.phaseEndsAt).toBe(T0 + SF_SUBMIT_MS)
  })

  it('distribue des mains de 7 sans doublons, reproductible avec la même graine', () => {
    const s = createSFState(fourPlayers(), BLACKS, WHITES, 'seed-x', T0)
    const all = s.players.flatMap((p) => p.hand)
    expect(all).toHaveLength(4 * SF_HAND_SIZE)
    expect(new Set(all).size).toBe(all.length)
    expect(s.whiteDeck).toHaveLength(WHITES.length - all.length)
    expect(createSFState(fourPlayers(), BLACKS, WHITES, 'seed-x', T0)).toEqual(
      createSFState(fourPlayers(), BLACKS, WHITES, 'seed-x', T0)
    )
  })

  it('exige au moins un humain, des cartes noires et assez de réponses', () => {
    const allBots = fourPlayers().map((p) => ({ ...p, isBot: true }))
    expect(() => createSFState(allBots, BLACKS, WHITES, 1, T0)).toThrow('NEEDS_ONE_HUMAN')
    expect(() => createSFState(fourPlayers(), [], WHITES, 1, T0)).toThrow('NO_BLACK_CARDS')
    expect(() => createSFState(fourPlayers(), BLACKS, WHITES.slice(0, 10), 1, T0)).toThrow(
      'NO_WHITE_CARDS'
    )
  })
})

/** Table solo (1 humain + 3 bots), countdown consommé : manche 1 à T0. */
function makeSolo(seed: string | number = 'seed'): SFState {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'b1', name: 'B1', isBot: true },
    { id: 'b2', name: 'B2', isBot: true },
    { id: 'b3', name: 'B3', isBot: true },
  ]
  const raw = createSFState(players, BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

describe('début de manche', () => {
  it('le juge est le premier humain et ne joue pas ; les bots entrent main pleine', () => {
    const s = make(true) // p3 est un bot
    expect(s.judgeId).toBe('p0')
    expect(s.submissions).toHaveLength(0)
    const bot = s.players.find((p) => p.id === 'p3')
    expect(bot?.hand).toHaveLength(SF_HAND_SIZE)
  })

  it('table solo : la manche attend les bots (ils soumettent via les ticks)', () => {
    const s = makeSolo()
    expect(s.phase).toBe('submit')
    expect(s.judgeId).toBe('p0')
    expect(s.submissions).toHaveLength(0)
  })

  it('un tick par bot : le dernier abattage déclenche le jugement (raccourci)', () => {
    let s = makeSolo()
    for (const id of ['b1', 'b2']) {
      const hand = s.players.find((p) => p.id === id)!.hand
      s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
      expect(s.phase).toBe('submit')
    }
    const hand = s.players.find((p) => p.id === 'b3')!.hand
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'b3', card: hand[0], now: T0 })
    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(3)
  })
})

describe('PLAY_CARD', () => {
  it('refuse hors phase, le juge, une carte hors main et la double soumission', () => {
    const s = make()
    expect(() =>
      reduceSF(s, { type: 'PLAY_CARD', playerId: 'p0', card: 0, now: T0 })
    ).toThrow('JUDGE_CANNOT_PLAY')
    const p1 = s.players.find((p) => p.id === 'p1')!
    const notInHand = WHITES.findIndex((_, i) => !p1.hand.includes(i))
    expect(() =>
      reduceSF(s, { type: 'PLAY_CARD', playerId: 'p1', card: notInHand, now: T0 })
    ).toThrow('CARD_NOT_IN_HAND')
    const played = reduceSF(s, { type: 'PLAY_CARD', playerId: 'p1', card: p1.hand[0], now: T0 })
    expect(() =>
      reduceSF(played, { type: 'PLAY_CARD', playerId: 'p1', card: p1.hand[1], now: T0 })
    ).toThrow('ALREADY_PLAYED')
    expect(played.players.find((p) => p.id === 'p1')?.hand).toHaveLength(SF_HAND_SIZE - 1)
  })

  it('le dernier abattage déclenche immédiatement le jugement', () => {
    const s = playAll(make())
    expect(s.phase).toBe('judging')
    expect(s.phaseEndsAt).toBe(T0 + SF_JUDGE_MS)
    expect(s.submissions).toHaveLength(3)
    expect(currentSFActorId(s)).toBe(s.judgeId)
  })

  it('timeout de submit : les retardataires n’ont rien abattu, le jugement démarre quand même', () => {
    let s = make()
    const p1 = s.players.find((p) => p.id === 'p1')!
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'p1', card: p1.hand[0], now: T0 })
    s = reduceSF(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + SF_SUBMIT_MS })
    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(1)
  })
})

describe('JUDGE_PICK / reveal', () => {
  it('seul le juge couronne ; l’auteur gagne une couronne et les joueurs repiochent', () => {
    const s = playAll(make())
    const target = s.submissions[0]
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: target.card, now: T0 })
    ).toThrow('NOT_THE_JUDGE')
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: 9_999, now: T0 })
    ).toThrow('INVALID_PICK')
    const r = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: target.card, now: T0 })
    expect(r.phase).toBe('reveal')
    expect(r.crowned).toEqual({ playerId: target.playerId, card: target.card })
    expect(r.players.find((p) => p.id === target.playerId)?.crowns).toBe(1)
    for (const p of r.players) {
      if (p.id === r.judgeId) continue
      expect(p.hand).toHaveLength(SF_HAND_SIZE)
    }
  })

  it('timeout du juge → couronnement aléatoire reproductible parmi les abattues', () => {
    const s = playAll(make())
    const a = reduceSF(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + SF_JUDGE_MS })
    const b = reduceSF(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + SF_JUDGE_MS })
    expect(a.phase).toBe('reveal')
    expect(a.crowned).toEqual(b.crowned)
    expect(s.submissions.some((sub) => sub.card === a.crowned?.card)).toBe(true)
  })
})

describe('CONTINUE : rotation et fin de partie', () => {
  it('manche suivante : le juge passe au prochain humain, la carte noire change', () => {
    let s = playAll(make())
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
    s = reduceSF(s, { type: 'CONTINUE', playerId: 'p1', now: T0 })
    expect(s.phase).toBe('submit')
    expect(s.round).toBe(1)
    expect(s.judgeId).toBe('p1')
  })

  it('solo : la rotation du juge inclut les bots — le joueur seul joue ses cartes', () => {
    let s = makeSolo()
    for (const id of ['b1', 'b2', 'b3']) {
      const hand = s.players.find((p) => p.id === id)!.hand
      s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
    }
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
    s = reduceSF(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    // Manche 2 : le juge est un bot, le joueur solo abat enfin une carte.
    expect(s.judgeId).toBe('b1')
    expect(s.players.find((p) => p.id === s.judgeId)?.isBot).toBe(true)
    const me = s.players.find((p) => p.id === 'p0')!
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'p0', card: me.hand[0], now: T0 })
    expect(s.submissions.some((sub) => sub.playerId === 'p0')).toBe(true)
  })

  it('à 2+ humains actifs, la rotation saute toujours les bots', () => {
    let s = make(true) // p0-p2 humains, p3 bot — juge initial p0
    s = playAll(s)
    const bot = s.players.find((p) => p.id === 'p3')!
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'p3', card: bot.hand[0], now: T0 })
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
    s = reduceSF(s, { type: 'CONTINUE', playerId: 'p1', now: T0 })
    expect(s.judgeId).toBe('p1') // pas p3, jamais un bot ici
  })

  it('après la dernière manche → finished, vainqueur = le plus couronné (unique)', () => {
    let s = make(false, 'seed', 1)
    s = playAll(s)
    const target = s.submissions[0]
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: target.card, now: T0 })
    s = reduceSF(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.winnerId).toBe(target.playerId)
  })
})

describe('REPLACE_LEFT', () => {
  it('un juge parti devient bot et passe la main à un humain pendant le jugement', () => {
    let s = playAll(make())
    s = reduceSF(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceSF(s, { type: 'REPLACE_LEFT', now: T0 + 10_000, graceMs: 5_000 })
    expect(s.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
    expect(s.judgeId).not.toBe('p0')
    expect(s.players.find((p) => p.id === s.judgeId)?.isBot).toBe(false)
  })
})

describe('vues anti-triche', () => {
  it('main du seul viewer, soumissions anonymes triées, auteur révélé au reveal', () => {
    const s = playAll(make())
    const judgeView = toSFClientView(s, 'p0')
    expect(judgeView.myHand).toHaveLength(0)
    const cards = (judgeView.submissions ?? []).map((x) => x.card)
    expect(cards).toEqual([...cards].sort((a, b) => a - b))
    expect(JSON.stringify(judgeView)).not.toContain('"playerId"')

    const playerView = toSFClientView(s, 'p1')
    expect(playerView.myHand).toHaveLength(SF_HAND_SIZE - 1)
    expect(playerView.myPlayed).not.toBeNull()

    const r = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
    const reveal = toSFClientView(r, 'p1')
    expect(reveal.crowned?.playerId).toBe(s.submissions[0].playerId)
    expect(reveal.crowned?.playerName).toBeTruthy()
  })

  it('jamais les cartes noires à venir ni la pioche ; le spectateur n’a pas de main', () => {
    const s = make()
    const view = toSFClientView(s, 'p1')
    expect(view.black).toBe(s.blacks[0])
    const json = JSON.stringify(view)
    expect(json).not.toContain(s.blacks[1])
    expect(json).not.toContain('whiteDeck')
    const tv = toSFSpectatorView(s)
    expect(tv.myHand).toHaveLength(0)
    expect(tv.submissions).toBeNull()
  })
})
