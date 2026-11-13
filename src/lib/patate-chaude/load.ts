import { PC_THEME_IDS, type PcThemeId } from './data/themes'
import type { PcLanguageBank } from './data/types'
import type { PcChallengeSource } from './engine'

/**
 * Chargeur CLIENT de la banque de défis : seule la langue de la page part au navigateur.
 * L'importeur vit sous lib/patate-chaude/ : les quatre morceaux sont précachés hors ligne
 * (src/lib/offline/offline-routes.ts). Le serveur en ligne lira les banques sans passer par ici.
 */

export const PC_LANGS = ['fr', 'en', 'es', 'it'] as const
export type PcLang = (typeof PC_LANGS)[number]

type PcBank = PcLanguageBank<PcThemeId>

// Quatre spécificateurs STATIQUES, jamais import(`./data/${lang}`) : webpack embarquerait tout le
// dossier data/ (tests compris) dans un seul morceau.
const BANK_LOADERS: Record<PcLang, () => Promise<PcBank>> = {
  fr: () => import('./data/fr').then((m) => m.PC_BANK),
  en: () => import('./data/en').then((m) => m.PC_BANK),
  es: () => import('./data/es').then((m) => m.PC_BANK),
  it: () => import('./data/it').then((m) => m.PC_BANK),
}

/** Langue de la page → langue des défis ; inconnue ou absente → français. */
export function pcLangOf(locale: string | null | undefined): PcLang {
  return (PC_LANGS as readonly string[]).includes(locale ?? '') ? (locale as PcLang) : 'fr'
}

/** Banque d'une langue → source du moteur. Une entrée vide sort du tirage au lieu de s'afficher en carte blanche. */
export function pcChallengeSource(bank: PcBank): PcChallengeSource {
  const themes: { id: string; text: string }[] = []
  for (const id of PC_THEME_IDS) {
    const text = bank.themes[id]
    if (typeof text === 'string' && text.trim()) themes.push({ id, text: text.trim() })
  }
  const clean = (list: readonly string[]) => list.map((item) => item.trim()).filter((item) => item.length > 0)
  return { themes, letters: clean(bank.letters), syllables: clean(bank.syllables) }
}

export async function loadPcBank(locale: string | null | undefined): Promise<PcChallengeSource> {
  return pcChallengeSource(await BANK_LOADERS[pcLangOf(locale)]())
}
