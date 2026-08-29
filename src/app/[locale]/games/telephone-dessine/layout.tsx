import type { Metadata } from 'next'
import { buildGameMetadata, GameSeo } from '@/lib/seo/game-seo'

/** SEO de la page (client) du jeu — voir src/lib/seo/game-seo.tsx. */

const GAME_ID = 'telephone-dessine'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return buildGameMetadata(locale, GAME_ID)
}

export default async function GameSeoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <GameSeo locale={locale} gameId={GAME_ID}>
      {children}
    </GameSeo>
  )
}
