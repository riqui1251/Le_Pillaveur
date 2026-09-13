import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Visites d'un compte : le temps crédité doit être le temps RÉEL d'une page
 * utilisée, quel que soit le nombre d'onglets ou d'appareils qui battent.
 * On vérifie :
 *  - la décision pure (création, crédit, bornes de 30 min et de 150 s) ;
 *  - la forme exacte des requêtes (visite ouverte, compare-and-swap) ;
 *  - des scénarios bout à bout sur une base simulée qui reproduit la sémantique
 *    Prisma utilisée (filtre `gte`, tri, `updateMany` conditionnel, `increment`).
 */
type Row = {
  id: string
  userId: string
  startedAt: Date
  lastBeatAt: Date
  visibleSeconds: number
  activeSeconds: number
  gameSeconds: number
  device: string | null
}

type FindFirstArgs = {
  where: { userId: string; lastBeatAt: { gte: Date } }
  orderBy: { lastBeatAt: 'desc' }
  select: { id: true; lastBeatAt: true }
}
type CreateArgs = {
  data: { userId: string; startedAt: Date; lastBeatAt: Date; device: string | null }
}
type UpdateManyArgs = {
  where: { id: string; lastBeatAt: Date }
  data: {
    lastBeatAt: Date
    visibleSeconds: { increment: number }
    activeSeconds: { increment: number }
    gameSeconds: { increment: number }
  }
}

const { visitMock } = vi.hoisted(() => ({
  visitMock: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { accountVisit: visitMock } }))

import {
  decideBeat,
  MAX_BEAT_CREDIT_MS,
  recordAccountBeat,
  VISIT_IDLE_GAP_MS,
} from '@/lib/account-visits-server'

const T0 = new Date('2026-09-12T20:00:00.000Z').getTime()
/** Instant T0 + `seconds`. */
const at = (seconds: number) => new Date(T0 + seconds * 1000)
const MIN = 60

/** Base simulée : les trois opérations utilisées, rien d'autre. */
let rows: Row[]

function fakeFindFirst({ where }: FindFirstArgs) {
  const open = rows
    .filter((row) => row.userId === where.userId && row.lastBeatAt.getTime() >= where.lastBeatAt.gte.getTime())
    .sort((a, b) => b.lastBeatAt.getTime() - a.lastBeatAt.getTime())[0]
  return open ? { id: open.id, lastBeatAt: new Date(open.lastBeatAt) } : null
}

function fakeCreate({ data }: CreateArgs) {
  const row: Row = { id: `visit-${rows.length + 1}`, visibleSeconds: 0, activeSeconds: 0, gameSeconds: 0, ...data }
  rows.push(row)
  return { ...row }
}

function fakeUpdateMany({ where, data }: UpdateManyArgs) {
  const matching = rows.filter(
    (row) => row.id === where.id && row.lastBeatAt.getTime() === where.lastBeatAt.getTime()
  )
  for (const row of matching) {
    row.lastBeatAt = data.lastBeatAt
    row.visibleSeconds += data.visibleSeconds.increment
    row.activeSeconds += data.activeSeconds.increment
    row.gameSeconds += data.gameSeconds.increment
  }
  return { count: matching.length }
}

/** Battement d'un compte à l'instant T0 + `seconds` (actif, hors partie, PC par défaut). */
const beat = (seconds: number, extra: { active?: boolean; inGame?: boolean; userId?: string } = {}) =>
  recordAccountBeat(extra.userId ?? 'u1', {
    active: extra.active ?? true,
    inGame: extra.inGame ?? false,
    device: 'pc',
    now: at(seconds),
  })

