"use client"

import type { RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { RotateCcw, Trophy } from 'lucide-react'
import type { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { EndActionDock } from '@/components/game/EndActionDock'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { capCardsPlayed, ranking, type CapState } from '@/lib/cap-ou-pas-cap/engine'

/**
 * Bilan : cartes relevées et refusées par joueur, gorgées bues (ou points en Sans alcool),
 * classé par audace — prix relevés moins prix refusés.
 */
export function CapEndScreen({
  game,
  players,
  soft,
  titleRef,
  onReplay,
  onQuit,
}: {
  game: CapState
  players: Player[]
  soft: boolean
  titleRef: RefObject<HTMLHeadingElement>
  onReplay: () => void
  onQuit: () => void
}) {
  const t = useTranslations('games.cap-ou-pas-cap')
  const tc = useTranslations('common')
  const locale = useLocale()
  const rows = ranking(game)
  const playerById = (id: string) => players.find((p) => p.id === id)
  const plain = new Intl.NumberFormat(locale)
  // « +3 » / « −2 » : un vieux navigateur sans signDisplay affiche « 3 », sans planter.
  const signed = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' })
  const boldest = rows
    .filter((row) => row.won)
    .map((row) => playerById(row.playerId)?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <GameShell title={t('title')} onBack={onQuit} maxWidth={640}>
      <section className="flex flex-col items-center gap-2 text-center">
        <Trophy aria-hidden className="h-10 w-10 text-gold" />
        <h2 ref={titleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
          {t('end.title')}
        </h2>
        <p className="text-sm text-cream/80">{t('end.cardsPlayed', { count: capCardsPlayed(game) })}</p>
        {boldest.length > 0 && (
          <p className="mt-1 font-display text-lg font-bold text-cream">
            {t('end.boldest', { names: boldest.join(', ') })}
          </p>
        )}
      </section>

      <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          {t('end.results')}
        </h3>
        {/* En gorgées, le grand chiffre (gorgées bues) ne classe pas : la règle est dite et chaque
            ligne montre son audace. En points, le grand chiffre est déjà celui qui classe. */}
        {!soft && <p className="mt-1 text-xs leading-snug text-cream/70">{t('end.rankedBy')}</p>}
        <ol className="mt-2 space-y-2">
          {rows.map((row) => {
            const player = playerById(row.playerId)
            const details = [t('end.done', { count: row.done }), t('end.refused', { count: row.refused })]
            if (!soft) details.push(t('end.given', { count: row.donePrice }))
            return (
              <li key={row.playerId} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
                <span aria-hidden className="w-4 shrink-0 text-center font-display text-sm font-bold lining-nums tabular-nums text-gold">
                  {row.rank}
                </span>
                {player && <PlayerIcon player={player} size="md" />}
                <span className="min-w-0 flex-1">
                  {player && <PlayerName player={player} className="block truncate font-display text-base text-cream" />}
                  <span className="block text-xs leading-snug text-cream/70">{details.join(' · ')}</span>
                </span>
                {/* Chiffres « lining » : en Playfair, le zéro elzévirien se lisait « o ». */}
                <span className="flex shrink-0 flex-col items-end text-right">
                  <span className="font-display text-xl font-bold leading-none lining-nums tabular-nums text-gold">
                    {soft ? signed.format(row.points) : plain.format(row.refusedPrice)}
                  </span>
                  <span className="mt-0.5 text-xs text-cream/70">
                    {soft
                      ? t('end.pointsUnit', { count: Math.abs(row.points) })
                      : t('end.drunkUnit', { count: row.refusedPrice })}
                  </span>
                  {!soft && (
                    <span className="mt-0.5 text-xs font-semibold text-gold">
                      {t('end.boldness', { score: signed.format(row.points) })}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <EndActionDock
        voiceGutter={false}
        feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="cap-ou-pas-cap" />}
      >
        <Button variant="primary" size="gameLg" className="w-full" onClick={onReplay}>
          <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
          {tc('replay')}
        </Button>
        <Button variant="quiet" size="game" className="w-full" onClick={onQuit}>
          {tc('quit')}
        </Button>
      </EndActionDock>
    </GameShell>
  )
}
