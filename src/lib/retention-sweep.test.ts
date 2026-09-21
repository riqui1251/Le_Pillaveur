import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et la suppression de compte sont remplacés : on ne teste ici QUE les
// critères des purges et l'indépendance des blocs, pas le SQL généré.
const { prismaMock, deleteUserAccountMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    sitePresence: { deleteMany: vi.fn(), updateMany: vi.fn() },
    accountVisit: { deleteMany: vi.fn() },
    chatMessage: { deleteMany: vi.fn() },
    nameModerationAttempt: { deleteMany: vi.fn() },
    dailyVisitor: { deleteMany: vi.fn() },
    onlineGameSession: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    accountBanEvent: { updateMany: vi.fn() },
    user: { updateMany: vi.fn(), findMany: vi.fn() },
    siteSetting: { upsert: vi.fn() },
  },
  deleteUserAccountMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/user-activity-server', () => ({ deleteUserAccount: deleteUserAccountMock }))

import { parseRetentionLastRun, type RetentionLastRun } from '@/lib/retention-sweep'

const NOW = new Date('2026-10-10T12:00:00.000Z').getTime()
const DAY_MS = 24 * 60 * 60 * 1000

type FindManyArgs = { where: Record<string, unknown>; take?: number }
type RawCall = [TemplateStringsArray, ...unknown[]]

/** Requête SQL brute passée à $executeRaw, paramètres remplacés par « ? ». */
const sqlOf = ([strings]: RawCall) => strings.join('?')

function rawCall(predicate: (sql: string) => boolean): RawCall | undefined {
  return (prismaMock.$executeRaw.mock.calls as RawCall[]).find((call) => predicate(sqlOf(call)))
}

/** Témoin écrit par le passage (dernier upsert de SiteSetting). */
function writtenLastRun(): RetentionLastRun {
  const calls = prismaMock.siteSetting.upsert.mock.calls as Array<
    [{ where: { key: string }; create: { key: string; value: string }; update: { value: string } }]
  >
  const [args] = calls[calls.length - 1]
  expect(args.where).toEqual({ key: 'retention.lastRun' })
  expect(args.create).toEqual({ key: 'retention.lastRun', value: args.update.value })
  return JSON.parse(args.update.value) as RetentionLastRun
}

/** Les deux purges de comptes passent par user.findMany et filtrent toutes deux
 *  les sessions : les orphelins se reconnaissent au filtre sur les signalements. */
const isOrphanQuery = (args: FindManyArgs) => 'abuseReportsReceived' in args.where

function findManyCall(predicate: (args: FindManyArgs) => boolean): FindManyArgs | undefined {
  return prismaMock.user.findMany.mock.calls
    .map(([args]) => args as FindManyArgs)
    .find(predicate)
}

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

async function runSweep() {
  // `force`, comme le planificateur : ces tests portent sur CE QUE fait le
  // balayage, pas sur QUAND il part. La garde des 6 h, elle, est vérifiée à
  // part plus bas — et elle démarre désormais à l'heure du processus, donc un
  // module tout neuf est justement dans sa fenêtre de silence.
  vi.resetModules()
  const { runRetentionSweep } = await import('@/lib/retention-sweep')
  await runRetentionSweep({ force: true })
}

