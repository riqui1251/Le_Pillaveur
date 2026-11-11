"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { BjTally as BjTallyData } from '@/lib/blackjack/engine'

/** Bilan de fin, local comme en ligne : du plus arrosé au plus sobre. */
export function BjTally({
  rows,
}: {
  rows: { id: string; name: ReactNode; avatar?: ReactNode; tally: BjTallyData | undefined }[]
}) {
  const t = useTranslations('games.blackjack')
  const sorted = [...rows].sort((a, b) => (b.tally?.drunk ?? 0) - (a.tally?.drunk ?? 0))
  return (
    <section className="w-full space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('tallyTitle')}</h3>
      <ol className="space-y-2">
        {sorted.map((row) => (
          <li key={row.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
            {row.avatar && <span className="shrink-0 text-xl leading-none">{row.avatar}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-cream">{row.name}</p>
              <p className="text-xs text-cream/70">
                {t('tallyLine', { wins: row.tally?.wins ?? 0, hands: row.tally?.hands ?? 0, given: row.tally?.given ?? 0 })}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-sm font-bold tabular-nums text-[#24201A]">
              {t('drunk', { count: row.tally?.drunk ?? 0 })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
