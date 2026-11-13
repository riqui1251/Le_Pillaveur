/**
 * Garde-fous de la banque de cartes de « Cap ou Pas Cap ? », lus par les tests (jamais par
 * l'écran) : aucune carte ne parle d'alcool — le prix seul fait boire, et le mode Sans alcool
 * n'a ainsi rien à filtrer — et `{player}` est le seul jeton admis dans un texte.
 */

import { CAP_PLAYER_TOKEN } from './engine'

export const CAP_TEXT_LANGS = ['fr', 'en', 'es', 'it'] as const
export type CapTextLang = (typeof CAP_TEXT_LANGS)[number]

// Mots ENTIERS, lettres accentuées comprises : « vin » ne doit attraper ni « vingt » ni
// « devine », « shot » ni « screenshot ». Construit à l'appel : le lookbehind ferait planter
// le chargement d'un vieux Safari si ce module partait un jour dans le bundle.
function wholeWords(words: readonly string[], flags: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${words.join('|')})(?!\\p{L})`, flags)
}

/** Mots qui ne s'écrivent qu'en minuscules pour viser la boisson (« ron », pas « Ron Weasley »). */
type AlcoholLexicon = { words: readonly string[]; lowercaseOnly?: readonly string[] }

export const CAP_ALCOHOL_LEXICON: Readonly<Record<CapTextLang, AlcoholLexicon>> = {
  fr: {
    words: [
      'bières?', 'vins?', 'shots?', 'verres?', 'boire', 'buvez', 'buvons', 'boivent', 'buveurs?', 'buveuses?',
      'gorgées?', 'cul[- ]sec', 'alcools?', 'alcoolis(?:é|ée|és|ées)', 'ivres?', 'soûle?s?', 'saoule?s?',
      'gueule de bois', 'apéritifs?', 'cocktails?', 'vodkas?', 'rhums?', 'whiskys?', 'whiskies', 'tequilas?',
      'champagnes?', 'pastis', 'sangrias?', 'mojitos?', 'pintes?', 'binouzes?', 'picoler', 'picole',
      'trinqu(?:er|e|es|ez|ons|ent)',
    ],
  },
  en: {
    words: [
      'beers?', 'wines?', 'shots?', 'booze', 'boozy', 'alcohol', 'alcoholic', 'drunk', 'drunken', 'tipsy',
      'hangovers?', 'cocktails?', 'vodkas?', 'rum', 'whiske?y', 'whiskies', 'tequilas?', 'champagnes?',
      'liquor', 'pints?', 'sips?', 'drink', 'drinks', 'drinking', 'drank', 'chug', 'chugging', 'glass',
    ],
  },
  es: {
    words: [
      'cervezas?', 'vinos?', 'chupitos?', 'copas?', 'c[oó]ctel', 'c[oó]cteles', 'alcohol', 'alcoh[oó]lic[oa]s?',
      'borrach[oa]s?', 'borrachera', 'tragos?', 'beber', 'bebe', 'bebes', 'bebed', 'bebiendo', 'bebido',
      'sorbos?', 'resacas?', 'vodkas?', 'whisky', 'tequilas?', 'champ[aá]n', 'brindis', 'brindar',
    ],
    lowercaseOnly: ['ron'],
  },
  it: {
    words: [
      'birra', 'birre', 'vino', 'vini', 'shots?', 'cocktails?', 'vodka', 'rum', 'whisky', 'tequila', 'champagne',
      'spritz', 'alcol', 'alcool', 'alcolic(?:o|a|i|he)', 'ubriac(?:o|a|hi|he)', 'sbronz[aeio]', 'sorso', 'sorsi',
      'bicchiere', 'bicchieri', 'bere', 'bevi', 'bevete', 'bevuto', 'bevendo', 'brindisi', 'brindare', 'brindiamo',
    ],
  },
}

/** Mots d'alcool trouvés dans un texte de carte, dans l'ordre du lexique. */
export function capAlcoholWords(text: string, lang: CapTextLang): string[] {
  const lexicon = CAP_ALCOHOL_LEXICON[lang]
  const patterns = [wholeWords(lexicon.words, 'iu')]
  if (lexicon.lowercaseOnly) patterns.push(wholeWords(lexicon.lowercaseOnly, 'u'))
  const hits: string[] = []
  for (const pattern of patterns) {
    const found = text.match(new RegExp(pattern.source, `${pattern.flags}g`))
    if (found) hits.push(...found)
  }
  return hits
}

/** Jetons ou accolades orphelines autres que {player} : ils s'afficheraient bruts. */
export function capStrayTokens(text: string): string[] {
  const rest = text.split(CAP_PLAYER_TOKEN).join(' ')
  return rest.match(/\{[^{}]*\}|[{}]/g) ?? []
}