describe('balayage de conservation', () => {
  let orphans: Array<{ id: string }>
  let staleGuests: Array<{ id: string }>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    orphans = []
    staleGuests = []

    prismaMock.$executeRaw.mockReset().mockResolvedValue(0)
    for (const model of [
      prismaMock.sitePresence,
      prismaMock.accountVisit,
      prismaMock.chatMessage,
      prismaMock.nameModerationAttempt,
      prismaMock.dailyVisitor,
      prismaMock.onlineGameSession,
      prismaMock.session,
    ]) {
      model.deleteMany.mockReset().mockResolvedValue({ count: 0 })
    }
    prismaMock.user.updateMany.mockReset().mockResolvedValue({ count: 0 })
    prismaMock.sitePresence.updateMany.mockReset().mockResolvedValue({ count: 0 })
    prismaMock.accountBanEvent.updateMany.mockReset().mockResolvedValue({ count: 0 })
    prismaMock.siteSetting.upsert.mockReset().mockResolvedValue({})
    prismaMock.user.findMany
      .mockReset()
      .mockImplementation(async (args: FindManyArgs) => (isOrphanQuery(args) ? orphans : staleGuests))
    deleteUserAccountMock.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('supprime les sessions échues', async () => {
    await runSweep()
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date(NOW) } },
    })
  })

  it("purge l'historique IP des comptes qui n'existent plus, sans condition de date", async () => {
    await runSweep()
    const orphanIps = rawCall((sql) => sql.includes(`LIKE 'user:%'`))
    expect(orphanIps).toBeDefined()
    expect(sqlOf(orphanIps!)).toBe(
      `DELETE FROM "IpSeenLog" WHERE "subjectKey" LIKE 'user:%' AND substr("subjectKey", 6) NOT IN (SELECT "id" FROM "User")`
    )
    // Aucun paramètre : ni date (piège ISO / millisecondes), ni identifiant.
    expect(orphanIps!.slice(1)).toEqual([])
  })

  it('purge les visites de compte commencées il y a plus de 6 mois', async () => {
    await runSweep()
    expect(prismaMock.accountVisit.deleteMany).toHaveBeenCalledWith({
      where: { startedAt: { lt: new Date(NOW - 180 * DAY_MS) } },
    })
  })

  it("l'échec de la purge des visites n'empêche ni les autres purges ni les suppressions de comptes", async () => {
    prismaMock.accountVisit.deleteMany.mockRejectedValue(new Error('base verrouillée'))
    orphans = [{ id: 'guest-a' }]
    await expect(runSweep()).resolves.toBeUndefined()
    expect(prismaMock.sitePresence.deleteMany).toHaveBeenCalled()
    expect(prismaMock.session.deleteMany).toHaveBeenCalled()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-a')
    expect(console.error).toHaveBeenCalledWith('retention sweep error (AccountVisit):', 'Error')
  })

  it("rattrape ce que l'ancien accord '1' a pu réécrire pendant un déploiement", async () => {
    await runSweep()
    const outdated = [{ consentVersion: null }, { consentVersion: { not: '2' } }]
    // Présences jamais liées à un compte, écrites hors accord courant : supprimées.
    expect(prismaMock.sitePresence.deleteMany).toHaveBeenCalledWith({ where: { userId: null, OR: outdated } })
    // Présences liées gardées, mais sans pseudos locaux.
    expect(prismaMock.sitePresence.updateMany).toHaveBeenCalledWith({
      where: {
        AND: [{ OR: outdated }, { OR: [{ localPlayerNames: { not: null } }, { localPlayerCount: { not: 0 } }] }],
      },
      data: { localPlayerNames: null, localPlayerCount: 0 },
    })
    // Historique IP visiteur sans présence consentie (SQL brut, IpSeenLog).
    const legacyIps = rawCall((sql) => sql.includes(`LIKE 'visitor:%'`))
    expect(legacyIps && sqlOf(legacyIps)).toContain('NOT IN (SELECT "visitorId" FROM "SitePresence"')
    expect(legacyIps?.slice(1)).toEqual(['2'])
    // Ancien cumul de présence.
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { totalPresenceSeconds: { gt: 0 } },
      data: { totalPresenceSeconds: 0 },
    })
  })

  it('anonymise toute suppression de compte journalisée hors du format neutre', async () => {
    await runSweep()
    const [args] = prismaMock.accountBanEvent.updateMany.mock.calls[0] as [
      { where: { action: string; NOT: { comment: { in: string[] } } }; data: { comment: string } },
    ]
    expect(args.where.action).toBe('account-delete')
    expect(args.data).toEqual({ comment: 'compte supprimé' })
    const allowed = args.where.NOT.comment.in
    // Détails neutres et forme déjà anonymisée : laissés tels quels.
    expect(allowed).toEqual(expect.arrayContaining(['compte supprimé', 'guest:user', 'password:moderator']))
    // L'ancien format recopiait pseudo, code et email : jamais admis.
    expect(allowed).not.toContain('diablo (LP-NNCRCK) — a@b.fr')
    expect(allowed.every((detail) => !detail.includes('@'))).toBe(true)
  })

  it('cible les invités orphelins non bannis, sans session valide, inactifs depuis 7 jours et sans signalement ouvert', async () => {
    await runSweep()
    const cutoff = new Date(NOW - 7 * DAY_MS)
    const query = findManyCall(isOrphanQuery)
    expect(query).toEqual({
      where: {
        isGuest: true,
        banType: null,
        sessions: { none: { expiresAt: { gt: new Date(NOW) } } },
        abuseReportsReceived: { none: { status: 'open' } },
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: 50,
    })
  })

  it('supprime chaque orphelin par la routine complète', async () => {
    orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-a')
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-b')
    expect(deleteUserAccountMock).toHaveBeenCalledTimes(2)
  })

  it('garde la purge des invités inactifs depuis 90 jours, sauf session encore valide', async () => {
    staleGuests = [{ id: 'guest-old' }]
    await runSweep()
    const cutoff = new Date(NOW - 90 * DAY_MS)
    expect(findManyCall((args) => !isOrphanQuery(args))).toEqual({
      where: {
        isGuest: true,
        // Ping bloqué : /api/auth/me prolonge la session sans écrire
        // lastSeenAt — un invité qui joue encore ne doit pas partir.
        sessions: { none: { expiresAt: { gt: new Date(NOW) } } },
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: 50,
    })
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
  })

  it("un compte impossible à supprimer n'arrête pas les suivants", async () => {
    orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
    deleteUserAccountMock.mockRejectedValueOnce(new Error('contrainte'))
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-b')
  })

  it("l'échec d'une purge simple n'empêche ni les autres ni les suppressions de comptes", async () => {
    prismaMock.chatMessage.deleteMany.mockRejectedValue(new Error('base verrouillée'))
    orphans = [{ id: 'guest-a' }]
    staleGuests = [{ id: 'guest-old' }]
    await expect(runSweep()).resolves.toBeUndefined()
    expect(prismaMock.session.deleteMany).toHaveBeenCalled()
    expect(prismaMock.user.updateMany).toHaveBeenCalled()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-a')
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
  })

  it("l'échec de la recherche des orphelins laisse passer la purge à 90 jours", async () => {
    staleGuests = [{ id: 'guest-old' }]
    prismaMock.user.findMany.mockImplementation(async (args: FindManyArgs) => {
      if (isOrphanQuery(args)) throw new Error('requête refusée')
      return staleGuests
    })
    await runSweep()
    expect(deleteUserAccountMock).toHaveBeenCalledWith('guest-old')
    const lastRun = writtenLastRun()
    expect(lastRun.failed).toEqual(['User.orphanGuests'])
    expect(lastRun.counts['User.staleGuests']).toBe(1)
  })

  describe('témoin du passage (SiteSetting retention.lastRun)', () => {
    it('écrit la date du passage et les volumes par bloc, sans aucun identifiant de compte', async () => {
      prismaMock.session.deleteMany.mockResolvedValue({ count: 3 })
      prismaMock.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join('?').includes(`LIKE 'user:%'`) ? 21 : 0
      )
      orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
      staleGuests = [{ id: 'guest-old' }]

      await runSweep()

      const lastRun = writtenLastRun()
      expect(lastRun.at).toBe(new Date(NOW).toISOString())
      expect(lastRun.ok).toBe(true)
      expect(lastRun.failed).toEqual([])
      expect(lastRun.counts).toMatchObject({
        Session: 3,
        'IpSeenLog.orphanUser': 21,
        IpSeenLog: 0,
        AccountVisit: 0,
        'User.orphanGuests': 2,
        'User.staleGuests': 1,
      })
      // Un bloc par purge simple, plus les deux blocs de comptes.
      expect(Object.keys(lastRun.counts)).toHaveLength(17)
      const stored = prismaMock.siteSetting.upsert.mock.calls[0][0].update.value as string
      for (const id of ['guest-a', 'guest-b', 'guest-old']) expect(stored).not.toContain(id)
    })

    it('liste les blocs en échec, y compris un compte qui résiste à la suppression', async () => {
      prismaMock.accountVisit.deleteMany.mockRejectedValue(new Error('base verrouillée'))
      orphans = [{ id: 'guest-a' }, { id: 'guest-b' }]
      deleteUserAccountMock.mockRejectedValueOnce(new Error('contrainte'))

      await runSweep()

      const lastRun = writtenLastRun()
      expect(lastRun.ok).toBe(false)
      expect(lastRun.failed).toEqual(['AccountVisit', 'User.orphanGuests'])
      expect(lastRun.counts).not.toHaveProperty('AccountVisit')
      expect(lastRun.counts['User.orphanGuests']).toBe(1)
      expect(lastRun.counts.Session).toBe(0)
    })

    it("un témoin impossible à écrire ne fait que se journaliser", async () => {
      prismaMock.siteSetting.upsert.mockRejectedValue(new Error('base verrouillée'))
      await expect(runSweep()).resolves.toBeUndefined()
      expect(console.error).toHaveBeenCalledWith('retention sweep error (lastRun):', 'Error')
    })

    it("le filet ne part PAS au premier visiteur qui suit un déploiement", async () => {
      // Régression : la garde partait de 0, donc le tout premier ping suivant
      // un démarrage passait — c'est-à-dire, en pratique, un balayage complet
      // (jusqu'à 100 suppressions de comptes) à l'heure du déploiement, au
      // beau milieu de la soirée. Elle part maintenant de l'heure du
      // processus : le filet attend 6 h, le planificateur garde son tour.
      vi.resetModules()
      const { runRetentionSweep } = await import('@/lib/retention-sweep')
      await runRetentionSweep()
      expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled()
      expect(deleteUserAccountMock).not.toHaveBeenCalled()
    })

    it("n'est écrit qu'une fois par intervalle de balayage", async () => {
      vi.resetModules()
      const { runRetentionSweep } = await import('@/lib/retention-sweep')
      // Six heures de fonctionnement : le filet a le droit de passer, une fois.
      vi.setSystemTime(NOW + SWEEP_INTERVAL_MS)
      await runRetentionSweep()
      await runRetentionSweep()
      expect(prismaMock.siteSetting.upsert).toHaveBeenCalledTimes(1)
    })

    it('mais le planificateur passe outre la garde, et la repousse pour le filet', async () => {
      vi.resetModules()
      const { runRetentionSweep } = await import('@/lib/retention-sweep')
      vi.setSystemTime(NOW + SWEEP_INTERVAL_MS)
      await runRetentionSweep()
      // Chemin nominal (scheduler.ts) : sa cadence est la bonne, la garde des
      // 6 h ne doit pas lui faire sauter son tour de la nuit.
      await runRetentionSweep({ force: true })
      expect(prismaMock.siteSetting.upsert).toHaveBeenCalledTimes(2)
      // Et le filet du ping ne refait pas le travail dans la foulée.
      await runRetentionSweep()
      expect(prismaMock.siteSetting.upsert).toHaveBeenCalledTimes(2)
    })
  })
})

