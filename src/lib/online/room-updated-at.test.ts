import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'

/**
 * La date de fin d'une partie ABANDONNÉE est la dernière écriture de sa salle
 * (`OnlineRoom.updatedAt`, voir closeGameSessionsOfPurgedRooms). Cela ne tient
 * que si Prisma réécrit ce champ à CHAQUE écriture d'état — y compris le
 * compare-and-swap en `updateMany` des routes action, briefing-ack et de la
 * relance (online-room-launch.ts). On le vérifie ici sur une vraie base
 * SQLite JETABLE (fichier temporaire, jamais la base du projet), réduite à la
 * seule table OnlineRoom — sans clé étrangère, inutile pour cette écriture.
 */

/** Type de colonne SQLite pour un scalaire Prisma (la base ne vérifie rien de plus). */
function sqliteType(type: string): string {
  switch (type) {
    case 'Int':
      return 'INTEGER'
    case 'DateTime':
      return 'DATETIME'
    case 'Boolean':
      return 'BOOLEAN'
    default:
      return 'TEXT'
  }
}

let dir: string
let client: PrismaClient

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'lp-room-updated-at-'))
  const file = path.join(dir, 'room.db')
  // Un fichier vide est une base SQLite valide.
  writeFileSync(file, '')
  client = new PrismaClient({ datasourceUrl: `file:${file}` })

  // Colonnes tirées du schéma généré : le test suit le modèle sans le recopier.
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'OnlineRoom')
  const columns = (model?.fields ?? [])
    .filter((f) => f.kind === 'scalar')
    .map((f) => `"${f.name}" ${sqliteType(f.type)}${f.isId ? ' PRIMARY KEY' : ''}`)
  await client.$executeRawUnsafe(`CREATE TABLE "OnlineRoom" (${columns.join(', ')})`)
})

afterAll(async () => {
  await client?.$disconnect()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Windows peut garder le fichier verrouillé un instant : le dossier est temporaire.
  }
})

describe('OnlineRoom.updatedAt', () => {
  it('bouge sur un updateMany (compare-and-swap d’un coup joué)', async () => {
    const room = await client.onlineRoom.create({
      data: { code: 'ABC234', hostUserId: 'u1', status: 'playing', stateVersion: 1 },
      select: { id: true, updatedAt: true },
    })

    // Écart garanti au-delà de la milliseconde (précision du stockage).
    await new Promise((resolve) => setTimeout(resolve, 20))

    const { count } = await client.onlineRoom.updateMany({
      where: { id: room.id, stateVersion: 1 },
      data: { stateVersion: 2, gameStateJson: '{}' },
    })
    expect(count).toBe(1)

    const after = await client.onlineRoom.findUniqueOrThrow({
      where: { id: room.id },
      select: { updatedAt: true },
    })
    expect(after.updatedAt.getTime()).toBeGreaterThan(room.updatedAt.getTime())
  })

  it('reste déclaré @updatedAt dans le schéma', () => {
    const room = Prisma.dmmf.datamodel.models.find((m) => m.name === 'OnlineRoom')
    expect(room?.fields.find((f) => f.name === 'updatedAt')?.isUpdatedAt).toBe(true)
  })
})

/** Tous les fichiers .ts / .tsx sous `root`, tests exclus. */
function sourceFiles(root: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const full = path.join(root, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('écritures de salle en SQL brut', () => {
  it('aucune : un UPDATE brut ne toucherait pas updatedAt (@updatedAt est appliqué par le client)', () => {
    const srcRoot = path.resolve(__dirname, '../..')
    const files = sourceFiles(srcRoot)
    // Garde-fou contre un parcours vide, qui ferait passer le test pour rien.
    expect(files.some((file) => file.endsWith('online-room.ts'))).toBe(true)
    const offenders = files.filter((file) =>
      /UPDATE\s+[`"']?OnlineRoom[`"']?\s/i.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
