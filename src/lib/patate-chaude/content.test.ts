import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PC_THEME_IDS, type PcThemeId } from './data/themes'
import type { PcLanguageBank } from './data/types'
import { PC_BANK as BANK_FR } from './data/fr'
import { PC_BANK as BANK_EN } from './data/en'
import { PC_BANK as BANK_ES } from './data/es'
import { PC_BANK as BANK_IT } from './data/it'
import { normalizeWord } from './engine'
import { PC_LANGS, loadPcBank, pcChallengeSource, pcLangOf, type PcLang } from './load'

/**
 * Banques de défis vues par le CODE du jeu (le contenu lui-même appartient à data/) : ce que le
 * moteur suppose, et l'absence d'alcool. Aucun contenu ne parle d'alcool, si bien que le mode
 * Soft n'a rien à filtrer : la même pioche sert les deux ambiances.
 */

const BANKS: Readonly<Record<PcLang, PcLanguageBank<PcThemeId>>> = { fr: BANK_FR, en: BANK_EN, es: BANK_ES, it: BANK_IT }

/** Lettres d'un mot (accents et ligatures compris) : ce qui n'en est pas sépare deux mots. */
const L = 'a-zà-öø-ÿœæ'
const words = (alternatives: string) => new RegExp(`(?:^|[^${L}])(?:${alternatives})(?=$|[^${L}])`, 'i')

/** Mots d'alcool par langue, bornés (« vin » ne prend ni « vingt » ni « divin »). */
const ALCOHOL: Record<PcLang, RegExp> = {
  fr: words(
    'bières?|vins?|shots?|verres?|boire|buveu(?:r|se)s?|gorgées?|cul[ -]sec|apéros?|apéritifs?|alcools?|alcoolisée?s?|ivres?|ivresse|cocktails?|vodkas?|rhums?|whiskys?|pastis|champagnes?|tequilas?|pintes?|trinquer|liqueurs?|sangrias?|mojitos?|spritz|picoler|soûle?s?|saoule?s?'
  ),
  en: words(
    'beers?|wines?|shots?|glass(?:es)?|booze|boozy|alcohol|alcoholic|drunk(?:en)?|sips?|sipping|cocktails?|vodkas?|rums?|whiske?ys?|tequilas?|champagnes?|pints?|liquors?|liqueurs?|hangovers?|tipsy|bartenders?'
  ),
  es: words(
    'cervezas?|vinos?|chupitos?|vasos?|beber|alcohol(?:es)?|alcohólic[oa]s?|borrach[oa]s?|borrachera|tragos?|sorbos?|cócteles?|cóctel|coctel(?:es)?|vodkas?|ron|whiskys?|tequilas?|champán|champaña|sangrías?|resacas?|brindar|brindis|cubatas?|birras?'
  ),
  it: words(
    'birr[ae]|vin[oi]|shot|bicchier[ei]|bere|bevut[oaie]|alcol|alcool|alcolic[oaie]|ubriac(?:o|a|hi|he)|sbronz[oaie]|sors[oi]|cocktail|vodka|rum|whisky|grappa|spritz|aperitiv[oi]|brindare|brindisi|champagne|prosecco|tequila|limoncello'
  ),
}

describe('patate-chaude — banques de défis', () => {
  for (const lang of PC_LANGS) {
    const bank = BANKS[lang]

    it(`${lang} : un texte non vide pour chaque thème commun`, () => {
      const missing = PC_THEME_IDS.filter((id) => typeof bank.themes[id] !== 'string' || !bank.themes[id].trim())
      expect(missing).toEqual([])
    })

    it(`${lang} : aucun thème ne parle d’alcool`, () => {
      const offenders = PC_THEME_IDS.filter((id) => ALCOHOL[lang].test(bank.themes[id])).map(
        (id) => `${id} : ${bank.themes[id]}`
      )
      expect(offenders, offenders.join('\n')).toEqual([])
    })

    it(`${lang} : lettres jouables, une majuscule chacune, sans doublon`, () => {
      expect(bank.letters.length).toBeGreaterThan(0)
      for (const letter of bank.letters) {
        expect(letter.length, letter).toBe(1)
        expect(letter, letter).toBe(letter.toUpperCase())
        // Le moteur compare des formes normalisées : chaque lettre doit en garder une.
        expect(normalizeWord(letter), letter).toMatch(/^[a-z]$/)
      }
      expect(new Set(bank.letters).size).toBe(bank.letters.length)
    })

    it(`${lang} : syllabes de 2 à 3 lettres, en majuscules, sans accent ni doublon`, () => {
      expect(bank.syllables.length).toBeGreaterThan(0)
      const malformed = bank.syllables.filter((syllable) => !/^[A-Z]{2,3}$/.test(syllable))
      expect(malformed).toEqual([])
      expect(new Set(bank.syllables).size).toBe(bank.syllables.length)
    })

    it(`${lang} : la source du moteur garde tous les thèmes, lettres et syllabes`, () => {
      const source = pcChallengeSource(bank)
      expect(source.themes.map((theme) => theme.id)).toEqual([...PC_THEME_IDS])
      expect(source.letters).toEqual([...bank.letters])
      expect(source.syllables).toEqual([...bank.syllables])
    })
  }

  it('le détecteur d’alcool voit les mots, pas les morceaux de mots', () => {
    expect(ALCOHOL.fr.test('Un bon vin rouge')).toBe(true)
    expect(ALCOHOL.fr.test('Un truc qu’on boit cul sec')).toBe(true)
    expect(ALCOHOL.fr.test('Une gorgée')).toBe(true)
    expect(ALCOHOL.fr.test('Un nombre à vingt chiffres, un livre divin')).toBe(false)
    expect(ALCOHOL.en.test('A craft beer')).toBe(true)
    expect(ALCOHOL.en.test('A drum, a spectrum')).toBe(false)
    expect(ALCOHOL.es.test('Una botella de ron')).toBe(true)
    expect(ALCOHOL.es.test('Un patrón, una ronda')).toBe(false)
    expect(ALCOHOL.it.test('Un sorso di vino')).toBe(true)
    expect(ALCOHOL.it.test('Un forum, un vinile')).toBe(false)
  })

  it('le chargeur sert la langue de la page, et le français pour une langue inconnue', async () => {
    expect(pcLangOf('it')).toBe('it')
    expect(pcLangOf('de')).toBe('fr')
    expect(pcLangOf(undefined)).toBe('fr')
    expect(await loadPcBank('es')).toEqual(pcChallengeSource(BANK_ES))
    expect(await loadPcBank('de')).toEqual(pcChallengeSource(BANK_FR))
  })

  it('le chargeur garde un import() statique par langue (un morceau chacun, précaché hors ligne)', () => {
    const source = readFileSync(new URL('./load.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const lang of PC_LANGS) expect(source).toContain(`import('./data/${lang}')`)
    // Un gabarit ferait embarquer tout data/ (tests compris) dans un seul morceau.
    expect(source).not.toMatch(/import\(\s*`/)
  })
})
