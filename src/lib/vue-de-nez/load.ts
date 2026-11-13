import { VDN_QUESTIONS, type VdnQuestionId } from './data/questions'
import type { VdnQuestionMeta, VdnQuestionText, VdnTheme } from './data/types'
import { vdnShownUnit } from './unit'

/**
 * Chargeur CLIENT de la banque du jeu LOCAL : seule la langue de la page part
 * au navigateur. L'importeur vit sous lib/vue-de-nez/ : les quatre morceaux
 * sont précachés hors ligne (src/lib/offline/offline-routes.ts).
 *
 * La version en ligne ne doit JAMAIS passer par ici : la méta contient les
 * réponses, que le serveur seul détient (garde d'imports dans content.test.ts).
 */

export const VDN_LANGS = ['fr', 'en', 'es', 'it'] as const
export type VdnLang = (typeof VDN_LANGS)[number]

export type VdnTexts = Readonly<Record<VdnQuestionId, VdnQuestionText>>

/** Une question prête à jouer dans une langue : méta neutre + textes. */
export type VdnQuestion = {
  id: string
  theme: VdnTheme
  answer: number
  /** Plus petite estimation admise (0 par défaut). */
  min: number
  /** Réponse-année : le moteur juge alors « dans le mille » à un an près (reveal). */
  year: boolean
  text: string
  /** Unité affichée derrière un nombre (vdnShownUnit) : vide pour une année de notre ère. */
  unit: string
  source: string
}

/** Ids de toute la banque, communs aux 4 langues : de quoi juger une sauvegarde avant que les textes arrivent. */
export const VDN_QUESTION_IDS: ReadonlySet<string> = new Set(VDN_QUESTIONS.map((q) => q.id))

// Quatre spécificateurs STATIQUES, jamais import(`./data/${lang}`) : webpack
// embarquerait tout le dossier data/ (tests compris) dans un seul morceau.
const TEXT_LOADERS: Record<VdnLang, () => Promise<VdnTexts>> = {
  fr: () => import('./data/fr').then((m) => m.VDN_TEXTS),
  en: () => import('./data/en').then((m) => m.VDN_TEXTS),
  es: () => import('./data/es').then((m) => m.VDN_TEXTS),
  it: () => import('./data/it').then((m) => m.VDN_TEXTS),
}

/** Langue de la page → langue des questions ; inconnue ou absente → français. */
export function vdnLangOf(locale: string | null | undefined): VdnLang {
  return (VDN_LANGS as readonly string[]).includes(locale ?? '') ? (locale as VdnLang) : 'fr'
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/**
 * Méta + textes d'une langue. Une question sans énoncé, sans source ou à la
 * réponse illisible sort de la pioche plutôt que de s'afficher à moitié.
 */
export function buildVdnQuestions(texts: VdnTexts): VdnQuestion[] {
  const questions: VdnQuestion[] = []
  for (const entry of VDN_QUESTIONS) {
    const meta: VdnQuestionMeta = entry
    const text = texts[entry.id]
    if (!text || !filled(text.text) || !filled(text.source) || typeof text.unit !== 'string') continue
    if (!Number.isFinite(meta.answer)) continue
    const min = typeof meta.min === 'number' && Number.isFinite(meta.min) ? meta.min : 0
    questions.push({
      id: meta.id,
      theme: meta.theme,
      answer: meta.answer,
      min,
      year: meta.year === true,
      text: text.text.trim(),
      unit: vdnShownUnit(text.unit.trim(), meta),
      source: text.source.trim(),
    })
  }
  return questions
}

/** Textes d'une langue, par son propre morceau. */
export function loadVdnTexts(lang: VdnLang): Promise<VdnTexts> {
  return TEXT_LOADERS[lang]()
}

export async function loadVdnQuestions(locale: string | null | undefined): Promise<VdnQuestion[]> {
  return buildVdnQuestions(await loadVdnTexts(vdnLangOf(locale)))
}
