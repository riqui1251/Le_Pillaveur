import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AbstractIntlMessages } from 'next-intl'
import { GAME_IDS, coreMessages, gameMessages, supervisionMessages, tvMessages } from './messages-slices'

/**
 * Couverture des tranches de messages, route par route.
 *
 * Le layout de langue ne fournit plus que le SOCLE du catalogue aux
 * composants clients ; les layouts de jeu, de supervision et de TV ajoutent
 * leur tranche (src/i18n/messages-slices.ts). Un namespace absent de la
 * tranche ne plante pas en production : next-intl affiche la clé brute au
 * joueur (« games.purple.bets.red » au milieu du plateau) et se contente d'un
 * console.error. Personne ne le verrait avant un joueur.
 *
 * D'où ce relevé STATIQUE : pour chaque page de src/app/[locale], on suit les
 * imports (relatifs et « @/… », .ts/.tsx, imports dynamiques compris), on
 * note chaque `useTranslations('…')` rencontré dans un fichier rendu côté
 * client — un fichier « use client » ou tout ce qu'il importe — et on vérifie
 * que le namespace existe dans le catalogue effectif du layout le plus proche
 * (socle, jeu, supervision ou TV). Les fichiers serveur sont traversés (ils
 * rendent des composants clients) mais leurs propres appels ne comptent pas :
 * `useTranslations` y lit le catalogue complet via getMessages().
 *
 * « Existe dans la tranche » veut dire : le MÊME nœud que dans le catalogue.
 * Les tranches ne copient rien (messages-slices.ts partage les sous-arbres
 * par référence) ; un nœud neuf est donc un nœud PARTIEL — `games.bluff`
 * réduit à `lobby` sur la page de Purple —, où `t('game.title')` afficherait
 * la clé brute alors que le chemin du namespace, lui, existe.
 *
 * Un namespace dynamique (`games.${gameId}.tutorial`) vaut pour le jeu de la
 * page, ou pour tous les jeux hors page de jeu — et doit se concrétiser sur
 * au moins un jeu, sinon le gabarit ne lit rien de connu. Un lecteur du
 * catalogue entier (useMessages) ou un namespace illisible doit être justifié
 * dans LECTEURS_ADMIS.
 */

const SRC_DIR = resolve(fileURLToPath(new URL('../', import.meta.url)))
const APP_DIR = join(SRC_DIR, 'app', '[locale]')
const CATALOGUE: AbstractIntlMessages = JSON.parse(
  readFileSync(join(SRC_DIR, '..', 'messages', 'fr.json'), 'utf8')
)

/**
 * Fichiers (chemin depuis src/) qui lisent le catalogue ENTIER ou un
 * namespace qu'on ne peut pas lire statiquement, et pourquoi ce n'est pas une
 * clé manquante en puissance. Le test échoue si une entrée ne sert plus.
 */
const LECTEURS_ADMIS: Record<string, string> = {
  'components/i18n/ClientMessages.tsx':
    'lit les messages du fournisseur parent pour y AJOUTER une tranche — il fournit, il ne consomme pas',
}

/** Marqueurs des lectures qu'on ne peut pas ramener à un namespace. */
const CATALOGUE_ENTIER = '<catalogue entier : useMessages()>'
const NAMESPACE_RACINE = '<namespace racine : useTranslations()>'
const JOKER = '*'

const SPECIAL_FILES = ['layout.tsx', 'error.tsx', 'not-found.tsx', 'loading.tsx', 'template.tsx']

// ---------------------------------------------------------------------------
// Tranche fournie par le layout le plus proche
// ---------------------------------------------------------------------------

type SliceRef = { kind: 'core' } | { kind: 'game'; gameId: string } | { kind: 'supervision' } | { kind: 'tv' }

