import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Stroke } from '@/lib/crobard/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createTelephoneState,
  reduceTelephone,
  telephoneActionTypeForRound,
  telephoneChainIntact,
  telephoneRevealLastLinkIdx,
  telephoneSpeechRound,
  toTelephoneSpectatorView,
  TelephoneEngineError,
  TELEPHONE_COUNTDOWN_MS,
  TELEPHONE_SPEECH_CAP,
  type TelephoneContribution,
  type TelephoneInitialPlayer,
  type TelephoneSayMove,
  type TelephoneSpeech,
  type TelephoneState,
} from './engine'
import { TELEPHONE_ENCORE_SHARE, TELEPHONE_TALK_PER_BAVARDAGE, telephoneBotSay } from './bot-speech'
import { applyTelephoneRoomAction, parseTelephoneState, serializeTelephoneState } from './server-adapter'

const T0 = 1_000_000
const ALWAYS = () => 0
const NEVER = () => 0.999
/** Assez bas pour qu'un converti (bavardage 2) parle, assez haut pour ne pas réclamer de revanche. */
const LAUGH = () => (TELEPHONE_ENCORE_SHARE + 2 * TELEPHONE_TALK_PER_BAVARDAGE) / 2

const H1 = { id: 'h1', name: 'Riqui' }
const H2 = { id: 'h2', name: 'Léa' }
/** Un déserteur converti garde son pseudo humain : aucun persona, voix neutre. */
const BOT: TelephoneInitialPlayer = { id: 'b1', name: 'Paul', isBot: true }

const text = (t: string): TelephoneContribution => ({ type: 'text', text: t })
const STROKES: Stroke[] = [{ color: '#24201A', width: 4, points: [0.1, 0.1, 0.5, 0.5] }]
const draw = (): TelephoneContribution => ({ type: 'draw', strokes: STROKES })

/**
 * Partie jouée jusqu'à la révélation : chaque joueur écrit `phrase(id)` à
 * l'ouverture, dessine ensuite, et devine `guess(id, ownerId)` (par défaut :
 * une autre phrase). Les bots rendent copie blanche, comme en vrai.
 */
function toReveal(
  players: TelephoneInitialPlayer[],
  guess: (playerId: string, ownerId: string) => string = (id) => `devinette de ${id}`
): TelephoneState {
  const raw = createTelephoneState(players, 'seed', T0 - TELEPHONE_COUNTDOWN_MS)
  let s = reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  const n = players.length
  for (let round = 0; round < n; round += 1) {
    for (const [i, p] of s.players.entries()) {
      const ownerId = s.players[(((i - round) % n) + n) % n].id
      if (telephoneActionTypeForRound(round) === 'write') {
        const t = p.isBot ? '' : round === 0 ? `Un chat sur le toit de ${p.id}` : guess(p.id, ownerId)
        s = reduceTelephone(s, { type: 'WRITE', playerId: p.id, text: t, now: T0 + round * 1000 })
      } else {
        s = reduceTelephone(s, { type: 'SUBMIT', playerId: p.id, strokes: p.isBot ? [] : STROKES, now: T0 + round * 1000 })
      }
    }
  }
  expect(s.phase).toBe('reveal')
  return s
}

const leader = (s: TelephoneState) => s.players.find((p) => !p.leftAt)!.id
const forward = (s: TelephoneState, now = T0 + 50_000) =>
  reduceTelephone(s, { type: 'CONTINUE', playerId: leader(s), now })
/** Avance jusqu'à la chute de la chaîne `idx` (sans parole). */
function shownChain(s: TelephoneState, idx: number): TelephoneState {
  let out = s
  while (out.revealIdx < idx || out.revealLinkIdx < telephoneRevealLastLinkIdx(out, out.revealIdx)) out = forward(out)
  return out
}
const view = (s: TelephoneState) => toTelephoneSpectatorView(s)
const say = (s: TelephoneState, ...moves: TelephoneSayMove[]) => reduceTelephone(s, { type: 'SAY', moves })
const chainIdxOf = (s: TelephoneState, ownerId: string) => s.revealOrder.indexOf(ownerId)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('telephoneChainIntact et telephoneSpeechRound', () => {
  it('même phrase au départ et à l’arrivée, casse, accents et ponctuation ignorés', () => {
    expect(telephoneChainIntact([text('Un chat, sur le toit !'), draw(), text('un CHAT sur le toît')])).toBe(true)
    expect(telephoneChainIntact([text('Un chat sur le toit'), draw(), text('Un chien sur le toit')])).toBe(false)
    expect(telephoneChainIntact([text('Un chat'), draw(), text('Un chat'), draw()])).toBe(false)
    expect(telephoneChainIntact([text(''), draw(), text('')])).toBe(false)
  })

  it('une « manche » de paroles par chaîne révélée, après les manches de contribution', () => {
    const s = toReveal([H1, H2, BOT])
    expect(telephoneSpeechRound(s)).toBe(3)
    expect(telephoneSpeechRound(forward(forward(forward(s))))).toBe(4)
    expect(telephoneSpeechRound({ phase: 'contributing', round: 1, totalRounds: 3, revealIdx: 0 })).toBe(1)
  })
})

