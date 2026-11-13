import { FC_MODES, FC_THEMES, type FcMode, type FcWord } from './data/types'

/**
 * Chargeur CLIENT de la banque de mots : seule la langue de la page part au
 * navigateur. L'importeur vit sous lib/front-colle/ : les quatre morceaux sont
 * précachés hors ligne (src/lib/offline/offline-routes.ts).
 */

export const FC_LANGS = ['fr', 'en', 'es', 'it'] as const
export type FcLang = (typeof FC_LANGS)[number]

// Quatre spécificateurs STATIQUES, jamais import(`./data/${lang}`) : webpack
// embarquerait tout le dossier data/ (tests compris) dans un seul morceau.
const WORD_LOADERS: Record<FcLang, () => Promise<readonly FcWord[]>> = {
  fr: () => import('./data/fr').then((m) => m.FC_WORDS),
  en: () => import('./data/en').then((m) => m.FC_WORDS),
  es: () => import('./data/es').then((m) => m.FC_WORDS),
  it: () => import('./data/it').then((m) => m.FC_WORDS),
}

/** Langue de la page → langue des mots ; inconnue ou absente → français. */
export function fcLangOf(locale: string | null | undefined): FcLang {
  return (FC_LANGS as readonly string[]).includes(locale ?? '') ? (locale as FcLang) : 'fr'
}

/** Entrées jouables seulement : thème connu, mot non vide, id unique ; « décris » toujours permis. */
export function cleanFcWords(words: readonly FcWord[]): FcWord[] {
  const seen = new Set<string>()
  const clean: FcWord[] = []
  for (const entry of words) {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue
    if (typeof entry.word !== 'string' || entry.word.trim().length === 0) continue
    if (!(FC_THEMES as readonly string[]).includes(entry.theme)) continue
    const listed = Array.isArray(entry.modes) ? entry.modes : []
    const modes: FcMode[] = FC_MODES.filter((mode) => mode === 'describe' || listed.includes(mode))
    seen.add(entry.id)
    clean.push({ id: entry.id, theme: entry.theme, word: entry.word.trim(), modes })
  }
  return clean
}

export async function loadFcWords(locale: string | null | undefined): Promise<FcWord[]> {
  const lang = fcLangOf(locale)
  const words = cleanFcWords(await WORD_LOADERS[lang]())
  // Banque vide (contenu en cours d'écriture) : on joue en français plutôt que sans mots.
  if (words.length === 0 && lang !== 'fr') return cleanFcWords(await WORD_LOADERS.fr())
  return words
}
