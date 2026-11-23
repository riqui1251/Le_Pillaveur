"use client"

import { useTranslations } from 'next-intl'
import { Flag, Lightbulb, Wine } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'a', label: 'rule', icon: Lightbulb, tone: 'bg-amber-500 text-[#24201A]' },
  { key: 'b', label: 'drinks', icon: Wine, tone: 'bg-suit-red text-cream' },
  { key: 'c', label: 'end', icon: Flag, tone: 'bg-chip-blue text-cream' },
] as const

/**
 * Le tuto d'un jeu en trois temps (le principe, les gorgées, la fin), écrit
 * pour une table qui joue sur un seul téléphone — soiree.tutorials.<jeu>.
 */
export function TutorialSteps({ gameId, soft, className }: { gameId: string; soft: boolean; className?: string }) {
  const t = useTranslations('soiree')
  if (!t.has(`tutorials.${gameId}.a`)) return null
  return (
    <div className={cn('space-y-3', className)}>
      <ol className="space-y-2.5">
        {STEPS.map(({ key, label, icon: Icon, tone }, i) => (
          <li key={key} className="soiree-deal flex gap-3 rounded-2xl border border-gold/20 bg-felt-deep/60 p-3" style={{ animationDelay: `${120 + i * 110}ms` }}>
            <span aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)]', tone)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">
                {t(`intro.steps.${label === 'drinks' && soft ? 'points' : label}`)}
              </p>
              <p className="mt-0.5 text-pretty text-[15px] leading-snug text-cream/90">{t(`tutorials.${gameId}.${key}`)}</p>
            </div>
          </li>
        ))}
      </ol>
      {soft && <p className="text-sm text-cream/60">{t('intro.softNote')}</p>}
    </div>
  )
}
