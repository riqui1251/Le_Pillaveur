export const CAP_THEMES = ['souvenirs', 'coeur', 'defis', 'comedie', 'telephone', 'table'] as const
export type CapTheme = (typeof CAP_THEMES)[number]

export const CAP_LEVELS = ['apero', 'soiree', 'apres-minuit'] as const
export type CapLevel = (typeof CAP_LEVELS)[number]

export const CAP_KINDS = ['truth', 'dare'] as const
export type CapKind = (typeof CAP_KINDS)[number]

export type CapPrice = 1 | 2 | 3 | 4 | 5

/** Méta neutre d'une carte, commune aux 4 langues ; le texte vit dans data/<langue>.ts, indexé par id. */
export type CapCardMeta = {
  readonly id: string
  readonly theme: CapTheme
  readonly level: CapLevel
  readonly kind: CapKind
  readonly price: CapPrice
}
