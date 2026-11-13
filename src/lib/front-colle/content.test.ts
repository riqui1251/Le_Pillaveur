import { describe, expect, it } from 'vitest'
import { FC_MODES, FC_THEMES, type FcWord } from './data/types'
import { FC_WORDS as WORDS_FR } from './data/fr'
import { FC_WORDS as WORDS_EN } from './data/en'
import { FC_WORDS as WORDS_ES } from './data/es'
import { FC_WORDS as WORDS_IT } from './data/it'
import { FC_LANGS, loadFcWords, type FcLang } from './load'

/** Fiche du jeu : 9 thèmes × 45 mots par langue. */
const WORDS_PER_THEME = 45

const BANKS: Record<FcLang, readonly FcWord[]> = { fr: WORDS_FR, en: WORDS_EN, es: WORDS_ES, it: WORDS_IT }

/**
 * Aucun mot ne parle d'alcool : le mode Sans alcool n'a ainsi rien à filtrer.
 * Bornes de mot Unicode (\b ignore les lettres accentuées) ; quelques
 * homonymes innocents sont épargnés (Vin Diesel, le lancer du poids…).
 */
const word = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu')
const ALCOHOL: Record<FcLang, RegExp> = {
  fr: word(
    'bières?|vins?(?!\\s+diesel)|shots?|verres?|boire|gorgées?|cul[- ]sec|apéros?|apéritifs?|alcools?|ivres?|ivresse|' +
      'cocktails?|vodkas?|whiskys?|whiskies|rhums?|champagnes?|pastis|tequilas?|téquilas?|sangrias?|mojitos?|cidres?|' +
      'pinard|picoler|soûls?|saouls?|barmans?|barmaids?|sommeliers?|sommelières?|brasseries? artisanales?'
  ),
  en: word(
    'beers?|wines?|shots?(?!\\s+put)|booze|boozy|drunk|drunken|sips?|alcohol|alcoholic|cocktails?|vodkas?|whiske?ys?|' +
      'whiskies|rum|champagnes?|tequilas?|gin|liquors?|lager|cider|hangover|tipsy|pubs?|bartenders?|barmaids?|sommeliers?'
  ),
  es: word(
    'cervezas?|vinos?|chupitos?|cócteles|cóctel|cocteles|coctel|alcohol|borrach[oa]s?|tragos?|beber|resaca|vodkas?|' +
      'whiskys?|champán|champaña|tequilas?|sangrías?|mojitos?|sidras?|calimocho|botellón|barman|cantineros?|sumiller'
  ),
  it: word(
    'birr[ae]|vin[oi]|shots?|rum|cocktails?|vodka|whisky|alcol|alcool|ubriac[oaie]|sbronz[ae]|sors[oi]|bicchier[ei]|' +
      'bere|grappa|limoncello|spritz|prosecco|champagne|tequila|sidro|barman|sommelier'
  ),
}

/** Comparaison sans casse ni accents, pour les doublons. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

describe.each(FC_LANGS)('banque de mots — %s', (lang) => {
  const words = BANKS[lang]

  it('ids uniques, préfixés par la langue', () => {
    const ids = words.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const foreign = ids.filter((id) => !id.startsWith(`${lang}-`))
    expect(foreign, foreign.join(', ')).toEqual([])
  })

  it(`au moins ${WORDS_PER_THEME} mots par thème, sur les neuf thèmes`, () => {
    for (const theme of FC_THEMES) {
      const count = words.filter((entry) => entry.theme === theme).length
      expect(count, theme).toBeGreaterThanOrEqual(WORDS_PER_THEME)
    }
    const unknown = words.filter((entry) => !(FC_THEMES as readonly string[]).includes(entry.theme))
    expect(unknown.map((entry) => entry.id)).toEqual([])
  })

  it('mots non vides, sans doublon, lisibles de loin', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const entry of words) {
      expect(entry.word.trim().length, entry.id).toBeGreaterThan(0)
      expect(entry.word.length, entry.id).toBeLessThanOrEqual(40)
      const key = normalize(entry.word)
      const first = seen.get(key)
      if (first) duplicates.push(`${first} = ${entry.id}`)
      else seen.set(key, entry.id)
    }
    expect(duplicates, duplicates.join('\n')).toEqual([])
  })

  it('consignes connues ; « décris » toujours permis, « fredonne » réservé à la musique', () => {
    const problems: string[] = []
    for (const entry of words) {
      if (entry.modes.length === 0 || !entry.modes.every((mode) => (FC_MODES as readonly string[]).includes(mode))) {
        problems.push(`${entry.id} : consignes inconnues`)
      }
      if (!entry.modes.includes('describe')) problems.push(`${entry.id} : sans « décris »`)
      if (entry.modes.includes('hum') && entry.theme !== 'musique') problems.push(`${entry.id} : « fredonne » hors musique`)
    }
    expect(problems, problems.join('\n')).toEqual([])
    expect(words.some((entry) => entry.theme === 'musique' && entry.modes.includes('hum'))).toBe(true)
  })

  it('aucun mot ne parle d’alcool', () => {
    const offenders = words.filter((entry) => ALCOHOL[lang].test(entry.word)).map((entry) => `${entry.id} : ${entry.word}`)
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('le chargeur client rend la banque de la langue', async () => {
    const loaded = await loadFcWords(lang)
    expect(loaded.length).toBe(words.length)
    expect(loaded.every((entry) => entry.id.startsWith(`${lang}-`))).toBe(true)
  })
})

describe('détecteur d’alcool', () => {
  it('attrape les mots d’alcool, pas les homonymes innocents', () => {
    expect(ALCOHOL.fr.test('Verre de vin')).toBe(true)
    expect(ALCOHOL.fr.test('Cul sec')).toBe(true)
    expect(ALCOHOL.fr.test('Vin Diesel')).toBe(false)
    expect(ALCOHOL.fr.test('Vingt-et-un')).toBe(false)
    expect(ALCOHOL.fr.test('Livre')).toBe(false)
    expect(ALCOHOL.en.test('Shot put')).toBe(false)
    expect(ALCOHOL.en.test('Beer pong')).toBe(true)
    expect(ALCOHOL.es.test('Copa del Mundo')).toBe(false)
    expect(ALCOHOL.es.test('Cerveza')).toBe(true)
    expect(ALCOHOL.it.test('Bicchiere')).toBe(true)
    expect(ALCOHOL.it.test('Vincenzo')).toBe(false)
  })
})
