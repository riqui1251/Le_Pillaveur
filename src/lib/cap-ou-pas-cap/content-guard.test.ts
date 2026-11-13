import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { capAlcoholWords, capStrayTokens } from './content-guard'

describe('lexique anti-alcool (cartes de test)', () => {
  it('français : attrape les mots entiers, accents et pluriels compris', () => {
    expect(capAlcoholWords('Vide ton verre cul sec, puis raconte ta dernière gorgée.', 'fr')).toEqual([
      'verre',
      'cul sec',
      'gorgée',
    ])
    expect(capAlcoholWords('Bières ou Vin ? Trinquez !', 'fr')).toEqual(['Bières', 'Vin', 'Trinquez'])
  })

  it('français : laisse passer les mots qui n’en parlent pas', () => {
    for (const text of [
      'Devine qui a fêté ses vingt ans en premier.',
      'Imite un pantin de bois pendant dix secondes.',
      'Montre ta dernière capture d’écran à {player}.',
      'Raconte ton pire souvenir de colonie de vacances.',
    ]) {
      expect(capAlcoholWords(text, 'fr'), text).toEqual([])
    }
  })

  it('anglais, espagnol, italien : chaque langue a son lexique', () => {
    expect(capAlcoholWords('Take a shot, then drink some water.', 'en')).toEqual(['shot', 'drink'])
    expect(capAlcoholWords('Show your latest screenshot, glasses on.', 'en')).toEqual([])
    expect(capAlcoholWords('Tómate un chupito o bebe agua.', 'es')).toEqual(['chupito', 'bebe'])
    expect(capAlcoholWords('Imita a un bebé y luego a Ron Weasley.', 'es')).toEqual([])
    expect(capAlcoholWords('Un ron con hielo.', 'es')).toEqual(['ron'])
    expect(capAlcoholWords('Bevi un sorso e alza il bicchiere.', 'it')).toEqual(['Bevi', 'sorso', 'bicchiere'])
    expect(capAlcoholWords('Imita un bambino che vince una scommessa.', 'it')).toEqual([])
  })
})

describe('jetons des textes (cartes de test)', () => {
  it('{player} est le seul jeton admis', () => {
    expect(capStrayTokens('Fais un compliment sincère à {player}, puis à {player} encore.')).toEqual([])
    expect(capStrayTokens('{name} imite {player}.')).toEqual(['{name}'])
    expect(capStrayTokens('Une accolade { orpheline')).toEqual(['{'])
    expect(capStrayTokens('{jugador} baila.')).toEqual(['{jugador}'])
  })
})

// ─── Accès à la banque ───────────────────────────────────────────────────────

const SRC_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const TEXTS = /^lib\/cap-ou-pas-cap\/data\/(?:fr|en|es|it)$/

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, visit)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) visit(full)
  }
}

describe('cap-ou-pas-cap : accès aux textes', () => {
  it('seul le chargeur par langue (et les tests) importent les textes : une langue par morceau côté client', () => {
    const offenders: string[] = []
    const readers = new Set<string>()
    walk(SRC_DIR, (file) => {
      const rel = relative(SRC_DIR, file).split(sep).join('/')
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2]
        // Cible résolue depuis src/ : le « ./data/fr » d'un autre jeu ne compte pas.
        const target = spec.startsWith('.') ? posix.join(posix.dirname(rel), spec) : spec.replace(/^@\//, '')
        if (!TEXTS.test(target.replace(/\.ts$/, ''))) continue
        const allowed =
          rel === 'lib/cap-ou-pas-cap/load.ts' ||
          rel.startsWith('lib/cap-ou-pas-cap/data/') ||
          /^lib\/cap-ou-pas-cap\/[^/]+\.test\.ts$/.test(rel)
        if (allowed) readers.add(rel)
        else offenders.push(`${rel} → ${spec}`)
      }
    })
    expect(offenders, offenders.join('\n')).toEqual([])
    // Le relevé a bien vu le chargeur : la garde ne passe pas à vide.
    expect([...readers]).toContain('lib/cap-ou-pas-cap/load.ts')
  })
})
