"use client"

import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import GlobalStats from '@/components/stats/GlobalStats'

export default function StatsPageClient() {
  const t = useTranslations('stats')

  return (
    <HubShell title={t('title')} subtitle={t('subtitle')}>
      <GlobalStats />
    </HubShell>
  )
}
