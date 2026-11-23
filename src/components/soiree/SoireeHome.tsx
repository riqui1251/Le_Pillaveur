"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart3, Minus, Plus } from 'lucide-react'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readBandes, readHistory, type SoireeBande } from '@/lib/soiree/storage'
import type { SoireeHistoryEntry } from '@/lib/soiree/summary'
import { SoireeCta } from './soiree-ui'
import { useSoiree } from './useSoiree'
import { useHiddenGamesPurge } from './useHiddenGamesPurge'

const CHIP_COLORS = ['#B3382E', '#274B8F', '#2E7D5B', '#6B3FA0', '#C8862C', '#1F7A7A', '#B0476E', '#3A3A3A', '#7A5230', '#4A6FA5', '#7C8A2E', '#8E2A3E']
const MIN_PLAYERS = 2
const MAX_PLAYERS = 12

const FLOATING_SUITS = [
  { glyph: '♠', left: '4%', top: '6%', size: '2.6rem', delay: '0s', red: false },
  { glyph: '♥', left: '86%', top: '2%', size: '2.2rem', delay: '-2s', red: true },
  { glyph: '♦', left: '90%', top: '52%', size: '1.8rem', delay: '-4s', red: true },
  { glyph: '♣', left: '2%', top: '58%', size: '2rem', delay: '-5.5s', red: false },
] as const

function Chip({ color, label }: { color: string; label?: string }) {
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
      style={{ background: `radial-gradient(circle, ${color} 0 55%, transparent 56%), repeating-conic-gradient(${color} 0 18deg, #F3EAD3 18deg 36deg)` }}
    >
      {label}
    </span>
  )
}

type LastBande = { bande: SoireeBande; night: number; last: SoireeHistoryEntry | null }

/** Le haut de l'accueil : une seule question, la reprise d'une soirée ou la revanche d'une bande. */
export function SoireeHome() {
  const t = useTranslations('soiree.home')
  const router = useRouter()
  const { soiree, ready, save } = useSoiree()
  useHiddenGamesPurge(soiree, save)
  const [count, setCount] = useState(4)
  const [lastBande, setLastBande] = useState<LastBande | null>(null)

  useEffect(() => {
    const bande = readBandes()[0]
    if (!bande) return
    const history = readHistory().filter((entry) => entry.bandeId === bande.id)
    setLastBande({ bande, night: history.length + 1, last: history[0] ?? null })
  }, [])

  const inProgress = ready && soiree !== null && soiree.phase !== 'finished'
  const lastPayer = lastBande?.last?.payerId
    ? lastBande.last.players.find((p) => p.id === lastBande.last?.payerId)?.name ?? null
    : null

  return (
    <>
      <section className="relative flex flex-col items-center gap-4 pt-2 text-center">
        {/* Enseignes qui flottent sur le feutre : décor seulement, figé si l'appareil réduit les animations. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-visible">
          {FLOATING_SUITS.map((s) => (
            <span
              key={s.left}
              className={cn('soiree-float absolute font-display', s.red ? 'text-suit-red/40' : 'text-amber-300/20')}
              style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay }}
            >
              {s.glyph}
            </span>
          ))}
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-gold">{t('eyebrow')}</p>
        <h1 className="text-balance font-display text-4xl font-bold leading-[1.08] text-cream sm:text-5xl">{t('title')}</h1>
        <p className="max-w-md text-pretty text-base text-cream/70 sm:text-lg">{t('lead')}</p>
        <div className="mt-1 flex items-center gap-6" role="group" aria-label={t('countLabel')}>
          <button
            type="button"
            onClick={() => setCount((n) => Math.max(MIN_PLAYERS, n - 1))}
            disabled={count <= MIN_PLAYERS}
            aria-label={t('less')}
            className="grid h-14 w-14 place-items-center rounded-full border border-gold/50 bg-felt-deep/50 text-amber-200 transition hover:bg-gold/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Minus aria-hidden className="h-6 w-6" />
          </button>
          <output aria-live="polite" className="min-w-[7rem]">
            <span key={count} className="soiree-pop block font-display text-7xl font-bold leading-none tabular-nums text-cream">{count}</span>
            <span className="text-sm font-semibold text-cream/70">{t('players', { count })}</span>
          </output>
          <button
            type="button"
            onClick={() => setCount((n) => Math.min(MAX_PLAYERS, n + 1))}
            disabled={count >= MAX_PLAYERS}
            aria-label={t('more')}
            className="grid h-14 w-14 place-items-center rounded-full border border-gold/50 bg-felt-deep/50 text-amber-200 transition hover:bg-gold/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Plus aria-hidden className="h-6 w-6" />
          </button>
        </div>
        <div className="flex min-h-[28px] flex-wrap justify-center gap-1">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className="soiree-pop">
              <Chip color={CHIP_COLORS[i % CHIP_COLORS.length]} />
            </span>
          ))}
        </div>
      </section>

      {inProgress && soiree && (
        <Link href="/soiree" className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 transition hover:bg-gold/20">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">{t('resume.eyebrow')}</p>
            <p className="mt-1 font-display text-lg font-bold text-cream">
              {t('resume.title', { round: Math.min(soiree.current + 1, soiree.rounds.length), total: soiree.rounds.length })}
            </p>
            <p className="truncate text-sm text-cream/70">{soiree.playerIds.map((id) => soiree.playerNames[id]).join(', ')}</p>
          </div>
          <span className="shrink-0 font-bold text-amber-200">{t('resume.cta')}</span>
        </Link>
      )}

      {!inProgress && lastBande && (
        <Link
          href={{ pathname: '/soiree', query: { bande: lastBande.bande.id } }}
          className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-felt-deep/50 p-4 transition hover:bg-gold/10"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">{t('revenge.eyebrow')}</p>
            <p className="mt-1 font-display text-lg font-bold text-cream">
              {t('revenge.title', { name: lastBande.bande.name, number: lastBande.night })}
            </p>
            <p className="text-sm text-cream/70">
              {lastBande.last
                ? lastPayer
                  ? t('revenge.lastPayer', { name: lastPayer })
                  : t('revenge.lastTie')
                : t('revenge.ready')}
            </p>
          </div>
          <div className="flex shrink-0 -space-x-2">
            {lastBande.bande.playerIds.slice(0, 4).map((id, i) => (
              <Chip key={id} color={CHIP_COLORS[i % CHIP_COLORS.length]} />
            ))}
          </div>
        </Link>
      )}

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" onClick={() => router.push(`/soiree?joueurs=${count}`)}>
          {t('start')}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-bold">
          <Link href="/jeux" className="py-1.5 text-amber-200 underline underline-offset-4 hover:text-amber-100">
            {t('single')}
          </Link>
          <Link href="/soiree/stats" className="inline-flex items-center gap-1.5 py-1.5 text-amber-200 underline underline-offset-4 hover:text-amber-100">
            <BarChart3 aria-hidden className="h-4 w-4" />
            {t('stats')}
          </Link>
        </div>
      </SoireeCta>
    </>
  )
}
