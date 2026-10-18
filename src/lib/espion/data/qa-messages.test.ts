import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ESPION_ANY, ESPION_QUESTIONS, ESPION_QUESTION_IDS } from './questions'
import { ESPION_LOCATION_IDS, espionLocationName, type EspionLang } from './index'

/**
 * Croisement données × messages : les textes des questions et des réponses
 * (games.espion.game.qa) collent aux codes de data/questions.ts, dans chaque
 * langue. Filtrable par langue :
 *   npx vitest run src/lib/espion/data/qa-messages.test.ts -t "qa/en"
 * La parité clé pour clé entre langues est l'affaire de messages-parity.
 *
 * Forme commune, parce que lot 3 insère ces textes dans des bulles
 * (« Mila te demande : {question} », « {answer}, je dirais ») : initiale
 * minuscule (l'écran met la capitale par CSS sur un bouton), une question
 * finit par « ? », une réponse sans ponctuation finale, et jamais une accolade
 * (ICU la lirait comme un argument).
 */

const LANGS: readonly EspionLang[] = ['fr', 'en', 'es', 'it']
/** Question et réponse tiennent en 48 caractères, donc une bulle en 80. */
const QA_MAX_CHARS = 48
const QUESTION_VARIANTS = 2
const ANSWER_VARIANTS = 3

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

type Qa = Record<string, unknown>

function qaOf(lang: EspionLang): Qa | undefined {
  const messages = JSON.parse(readFileSync(join(ROOT, 'messages', `${lang}.json`), 'utf8'))
  return messages?.games?.espion?.game?.qa
}

