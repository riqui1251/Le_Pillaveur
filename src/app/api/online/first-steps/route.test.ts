import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/first-steps — carte « Premiers pas » de la page Compte.
 *
 * Compte requis (401 sinon). XP, préférences et statut d'invité viennent de
 * la session ; la base n'est interrogée que pour le succès première partie
 * (et seulement sans XP) et pour la partie à plusieurs humains (journal
 * d'abord, résultats classés en repli). Vraie route, base et session simulées.
 *
 * Récompense : liste bouclée avant PIONEER_DEADLINE → la route pose elle-même
 * la ligne CosmeticGrant `frame:pionnier` (une fois, P2002 toléré) ; une
 * ligne déjà là reste rendue `granted`, date passée ou pas. L'horloge est
 * figée (seul Date est simulé : les promesses de la route tournent normalement).
 */

const { db, currentUserMock } = vi.hoisted(() => ({
  db: {
    achievement: { findUnique: vi.fn() },
    onlineGameSessionPlayer: { findFirst: vi.fn() },
    onlineMatchResult: { findFirst: vi.fn() },
    cosmeticGrant: { findUnique: vi.fn(), create: vi.fn() },
  },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { GET } from './route'
import { PIONEER_DEADLINE, PIONEER_DEADLINE_MS } from '@/lib/online/first-steps'

/** Le jour de ce chantier : bien avant la date limite. */
const TODAY = new Date('2026-10-08T21:00:00+02:00')

type Session = {
  id: string
  onlineXp: number
  onlinePreferences: { color: string; icon?: string; specialEffect?: string | null; iconFrame?: string | null }
  isGuest?: boolean
}

const member = (over: Partial<Session> = {}): Session => ({
  id: 'compte-1',
  onlineXp: 0,
  onlinePreferences: { color: 'bg-amber-500', icon: 'chope', specialEffect: null, iconFrame: null },
  isGuest: false,
  ...over,
})

const read = async () => {
  const res = await GET()
  return { status: res.status, body: await res.json() }
}

const doneOf = (body: { steps: { id: string; done: boolean }[] }) =>
  Object.fromEntries(body.steps.map((s) => [s.id, s.done]))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  currentUserMock.mockResolvedValue(member())
  db.achievement.findUnique.mockResolvedValue(null)
  db.onlineGameSessionPlayer.findFirst.mockResolvedValue(null)
  db.onlineMatchResult.findFirst.mockResolvedValue(null)
  db.cosmeticGrant.findUnique.mockResolvedValue(null)
  db.cosmeticGrant.create.mockResolvedValue({ id: 'grant-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/online/first-steps', () => {
  it('sans compte : 401 auth_required, aucune requête en base', async () => {
    currentUserMock.mockResolvedValue(null)

    const { status, body } = await read()

    expect(status).toBe(401)
    expect(body.error).toBe('auth_required')
    expect(db.achievement.findUnique).not.toHaveBeenCalled()
    expect(db.onlineGameSessionPlayer.findFirst).not.toHaveBeenCalled()
    expect(db.onlineMatchResult.findFirst).not.toHaveBeenCalled()
    expect(db.cosmeticGrant.findUnique).not.toHaveBeenCalled()
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })

  it('invité tout neuf : six étapes, aucune faite, 300 XP jusqu’au niveau 3', async () => {
    currentUserMock.mockResolvedValue(member({ isGuest: true }))

    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual([
      'play',
      'icon',
      'effect',
      'save',
      'friends',
      'level3',
    ])
    expect(body).toMatchObject({ completed: 0, total: 6, xp: 0, xpToLevel3: 300 })
  })

  it('compte enregistré : pas d’étape « sauvegarder »', async () => {
    const { body } = await read()

    expect(body.total).toBe(5)
    expect(doneOf(body)).not.toHaveProperty('save')
  })

  it('préférences et XP de la session : icône, effet, niveau 3', async () => {
    currentUserMock.mockResolvedValue(
      member({
        onlineXp: 320,
        onlinePreferences: { color: 'bg-amber-500', icon: 'trogne-1', specialEffect: 'emerald', iconFrame: null },
      })
    )

    const { body } = await read()

    expect(doneOf(body)).toMatchObject({ play: true, icon: true, effect: true, level3: true })
    expect(body.xpToLevel3).toBe(0)
  })

  it('avec de l’XP : le succès première partie n’est pas demandé', async () => {
    currentUserMock.mockResolvedValue(member({ onlineXp: 10 }))

    const { body } = await read()

    expect(doneOf(body).play).toBe(true)
    expect(db.achievement.findUnique).not.toHaveBeenCalled()
  })

  it('sans XP mais avec le succès first_game : « jouer » est fait', async () => {
    db.achievement.findUnique.mockResolvedValue({ id: 'succes-1' })

    const { body } = await read()

    expect(doneOf(body).play).toBe(true)
    expect(db.achievement.findUnique).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'compte-1', type: 'first_game' } },
      select: { id: true },
    })
  })

  it('partie journalisée à plusieurs humains : « potes » fait, sans consulter les résultats', async () => {
    db.onlineGameSessionPlayer.findFirst.mockResolvedValue({ id: 'siege-1' })

    const { body } = await read()

    expect(doneOf(body).friends).toBe(true)
    expect(db.onlineGameSessionPlayer.findFirst).toHaveBeenCalledWith({
      where: { userId: 'compte-1', session: { humanCount: { gte: 2 } } },
      select: { id: true },
    })
    expect(db.onlineMatchResult.findFirst).not.toHaveBeenCalled()
  })

  it('rien au journal mais un résultat classé à plusieurs (avant le journal) : « potes » fait', async () => {
    db.onlineMatchResult.findFirst.mockResolvedValue({ id: 'resultat-1' })

    const { body } = await read()

    expect(doneOf(body).friends).toBe(true)
    expect(db.onlineMatchResult.findFirst).toHaveBeenCalledWith({
      where: { userId: 'compte-1', humanCount: { gte: 2 } },
      select: { id: true },
    })
  })

  it('aucune partie à plusieurs : « potes » à faire', async () => {
    const { body } = await read()

    expect(doneOf(body).friends).toBe(false)
  })

  it('panne de base : 500 server_error en JSON, jamais une page HTML', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onlineGameSessionPlayer.findFirst.mockRejectedValue(new Error('base indisponible'))

    const { status, body } = await read()

    expect(status).toBe(500)
    expect(body.error).toBe('server_error')
    consoleError.mockRestore()
  })

  it('liste incomplète : récompense promise, rien d’écrit', async () => {
    const { body } = await read()

    expect(body.reward).toEqual({ key: 'frame:pionnier', granted: false, deadline: PIONEER_DEADLINE })
    expect(db.cosmeticGrant.findUnique).toHaveBeenCalledWith({
      where: { userId_cosmeticKey: { userId: 'compte-1', cosmeticKey: 'frame:pionnier' } },
      select: { id: true },
    })
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/online/first-steps — cadre Pionnier', () => {
  /** Compte enregistré qui a tout fait : partie, icône, effet, niveau 3, partie à plusieurs. */
  const veteran = (over: Partial<Session> = {}) =>
    member({
      onlineXp: 320,
      onlinePreferences: { color: 'bg-amber-500', icon: 'trogne-1', specialEffect: 'emerald', iconFrame: null },
      ...over,
    })

  beforeEach(() => {
    currentUserMock.mockResolvedValue(veteran())
    db.onlineGameSessionPlayer.findFirst.mockResolvedValue({ id: 'siege-1' })
  })

  it('tout fait avant la date limite : la ligne est posée, sans auteur, et la réponse le dit', async () => {
    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body).toMatchObject({ completed: 5, total: 5 })
    expect(body.reward).toEqual({ key: 'frame:pionnier', granted: true, deadline: PIONEER_DEADLINE })
    expect(db.cosmeticGrant.create).toHaveBeenCalledTimes(1)
    expect(db.cosmeticGrant.create).toHaveBeenCalledWith({
      data: { userId: 'compte-1', cosmeticKey: 'frame:pionnier', grantedById: null },
      select: { id: true },
    })
  })

  it('dernière milliseconde de mars (heure de Paris) : encore gagné', async () => {
    vi.setSystemTime(PIONEER_DEADLINE_MS - 1)

    const { body } = await read()

    expect(body.reward.granted).toBe(true)
    expect(db.cosmeticGrant.create).toHaveBeenCalledTimes(1)
  })

  it('tout fait APRÈS la date limite : plus rien n’est accordé', async () => {
    vi.setSystemTime(PIONEER_DEADLINE_MS)

    const { body } = await read()

    expect(body.completed).toBe(body.total)
    expect(body.reward).toEqual({ key: 'frame:pionnier', granted: false, deadline: PIONEER_DEADLINE })
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })

  it('idempotent : ligne déjà là → granted, aucune écriture', async () => {
    db.cosmeticGrant.findUnique.mockResolvedValue({ id: 'grant-1' })

    const { body } = await read()

    expect(body.reward.granted).toBe(true)
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })

  it('jamais retiré : ligne déjà là, date passée et une étape défaite → toujours granted', async () => {
    vi.setSystemTime(new Date('2027-06-01T12:00:00+02:00'))
    db.cosmeticGrant.findUnique.mockResolvedValue({ id: 'grant-1' })
    currentUserMock.mockResolvedValue(
      veteran({ onlinePreferences: { color: 'bg-amber-500', icon: 'trogne-1', specialEffect: null, iconFrame: 'pionnier' } })
    )

    const { body } = await read()

    expect(body.completed).toBeLessThan(body.total)
    expect(body.reward.granted).toBe(true)
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })

  it('course entre deux onglets : la contrainte unique (P2002) vaut réussite', async () => {
    db.cosmeticGrant.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    const { status, body } = await read()

    expect(status).toBe(200)
    expect(body.reward.granted).toBe(true)
  })

  it('autre panne à l’écriture : 500 server_error, pas de faux « débloqué »', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.cosmeticGrant.create.mockRejectedValue(new Error('disque plein'))

    const { status, body } = await read()

    expect(status).toBe(500)
    expect(body.error).toBe('server_error')
    consoleError.mockRestore()
  })

  it('invité qui a tout fait sauf sauvegarder : pas encore', async () => {
    currentUserMock.mockResolvedValue(veteran({ isGuest: true }))

    const { body } = await read()

    expect(body).toMatchObject({ completed: 5, total: 6 })
    expect(body.reward.granted).toBe(false)
    expect(db.cosmeticGrant.create).not.toHaveBeenCalled()
  })

  it('le même invité, une fois son compte sauvegardé : gagné — sa sauvegarde était l’étape qui manquait', async () => {
    currentUserMock.mockResolvedValue(veteran({ isGuest: false }))

    const { body } = await read()

    expect(body.reward.granted).toBe(true)
  })
})
