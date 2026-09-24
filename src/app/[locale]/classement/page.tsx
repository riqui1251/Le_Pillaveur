import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { OnlineRankingBoard, type OverviewResponse } from '@/components/online/OnlineRankingBoard'
import { buildRankingsOverview, RANKING_MIN_GAMES, type RankingBoard } from '@/lib/online/rankings'
import { prisma } from '@/lib/prisma'
import { buildAlternates, pageOpenGraph, pageTwitter } from '@/lib/seo/alternates'

/**
 * Page Classement — EN LIGNE uniquement : classement général + top 5 par jeu
 * (victoires/défaites/parties/%). Le classement des joueurs locaux a été
 * retiré volontairement : seules les parties en ligne comptent.
 *
 * Composant SERVEUR (le tableau, lui, reste client) : c'est la seule façon
 * d'exporter `generateMetadata`. Sans elle la page héritait du titre et de la
 * description de l'accueil — un doublon exact pour Google, alors qu'elle est
 * dans le sitemap.
 *
 * L'APERÇU est rendu ici, côté serveur : le tableau attendait sa réponse
 * /api/online/rankings/overview et le HTML ne portait que le titre — page
 * vide pour Googlebot, roue d'attente pour tout le monde. Le podium sans
 * les noms (voir readPublicOverview) part donc dans le HTML, et le tableau
 * le montre au premier rendu avant de charger sa version personnalisée.
 *
 * Régénération toutes les 5 min (ISR) plutôt que `force-dynamic` : rien ici
 * ne lit de cookie — l'aperçu est le même pour tout le monde, la
 * personnalisation (pseudos, « toi ») vient du fetch client comme avant —,
 * l'agrégation ne tourne donc qu'une fois par langue et par période de
 * 5 min au lieu d'une fois par visite, et le HTML mis en cache ne contient
 * aucune donnée personnelle.
 */
export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata.ranking' })
  // Canonical + hreflang de la source commune : le sitemap annonce les quatre
  // langues de /classement, la page doit dire la même chose.
  const alternates = buildAlternates('/classement', locale)

  return {
    title: t('title'),
    description: t('description'),
    alternates,
    openGraph: pageOpenGraph(locale, {
      title: t('title'),
      description: t('description'),
      url: alternates.canonical,
    }),
    twitter: pageTwitter(locale, { title: t('title'), description: t('description') }),
  }
}

/**
 * L'aperçu PUBLIC : les podiums de la période « générale », SANS pseudo ni
 * identifiant. La règle du site (politique de confidentialité, § compte) est
 * qu'un pseudo en ligne est « visible des autres joueurs » — pas du public ni
 * des moteurs — et l'API du classement exige une session. Ce HTML, lui, est
 * servi à tout le monde et mis en cache : il ne porte que les rangs et les
 * chiffres, le tableau remplace ensuite ces lignes par les vraies chez un
 * joueur connecté. Base indisponible (ou build sans base) → null, et le
 * tableau se charge comme avant.
 */
async function readPublicOverview(hiddenName: string): Promise<OverviewResponse | null> {
  try {
    const { general, perGame } = await buildRankingsOverview(prisma, null, 'all')
    const publicBoard = (board: RankingBoard): OverviewResponse['general'] => ({
      gameId: board.gameId,
      totalPlayers: board.totalPlayers,
      me: null,
      rows: board.rows.map((row) => ({
        // Une clé de rendu, pas un compte : le vrai id ne sort pas d'ici.
        userId: `${board.gameId ?? 'general'}#${row.position}`,
        displayName: hiddenName,
        preferences: {},
        wins: row.wins,
        losses: row.losses,
        games: row.games,
        winRate: row.winRate,
        position: row.position,
      })),
    })
    return {
      general: publicBoard(general),
      perGame: perGame.map(publicBoard),
      minGamesForRate: RANKING_MIN_GAMES,
    }
  } catch {
    return null
  }
}

export default async function ClassementPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('ranking')
  const tNav = await getTranslations('nav')
  const initialOverview = await readPublicOverview(t('online.hiddenName'))

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <header className="mb-8 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{tNav('brand')}</p>
          <h1 className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text font-display text-3xl font-bold text-transparent sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-white/50">{t('online.subtitle')}</p>
        </header>

        <OnlineRankingBoard initialOverview={initialOverview} />
      </div>
    </main>
  )
}
