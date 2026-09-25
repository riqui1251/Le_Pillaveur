import { describe, expect, it } from 'vitest'
import { RETENTION_RUN_STALE_MS, retentionRunStatus } from '@/lib/supervision/retention-run'

const AT = '2026-09-25T06:00:00.000Z'
const NOW = Date.parse(AT) + 60_000

describe('retentionRunStatus', () => {
  it('passage récent et complet : pas d’alerte, total des blocs', () => {
    const status = retentionRunStatus({ at: AT, ok: true, counts: { IpSeenLog: 12, 'User.staleGuests': 3 }, failed: [] }, NOW)
    expect(status).toEqual({
      total: 15,
      stale: false,
      failed: [],
      blocks: ['IpSeenLog', 'User.staleGuests'],
      errored: false,
      alert: false,
    })
  })

  it('borne des 24 h : pile 24 h reste à l’heure, une milliseconde de plus passe en alerte', () => {
    const run = { at: AT, ok: true, counts: {}, failed: [] }
    expect(retentionRunStatus(run, Date.parse(AT) + RETENTION_RUN_STALE_MS).stale).toBe(false)
    const late = retentionRunStatus(run, Date.parse(AT) + RETENTION_RUN_STALE_MS + 1)
    expect(late.stale).toBe(true)
    expect(late.alert).toBe(true)
  })

  it('une date illisible compte comme un passage trop ancien', () => {
    const status = retentionRunStatus({ at: 'hier ?', ok: true, counts: {}, failed: [] }, NOW)
    expect(status.stale).toBe(true)
    expect(status.alert).toBe(true)
  })

  it('bloc en échec : alerte, et le bloc sans volume s’ajoute au détail après les autres', () => {
    const status = retentionRunStatus(
      { at: AT, ok: false, counts: { IpSeenLog: 4, 'User.orphanGuests': 1 }, failed: ['User.orphanGuests', 'Visit'] },
      NOW
    )
    expect(status.errored).toBe(true)
    expect(status.alert).toBe(true)
    expect(status.failed).toEqual(['User.orphanGuests', 'Visit'])
    // Un bloc déjà compté n'est pas répété.
    expect(status.blocks).toEqual(['IpSeenLog', 'User.orphanGuests', 'Visit'])
  })

  it('ignore un volume non numérique dans le total', () => {
    const status = retentionRunStatus({ at: AT, ok: true, counts: { a: 2, b: Number.NaN, c: Infinity }, failed: [] }, NOW)
    expect(status.total).toBe(2)
  })

  it('trace ancienne sans liste d’échecs : lue comme « aucun échec »', () => {
    const run = { at: AT, ok: true, counts: { a: 1 } } as unknown as Parameters<typeof retentionRunStatus>[0]
    const status = retentionRunStatus(run, NOW)
    expect(status.failed).toEqual([])
    expect(status.alert).toBe(false)
  })
})
