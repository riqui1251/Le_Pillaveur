import type { Metadata } from 'next'
import { getMessages } from 'next-intl/server'
import { tvSlice } from '@/i18n/messages-slices'
import { ClientMessages } from '@/components/i18n/ClientMessages'
// Cosmétiques en ligne (écussons de rôle de TvLobby, via RankCrest) — sortis
// de globals.css, servis à ce segment seulement, comme /games et /compte.
import '@/styles/online-cosmetics.css'

// Page personnelle ou utilitaire : à ne pas indexer par les moteurs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // L'écran TV affiche n'importe quel jeu : il reçoit les textes de TOUS les
  // jeux, que le layout de langue n'embarque plus — voir
  // src/i18n/messages-slices.ts. Un grand écran sur le wifi du salon, pas un
  // téléphone en 4G : le poids compte moins ici.
  return <ClientMessages messages={tvSlice(await getMessages({ locale }))}>{children}</ClientMessages>
}
