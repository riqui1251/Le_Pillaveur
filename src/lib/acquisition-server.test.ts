import { beforeEach, describe, expect, it, vi } from 'vitest'

// Base simulée : on vérifie l'écriture demandée (jour de Paris, incrément,
// reprise sur conflit) et la mise en forme de la lecture, pas le SQL de Prisma.
const { acquisitionDailyDb } = vi.hoisted(() => ({
  acquisitionDailyDb: { upsert: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { acquisitionDaily: acquisitionDailyDb } }))

import { getAcquisitionStats, recordAcquisition } from './acquisition-server'
import { ACQUISITION_DAILY_ROW_CAP, parseAcquisition, type Acquisition } from '@/lib/acquisition'

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
// 24/11/2026 à 23 h 30 UTC = déjà le 25/11 à Paris.
const LATE = new Date('2026-11-24T23:30:00Z')

const GOOGLE: Acquisition = {
  channel: 'google',
  host: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  landingPath: '/fr/regles/loup-garou',
}

beforeEach(() => {
  vi.resetAllMocks()
  acquisitionDailyDb.upsert.mockResolvedValue({})
  acquisitionDailyDb.updateMany.mockResolvedValue({ count: 0 })
  acquisitionDailyDb.count.mockResolvedValue(0)
  acquisitionDailyDb.groupBy.mockResolvedValue([])
  acquisitionDailyDb.aggregate.mockResolvedValue({ _min: { day: null }, _sum: { visits: null } })
})

const KEY = { day: '2026-11-25', ...GOOGLE }
const OVERFLOW = {
  day: '2026-11-25',
  channel: 'google',
  host: '*',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  landingPath: '*',
}
const upsertOf = (key: object) => ({
  where: { day_channel_host_utmSource_utmMedium_utmCampaign_landingPath: key },
  create: { ...key, visits: 1 },
  update: { visits: { increment: 1 } },
})

describe('recordAcquisition', () => {
  it('combinaison déjà présente : +1 sur sa ligne, sans compter ni créer', async () => {
    acquisitionDailyDb.updateMany.mockResolvedValue({ count: 1 })
    await recordAcquisition(GOOGLE, LATE)
    expect(acquisitionDailyDb.updateMany).toHaveBeenCalledWith({ where: KEY, data: { visits: { increment: 1 } } })
    expect(acquisitionDailyDb.count).not.toHaveBeenCalled()
    expect(acquisitionDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('nouvelle combinaison sous le plafond : créée telle quelle sur le jour de Paris, sans aucun identifiant', async () => {
    acquisitionDailyDb.count.mockResolvedValue(ACQUISITION_DAILY_ROW_CAP - 1)
    await recordAcquisition(GOOGLE, LATE)
    expect(acquisitionDailyDb.count).toHaveBeenCalledWith({ where: { day: '2026-11-25' } })
    expect(acquisitionDailyDb.upsert).toHaveBeenCalledWith(upsertOf(KEY))
  })

  it('nouvelle combinaison au plafond : comptée dans la ligne de repli de son canal', async () => {
    acquisitionDailyDb.count.mockResolvedValue(ACQUISITION_DAILY_ROW_CAP)
    await recordAcquisition({ ...GOOGLE, utmCampaign: 'forgee_1234' }, LATE)
    expect(acquisitionDailyDb.upsert).toHaveBeenCalledTimes(1)
    expect(acquisitionDailyDb.upsert).toHaveBeenCalledWith(upsertOf(OVERFLOW))
  })

  it('au-delà du plafond, une combinaison déjà présente continue d’être incrémentée', async () => {
    acquisitionDailyDb.count.mockResolvedValue(ACQUISITION_DAILY_ROW_CAP + 40)
    acquisitionDailyDb.updateMany.mockResolvedValue({ count: 1 })
    await recordAcquisition(GOOGLE, LATE)
    expect(acquisitionDailyDb.updateMany).toHaveBeenCalledWith({ where: KEY, data: { visits: { increment: 1 } } })
    expect(acquisitionDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('les sentinelles de repli ne peuvent pas venir d’un client', () => {
    const base = { ref: '', path: '/fr', utmSource: '', utmMedium: '', utmCampaign: '' }
    expect(parseAcquisition({ ...base, ref: '*' })).toBeNull()
    expect(parseAcquisition({ ...base, ref: 'android-app://*' })).toBeNull()
    expect(parseAcquisition({ ...base, path: '*' })?.landingPath).toBe('')
    expect(parseAcquisition({ ...base, utmSource: '*' })?.utmSource).toBe('')
  })

  it('deux premières arrivées simultanées : la perdante repasse une fois', async () => {
    acquisitionDailyDb.upsert.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({})
    await recordAcquisition(GOOGLE, LATE)
    expect(acquisitionDailyDb.upsert).toHaveBeenCalledTimes(2)
  })

  it('une autre panne remonte, sans nouvel essai', async () => {
    acquisitionDailyDb.upsert.mockRejectedValueOnce(new Error('SQLITE_BUSY'))
    await expect(recordAcquisition(GOOGLE, LATE)).rejects.toThrow('SQLITE_BUSY')
    expect(acquisitionDailyDb.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('getAcquisitionStats', () => {
  it('fenêtre de N jours de Paris, aujourd’hui compris, et listes mises en forme', async () => {
    acquisitionDailyDb.groupBy
      .mockResolvedValueOnce([
        { channel: 'google', _sum: { visits: 5 } },
        { channel: 'direct', _sum: { visits: 2 } },
        { channel: 'inconnu', _sum: { visits: 9 } },
      ])
      .mockResolvedValueOnce([{ landingPath: '/fr', _sum: { visits: 4 } }])
      .mockResolvedValueOnce([{ utmSource: 'tiktok', utmMedium: 'bio', utmCampaign: '', _sum: { visits: 1 } }])
      .mockResolvedValueOnce([{ channel: 'autre', host: 'blog.fr', _sum: { visits: 1 } }])
    acquisitionDailyDb.aggregate
      .mockResolvedValueOnce({ _min: { day: '2026-11-25' } })
      .mockResolvedValueOnce({ _sum: { visits: 2 } })

    const stats = await getAcquisitionStats(7, LATE)

    expect(acquisitionDailyDb.aggregate.mock.calls[1][0]).toEqual({
      where: { day: { gte: '2026-11-19' }, landingPath: '*' },
      _sum: { visits: true },
    })
    expect(acquisitionDailyDb.groupBy.mock.calls[0][0]).toMatchObject({ by: ['channel'], where: { day: { gte: '2026-11-19' } } })
    expect(stats).toEqual({
      from: '2026-11-19',
      since: '2026-11-25',
      total: 7,
      overflow: 2,
      channels: [
        { channel: 'google', visits: 5 },
        { channel: 'direct', visits: 2 },
      ],
      landings: [{ path: '/fr', visits: 4 }],
      campaigns: [{ source: 'tiktok', medium: 'bio', campaign: '', visits: 1 }],
      hosts: [{ channel: 'autre', host: 'blog.fr', visits: 1 }],
    })
  })
})
