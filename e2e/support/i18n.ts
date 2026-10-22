import { createTranslator, type AbstractIntlMessages } from 'use-intl/core'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import fr from '../../messages/fr.json'
import it from '../../messages/it.json'

/**
 * Textes de l'interface LUS dans messages/<langue>.json — jamais recopiés
 * dans les tests : un libellé qui change ne casse pas un sélecteur, et une
 * clé qui disparaît fait échouer le test là où elle sert.
 */
export const LOCALES = ['fr', 'en', 'es', 'it'] as const
export type Locale = (typeof LOCALES)[number]

// Les catalogues portent aussi des tableaux (règles, étapes de tutoriel) :
// next-intl les lit très bien (t.raw), son type d'entrée ne les décrit pas.
const MESSAGES = { fr, en, es, it } as unknown as Record<Locale, AbstractIntlMessages>

type Values = Record<string, string | number>
const translators = Object.fromEntries(
  LOCALES.map((locale) => [locale, createTranslator({ locale, messages: MESSAGES[locale] })])
) as Record<Locale, (key: string, values?: Values) => string>

/** Message formaté (ICU : pluriels, variables) — même moteur que next-intl. */
export function tr(locale: Locale, key: string, values?: Values): string {
  return translators[locale](key, values)
}

/** Valeur brute d'une clé (tableaux, objets, gabarits non formatés). */
export function raw(locale: Locale, key: string): unknown {
  let node: unknown = MESSAGES[locale]
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') throw new Error(`Clé absente (${locale}) : ${key}`)
    node = (node as Record<string, unknown>)[part]
  }
  if (node === undefined) throw new Error(`Clé absente (${locale}) : ${key}`)
  return node
}

/** Expression régulière qui matche exactement ce texte (échappé). */
export function exact(text: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`)
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Clé de traduction brute affichée : next-intl rend `espace.clé` quand un
 * message manque (« games.pmu.setup.nextRace »). On cherche les chemins qui
 * commencent par un espace de noms réel du catalogue, suivis d'au moins un
 * segment : aucune phrase d'interface n'a cette forme.
 */
export const RAW_KEY_PATTERN = new RegExp(
  `(?:^|[^\\w@/.-])((?:${Object.keys(fr).map(escapeRegExp).join('|')})(?:\\.[A-Za-z0-9_-]+)+)`,
  'g'
)

/** Joker des gabarits : `pattern(locale, key, { name: ANY })` matche tout prénom. */
export const ANY = '\u0000'

/** Gabarit traduit en expression régulière (variables ANY → n'importe quel texte). */
export function pattern(locale: Locale, key: string, values?: Values): RegExp {
  const text = tr(locale, key, values)
  return new RegExp(escapeRegExp(text).split(ANY).join('.+?'))
}
