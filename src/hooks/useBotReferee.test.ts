import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADVANCE_TICK_EARLY_RETRIES,
  ADVANCE_TICK_MARGIN_MS,
  ADVANCE_TICK_MIN_DELAY_MS,
  BOT_REFEREE_BACKUP_STEP_MS,
  advanceTickDelayMs,
  botRefereeBackupDelayMs,
  botRefereeRank,
  scheduleAdvanceTick,
  shouldRetryAdvanceTick,
  type RefereePlayer,
} from './useBotReferee'

/**
 * Le classement des arbitres doit être IDENTIQUE chez tous les clients : il ne
 * dépend que de l'ordre du tableau `players` de l'état moteur (même JSON pour
 * tout le monde). Ces tests verrouillent cette propriété.
 */

const TABLE: RefereePlayer[] = [
  { id: 'bot-1', isBot: true, leftAt: null },
  { id: 'alice', isBot: false, leftAt: null },
  { id: 'bob', isBot: false, leftAt: 1000 },
  { id: 'carol', isBot: false, leftAt: null },
  { id: 'dan', isBot: false, leftAt: null },
]

describe('botRefereeRank', () => {
  it('classe les humains présents dans l’ordre du tableau moteur', () => {
    expect(botRefereeRank(TABLE, 'alice')).toBe(0)
    expect(botRefereeRank(TABLE, 'carol')).toBe(1)
    expect(botRefereeRank(TABLE, 'dan')).toBe(2)
  })

  it('exclut les bots et les partis (pas d’arbitrage)', () => {
    expect(botRefereeRank(TABLE, 'bot-1')).toBe(-1)
    expect(botRefereeRank(TABLE, 'bob')).toBe(-1)
  })

  it('renvoie -1 pour un inconnu ou une table absente', () => {
    expect(botRefereeRank(TABLE, 'zoe')).toBe(-1)
    expect(botRefereeRank(TABLE, undefined)).toBe(-1)
    expect(botRefereeRank(null, 'alice')).toBe(-1)
  })

  it('donne le MÊME rang à tous les clients (aucune dépendance au lecteur)', () => {
    const ranks = TABLE.map((p) => botRefereeRank(TABLE, p.id))
    expect(ranks).toEqual([-1, 0, -1, 1, 2])
  })

  it('promeut le suivant quand l’arbitre de rang 0 quitte la table', () => {
    const withoutAlice = TABLE.map((p) => (p.id === 'alice' ? { ...p, leftAt: 2000 } : p))
    expect(botRefereeRank(withoutAlice, 'carol')).toBe(0)
    expect(botRefereeRank(withoutAlice, 'dan')).toBe(1)
  })
})

describe('botRefereeBackupDelayMs', () => {
  it('laisse le rang 0 au délai d’origine', () => {
    expect(botRefereeBackupDelayMs(0)).toBe(0)
    expect(botRefereeBackupDelayMs(-1)).toBe(0)
  })

  it('retarde les secours d’un pas par rang', () => {
    expect(botRefereeBackupDelayMs(1)).toBe(BOT_REFEREE_BACKUP_STEP_MS)
    expect(botRefereeBackupDelayMs(3)).toBe(3 * BOT_REFEREE_BACKUP_STEP_MS)
    expect(botRefereeBackupDelayMs(2, 1000)).toBe(2000)
  })
})

/**
 * Tick « advance » : le rang 0 vise l'échéance (plus une marge), chaque rang
 * de secours ajoute un pas — à 16 joueurs, un seul client tire à l'heure au
 * lieu de seize (quinze 409 par transition).
 */
describe('ADVANCE_TICK_MARGIN_MS', () => {
  it('ne descend pas sous le plancher de l’ancien jitter (300 ms) : en solo, personne ne rattrape un tick refusé', () => {
    expect(ADVANCE_TICK_MARGIN_MS).toBeGreaterThanOrEqual(300)
  })
})

describe('advanceTickDelayMs', () => {
  const NOW = 1_000_000

  it('rang 0 : échéance + marge (délai d’origine, un joueur seul avec des bots)', () => {
    expect(advanceTickDelayMs(NOW + 10_000, 0, NOW)).toBe(10_000 + ADVANCE_TICK_MARGIN_MS)
  })

  it('rangs suivants : un pas de secours par rang', () => {
    expect(advanceTickDelayMs(NOW + 10_000, 1, NOW)).toBe(
      10_000 + ADVANCE_TICK_MARGIN_MS + BOT_REFEREE_BACKUP_STEP_MS
    )
    expect(advanceTickDelayMs(NOW + 10_000, 3, NOW)).toBe(
      10_000 + ADVANCE_TICK_MARGIN_MS + 3 * BOT_REFEREE_BACKUP_STEP_MS
    )
    expect(advanceTickDelayMs(NOW + 10_000, 2, NOW, 1000)).toBe(10_000 + ADVANCE_TICK_MARGIN_MS + 2000)
  })

  it('échéance déjà passée : plancher pour le rang 0, plancher + pas pour les secours', () => {
    expect(advanceTickDelayMs(NOW - 60_000, 0, NOW)).toBe(ADVANCE_TICK_MIN_DELAY_MS)
    expect(advanceTickDelayMs(NOW - 60_000, 2, NOW)).toBe(
      ADVANCE_TICK_MIN_DELAY_MS + 2 * BOT_REFEREE_BACKUP_STEP_MS
    )
  })

  it('les rangs restent strictement ordonnés quelle que soit l’échéance', () => {
    for (const dueAt of [NOW - 5000, NOW, NOW + 30_000]) {
      const delays = [0, 1, 2, 3].map((rank) => advanceTickDelayMs(dueAt, rank, NOW))
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i] - delays[i - 1]).toBe(BOT_REFEREE_BACKUP_STEP_MS)
      }
    }
  })
})

