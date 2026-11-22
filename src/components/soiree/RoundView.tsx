"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { useLocalizedGame } from '@/lib/games-i18n'
import { soireeCounting } from '@/lib/soiree/catalog'
import { isRoundComplete, roundHasData, soireeMetric, type Soiree } from '@/lib/soiree/state'
import { GameBadge, SoireeCta, StepHeader, useSoireePlayer, useSoireeUnits } from './soiree-ui'
import { TutorialSteps } from './TutorialSteps'

/**
 * La manche lancée, vue depuis la soirée : où en est le jeu, ce qu'il a déjà
 * remonté, et les sorties (retourner au jeu, clore, relancer, passer).
 */
export function RoundView({
  soiree,
  onGoToGame,
  onClose,
  onRestart,
  onSkip,
}: {
  soiree: Soiree
  onGoToGame: () => void
  onClose: () => void
  onRestart: () => void
  onSkip: () => void
}) {
  const t = useTranslations('soiree.round')
  const units = useSoireeUnits()
  const playerOf = useSoireePlayer(soiree)
  const round = soiree.rounds[soiree.current]
  const game = useLocalizedGame(round?.gameId ?? '')
  const [showTuto, setShowTuto] = useState(false)
  if (!round) return null
  const metric = soireeMetric(soiree)
  const complete = isRoundComplete(round)
  const hasData = roundHasData(round)
  const manual = soireeCounting(round.gameId) === 'manual'
  const name = (id: string) => soiree.playerNames[id] ?? '?'

  return (
    <>
      <div className="flex items-start gap-3">
        <GameBadge gameId={round.gameId} size="lg" className="soiree-pop" />
        <StepHeader
          eyebrow={t('eyebrow', { number: soiree.current + 1, total: soiree.rounds.length })}
          title={game?.title ?? round.gameId}
          lead={manual ? t('manual') : t('lead')}
        />
      </div>

      <Button variant="quiet" size="game" className="self-start" onClick={() => setShowTuto(true)}>
        <BookOpen aria-hidden className="mr-1.5 h-4 w-4" />
        {t('howTo')}
      </Button>
      <Dialog open={showTuto} onOpenChange={setShowTuto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/20 bg-felt-deep text-cream sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 font-display text-2xl text-cream">
              <GameBadge gameId={round.gameId} size="sm" />
              {game?.title ?? round.gameId}
            </DialogTitle>
            <DialogDescription className="text-cream/70">{t('howTo')}</DialogDescription>
          </DialogHeader>
          <TutorialSteps gameId={round.gameId} soft={soiree.soft} />
        </DialogContent>
      </Dialog>

      <section aria-label={t('tallyLabel')} className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4">
        <p className="text-sm font-semibold text-cream/70">{complete ? t('complete') : hasData ? t('partial') : t('waiting')}</p>
        <ul className="space-y-1.5">
          {round.playerIds.map((id) => {
            const tally = round.results[id]
            return (
              <li key={id} className="flex items-center gap-2.5">
                <PlayerIcon player={playerOf(id)} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">{name(id)}</span>
                <span className="text-sm tabular-nums text-cream/70">{tally && tally.played > 0 ? units(metric, tally[metric]) : '—'}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <SoireeCta>
        {complete ? (
          <Button variant="primary" size="gameLg" className="w-full" onClick={onClose}>
            {t('validate')}
          </Button>
        ) : (
          <Button variant="primary" size="gameLg" className="w-full" onClick={onGoToGame}>
            {t('goToGame')}
          </Button>
        )}
        <div className="grid grid-cols-3 gap-2">
          {!complete && (
            <Button variant="quiet" size="game" onClick={onClose}>
              {t('done')}
            </Button>
          )}
          <Button variant="quiet" size="game" className={complete ? 'col-span-2' : undefined} onClick={onRestart}>
            {t('restart')}
          </Button>
          <Button variant="quiet" size="game" onClick={onSkip}>
            {t('skip')}
          </Button>
        </div>
      </SoireeCta>
    </>
  )
}
