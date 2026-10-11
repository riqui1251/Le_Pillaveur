import { describe, expect, it } from 'vitest'
import { GAME_ADAPTERS } from './game-adapters'
import { GAMES } from '@/lib/games'
import { personaForBotName } from './bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from './replacement'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import type { EngineState } from '@/lib/petit-buveur/engine'
import { buildTabouState, markTabouPlayerLeft } from '@/lib/tabou/server-adapter'
import type { TabouState } from '@/lib/tabou/engine'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import type { LGState } from '@/lib/loup-garou/engine'

/**
 * Les bornes de joueurs vivent à DEUX endroits : le registre (vérité serveur,
 * enforcement lobby/launch) et `games.ts` (affichage hub + lobby, bundle
 * client). Ce test garantit qu'elles ne divergent jamais.
 */
describe('bornes de joueurs : registre ↔ GAMES', () => {
  for (const [gameId, adapter] of Object.entries(GAME_ADAPTERS)) {
    it(`${gameId} : min/max identiques des deux côtés`, () => {
      const meta = GAMES.find((g) => g.id === gameId)
      expect(meta, `${gameId} absent de GAMES`).toBeTruthy()
      expect(meta?.onlineReady, `${gameId} devrait être onlineReady`).toBe(true)
      expect(meta?.minPlayers, `minPlayers de ${gameId}`).toBe(adapter.minPlayers)
      expect(meta?.maxPlayers, `maxPlayers de ${gameId}`).toBe(adapter.maxPlayers)
      expect(Boolean(meta?.botsFillable), `botsFillable de ${gameId}`).toBe(
        Boolean(adapter.botsFillable)
      )
    })
  }
})

describe('Petit Buveur : bots de l’hôte, tour joué par le serveur', () => {
  const adapter = GAME_ADAPTERS['petit-buveur']
  const NOW = 1_700_000_000_000
  /** Un hôte seul + 1 bot, le bot ayant la main. */
  const botToPlay = (): EngineState => ({
    ...buildPetitBuveurEngineState([{ userId: 'u1', displayName: 'Alice' }], 'normal', 'pb-tick', 1),
    currentPlayer: 1,
  })

  it('se complète avec des bots (lobby et lancement)', () => {
    expect(adapter.botsFillable).toBe(true)
  })

  it('tour d’un bot : tick « bot » au tempo de son persona, puis coup accepté', () => {
    const state = botToPlay()
    const persona = personaForBotName(state.players[1].name)!
    expect(persona).toBeTruthy()
    const tick = adapter.serviceTick!(state, NOW)
    expect(tick).toEqual({ body: { action: 'bot' }, dueAt: NOW + persona.tempoMaxMs })
    // Le corps que le filet serveur s'applique à lui-même : un coup du bot.
    const result = adapter.applyAction(state, 'u1', tick!.body)
    expect(result.ok).toBe(true)
  })

  it('tour de l’humain : rien à attendre côté serveur', () => {
    const state: EngineState = { ...botToPlay(), currentPlayer: 0 }
    expect(adapter.serviceTick!(state, NOW)).toBeNull()
  })
})

describe('Tabou Vocal : pas de bots au lancement, remplacement intact', () => {
  const adapter = GAME_ADAPTERS.tabou
  const members = ['u1', 'u2', 'u3', 'u4'].map((userId) => ({ userId, displayName: userId }))
  const teams = { u1: 'A', u2: 'A', u3: 'B', u4: 'B' } as const

  it('ne se complète pas avec des bots (un bot ne décrit rien)', () => {
    expect(adapter.botsFillable).toBeFalsy()
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    expect(state.players.some((p) => p.isBot)).toBe(false)
  })

  it('un joueur parti depuis le délai de grâce est remplacé par un bot quand même', () => {
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    const left = markTabouPlayerLeft(state, 'u1', Date.now() - ONLINE_REPLACE_GRACE_MS - 1_000)
    expect(left).not.toBeNull()
    const result = adapter.applyAction(left, 'u2', { action: 'replace-left' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const u1 = (result.state as TabouState).players.find((p) => p.id === 'u1')
      expect(u1?.isBot).toBe(true)
    }
  })

  it('un joueur inactif peut être converti en bot (replace-afk)', () => {
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    const converted = adapter.convertToBot(state, 'u3') as TabouState | null
    expect(converted?.players.find((p) => p.id === 'u3')?.isBot).toBe(true)
  })
})

describe('Loup-Garou : parole humaine au débat (debate-speak)', () => {
  const adapter = GAME_ADAPTERS['loup-garou']
  /** 1 humain + 3 bots, posés en plein débat. */
  const debating = (): LGState => ({
    ...buildLGState([{ userId: 'u1', user: { displayName: 'Riri' } }], undefined, 3, 42),
    phase: 'day-debate',
    phaseEndsAt: Date.now() + 60_000,
    round: 1,
  })
  const speak = (state: LGState, body: Record<string, unknown>) =>
    adapter.applyAction(state, 'u1', { action: 'debate-speak', ...body })

  it('accuser / se défendre / faire équipe entre dans debateSpeech', () => {
    const result = speak(debating(), { kind: 'suspect', targetId: 'bot-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.state as LGState).debateSpeech).toEqual([
        { playerId: 'u1', kind: 'suspect', targetId: 'bot-1', round: 1 },
      ])
    }
    for (const kind of ['defend', 'ally']) {
      expect(speak(debating(), { kind, targetId: 'bot-1' }).ok).toBe(true)
    }
  })

  it('kind hors liste ou cible absente → invalid_action 400', () => {
    expect(speak(debating(), { kind: 'rally', targetId: 'bot-1' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
    expect(speak(debating(), { kind: 'suspect' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('refus du moteur → 403 (mort : NOT_ALIVE ; soi-même : INVALID_TARGET)', () => {
    const base = debating()
    const dead: LGState = {
      ...base,
      players: base.players.map((p) => (p.id === 'u1' ? { ...p, alive: false } : p)),
    }
    expect(speak(dead, { kind: 'suspect', targetId: 'bot-1' })).toEqual({
      ok: false,
      error: 'NOT_ALIVE',
      status: 403,
    })
    expect(speak(base, { kind: 'suspect', targetId: 'u1' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
      status: 403,
    })
  })
})
