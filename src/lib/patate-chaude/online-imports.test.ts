import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les banques de défis des quatre langues ne partent jamais dans le navigateur avec la partie en
 * ligne : seul le serveur les lit (server-bank.ts, importé par server-adapter.ts). L'écran du
 * téléphone, la TV et l'enveloppe partagée n'importent que des modules sans contenu.
 */

const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url))
const SERVER_ONLY = /patate-chaude\/(?:server-adapter|server-bank|online-adapter|online-launch|data\/)/

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, visit)
    else if (/\.(ts|tsx)$/.test(name)) visit(full)
  }
}

function specifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2])
}

describe('patate-chaude en ligne : rien de serveur côté client', () => {
  it.each([
    'components/online/PatateChaudeOnline.tsx',
    'components/tv/TvPatateChaude.tsx',
    'lib/patate-chaude/online-shared.ts',
    'app/[locale]/games/patate-chaude/components/fuse-ticker.ts',
  ])('%s n’importe ni adaptateur, ni lanceur, ni banque', (rel) => {
    const offenders = specifiers(join(SRC_DIR, rel)).filter((spec) => SERVER_ONLY.test(spec) || /server-bank|\.\/data\//.test(spec))
    expect(offenders).toEqual([])
  })

  it('la banque serveur n’est lue que par l’adaptateur serveur', () => {
    const readers: string[] = []
    walk(SRC_DIR, (file) => {
      if (specifiers(file).some((spec) => /server-bank$/.test(spec))) readers.push(relative(SRC_DIR, file).split(sep).join('/'))
    })
    expect(readers.sort()).toEqual(['lib/patate-chaude/server-adapter.test.ts', 'lib/patate-chaude/server-adapter.ts'])
  })
})
