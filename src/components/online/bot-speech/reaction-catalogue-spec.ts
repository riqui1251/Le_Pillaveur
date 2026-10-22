import { describe, expect, it } from 'vitest'
// Le moteur ICU de next-intl et son parseur : ce qui se lit ici se rend pareil à l'écran.
import { IntlMessageFormat } from 'intl-messageformat'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
  type SpeechCatalogue,
} from './catalogue-spec'

/**
 * FABRIQUE DE TESTS du catalogue d'un jeu à RÉACTIONS (Tabou, Crobard, Mots
 * Codés) — importée par les tests de chaque jeu, jamais par l'application.
 * Les exigences communes des jeux à paroles (describeSpeechCatalogue), puis,
 * langue par langue :
 *   • aucune phrase ne parle de boire, ni n'écrit un chiffre : la TV comme un
 *     téléphone en ambiance « Sans alcool » lisent les mêmes bulles ;
 *   • les tics sont ceux du Loup-Garou, mot pour mot ; un tic qui trinque
 *     (« …tchin ! ») a sa variante `botTicSoft`, lue en ambiance soft, et un
 *     tic retouché pour le jeu (`botTicAlt`) garde la ponctuation finale de
 *     l'original (tic-overrides.ts), les deux sans boisson ;
 *   • les phrases ne lisent que `name`, `speaker` et `target` : aucun argument
 *     ne peut y glisser le mot à deviner ni une case de la grille.
 */

/** Les mots de la boisson ; « santé » seul, pas le « plaisante » du tic de Paulette. */
export const DRINK: Record<string, RegExp> = {
  fr: /gorg[ée]|\bboi[rst]|\bbu\b|\bbuv|verre|cul sec|\bsant[ée](?![a-z])|tchin|trinqu|ap[ée]ro/i,
  en: /\bdrinks?\b|\bdrank|\bsips?\b|\bshots?\b|cheers|booze|\bpints?\b|\bglass/i,
  es: /\bbeb[eiao]|trago|sorbo|chupito|\bsalud\b|\bcopas?\b|\bvasos?\b|brind/i,
  it: /\bber[ei]\b|\bbev[eio]|sors[oi]|bicchier|cin cin|\bsalute\b|brind/i,
}

const GENRES = ['f', 'm', 'other'] as const
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

type ReactionCatalogue = SpeechCatalogue & {
  /** Tics retouchés en ambiance « Sans alcool » (tic-overrides.ts). */
  botTicSoft?: Record<string, string>
  /** Tics retouchés pour ce jeu, toujours (un mot de la pioche dans le tic). */
  botTicAlt?: Record<string, string>
  feedAria?: string
}

/**
 * Minuscules, ponctuation et chiffres en espaces, mots bordés d'espaces. Les
 * accents restent : « maïs » n'est pas « mais », « tôt » n'est pas « tot ».
 */
export function wordsOf(text: string): string {
  const plain = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')
    .trim()
  return ` ${plain} `
}

/**
 * Le mot à faire deviner n'apparaît pas même PAR HASARD dans une bulle :
 * aucune phrase (toute variante, tout genre), aucun tic, aucune variante sans
 * alcool du catalogue ne contient un mot de la pioche de sa langue, mot
 * entier, casse ignorée. Le planificateur ne lit jamais le mot, une bulle ne
 * dit donc rien de lui ; c'est le texte figé qui doit en être exempt, pour
 * qu'aucun devineur ne lise « parapluie » pendant qu'on lui dessine un
 * parapluie.
 */
