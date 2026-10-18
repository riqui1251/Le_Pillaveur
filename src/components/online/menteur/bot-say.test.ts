import { describe, expect, it } from 'vitest'
// Le moteur ICU de next-intl (next-intl → use-intl → intl-messageformat) et
// son parseur : ce qui se rend et se lit ici se rend pareil à l'écran.
import { IntlMessageFormat } from 'intl-messageformat'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { MENTEUR_SPEECH_KINDS } from '@/lib/menteur/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Menteur (games.menteur.game), dans les 4 langues :
 * les exigences communes aux jeux à paroles (catalogue-spec.ts), puis, langue
 * par langue (`-t "menteur/es"`), les règles propres au Menteur.
 *
 * Aucun mot de boisson dans les phrases : la TV n'a pas de mode Sans alcool,
 * et l'ambiance ne doit pas dépendre de la phrase tirée. Les tics, eux, sont
 * des copies conformes de ceux du Loup-Garou (le « …tchin ! » de Marcel
 * compris) : ils sont exclus de cette règle, pas retouchés ici.
 */

const NODE = 'games.menteur.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: MENTEUR_SPEECH_KINDS,
  traitKinds: ['sure', 'suspect'],
  personaKind: 'suspect',
  maxChars: 70,
})

const DRINK: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|sant[ée]|tchin|trinqu|ap[ée]ro/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind/i,
}
const GENRES = ['f', 'm', 'other'] as const
const NAME = 'Mauricette'
const TRAITS = ['agressif', 'farceur', 'prudent', 'suiveur']
const ARGS = ['name', 'speaker', 'target']

/** Les arguments ICU lus par un gabarit, branches de select comprises. */
function argNames(elements: MessageFormatElement[], acc = new Set<string>()): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
      acc.add(el.value)
    }
    if (el.type === TYPE.select || el.type === TYPE.plural) {
      acc.add(el.value)
      for (const option of Object.values(el.options)) argNames(option.value, acc)
    }
  }
  return acc
}

const sayKeysOf = (flat: Record<string, string>) => Object.keys(flat).filter((key) => !key.startsWith('botTic.'))
const FR = flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))

describe.each(SPEECH_LOCALES)('menteur/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const sayKeys = sayKeysOf(flat)

  it('les mêmes clés que le français, tics compris', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(FR).sort())
  })

  it(`${MENTEUR_SPEECH_KINDS.length} kinds × 3 variantes contiguës, et 4 traits × sure/suspect × 3`, () => {
    const triple = (base: string) => [base, `${base}_2`, `${base}_3`]
    expect(Object.keys(game.botSay).sort()).toEqual(MENTEUR_SPEECH_KINDS.flatMap(triple).sort())
    expect(Object.keys(game.botSayTrait).sort()).toEqual(TRAITS)
    for (const trait of TRAITS) {
      expect(Object.keys(game.botSayTrait[trait]).sort(), trait).toEqual(['sure', 'suspect'].flatMap(triple).sort())
    }
  })

  it('rendu ICU pour (speaker, target) ∈ {f, m, other}² : 70 caractères au plus, le nom présent', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const speaker of GENRES) {
        for (const target of GENRES) {
          const line = String(format.format({ name: NAME, speaker, target }))
          expect([...line].length, `${key} ${speaker}/${target} : ${line}`).toBeLessThanOrEqual(70)
          expect(line, key).toContain(NAME)
        }
      }
    }
  })

  it('apostrophe typographique seule, variantes toutes différentes', () => {
    const byBase = new Map<string, string[]>()
    for (const key of sayKeys) {
      expect(flat[key], key).not.toContain("'")
      const base = key.replace(/_\d+$/, '')
      byBase.set(base, [...(byBase.get(base) ?? []), flat[key]])
    }
    for (const [base, texts] of byBase) expect(new Set(texts).size, base).toBe(texts.length)
  })

  it('ni chiffre, ni mot de boisson (tics exclus), ni argument ICU hors name, speaker et target', () => {
    for (const key of sayKeys) {
      expect(flat[key], key).not.toMatch(/\d/)
      expect([...argNames(parse(flat[key]))].filter((arg) => !ARGS.includes(arg)), key).toEqual([])
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: NAME, speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(DRINK[locale])
      }
    }
  })

  it('« on t’a déjà vue bluffer » : le participe suit le genre de la cible là où la langue l’accorde', () => {
    const seen = (target: (typeof GENRES)[number]) =>
      String(new IntlMessageFormat(game.botSay.again_3, locale).format({ name: NAME, speaker: 'other', target }))
    const expected: Record<string, [string, string]> = {
      fr: ['vue bluffer', 'vu bluffer'],
      it: ['vista bluffare', 'visto bluffare'],
    }
    if (!expected[locale]) return
    expect(seen('f')).toContain(expected[locale][0])
    expect(seen('m')).toContain(expected[locale][1])
    expect(seen('other')).toContain(expected[locale][1])
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot', () => {
    expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
    expect(Object.keys(game.botTic)).toHaveLength(20)
  })
})
