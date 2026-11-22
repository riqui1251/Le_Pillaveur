"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { usePlayers } from '@/hooks/usePlayers'
import { useLocalizedGames } from '@/lib/games-i18n'
import { SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { gameDrinkStats, historyDrinks, historyStats, topDrinkers } from '@/lib/soiree/device-stats'
import { readHistory } from '@/lib/soiree/storage'
import type { SoireeHistoryEntry } from '@/lib/soiree/summary'
import { GameBadge, MEDALS, SoireeCta, SoireeShell, StepHeader, gameGradient } from './soiree-ui'

/** « Quel jeu fait le plus boire ? » — tout est calculé sur ce téléphone. */
export function SoireeStatsView() {
  const t = useTranslations('soiree.stats')
  const locale = useLocale()
  const { players, loading } = usePlayers()
  const games = useLocalizedGames()
  const [history, setHistory] = useState<SoireeHistoryEntry[]>([])
  useEffect(() => setHistory(readHistory()), [])

  const title = (id: string) => games.find((g) => g.id === id)?.title ?? id
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name ?? '?'
  const decimal = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const rows = useMemo(() => gameDrinkStats(players, SOIREE_GAME_IDS), [players])
  const drinkers = useMemo(() => topDrinkers(players), [players])
  const soirees = useMemo(() => historyStats(history), [history])
  const max = Math.max(0.1, ...rows.map((r) => r.perPlay))

  return (
    <SoireeShell>
      <StepHeader eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />

      {!loading && rows.length === 0 && (
        <p className="rounded-2xl border border-gold/20 bg-felt-deep/50 p-4 text-cream/70">{t('empty')}</p>
      )}

      {rows.length > 0 && (
        <ol className="space-y-2" aria-label={t('rankingLabel')}>
          {rows.map((row, i) => (
            <li key={row.gameId} className="soiree-deal rounded-xl border border-gold/20 bg-felt-deep/50 p-3" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2.5">
                <span
                  className={i < 3 ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-[#24201A]' : 'w-7 shrink-0 text-center font-display text-lg font-bold text-gold'}
                  style={i < 3 ? { background: MEDALS[i] } : undefined}
                >
                  {i + 1}
                </span>
                <GameBadge gameId={row.gameId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold">{title(row.gameId)}</p>
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
              <p className="mt-2 pl-[5rem] text-xs text-cream/60">
                {t('rowDetail', { drinks: row.drinks, plays: row.plays })}
                {row.topPlayerId && row.topDrinks > 0 ? ` · ${t('rowTop', { name: playerName(row.topPlayerId), count: row.topDrinks })}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}

      {drinkers.length > 0 && (
        <section className="space-y-2" aria-label={t('drinkersTitle')}>
          <h2 className="font-display text-2xl font-bold">{t('drinkersTitle')}</h2>
          <ul className="space-y-1.5">
            {drinkers.map((d) => {
              const player = players.find((p) => p.id === d.playerId)
              return (
                <li key={d.playerId} className="flex items-center gap-2.5 rounded-xl border border-gold/20 bg-felt-deep/50 px-3 py-2">
                  {player && <PlayerIcon player={player} size="sm" />}
                  <span className="min-w-0 flex-1 truncate font-semibold">{player?.name ?? '?'}</span>
                  <span className="text-sm tabular-nums text-cream/70">{t('drinkerDetail', { drinks: d.drinks, plays: d.plays })}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {soirees.count > 0 && (
        <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4" aria-label={t('soireesTitle')}>
          <h2 className="font-display text-2xl font-bold">{t('soireesTitle')}</h2>
          <p>{t('soireesCount', { count: soirees.count })}</p>
          {soirees.drinkingCount > 0 && <p className="text-cream/80">{t('soireesAverage', { value: decimal.format(soirees.averageDrinks) })}</p>}
          {soirees.record && (
            <p className="text-cream/80">
              {t('soireesRecord', {
                count: historyDrinks(soirees.record),
                date: new Date(soirees.record.date).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
              })}
            </p>
          )}
          {soirees.favoriteGameId && <p className="text-cream/80">{t('soireesFavorite', { game: title(soirees.favoriteGameId), count: soirees.favoriteGameRounds })}</p>}
        </section>
      )}

      <p className="text-xs text-cream/50">{t('note')}</p>

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" asChild>
          <Link href="/">{t('cta')}</Link>
        </Button>
      </SoireeCta>
    </SoireeShell>
  )
}
