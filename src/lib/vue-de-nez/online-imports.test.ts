import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Garde d'imports de la version EN LIGNE : les réponses vivent dans la banque
 * (data/questions.ts et les textes) que seul le serveur lit. Le composant du
 * téléphone et celui de la TV reçoivent la question par la vue ; s'ils
 * atteignaient la banque, même de loin, les réponses partiraient dans leur
 * morceau JavaScript. On suit donc TOUT le graphe d'imports qui part au
 * navigateur depuis ces deux fichiers (les `import type` s'effacent à la
 * compilation et ne comptent pas).
 */

const SRC = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const ENTRIES = ['components/online/VueDeNezOnline.tsx', 'components/tv/TvVueDeNez.tsx']
const FORBIDDEN = [
  /^lib\/vue-de-nez\/data\/(?:index|questions|fr|en|es|it)\.tsx?$/,
  /^lib\/vue-de-nez\/server-adapter\.ts$/,
  /^lib\/vue-de-nez\/online-adapter\.ts$/,
  /^lib\/vue-de-nez\/load\.ts$/,
  /^lib\/online\/game-adapters\.ts$/,
]
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(fromFile), spec)
  else return null
  for (const suffix of CANDIDATES) {
    const candidate = base + suffix
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Spécificateurs qui partent dans le bundle : ni `import type`, ni des accolades toutes `type`. */
function valueSpecifiers(source: string): string[] {
  const specs: string[] = []
  const statement =
    /^[ \t]*(?:import|export)\s+(type\s+)?((?:(?!\n[ \t]*(?:import|export)\b)[^'"])*?)\s*from\s*['"]([^'"]+)['"]/gm
  for (const m of source.matchAll(statement)) {
    if (m[1]) continue
    const braces = m[2].trim().match(/^\{([\s\S]*)\}$/)
    const names = braces ? braces[1].split(',').map((s) => s.trim()).filter(Boolean) : []
    if (names.length > 0 && names.every((name) => name.startsWith('type '))) continue
    specs.push(m[3])
  }
  for (const m of source.matchAll(/^[ \t]*import\s+['"]([^'"]+)['"]/gm)) specs.push(m[1])
  for (const m of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1])
  return specs
}

function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const stack = [join(SRC, entry)]
  while (stack.length > 0) {
    const file = stack.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of valueSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(file, spec)
      if (target && !seen.has(target)) stack.push(target)
    }
  }
  return [...seen].map((file) => relative(SRC, file).split(sep).join('/'))
}

describe('À Vue de Nez en ligne : les réponses restent au serveur', () => {
  it.each(ENTRIES)('%s n’atteint ni la banque, ni le chargeur local, ni l’adaptateur serveur', (entry) => {
    expect(existsSync(join(SRC, entry)), entry).toBe(true)
    const reached = reachableFrom(entry)
    const offenders = reached.filter((file) => FORBIDDEN.some((rx) => rx.test(file)))
    expect(offenders).toEqual([])
    // Le relevé a bien suivi le graphe : la vue partagée est atteinte.
    expect(reached).toContain('lib/vue-de-nez/online-view.ts')
  })

  it('le relevé ignore les imports de type et suit les autres', () => {
    const source = [
      "import type { A } from './a'",
      "import { type B, type C } from './b'",
      "import { type D, e } from './c'",
      "export type { F } from './f'",
      "import g from '@/g'",
      "import './h'",
      "const i = () => import('./i')",
    ].join('\n')
    expect(valueSpecifiers(source)).toEqual(['./c', '@/g', './h', './i'])
  })
})