describe('telephoneBotSay : on ne rit qu’à la chute d’une chaîne', () => {
  it('ANTI-FUITE : pendant les manches, la vue ne porte aucun maillon et le bot se tait', () => {
    const raw = createTelephoneState([H1, H2, BOT], 'seed', T0 - TELEPHONE_COUNTDOWN_MS)
    let s = reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'h1', text: 'Un secret bien gardé', now: T0 })
    expect(JSON.stringify(view(s))).not.toContain('secret')
    expect(telephoneBotSay(view(s), ALWAYS)).toEqual([])
  })

  it('ANTI-FUITE : chaîne pas encore entière à l’écran, rien — la suite ne quitte pas le serveur', () => {
    const s = forward(toReveal([H1, H2, BOT]))
    expect(s.revealLinkIdx).toBe(1)
    expect(view(s).revealChain?.links).toHaveLength(2)
    expect(telephoneBotSay(view(s), ALWAYS)).toEqual([])
  })

  it('la chaîne d’un humain : laugh, vers son propriétaire', () => {
    const base = toReveal([H1, H2, BOT])
    const s = shownChain(base, chainIdxOf(base, 'h2'))
    expect(telephoneBotSay(view(s), LAUGH)).toEqual([{ playerId: 'b1', kind: 'laugh', targetId: 'h2' }])
  })

  it('sa propre chaîne : mine, vers un humain (chacun y a mis la main)', () => {
    const base = toReveal([H1, H2, BOT])
    const s = shownChain(base, chainIdxOf(base, 'b1'))
    const [move] = telephoneBotSay(view(s), LAUGH)
    expect(move).toMatchObject({ playerId: 'b1', kind: 'mine' })
    expect(['h1', 'h2']).toContain(move.targetId)
  })

  it('une chaîne intacte avant tout ; la dernière chaîne en redemande une fois sur deux', () => {
    // Chaque devineur de la dernière manche retrouve la phrase de départ.
    const intact = toReveal([H1, H2, BOT], (_id, ownerId) => `Un chat sur le toit de ${ownerId}`)
    // Le bot rend copie blanche : seule la chaîne que devine un humain reste intacte (celle de Léa).
    const s = shownChain(intact, chainIdxOf(intact, 'h2'))
    expect(telephoneChainIntact(s.chains.h2)).toBe(true)
    expect(telephoneBotSay(view(s), ALWAYS)[0]?.kind).toBe('intact')

    const base = toReveal([H1, H2, BOT])
    const last = shownChain(base, base.revealOrder.length - 1)
    expect(telephoneBotSay(view(last), ALWAYS)[0]?.kind).toBe('encore')
    expect(telephoneBotSay(view(last), LAUGH)[0]?.kind).not.toBe('encore')
  })

  it('sobriété : une bulle par chaîne, au gré du dé, et rien sans humain présent', () => {
    const base = toReveal([H1, H2, BOT])
    const s = shownChain(base, 0)
    const once = say(s, ...telephoneBotSay(view(s), LAUGH))
    expect(once.speech).toHaveLength(1)
    expect(telephoneBotSay(view(once), LAUGH)).toEqual([])
    expect(telephoneBotSay(view(s), NEVER)).toEqual([])
    const alone = ['h1', 'h2'].reduce((acc, id) => reduceTelephone(acc, { type: 'LEAVE', playerId: id, at: T0 + 60_000 }), s)
    expect(telephoneBotSay(view(alone), ALWAYS)).toEqual([])
  })
})

describe('moteur : SAY, la parole d’un bot', () => {
  it('rien avant la chute ; le kind doit coller à la chaîne ; cible, auteur et plafond vérifiés', () => {
    const err = (fn: () => unknown, code: string) => {
      expect(fn).toThrow(TelephoneEngineError)
      expect(fn).toThrow(code)
    }
    const raw = createTelephoneState([H1, H2, BOT], 'seed', T0)
    err(() => say(raw, { playerId: 'b1', kind: 'laugh', targetId: 'h1' }), 'NOT_SPEECH_PHASE')
    const base = toReveal([H1, H2, BOT])
    err(() => say(base, { playerId: 'b1', kind: 'laugh', targetId: 'h1' }), 'CHAIN_NOT_REVEALED')
    const other = shownChain(base, chainIdxOf(base, 'h1'))
    err(() => say(other, { playerId: 'b1', kind: 'mine', targetId: 'h1' }), 'INVALID_KIND')
    err(() => say(other, { playerId: 'b1', kind: 'intact', targetId: 'h1' }), 'INVALID_KIND')
    if (other.revealIdx !== other.revealOrder.length - 1) {
      err(() => say(other, { playerId: 'b1', kind: 'encore', targetId: 'h1' }), 'INVALID_KIND')
    }
    err(() => say(other, { playerId: 'h2', kind: 'laugh', targetId: 'h1' }), 'NOT_BOT')
    err(() => say(other, { playerId: 'b1', kind: 'laugh', targetId: 'b1' }), 'INVALID_TARGET')
    const own = shownChain(base, chainIdxOf(base, 'b1'))
    err(() => say(own, { playerId: 'b1', kind: 'laugh', targetId: 'h1' }), 'INVALID_KIND')
    const full = say(
      other,
      ...Array.from({ length: TELEPHONE_SPEECH_CAP }, () => ({ playerId: 'b1', kind: 'laugh' as const, targetId: 'h1' }))
    )
    err(() => say(full, { playerId: 'b1', kind: 'laugh', targetId: 'h2' }), 'ALREADY_SPOKE')
  })

  it('les paroles restent jusqu’à la fin (une chaîne revue garde sa bulle) ; un état d’avant se relit', () => {
    const base = toReveal([H1, H2, BOT])
    const first = say(shownChain(base, 0), { playerId: 'b1', kind: base.revealOrder[0] === 'b1' ? 'mine' : 'laugh', targetId: 'h1' })
    const next = shownChain(first, 1)
    expect(next.speech).toEqual(first.speech)
    const back = reduceTelephone(next, { type: 'PREVIOUS', playerId: leader(next), now: T0 + 90_000 })
    expect(telephoneSpeechRound(back)).toBe(first.speech![0].round)
    const { speech: _speech, ...legacy } = base
    void _speech
    expect(parseTelephoneState(JSON.stringify(legacy))?.speech).toEqual([])
    expect(parseTelephoneState(serializeTelephoneState(first))?.speech).toEqual(first.speech)
    expect(view(first).speech).toEqual(first.speech)
  })
})

