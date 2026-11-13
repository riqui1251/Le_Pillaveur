/** Banque d'une langue : thèmes indexés par les ids communs de data/themes.ts, lettres et syllabes propres à la langue. */
export type PcLanguageBank<ThemeId extends string> = {
  readonly themes: Readonly<Record<ThemeId, string>>
  /** Lettres jouables, en majuscules, sans les lettres trop rares dans la langue. */
  readonly letters: readonly string[]
  /** Syllabes fréquentes de 2 à 3 lettres, en majuscules, sans accent. */
  readonly syllables: readonly string[]
}
