import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  computeFreePct,
  DISK_FREE_MIN_PCT,
  diskProbeDirs,
  isDiskCritical,
  measureDiskHealth,
} from '@/lib/disk-health'

describe('computeFreePct', () => {
  it('rend la part DISPONIBLE (bavail), pas la part libre réservée à root', () => {
    expect(computeFreePct({ blocks: 1000, bavail: 210 })).toBe(21)
  })

  it('arrondit vers le bas : 4,9 % libre ne s’affiche jamais 5 %', () => {
    expect(computeFreePct({ blocks: 1000, bavail: 49 })).toBe(4)
    expect(computeFreePct({ blocks: 1000, bavail: 50 })).toBe(5)
  })

  it('accepte les bigint de statfs({ bigint: true })', () => {
    // BigInt() et non un littéral `n` : la cible TypeScript du projet est ES2017.
    expect(computeFreePct({ blocks: BigInt(20_000_000), bavail: BigInt(4_200_000) })).toBe(21)
  })

  it('plafonne à 100 et rend null quand les compteurs n’ont pas de sens', () => {
    expect(computeFreePct({ blocks: 10, bavail: 20 })).toBe(100)
    expect(computeFreePct({ blocks: 0, bavail: 0 })).toBeNull()
    expect(computeFreePct({ blocks: 100, bavail: -1 })).toBeNull()
    expect(computeFreePct({ blocks: Number.NaN, bavail: 1 })).toBeNull()
  })
})

describe('isDiskCritical', () => {
  it('strictement sous le seuil : à 5 % pile la sonde reste verte', () => {
    expect(DISK_FREE_MIN_PCT).toBe(5)
    expect(isDiskCritical(5)).toBe(false)
    expect(isDiskCritical(4)).toBe(true)
    expect(isDiskCritical(0)).toBe(true)
    expect(isDiskCritical(100)).toBe(false)
  })

  it('accepte un autre seuil', () => {
    expect(isDiskCritical(9, 10)).toBe(true)
    expect(isDiskCritical(10, 10)).toBe(false)
  })
})

describe('diskProbeDirs', () => {
  // path.resolve : les attentes valent sur Windows (C:\app) comme sur Linux.
  const cwd = path.resolve('/app')

  it('mesure le répertoire de la base d’abord, le cwd en repli', () => {
    expect(diskProbeDirs('file:/app/prisma/prod.db', cwd)).toEqual([path.resolve('/app/prisma'), cwd])
  })

  it('ignore les paramètres de connexion ajoutés par src/lib/prisma.ts', () => {
    expect(diskProbeDirs('file:/app/prisma/prod.db?connection_limit=1&socket_timeout=15', cwd)).toEqual([
      path.resolve('/app/prisma'),
      cwd,
    ])
  })

  it('résout une URL relative contre le cwd', () => {
    expect(diskProbeDirs('file:./prisma/dev.db', cwd)).toEqual([path.resolve(cwd, 'prisma'), cwd])
  })

  it('sans URL, ou pour un autre schéma : le cwd seul', () => {
    expect(diskProbeDirs(undefined, cwd)).toEqual([cwd])
    expect(diskProbeDirs('', cwd)).toEqual([cwd])
    expect(diskProbeDirs('file:', cwd)).toEqual([cwd])
    expect(diskProbeDirs('postgresql://u:p@h/db', cwd)).toEqual([cwd])
  })

  it('ne répète pas le cwd quand la base y est', () => {
    expect(diskProbeDirs('file:/app/prod.db', cwd)).toEqual([cwd])
  })
})

describe('measureDiskHealth', () => {
  it('mesure le premier répertoire qui répond', async () => {
    const statfs = vi.fn(async (dir: string) => {
      if (dir === '/absent') throw new Error('ENOENT')
      return { blocks: 100, bavail: 30 }
    })
    await expect(measureDiskHealth(['/absent', '/app'], statfs)).resolves.toEqual({ freePct: 30 })
    expect(statfs).toHaveBeenCalledTimes(2)
  })

  it('passe au repli quand les compteurs sont inutilisables', async () => {
    const statfs = vi.fn(async (dir: string) =>
      dir === '/exotique' ? { blocks: 0, bavail: 0 } : { blocks: 100, bavail: 7 }
    )
    await expect(measureDiskHealth(['/exotique', '/app'], statfs)).resolves.toEqual({ freePct: 7 })
  })

  it('rend null, sans lever, si aucun répertoire ne répond', async () => {
    const statfs = vi.fn(async () => {
      throw new Error('ENOSYS')
    })
    await expect(measureDiskHealth(['/a', '/b'], statfs)).resolves.toBeNull()
    await expect(measureDiskHealth([], statfs)).resolves.toBeNull()
  })

  it('mesure réellement le disque du dépôt (fs.statfs de Node)', async () => {
    const disk = await measureDiskHealth([process.cwd()])
    expect(disk).not.toBeNull()
    expect(disk!.freePct).toBeGreaterThanOrEqual(0)
    expect(disk!.freePct).toBeLessThanOrEqual(100)
  })
})
