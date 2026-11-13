"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { BjTally as BjTallyData } from '@/lib/blackjack/engine'
import { cn } from '@/lib/utils'
import { useBjUnits } from './blackjack-ui'

/** Solde de points en Sans alcool : mises gagnées moins mises perdues. */
export function bjNetPoints(tally: BjTallyData | undefined): number {
  return (tally?.given ?? 0) - (tally?.drunk ?? 0)
}

/**
 * Bilan de fin, local comme en ligne. Avec alcool : du plus arrosé au plus
 * sobre. Sans alcool : classement aux points, le meilleur solde en tête.
 */
export function BjTally({
  rows,
}: {
  rows: { id: string; name: ReactNode; avatar?: ReactNode; tally: BjTallyData | undefined }[]
}) {
  const t = useTranslations('games.blackjack')
  const { soft } = useBjUnits()
  const sorted = [...rows].sort((a, b) =>
    soft ? bjNetPoints(b.tally) - bjNetPoints(a.tally) : (b.tally?.drunk ?? 0) - (a.tally?.drunk ?? 0)
  )
  return (
    <section className="w-full space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        {soft ? t('soft.tallyTitle') : t('tallyTitle')}
      </h3>
      <ol className="space-y-2">
        {sorted.map((row) => {
          const net = bjNetPoints(row.tally)
          return (
            <li key={row.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
              {row.avatar && <span className="shrink-0 text-xl leading-none">{row.avatar}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-cream">{row.name}</p>
                <p className="text-xs text-cream/70">
                  {soft
                    ? t('soft.tallyLine', { wins: row.tally?.wins ?? 0, hands: row.tally?.hands ?? 0 })
                    : t('tallyLine', { wins: row.tally?.wins ?? 0, hands: row.tally?.hands ?? 0, given: row.tally?.given ?? 0 })}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums',
                  !soft
                    ? 'bg-amber-500 text-[#24201A]'
                    : net > 0
                      ? 'bg-emerald-600 text-cream'
                      : net < 0
                        ? 'bg-suit-red text-cream'
                        : 'bg-black/40 text-cream'
                )}
              >
                {soft
                  ? t('soft.net', { value: net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '0' })
                  : t('drunk', { count: row.tally?.drunk ?? 0 })}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
