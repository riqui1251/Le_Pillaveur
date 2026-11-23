"use client"

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DifficultyBadge } from '@/components/game/DifficultyBadge'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { useLocalizedGame } from '@/lib/games-i18n'
import { playGameSound } from '@/lib/sound/game-sounds'
import { soireeCounting, soireeDifficulty, soireeHeat, soireeMinutes } from '@/lib/soiree/catalog'
import type { Soiree } from '@/lib/soiree/state'
import { GameBadge, HeatPips, SoireeCta, gameGradient, useSoireePlayer } from './soiree-ui'
import { TutorialSteps } from './TutorialSteps'

/**
 * Avant chaque manche : la carte du jeu, son tuto en trois temps et les
 * joueurs annoncés — puis « C'est parti » ouvre le vrai jeu.
 */
export function RoundIntro({
  soiree,
  onStart,
  onBack,
  onSkip,
}: {
  soiree: Soiree
  onStart: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const t = useTranslations('soiree.intro')
  const tp = useTranslations('soiree.programme')
  const playerOf = useSoireePlayer(soiree)
  const round = soiree.rounds[soiree.current]
  const game = useLocalizedGame(round?.gameId ?? '')

  useEffect(() => {
    playGameSound('reveal')
  }, [])

  if (!round) return null
  const counting = soireeCounting(round.gameId)
  const name = (id: string) => soiree.playerNames[id] ?? '?'

  return (
    <>
      <p className="text-center text-xs font-extrabold uppercase tracking-[0.18em] text-gold">
        {t('eyebrow', { number: soiree.current + 1, total: soiree.rounds.length })}
      </p>

      <div className="relative grid place-items-center py-2">
        <div aria-hidden className="absolute inset-x-6 top-4 h-40 rounded-full opacity-50 blur-3xl" style={{ background: gameGradient(round.gameId) }} />
        <div className="soiree-flip relative flex w-[min(17rem,78%)] flex-col items-center gap-3 rounded-2xl border border-[#D8CCAE] bg-cream px-5 pb-5 pt-6 text-center text-[#24201A] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.75)]">
          <span aria-hidden className="absolute inset-x-0 top-0 h-2 rounded-t-2xl" style={{ background: gameGradient(round.gameId, 90) }} />
          <GameBadge gameId={round.gameId} size="lg" />
          <h1 className="text-balance font-display text-3xl font-bold leading-tight">{game?.title ?? round.gameId}</h1>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-[#5E5444]">
            <HeatPips heat={soireeHeat(round.gameId)} />
            <DifficultyBadge level={soireeDifficulty(round.gameId)} tone="card" />
            <span>{tp('minutes', { minutes: soireeMinutes(round.gameId) })}</span>
            {counting !== 'auto' && <span className="font-semibold">{tp(`counting.${counting}`)}</span>}
          </p>
        </div>
      </div>

      <section className="space-y-2" aria-label={t('howTo')}>
        <h2 className="font-display text-2xl font-bold text-cream">{t('howTo')}</h2>
        <TutorialSteps gameId={round.gameId} soft={soiree.soft} />
      </section>

      <section className="space-y-2" aria-label={t('players')}>
        <h2 className="text-sm font-semibold text-cream/70">{t('players')}</h2>
        <ul className="flex flex-wrap gap-2">
          {soiree.playerIds.map((id, i) => (
            <li key={id} className="soiree-deal inline-flex items-center gap-2 rounded-full border border-gold/25 bg-felt-deep/60 py-1 pl-1 pr-3 text-sm font-semibold" style={{ animationDelay: `${450 + i * 60}ms` }}>
              <PlayerIcon player={playerOf(id)} size="sm" />
              {name(id)}
            </li>
          ))}
        </ul>
      </section>

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" onClick={onStart}>
          {t('start')}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" size="game" onClick={onBack}>
            {t('back')}
          </Button>
          <Button variant="quiet" size="game" onClick={onSkip}>
            {t('skip')}
          </Button>
        </div>
      </SoireeCta>
    </>
  )
}
