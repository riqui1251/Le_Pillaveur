"use client"

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { usePlayers } from '@/hooks/usePlayers'
import { SOIREE_CANDIDATE_IDS } from '@/lib/soiree/catalog'
import { useLocalizedGames } from '@/lib/games-i18n'
import { gameDrinkStats, historyDrinks, historyStats, topDrinkers } from '@/lib/soiree/device-stats'
import { readHistory } from '@/lib/soiree/storage'
import type { SoireeHistoryEntry } from '@/lib/soiree/summary'
import { DrinkRankingList, RankingSectionHeader, SiteDrinkRanking } from './SiteDrinkRanking'

/**
 * Le classement des gorgées sans habillage de page, le même sur /soiree/stats
 * et dans l'onglet « Gorgées » de /classement : tout le site d'abord
 * (compteurs anonymes lus sur le serveur), puis « Chez vous », calculé sur ce
 * téléphone — rien de cette partie ne part au serveur.
 *
 * Ne lit que `soiree.stats` : la page Classement ne reçoit que cette tranche
 * du Mode Soirée (rankingSlice, src/i18n/messages-slices.ts).
 *
 * `afterSite` se glisse juste après le classement du site : /classement y met
 * le classement des comptes en ligne, /soiree/stats rien.
 */
export function DrinkStatsSections({ afterSite }: { afterSite?: ReactNode }) {
  const t = useTranslations('soiree.stats')
  const locale = useLocale()
  const { players, loading } = usePlayers()
  const games = useLocalizedGames()
  const [history, setHistory] = useState<SoireeHistoryEntry[]>([])
  useEffect(() => setHistory(readHistory()), [])

  const title = (id: string) => games.find((g) => g.id === id)?.title ?? id
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.name ?? '?'
  const decimal = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const rows = useMemo(() => gameDrinkStats(players, SOIREE_CANDIDATE_IDS), [players])
  const drinkers = useMemo(() => topDrinkers(players), [players])
  const soirees = useMemo(() => historyStats(history), [history])

  return (
    <div className="flex flex-col gap-5">
      <SiteDrinkRanking />

      {afterSite}

      <section className="space-y-3" aria-labelledby="stats-home">
        <RankingSectionHeader id="stats-home" title={t('home.title')} lead={t('home.lead')} />

        {!loading && rows.length === 0 && (
          <p className="rounded-2xl border border-gold/20 bg-felt-deep/50 p-4 text-cream/70">{t('empty')}</p>
        )}

        {rows.length > 0 && (
          <DrinkRankingList
            rows={rows}
            label={t('rankingLabel')}
            detail={(row) =>
              t('rowDetail', { drinks: row.drinks, plays: row.plays }) +
              (row.topPlayerId && row.topDrinks > 0 ? ` · ${t('rowTop', { name: playerName(row.topPlayerId), count: row.topDrinks })}` : '')
            }
          />
        )}
      </section>

      {drinkers.length > 0 && (
        <section className="space-y-2" aria-label={t('drinkersTitle')}>
          <h3 className="font-display text-xl font-bold">{t('drinkersTitle')}</h3>
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
          <h3 className="font-display text-xl font-bold">{t('soireesTitle')}</h3>
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

      <div className="space-y-1.5 text-xs text-cream/50">
        <p>{t('footnoteSite')}</p>
        <p>{t('footnoteHome')}</p>
      </div>
    </div>
  )
}
