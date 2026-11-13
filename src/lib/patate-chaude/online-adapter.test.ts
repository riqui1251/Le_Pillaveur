import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { parseSimplePhaseSyncedState } from '@/lib/online-game-state'
import type { PcChallenge } from './engine'
import { PC_ONLINE_MAX_PLAYERS, PC_ONLINE_MIN_PLAYERS, type PcOnlineState } from './online-shared'
import { buildPcState, markPcPlayerLeft } from './server-adapter'
import { patateChaudeAdapter as adapter, pcActionError } from './online-adapter'

const T0 = 1_700_000_000_000
const MEMBERS = ['u1', 'u2', 'u3'].map((userId) => ({ userId, user: { displayName: `Joueur ${userId}` } }))
const THEME: PcChallenge = { kind: 'theme', id: 'fruit', value: 'Un fruit' }
const LETTER_B: PcChallenge = { kind: 'letter', value: 'B' }

/** Le serveur lit Date.now() : l'horloge est figée et avancée à la main. */
function at(now: number) {
  vi.setSystemTime(now)
}

function applied(state: PcOnlineState, userId: string, body: Record<string, unknown>): PcOnlineState {
  const result = adapter.applyAction(state, userId, body)
  if (!result.ok) throw new Error(`refus inattendu : ${result.error}`)
  return result.state as PcOnlineState
}

function refused(state: PcOnlineState, userId: string, body: Record<string, unknown>) {
  const result = adapter.applyAction(state, userId, body)
  if (result.ok) throw new Error('l’action aurait dû être refusée')
  return { error: result.error, status: result.status }
}

/** Partie lancée à T0, mèche allumée par le tick de service à la fin du compte à rebours. */
function burning(challenge?: PcChallenge): PcOnlineState {
  const ready = buildPcState(MEMBERS, {}, 'fr', 'graine', T0)
  const tick = adapter.serviceTick!(ready, T0)!
  at(tick.dueAt + 1_500)
  const lit = applied(ready, '__service__', tick.body)
  return challenge ? { ...lit, game: { ...lit.game, challenge } } : lit
}

