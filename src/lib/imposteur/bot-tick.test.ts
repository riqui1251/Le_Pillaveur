import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName, botTickDelayMs, personaForBotName } from '@/lib/online/bot-personas'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { createImposteurState, currentImposteurActorId, reduceImposteur, type ImposteurState } from './engine'
import {
  imposteurBotTickDelayMs,
  IMPOSTEUR_REVEAL_BOT_TICK_MS,
  IMPOSTEUR_SPEECH_TICK_MIN_MS,
  IMPOSTEUR_SPEECH_TICK_SPAN_MS,
} from './bot-tick'

/**
 * Le tick « bot » de l'Imposteur est calculé par UNE fonction, que le client
 * (useBotReferee, tirage au hasard) et le filet serveur (serviceTick, borne
 * haute) appellent avec les mêmes entrées : le serveur ne devance jamais un
 * client éveillé.
 */

const T0 = 1_000_000
const zero = () => 0
const one = () => 1

describe('imposteurBotTickDelayMs', () => {
  const name = botDisplayName(BOT_PERSONAS[2])
  const base = { actorIsBot: false, actorName: null, hasAliveBot: true }

  it('révélation menée par un bot : 3,2 s ; par un humain : rien', () => {
    expect(imposteurBotTickDelayMs({ ...base, phase: 'reveal', actorIsBot: true, actorName: name }, zero)).toBe(
      IMPOSTEUR_REVEAL_BOT_TICK_MS
    )
    expect(imposteurBotTickDelayMs({ ...base, phase: 'reveal' }, zero)).toBeNull()
  })

  it('indice d’un bot au tour : le tempo de son persona', () => {
    for (const rand of [zero, one, () => 0.4]) {
      expect(imposteurBotTickDelayMs({ ...base, phase: 'clue', actorIsBot: true, actorName: name }, rand)).toBe(
        botTickDelayMs(name, rand)
      )
    }
  })

  it('un bot vivant à table pendant les indices ou le vote : tick « au cas où » de 2,5 à 5,5 s', () => {
    for (const phase of ['clue', 'vote'] as const) {
      expect(imposteurBotTickDelayMs({ ...base, phase }, zero)).toBe(IMPOSTEUR_SPEECH_TICK_MIN_MS)
      expect(imposteurBotTickDelayMs({ ...base, phase }, one)).toBe(
        IMPOSTEUR_SPEECH_TICK_MIN_MS + IMPOSTEUR_SPEECH_TICK_SPAN_MS
      )
      expect(imposteurBotTickDelayMs({ ...base, phase, hasAliveBot: false }, zero)).toBeNull()
    }
  })

  it('compte à rebours et fin de partie : rien', () => {
    for (const phase of ['countdown', 'finished'] as const) {
      expect(imposteurBotTickDelayMs({ ...base, phase, actorIsBot: true, actorName: name }, zero)).toBeNull()
    }
  })
})

describe('serviceTick et client calculent le même délai', () => {
  const adapter = getGameAdapter('imposteur')!
  const players = [
    { id: 'h1', name: 'Léa' },
    ...BOT_PERSONAS.slice(0, 4).map((p, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(p), isBot: true })),
  ]

  /** Ce que passe ImposteurOnline : l'acteur courant lu dans la salle, les bots vivants dans la vue. */
  const clientDelay = (s: ImposteurState, rand: () => number) => {
    const actor = s.players.find((p) => p.id === currentImposteurActorId(s))
    return imposteurBotTickDelayMs(
      {
        phase: s.phase,
        actorIsBot: Boolean(actor?.isBot),
        actorName: actor?.name,
        hasAliveBot: s.players.some((p) => p.isBot && !p.eliminated),
      },
      rand
    )
  }

  it('indices (bot ou humain au tour) et vote : borne haute du serveur ≥ tout tirage du client', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const raw = createImposteurState(players, [{ a: 'plage', b: 'piscine' }], seed, T0)
      const clue = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 + 5_000 })
      const vote: ImposteurState = { ...clue, phase: 'vote', phaseEndsAt: T0 + 60_000 }
      for (const s of [clue, vote]) {
        const server = adapter.serviceTick!(s, T0, { rand: one })
        expect(server?.body).toEqual({ action: 'bot' })
        expect(server!.dueAt - T0).toBe(clientDelay(s, one))
        expect(adapter.serviceTick!(s, T0, { rand: zero })!.dueAt - T0).toBe(clientDelay(s, zero))
        for (const r of [0, 0.3, 0.999]) expect(clientDelay(s, () => r)!).toBeLessThanOrEqual(server!.dueAt - T0)
        // Par défaut (sans rand), le serveur prend la borne haute.
        expect(adapter.serviceTick!(s, T0)).toEqual(server)
        const actor = s.players.find((p) => p.id === currentImposteurActorId(s))
        if (s.phase === 'clue' && actor?.isBot) {
          expect(server!.dueAt - T0).toBe(personaForBotName(actor.name)!.tempoMaxMs)
        }
      }
    }
  })
})
