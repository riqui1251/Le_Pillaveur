import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DOIGT_MODES } from './engine'

/**
 * Chaque clé que lit l'arène existe dans les 4 langues : une clé absente ne
 * casse aucun autre test (messages-coverage ne vérifie que les espaces de
 * noms) et s'afficherait brute à l'écran. Et rien de ce qu'affiche le mode
 * Sans alcool ne parle d'alcool.
 *
 * Tant que les fragments ne sont pas fusionnés dans messages/*.json, la
 * tranche games.doigt-du-destin n'existe pas : le bloc est sauté, pas vert à vide.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
type Locale = (typeof LOCALES)[number]

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const COMPONENTS = join(SRC, 'app', '[locale]', 'games', 'doigt-du-destin', 'components')

function catalog(locale: Locale): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SRC, '..', 'messages', `${locale}.json`), 'utf8')) as Record<string, unknown>
}

function at(tree: unknown, path: string): unknown {
  let node = tree
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function strings(tree: unknown): string[] {
  if (typeof tree === 'string') return [tree]
  if (!tree || typeof tree !== 'object') return []
  return Object.values(tree as Record<string, unknown>).flatMap(strings)
}

/** Clés lues par les composants : `t('…')` (games.doigt-du-destin) et `tc('…')` (common). */
function keysRead(): { game: string[]; common: string[] } {
  const sources = readdirSync(COMPONENTS)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => readFileSync(join(COMPONENTS, name), 'utf8'))
    .join('\n')
  const literal = (fn: string) =>
    Array.from(sources.matchAll(new RegExp(`\\b${fn}\\(\\s*'([^']+)'`, 'g')), (match) => match[1])
  const templates = Array.from(sources.matchAll(/\bt\(\s*`([^`]*)`/g), (match) => match[1])
  const expanded = templates.flatMap((template) =>
    template.includes('${mode}') ? DOIGT_MODES.map((mode) => template.replace('${mode}', mode)) : [template]
  )
  return { game: Array.from(new Set([...literal('t'), ...expanded])).sort(), common: Array.from(new Set(literal('tc'))).sort() }
}

const ALCOHOL: Record<Locale, RegExp> = {
  fr: /\b(boi[st]|boire|boivent|buv\w*|gorg[ée]+s?|verres?|bi[èe]res?|vins?|alcools?|shots?|cul sec|trinqu\w*)\b/i,
  en: /\b(drinks?|drinking|drank|sips?|beers?|wine|alcohol|shots?|glass(es)?|booze)\b/i,
  es: /\b(beb\w*|tragos?|sorbos?|cervezas?|vino|alcohol|chupitos?|vasos?)\b/i,
  it: /\b(bev\w*|bere|sors[io]|birr[ae]|vino|alcol\w*|bicchier[ei]|shot)\b/i,
}

/** Textes communs aux deux ambiances (le reste a sa variante sous `soft`). */
const SHARED = [
  'title',
  'modesLabel',
  'modes',
  'arena',
  'tags',
  'hints.teams',
  'hints.order',
  'result.chosen',
  'result.teams',
  'result.teamsDetail',
  'result.order',
  'result.orderDetail',
  'result.nobody',
]

const hasSlice = at(catalog('fr'), 'games.doigt-du-destin') !== undefined

describe('clés lues par l’arène', () => {
  it('les composants lisent bien des clés (le relevé fonctionne)', () => {
    const { game, common } = keysRead()
    expect(game).toContain('title')
    expect(game).toContain('modes.survival')
    expect(game.some((key) => key.includes('$'))).toBe(false)
    expect(common).toEqual(['back', 'replay'])
  })
})

describe.skipIf(!hasSlice)('textes du Doigt du Destin', () => {
  for (const locale of LOCALES) {
    it(`${locale} : chaque clé lue par l’arène existe`, () => {
      const messages = catalog(locale)
      const { game, common } = keysRead()
      const missing = [
        ...game.map((key) => `games.doigt-du-destin.${key}`),
        ...common.map((key) => `common.${key}`),
        'games.catalog.doigt-du-destin.title',
        'games.catalog.doigt-du-destin.description',
      ].filter((path) => {
        const value = at(messages, path)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(missing).toEqual([])
    })

    it(`${locale} : rien de ce qu’affiche le mode Sans alcool ne parle d’alcool`, () => {
      const slice = at(catalog(locale), 'games.doigt-du-destin')
      const texts = [...strings(at(slice, 'soft')), ...SHARED.flatMap((path) => strings(at(slice, path)))]
      expect(texts.length).toBeGreaterThan(20)
      expect(texts.filter((text) => ALCOHOL[locale].test(text))).toEqual([])
    })
  }
})
