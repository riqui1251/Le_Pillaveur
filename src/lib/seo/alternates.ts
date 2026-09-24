import { locales, type AppLocale } from '@/i18n/routing'

/**
 * Canonical + hreflang d'une page publique, dans la forme que Next attend
 * sous `metadata.alternates` (chemins relatifs, résolus contre metadataBase).
 *
 * La même boucle vivait dans le layout du hub, dans game-seo.tsx et, en
 * absolu, dans le sitemap : trois copies d'une convention qui doit rester
 * identique partout — un hreflang qui diffère entre la page et le sitemap
 * est un signal contradictoire pour Google. Une seule source, testée :
 * - canonical auto-référent : `/{locale}{path}` ;
 * - une entrée par langue, plus `x-default` sur le français (langue par
 *   défaut du routage, celle des visiteurs sans préférence connue).
 *
 * `path` est le chemin SANS préfixe de langue ('' pour la racine, '/jeux',
 * '/games/purple'…).
 */
export type Alternates = {
  canonical: string
  languages: Record<AppLocale | 'x-default', string>
}

export function buildAlternates(path: string, locale: string): Alternates {
  const languages = { 'x-default': `/fr${path}` } as Alternates['languages']
  for (const l of locales) {
    languages[l] = `/${l}${path}`
  }
  return { canonical: `/${locale}${path}`, languages }
}

/**
 * og:locale par langue — langue ET territoire, comme Facebook et LinkedIn le
 * lisent (`fr` seul est ignoré, ou pris pour `fr_FR` selon le lecteur). Le
 * layout déclarait la locale nue.
 */
export const OG_LOCALES: Record<AppLocale, string> = {
  fr: 'fr_FR',
  en: 'en_GB',
  es: 'es_ES',
  it: 'it_IT',
}

/** `openGraph.locale` de la page + `alternateLocale` : les trois autres langues. */
export function buildOpenGraphLocale(locale: string): { locale: string; alternateLocale: string[] } {
  const current = OG_LOCALES[locale as AppLocale] ?? OG_LOCALES.fr
  return {
    locale: current,
    alternateLocale: locales.map((l) => OG_LOCALES[l]).filter((l) => l !== current),
  }
}

/**
 * Carte de partage de marque (/api/og, variante « site »), dans la langue du
 * lien — pour la vitrine et le hub, qui n'en avaient aucune : WhatsApp et
 * Discord montraient un lien nu.
 */
export function siteOgImage(locale: string): string {
  return `/api/og?type=site&locale=${locale}`
}

/** Nom de marque (og:site_name) : le même dans les quatre langues, comme `metadata.title`. */
export const SITE_NAME = 'Le Pillaveur'

export type OgImage = { url: string; width: number; height: number; alt: string }

/**
 * `openGraph` COMPLET d'une page. Next ne fusionne pas l'openGraph d'une page
 * avec celui du layout de langue : il le REMPLACE en entier. Une page qui
 * posait `{ title, description, url }` perdait donc og:type, og:site_name,
 * og:locale et l'image de partage (celle du layout, app/opengraph-image.tsx)
 * — /application et les pages légales, qui l'avaient en héritant, sont
 * reparties sans carte sur WhatsApp. Cette aide remet tout : type, nom du
 * site, locale + alternateLocale, et la carte de marque dans la langue du
 * lien quand la page n'a pas d'image à elle.
 *
 * `url` est le chemin AVEC préfixe de langue (`/fr/classement`), résolu
 * contre metadataBase comme les canonicals.
 */
export function pageOpenGraph(
  locale: string,
  { title, description, url, images }: { title: string; description: string; url: string; images?: OgImage[] }
) {
  return {
    type: 'website' as const,
    siteName: SITE_NAME,
    ...buildOpenGraphLocale(locale),
    title,
    description,
    url,
    images: images ?? [{ url: siteOgImage(locale), width: 1200, height: 630, alt: title }],
  }
}

/**
 * `twitter` COMPLET d'une page, pendant de pageOpenGraph : Next remplace
 * aussi ce bloc en entier, et une page qui ne le pose pas hérite de celui du
 * layout de langue — titre et description de l'ACCUEIL. Sur X, la carte
 * d'une collection, du classement ou d'une page légale affichait donc le
 * titre générique du site sous une image qui portait le bon. Même carte de
 * marque que l'openGraph quand la page n'a pas d'image à elle.
 */
export function pageTwitter(
  locale: string,
  { title, description, images }: { title: string; description: string; images?: string[] }
) {
  return {
    card: 'summary_large_image' as const,
    title,
    description,
    images: images ?? [siteOgImage(locale)],
  }
}
