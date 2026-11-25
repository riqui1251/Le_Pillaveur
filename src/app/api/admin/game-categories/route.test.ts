import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/admin/game-categories — la vraie route et les vrais rôles ; session,
 * serveur de catalogue et journal simulés (les erreurs typées restent les
 * vraies). Lecture : admin+ ; écriture : super admin+, validée et journalisée.
 */

const { userMock, store, createMock, updateMock, toggleMock, moveMock, deleteMock, getMock, logMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  store: { value: [] as Array<{ id: string; names: { fr: string }; gameIds: string[] }> },
  createMock: vi.fn(),
  updateMock: vi.fn(),
  toggleMock: vi.fn(),
  moveMock: vi.fn(),
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/supervision-overview-server', () => ({ logStaffAction: logMock }))
vi.mock('@/lib/game-catalog-server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/game-catalog-server')>()
  return {
    ...original,
    getGameCategories: getMock,
    createGameCategory: createMock,
    updateGameCategory: updateMock,
    setGameInCategory: toggleMock,
    moveGameCategory: moveMock,
    deleteGameCategory: deleteMock,
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { DELETE, GET, PATCH, POST } from './route'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import { GAMES } from '@/lib/games'
import {
  GameCategoryInvalidError,
  GameCategoryLimitError,
  GameCategoryNotFoundError,
} from '@/lib/game-catalog-server'

const [A, B] = STAFF_TOGGLEABLE_GAME_IDS
const chaud = { id: 'chaud', names: { fr: 'Chaud' }, gameIds: [A] }
const calme = { id: 'calme', names: { fr: 'Calme' }, gameIds: [] }

const send = (method: 'POST' | 'PATCH' | 'DELETE', body: unknown) => {
  const handler = { POST, PATCH, DELETE }[method]
  return handler(
    new Request('http://test/api/admin/game-categories', {
      method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

const writers: Array<[string]> = [['superadmin'], ['fondateur']]
const nonWriters: Array<[string | null]> = [['admin'], ['moderator'], ['user'], [null]]

beforeEach(() => {
  vi.resetAllMocks()
  userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
  store.value = [chaud, calme]
  getMock.mockImplementation(async () => store.value)
  createMock.mockResolvedValue({ id: 'cat-1', names: { fr: 'Neuve' }, gameIds: [] })
  updateMock.mockResolvedValue({ category: { ...chaud, names: { fr: 'Renommée' }, gameIds: [A, B] }, changed: true })
  toggleMock.mockResolvedValue({ category: { ...chaud, gameIds: [A, B] }, changed: true })
  moveMock.mockResolvedValue({ categories: [calme, chaud], changed: true })
  deleteMock.mockResolvedValue(undefined)
  logMock.mockResolvedValue(undefined)
})

describe('GET /api/admin/game-categories', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])('%s : liste servie, forme { canEdit, categories }', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['canEdit', 'categories'])
    expect(body.categories).toEqual([chaud, calme])
  })

  it.each([['moderator'], ['user'], [null]])('%s : 403 codé', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
  })

  it('canEdit : faux pour un admin, vrai pour un super admin', async () => {
    userMock.mockResolvedValue({ id: 'staff', role: 'admin' })
    expect((await (await GET()).json()).canEdit).toBe(false)
    userMock.mockResolvedValue({ id: 'staff', role: 'superadmin' })
    expect((await (await GET()).json()).canEdit).toBe(true)
  })
})