const variantKeys = (base: string, count: number) =>
  Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}_${i + 1}`))

/** Clés attendues sous qa, chemin pointé relatif à qa. */
function expectedKeys(): string[] {
  const keys = variantKeys(ESPION_ANY, ANSWER_VARIANTS)
  for (const q of ESPION_QUESTION_IDS) {
    keys.push(...variantKeys('q', QUESTION_VARIANTS).map((k) => `${q}.${k}`))
    for (const value of ESPION_QUESTIONS[q]) keys.push(...variantKeys(value, ANSWER_VARIANTS).map((k) => `${q}.${k}`))
  }
  return keys
}

function flatten(node: unknown, prefix = ''): Record<string, unknown> {
  if (typeof node !== 'object' || node === null) return { [prefix]: node }
  return Object.entries(node).reduce<Record<string, unknown>>(
    (out, [key, value]) => ({ ...out, ...flatten(value, prefix ? `${prefix}.${key}` : key) }),
    {}
  )
}

/** Comparaison de mots : casse, accents et apostrophes ignorés, ponctuation en espaces. */
function words(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

const isQuestionKey = (key: string) => /\.q(_\d)?$/.test(key)

// ─── Les règles : chacune rend la liste des violations, nommées ──────────────

/** Q1 : q et q_2 par question, 3 variantes par valeur et pour any, toutes distinctes ; rien d'autre. */
function ruleQ1Keys(lang: EspionLang, qa: Qa | undefined): string[] {
  if (!qa) return [`qa/${lang} : games.espion.game.qa absent`]
  const v: string[] = []
  const flat = flatten(qa)
  const expected = expectedKeys()
  for (const key of expected) {
    if (typeof flat[key] !== 'string' || (flat[key] as string).trim() === '') v.push(`qa/${lang} › ${key} : texte absent ou vide`)
  }
  for (const key of Object.keys(flat)) if (!expected.includes(key)) v.push(`qa/${lang} › ${key} : clé inattendue`)
  // Deux variantes, ou deux réponses d'une même question, ne se confondent jamais.
  const groups: string[][] = [variantKeys(ESPION_ANY, ANSWER_VARIANTS)]
  for (const q of ESPION_QUESTION_IDS) {
    groups.push(variantKeys('q', QUESTION_VARIANTS).map((k) => `${q}.${k}`))
    groups.push(ESPION_QUESTIONS[q].flatMap((value) => variantKeys(value, ANSWER_VARIANTS).map((k) => `${q}.${k}`)))
  }
  for (const group of groups) {
    const seen = new Map<string, string>()
    for (const key of group) {
      const text = flat[key]
      if (typeof text !== 'string') continue
      const first = seen.get(words(text))
      if (first) v.push(`qa/${lang} › ${key} : même texte que ${first} (${JSON.stringify(text)})`)
      else seen.set(words(text), key)
    }
  }
  return v
}

/** Noms des 75 lieux dans les 4 langues, en mots normalisés. */
const LOCATION_WORDS: { id: string; lang: EspionLang; name: string; norm: string }[] = ESPION_LOCATION_IDS.flatMap((id) =>
  LANGS.map((lang) => {
    const name = espionLocationName(id, lang)
    return { id, lang, name, norm: words(name) }
  })
)

/** Q2 : aucun nom de lieu, d'aucune langue, dans un texte qa (le fil part chez l'espion). */
function ruleQ2NoLocation(lang: EspionLang, qa: Qa | undefined): string[] {
  if (!qa) return []
  const v: string[] = []
  for (const [key, text] of Object.entries(flatten(qa))) {
    if (typeof text !== 'string') continue
    const norm = words(text)
    for (const loc of LOCATION_WORDS) {
      if (norm.includes(loc.norm)) v.push(`qa/${lang} › ${key} ${JSON.stringify(text)} : contient le lieu « ${loc.name} » (${loc.lang})`)
    }
  }
  return v
}

/** Q3 : apostrophe typographique, 48 caractères au plus, forme d'insertion dans une bulle. */
function ruleQ3Form(lang: EspionLang, qa: Qa | undefined): string[] {
  if (!qa) return []
  const v: string[] = []
  for (const [key, text] of Object.entries(flatten(qa))) {
    if (typeof text !== 'string') continue
    const where = `qa/${lang} › ${key} ${JSON.stringify(text)}`
    const length = [...text].length
    if (text.includes("'")) v.push(`${where} : apostrophe droite (’ attendue)`)
    if (/[{}]/.test(text)) v.push(`${where} : accolade (lue comme argument ICU)`)
    if (length > QA_MAX_CHARS) v.push(`${where} : ${length} caractères (au plus ${QA_MAX_CHARS})`)
    if (text !== text.trim()) v.push(`${where} : espaces en bordure`)
    if (/^[¿¡]?\p{Lu}/u.test(text)) v.push(`${where} : initiale majuscule (minuscule attendue)`)
    if (isQuestionKey(key) && !text.endsWith('?')) v.push(`${where} : une question finit par « ? »`)
    if (!isQuestionKey(key) && /[.,;:!?…]$/u.test(text)) v.push(`${where} : ponctuation finale dans une réponse`)
  }
  return v
}

const RULES: [string, (lang: EspionLang, qa: Qa | undefined) => string[]][] = [
  ['Q1 : q et q_2 par question, 3 variantes distinctes par valeur et pour any, aucune clé de trop', ruleQ1Keys],
  ['Q2 : aucun nom de lieu, d’aucune langue, dans un texte qa', ruleQ2NoLocation],
  [`Q3 : apostrophe typographique, ${QA_MAX_CHARS} caractères au plus, forme d’insertion`, ruleQ3Form],
]

for (const lang of LANGS) {
  describe(`qa/${lang}`, () => {
    const qa = qaOf(lang)
    for (const [title, rule] of RULES) {
      it(title, () => {
        const v = rule(lang, qa)
        expect(v, v.join('\n')).toEqual([])
      })
    }
  })
}

// ─── Le validateur lui-même ──────────────────────────────────────────────────

describe('qa : le validateur nomme chaque violation', () => {
  const good = (): Qa => {
    const qa: Qa = { any: 'ça dépend', any_2: 'difficile à dire', any_3: 'un peu de tout' }
    for (const q of ESPION_QUESTION_IDS) {
      const node: Record<string, string> = { q: `question ${q} ?`, q_2: `autre question ${q} ?` }
      ESPION_QUESTIONS[q].forEach((value, i) => {
        node[value] = `réponse ${q} ${i}`
        node[`${value}_2`] = `réponse ${q} ${i} bis`
        node[`${value}_3`] = `réponse ${q} ${i} ter`
      })
      qa[q] = node
    }
    return qa
  }
  const withWhere = (patch: Record<string, unknown>): Qa => {
    const qa = good()
    qa.where = { ...(qa.where as object), ...patch }
    return qa
  }

  it('un catalogue correct ne produit aucune violation', () => {
    for (const [, rule] of RULES) expect(rule('fr', good())).toEqual([])
  })

  it('Q1 : texte absent, clé de trop, variantes confondues', () => {
    const qa = withWhere({ inside_3: '', inside_4: 'en trop', outside: 'réponse where 0' })
    expect(ruleQ1Keys('fr', qa)).toEqual([
      expect.stringContaining('qa/fr › where.inside_3 : texte absent ou vide'),
      expect.stringContaining('qa/fr › where.inside_4 : clé inattendue'),
      expect.stringContaining('qa/fr › where.outside : même texte que where.inside'),
    ])
    expect(ruleQ1Keys('fr', undefined)).toEqual([expect.stringContaining('qa/fr : games.espion.game.qa absent')])
  })

  it('Q2 : un nom de lieu, quelle que soit sa langue ou sa casse', () => {
    const v = ruleQ2NoLocation('fr', withWhere({ inside: 'comme à la Plage', outside: 'en plein air, près du lighthouse' }))
    expect(v).toEqual([
      expect.stringContaining('where.inside "comme à la Plage" : contient le lieu « Plage » (fr)'),
      expect.stringContaining('where.outside "en plein air, près du lighthouse" : contient le lieu « Lighthouse » (en)'),
    ])
    expect(ruleQ2NoLocation('fr', withWhere({ inside: 'en plage horaire' }))).toEqual([
      expect.stringContaining('contient le lieu « Plage »'),
    ])
    // Un mot qui en contient un autre n'est pas ce nom (« minutes » n'est pas « Mine »).
    expect(ruleQ2NoLocation('en', withWhere({ inside: 'a few minutes' }))).toEqual([])
  })

  it('Q3 : apostrophe droite, accolade, longueur, bordure, majuscule, ponctuation', () => {
    const v = ruleQ3Form(
      'fr',
      withWhere({ q: "c'est dedans ?", q_2: 'dedans ou dehors', inside: 'Dedans', inside_2: 'x'.repeat(49), outside: '{a}', outside_2: 'dehors.', outside_3: ' dehors' })
    )
    expect(v).toEqual([
      expect.stringContaining('where.q "c\'est dedans ?" : apostrophe droite'),
      expect.stringContaining('where.q_2 "dedans ou dehors" : une question finit par « ? »'),
      expect.stringContaining('where.inside "Dedans" : initiale majuscule'),
      expect.stringContaining('where.inside_2 "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" : 49 caractères'),
      expect.stringContaining('where.outside "{a}" : accolade'),
      expect.stringContaining('where.outside_2 "dehors." : ponctuation finale'),
      expect.stringContaining('where.outside_3 " dehors" : espaces en bordure'),
    ])
  })
})
