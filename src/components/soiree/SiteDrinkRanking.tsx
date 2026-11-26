"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useLocalizedGames } from '@/lib/games-i18n'
import { parseSiteDrinkRanking, type SiteDrinkRanking as Ranking } from '@/lib/game-drinks'
import { GameIconById } from '@/components/hub/GameIconById'
import { MEDALS, gameGradient } from './ranking-colors'

type RankedGame = { gameId: string; perPlay: number }

/** Le classement en ardoise : médaille, icône du catalogue sur crème, barre au dégradé du jeu, moyenne et détail. */
export function DrinkRankingList<Row extends RankedGame>({
  rows,
  label,
  detail,
}: {
  rows: readonly Row[]
  label: string
  detail: (row: Row) => string
}) {
  const t = useTranslations('soiree.stats')
  const locale = useLocale()
  const games = useLocalizedGames()
  const decimal = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const max = Math.max(0.1, ...rows.map((r) => r.perPlay))

  return (
    <ol className="space-y-2" aria-label={label}>
      {rows.map((row, i) => (
        <li key={row.gameId} className="soiree-deal rounded-xl border border-gold/20 bg-felt-deep/50 p-3" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="flex items-center gap-2.5">
            <span
              className={i < 3 ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-[#24201A]' : 'w-7 shrink-0 text-center font-display text-lg font-bold text-gold'}
              style={i < 3 ? { background: MEDALS[i] } : undefined}
            >
              {i + 1}
            </span>
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#D8CCAE] bg-cream shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)]"
            >
              <GameIconById id={row.gameId} surface="card" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-bold">{games.find((g) => g.id === row.gameId)?.title ?? row.gameId}</p>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="soiree-grow h-full rounded-full"
                  style={{ width: `${Math.round((row.perPlay / max) * 100)}%`, background: gameGradient(row.gameId, 90), animationDelay: `${150 + i * 60}ms` }}
                />
              </div>
            </div>
            <span className="text-right">
              <span className="block font-display text-xl font-bold tabular-nums">{decimal.format(row.perPlay)}</span>
              <span className="block text-[11px] leading-tight text-cream/60">{t('perPlayUnit')}</span>
            </span>
          </div>
          <p className="mt-2 pl-[5.25rem] text-xs text-cream/60">{detail(row)}</p>
        </li>
      ))}
    </ol>
  )
}

/** Titre d'une partie de la page : « Sur tout Le Pillaveur », « Chez vous ». */
export function RankingSectionHeader({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <header className="space-y-1 border-b border-gold/20 pb-2">
      <h2 id={id} className="font-display text-2xl font-bold">{title}</h2>
      {lead && <p className="text-sm text-cream/70">{lead}</p>}
    </header>
  )
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; ranking: Ranking }

/**
 * « Sur tout Le Pillaveur » : le classement de tous les joueurs, lu sur
 * GET /api/stats/game-drinks (compteurs anonymes, local et en ligne).
 */
export function SiteDrinkRanking() {
  const t = useTranslations('soiree.stats')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors.page')
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  const fetchRanking = useCallback(async (signal?: AbortSignal) => {
    setLoad({ status: 'loading' })
    try {
      const response = await fetch('/api/stats/game-drinks', { signal })
      const ranking = response.ok ? parseSiteDrinkRanking(await response.json()) : null
      if (!signal?.aborted) setLoad(ranking ? { status: 'ready', ranking } : { status: 'error' })
    } catch {
      if (!signal?.aborted) setLoad({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchRanking(controller.signal)
    return () => controller.abort()
  }, [fetchRanking])

  const ranked = load.status === 'ready' && load.ranking.games.length > 0 ? load.ranking : null

  return (
    <section className="space-y-3" aria-labelledby="stats-site" aria-busy={load.status === 'loading'}>
      <RankingSectionHeader id="stats-site" title={t('site.title')} lead={ranked ? t('site.lead', { days: ranked.days }) : undefined} />

      <div aria-live="polite">
        {load.status === 'loading' && <p className="animate-pulse text-sm text-cream/60">{tCommon('loading')}</p>}

        {load.status === 'error' && (
          <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4">
            <p className="text-cream/70">{t('site.error')}</p>
            <Button variant="quiet" size="game" onClick={() => void fetchRanking()}>
              {tErrors('retry')}
            </Button>
          </div>
        )}

        {load.status === 'ready' && !ranked && (
          <p className="rounded-2xl border border-gold/20 bg-felt-deep/50 p-4 text-cream/70">
            {t('site.empty', { minPlays: load.ranking.minPlays, days: load.ranking.days })}
          </p>
        )}

        {ranked && (
          <DrinkRankingList
            rows={ranked.games}
            label={t('site.label')}
            detail={(row) =>
              t('rowDetail', { drinks: row.drinks, plays: row.plays }) +
              (row.onlinePlays > 0 ? ` · ${t('site.online', { percent: Math.round((row.onlinePlays / row.plays) * 100) })}` : '')
            }
          />
        )}
      </div>
    </section>
  )
}
