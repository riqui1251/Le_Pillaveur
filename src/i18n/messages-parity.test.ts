import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Le parseur ICU que next-intl utilise réellement (next-intl → use-intl →
// intl-messageformat → @formatjs/icu-messageformat-parser) : ce que lui refuse
// ou lit ici est exactement ce que le site refusera ou lira en production.
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

/**
 * Parité des quatre fichiers de messages.
 *
 * Le français est la référence : c'est la langue dans laquelle les écrans sont
 * écrits, les autres sont traduites après coup. Une clé absente d'une langue
 * n'est visible qu'en changeant de langue ET en atteignant l'écran — next-intl
 * affiche alors la clé brute (« games.tabou.turn.skip ») au milieu de la page.
 * Une clé en trop est un texte mort que plus personne ne relira. Ce test
 * remonte les deux, par langue, avec la liste exacte.
 *
 * Deuxième filet, plus fin : les ARGUMENTS ICU. Un `{name}` renommé dans une
 * seule langue (« {joueur} » pour « {player} ») rend « {joueur} » tel quel à
 * l'écran ; un `{count, select, …}` devenu `{count, plural, …}` reçoit un mot
 * là où il attend un nombre et plante le rendu. On compare donc, clé par clé,
 * les noms d'arguments et la nature de la valeur attendue.
 */

const REFERENCE_LOCALE = 'fr'
const TRANSLATED_LOCALES = ['en', 'es', 'it'] as const
const MESSAGES_DIR = fileURLToPath(new URL('../../messages/', import.meta.url))

/**
 * Écarts d'arguments connus et acceptés, par « locale:clé ». Chaque entrée dit
 * pourquoi ce n'est pas une faute : le test échoue si l'écart disparaît, pour
 * que la liste ne survive pas à sa raison d'être.
 */
const ECARTS_ADMIS: Record<string, string> = {
  'it:supervision.accounts.matchCount':
    "l'italien n'a pas de suffixe de pluriel : « Account trovati: {total} » se passe de l'argument " +
    '{plural} (« s » ou vide) que le français, l’anglais et l’espagnol collent au nom ; ' +
    "un argument reçu et non lu n'a aucun effet à l'affichage",
}

type Leaf = string | number | boolean | null

/** Aplatit objets ET tableaux (« tutorial.steps.0.title ») : une étape de tutoriel manquante compte. */
function flatten(value: unknown, prefix: string, out: Map<string, Leaf>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return
  }
  out.set(prefix, value as Leaf)
}

function loadMessages(locale: string): Map<string, Leaf> {
  const parsed: unknown = JSON.parse(readFileSync(`${MESSAGES_DIR}${locale}.json`, 'utf8'))
  const out = new Map<string, Leaf>()
  flatten(parsed, '', out)
  return out
}

/**
 * Nature de la valeur qu'un argument attend. « any » est le `{name}` nu : il
 * affiche ce qu'on lui donne, un nombre compris — c'est pourquoi il reste
 * compatible avec `number` (une langue pluralise « {count} joueurs », une
 * autre écrit « faltan {count, plural, …} » : même nombre passé). Tout le
 * reste doit coïncider : un `select` veut un mot, un `date` une date, une
 * balise `<b>` une fonction de rendu.
 */
type ArgKind = 'any' | 'number' | 'date' | 'select' | 'tag'

function collectArgs(elements: MessageFormatElement[], out: Map<string, Set<ArgKind>>): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
      case TYPE.pound:
        continue
      case TYPE.argument:
        add(out, element.value, 'any')
        continue
      case TYPE.number:
        add(out, element.value, 'number')
        continue
      case TYPE.date:
      case TYPE.time:
        add(out, element.value, 'date')
        continue
      case TYPE.select:
        add(out, element.value, 'select')
        for (const option of Object.values(element.options)) collectArgs(option.value, out)
        continue
      case TYPE.plural:
        // plural et selectordinal : un nombre dans les deux cas.
        add(out, element.value, 'number')
        for (const option of Object.values(element.options)) collectArgs(option.value, out)
        continue
      case TYPE.tag:
        add(out, element.value, 'tag')
        collectArgs(element.children, out)
        continue
    }
  }
}