beforeEach(() => {
  vi.resetAllMocks()
  rows = []
  visitMock.findFirst.mockImplementation(async (args: FindFirstArgs) => fakeFindFirst(args))
  visitMock.create.mockImplementation(async (args: CreateArgs) => fakeCreate(args))
  visitMock.updateMany.mockImplementation(async (args: UpdateManyArgs) => fakeUpdateMany(args))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('decideBeat — décision pure', () => {
  const open = (secondsAgo: number, now = at(0)) => ({
    id: 'v1',
    lastBeatAt: new Date(now.getTime() - secondsAgo * 1000),
  })

  it('aucune visite ouverte : création', () => {
    expect(decideBeat(null, at(0))).toEqual({ kind: 'create' })
  })

  it('dernier battement il y a 60 s : 60 s créditées', () => {
    expect(decideBeat(open(60), at(0))).toEqual({ kind: 'credit', seconds: 60 })
  })

  it('battement perdu (120 s) : toléré, 120 s créditées', () => {
    expect(decideBeat(open(120), at(0))).toEqual({ kind: 'credit', seconds: 120 })
  })

  it('150 s pile : encore crédité ; une milliseconde de plus : pause, rien', () => {
    expect(decideBeat(open(150), at(0))).toEqual({ kind: 'credit', seconds: 150 })
    const justOver = { id: 'v1', lastBeatAt: new Date(T0 - MAX_BEAT_CREDIT_MS - 1) }
    expect(decideBeat(justOver, at(0))).toEqual({ kind: 'credit', seconds: 0 })
  })

  it('pause de 10 min : même visite, pause non créditée', () => {
    expect(decideBeat(open(10 * MIN), at(0))).toEqual({ kind: 'credit', seconds: 0 })
  })

  it('30 min pile : même visite ; une milliseconde de plus : nouvelle visite', () => {
    expect(decideBeat(open(30 * MIN), at(0))).toEqual({ kind: 'credit', seconds: 0 })
    const justOver = { id: 'v1', lastBeatAt: new Date(T0 - VISIT_IDLE_GAP_MS - 1) }
    expect(decideBeat(justOver, at(0))).toEqual({ kind: 'create' })
  })

  it('écart arrondi à la seconde', () => {
    const lastBeatAt = at(0)
    expect(decideBeat({ id: 'v1', lastBeatAt }, new Date(T0 + 59_600))).toEqual({ kind: 'credit', seconds: 60 })
    expect(decideBeat({ id: 'v1', lastBeatAt }, new Date(T0 + 30_400))).toEqual({ kind: 'credit', seconds: 30 })
  })

  it('écart nul ou négatif (battement concurrent déjà écrit) : rien', () => {
    expect(decideBeat(open(0), at(0))).toEqual({ kind: 'credit', seconds: 0 })
    expect(decideBeat(open(-5), at(0))).toEqual({ kind: 'credit', seconds: 0 })
  })

  it('date illisible : nouvelle visite plutôt qu’un crédit faux', () => {
    expect(decideBeat({ id: 'v1', lastBeatAt: new Date(Number.NaN) }, at(0))).toEqual({ kind: 'create' })
  })
})

describe('recordAccountBeat — requêtes', () => {
  it('cherche la visite ouverte la plus récente du compte, battement dans les 30 min', async () => {
    await beat(0)
    expect(visitMock.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', lastBeatAt: { gte: new Date(T0 - VISIT_IDLE_GAP_MS) } },
      orderBy: { lastBeatAt: 'desc' },
      select: { id: true, lastBeatAt: true },
    })
  })

  it('premier battement : visite créée à crédit nul, appareil du premier battement', async () => {
    await beat(0)
    expect(visitMock.create).toHaveBeenCalledWith({
      data: { userId: 'u1', startedAt: at(0), lastBeatAt: at(0), device: 'pc' },
    })
    expect(visitMock.updateMany).not.toHaveBeenCalled()
    expect(rows[0]).toMatchObject({ visibleSeconds: 0, activeSeconds: 0, gameSeconds: 0 })
  })

  it('appareil non reconnu : null, jamais « unknown »', async () => {
    await recordAccountBeat('u1', { active: true, inGame: false, device: 'unknown', now: at(0) })
    expect(visitMock.create.mock.calls[0][0].data.device).toBeNull()
  })

  it('battement suivant : compare-and-swap sur la valeur lue, crédit ventilé', async () => {
    await beat(0)
    await beat(60, { active: true, inGame: false })
    expect(visitMock.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', lastBeatAt: at(0) },
      data: {
        lastBeatAt: at(60),
        visibleSeconds: { increment: 60 },
        activeSeconds: { increment: 60 },
        gameSeconds: { increment: 0 },
      },
    })
  })

  it('l’appareil ne change pas en cours de visite (pas écrit au crédit)', async () => {
    await beat(0)
    await recordAccountBeat('u1', { active: true, inGame: false, device: 'mobile', now: at(60) })
    expect(visitMock.updateMany.mock.calls[0][0].data).not.toHaveProperty('device')
    expect(rows[0].device).toBe('pc')
  })

  it('ne lève jamais : lecture en échec', async () => {
    visitMock.findFirst.mockRejectedValue(new Error('base verrouillée'))
    await expect(beat(0)).resolves.toBeUndefined()
    expect(visitMock.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('ne lève jamais : compte supprimé entre-temps (clé étrangère)', async () => {
    visitMock.create.mockRejectedValue(new Error('Foreign key constraint failed'))
    await expect(beat(0)).resolves.toBeUndefined()
  })

  it('ne lève jamais : écriture du crédit en échec', async () => {
    await beat(0)
    visitMock.updateMany.mockRejectedValue(new Error('base verrouillée'))
    await expect(beat(60)).resolves.toBeUndefined()
  })
})

describe('recordAccountBeat — scénarios', () => {
  it('un onglet, une minute : 60 s par minute, une seule visite', async () => {
    for (let s = 0; s <= 5 * MIN; s += MIN) await beat(s)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ startedAt: at(0), lastBeatAt: at(5 * MIN), visibleSeconds: 5 * MIN })
  })

  it('deux onglets décalés de 30 s : 60 s créditées par minute, pas 120', async () => {
    // Onglet A à 0, 60, 120… ; onglet B à 30, 90, 150…
    for (let s = 0; s <= 10 * MIN; s += 30) await beat(s)
    expect(rows).toHaveLength(1)
    expect(rows[0].visibleSeconds).toBe(10 * MIN)
  })

  it('deux appareils du même compte : une seule visite', async () => {
    await recordAccountBeat('u1', { active: true, inGame: false, device: 'pc', now: at(0) })
    await recordAccountBeat('u1', { active: true, inGame: false, device: 'mobile', now: at(20) })
    await recordAccountBeat('u1', { active: true, inGame: false, device: 'pc', now: at(60) })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ visibleSeconds: 60, device: 'pc' })
  })

  it('onglet caché 10 min : même visite, temps caché non crédité', async () => {
    await beat(0)
    await beat(MIN)
    // Caché : aucun battement pendant 10 min.
    await beat(11 * MIN)
    await beat(12 * MIN)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ visibleSeconds: 2 * MIN, lastBeatAt: at(12 * MIN) })
  })

  it('reprise après 31 min : nouvelle visite, l’ancienne garde sa fin', async () => {
    await beat(0)
    await beat(MIN)
    await beat(MIN + 31 * MIN)
    await beat(2 * MIN + 31 * MIN)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ startedAt: at(0), lastBeatAt: at(MIN), visibleSeconds: MIN })
    expect(rows[1]).toMatchObject({ startedAt: at(32 * MIN), visibleSeconds: MIN })
  })

  it('battement perdu : l’intervalle de 2 min reste crédité', async () => {
    await beat(0)
    await beat(MIN)
    await beat(3 * MIN)
    expect(rows[0].visibleSeconds).toBe(3 * MIN)
  })

  it('temps actif et en partie : sous-ensembles du temps visible', async () => {
    await beat(0)
    await beat(60, { active: true, inGame: true })
    await beat(120, { active: false, inGame: true })
    await beat(180, { active: true, inGame: false })
    await beat(240, { active: false, inGame: false })
    expect(rows[0]).toMatchObject({ visibleSeconds: 240, activeSeconds: 120, gameSeconds: 120 })
  })

  it('les comptes ne se mélangent pas', async () => {
    await beat(0, { userId: 'u1' })
    await beat(30, { userId: 'u2' })
    await beat(60, { userId: 'u1' })
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.userId === 'u1')?.visibleSeconds).toBe(60)
    expect(rows.find((row) => row.userId === 'u2')?.visibleSeconds).toBe(0)
  })
})

