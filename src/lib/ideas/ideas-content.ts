import fs from 'fs'
import path from 'path'

/**
 * Pages « idées » SEO (/idees/<slug>) : des listes de questions recherchées
 * telles quelles (« je n'ai jamais questions », « tu préfères soirée »,
 * « action ou vérité »), tirées des cartes du jeu qui les contient — Dilemmes
 * (src/lib/dilemmes/data/index.ts) ou Cap ou Pas Cap (src/lib/cap-ou-pas-cap/data/fr.ts).
 * Un article markdown français par liste dans docs/ideas/fr/, comme les
 * règles (docs/rules/fr/) : embarqué tel quel dans l'image Docker.
 */

export const IDEAS_SLUGS = ['je-n-ai-jamais', 'tu-preferes', 'action-ou-verite'] as const
export type IdeasSlug = (typeof IDEAS_SLUGS)[number]

export function isIdeasSlug(value: string): value is IdeasSlug {
  return (IDEAS_SLUGS as readonly string[]).includes(value)
}

/** Métadonnées SEO par page (titre absolu ≤ 60, description ≤ 160) et jeu dont viennent les cartes. */
export const IDEAS_META: Record<IdeasSlug, { title: string; description: string; gameId: string }> = {
  'je-n-ai-jamais': {
    title: 'Je n’ai jamais : 50 questions pour une soirée entre amis',
    description:
      '50 « Je n’ai jamais » drôles et sans malaise, tirés des cartes de Dilemmes. Avec ou sans alcool, puis jouez-y en ligne : gratuit, de 3 à 16 joueurs.',
    gameId: 'dilemmes',
  },
  'tu-preferes': {
    title: 'Tu préfères : 60 questions drôles pour une soirée',
    description:
      '60 questions « Tu préfères » drôles et sans malaise, tirées des cartes de Dilemmes. Avec ou sans alcool, puis jouez-y en ligne : gratuit, de 3 à 16 joueurs.',
    gameId: 'dilemmes',
  },
  'action-ou-verite': {
    title: 'Action ou vérité : 60 idées d’actions et de vérités',
    description:
      '60 idées d’action ou vérité par thème, tirées des cartes de Cap ou Pas Cap. Avec ou sans alcool, sur un seul téléphone : gratuit, dès 2 joueurs.',
    gameId: 'cap-ou-pas-cap',
  },
}

const IDEAS_ROOT = path.join(process.cwd(), 'docs', 'ideas', 'fr')

export function loadIdeasDoc(slug: IdeasSlug): string | null {
  try {
    return fs.readFileSync(path.join(IDEAS_ROOT, `${slug}.md`), 'utf-8')
  } catch {
    return null
  }
}
