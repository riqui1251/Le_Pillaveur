export const VDN_THEMES = ['corps', 'geographie', 'histoire', 'sciences', 'sport', 'societe', 'culture'] as const
export type VdnTheme = (typeof VDN_THEMES)[number]

/** Méta neutre d'une question, commune aux 4 langues : la réponse est la même partout, sans conversion d'unité. */
export type VdnQuestionMeta = {
  readonly id: string
  readonly theme: VdnTheme
  readonly answer: number
  /** Plus petite estimation acceptée (0 par défaut). */
  readonly min?: number
  /** La réponse est une année : « dans le mille » s'y juge à un an près, pas à 2 % du millésime. */
  readonly year?: boolean
  /**
   * …une année AVANT notre ère (753 pour « 753 av. J.-C. ») : le bot en ligne bruite alors le
   * nombre lui-même, pas l'ancienneté comptée depuis aujourd'hui.
   */
  readonly bce?: boolean
}

/** Textes d'une question dans une langue. */
export type VdnQuestionText = {
  readonly text: string
  readonly unit: string
  readonly source: string
}
