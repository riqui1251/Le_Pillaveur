import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le côté serveur des plantages joueur : validation stricte (pure), famille
 * d'appareil, dédoublonnage, plafond de créations, purge et regroupement —
 * sur un client Prisma simulé qui n'expose que les six opérations utilisées.
 */
const { clientErrorMock } = vi.hoisted(() => ({
  clientErrorMock: {
    updateMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { clientError: clientErrorMock } }))

import {
  CLIENT_ERROR_DAILY_CREATE_CAP,
  CLIENT_ERROR_DEDUP_WINDOW_MS,
  CLIENT_ERROR_GROUPS_SHOWN,
  CLIENT_ERROR_RETENTION_DAYS,
  clientErrorPurgeCutoff,
  deviceFamilyFromUserAgent,
  parseClientErrorReport,
  purgeOldClientErrors,
  recordClientError,
  summarizeClientErrors,
} from '@/lib/client-errors-server'
import { CLIENT_ERROR_FIELD_LIMITS } from '@/lib/client-error-report'

const NOW = new Date('2026-09-21T21:30:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

/** Un rapport conforme au contrat du module client. */
const VALID = {
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'map')",
  digest: '1234567890',
  path: '/fr/online/ABCD',
  buildSha: 'abc1234',
  locale: 'fr',
}

beforeEach(() => {
  clientErrorMock.updateMany.mockReset().mockResolvedValue({ count: 0 })
  clientErrorMock.count.mockReset().mockResolvedValue(0)
  clientErrorMock.create.mockReset().mockResolvedValue({})
  clientErrorMock.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  clientErrorMock.aggregate.mockReset().mockResolvedValue({ _sum: { count: null } })
  clientErrorMock.groupBy.mockReset().mockResolvedValue([])
})

describe('parseClientErrorReport : validation stricte', () => {
  it('accepte un rapport conforme, tel quel', () => {
    expect(parseClientErrorReport(VALID)).toEqual(VALID)
  })

  it('refuse tout ce qui n’est pas un objet', () => {
    for (const body of [null, undefined, 'texte', 42, [VALID]]) {
      expect(parseClientErrorReport(body), String(body)).toBeNull()
    }
  })

  it('refuse un nom absent, vide, trop long, ou d’un autre type', () => {
    expect(parseClientErrorReport({ ...VALID, name: undefined })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, name: '   ' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, name: 'N'.repeat(CLIENT_ERROR_FIELD_LIMITS.name + 1) })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, name: 42 })).toBeNull()
  })

  it('refuse un caractère de contrôle dans le nom (pas de retour à la ligne en base)', () => {
    expect(parseClientErrorReport({ ...VALID, name: 'Type\nError' })).toBeNull()
    // C1 (U+0085 NEL) et DEL sont des contrôles au même titre que C0.
    expect(parseClientErrorReport({ ...VALID, name: 'TypeError' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, name: 'TypeError' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, path: '/fr/jeux' })).toBeNull()
  })

  it('masque lui-même le code de table qui suit /invite ou /tv', () => {
    expect(parseClientErrorReport({ ...VALID, path: '/fr/invite/AB12CD' })?.path).toBe('/fr/invite/:code')
    expect(parseClientErrorReport({ ...VALID, path: '/fr/tv/ABCD' })?.path).toBe('/fr/tv/:code')
  })

  it('TRONQUE le message à 300 au lieu de le refuser : un message long est un message normal', () => {
    const parsed = parseClientErrorReport({ ...VALID, message: 'm'.repeat(1000) })
    expect(parsed?.message).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.message)
    expect(parseClientErrorReport({ ...VALID, message: '' })?.message).toBe('')
    expect(parseClientErrorReport({ ...VALID, message: undefined })).toBeNull()
  })

  it('exige un chemin absolu', () => {
    expect(parseClientErrorReport({ ...VALID, path: 'fr/jeux' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, path: 'https://lepillaveur.fr/fr/jeux' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, path: '' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, path: '/fr/je ux' })).toBeNull()
  })

  it('coupe lui-même la query et le hash : un ?token= n’atteint jamais la base', () => {
    expect(parseClientErrorReport({ ...VALID, path: '/fr/compte?token=secret#x' })?.path).toBe('/fr/compte')
  })

  it('masque lui-même un identifiant dans le chemin', () => {
    expect(parseClientErrorReport({ ...VALID, path: '/fr/supervision/comptes/cmfz1q2w3e4r5t6y7u8i9o0p1' })?.path).toBe(
      '/fr/supervision/comptes/:id'
    )
  })

  it('refuse un chemin de plus de 200 caractères, tel que reçu', () => {
    // Segments de 19 caractères : trop courts pour être masqués en `:id`, la
    // longueur est donc bien celle qu'on juge.
    const segment = '/' + 'a'.repeat(19)
    const justRight = segment.repeat(10) // 200 caractères
    expect(parseClientErrorReport({ ...VALID, path: justRight })?.path).toBe(justRight)
    expect(justRight).toHaveLength(CLIENT_ERROR_FIELD_LIMITS.path)
    expect(parseClientErrorReport({ ...VALID, path: justRight + '/a' })).toBeNull()
  })

  it('exige une langue courte et bien formée', () => {
    expect(parseClientErrorReport({ ...VALID, locale: 'pt-BR' })?.locale).toBe('pt-BR')
    for (const locale of ['', 'français', 'FR', 'f', 42, undefined]) {
      expect(parseClientErrorReport({ ...VALID, locale }), String(locale)).toBeNull()
    }
  })

  it('digest et sha sont facultatifs : absents ou vides → null', () => {
    expect(parseClientErrorReport({ ...VALID, digest: undefined, buildSha: undefined })).toMatchObject({
      digest: null,
      buildSha: null,
    })
    expect(parseClientErrorReport({ ...VALID, digest: '', buildSha: '' })).toMatchObject({
      digest: null,
      buildSha: null,
    })
  })

  it('digest et sha mal formés invalident le rapport plutôt que d’être devinés', () => {
    expect(parseClientErrorReport({ ...VALID, digest: 'a b' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, digest: 'd'.repeat(CLIENT_ERROR_FIELD_LIMITS.digest + 1) })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, digest: 42 })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, buildSha: 'f'.repeat(CLIENT_ERROR_FIELD_LIMITS.buildSha + 1) })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, buildSha: '-abc' })).toBeNull()
    expect(parseClientErrorReport({ ...VALID, buildSha: 'v1.2.3' })?.buildSha).toBe('v1.2.3')
  })

  it('ignore les champs inconnus sans les recopier', () => {
    const parsed = parseClientErrorReport({ ...VALID, userId: 'cm123', ip: '203.0.113.7' })
    expect(parsed).toEqual(VALID)
  })
})

