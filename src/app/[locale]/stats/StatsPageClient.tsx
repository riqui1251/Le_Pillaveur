"use client"

import { useTranslations } from 'next-intl'
import GlobalStats from '@/components/stats/GlobalStats'

export default function StatsPageClient() {
  const t = useTranslations('stats')

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">{t('title')}</h1>
      <GlobalStats />
    </div>
  )
}
