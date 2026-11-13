import { CAP_CARDS, type CapCardId } from './data/cards'
import type { CapCard } from './engine'

/**
 * Chargeur CLIENT de la banque de cartes : seule la langue de la table part au navigateur.
 * L'importeur vit sous lib/cap-ou-pas-cap/ : les quatre morceaux sont précachés hors ligne
 * (src/lib/offline/offline-routes.ts).
 */

export const CAP_LANGS = ['fr', 'en', 'es', 'it'] as const
export type CapLang = (typeof CAP_LANGS)[number]

type CapTexts = Readonly<Record<CapCardId, string>>

// Quatre spécificateurs STATIQUES, jamais import(`./data/${lang}`) : webpack embarquerait tout
// le dossier data/ (tests compris) dans un seul morceau.
const TEXT_LOADERS: Record<CapLang, () => Promise<CapTexts>> = {
  fr: () => import('./data/fr').then((m) => m.CAP_TEXTS),
  en: () => import('./data/en').then((m) => m.CAP_TEXTS),
  es: () => import('./data/es').then((m) => m.CAP_TEXTS),
  it: () => import('./data/it').then((m) => m.CAP_TEXTS),
}

/** Langue de la page → langue des cartes ; inconnue ou absente → français. */
export function capLangOf(locale: string | null | undefined): CapLang {
  return (CAP_LANGS as readonly string[]).includes(locale ?? '') ? (locale as CapLang) : 'fr'
}

export async function loadCapCards(locale: string | null | undefined): Promise<CapCard[]> {
  const texts = await TEXT_LOADERS[capLangOf(locale)]()
  const cards: CapCard[] = []
  for (const meta of CAP_CARDS) {
    const text = texts[meta.id]
    // Une traduction vide ne s'affiche pas en carte blanche : la carte sort de la pioche.
    if (typeof text === 'string' && text.trim().length > 0) cards.push({ ...meta, text })
  }
  return cards
}
