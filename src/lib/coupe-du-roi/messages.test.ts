import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COUPE_CUP_MODES, COUPE_RANKS, COUPE_SUGGESTION_KEYS, COUPE_SUITS } from './engine'

/**
 * Les textes que l'écran compose à partir des codes du moteur (rangs,
 * enseignes, idées de règle) : une clé absente ne casse aucun autre test
 * (messages-coverage ne vérifie que les espaces de noms) et s'afficherait
 * brute à l'écran. Ici aussi : aucune variante Sans alcool ne parle d'alcool.
 *
 * Tant que les fragments ne sont pas fusionnés dans messages/*.json, la
 * tranche games.coupe-du-roi n'existe pas : le bloc est sauté, pas vert à vide.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
type Locale = (typeof LOCALES)[number]

type Catalogue = { games?: Record<string, unknown>; hub?: { ambianceMode?: { soft?: unknown } } }

function catalogue(locale: Locale): Catalogue {
  const file = fileURLToPath(new URL(`../../../messages/${locale}.json`, import.meta.url))
  return JSON.parse(readFileSync(file, 'utf8')) as Catalogue
}

function slice(locale: Locale): Record<string, unknown> | null {
  const games = catalogue(locale).games?.['coupe-du-roi']
  return games && typeof games === 'object' ? (games as Record<string, unknown>) : null
}

/** Le nom du mode (« Sans alcool », « Alcohol-free »…) : le seul mot d'alcool permis dans un texte Soft. */
function softModeName(locale: Locale): string {
  const name = catalogue(locale).hub?.ambianceMode?.soft
  return typeof name === 'string' ? name : ''
}

function at(tree: unknown, path: string): unknown {
  let node = tree
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

const ALCOHOL: Record<Locale, RegExp> = {
  fr: /\b(boi[st]|boire|boivent|buv\w*|gorg[ée]+s?|verres?|bi[èe]res?|vins?|alcools?|shots?|cul sec|trinqu\w*)\b/i,
  en: /\b(drinks?|drinking|drank|sips?|beers?|wine|alcohol|shots?|glass(es)?|booze)\b/i,
  es: /\b(beb\w*|tragos?|sorbos?|cervezas?|vino|alcohol|chupitos?|vasos?)\b/i,
  it: /\b(bev\w*|bere|sors[io]|birr[ae]|vino|alcol\w*|bicchier[ei]|shot)\b/i,
}

describe.skipIf(slice('fr') === null)('textes de la Coupe du Roi', () => {
  for (const locale of LOCALES) {
    it(`${locale} : chaque code du moteur a son texte`, () => {
      const texts = slice(locale)
      const paths = [
        ...COUPE_RANKS.flatMap((rank) => [`ranks.${rank}`, `rules.${rank}.title`, `rules.${rank}.text`, `rules.${rank}.soft`]),
        'rules.K.solo',
        ...COUPE_SUITS.map((suit) => `suits.${suit}`),
        ...COUPE_SUGGESTION_KEYS.map((key) => `suggestions.${key}`),
        ...COUPE_CUP_MODES.flatMap((mode) => [`page.cupModes.${mode}.label`, `page.cupModes.${mode}.desc`]),
        'game.pairWith',
      ]
      const missing = paths.filter((path) => {
        const value = at(texts, path)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(missing).toEqual([])
    })

    it(`${locale} : les variantes Sans alcool et les idées de règle ne parlent pas d’alcool`, () => {
      const texts = slice(locale)
      const mode = softModeName(locale)
      expect(mode).not.toBe('')
      const soft = [
        ...COUPE_RANKS.map((rank) => `rules.${rank}.soft`),
        ...COUPE_SUGGESTION_KEYS.map((key) => `suggestions.${key}`),
        'game.pair.hintSoft',
        'end.soft',
        'page.steps.kingsSoft',
        // Ce que la pré-partie affiche à la place du choix de la coupe.
        'page.softCup',
      ]
      const offenders = soft.filter((path) => ALCOHOL[locale].test(String(at(texts, path) ?? '').split(mode).join('')))
      expect(offenders).toEqual([])
    })
  }
})