describe('parseRetentionLastRun', () => {
  const valid: RetentionLastRun = {
    at: '2026-10-10T12:00:00.000Z',
    ok: false,
    counts: { Session: 3, 'User.orphanGuests': 1 },
    failed: ['AccountVisit'],
  }

  it('relit un témoin écrit par le balayage', () => {
    expect(parseRetentionLastRun(JSON.stringify(valid))).toEqual(valid)
  })

  it('renvoie null sans témoin exploitable', () => {
    for (const value of [null, undefined, '', 'pas du json', '[]', '42', '{"ok":true}', '{"at":"hier"}']) {
      expect(parseRetentionLastRun(value)).toBeNull()
    }
  })

  it('ignore les volumes et noms de blocs mal formés', () => {
    const parsed = parseRetentionLastRun(
      JSON.stringify({
        at: valid.at,
        ok: true,
        counts: { Session: 3, IpSeenLog: -1, ChatMessage: 1.5, DailyVisitor: '4' },
        failed: ['SitePresence', 7, null],
      })
    )
    expect(parsed?.counts).toEqual({ Session: 3 })
    expect(parsed?.failed).toEqual(['SitePresence'])
    // Jamais « tout va bien » avec un bloc en échec.
    expect(parsed?.ok).toBe(false)
  })

  it('déduit `ok` des échecs quand il manque', () => {
    expect(parseRetentionLastRun(JSON.stringify({ at: valid.at, counts: {}, failed: [] }))?.ok).toBe(true)
    expect(parseRetentionLastRun(JSON.stringify({ at: valid.at }))).toEqual({
      at: valid.at,
      ok: true,
      counts: {},
      failed: [],
    })
  })
})
