import type { DilCard } from '../engine'
import type { DilContentCard } from './types'
import { DIL_CARDS_FR } from './fr'
import { DIL_CARDS_EN } from './en'
import { DIL_CARDS_ES } from './es'
import { DIL_CARDS_IT } from './it'

export { DIL_CARDS_FR, DIL_CARDS_EN, DIL_CARDS_ES, DIL_CARDS_IT }
export type { DilContentCard, DilTone } from './types'

export type DilLang = 'fr' | 'en' | 'es' | 'it'

/** Paquets par langue : le français fait référence, les trois autres le suivent carte pour carte. */
export const DIL_DECKS: Record<DilLang, DilContentCard[]> = {
  fr: DIL_CARDS_FR,
  en: DIL_CARDS_EN,
  es: DIL_CARDS_ES,
  it: DIL_CARDS_IT,
}

/**
 * Pool selon l'ambiance de la table (Soft = cartes sages uniquement).
 * Le mode COQUIN (opt-in de l'hôte au lobby) ajoute les cartes 🌶️ —
 * indépendant de l'ambiance : c'est adulte, pas alcoolisé. Les cartes sont
 * tirées dans la LANGUE de la salle ; une langue absente ou inconnue vaut le
 * français.
 */
export function dilContentFor(
  ambiance: 'soft' | 'alcool',
  coquin: boolean = false,
  lang: string | null | undefined = 'fr'
): DilCard[] {
  const deck = DIL_DECKS[(lang || 'fr') as DilLang] ?? DIL_DECKS.fr
  return deck.filter((c) => {
    if (c.tone === 'coquin') return coquin
    return ambiance === 'alcool' || c.tone === 'soft'
  }).map(({ tone: _tone, ...card }) => {
    void _tone
    return card as DilCard
  })
}
