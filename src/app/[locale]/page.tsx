import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Link, redirect } from '@/i18n/navigation'
import { isAppLocale } from '@/lib/locale-utils'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { SESSION_COOKIE } from '@/lib/auth-cookies'
import { getCurrentUser } from '@/lib/auth-server'
import { soireeSlice } from '@/i18n/messages-slices'
import { ClientMessages } from '@/components/i18n/ClientMessages'
import { SoireeHome } from '@/components/soiree/SoireeHome'
import { SoireeShell } from '@/components/soiree/soiree-ui'
import { GAMES } from '@/lib/games'
import { buildAlternates, buildOpenGraphLocale, siteOgImage } from '@/lib/seo/alternates'

/**
 * Metadata de la vitrine. Le nombre de jeux est DÉRIVÉ du catalogue, il
 * n'est plus recopié à la main dans les 4 langues (les metadata annonçaient
 * 21 jeux quand la grille en affichait 22) — il ne peut donc pas se
 * contredire, et sert aussi aux aperçus de partage.
 *
 * Canonical + hreflang (la vitrine n'en avait pas : quatre URL pour un même
 * contenu, sans lien entre elles) et carte de partage de marque. `openGraph`
 * ne se FUSIONNE pas avec celui du layout — Next remplace l'objet entier dès
 * qu'une page le pose — d'où titre, langue et url redonnés ici en entier.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'metadata' })
  const title = t('titleFull')
  const description = t('descriptionCount', { count: GAMES.filter((g) => !g.hidden).length })
  const ogImage = siteOgImage(locale)
  return {
    description,
    alternates: buildAlternates('', locale),
    openGraph: {
      type: 'website',
      siteName: t('title'),
      ...buildOpenGraphLocale(locale),
      title,
      description,
      url: `/${locale}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Le layout rejette déjà une langue inconnue, mais la page est rendue EN
  // PARALLÈLE : /apple-touch-icon.png (hors middleware i18n) arrivait ici
  // avec locale = « apple-touch-icon.png » et l'heure de la table du vendredi
  // (Intl.DateTimeFormat) levait un RangeError — 500 au lieu de 404.
  if (!isAppLocale(locale)) notFound()
  const jar = await cookies()
  // Le Mode Soirée (jeux locaux) est l'accueil depuis le 22/11/2026, pour les
  // nouveaux visiteurs comme pour les habitués du mode local. Les comptes en
  // MODE EN LIGNE gardent leur entrée d'avant, le hub des tables : la partie
  // en ligne ne change pas. L'ancienne vitrine vit sur /decouvrir.
  if (jar.get(SESSION_COOKIE)?.value) {
    const user = await getCurrentUser()
    if (user?.playMode === 'online') redirect({ href: '/jeux', locale })
  }
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'soiree.home' })
  const steps = ['bande', 'programme', 'addition'] as const
  return (
    <ClientMessages messages={soireeSlice(await getMessages({ locale }))}>
      <SoireeShell>
        <SoireeHome />
        <ol className="grid gap-2 sm:grid-cols-3" aria-label={t('stepsLabel')}>
          {steps.map((step, i) => (
            <li key={step} className="grid grid-cols-[1.25rem_1fr] gap-x-2 rounded-2xl border border-gold/20 bg-black/10 px-3 py-2.5 sm:block">
              <span className="row-span-2 font-display font-bold text-gold">{i + 1}</span>
              <span className="block font-display font-bold text-cream">{t(`steps.${step}.title`)}</span>
              <span className="block text-sm text-cream/70">{t(`steps.${step}.text`)}</span>
            </li>
          ))}
        </ol>
        <section className="space-y-2 text-sm text-cream/70">
          <h2 className="font-display text-lg font-bold text-cream">{t('about.title')}</h2>
          <p>{t('about.text', { count: GAMES.filter((g) => !g.hidden).length })}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-bold">
            <Link href="/decouvrir" className="text-amber-200 underline underline-offset-4 hover:text-amber-100">{t('about.discover')}</Link>
            <Link href="/jeux" className="text-amber-200 underline underline-offset-4 hover:text-amber-100">{t('about.allGames')}</Link>
          </p>
        </section>
        <p className="text-center text-xs text-cream/50">
          {t('note')}
          <br />
          {t('health')}
        </p>
      </SoireeShell>
    </ClientMessages>
  )
}