describe('deviceFamilyFromUserAgent : une famille, jamais l’UA', () => {
  it('reconnaît mobile et tablette, tout le reste est « desktop »', () => {
    expect(
      deviceFamilyFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari')
    ).toBe('mobile')
    expect(deviceFamilyFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('tablet')
    expect(deviceFamilyFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0')).toBe('desktop')
    expect(deviceFamilyFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe('desktop')
    expect(deviceFamilyFromUserAgent(null)).toBe('desktop')
    expect(deviceFamilyFromUserAgent('')).toBe('desktop')
  })
})

describe('recordClientError : dédoublonnage sur 10 minutes', () => {
  it('incrémente la ligne identique de la fenêtre, sans en créer une', async () => {
    clientErrorMock.updateMany.mockResolvedValue({ count: 1 })
    await expect(recordClientError(VALID, 'mobile', NOW)).resolves.toBe('counted')

    expect(clientErrorMock.updateMany).toHaveBeenCalledWith({
      where: {
        name: VALID.name,
        message: VALID.message,
        path: VALID.path,
        buildSha: VALID.buildSha,
        createdAt: { gte: new Date(NOW.getTime() - CLIENT_ERROR_DEDUP_WINDOW_MS) },
      },
      data: { count: { increment: 1 } },
    })
    expect(clientErrorMock.create).not.toHaveBeenCalled()
  })

  it('crée la ligne quand rien n’était à incrémenter — avec la famille d’appareil, sans UA', async () => {
    clientErrorMock.updateMany.mockResolvedValue({ count: 0 })
    await expect(recordClientError({ ...VALID, buildSha: null }, 'tablet', NOW)).resolves.toBe('created')

    expect(clientErrorMock.create).toHaveBeenCalledWith({
      data: {
        createdAt: NOW,
        name: VALID.name,
        message: VALID.message,
        digest: VALID.digest,
        path: VALID.path,
        buildSha: null,
        device: 'tablet',
        locale: 'fr',
      },
    })
    // Sans sha, la fenêtre cherche les lignes SANS sha (IS NULL), pas n'importe lesquelles.
    expect(clientErrorMock.updateMany.mock.calls[0][0].where.buildSha).toBeNull()
  })

  it('n’insère plus au-delà du plafond de créations des 24 dernières heures (« dropped »)', async () => {
    clientErrorMock.count.mockResolvedValue(CLIENT_ERROR_DAILY_CREATE_CAP)
    await expect(recordClientError(VALID, 'mobile', NOW)).resolves.toBe('dropped')
    expect(clientErrorMock.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date(NOW.getTime() - DAY_MS) } },
    })
    expect(clientErrorMock.create).not.toHaveBeenCalled()

    // Juste sous le plafond, la ligne est créée.
    clientErrorMock.count.mockResolvedValue(CLIENT_ERROR_DAILY_CREATE_CAP - 1)
    await expect(recordClientError(VALID, 'mobile', NOW)).resolves.toBe('created')
    expect(clientErrorMock.create).toHaveBeenCalledTimes(1)
  })

  it('le plafond ne bride pas les répétitions : une ligne existante est toujours comptée', async () => {
    clientErrorMock.updateMany.mockResolvedValue({ count: 1 })
    clientErrorMock.count.mockResolvedValue(CLIENT_ERROR_DAILY_CREATE_CAP * 10)
    await expect(recordClientError(VALID, 'mobile', NOW)).resolves.toBe('counted')
    expect(clientErrorMock.count).not.toHaveBeenCalled()
  })

  it('la fenêtre vaut bien 10 minutes', () => {
    expect(CLIENT_ERROR_DEDUP_WINDOW_MS).toBe(10 * 60 * 1000)
  })
})

