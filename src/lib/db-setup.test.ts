import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma est remplacé : on ne teste pas SQLite (vitest ne touche aucune base),
// on teste ce que le démarrage ENVOIE au moteur et ce qu'il fait quand le
// moteur refuse. Les deux comptent : les PRAGMA rejoués à chaque requête
// coûteraient un aller-retour pour rien, et une exception laissée passer
// empêcherait le site de démarrer sur une base en lecture seule.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { ensureSqliteRuntimeSettings, resetSqliteRuntimeSettingsForTests } from '@/lib/db-setup'

/** Toutes les requêtes brutes émises, dans l'ordre d'émission. */
const statements = () => [
  ...prismaMock.$executeRawUnsafe.mock.calls.map((call) => String(call[0])),
  ...prismaMock.$queryRawUnsafe.mock.calls.map((call) => String(call[0])),
]

beforeEach(() => {
  // `restoreAllMocks` d'abord : il rend son vrai console.warn au test suivant
  // ET remet à zéro les implémentations, donc il doit passer AVANT qu'on
  // réarme le faux client — sinon les PRAGMA rendraient `undefined`.
  vi.restoreAllMocks()
  resetSqliteRuntimeSettingsForTests()
  prismaMock.$executeRawUnsafe.mockReset().mockResolvedValue(0)
  prismaMock.$queryRawUnsafe.mockReset().mockResolvedValue([{ journal_mode: 'wal' }])
})

describe('ensureSqliteRuntimeSettings', () => {
  it('pose les trois réglages : attente du verrou, WAL, synchronous NORMAL', async () => {
    await ensureSqliteRuntimeSettings()

    const sent = statements()
    expect(sent.some((sql) => /PRAGMA\s+busy_timeout\s*=\s*5000/i.test(sql))).toBe(true)
    expect(sent.some((sql) => /PRAGMA\s+journal_mode\s*=\s*WAL/i.test(sql))).toBe(true)
    expect(sent.some((sql) => /PRAGMA\s+synchronous\s*=\s*NORMAL/i.test(sql))).toBe(true)
  })

  it("règle l'attente du verrou AVANT de basculer en WAL (la bascule prend elle-même un verrou)", async () => {
    await ensureSqliteRuntimeSettings()

    expect(String(prismaMock.$queryRawUnsafe.mock.calls[0]?.[0])).toMatch(/busy_timeout/i)
    expect(String(prismaMock.$queryRawUnsafe.mock.calls[1]?.[0])).toMatch(/journal_mode/i)
  })

  it("passe busy_timeout par queryRaw : SQLite rend une ligne, et executeRaw la refuse", async () => {
    // Régression : `$executeRawUnsafe('PRAGMA busy_timeout = 5000')` lève
    // systématiquement « Execute returned results, which is not allowed in
    // SQLite. » Comme c'était le premier ordre du lot, WAL — le seul réglage
    // persistant — ne partait jamais.
    await ensureSqliteRuntimeSettings()

    const sentByExecute = prismaMock.$executeRawUnsafe.mock.calls.map((call) => String(call[0]))
    expect(sentByExecute.some((sql) => /busy_timeout/i.test(sql))).toBe(false)
    expect(sentByExecute.some((sql) => /journal_mode/i.test(sql))).toBe(false)
  })

  it('lit le mode de journal réellement obtenu, sans se contenter de l’envoyer', async () => {
    await ensureSqliteRuntimeSettings()

    expect(String(prismaMock.$queryRawUnsafe.mock.calls[1]?.[0])).toMatch(/journal_mode\s*=\s*WAL/i)
  })

  it('n’envoie les PRAGMA qu’une seule fois, même appelée plusieurs fois', async () => {
    await ensureSqliteRuntimeSettings()
    await ensureSqliteRuntimeSettings()
    await ensureSqliteRuntimeSettings()

    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(2)
  })

  it('deux appels concurrents partagent la même exécution', async () => {
    await Promise.all([ensureSqliteRuntimeSettings(), ensureSqliteRuntimeSettings()])

    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(2)
  })

  it('un PRAGMA en échec ne prive pas WAL de son tour (WAL est le seul persistant)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Premier ordre du lot refusé par le moteur : busy_timeout ne dure que le
    // temps d'une connexion, WAL est écrit dans l'en-tête du fichier. Le perdre
    // laisserait la base de prod en journal DELETE alors que tout le reste du
    // lot (scripts du VPS, sauvegardes) la suppose en WAL.
    prismaMock.$queryRawUnsafe
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValue([{ journal_mode: 'wal' }])

    await expect(ensureSqliteRuntimeSettings()).resolves.toBeUndefined()

    expect(String(prismaMock.$queryRawUnsafe.mock.calls[1]?.[0])).toMatch(/journal_mode\s*=\s*WAL/i)
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('signale un journal resté en DELETE (base en lecture seule) sans lever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ journal_mode: 'delete' }])

    await expect(ensureSqliteRuntimeSettings()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/delete/i)
  })

  it('avale l’erreur du moteur : le site doit démarrer même si les PRAGMA échouent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Base en lecture seule : les trois ordres échouent, et le site démarre
    // quand même — un volume mal monté ne doit pas empêcher de servir.
    const readonly = new Error('attempt to write a readonly database')
    prismaMock.$executeRawUnsafe.mockRejectedValue(readonly)
    prismaMock.$queryRawUnsafe.mockRejectedValue(readonly)

    await expect(ensureSqliteRuntimeSettings()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('ne recopie aucune donnée personnelle dans le journal du conteneur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Message volontairement bavard : on vérifie qu'on n'ajoute RIEN au
    // message du moteur (pas de pseudo, pas d'e-mail, pas d'IP — la règle
    // RGPD du projet vaut aussi pour les logs de démarrage).
    prismaMock.$executeRawUnsafe.mockRejectedValue(new Error('disk I/O error'))

    await ensureSqliteRuntimeSettings()

    const logged = warn.mock.calls[0]?.map((part) => String(part)).join(' ') ?? ''
    expect(logged).toContain('disk I/O error')
    expect(logged).not.toMatch(/@/)
    expect(logged).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
  })
})
