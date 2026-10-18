import { describe, expect, it } from 'vitest'
import { BOT_PERSONAS, botDisplayName, botTickDelayMs } from '@/lib/online/bot-personas'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  currentMenteurActorId,
  menteurHumanSeated,
  MENTEUR_REVEAL_MIN_MS,
  type MenteurPhase,
  type MenteurState,
} from './engine'
import { applyMenteurBotAction, buildMenteurState } from './server-adapter'
import { menteurBotTickDelayMs, MENTEUR_REVEAL_BOT_TICK_MS, MENTEUR_REVEAL_BOTS_ONLY_TICK_MS } from './bot-tick'

/**
 * Le tick « bot » du Menteur est calculé par UNE fonction, que le client
 * (useBotReferee, tirage au hasard) et le filet serveur (serviceTick, borne
 * haute) appellent avec les mêmes entrées : le serveur ne devance jamais un
 * client éveillé, et aucun des deux ne bute sur le plancher de lecture.
 */

const T0 = 1_000_000
const RANDS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1]
const NAMES = BOT_PERSONAS.map(botDisplayName)

describe('menteurBotTickDelayMs', () => {
  const at = (phase: MenteurPhase, actorIsBot: boolean, humanSeated: boolean, actorName = NAMES[0]) => ({
    phase,
    actorIsBot,
    actorName,
    humanSeated,
  })

  it('enchère d’un bot au tour : le tempo de son persona', () => {
    for (const name of NAMES) {
      for (const r of RANDS) {
        expect(menteurBotTickDelayMs(at('bidding', true, true, name), () => r)).toBe(botTickDelayMs(name, () => r))
      }
    }
  })

  it('révélation menée par un bot : 5 s avec un humain assis, 2,6 s sans', () => {
    expect(menteurBotTickDelayMs(at('reveal', true, true), () => 0)).toBe(5000)
    expect(menteurBotTickDelayMs(at('reveal', true, false), () => 0)).toBe(2600)
    expect(MENTEUR_REVEAL_BOT_TICK_MS).toBe(5000)
    expect(MENTEUR_REVEAL_BOTS_ONLY_TICK_MS).toBe(2600)
  })

  it('un humain assis : au moins 1 s de marge au-dessus du plancher de lecture, quel que soit le tirage', () => {
    for (const name of NAMES) {
      for (const r of RANDS) {
        expect(menteurBotTickDelayMs(at('reveal', true, true, name), () => r)!).toBeGreaterThanOrEqual(
          MENTEUR_REVEAL_MIN_MS + 1000
        )
      }
    }
  })

  it('tour d’un humain, ou partie finie : null', () => {
    for (const phase of ['bidding', 'reveal'] as const) {
      expect(menteurBotTickDelayMs(at(phase, false, true), () => 0.5)).toBeNull()
    }
    expect(menteurBotTickDelayMs(at('finished', true, true), () => 0.5)).toBeNull()
  })

  it('pour tout tirage dans [0, 1], le délai client ne dépasse jamais celui du serveur (rand = 1)', () => {
    for (const name of NAMES) {
      for (const phase of ['bidding', 'reveal'] as const) {
        for (const humanSeated of [true, false]) {
          const server = menteurBotTickDelayMs(at(phase, true, humanSeated, name), () => 1)!
          for (const r of RANDS) {
            expect(menteurBotTickDelayMs(at(phase, true, humanSeated, name), () => r)!).toBeLessThanOrEqual(server)
          }
        }
      }
    }
  })
})

describe('serviceTick et client calculent le même délai', () => {
  const adapter = getGameAdapter('menteur')!

  /** Table solo à 4 (toi + 3 bots), comme l'ouvre « Essayer avec des bots ». */
  const soloTable = (seed: number): MenteurState =>
    buildMenteurState([{ userId: 'h1', user: { displayName: 'Léa' } }], 3, `tick-${seed}`)

  /** Révélation entrée à T0 et menée par le bot `loserId` (encore vivant). */
  const botLedReveal = (s: MenteurState, loserId: string): MenteurState => ({
    ...s,
    phase: 'reveal',
    revealAt: T0,
    currentBid: null,
    lastReveal: {
      bid: { qty: 9, face: 6, by: loserId },
      challengerId: 'h1',
      allDice: s.players.map((p) => ({ playerId: p.id, dice: [...p.dice] })),
      matchCount: 3,
      bidHeld: false,
      loserId,
      sips: 1,
      eliminatedId: null,
      mode: 'dudo',
      gainedId: null,
    },
  })

  /** Ce que passe MenteurOnline : l'acteur courant de la salle, les joueurs de la vue. */
  const clientDelay = (s: MenteurState, rand: () => number) => {
    const actor = s.players.find((p) => p.id === currentMenteurActorId(s))
    return menteurBotTickDelayMs(
      {
        phase: s.phase,
        actorIsBot: Boolean(actor?.isBot),
        actorName: actor?.name,
        humanSeated: menteurHumanSeated(s.players),
      },
      rand
    )
  }

  it('enchère d’un bot et révélation qu’il mène : borne haute du serveur ≥ tout tirage du client', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const table = soloTable(seed)
      const bot = table.players.find((p) => p.isBot)!
      const bidding: MenteurState = { ...table, phase: 'bidding', turnIdx: table.players.indexOf(bot) }
      for (const s of [bidding, botLedReveal(table, bot.id)]) {
        const server = adapter.serviceTick!(s, T0, { rand: () => 1 })
        expect(server?.body).toEqual({ action: 'bot' })
        expect(server!.dueAt - T0).toBe(clientDelay(s, () => 1))
        // Par défaut (sans rand), le serveur prend la borne haute.
        expect(adapter.serviceTick!(s, T0)).toEqual(server)
        for (const r of RANDS) expect(clientDelay(s, () => r)!).toBeLessThanOrEqual(server!.dueAt - T0)
      }
      expect(adapter.serviceTick!(botLedReveal(table, bot.id), T0)!.dueAt).toBe(T0 + MENTEUR_REVEAL_BOT_TICK_MS)
    }
  })

  it('le tick du bot n’est jamais refusé en READING_TIME, au plus tôt côté client comme côté serveur', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const table = soloTable(seed)
      const bot = table.players.find((p) => p.isBot)!
      const reveal = botLedReveal(table, bot.id)
      const rand = createRng(`tick-coup-${seed}`).next
      for (const delay of [clientDelay(reveal, () => 0)!, adapter.serviceTick!(reveal, T0)!.dueAt - T0]) {
        const r = applyMenteurBotAction(reveal, rand, T0 + delay)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.state.phase).toBe('bidding')
      }
      // Avant le plancher, le même tick aurait été refusé : la marge sert.
      expect(applyMenteurBotAction(reveal, rand, T0 + MENTEUR_REVEAL_MIN_MS - 1)).toEqual({
        ok: false,
        error: 'READING_TIME',
      })
    }
  })

  it('tour de l’humain : aucun tick bot', () => {
    const table = soloTable(1)
    const humanTurn: MenteurState = { ...table, phase: 'bidding', turnIdx: table.players.findIndex((p) => !p.isBot) }
    expect(clientDelay(humanTurn, () => 0.5)).toBeNull()
    expect(adapter.serviceTick!(humanTurn, T0)).toBeNull()
  })
})
