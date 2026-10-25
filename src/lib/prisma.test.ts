import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryHook = (input: { args: unknown; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>
type Extension = { query: { user: Record<string, QueryHook> } }

const captured = vi.hoisted(() => ({ extension: null as Extension | null }))

// Client factice : on ne vérifie que le branchement de l'extension, sans base.
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    $extends(extension: Extension) {
      captured.extension = extension
      return this
    }
  },
}))

async function loadPrismaModule() {
  vi.resetModules()
  delete (globalThis as { prisma?: unknown }).prisma
  return import('./prisma')
}

describe('withDisplayNameKeys', () => {
  beforeEach(() => {
    captured.extension = null
  })

  it('pose la clé de displayName et celle du pseudo en ligne (name) à la création', async () => {
    const { withDisplayNameKeys } = await loadPrismaModule()
    expect(withDisplayNameKeys('create', { data: { displayName: ' Élodie ', name: 'ＥＬＯ', isGuest: true } })).toEqual({
      data: {
        displayName: ' Élodie ',
        name: 'ＥＬＯ',
        isGuest: true,
        displayNameKey: 'élodie',
        onlineDisplayNameKey: 'elo',
      },
    })
  })

  it('suit les formes { set } et null d’une mise à jour, et laisse les autres écritures', async () => {
    const { withDisplayNameKeys } = await loadPrismaModule()
    expect(withDisplayNameKeys('update', { where: { id: 'u' }, data: { name: { set: 'Kеvin' } } })).toEqual({
      where: { id: 'u' },
      data: { name: { set: 'Kеvin' }, onlineDisplayNameKey: 'kevin' },
    })
    expect(withDisplayNameKeys('update', { where: { id: 'u' }, data: { name: null } })).toEqual({
      where: { id: 'u' },
      data: { name: null, onlineDisplayNameKey: null },
    })
    expect(withDisplayNameKeys('update', { where: { id: 'u' }, data: { lastSeenAt: 1 } })).toEqual({
      where: { id: 'u' },
      data: { lastSeenAt: 1 },
    })
  })

  it('couvre upsert, createMany (tableau) et updateMany, pas les lectures', async () => {
    const { withDisplayNameKeys } = await loadPrismaModule()
    expect(
      withDisplayNameKeys('upsert', { where: { id: 'u' }, create: { displayName: 'Zoé' }, update: { displayName: 'ZOÉ' } })
    ).toEqual({
      where: { id: 'u' },
      create: { displayName: 'Zoé', displayNameKey: 'zoé' },
      update: { displayName: 'ZOÉ', displayNameKey: 'zoé' },
    })
    expect(withDisplayNameKeys('createMany', { data: [{ displayName: 'A' }, { displayName: 'B' }] })).toEqual({
      data: [
        { displayName: 'A', displayNameKey: 'a' },
        { displayName: 'B', displayNameKey: 'b' },
      ],
    })
    expect(withDisplayNameKeys('updateMany', { where: {}, data: { displayName: 'X' } })).toEqual({
      where: {},
      data: { displayName: 'X', displayNameKey: 'x' },
    })
    const read = { where: { displayName: 'Élodie' } }
    expect(withDisplayNameKeys('findFirst', read)).toBe(read)
  })
})

describe('client exporté', () => {
  it('passe chaque écriture de User par withDisplayNameKeys', async () => {
    await loadPrismaModule()
    const hooks = captured.extension?.query.user ?? {}
    expect(Object.keys(hooks).sort()).toEqual(
      ['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert'].sort()
    )

    const query = vi.fn(async (args: unknown) => args)
    await hooks.update({ args: { where: { id: 'u' }, data: { displayName: 'Élodie' } }, query })
    expect(query).toHaveBeenCalledWith({ where: { id: 'u' }, data: { displayName: 'Élodie', displayNameKey: 'élodie' } })

    await hooks.upsert({ args: { where: { id: 'u' }, create: { name: 'Kéké' }, update: {} }, query })
    expect(query).toHaveBeenLastCalledWith({
      where: { id: 'u' },
      create: { name: 'Kéké', onlineDisplayNameKey: 'kéké' },
      update: {},
    })
  })
})