export function describeNoSecretWords(node: string, secrets: (locale: string) => readonly string[]): void {
  describe.each(SPEECH_LOCALES)(`${node} — aucune bulle ne contient un mot de la pioche (%s)`, (locale) => {
    it('phrases (toute variante, tout genre), tics et tics sans alcool', () => {
      const game = speechCatalogueOf(node, locale) as ReactionCatalogue
      const flat = flattenSpeechCatalogue(game)
      const lines: [string, string][] = []
      for (const [key, template] of Object.entries(flat)) {
        if (key.startsWith('botTic.')) continue
        const format = new IntlMessageFormat(template, locale)
        for (const speaker of GENRES) {
          for (const target of GENRES) lines.push([key, String(format.format({ name: '', speaker, target }))])
        }
      }
      // Les tics tels que la bulle les montre : retouchés pour le jeu, puis en ambiance soft.
      for (const [key, tic] of Object.entries({ ...game.botTic, ...game.botTicAlt })) lines.push([`botTic.${key}`, tic])
      for (const [key, tic] of Object.entries(game.botTicSoft ?? {})) lines.push([`botTicSoft.${key}`, tic])
      const banned = [...new Set(secrets(locale).map(wordsOf))].filter((w) => w.trim().length > 0)
      const hits: string[] = []
      for (const [key, line] of lines) {
        const plain = wordsOf(line)
        for (const word of banned) if (plain.includes(word)) hits.push(`${key} : « ${line} » contient «${word}»`)
      }
      expect([...new Set(hits)]).toEqual([])
    })
  })
}

export function describeReactionCatalogue({
  node,
  kinds,
  traitKinds,
  personaKind,
}: {
  /** Namespace du jeu : `games.<jeu>.game`. */
  node: string
  kinds: readonly string[]
  traitKinds: readonly string[]
  personaKind: string
}): void {
  describeSpeechCatalogue({ node, kinds, traitKinds, personaKind, maxChars: 70 })

  const FR = flattenSpeechCatalogue(speechCatalogueOf(node, 'fr'))

  describe.each(SPEECH_LOCALES)(`${node} — réactions (%s)`, (locale) => {
    const game = speechCatalogueOf(node, locale) as ReactionCatalogue
    const flat = flattenSpeechCatalogue(game)
    const sayKeys = Object.keys(flat).filter((key) => !key.startsWith('botTic.'))

    it('les mêmes clés que le français, tics compris, et un libellé pour le fil', () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(FR).sort())
      expect(game.feedAria?.trim()).toBeTruthy()
    })

    it('ni chiffre, ni mot de boisson, ni argument ICU hors name, speaker et target', () => {
      for (const key of sayKeys) {
        expect(flat[key], key).not.toMatch(/\d/)
        expect([...argNames(parse(flat[key]))].filter((arg) => !ARGS.includes(arg)), key).toEqual([])
        const format = new IntlMessageFormat(flat[key], locale)
        for (const speaker of GENRES) {
          for (const target of GENRES) {
            const line = String(format.format({ name: 'Mauricette', speaker, target }))
            expect(line, `${key} : ${line}`).not.toMatch(DRINK[locale])
          }
        }
      }
    })

    it('les 20 tics du Loup-Garou, mot pour mot ; ceux qui trinquent ont leur variante sans alcool', () => {
      expect(game.botTic).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
      const soft = game.botTicSoft ?? {}
      const alt = game.botTicAlt ?? {}
      const effective = { ...game.botTic, ...alt }
      for (const [key, tic] of Object.entries(effective)) {
        if (DRINK[locale].test(tic)) expect(soft[key], `${key} : ${tic}`).toBeTruthy()
      }
      expect(new Set(Object.values(effective)).size).toBe(Object.keys(game.botTic).length)
      for (const [key, tic] of [...Object.entries(soft), ...Object.entries(alt)]) {
        expect(game.botTic, key).toHaveProperty(key)
        expect(tic, key).not.toMatch(DRINK[locale])
        expect(tic, key).not.toContain('{')
        expect(tic.trim(), key).toBe(tic)
        expect([...tic].length, key).toBeLessThanOrEqual(30)
        // Même ponctuation finale : un préfixe à virgule continue la phrase, un autre la précède.
        expect(tic.slice(-1), `${key} : ${tic}`).toBe(game.botTic[key].slice(-1))
      }
    })
  })
}
