import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les routes /api/auth marchent pour la plupart SANS session (connexion,
 * inscription, invité, Google, déconnexion) : SameSite=Lax ne les protège pas,
 * et un formulaire posté depuis une page tierce connectait la victime au
 * compte de l'attaquant ou effaçait le cookie d'un invité. Seul withApiRoute
 * refuse ces écritures venues d'un autre site : toute méthode d'écriture
 * exportée doit passer par lui, et l'exemption ne vaut que pour le retour
 * form_post d'Apple.
 */

const AUTH_DIR = fileURLToPath(new URL('.', import.meta.url))
const WRITE_METHOD = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(POST|PUT|PATCH|DELETE)\b(\s*=\s*\w+)?/g

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

describe('routes d’écriture /api/auth', () => {
  const sources = routeFiles(AUTH_DIR).map((file) => ({
    file: relative(AUTH_DIR, file),
    source: readFileSync(file, 'utf8'),
  }))

  it('les routes sont bien trouvées', () => {
    expect(sources.map(({ file }) => file)).toEqual(expect.arrayContaining(['login/route.ts', 'logout/route.ts']))
  })

  it('chaque POST / PUT / PATCH / DELETE passe par withApiRoute', () => {
    const bare = sources.flatMap(({ file, source }) =>
      [...source.matchAll(WRITE_METHOD)]
        .filter((match) => match[2]?.replace(/[\s=]/g, '') !== 'withApiRoute')
        .map((match) => `${file} ${match[1]}`)
    )
    expect(bare).toEqual([])
  })

  it('seul le retour d’Apple accepte une écriture venue d’un autre site', () => {
    const exempted = sources.filter(({ source }) => /allowCrossSite\s*:\s*true/.test(source)).map(({ file }) => file)
    expect(exempted).toEqual([join('oauth', '[provider]', 'callback', 'route.ts')])
  })
})