function add(out: Map<string, Set<ArgKind>>, name: string, kind: ArgKind): void {
  const kinds = out.get(name) ?? new Set<ArgKind>()
  kinds.add(kind)
  out.set(name, kinds)
}

/** Un même argument cité deux fois (« {n, plural, …} … {n} ») garde sa forme la plus exigeante. */
function resolvedKind(kinds: Set<ArgKind>): ArgKind {
  const strict = [...kinds].filter((kind) => kind !== 'any')
  if (strict.length === 0) return 'any'
  // Deux natures strictes pour un même nom dans un même message : on renvoie
  // la concaténation, qui ne coïncidera avec rien et fera parler le test.
  return strict.length === 1 ? strict[0] : (strict.join('|') as ArgKind)
}

function compatible(reference: ArgKind, translated: ArgKind): boolean {
  if (reference === translated) return true
  const pair = new Set([reference, translated])
  return pair.has('any') && pair.has('number')
}

function argsOf(message: string): Map<string, ArgKind> {
  const collected = new Map<string, Set<ArgKind>>()
  collectArgs(parse(message), collected)
  return new Map([...collected].map(([name, kinds]) => [name, resolvedKind(kinds)]))
}

const reference = loadMessages(REFERENCE_LOCALE)

describe('parité des messages', () => {
  it('la référence française est chargée et n’est pas vide', () => {
    expect(reference.size).toBeGreaterThan(3000)
  })

  for (const locale of TRANSLATED_LOCALES) {
    it(`${locale} : mêmes clés que ${REFERENCE_LOCALE}`, () => {
      const translated = loadMessages(locale)
      const missing = [...reference.keys()].filter((key) => !translated.has(key))
      const extra = [...translated.keys()].filter((key) => !reference.has(key))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })
  }

  for (const locale of TRANSLATED_LOCALES) {
    it(`${locale} : mêmes arguments ICU que ${REFERENCE_LOCALE}, clé par clé`, () => {
      const translated = loadMessages(locale)
      const problems: string[] = []
      const ecartsRencontres = new Set<string>()

      for (const [key, referenceValue] of reference) {
        const translatedValue = translated.get(key)
        if (typeof referenceValue !== 'string' || typeof translatedValue !== 'string') continue

        let referenceArgs: Map<string, ArgKind>
        let translatedArgs: Map<string, ArgKind>
        try {
          referenceArgs = argsOf(referenceValue)
        } catch (error) {
          problems.push(`${REFERENCE_LOCALE}:${key} — message ICU illisible : ${(error as Error).message}`)
          continue
        }
        try {
          translatedArgs = argsOf(translatedValue)
        } catch (error) {
          problems.push(`${locale}:${key} — message ICU illisible : ${(error as Error).message}`)
          continue
        }

        const details: string[] = []
        for (const [name, kind] of referenceArgs) {
          const other = translatedArgs.get(name)
          if (other === undefined) details.push(`{${name}} absent`)
          else if (!compatible(kind, other)) details.push(`{${name}} attend ${kind} en fr, ${other} ici`)
        }
        for (const name of translatedArgs.keys()) {
          if (!referenceArgs.has(name)) details.push(`{${name}} en trop`)
        }
        if (details.length === 0) continue

        const id = `${locale}:${key}`
        if (id in ECARTS_ADMIS) {
          ecartsRencontres.add(id)
          continue
        }
        problems.push(`${id} — ${details.join(', ')}`)
      }

      // Une exception dont l'écart a disparu doit être retirée de la liste.
      const perimees = Object.keys(ECARTS_ADMIS).filter(
        (id) => id.startsWith(`${locale}:`) && !ecartsRencontres.has(id)
      )

      expect({ problems, exceptionsPerimees: perimees }).toEqual({ problems: [], exceptionsPerimees: [] })
    })
  }
})
