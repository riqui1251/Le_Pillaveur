"use client"

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Beer, Trophy } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OnlineDrinkBoards } from '@/components/online/OnlineDrinkBoards'
import { OnlineRankingBoard, type OverviewResponse } from '@/components/online/OnlineRankingBoard'

/**
 * Chargé au premier clic sur « Gorgées » : « Chez vous » tire les joueurs
 * locaux, leur synchro et l'historique des soirées, du poids pour qui ne
 * regarde que le classement en ligne.
 */
const DrinkStatsSections = dynamic(
  () => import('@/components/soiree/DrinkStatsSections').then((m) => m.DrinkStatsSections),
  { loading: () => <Spinner /> }
)

type RankingTab = 'online' | 'drinks'

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
    </div>
  )
}

const TAB_CLASS =
  'min-h-[44px] gap-2 rounded-full px-4 text-sm font-semibold text-cream/60 transition-colors hover:text-cream ' +
  'focus-visible:ring-gold focus-visible:ring-offset-0 ' +
  'data-[state=active]:bg-gold/[0.15] data-[state=active]:text-amber-200 data-[state=active]:shadow-none'

const PANEL_CLASS = 'mt-0 rounded-2xl focus-visible:ring-gold/50 focus-visible:ring-offset-0 data-[state=inactive]:hidden'

/**
 * Les deux classements de la page : les victoires en ligne (par défaut) et
 * les gorgées, le même classement que le Mode Soirée (/soiree/stats). Un
 * onglet ouvert reste monté, caché : y revenir ne recharge rien et garde
 * période et filtre du classement en ligne.
 */
export function RankingTabs({ initialOverview }: { initialOverview: OverviewResponse | null }) {
  const t = useTranslations('ranking')
  const tStats = useTranslations('soiree.stats')
  const [tab, setTab] = useState<RankingTab>('online')
  const [drinksOpened, setDrinksOpened] = useState(false)

  const select = (value: string) => {
    const next: RankingTab = value === 'drinks' ? 'drinks' : 'online'
    setTab(next)
    if (next === 'drinks') setDrinksOpened(true)
  }

  return (
    <Tabs value={tab} onValueChange={select}>
      <TabsList
        aria-label={t('tabs.label')}
        className="mx-auto grid h-auto w-full max-w-sm grid-cols-2 rounded-full border border-gold/25 bg-white/[0.03] p-1"
      >
        <TabsTrigger value="online" className={TAB_CLASS}>
          <Trophy aria-hidden className="h-4 w-4" />
          {t('tabs.online')}
        </TabsTrigger>
        <TabsTrigger value="drinks" className={TAB_CLASS}>
          <Beer aria-hidden className="h-4 w-4" />
          {t('tabs.drinks')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="online" forceMount className={PANEL_CLASS}>
        <p className="mb-6 mt-3 text-center text-sm text-white/50">{t('online.subtitle')}</p>
        <OnlineRankingBoard initialOverview={initialOverview} />
      </TabsContent>

      {drinksOpened && (
        <TabsContent value="drinks" forceMount className={`${PANEL_CLASS} text-cream`}>
          <p className="mb-6 mt-3 text-center text-sm text-white/50">{t('drinks.subtitle')}</p>
          <DrinkStatsSections afterSite={<OnlineDrinkBoards />} />
          <div className="mt-8 flex justify-center">
            <Button variant="primary" size="game" asChild>
              <Link href="/">{tStats('cta')}</Link>
            </Button>
          </div>
        </TabsContent>
      )}
    </Tabs>
  )
}
