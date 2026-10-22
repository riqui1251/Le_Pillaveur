import { describe, expect, it } from 'vitest'
// Le moteur ICU de next-intl (next-intl → use-intl → intl-messageformat) : les
// select speaker/target du catalogue sont rendus ici comme en production.
import { IntlMessageFormat } from 'intl-messageformat'
import { BOT_PERSONAS, type BotTrait } from '@/lib/online/bot-personas'
import fr from '../../../../messages/fr.json'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import it_ from '../../../../messages/it.json'
import { DRINK_TIC_KEYS, botLine, type LineTranslator } from './bot-speech-feed'

/**
 * FABRIQUE DE TESTS du catalogue des paroles d'un jeu à débat — importée par
 * les fichiers de test de chaque jeu (`describeSpeechCatalogue({ node:
 * 'games.<jeu>.game', … })`), jamais par du code de l'application. Les mêmes
 * exigences pour tous les jeux, dans les 4 langues : les kinds attendus et
 * eux seuls, au moins deux variantes contiguës par phrase, un rendu ICU court
 * et complet pour tout couple de genres (auteur, cible), l'apostrophe
 * typographique seule (l'ASCII est un quote ICU), les 20 tics des personas,
 * et une ligne réelle composée par chaque persona.
 */

export type SpeechCatalogue = {
  botSay: Record<string, string>
  botSayTrait: Record<string, Record<string, string>>
  botTic: Record<string, string>
}

const MESSAGES: Record<string, unknown> = { fr, en, es, it: it_ }

export const SPEECH_LOCALES = Object.keys(MESSAGES)

/** Le nœud `games.<jeu>.game` d'une langue (le chemin se lit segment par segment : `loup-garou` reste entier). */
export function speechCatalogueOf(node: string, locale: string): SpeechCatalogue {
  let cursor: unknown = MESSAGES[locale]
  for (const segment of node.split('.')) {
    cursor = (cursor as Record<string, unknown> | undefined)?.[segment]
  }
  if (!cursor || typeof cursor !== 'object') throw new Error(`${locale}.${node} : nœud absent du catalogue`)
  return cursor as SpeechCatalogue
}

/** Le catalogue d'une langue à plat, relatif au namespace du jeu (`botSay.suspect_2`, `botTic.raoul`…). */
export function flattenSpeechCatalogue(game: SpeechCatalogue): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [kind, text] of Object.entries(game.botSay ?? {})) flat[`botSay.${kind}`] = text
  for (const [trait, kinds] of Object.entries(game.botSayTrait ?? {})) {
    for (const [kind, text] of Object.entries(kinds)) flat[`botSayTrait.${trait}.${kind}`] = text
  }
  for (const [key, text] of Object.entries(game.botTic ?? {})) flat[`botTic.${key}`] = text
  return flat
}

/** Un catalogue plat rendu par le vrai moteur ICU : select speaker/target compris. */
export function icuTranslator(catalogue: Record<string, string>, locale = 'fr'): LineTranslator {
  const formats = new Map<string, IntlMessageFormat>()
  return {
    has: (key) => key in catalogue,
    format: (key, values) => {
      let format = formats.get(key)
      if (!format) {
        format = new IntlMessageFormat(catalogue[key], locale)
        formats.set(key, format)
      }
      return String(format.format(values))
    },
  }
}

/** Mots de boisson par langue : une phrase de bot n'en contient aucun (ambiance Sans alcool, TV comprise). */
export const DRINK_WORDS: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|\bsant[ée](?![a-z])|tchin|trinqu|ap[ée]ro|alcool|\bivres?\b|\bcuite/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass|alcohol|drunk|tipsy/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind|alcohol|borrach/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind|alcol|ubriac/i,
}

const baseOf = (key: string) => key.replace(/_\d+$/, '')
const GENRES = ['f', 'm', 'other'] as const
const SEEDS = Array.from({ length: 40 }, (_, i) => `p-${i}`)
const NAME = 'Mauricette'
const bot = (name: string) => ({ name, isBot: true })
const RIQUI = { name: 'Riqui', isBot: false }

