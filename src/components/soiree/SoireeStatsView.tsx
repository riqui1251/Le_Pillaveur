"use client"

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { DrinkStatsSections } from './DrinkStatsSections'
import { SoireeCta, SoireeShell, StepHeader } from './soiree-ui'

/**
 * « Quel jeu fait le plus boire ? » — d'abord tout le site (compteurs anonymes
 * lus sur le serveur), puis « Chez vous » : calculé sur ce téléphone, rien
 * de cette partie ne part au serveur.
 */
export function SoireeStatsView() {
  const t = useTranslations('soiree.stats')

  return (
    <SoireeShell>
      <StepHeader eyebrow={t('pageEyebrow')} title={t('title')} lead={t('pageLead')} />

      <DrinkStatsSections />

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" asChild>
          <Link href="/">{t('cta')}</Link>
        </Button>
      </SoireeCta>
    </SoireeShell>
  )
}
