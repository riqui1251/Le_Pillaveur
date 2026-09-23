import type { Metadata } from 'next'
import { getMessages } from 'next-intl/server'
import { buildGameMetadata, GameSeo } from '@/lib/seo/game-seo'
import { ClientMessages } from '@/components/i18n/ClientMessages'
import { gameSlice } from '@/i18n/messages-slices'

/** SEO de la page (client) du jeu — voir src/lib/seo/game-seo.tsx. */

const GAME_ID = 'quiz'

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
      {/* Les textes de CE jeu seulement : le layout de langue n'embarque plus
          games.<id> — voir src/i18n/messages-slices.ts. */}
      <ClientMessages messages={gameSlice(await getMessages({ locale }), GAME_ID)}>
        {children}
      </ClientMessages>
    </GameSeo>
  )
}