export function describeSpeechCatalogue({
  node,
  kinds,
  traitKinds,
  personaKind = 'suspect',
  extraArgs = {},
  maxChars = 70,
  maxCharsWithExtraArgs = maxChars,
  drinkFree = false,
}: {
  /** Namespace du jeu : `games.<jeu>.game`. */
  node: string
  /** Kinds de `botSay` (base de chaque phrase), tous présents et seuls. */
  kinds: readonly string[]
  /** Kinds déclinés au ton de chaque trait sous `botSayTrait.<trait>`. */
  traitKinds: readonly string[]
  /** Kind de la ligne réelle composée par chaque persona (il doit avoir son ton de trait). */
  personaKind?: string
  /** Arguments propres au jeu, passés au rendu en plus de `{name, speaker, target}` (l'indice cité…). */
  extraArgs?: Record<string, string>
  /** Longueur max d'une bulle rendue, en caractères. */
  maxChars?: number
  /** Longueur max d'une phrase qui lit un argument de `extraArgs` (l'indice cité allonge la bulle). */
  maxCharsWithExtraArgs?: number
  /**
   * Jeu joué en ambiance Sans alcool : aucune phrase ne parle de boire, et
   * les seuls tics qui trinquent sont ceux que le fil tait (DRINK_TIC_KEYS).
   */
  drinkFree?: boolean
}): void {
  const catalogues = SPEECH_LOCALES.map((locale) => [locale, speechCatalogueOf(node, locale)] as const)
  const sayKeys = (game: SpeechCatalogue) =>
    Object.keys(flattenSpeechCatalogue(game)).filter((key) => !key.startsWith('botTic.'))
  const extraNames = Object.keys(extraArgs)
  const limitOf = (template: string) =>
    extraNames.some((arg) => new RegExp(`\\{\\s*${arg}\\b`).test(template)) ? maxCharsWithExtraArgs : maxChars

  describe(`catalogue des phrases de ${node} (${SPEECH_LOCALES.join(', ')})`, () => {
    it(`clés : ${kinds.length} kinds de base, 4 traits × ${traitKinds.join('/')}, variantes contiguës (\`_2\` avant \`_3\`), au moins 2 par phrase`, () => {
      const traits = [...new Set<BotTrait>(BOT_PERSONAS.map((p) => p.trait))].sort()
      expect(traits).toEqual(['agressif', 'farceur', 'prudent', 'suiveur'])
      for (const [locale, game] of catalogues) {
        expect([...new Set(Object.keys(game.botSay).map(baseOf))].sort(), locale).toEqual([...kinds].sort())
        expect(Object.keys(game.botSayTrait).sort(), locale).toEqual(traits)
        for (const trait of traits) {
          expect([...new Set(Object.keys(game.botSayTrait[trait]).map(baseOf))].sort(), `${locale}.${trait}`).toEqual(
            [...traitKinds].sort()
          )
        }
        const keys = sayKeys(game)
        for (const key of keys) {
          const variant = key.match(/^(.*)_(\d+)$/)
          if (!variant) {
            expect(keys, `${locale}.${key} : sans variante _2`).toContain(`${key}_2`)
            continue
          }
          const n = Number(variant[2])
          expect(n, `${locale}.${key}`).toBeGreaterThanOrEqual(2)
          expect(keys, `${locale}.${key} : précédente absente`).toContain(n === 2 ? variant[1] : `${variant[1]}_${n - 1}`)
        }
      }
    })

    it(`rendu ICU, chaque clé × (speaker, target) ∈ {f, m, other}² : ≤ ${maxChars} caractères, nom présent, aucune accolade, pas d’espace parasite`, () => {
      for (const [locale, game] of catalogues) {
        const flat = flattenSpeechCatalogue(game)
        for (const key of sayKeys(game)) {
          const format = new IntlMessageFormat(flat[key], locale)
          const limit = limitOf(flat[key])
          for (const speaker of GENRES) {
            for (const target of GENRES) {
              const line = String(format.format({ ...extraArgs, name: NAME, speaker, target }))
              const label = `${locale}.${key} ${speaker}/${target} : ${line}`
              expect([...line].length, label).toBeLessThanOrEqual(limit)
              expect(line, label).toContain(NAME)
              expect(line, label).not.toMatch(/[{}]/)
              expect(line.trim(), label).toBe(line)
              expect(line, label).not.toMatch(/\s{2}/)
            }
          }
        }
      }
    })

    it('les variantes d’une même phrase sont toutes différentes ; apostrophe typographique seulement (l’ASCII est un quote ICU)', () => {
      for (const [locale, game] of catalogues) {
        const flat = flattenSpeechCatalogue(game)
        const byBase = new Map<string, string[]>()
        for (const key of sayKeys(game)) {
          expect(flat[key], `${locale}.${key}`).not.toContain("'")
          byBase.set(baseOf(key), [...(byBase.get(baseOf(key)) ?? []), flat[key]])
        }
        for (const [base, texts] of byBase) expect(new Set(texts).size, `${locale}.${base}`).toBe(texts.length)
      }
    })

    it('chaque persona compose une ligne réelle dans les 4 langues (tic + nom visé présents)', () => {
      for (const [locale, game] of catalogues) {
        const real = icuTranslator(flattenSpeechCatalogue(game), locale)
        for (const persona of BOT_PERSONAS) {
          const line = botLine(personaKind, bot(persona.name), RIQUI, real, { values: extraArgs })
          const tic = game.botTic[persona.ticKey]
          expect(line, `${locale}.${persona.name}`).toContain('Riqui')
          expect(line, `${locale}.${persona.name}`).toContain(tic)
          if (persona.ticPosition === 'prefix') expect(line!.startsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
          else expect(line!.endsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
        }
      }
    })

    if (drinkFree) {
      it('Sans alcool : aucune phrase ne parle de boire, quel que soit le genre ; les tics qui trinquent sont ceux que le fil tait', () => {
        for (const [locale, game] of catalogues) {
          const flat = flattenSpeechCatalogue(game)
          for (const key of sayKeys(game)) {
            const format = new IntlMessageFormat(flat[key], locale)
            for (const genre of GENRES) {
              const line = String(format.format({ ...extraArgs, name: NAME, speaker: genre, target: genre }))
              expect(line, `${locale}.${key} : ${line}`).not.toMatch(DRINK_WORDS[locale])
            }
          }
          const toasting = Object.entries(game.botTic)
            .filter(([, text]) => DRINK_WORDS[locale].test(text))
            .map(([key]) => key)
          for (const key of toasting) expect(DRINK_TIC_KEYS, `${locale}.botTic.${key}`).toContain(key)
        }
      })
    }

    it('20 tics distincts par langue, exactement ceux des personas, sans argument ICU, ≤ 30 caractères', () => {
      const ticKeys = BOT_PERSONAS.map((p) => p.ticKey).sort()
      for (const [locale, game] of catalogues) {
        const tics = game.botTic
        expect(Object.keys(tics).sort(), locale).toEqual(ticKeys)
        expect(new Set(Object.values(tics)).size, `${locale} : tics identiques`).toBe(ticKeys.length)
        for (const [key, text] of Object.entries(tics)) {
          expect(text, `${locale}.${key}`).not.toContain('{')
          expect([...text].length, `${locale}.${key} : ${text}`).toBeLessThanOrEqual(30)
          expect(text.trim(), `${locale}.${key}`).toBe(text)
        }
      }
    })

    it('un préfixe à virgule ne redouble jamais le premier mot de la phrase (« Moi pareil, pareil… »), quelle que soit la variante ou la cible', () => {
      const word = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-zà-ÿ]/g, '')
      const targets = [bot('Suzette'), bot('Raoul'), RIQUI]
      for (const [locale, game] of catalogues) {
        const real = icuTranslator(flattenSpeechCatalogue(game), locale)
        for (const persona of BOT_PERSONAS) {
          const tic = game.botTic[persona.ticKey]
          if (persona.ticPosition !== 'prefix' || !tic.endsWith(',')) continue
          const last = word(tic.split(' ').pop())
          for (const kind of kinds) {
            for (const target of targets) {
              for (const seed of SEEDS) {
                const line = botLine(kind, bot(persona.name), target, real, { seed, values: extraArgs })
                expect(line, `${locale}.${persona.name}.${kind}`).not.toBeNull()
                const first = word(line!.slice(tic.length).trim().split(' ')[0])
                expect(first, `${locale}.${persona.name}.${kind} : ${line}`).not.toBe(last)
              }
            }
          }
        }
      }
    })
  })
}
