import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { describe, expect, it } from 'vitest'

// Le Dockerfile installe par `npm ci` : c'est le lock, pas package.json, qui
// décide de ce qui tourne en prod. Ces tests le lisent tel quel, sans npm ni
// réseau.
const ROOT = process.cwd()
const readJson = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))

type LockEntry = {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}
type LockPackages = Record<string, LockEntry>

type Semver = {
  satisfies(version: string, range: string, loose?: boolean): boolean
  validRange(range: string, loose?: boolean): string | null
  minVersion(range: string): { version: string } | null
}
// Pas une dépendance directe : celui que npm remonte à la racine (eslint,
// sharp, typescript-eslint en dépendent).
const semver = createRequire(path.join(ROOT, 'package.json'))('semver') as Semver

const pkg = readJson('package.json')
const packages: LockPackages = readJson('package-lock.json').packages

const nameOf = (key: string) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)
const parentOf = (key: string) => {
  const cut = key.lastIndexOf('/node_modules/')
  return cut === -1 ? '' : key.slice(0, cut)
}

/** Résolution à la Node depuis `dir` : son node_modules, puis ceux des dossiers parents. */
function resolveFrom(entries: LockPackages, dir: string, name: string): string | null {
  for (let d = dir; ; d = parentOf(d)) {
    const key = `${d ? `${d}/` : ''}node_modules/${name}`
    if (entries[key]) return key
    if (!d) return null
  }
}

/**
 * Dépendances paires que `npm ci` sans --legacy-peer-deps refuserait : un pair
 * obligatoire absent, ou un pair (même optionnel) présent dans une version hors
 * de la plage demandée.
 */
function unmetPeers(entries: LockPackages): string[] {
  const problems: string[] = []
  for (const [key, entry] of Object.entries(entries)) {
    if (!key) continue
    for (const [name, range] of Object.entries(entry.peerDependencies ?? {})) {
      // Une étiquette (« insiders », « beta ») n'est pas une plage : npm ne la
      // vérifie pas, semver la jugerait toujours insatisfaite.
      if (semver.validRange(range, true) === null) continue
      const at = resolveFrom(entries, parentOf(key), name)
      if (!at) {
        if (!entry.peerDependenciesMeta?.[name]?.optional) problems.push(`${key} : ${name}@${range} absent`)
        continue
      }
      const version = entries[at].version ?? ''
      if (!semver.satisfies(version, range, true)) problems.push(`${key} : ${name}@${range}, le lock a ${version}`)
    }
  }
  return problems
}

// Versions touchées par les avis que l'audit npm du 25/10/2026 a fait corriger
// (plages des avis GitHub). Le lock ne doit plus en contenir aucune.
const VULNERABLE = new Map<string, string>([
  ['next', '<15.5.28'],
  ['sharp', '<0.35.5'],
  ['postcss', '<8.5.23'],
  ['nanoid', '<3.3.18'],
  ['source-map-js', '>=1.0.0 <1.2.2'],
  ['js-yaml', '>=4.0.0 <4.3.2'],
  ['brace-expansion', '<1.1.21 || >=2.0.0 <2.1.7'],
  ['@humanfs/node', '<0.16.8'],
  ['esbuild', '>=0.27.3 <0.28.1'],
  ['vite', '>=7.0.0 <7.3.7'],
  ['postcss-selector-parser', '>=6.1.0 <6.1.3'],
])
// Reste assumé : next 15.5 épingle postcss 8.4.31 pour son build CSS, qui ne
// lit que les feuilles du dépôt. Seule une override ou next 16 l'en sortirait.
const ACCEPTED = new Set(['node_modules/next/node_modules/postcss'])

describe('package-lock.json', () => {
  it('suit package.json (sinon `npm ci` refuse le lock, avec ou sans drapeau)', () => {
    expect(packages[''].dependencies).toEqual(pkg.dependencies)
    expect(packages[''].devDependencies).toEqual(pkg.devDependencies)
  })

  it('satisfait chaque dépendance paire : `npm ci` passe aussi sans --legacy-peer-deps', () => {
    expect(unmetPeers(packages)).toEqual([])
  })

  it('repère un pair hors plage et lit le node_modules imbriqué avant la racine (garde du test lui-même)', () => {
    const lock: LockPackages = {
      '': {},
      'node_modules/vite': {
        version: '7.3.7',
        peerDependencies: { '@types/node': '^20.19.0 || >=22.12.0', yaml: '^2.4.2' },
        peerDependenciesMeta: { '@types/node': { optional: true }, yaml: { optional: true } },
      },
      'node_modules/@types/node': { version: '20.17.19' },
      'node_modules/yaml': { version: '1.10.3' },
      'node_modules/next-intl': { version: '4.13.0' },
      'node_modules/next-intl/node_modules/@swc/core': {
        version: '1.15.41',
        peerDependencies: { '@swc/helpers': '>=0.5.17' },
        peerDependenciesMeta: { '@swc/helpers': { optional: true } },
      },
      'node_modules/@swc/helpers': { version: '0.5.15' },
      'node_modules/next-intl/node_modules/@swc/helpers': { version: '0.5.23' },
      'node_modules/tailwindcss-animate': { peerDependencies: { tailwindcss: 'insiders' } },
      'node_modules/tailwindcss': { version: '3.3.0' },
    }
    expect(unmetPeers(lock)).toEqual([
      'node_modules/vite : @types/node@^20.19.0 || >=22.12.0, le lock a 20.17.19',
      'node_modules/vite : yaml@^2.4.2, le lock a 1.10.3',
    ])
  })

  it("ne contient plus aucune version touchée par les avis corrigés", () => {
    const hits = Object.entries(packages)
      .filter(([key]) => key && !ACCEPTED.has(key))
      .filter(([key, entry]) => {
        const range = VULNERABLE.get(nameOf(key))
        return range !== undefined && semver.satisfies(entry.version ?? '', range, true)
      })
      .map(([key, entry]) => `${key}@${entry.version}`)
    expect(hits).toEqual([])
  })

  it("package.json n'admet pas un Next antérieur au correctif", () => {
    const min = semver.minVersion(pkg.dependencies.next)?.version ?? ''
    expect(semver.satisfies(min, VULNERABLE.get('next') ?? '', true)).toBe(false)
  })
})
