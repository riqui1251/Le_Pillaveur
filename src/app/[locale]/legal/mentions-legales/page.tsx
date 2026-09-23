import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Mentions légales du site Le Pillaveur.',
}

export default async function MentionsLegalesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Rendue au build : la langue vient des params, jamais des en-têtes de la
  // requête (les <Link> serveur de LegalPage la lisent d'ici).
  setRequestLocale(locale)
  return <LegalPage docId="mentions-legales" locale={locale} />
}