describe('adaptateur : la réaction naît avec le cran qui dévoile la chute', () => {
  it('le meneur humain dévoile le dernier maillon : la réaction l’accompagne ; revenir en arrière ne relance rien', () => {
    let s = toReveal([H1, H2, BOT])
    const res1 = applyTelephoneRoomAction(s, 'h1', { type: 'continue' }, ALWAYS)
    expect(res1.ok && res1.state.speech).toEqual([])
    if (!res1.ok) return
    const res2 = applyTelephoneRoomAction(res1.state, 'h1', { type: 'continue' }, LAUGH)
    expect(res2.ok && res2.state.speech?.length).toBe(1)
    if (!res2.ok) return
    s = shownChain(res2.state, 1)
    const back = applyTelephoneRoomAction(s, 'h1', { type: 'previous' }, ALWAYS)
    expect(back.ok && back.state.speech).toEqual(res2.state.speech)
  })

  it('l’horloge aussi, quand le meneur dort', () => {
    const s = forward(toReveal([H1, H2, BOT]))
    vi.spyOn(Date, 'now').mockReturnValue(s.phaseEndsAt!)
    const res = applyTelephoneRoomAction(s, 'h1', { type: 'advance', phaseKey: phaseKey(s) }, LAUGH)
    expect(res.ok && res.state.speech?.map((sp) => sp.playerId)).toEqual(['b1'])
  })

  it('un bot meneur (déserteur converti en tête de table) dévoile et réagit', () => {
    let s = toReveal([BOT, H1, H2])
    s = forward(s)
    const res = applyTelephoneRoomAction(s, 'h1', { type: 'bot' }, LAUGH)
    expect(res.ok && res.state.revealLinkIdx).toBe(2)
    expect(res.ok && res.state.speech?.length).toBe(1)
  })
})

describe('simulation : sobriété et validité sur des parties entières', () => {
  it('une bulle au plus par chaîne, d’un bot à un humain, jamais avant la révélation', () => {
    let total = 0
    for (let i = 0; i < 30; i += 1) {
      const rng = createRng(`td-${i}`)
      const humans = [H1, H2, { id: 'h3', name: 'Nora' }].slice(0, 2 + (i % 2))
      const bots = Array.from({ length: 1 + (i % 3) }, (_, k) => ({ id: `b${k}`, name: `Déserteur ${k}`, isBot: true }))
      let s = toReveal([...humans, ...bots])
      const spoken: TelephoneSpeech[] = []
      for (let guard = 0; guard < 100 && s.phase === 'reveal'; guard += 1) {
        const res = applyTelephoneRoomAction(s, leader(s), { type: 'continue' }, () => rng.next())
        expect(res.ok, `td-${i} : ${!res.ok && res.error}`).toBe(true)
        if (!res.ok) break
        const known = new Set((s.speech ?? []).map((sp) => JSON.stringify(sp)))
        for (const sp of res.state.speech ?? []) if (!known.has(JSON.stringify(sp))) spoken.push(sp)
        s = res.state
      }
      expect(s.phase).toBe('finished')
      total += spoken.length
      const chains = s.totalRounds
      for (let c = 0; c < chains; c += 1) {
        const mine = spoken.filter((sp) => sp.round === s.totalRounds + c)
        expect(mine.length).toBeLessThanOrEqual(1)
      }
      for (const sp of spoken) {
        expect(sp.round).toBeGreaterThanOrEqual(s.totalRounds)
        expect(sp.playerId.startsWith('b')).toBe(true)
        expect(sp.targetId?.startsWith('h')).toBe(true)
      }
    }
    expect(total).toBeGreaterThan(30)
  })
})
