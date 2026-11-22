import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SoireeStatsView } from '@/components/soiree/SoireeStatsView'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'soiree.stats' })
  return { title: t('title'), robots: { index: false, follow: true } }
}

/** « Quel jeu fait le plus boire ? » — calculé sur l'appareil (src/lib/soiree/device-stats.ts). */
export default function SoireeStatsPage() {
  return <SoireeStatsView />
}
