import type { Metadata } from 'next'
import { getMessages } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { getCurrentUser } from '@/lib/auth-server'
import { canAccessSupervision } from '@/lib/roles'
import { supervisionSlice } from '@/i18n/messages-slices'
import { ClientMessages } from '@/components/i18n/ClientMessages'
import BuildStamp from '@/components/supervision/BuildStamp'

// Espace staff : à ne pas indexer par les moteurs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function SupervisionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const user = await getCurrentUser()
  if (!user || !canAccessSupervision(user.role)) {
    redirect({ href: '/compte', locale })
  }

  // Pied commun à toutes les pages de la supervision : la révision qui tourne,
  // pour savoir d'un coup d'œil si le dernier déploiement est bien en ligne.
  // Les textes `supervision` (40 Ko) n'arrivent qu'ici : le layout de langue
  // ne les embarque plus pour les joueurs — voir src/i18n/messages-slices.ts.
  return (
    <ClientMessages messages={supervisionSlice(await getMessages({ locale }))}>
      {children}
      <BuildStamp locale={locale} />
    </ClientMessages>
  )
}
