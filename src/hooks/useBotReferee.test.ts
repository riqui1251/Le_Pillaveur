import { describe, expect, it } from 'vitest'
import {
  BOT_REFEREE_BACKUP_STEP_MS,
  botRefereeBackupDelayMs,
  botRefereeRank,
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
