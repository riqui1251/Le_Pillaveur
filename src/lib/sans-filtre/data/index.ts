import { SF_BLACKS_FR, SF_WHITES_FR, type SFContentCard } from './cards.fr'

export { SF_BLACKS_FR, SF_WHITES_FR }
export type { SFContentCard, SFTone } from './cards.fr'

/**
 * Pool de cartes selon l'ambiance de la table : en Soft, seules les cartes
 * `tone: 'soft'` (rien sur l'alcool ni de gaudriole) ; en Apéro, tout.
 * Contenu FR-only — voir la charte en tête de cards.fr.ts.
 */
export function sfContentFor(ambiance: 'soft' | 'alcool'): {
  blacks: string[]
  whites: string[]
} {
  const keep = (c: SFContentCard) => ambiance === 'alcool' || c.tone === 'soft'
  return {
    blacks: SF_BLACKS_FR.filter(keep).map((c) => c.text),
    whites: SF_WHITES_FR.filter(keep).map((c) => c.text),
  }
}
