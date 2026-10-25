import { createRequire } from 'node:module'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDisplayNameTaken } from './display-name'
import { displayNameKey } from './name-moderation/confusables'
import {
  findSharedDisplayNameKeys,
  planDisplayNameKeyUpdates,
} from '../../scripts/backfill-display-name-keys.mjs'

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): { all(...values: unknown[]): unknown[]; run(...values: unknown[]): unknown }
}

// Vrai moteur SQLite (node:sqlite, sans ICU comme celui de Prisma) : tout le
// constat tient à ce que LOWER() n'y replie que l'ASCII.
function loadSqlite(): (new (path: string) => SqliteDatabase) | null {
  try {
    return (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase })
      .DatabaseSync
  } catch {
    return null
  }
}

const DatabaseSync = loadSqlite()
const sqlite = vi.hoisted(() => ({ db: null as SqliteDatabase | null }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values)
      return sqlite.db!.prepare(query.sql).all(...query.values)
    },
  },
}))

type Row = {
  id: string
  displayName: string
  name?: string | null
  /** false : ligne d'avant la migration, sans clé (pseudo non ASCII). */
  keyed?: boolean
  isGuest?: boolean
  email?: string | null
}

function addUser({ id, displayName, name = null, keyed = true, isGuest = true, email = null }: Row) {
  sqlite.db!.prepare(
    `INSERT INTO "User" (id, displayName, name, displayNameKey, onlineDisplayNameKey, passwordHash, email, isGuest)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    displayName,
    name,
    keyed ? displayNameKey(displayName) : null,
    keyed && name !== null ? displayNameKey(name) : null,
    email,
    isGuest ? 1 : 0
  )
}

describe.skipIf(!DatabaseSync)('isDisplayNameTaken — SQLite réel', () => {
  beforeEach(() => {
    sqlite.db = new DatabaseSync!(':memory:')
    sqlite.db.exec(`CREATE TABLE "User" (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      name TEXT,
      displayNameKey TEXT,
      onlineDisplayNameKey TEXT,
      passwordHash TEXT NOT NULL DEFAULT '',
      email TEXT,
      isGuest INTEGER NOT NULL DEFAULT 0
    )`)
  })

  it('refuse le doublon exact d’« Élodie » et ses variantes de casse', async () => {
    addUser({ id: 'elodie', displayName: 'Élodie' })
    expect(await isDisplayNameTaken('Élodie')).toBe(true)
    expect(await isDisplayNameTaken('élodie')).toBe(true)
    expect(await isDisplayNameTaken(' ÉLODIE ')).toBe(true)
  })

  it('refuse les sosies visuels (homoglyphe, pleine chasse, invisible)', async () => {
    addUser({ id: 'kevin', displayName: 'Kevin' })
    expect(await isDisplayNameTaken('Kеvin')).toBe(true)
    expect(await isDisplayNameTaken('ｋｅｖｉｎ')).toBe(true)
    expect(await isDisplayNameTaken('Kev​in')).toBe(true)
  })

  it('compare aussi au pseudo en ligne (colonne name)', async () => {
    addUser({ id: 'k', displayName: 'Kevin', name: 'Kéké' })
    expect(await isDisplayNameTaken('KÉKÉ')).toBe(true)
  })

  it('laisse libre un pseudo différent, son propre pseudo et celui d’un fantôme legacy', async () => {
    addUser({ id: 'elodie', displayName: 'Élodie' })
    addUser({ id: 'ghost', displayName: 'Fantôme', isGuest: false })
    expect(await isDisplayNameTaken('Elodie')).toBe(false)
    expect(await isDisplayNameTaken('Personne')).toBe(false)
    expect(await isDisplayNameTaken('Élodie', 'elodie')).toBe(false)
    expect(await isDisplayNameTaken('Fantôme')).toBe(false)
  })

  it('ligne sans clé (avant le remplissage) : attrape au moins le doublon exact', async () => {
    addUser({ id: 'old', displayName: 'Élodie', name: 'Zoé', keyed: false })
    addUser({ id: 'old2', displayName: 'élise', keyed: false })
    expect(await isDisplayNameTaken('Élodie')).toBe(true)
    expect(await isDisplayNameTaken('Zoé')).toBe(true)
    expect(await isDisplayNameTaken('ÉLISE')).toBe(true)
  })
})

describe('scripts/backfill-display-name-keys.mjs', () => {
  const users = [
    { id: 'a', displayName: 'Élodie', name: null, displayNameKey: null, onlineDisplayNameKey: null },
    { id: 'b', displayName: 'Kevin', name: 'Kéké', displayNameKey: 'kevin', onlineDisplayNameKey: 'kéké' },
    { id: 'c', displayName: 'ÉLODIE', name: 'Élo', displayNameKey: 'ancienne', onlineDisplayNameKey: 'élo' },
    { id: 'd', displayName: 'K\u0435vin', name: null, displayNameKey: 'k\u0435vin', onlineDisplayNameKey: 'x' },
  ]

  it('ne réécrit que les clés manquantes ou périmées', () => {
    expect(planDisplayNameKeyUpdates(users)).toEqual([
      { id: 'a', data: { displayNameKey: 'élodie' } },
      { id: 'c', data: { displayNameKey: 'élodie' } },
      { id: 'd', data: { displayNameKey: 'kevin', onlineDisplayNameKey: null } },
    ])
  })

  it('signale les homonymes parmi les comptes actifs seulement', () => {
    expect(findSharedDisplayNameKeys(users, new Set(['a', 'b', 'c', 'd']))).toEqual([
      ['élodie', ['a', 'c']],
      ['kevin', ['b', 'd']],
    ])
    expect(findSharedDisplayNameKeys(users, new Set(['a', 'b']))).toEqual([])
  })
})
