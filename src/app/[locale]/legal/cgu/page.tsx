import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'CGU',
  description: 'Conditions Générales d\'Utilisation du service Le Pillaveur.',
}

export default async function CguPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Rendue au build : la langue vient des params, jamais des en-têtes de la
  // requête (les <Link> serveur de LegalPage la lisent d'ici).
  setRequestLocale(locale)
  return <LegalPage docId="cgu" locale={locale} />
}