/** La tranche que déclare un layout (via ClientMessages ou un provider posé à la main), ou null. */
function sliceDeclaredIn(layoutFile: string): SliceRef | null {
  const source = stripComments(readFileSync(layoutFile, 'utf8'))
  if (/\btv(?:Slice|Messages)\(/.test(source)) return { kind: 'tv' }
  if (/\bsupervision(?:Slice|Messages)\(/.test(source)) return { kind: 'supervision' }
  const game = source.match(/\bgame(?:Slice|Messages)\(\s*[^,()]+?(?:\([^)]*\))?\s*,\s*(?:'([^']+)'|"([^"]+)"|(\w+))\s*\)/)
  if (!game) return null
  const literal = game[1] ?? game[2]
  if (literal) return { kind: 'game', gameId: literal }
  const constant = source.match(new RegExp(`const\\s+${game[3]}\\s*=\\s*['"]([^'"]+)['"]`))
  if (!constant) {
    throw new Error(`${relative(SRC_DIR, layoutFile)} : identifiant de jeu « ${game[3]} » introuvable dans le fichier`)
  }
  return { kind: 'game', gameId: constant[1] }
}

/** Remonte de `dir` jusqu'à la racine [locale] : le premier layout qui déclare une tranche l'emporte. */
function sliceForDir(dir: string): SliceRef {
  let current = dir
  for (;;) {
    const layout = join(current, 'layout.tsx')
    if (existsSync(layout)) {
      const declared = sliceDeclaredIn(layout)
      if (declared) return declared
    }
    if (current === APP_DIR) return { kind: 'core' }
    current = dirname(current)
  }
}

function messagesOf(ref: SliceRef): AbstractIntlMessages {
  switch (ref.kind) {
    case 'core':
      return coreMessages(CATALOGUE)
    case 'game':
      return gameMessages(CATALOGUE, ref.gameId)
    case 'supervision':
      return supervisionMessages(CATALOGUE)
    case 'tv':
      return tvMessages(CATALOGUE)
  }
}

function describeSlice(ref: SliceRef): string {
  return ref.kind === 'game' ? `jeu ${ref.gameId}` : ref.kind === 'core' ? 'socle' : ref.kind
}

// ---------------------------------------------------------------------------
// Lecture statique des modules
// ---------------------------------------------------------------------------

type Module = {
  /** « use client » en tête : tout ce qu'il importe est rendu côté client aussi. */
  client: boolean
  imports: string[]
  namespaces: string[]
}

const modules = new Map<string, Module>()

/** Retire commentaires de bloc et lignes de commentaire : du code commenté n'est pas une lecture. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function moduleOf(file: string): Module {
  const cached = modules.get(file)
  if (cached) return cached

  const source = stripComments(readFileSync(file, 'utf8'))
  const client = /^\s*['"]use client['"]/.test(source)

  // Les imports de types n'existent pas à l'exécution : on ne les suit pas.
  const runtime = source
    .replace(/^\s*import\s+type\b[\s\S]*?from\s*['"][^'"]+['"]/gm, '')
    .replace(/^\s*export\s+type\b[\s\S]*?from\s*['"][^'"]+['"]/gm, '')
  const imports: string[] = []
  for (const match of runtime.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(file, match[1])
    if (resolved && !imports.includes(resolved)) imports.push(resolved)
  }

  const namespaces: string[] = []
  for (const match of source.matchAll(/\buseTranslations\s*\(([^)]*)\)/g)) {
    namespaces.push(namespaceOf(match[1].trim()))
  }
  if (/\buseMessages\s*\(/.test(source)) namespaces.push(CATALOGUE_ENTIER)

  const parsed = { client, imports, namespaces }
  modules.set(file, parsed)
  return parsed
}

function namespaceOf(argument: string): string {
  if (argument === '') return NAMESPACE_RACINE
  const literal = argument.match(/^(['"])(.*)\1$/)
  if (literal) return literal[2]
  const template = argument.match(/^`(.*)`$/)
  if (template) return template[1].replace(/\$\{[^}]*\}/g, JOKER)
  return `<namespace illisible : useTranslations(${argument})>`
}

/** Alias « @/ » et chemins relatifs, vers un .ts/.tsx (ou index) existant ; le reste (paquets, css…) est ignoré. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC_DIR, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Namespaces lus côté client depuis `entry`, avec les fichiers qui les lisent. */
function namespacesReachableFrom(entry: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  const seen = new Set<string>()
  const walk = (file: string, renderedOnClient: boolean) => {
    const info = moduleOf(file)
    const onClient = renderedOnClient || info.client
    const key = `${onClient ? 'client' : 'server'}:${file}`
    if (seen.has(key)) return
    seen.add(key)
    if (onClient) {
      for (const namespace of info.namespaces) {
        const readers = found.get(namespace) ?? new Set<string>()
        readers.add(relative(SRC_DIR, file).replace(/\\/g, '/'))
        found.set(namespace, readers)
      }
    }
    for (const dependency of info.imports) walk(dependency, onClient)
  }
  walk(entry, false)
  return found
}

// ---------------------------------------------------------------------------
// Vérification
// ---------------------------------------------------------------------------

/** Le nœud atteint par `path`, ou undefined s'il n'existe pas. */
function nodeAt(node: AbstractIntlMessages, path: string): unknown {
  let current: unknown = node
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null || !(part in current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function inCatalogue(path: string): boolean {
  return nodeAt(CATALOGUE, path) !== undefined
}

/**
 * Vrai si la tranche porte `path` EN ENTIER : le nœud même du catalogue, par
 * référence. Un nœud neuf est un nœud partiel (`pick` du lobby des autres
 * jeux) ou un nœud recomposé (`games` lui-même, `mergeMessages`) : dans les
 * deux cas, une clé peut y manquer alors que le chemin existe.
 */
function sliceHasWhole(slice: AbstractIntlMessages, path: string): boolean {
  return nodeAt(slice, path) === nodeAt(CATALOGUE, path)
}

const lecteursRencontres = new Set<string>()

function problemsFor(found: Map<string, Set<string>>, ref: SliceRef): string[] {
  const slice = messagesOf(ref)
  const problems: string[] = []
  for (const [namespace, readers] of found) {
    const who = [...readers].sort().join(', ')

    if (namespace.startsWith('<')) {
      for (const reader of readers) {
        if (reader in LECTEURS_ADMIS) lecteursRencontres.add(reader)
        else problems.push(`${namespace} — ${reader} : à justifier dans LECTEURS_ADMIS`)
      }
      continue
    }

    if (namespace.includes(JOKER)) {
      const ids = ref.kind === 'game' ? [ref.gameId] : GAME_IDS
      const concretes = ids.map((id) => namespace.replaceAll(JOKER, id)).filter(inCatalogue)
      if (concretes.length === 0) {
        problems.push(`${namespace} ne se concrétise sur aucun jeu du catalogue — lu par ${who}`)
      }
      for (const concrete of concretes) {
        if (!sliceHasWhole(slice, concrete)) {
          problems.push(`${concrete} (via ${namespace}) absent ou partiel dans la tranche « ${describeSlice(ref)} » — lu par ${who}`)
        }
      }
      continue
    }

    if (!inCatalogue(namespace)) {
      problems.push(`${namespace} n'existe dans aucun catalogue — lu par ${who}`)
    } else if (!sliceHasWhole(slice, namespace)) {
      problems.push(`${namespace} absent ou partiel dans la tranche « ${describeSlice(ref)} » — lu par ${who}`)
    }
  }
  return problems.sort()
}

// ---------------------------------------------------------------------------
// Les entrées : chaque page, chaque layout et fichier spécial de [locale]
// ---------------------------------------------------------------------------

type Entry = { label: string; file: string; slice: SliceRef }

function routeOf(dir: string): string {
  const rel = relative(APP_DIR, dir).replace(/\\/g, '/')
  return rel === '' ? '/' : `/${rel}`
}

function collectEntries(dir: string, out: Entry[]): void {
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name)
    if (statSync(file).isDirectory()) {
      collectEntries(file, out)
      continue
    }
    if (name === 'page.tsx') {
      out.push({ label: routeOf(dir), file, slice: sliceForDir(dir) })
    } else if (SPECIAL_FILES.includes(name)) {
      // Un layout voit la tranche des layouts AU-DESSUS de lui (la sienne ne
      // couvre que ses enfants) ; erreur, chargement et 404 d'un segment sont
      // rendus sous le layout du segment, donc dans sa tranche.
      const slice = name === 'layout.tsx' && dir !== APP_DIR ? sliceForDir(dirname(dir)) : sliceForDir(dir)
      out.push({ label: `${routeOf(dir)} (${name})`, file, slice })
    }
  }
}

const entries: Entry[] = []
collectEntries(APP_DIR, entries)

describe('couverture des tranches de messages', () => {
  it('le relevé lit bien quelque chose : hub et page de jeu ont leurs namespaces', () => {
    // Garde-fou contre un relevé vide qui rendrait tout le reste vert par vacuité.
    const hub = namespacesReachableFrom(join(APP_DIR, 'jeux', 'page.tsx'))
    expect([...hub.keys()]).toEqual(expect.arrayContaining(['hub', 'common', 'games.catalog']))
    const purple = namespacesReachableFrom(join(APP_DIR, 'games', 'purple', 'page.tsx'))
    expect([...purple.keys()]).toEqual(expect.arrayContaining(['games.purple', 'onlineLobby']))
    expect(entries.length).toBeGreaterThan(40)
  })

  it('chaque page de jeu reçoit la tranche de SON jeu', () => {
    const gamePages = entries.filter(
      (entry) => entry.file.endsWith('page.tsx') && /^\/games\/[^/]+$/.test(entry.label)
    )
    const wrong = gamePages
      .filter((entry) => entry.slice.kind !== 'game' || `/games/${entry.slice.gameId}` !== entry.label)
      .map((entry) => `${entry.label} → ${describeSlice(entry.slice)}`)
    expect(gamePages.length).toBe(GAME_IDS.length)
    expect(wrong).toEqual([])
  })

  it('la supervision et la TV reçoivent leur tranche', () => {
    const kinds = Object.fromEntries(entries.map((entry) => [entry.label, entry.slice.kind]))
    expect(kinds['/supervision']).toBe('supervision')
    expect(kinds['/supervision/comptes/[userId]']).toBe('supervision')
    expect(kinds['/tv']).toBe('tv')
    expect(kinds['/tv/[code]']).toBe('tv')
    expect(kinds['/jeux']).toBe('core')
    expect(kinds['/regles/[gameId]']).toBe('core')
  })

  it('un nœud partiel de la tranche est signalé, pas le sous-arbre partagé qu’il contient', () => {
    // Sur la page de Purple, `games.bluff` n'est que son `lobby` (via pick) :
    // le chemin existe, `t('game.title')` afficherait pourtant la clé brute.
    const purple: SliceRef = { kind: 'game', gameId: 'purple' }
    const reads = (namespace: string) => new Map([[namespace, new Set(['x.tsx'])]])
    expect(problemsFor(reads('games.bluff'), purple)).toHaveLength(1)
    expect(problemsFor(reads('games.bluff.lobby'), purple)).toEqual([])
    expect(problemsFor(reads('games.purple'), purple)).toEqual([])
    expect(problemsFor(reads('hub'), purple)).toEqual([])
    // Un gabarit qui ne se concrétise sur aucun jeu ne passe plus en silence
    // (sur une page de jeu, seul le jeu de la page compte).
    expect(problemsFor(reads(`games.${JOKER}.nexistepas`), purple)).toHaveLength(1)
    expect(problemsFor(reads(`games.${JOKER}.tutorial`), purple)).toEqual([])
  })

  for (const entry of entries) {
    it(`${entry.label} — tranche « ${describeSlice(entry.slice)} »`, () => {
      expect(problemsFor(namespacesReachableFrom(entry.file), entry.slice)).toEqual([])
    })
  }

  it('aucune exception de LECTEURS_ADMIS n’est périmée', () => {
    const perimees = Object.keys(LECTEURS_ADMIS).filter((reader) => !lecteursRencontres.has(reader))
    expect(perimees).toEqual([])
  })
})