describe('purgeOldClientErrors : 30 jours', () => {
  it('calcule la date de coupure à 30 jours', () => {
    expect(CLIENT_ERROR_RETENTION_DAYS).toBe(30)
    expect(clientErrorPurgeCutoff(NOW)).toEqual(new Date(NOW.getTime() - 30 * DAY_MS))
  })

  it('supprime ce qui est plus vieux que la coupure et renvoie le volume', async () => {
    clientErrorMock.deleteMany.mockResolvedValue({ count: 7 })
    await expect(purgeOldClientErrors(NOW)).resolves.toBe(7)
    expect(clientErrorMock.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: clientErrorPurgeCutoff(NOW) } },
    })
  })
})

describe('summarizeClientErrors : ce que la Supervision affiche', () => {
  it('regroupe par erreur, page, sha et appareil, les plus récents d’abord, avec le total 24 h', async () => {
    const lastSeen = new Date('2026-09-21T21:00:00.000Z')
    clientErrorMock.aggregate.mockResolvedValue({ _sum: { count: 12 } })
    clientErrorMock.groupBy.mockResolvedValue([
      {
        name: 'TypeError',
        message: 'boom',
        path: '/fr/online/ABCD',
        buildSha: 'abc1234',
        device: 'mobile',
        _sum: { count: 9 },
        _max: { createdAt: lastSeen },
      },
    ])

    await expect(summarizeClientErrors(NOW)).resolves.toEqual({
      total24h: 12,
      groups: [
        {
          name: 'TypeError',
          message: 'boom',
          path: '/fr/online/ABCD',
          buildSha: 'abc1234',
          device: 'mobile',
          count: 9,
          lastSeenAt: lastSeen.toISOString(),
        },
      ],
    })

    expect(clientErrorMock.aggregate).toHaveBeenCalledWith({
      _sum: { count: true },
      where: { createdAt: { gte: new Date(NOW.getTime() - DAY_MS) } },
    })
    expect(clientErrorMock.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['name', 'message', 'path', 'buildSha', 'device'],
        // Borné à la fenêtre de conservation : jamais un parcours de toute la table.
        where: { createdAt: { gte: clientErrorPurgeCutoff(NOW) } },
        orderBy: { _max: { createdAt: 'desc' } },
        take: CLIENT_ERROR_GROUPS_SHOWN,
      })
    )
  })

  it('une table vide donne zéro, pas null', async () => {
    await expect(summarizeClientErrors(NOW)).resolves.toEqual({ total24h: 0, groups: [] })
  })
})