beforeEach(() => {
  vi.useFakeTimers()
  at(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('patateChaudeAdapter — contrat', () => {
  it('bornes du lobby : 2 à 12, aucun complément par bots', () => {
    expect(adapter.minPlayers).toBe(PC_ONLINE_MIN_PLAYERS)
    expect(adapter.maxPlayers).toBe(PC_ONLINE_MAX_PLAYERS)
    expect([adapter.minPlayers, adapter.maxPlayers]).toEqual([2, 12])
    expect(Boolean(adapter.botsFillable)).toBe(false)
  })

  it('aller-retour parse/serialize ; état illisible → null', () => {
    const state = burning()
    expect(adapter.parse(adapter.serialize(state))).toEqual(state)
    expect(adapter.parse(null)).toBeNull()
    expect(adapter.parse('{')).toBeNull()
  })

  it('la réponse d’action porte EXACTEMENT la vue que renverrait GET /state', () => {
    const state = burning(THEME)
    const response = adapter.actionResponse(state, 'u2')
    expect(response.viewJson).toBe(adapter.clientViewJson(state, 'u2'))
    expect(response.view).toEqual(JSON.parse(adapter.clientViewJson(state, 'u2')))
    expect(adapter.spectatorViewJson(state)).toBe(adapter.clientViewJson(state, 'u1'))
  })

  it('ni mèche ni graine dans les vues, joueur comme TV', () => {
    const state = burning()
    for (const json of [adapter.clientViewJson(state, 'u1'), adapter.spectatorViewJson(state)]) {
      expect(json).not.toContain('explodeAt')
      expect(json).not.toContain('rngState')
      expect(json).not.toContain(String(state.game.explodeAt))
    }
  })

  it('acteur : le porteur pendant la mèche, personne au compte à rebours ; fin lue sur la phase', () => {
    const ready = buildPcState(MEMBERS, {}, 'fr', 'graine', T0)
    expect(adapter.currentActorId(ready)).toBeNull()
    const state = burning()
    expect(adapter.currentActorId(state)).toBe('u1')
    expect(adapter.isFinished(state)).toBe(false)
    expect(adapter.isFinished({ ...state, phase: 'finished' })).toBe(true)
  })

  it('état, vue joueur et vue TV passent le parseur « phase simple » (fin de partie, « Rejouer »)', () => {
    const ready = buildPcState(MEMBERS, {}, 'fr', 'graine', T0)
    for (const json of [adapter.serialize(ready), adapter.clientViewJson(ready, 'u1'), adapter.spectatorViewJson(ready)]) {
      const parsed = parseSimplePhaseSyncedState(json)
      expect(parsed).toEqual({ ...JSON.parse(json), rematchVotes: [] })
      expect(parsed?.phase).toBe('ready')
    }
    const finished = parseSimplePhaseSyncedState(adapter.serialize({ ...ready, phase: 'finished' }))
    expect(finished?.phase).toBe('finished')
  })

  it('aucun bot : conversion AFK impossible, ticks bot et remplacement en 409', () => {
    const state = burning()
    expect(adapter.convertToBot(state, 'u1')).toBeNull()
    expect(refused(state, '__service__', { action: 'bot' })).toEqual({ error: 'NOT_BOT_TURN', status: 409 })
    expect(refused(state, 'u2', { action: 'replace-left' })).toEqual({ error: 'NOTHING_TO_REPLACE', status: 409 })
  })
})

describe('patateChaudeAdapter — corps et refus', () => {
  it('corps mal formé : 400 invalid_action', () => {
    const state = burning()
    for (const body of [
      {},
      { action: 'pass' },
      { action: 'pass', word: 12 },
      { action: 'contest' },
      { action: 'contest', index: '0' },
      { action: 'contest', index: 0.5 },
      { action: 'advance' },
      { action: 'reject' },
    ]) {
      expect(refused(state, 'u1', body)).toEqual({ error: 'invalid_action', status: 400 })
    }
  })

  it('refus de mot : codes stables traduits chez le joueur (403), la bombe reste', () => {
    const letter = burning(LETTER_B)
    expect(refused(letter, 'u1', { action: 'pass', word: 'Avion' })).toEqual({ error: 'word_wrong_letter', status: 403 })
    expect(refused(letter, 'u1', { action: 'pass', word: 'b' })).toEqual({ error: 'word_too_short', status: 403 })
    expect(refused(letter, 'u1', { action: 'pass', word: `B${'a'.repeat(30)}` })).toEqual({ error: 'word_too_long', status: 403 })
    expect(refused(letter, 'u2', { action: 'pass', word: 'Bateau' })).toEqual({ error: 'not_your_turn', status: 403 })
    const syllable = burning({ kind: 'syllable', value: 'TRA' })
    expect(refused(syllable, 'u1', { action: 'pass', word: 'Avion' })).toEqual({ error: 'word_missing_syllable', status: 403 })
    const theme = burning(THEME)
    const passed = applied(theme, 'u1', { action: 'pass', word: 'Pomme' })
    expect(refused(passed, 'u2', { action: 'pass', word: 'POMME!' })).toEqual({ error: 'word_already_said', status: 403 })
    // Son propre mot ; le porteur, qui y gagnerait ; un troisième joueur seul, à trois : jamais de veto.
    expect(refused(passed, 'u1', { action: 'contest', index: 0 })).toEqual({ error: 'contest_unavailable', status: 403 })
    expect(refused(passed, 'u2', { action: 'contest', index: 0 })).toEqual({ error: 'contest_unavailable', status: 403 })
    expect(refused(passed, 'u3', { action: 'contest', index: 0 })).toEqual({ error: 'contest_unavailable', status: 403 })
  })

  it('« Je suis là » : corps lu, et 409 muet quand il n’y a rien à reprendre', () => {
    const state = burning()
    expect(refused(state, 'u2', { action: 'resume' })).toEqual({ error: 'NOT_SET_ASIDE', status: 409 })
    const aside: PcOnlineState = { ...state, game: { ...state.game, absent: ['u3'] } }
    expect(applied(aside, 'u3', { action: 'resume' }).game.absent).toEqual([])
  })

  it('mot refusé : le signe « je joue » est lu, écrit une fois par mèche, puis 409 muet', () => {
    const state = burning(LETTER_B)
    expect(refused(state, 'u1', { action: 'pass', word: 'Avion' })).toEqual({ error: 'word_wrong_letter', status: 403 })
    const noted = applied(state, 'u1', { action: 'attempt' })
    expect(noted.version).toBe(state.version + 1)
    expect(noted.game.holder).toBe('u1')
    expect(refused(noted, 'u1', { action: 'attempt' })).toEqual({ error: 'NOTHING_TO_NOTE', status: 409 })
    // Rien de ce signe ne quitte le serveur.
    expect(adapter.clientViewJson(noted, 'u2')).not.toContain('"played"')
    expect(adapter.spectatorViewJson(noted)).not.toContain('"played"')
  })

  it('courses : 409 muettes', () => {
    expect(pcActionError('WRONG_PHASE').status).toBe(409)
    expect(pcActionError('NOTHING_TO_CONTEST').status).toBe(409)
    expect(pcActionError('NOT_EXPIRED').status).toBe(409)
    expect(pcActionError('PHASE_CHANGED').status).toBe(409)
    expect(pcActionError('NOT_SET_ASIDE').status).toBe(409)
    expect(pcActionError('NOTHING_TO_NOTE').status).toBe(409)
    expect(pcActionError('UNKNOWN_PLAYER')).toEqual({ ok: false, error: 'UNKNOWN_PLAYER', status: 403 })
  })
})

describe('patateChaudeAdapter — tick de service', () => {
  it('compte à rebours : advance à l’échéance publique', () => {
    const ready = buildPcState(MEMBERS, {}, 'fr', 'graine', T0)
    expect(adapter.serviceTick!(ready, T0)).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(ready) },
      dueAt: ready.phaseEndsAt,
    })
  })

  it('mèche : seul le serveur connaît l’échéance, il la vise ; le tick fait exploser le porteur', () => {
    const state = applied(burning(THEME), 'u1', { action: 'pass', word: 'Kiwi' })
    const tick = adapter.serviceTick!(state, Date.now())!
    expect(tick).toEqual({ body: { action: 'advance', phaseKey: phaseKey(state) }, dueAt: state.game.explodeAt })
    at(tick.dueAt - 1)
    expect(refused(state, '__service__', tick.body)).toEqual({ error: 'NOT_EXPIRED', status: 409 })
    at(tick.dueAt + 1_500)
    const boom = applied(state, '__service__', tick.body)
    expect(boom.phase).toBe('boom')
    expect(boom.game.lastBoom?.playerId).toBe('u2')
    // L'écran du BOUM a son échéance publique, que le tick suivant vise.
    expect(adapter.serviceTick!(boom, Date.now())).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(boom) },
      dueAt: boom.phaseEndsAt,
    })
  })

  it('partie finie, ou plus aucun humain présent : rien à attendre', () => {
    const state = burning()
    at(T0 + 7_000)
    const ended = applied(state, 'u1', { action: 'end' })
    expect(adapter.serviceTick!(ended, Date.now())).toBeNull()
    const deserted: PcOnlineState = { ...state, players: state.players.map((p) => ({ ...p, leftAt: T0 })) }
    expect(adapter.serviceTick!(deserted, Date.now())).toBeNull()
  })

  it('un départ réarme le tick sur la même mèche, chez le nouveau porteur', () => {
    const state = burning()
    const left = adapter.markLeft(state, 'u1', T0 + 7_000) as PcOnlineState
    expect(left).toEqual(markPcPlayerLeft(state, 'u1', T0 + 7_000))
    expect(adapter.currentActorId(left)).toBe('u2')
    expect(adapter.serviceTick!(left, T0 + 7_000)?.dueAt).toBe(state.game.explodeAt)
    expect(adapter.rejoin(left, 'u1')).not.toBeNull()
    expect(adapter.rejoin(left, 'u2')).toBeNull()
  })
})
