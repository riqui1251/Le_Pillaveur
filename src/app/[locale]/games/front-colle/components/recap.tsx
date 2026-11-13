"use client"

import { useTranslations } from 'next-intl'
import { Check, Undo2, X } from 'lucide-react'
import type { Player } from '@/lib/players'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { FC_SAID_COST, type FcAmbiance, type FcLogEntry, type FcTurnSummary, type FcWord } from '@/lib/front-colle/engine'
import { cn } from '@/lib/utils'

interface RecapProps {
  log: readonly FcLogEntry[]
  wordsById: ReadonlyMap<string, FcWord>
  summary: FcTurnSummary
  guesser: Player | undefined
  /** Fautifs possibles : toute la table sauf le devineur. */
  others: readonly Player[]
  ambiance: FcAmbiance
  onFlag: (playerId: string) => void
  onUndo: () => void
}

/** Récapitulatif d'un tour : mots trouvés et passés, gorgées (ou points) du tour, mot prononcé. */
export function Recap({ log, wordsById, summary, guesser, others, ambiance, onFlag, onUndo }: RecapProps) {
  const t = useTranslations('games.front-colle')
  const soft = ambiance === 'soft'
  const guesserName = guesser?.name ?? ''
  const net = summary.found - summary.passed
  const saidCount = (playerId: string) => summary.said.find((entry) => entry.playerId === playerId)?.count ?? 0
  const canUndo = summary.said.length > 0

  const guesserLine = soft
    ? net > 0
      ? t('soft.recap.guesserGain', { name: guesserName, count: net })
      : net < 0
        ? t('soft.recap.guesserLoss', { name: guesserName, count: -net })
        : t('soft.recap.guesserZero', { name: guesserName })
    : summary.passed > 0
      ? t('recap.guesserDrinks', { name: guesserName, count: summary.passed })
      : t('recap.guesserDry', { name: guesserName })

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('recap.words')}</h3>
        {log.length === 0 ? (
          <p className="px-1 py-2 text-sm text-cream/70">{t('recap.noWords')}</p>
        ) : (
          <ul className="space-y-1.5">
            {log.map((entry, index) => {
              const found = entry.result === 'found'
              // Partie reprise dans une autre langue : le mot n'est plus dans la banque, son résultat compte toujours.
              const word = wordsById.get(entry.wordId)?.word
              return (
                <li
                  key={`${entry.wordId}-${index}`}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2',
                    found ? 'border-emerald-300/30 bg-emerald-500/10' : 'border-red-300/30 bg-suit-red/10'
                  )}
                >
                  <span className="min-w-0">
                    {word ? (
                      <span className="block font-display text-base font-bold leading-snug text-cream [overflow-wrap:anywhere]">
                        {word}
                      </span>
                    ) : (
                      <span className="block text-sm italic text-cream/70">{t('recap.unknownWord')}</span>
                    )}
                    <span className="text-xs text-cream/70">{t(`modes.${entry.mode}`)}</span>
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 text-sm font-semibold',
                      found ? 'text-emerald-300' : 'text-red-300'
                    )}
                  >
                    {found ? <Check aria-hidden className="h-4 w-4" /> : <X aria-hidden className="h-4 w-4" />}
                    {found ? t('recap.found') : t('recap.passed')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
        <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          {soft ? t('soft.recap.tallyTitle') : t('recap.tallyTitle')}
        </h3>
        <ul className="space-y-1.5 text-sm text-cream/80">
          <li className="font-display text-base font-bold text-cream">{guesserLine}</li>
          {summary.said.map(({ playerId, count }) => {
            const name = others.find((player) => player.id === playerId)?.name ?? ''
            return (
              <li key={playerId} className="font-semibold text-red-300">
                {soft
                  ? t('soft.recap.saidLine', { name, count: count * FC_SAID_COST })
                  : t('recap.saidLine', { name, count: count * FC_SAID_COST })}
              </li>
            )
          })}
        </ul>
      </section>

      {others.length > 0 && (
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('recap.saidTitle')}</h3>
            {/* Toujours monté : retiré après la dernière annulation, il emportait le focus du clavier. */}
            <button
              type="button"
              onClick={canUndo ? onUndo : undefined}
              aria-disabled={!canUndo}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold',
                canUndo ? 'text-gold hover:text-gold-strong' : 'cursor-default text-cream/40'
              )}
            >
              <Undo2 aria-hidden className="h-4 w-4" />
              {t('recap.undo')}
            </button>
          </div>
          <p className="mb-3 text-sm text-cream/70">
            {soft ? t('soft.recap.saidHint', { count: FC_SAID_COST }) : t('recap.saidHint', { count: FC_SAID_COST })}
          </p>
          <div className="flex flex-wrap gap-2">
            {others.map((player) => {
              const count = saidCount(player.id)
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onFlag(player.id)}
                  aria-label={t('recap.flag', { name: player.name, count })}
                  className={cn(
                    'flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    count > 0
                      ? 'border-red-300/60 bg-suit-red/20 text-cream'
                      : 'border-gold/[0.15] bg-black/25 text-cream/80 hover:border-gold/40 hover:text-cream'
                  )}
                >
                  <PlayerIcon player={player} size="sm" className="h-6 w-6 text-sm" />
                  <PlayerName player={player} />
                  {count > 0 && (
                    <span className="ml-0.5 rounded-full bg-suit-red px-1.5 text-xs font-bold leading-5 text-cream">
                      {t('recap.flagCount', { count })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
