import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les écritures /api/admin (bans, grades, suppression de compte, fermeture
 * de table, réglages du site) passent toutes par withApiRoute, qui refuse
 * celles venues d'un autre site. Aucune n'est appelée par un tiers : pas
 * d'exemption allowCrossSite ici.
 */

const ADMIN_DIR = fileURLToPath(new URL('.', import.meta.url))
const WRITE_METHOD = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(POST|PUT|PATCH|DELETE)\b(\s*=\s*\w+)?/g

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

describe('routes d’écriture /api/admin', () => {
  const sources = routeFiles(ADMIN_DIR).map((file) => ({
    file: relative(ADMIN_DIR, file),
    source: readFileSync(file, 'utf8'),
  }))

  it('les routes sont bien trouvées', () => {
    expect(sources.map(({ file }) => file)).toEqual(
      expect.arrayContaining([join('users', 'ban', 'route.ts'), join('users', 'unban', 'route.ts')])
    )
  })

  it('chaque POST / PUT / PATCH / DELETE passe par withApiRoute', () => {
    const writes = sources.flatMap(({ file, source }) =>
      [...source.matchAll(WRITE_METHOD)].map((match) => ({
        name: `${file} ${match[1]}`,
        wrapped: match[2]?.replace(/[\s=]/g, '') === 'withApiRoute',
      }))
    )
    expect(writes.length).toBeGreaterThanOrEqual(13)
    expect(writes.filter((w) => !w.wrapped).map((w) => w.name)).toEqual([])
  })

  it('aucune n’accepte une écriture venue d’un autre site', () => {
    const exempted = sources.filter(({ source }) => /allowCrossSite/.test(source)).map(({ file }) => file)
    expect(exempted).toEqual([])
  })
})