describe('scheduleAdvanceTick', () => {
  const NOW = 1_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rang 0 tire une seule fois, à l’échéance plus la marge', () => {
    const send = vi.fn()
    scheduleAdvanceTick({ dueAt: NOW + 5000, rank: 0, send })
    vi.advanceTimersByTime(5000 + ADVANCE_TICK_MARGIN_MS - 1)
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rang 1 attend un pas de plus que le rang 0', () => {
    const send = vi.fn()
    scheduleAdvanceTick({ dueAt: NOW + 5000, rank: 1, send })
    vi.advanceTimersByTime(5000 + ADVANCE_TICK_MARGIN_MS)
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(BOT_REFEREE_BACKUP_STEP_MS)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('réarmement : annuler puis réarmer sur la nouvelle phase ne tire que pour elle', () => {
    const sendOld = vi.fn()
    const sendNew = vi.fn()
    const cancel = scheduleAdvanceTick({ dueAt: NOW + 5000, rank: 1, send: sendOld })
    // Le rang 0 a fait avancer la phase : nouvelle version, nouvelle échéance.
    vi.advanceTimersByTime(5000 + ADVANCE_TICK_MARGIN_MS + 500)
    cancel()
    const now2 = Date.now()
    scheduleAdvanceTick({ dueAt: now2 + 8000, rank: 1, send: sendNew })
    vi.advanceTimersByTime(60_000)
    expect(sendOld).not.toHaveBeenCalled()
    expect(sendNew).toHaveBeenCalledTimes(1)
  })

  it('sans retryMs, un tick perdu n’est pas relancé tant que l’état ne bouge pas', () => {
    const send = vi.fn()
    scheduleAdvanceTick({ dueAt: NOW + 1000, rank: 0, send })
    vi.advanceTimersByTime(120_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('avec retryMs, relance à cadence fixe — espacée d’un pas par rang de secours', () => {
    const send0 = vi.fn()
    const send2 = vi.fn()
    scheduleAdvanceTick({ dueAt: NOW + 1000, rank: 0, retryMs: 5000, send: send0 })
    scheduleAdvanceTick({ dueAt: NOW + 1000, rank: 2, retryMs: 5000, send: send2 })
    // Rang 0 : premier tir à +1 300 ms, puis toutes les 5 s.
    vi.advanceTimersByTime(1000 + ADVANCE_TICK_MARGIN_MS + 5000 * 3)
    expect(send0).toHaveBeenCalledTimes(4)
    // Rang 2 : premier tir 8 s plus tard, puis toutes les 13 s.
    expect(send2).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000 + 2 * BOT_REFEREE_BACKUP_STEP_MS)
    expect(send2).toHaveBeenCalledTimes(2)
  })

  it('l’annulation coupe aussi les relances', () => {
    const send = vi.fn()
    const cancel = scheduleAdvanceTick({ dueAt: NOW + 1000, rank: 0, retryMs: 5000, send })
    vi.advanceTimersByTime(1000 + ADVANCE_TICK_MARGIN_MS + 5000)
    expect(send).toHaveBeenCalledTimes(2)
    cancel()
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('shouldRetryAdvanceTick', () => {
  it('reprend un 409 sans conflit de version (parti trop tôt : NOT_EXPIRED → action_failed)', () => {
    expect(shouldRetryAdvanceTick(409, 'action_failed', 0)).toBe(true)
    expect(shouldRetryAdvanceTick(409, undefined, 0)).toBe(true)
  })

  it('un conflit de version dit que l’état a bougé : l’effet se réarme, pas de reprise', () => {
    expect(shouldRetryAdvanceTick(409, 'version_conflict', 0)).toBe(false)
  })

  it('ne reprend ni un succès, ni un refus franc (403, 400), ni une erreur serveur', () => {
    expect(shouldRetryAdvanceTick(200, undefined, 0)).toBe(false)
    expect(shouldRetryAdvanceTick(403, 'replaced_by_bot', 0)).toBe(false)
    expect(shouldRetryAdvanceTick(400, 'invalid_action', 0)).toBe(false)
    expect(shouldRetryAdvanceTick(500, 'server_error', 0)).toBe(false)
  })

  it('s’arrête après ADVANCE_TICK_EARLY_RETRIES reprises', () => {
    expect(shouldRetryAdvanceTick(409, 'action_failed', ADVANCE_TICK_EARLY_RETRIES - 1)).toBe(true)
    expect(shouldRetryAdvanceTick(409, 'action_failed', ADVANCE_TICK_EARLY_RETRIES)).toBe(false)
  })
})