describe('POST /api/admin/game-categories', () => {
  it.each(nonWriters)('%s : 403 sans rien écrire', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await send('POST', { names: { fr: 'Neuve' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(createMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each(writers)('%s : crée, journalise, répond comme le GET', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    store.value = [chaud, calme, { id: 'cat-1', names: { fr: 'Neuve' }, gameIds: [] }]

    const res = await send('POST', { names: { fr: 'Neuve', en: 'New' } })

    expect(res.status).toBe(200)
    expect(createMock).toHaveBeenCalledWith({ fr: 'Neuve', en: 'New' })
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith({ actorId: 'staff', action: 'site-setting', detail: 'Catégorie créée : Neuve' })
    const body = await res.json()
    expect(body.canEdit).toBe(true)
    expect(body.categories.map((c: { id: string }) => c.id)).toEqual(['chaud', 'calme', 'cat-1'])
  })

  it('corps sans names ou names mal typé : invalid_action 400', async () => {
    for (const body of [{}, { names: 'Neuve' }, { names: null }, { names: [] }, { nom: { fr: 'x' } }, null, []]) {
      const res = await send('POST', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')
    }
    expect(createMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('nom refusé par le serveur : invalid_action 400, rien de journalisé', async () => {
    createMock.mockRejectedValue(new GameCategoryInvalidError('names'))
    const res = await send('POST', { names: { fr: '' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_action')
    expect(logMock).not.toHaveBeenCalled()
  })

  it('limite atteinte : conflict 409', async () => {
    createMock.mockRejectedValue(new GameCategoryLimitError())
    const res = await send('POST', { names: { fr: 'De trop' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('conflict')
    expect(logMock).not.toHaveBeenCalled()
  })

  it('JSON illisible : invalid_json 400 ; corps trop gros : payload_too_large 413', async () => {
    const bad = await send('POST', '{pas du json')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('invalid_json')

    const big = await send('POST', JSON.stringify({ names: { fr: 'x' }, pad: 'x'.repeat(9000) }))
    expect(big.status).toBe(413)
    expect((await big.json()).error).toBe('payload_too_large')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('une panne d’écriture sort en server_error 500 JSON, sans journal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createMock.mockRejectedValue(new Error('locked'))
    const res = await send('POST', { names: { fr: 'X' } })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('server_error')
    expect(logMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/game-categories', () => {
  it.each(nonWriters)('%s : 403 sans rien écrire', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await send('PATCH', { id: 'chaud', move: 'up' })
    expect(res.status).toBe(403)
    expect(updateMock).not.toHaveBeenCalled()
    expect(toggleMock).not.toHaveBeenCalled()
    expect(moveMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each(writers)('%s : renomme, journalisé', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await send('PATCH', { id: 'chaud', names: { fr: 'Renommée' } })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith('chaud', { names: { fr: 'Renommée' } })
    expect(moveMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith({ actorId: 'staff', action: 'site-setting', detail: 'Catégorie renommée : Renommée' })
    expect(Object.keys(await res.json()).sort()).toEqual(['canEdit', 'categories'])
  })

  it('change les jeux, journal avec leur nombre', async () => {
    const res = await send('PATCH', { id: 'chaud', gameIds: [A, B] })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith('chaud', { gameIds: [A, B] })
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock.mock.calls[0][0].detail).toBe('Catégorie Renommée : jeux mis à jour (2)')
  })

  it('une liste de jeux vide est permise', async () => {
    updateMock.mockResolvedValue({ category: { ...chaud, gameIds: [] }, changed: true })
    const res = await send('PATCH', { id: 'chaud', gameIds: [] })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith('chaud', { gameIds: [] })
    expect(logMock.mock.calls[0][0].detail).toBe('Catégorie Chaud : jeux mis à jour (0)')
  })

  it('coche un jeu : setGameInCategory, journal avec le titre du jeu', async () => {
    const res = await send('PATCH', { id: 'chaud', gameId: B, on: true })

    expect(res.status).toBe(200)
    expect(toggleMock).toHaveBeenCalledWith('chaud', B, true)
    expect(updateMock).not.toHaveBeenCalled()
    expect(logMock.mock.calls[0][0].detail).toBe(`Catégorie Chaud : ${GAMES.find((g) => g.id === B)!.title} ajouté`)
  })

  it('décoche un jeu : journal « retiré »', async () => {
    toggleMock.mockResolvedValue({ category: chaud, changed: true })
    const res = await send('PATCH', { id: 'chaud', gameId: A, on: false })

    expect(res.status).toBe(200)
    expect(toggleMock).toHaveBeenCalledWith('chaud', A, false)
    expect(logMock.mock.calls[0][0].detail).toBe(`Catégorie Chaud : ${GAMES.find((g) => g.id === A)!.title} retiré`)
  })

  it('rien n’a changé : réponse 200 comme d’habitude, mais aucune ligne de journal', async () => {
    toggleMock.mockResolvedValue({ category: chaud, changed: false })
    updateMock.mockResolvedValue({ category: chaud, changed: false })
    moveMock.mockResolvedValue({ categories: [chaud, calme], changed: false })

    for (const body of [
      { id: 'chaud', gameId: A, on: true },
      { id: 'chaud', names: { fr: 'Chaud' } },
      { id: 'chaud', gameIds: [A] },
      { id: 'chaud', move: 'up' },
    ]) {
      const res = await send('PATCH', body)
      expect(res.status, JSON.stringify(body)).toBe(200)
      expect(Object.keys(await res.json()).sort()).toEqual(['canEdit', 'categories'])
    }
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each([
    ['up', 'vers le haut'],
    ['down', 'vers le bas'],
  ])('déplace %s, journalisé avec le nom de la catégorie', async (move, label) => {
    const res = await send('PATCH', { id: 'chaud', move })

    expect(res.status).toBe(200)
    expect(moveMock).toHaveBeenCalledWith('chaud', move)
    expect(updateMock).not.toHaveBeenCalled()
    expect(logMock.mock.calls[0][0].detail).toBe(`Catégorie déplacée : Chaud (${label})`)
  })

  it('exactement UNE des clés names / gameIds / move, sinon invalid_action 400', async () => {
    const bodies = [
      { id: 'chaud' },
      { id: 'chaud', names: { fr: 'X' }, gameIds: [] },
      { id: 'chaud', names: { fr: 'X' }, move: 'up' },
      { id: 'chaud', gameIds: [], move: 'up' },
      { id: 'chaud', names: { fr: 'X' }, gameIds: [], move: 'up' },
      { id: 'chaud', gameId: A, on: true, move: 'up' },
      { id: 'chaud', gameId: A, on: true, gameIds: [A] },
      { id: 'chaud', gameId: A, on: true, names: { fr: 'X' } },
    ]
    for (const body of bodies) {
      const res = await send('PATCH', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')
    }
    expect(updateMock).not.toHaveBeenCalled()
    expect(moveMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('valeurs mal typées ou id absent : invalid_action 400', async () => {
    const bodies = [
      { names: { fr: 'X' } },
      { id: 7, move: 'up' },
      { id: 'chaud', move: 'left' },
      { id: 'chaud', move: 1 },
      { id: 'chaud', move: null },
      { id: 'chaud', names: 'X' },
      { id: 'chaud', names: null },
      { id: 'chaud', names: [] },
      { id: 'chaud', gameIds: 'pmu' },
      { id: 'chaud', gameIds: [3] },
      { id: 'chaud', gameIds: null },
      { id: 'chaud', gameId: A },
      { id: 'chaud', on: true },
      { id: 'chaud', gameId: 3, on: true },
      { id: 'chaud', gameId: A, on: 'oui' },
      { id: 'chaud', gameId: A, on: null },
      null,
      [],
    ]
    for (const body of bodies) {
      const res = await send('PATCH', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')
    }
    expect(updateMock).not.toHaveBeenCalled()
    expect(toggleMock).not.toHaveBeenCalled()
    expect(moveMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('erreurs typées du serveur : invalide → invalid_action 400, introuvable → not_found 404', async () => {
    updateMock.mockRejectedValue(new GameCategoryInvalidError('gameIds'))
    const invalid = await send('PATCH', { id: 'chaud', gameIds: ['nope'] })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error).toBe('invalid_action')

    updateMock.mockRejectedValue(new GameCategoryNotFoundError('fantome'))
    const missing = await send('PATCH', { id: 'fantome', names: { fr: 'X' } })
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe('not_found')

    moveMock.mockRejectedValue(new GameCategoryNotFoundError('fantome'))
    const missingMove = await send('PATCH', { id: 'fantome', move: 'up' })
    expect(missingMove.status).toBe(404)

    toggleMock.mockRejectedValue(new GameCategoryInvalidError('gameIds'))
    const badGame = await send('PATCH', { id: 'chaud', gameId: 'nope', on: true })
    expect(badGame.status).toBe(400)
    expect((await badGame.json()).error).toBe('invalid_action')
    expect(logMock).not.toHaveBeenCalled()
  })

  it('JSON illisible : invalid_json 400 ; corps trop gros : payload_too_large 413', async () => {
    expect((await send('PATCH', '{pas du json')).status).toBe(400)
    const big = await send('PATCH', JSON.stringify({ id: 'chaud', move: 'up', pad: 'x'.repeat(9000) }))
    expect(big.status).toBe(413)
    expect(moveMock).not.toHaveBeenCalled()
  })

  it('une panne d’écriture sort en server_error 500 JSON, sans journal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    moveMock.mockRejectedValue(new Error('locked'))
    const res = await send('PATCH', { id: 'chaud', move: 'up' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('server_error')
    expect(logMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/game-categories', () => {
  it.each(nonWriters)('%s : 403 sans rien supprimer', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)
    const res = await send('DELETE', { id: 'chaud' })
    expect(res.status).toBe(403)
    expect(deleteMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it.each(writers)('%s : supprime, journal avec le nom lu AVANT la suppression', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })
    deleteMock.mockImplementation(async () => {
      store.value = store.value.filter((c) => c.id !== 'chaud')
    })

    const res = await send('DELETE', { id: 'chaud' })

    expect(res.status).toBe(200)
    expect(deleteMock).toHaveBeenCalledWith('chaud')
    expect(logMock).toHaveBeenCalledWith({ actorId: 'staff', action: 'site-setting', detail: 'Catégorie supprimée : Chaud' })
    expect((await res.json()).categories).toEqual([calme])
  })

  it('id absent ou mal typé : invalid_action 400', async () => {
    for (const body of [{}, { id: 3 }, { id: null }, null, []]) {
      const res = await send('DELETE', body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((await res.json()).error).toBe('invalid_action')
    }
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('catégorie introuvable : not_found 404, rien de journalisé', async () => {
    deleteMock.mockRejectedValue(new GameCategoryNotFoundError('fantome'))
    const res = await send('DELETE', { id: 'fantome' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
    expect(logMock).not.toHaveBeenCalled()
  })

  it('JSON illisible : invalid_json 400', async () => {
    const res = await send('DELETE', '{pas du json')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_json')
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('une panne d’écriture sort en server_error 500 JSON, sans journal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteMock.mockRejectedValue(new Error('locked'))
    const res = await send('DELETE', { id: 'chaud' })
    expect(res.status).toBe(500)
    expect(logMock).not.toHaveBeenCalled()
  })
})
