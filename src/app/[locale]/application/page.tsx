import type { Metadata } from 'next'
import { statSync } from 'node:fs'
import path from 'node:path'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Apple, Download, Maximize2, Play, Smartphone, WifiOff, Zap } from 'lucide-react'
import { HiddenInApp } from '@/components/pwa/HiddenInApp'
import { InstallButton } from '@/components/pwa/InstallButton'
import { buildAlternates, pageOpenGraph, pageTwitter } from '@/lib/seo/alternates'

/**
 * Page « Application » — visible depuis le NAVIGATEUR (l'entrée de menu est
 * masquée dans la coquille Capacitor ; ouverte quand même, la page n'y montre
 * que le mot de la carte d'installation — voir HiddenInApp).
 *
 * Composant SERVEUR, rendu au build par langue : la page était un composant
 * client sans metadata — elle héritait du titre et de la description de
 * l'accueil alors qu'elle est au sitemap. Ce qu'elle promet est vrai
 * aujourd'hui : le site s'ajoute à l'écran d'accueil depuis le navigateur
 * (manifeste PWA) — c'est l'installation qu'on propose en premier. Les
 * boutons stores restent des emplacements « bientôt », en second : les liens
 * Google Play / App Store seront branchés à la publication.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata.mobileApp' })
  const title = t('title')
  const description = t('description')
  return {
    title,
    description,
    alternates: buildAlternates('/application', locale),
    // Un openGraph de page remplace celui du layout de langue en entier :
    // pageOpenGraph reporte type, nom du site, locale et carte de partage.
    openGraph: pageOpenGraph(locale, { title, description, url: `/${locale}/application` }),
    twitter: pageTwitter(locale, { title, description }),
  }
}

/**
 * L'APK servi par le site (public/app/, hors middleware i18n : voir le
 * matcher de src/middleware.ts) — l'app Android en attendant Google Play.
 * Sa taille est lue au BUILD (page statique) : absent du dépôt, la carte ne
 * s'affiche pas plutôt que de promettre un lien mort. Pour publier une
 * nouvelle version : copier l'APK à cet emplacement, commiter, déployer
 * (mobile/README.md, « Diffusion directe »).
 */
const APK_PUBLIC_PATH = '/app/le-pillaveur.apk'

function apkSizeMb(locale: string): string | null {
  try {
    const bytes = statSync(path.join(process.cwd(), 'public', ...APK_PUBLIC_PATH.split('/').filter(Boolean))).size
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000_000)
  } catch {
    return null
  }
}

function StoreRow({
  icon,
  store,
  soonLabel,
}: {
  icon: React.ReactNode
  store: string
  soonLabel: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/80">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-white">{store}</p>
      </div>
      <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
        {soonLabel}
      </span>
    </div>
  )
}

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Rendue au build : la langue vient des params, jamais des en-têtes.
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'mobileApp' })
  const tNav = await getTranslations({ locale, namespace: 'nav' })
  const apkSize = apkSizeMb(locale)

  const benefits = [
    { Icon: Maximize2, title: t('benefits.fullscreen'), desc: t('benefits.fullscreenDesc') },
    { Icon: Smartphone, title: t('benefits.icon'), desc: t('benefits.iconDesc') },
    { Icon: Zap, title: t('benefits.quick'), desc: t('benefits.quickDesc') },
    // Jeux « un seul téléphone » sans réseau : service worker, src/lib/offline/.
    { Icon: WifiOff, title: t('benefits.offline'), desc: t('benefits.offlineDesc') },
  ]

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="mb-8 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {tNav('brand')}
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text font-display text-3xl font-bold text-transparent sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-white/50">{t('subtitle')}</p>
        </header>

        {/* Ce que l'installation apporte — dans le HTML, pour tout le monde ;
            masqué dans la coquille, où il n'y a rien à installer. */}
        <HiddenInApp>
          <section aria-labelledby="app-benefits" className="mb-6">
            <h2 id="app-benefits" className="sr-only">
              {t('benefits.title')}
            </h2>
            {/* Quatre cartes : deux par deux dès `sm` (trois colonnes laissaient
                la dernière orpheline sur sa ligne). */}
            <div className="grid gap-3 sm:grid-cols-2">
              {benefits.map(({ Icon, title, desc }) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <Icon aria-hidden className="h-5 w-5 text-amber-300" />
                  <h3 className="mt-2 text-sm font-bold text-white/90">{title}</h3>
                  <p className="mt-0.5 text-xs leading-snug text-white/50">{desc}</p>
                </div>
              ))}
            </div>
          </section>
        </HiddenInApp>

        {/* La proposition qui marche AUJOURD'HUI : bouton natif, guide Safari,
            ou rien — selon le navigateur (composant client). */}
        <div className="mb-6">
          <InstallButton />
        </div>

        {/* Les stores, en second : des emplacements tant que rien n'est
            publié. Dans la coquille, ni stores ni note : le mot
            d'InstallButton suffit (comme avant). */}
        <HiddenInApp>
          {/* L'app Android, directement : le fichier APK servi par le site,
              avec le passage obligé des « sources inconnues » expliqué en
              trois gestes. Avant les stores, qui n'ont encore rien. */}
          {apkSize && (
            <section aria-labelledby="app-apk" className="mb-6 rounded-3xl border border-gold/30 bg-gold/[0.06] p-5 sm:p-6">
              <h2 id="app-apk" className="font-display text-lg font-bold text-cream">
                {t('apk.title')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-white/65">{t('apk.hint')}</p>
              <a
                href={APK_PUBLIC_PATH}
                download
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
              >
                <Download className="h-5 w-5" aria-hidden />
                {t('apk.button', { size: apkSize })}
              </a>
              <ol className="mt-4 space-y-2 text-sm text-white/80">
                {(['step1', 'step2', 'step3'] as const).map((step, index) => (
                  <li key={step} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="font-display font-bold text-gold">{index + 1}.</span>
                    <span>{t(`apk.${step}`)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="rounded-3xl border border-gold/20 bg-white/[0.03] p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-cream">{t('stores.title')}</h2>
            <div className="mb-5 mt-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                <Smartphone className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-white/70">{t('pitch')}</p>
            </div>
            <div className="space-y-3">
              <StoreRow icon={<Play className="h-5 w-5" aria-hidden />} store={t('googlePlay')} soonLabel={t('soon')} />
              <StoreRow icon={<Apple className="h-5 w-5" aria-hidden />} store={t('appStore')} soonLabel={t('soon')} />
            </div>
          </section>
          <p className="mt-5 text-center text-xs leading-relaxed text-white/40">{t('note')}</p>
        </HiddenInApp>
      </div>
    </main>
  )
}
