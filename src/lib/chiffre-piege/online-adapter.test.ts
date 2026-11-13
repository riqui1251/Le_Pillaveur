import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSimplePhaseSyncedState } from '@/lib/online-game-state'
import { personaForBotName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import type { ChiffrePiegeState } from './engine'
import { chiffrePiegeAdapter as adapter } from './online-adapter'
import {
  CHIFFRE_PIEGE_ONLINE_BOOM_MS,
  CHIFFRE_PIEGE_ONLINE_READ_MS,
  chiffrePiegeBotTickDelayMs,
  parseChiffrePiegeClientView,
  type ChiffrePiegeOnlineState,
} from './online-state'
import { buildChiffrePiegeState, type ChiffrePiegeRoomMember } from './server-adapter'

const NOW = 1_790_000_000_000

const members = (n: number): ChiffrePiegeRoomMember[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

/** u1 et u2 humains, puis bot-1 ; piège en 42 ; `turnIndex` désigne qui a la main. */
function table(game: Partial<ChiffrePiegeState> = {}): ChiffrePiegeOnlineState {
  const built = buildChiffrePiegeState(members(2), 1, 'registre', { max: 100, rounds: 3 })
  return { ...built, game: { ...built.game, turnIndex: 0, trap: 42, ...game } }
}

function applied(result: ReturnType<typeof adapter.applyAction>): ChiffrePiegeOnlineState {
  if (!result.ok) throw new Error(`refus inattendu : ${result.error} (${result.status})`)
  return result.state as ChiffrePiegeOnlineState
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Chiffre Piégé : contrat du registre', () => {
  it('bornes de lancement et complément par bots (= entrée GAMES)', () => {
    expect([adapter.minPlayers, adapter.maxPlayers, adapter.botsFillable]).toEqual([2, 16, true])
    expect(typeof adapter.serviceTick).toBe('function')
  })

  it('corps mal formé : 400 invalid_action', () => {
    for (const body of [
      {},
      { action: 'nope' },
      { action: 'guess' },
      { action: 'guess', value: '12' },
      { action: 'guess', value: 12.5 },
      { action: 'guess', value: Number.NaN },
      { action: 'next' },
      { action: 'advance', phaseKey: 3 },
    ]) {
      expect(adapter.applyAction(table(), 'u1', body), JSON.stringify(body)).toEqual({
        ok: false,
        error: 'invalid_action',
        status: 400,
      })
    }
  })

  it('refus du moteur en 403 (message traduit), courses en 409 (muettes)', () => {
    const state = table()
    expect(adapter.applyAction(state, 'u2', { action: 'guess', value: 10 })).toEqual({ ok: false, error: 'NOT_YOUR_TURN', status: 403 })
    expect(adapter.applyAction(state, 'u1', { action: 'guess', value: 101 })).toEqual({ ok: false, error: 'OUT_OF_RANGE', status: 403 })
    const jokerSpent = table({ jokersUsed: { u1: true, u2: false, 'bot-1': false } })
    expect(adapter.applyAction(jokerSpent, 'u1', { action: 'pass' })).toEqual({ ok: false, error: 'JOKER_USED', status: 403 })
    expect(adapter.applyAction(state, '__service__', { action: 'bot' })).toEqual({ ok: false, error: 'NOT_BOT_TURN', status: 409 })
    expect(adapter.applyAction(state, '__service__', { action: 'replace-left' })).toEqual({
      ok: false,
      error: 'NOTHING_TO_REPLACE',
      status: 409,
    })
    expect(adapter.applyAction(state, '__service__', { action: 'advance', phaseKey: 'boom#9' })).toEqual({
      ok: false,
      error: 'PHASE_CHANGED',
      status: 409,
    })
  })

  it('un coup accepté : vue de la réponse identique à celle du GET', () => {
    const next = applied(adapter.applyAction(table(), 'u1', { action: 'guess', value: 30 }))
    const response = adapter.actionResponse(next, 'u2')
    expect(response.viewJson).toBe(adapter.clientViewJson(next, 'u2'))
    expect(JSON.stringify(response.view)).toBe(response.viewJson)
    expect(adapter.currentActorId(next)).toBe('u2')
    expect(adapter.isFinished(next)).toBe(false)
  })

  it('BOUM à l’heure du serveur, manche suivante par un joueur après la lecture', () => {
    const boom = applied(adapter.applyAction(table(), 'u1', { action: 'guess', value: 42 }))
    expect(boom.phaseEndsAt).toBe(NOW + CHIFFRE_PIEGE_ONLINE_BOOM_MS)
    expect(adapter.currentActorId(boom)).toBeNull()
    const body = { action: 'next', phaseKey: phaseKey(boom) }
    expect(adapter.applyAction(boom, 'u2', body)).toEqual({ ok: false, error: 'READING_TIME', status: 403 })
    vi.setSystemTime(NOW + CHIFFRE_PIEGE_ONLINE_READ_MS)
    const next = applied(adapter.applyAction(boom, 'u2', body))
    expect([next.phase, next.game.roundIndex]).toEqual(['playing', 1])
  })

  it('parse : null sur un état illisible, aller-retour sinon', () => {
    const state = table()
    expect(adapter.parse(adapter.serialize(state))).toEqual(state)
    expect(adapter.parse(null)).toBeNull()
    expect(adapter.parse('{')).toBeNull()
  })

  it('départ, retour et remplacement passent par le moteur', () => {
    const left = adapter.markLeft(table(), 'u1', NOW) as ChiffrePiegeOnlineState
    // Le partant garde la main : son siège joue (tick « bot »), il ne s'esquive pas.
    expect(adapter.currentActorId(left)).toBe('u1')
    expect(applied(adapter.applyAction(left, '__service__', { action: 'bot' })).version).toBe(left.version + 1)
    expect(adapter.markLeft(left, 'u1', NOW)).toBeNull()
    expect((adapter.rejoin(left, 'u1') as ChiffrePiegeOnlineState).players[0].leftAt).toBeNull()
    vi.setSystemTime(NOW + ONLINE_REPLACE_GRACE_MS)
    const replaced = applied(adapter.applyAction(left, '__service__', { action: 'replace-left' }))
    expect(replaced.players[0]).toMatchObject({ isBot: true, leftAt: null })
    const afk = adapter.convertToBot(table(), 'u1') as ChiffrePiegeOnlineState
    expect(afk.players[0].isBot).toBe(true)
    expect(adapter.convertToBot(afk, 'u1')).toBeNull()
  })
})

describe('Chiffre Piégé : ticks de service', () => {
  it('bot au tour : tick « bot » à la borne haute du tempo de son persona, puis coup accepté', () => {
    const state = table({ turnIndex: 2 })
    const persona = personaForBotName(state.players[2].name)!
    expect(persona).toBeTruthy()
    const tick = adapter.serviceTick!(state, NOW)
    expect(tick).toEqual({ body: { action: 'bot' }, dueAt: NOW + persona.tempoMaxMs })
    expect(applied(adapter.applyAction(state, '__service__', tick!.body)).version).toBe(state.version + 1)
  })

  it('le téléphone arbitre tire dans la même fenêtre, jamais après le serveur', () => {
    const state = table({ turnIndex: 2 })
    const serverDelay = chiffrePiegeBotTickDelayMs(state, () => 1)!
    const view = parseChiffrePiegeClientView(adapter.clientViewJson(state, 'u1'))!
    for (const r of [0, 0.3, 0.999]) {
      expect(chiffrePiegeBotTickDelayMs(view, () => r)!).toBeLessThanOrEqual(serverDelay)
    }
    expect(chiffrePiegeBotTickDelayMs(view, () => 1)).toBe(serverDelay)
  })

  it('tour d’un humain : rien à attendre ; BOUM : l’échéance, clé de phase comprise', () => {
    expect(adapter.serviceTick!(table(), NOW)).toBeNull()
    const boom = applied(adapter.applyAction(table(), 'u1', { action: 'guess', value: 42 }))
    expect(adapter.serviceTick!(boom, NOW)).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(boom) },
      dueAt: NOW + CHIFFRE_PIEGE_ONLINE_BOOM_MS,
    })
    vi.setSystemTime(boom.phaseEndsAt!)
    const next = applied(adapter.applyAction(boom, '__service__', adapter.serviceTick!(boom, NOW)!.body))
    expect(next.game.roundIndex).toBe(1)
  })

  it('tick bot déjà refusé sur cette version : rien d’autre à attendre en jeu', () => {
    expect(adapter.serviceTick!(table({ turnIndex: 2 }), NOW, { skipBot: true })).toBeNull()
  })

  it('table désertée par les humains : le serveur ne joue pas seul', () => {
    let state = table({ turnIndex: 2 })
    state = adapter.markLeft(state, 'u1', NOW) as ChiffrePiegeOnlineState
    state = adapter.markLeft(state, 'u2', NOW) as ChiffrePiegeOnlineState
    expect(adapter.serviceTick!(state, NOW)).toBeNull()
  })

  it('parti au tour : tick « bot » au tempo par défaut, même revenu seul à table', () => {
    // u2 part, puis u1 au tour : personne à table, aucun tick.
    let state = adapter.markLeft(table(), 'u2', NOW) as ChiffrePiegeOnlineState
    state = adapter.markLeft(state, 'u1', NOW) as ChiffrePiegeOnlineState
    expect(adapter.serviceTick!(state, NOW)).toBeNull()
    // u2 revient : le serveur joue le coup de u1 au lieu de figer la table.
    state = adapter.rejoin(state, 'u2') as ChiffrePiegeOnlineState
    expect(adapter.currentActorId(state)).toBe('u1')
    const tick = adapter.serviceTick!(state, NOW)
    expect(tick).toEqual({ body: { action: 'bot' }, dueAt: NOW + 4_000 })
    const view = parseChiffrePiegeClientView(adapter.clientViewJson(state, 'u2'))!
    expect(chiffrePiegeBotTickDelayMs(view, () => 1)).toBe(4_000)
    expect(applied(adapter.applyAction(state, '__service__', tick!.body)).version).toBe(state.version + 1)
  })

  it('fin de partie : plus aucun tick', () => {
    expect(adapter.serviceTick!({ ...table(), phase: 'finished', phaseEndsAt: null }, NOW)).toBeNull()
  })
})

describe('Chiffre Piégé : socle des jeux à phases (parseOnlineGameState, vote « Rejouer »)', () => {
  it('état complet, vue joueur et vue TV passent le parseur « phase simple » à l’identique', () => {
    const state = applied(adapter.applyAction(table(), 'u1', { action: 'guess', value: 30 }))
    for (const json of [adapter.serialize(state), adapter.clientViewJson(state, 'u1'), adapter.spectatorViewJson(state)]) {
      const raw = JSON.parse(json) as Record<string, unknown>
      expect(typeof raw.version).toBe('number')
      expect(typeof raw.phase).toBe('string')
      expect(raw).not.toHaveProperty('winner')
      expect(parseSimplePhaseSyncedState(json)).toEqual(raw)
    }
  })
})
