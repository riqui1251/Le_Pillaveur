import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/first-steps — carte « Premiers pas » de la page Compte.
 *
 * Compte requis (401 sinon). XP, préférences et statut d'invité viennent de
 * la session ; la base n'est interrogée que pour le succès première partie
 * (et seulement sans XP) et pour la partie à plusieurs humains (journal
 * d'abord, résultats classés en repli). Vraie route, base et session simulées.
 */

const { db, currentUserMock } = vi.hoisted(() => ({
  db: {
    achievement: { findUnique: vi.fn() },
    onlineGameSessionPlayer: { findFirst: vi.fn() },
    onlineMatchResult: { findFirst: vi.fn() },
  },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { GET } from './route'

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
  currentUserMock.mockResolvedValue(member())
  db.achievement.findUnique.mockResolvedValue(null)
  db.onlineGameSessionPlayer.findFirst.mockResolvedValue(null)
  db.onlineMatchResult.findFirst.mockResolvedValue(null)
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
})
