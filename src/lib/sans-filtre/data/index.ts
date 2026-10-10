import { SF_BLACKS_FR, SF_WHITES_FR, type SFContentCard } from './cards.fr'
import { SF_BLACKS_EN, SF_WHITES_EN } from './cards.en'
import { SF_BLACKS_ES, SF_WHITES_ES } from './cards.es'
import { SF_BLACKS_IT, SF_WHITES_IT } from './cards.it'

export { SF_BLACKS_FR, SF_WHITES_FR, SF_BLACKS_EN, SF_WHITES_EN, SF_BLACKS_ES, SF_WHITES_ES, SF_BLACKS_IT, SF_WHITES_IT }
export type { SFContentCard, SFTone } from './cards.fr'

export type SFLang = 'fr' | 'en' | 'es' | 'it'

/** Paquets par langue : le français fait référence, les trois autres le suivent carte pour carte. */
export const SF_DECKS: Record<SFLang, { blacks: SFContentCard[]; whites: SFContentCard[] }> = {
  fr: { blacks: SF_BLACKS_FR, whites: SF_WHITES_FR },
  en: { blacks: SF_BLACKS_EN, whites: SF_WHITES_EN },
  es: { blacks: SF_BLACKS_ES, whites: SF_WHITES_ES },
  it: { blacks: SF_BLACKS_IT, whites: SF_WHITES_IT },
}

/**
 * Pool de cartes selon l'ambiance de la table : en Soft, seules les cartes
 * `tone: 'soft'` (rien sur l'alcool ni de gaudriole) ; en Apéro, tout. Les
 * cartes sont tirées dans la LANGUE de la salle (posée à sa création) ; une
 * langue absente ou inconnue vaut le français.
 */
export function sfContentFor(
  ambiance: 'soft' | 'alcool',
  lang: string | null | undefined = 'fr'
): {
  blacks: string[]
  whites: string[]
} {
  const deck = SF_DECKS[(lang || 'fr') as SFLang] ?? SF_DECKS.fr
  const keep = (c: SFContentCard) => ambiance === 'alcool' || c.tone === 'soft'
  return {
    blacks: deck.blacks.filter(keep).map((c) => c.text),
    whites: deck.whites.filter(keep).map((c) => c.text),
  }
}