describe('recordAccountBeat — concurrence', () => {
  /** Les deux lectures ont lieu AVANT la première écriture, quel que soit l'ordonnancement. */
  function readBothBeforeWriting() {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    visitMock.findFirst.mockImplementation(async (args: FindFirstArgs) => {
      const snapshot = fakeFindFirst(args)
      reads += 1
      if (reads === 2) release()
      await barrier
      return snapshot
    })
  }

  it('deux battements lisent la même visite : un seul crédit, l’autre trouve count = 0', async () => {
    await beat(0)
    readBothBeforeWriting()
    await Promise.all([beat(60), beat(60)])

    expect(visitMock.updateMany).toHaveBeenCalledTimes(2)
    const counts = await Promise.all(visitMock.updateMany.mock.results.map((result) => result.value))
    expect(counts.map((result: { count: number }) => result.count).sort()).toEqual([0, 1])
    expect(rows[0]).toMatchObject({ visibleSeconds: 60, lastBeatAt: at(60) })
  })

  it('battement lu après un autre plus récent : aucune écriture, lastBeatAt ne recule pas', async () => {
    await beat(0)
    await beat(60)
    visitMock.updateMany.mockClear()
    // Requête partie plus tôt (now = 59 s), traitée après celle de 60 s.
    await beat(59)
    expect(visitMock.updateMany).not.toHaveBeenCalled()
    expect(rows[0]).toMatchObject({ visibleSeconds: 60, lastBeatAt: at(60) })
  })

  it('deux premiers battements simultanés : deux visites (fusionnées à la lecture), sans erreur', async () => {
    readBothBeforeWriting()
    await Promise.all([beat(0), beat(0)])
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.visibleSeconds === 0)).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })
})
