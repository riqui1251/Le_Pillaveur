export const FC_THEMES = [
  'cinema',
  'personnalites',
  'objets',
  'animaux',
  'metiers',
  'lieux',
  'cuisine',
  'sport',
  'musique',
] as const
export type FcTheme = (typeof FC_THEMES)[number]

export const FC_MODES = ['describe', 'mime', 'hum'] as const
export type FcMode = (typeof FC_MODES)[number]

/** Mot à faire deviner. Les listes sont propres à chaque langue (ce ne sont pas des traductions). */
export type FcWord = {
  readonly id: string
  readonly theme: FcTheme
  readonly word: string
  readonly modes: readonly FcMode[]
}
