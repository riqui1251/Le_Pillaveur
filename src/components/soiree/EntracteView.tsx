"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Droplets, Minus, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { useLocalizedGames } from '@/lib/games-i18n'
import { soireeCounting, soireeMinutes } from '@/lib/soiree/catalog'
import { soireeMetric, soireeStandings, upcomingProgram, upcomingRoom, type Soiree } from '@/lib/soiree/state'
import { cn } from '@/lib/utils'
import { GameBadge, MEDALS, SoireeCta, StepHeader, gameGradient, playerBarClass, useSoireePlayer, useSoireeUnits } from './soiree-ui'
import { ProgrammeEditor } from './ProgrammeEditor'
import { SoireeVote } from './SoireeVote'

/**
 * Entre deux manches : l'ardoise de la soirée, la manche qui vient de finir
 * (corrigeable à la main, et notée par la table) et la suite du programme
 * (modifiable).
 */
export function EntracteView({
  soiree,
  onLaunchNext,
  onSkipNext,
  onFinish,
  onCorrect,
  onEditUpcoming,
  onRoundVote,
}: {
  soiree: Soiree
  onLaunchNext: () => void
  onSkipNext: () => void
  onFinish: () => void
  onCorrect: (roundIndex: number, playerId: string, value: number) => void
  onEditUpcoming: (program: string[]) => void
  onRoundVote: (roundIndex: number, rating: number) => void
}) {
  const t = useTranslations('soiree.entracte')
  const units = useSoireeUnits()
  const playerOf = useSoireePlayer(soiree)
  const games = useLocalizedGames()
  const title = (id: string) => games.find((g) => g.id === id)?.title ?? id
  const metric = soireeMetric(soiree)
  const lastIndex = soiree.current - 1
  const last = soiree.rounds[lastIndex]
  const next = soiree.rounds[soiree.current]
  const needsInput = Boolean(last && last.status === 'done' && !last.edited && soireeCounting(last.gameId) !== 'auto')
  const [editing, setEditing] = useState(needsInput)
  const [editingProgram, setEditingProgram] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const standings = soireeStandings(soiree)
  const max = Math.max(1, ...standings.map((s) => s[metric]))
  const name = (id: string) => soiree.playerNames[id] ?? '?'
  const lastTotal = last ? Object.values(last.results).reduce((sum, r) => sum + r[metric], 0) : 0
  const showWater = !soiree.soft && soiree.current > 0 && soiree.current % 2 === 0 && Boolean(next)

  return (
    <>
      <StepHeader
        eyebrow={t('eyebrow', { done: soiree.current, total: soiree.rounds.length })}
        title={t('title')}
        lead={metric === 'drinks' ? t('leadDrinks') : t('leadWins')}
      />

      {last && (
        <section className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4" aria-label={t('lastLabel')}>
          <div className="flex items-start gap-3">
            <GameBadge gameId={last.gameId} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">{t('lastEyebrow', { number: lastIndex + 1 })}</p>
              <p className="font-display text-xl font-bold">{title(last.gameId)}</p>
              <p className="text-sm text-cream/70">
                {last.status === 'skipped' ? t('skipped') : lastTotal > 0 ? units(metric, lastTotal) : metric === 'drinks' ? t('nobodyDrank') : t('nobodyWon')}
              </p>
            </div>
            {last.status === 'done' && (
              <Button variant="quiet" size="game" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                <Pencil aria-hidden className="mr-1.5 h-4 w-4" />
                {t('correct')}
              </Button>
            )}
          </div>
          {editing && last.status === 'done' && (
            <div className="space-y-2 border-t border-gold/20 pt-3">
              <p className="text-sm text-amber-100">
                {soireeCounting(last.gameId) === 'manual'
                  ? t('manualPrompt', { game: title(last.gameId) })
                  : soireeCounting(last.gameId) === 'partial'
                    ? t('partialPrompt', { game: title(last.gameId) })
                    : t('correctLead')}
              </p>
              <ul className="space-y-1.5">
                {last.playerIds.map((id) => {
                  const value = last.results[id]?.[metric] ?? 0
                  return (
                    <li key={id} className="flex items-center gap-2.5">
                      <PlayerIcon player={playerOf(id)} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{name(id)}</span>
                      <button type="button" onClick={() => onCorrect(lastIndex, id, value - 1)} disabled={value <= 0} aria-label={t('less', { name: name(id) })} className="grid h-10 w-10 place-items-center rounded-xl border border-gold/30 transition hover:bg-gold/10 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                        <Minus aria-hidden className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-display text-xl font-bold tabular-nums" aria-live="polite">{value}</span>
                      <button type="button" onClick={() => onCorrect(lastIndex, id, value + 1)} aria-label={t('more', { name: name(id) })} className="grid h-10 w-10 place-items-center rounded-xl border border-gold/30 transition hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                        <Plus aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <Button variant="quiet" size="game" className="w-full" onClick={() => setEditing(false)}>
                {t('correctDone')}
              </Button>
            </div>
          )}
          {last.status === 'done' && (
            <SoireeVote
              className="border-t border-gold/20 pt-3"
              target={{ scope: 'round', soireeId: soiree.id, round: lastIndex, gameId: last.gameId }}
              soft={soiree.soft}
              value={last.vote}
              onVoted={(rating) => onRoundVote(lastIndex, rating)}
            />
          )}
        </section>
      )}

      <section className="space-y-2.5 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4" aria-label={t('title')}>
        {standings.map((row, i) => (
          <div key={row.playerId} className="soiree-deal grid grid-cols-[1.75rem_auto_1fr_auto] items-center gap-2.5" style={{ animationDelay: `${i * 80}ms` }}>
            <span
              className={cn('grid h-7 w-7 place-items-center rounded-full text-xs font-bold tabular-nums', i < 3 && row[metric] > 0 ? 'text-[#24201A]' : 'text-cream/60')}
              style={i < 3 && row[metric] > 0 ? { background: MEDALS[i] } : undefined}
            >
              {i + 1}
            </span>
            <PlayerIcon player={playerOf(row.playerId)} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{name(row.playerId)}</p>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className={cn('soiree-grow h-full rounded-full', playerBarClass(playerOf(row.playerId)))}
                  style={{ width: `${Math.round((row[metric] / max) * 100)}%`, animationDelay: `${200 + i * 80}ms` }}
                />
              </div>
            </div>
            <span className="text-right font-display text-xl font-bold tabular-nums">{row[metric]}</span>
          </div>
        ))}
      </section>

      {showWater && (
        <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-emerald-300/50 px-3 py-2.5 text-sm font-semibold text-emerald-200">
          <Droplets aria-hidden className="h-5 w-5 shrink-0" />
          {t('water')}
        </p>
      )}

      {next && (
        <section className="space-y-2" aria-label={t('nextLabel')}>
          <div className="soiree-deal relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#D8CCAE] bg-cream p-3 pt-4 text-[#24201A]" style={{ animationDelay: '250ms' }}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: gameGradient(next.gameId, 90) }} />
            <GameBadge gameId={next.gameId} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#5E5444]">{t('nextEyebrow', { number: soiree.current + 1 })}</p>
              <p className="font-display text-lg font-bold leading-tight">{title(next.gameId)}</p>
              <p className="text-xs text-[#5E5444]">{t('minutes', { minutes: soireeMinutes(next.gameId) })}</p>
            </div>
          </div>
          <button type="button" onClick={() => setEditingProgram((v) => !v)} aria-expanded={editingProgram} className="text-sm font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100">
            {editingProgram ? t('closeProgram') : t('editProgram')}
          </button>
          {editingProgram && (
            <ProgrammeEditor
              program={upcomingProgram(soiree)}
              onChange={onEditUpcoming}
              playerCount={soiree.playerIds.length}
              firstNumber={soiree.current + 1}
              maxRounds={upcomingRoom(soiree)}
            />
          )}
        </section>
      )}

      {confirmFinish && (
        <div role="alertdialog" aria-label={t('confirmTitle')} className="space-y-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
          <p className="font-display text-lg font-bold">{t('confirmTitle')}</p>
          <p className="text-sm text-cream/70">{t('confirmBody', { count: soiree.current })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="game" onClick={onFinish}>{t('confirmOk')}</Button>
            <Button variant="quiet" size="game" onClick={() => setConfirmFinish(false)}>{t('confirmCancel')}</Button>
          </div>
        </div>
      )}

      <SoireeCta>
        {next ? (
          <>
            <Button variant="primary" size="gameLg" className="w-full" onClick={onLaunchNext}>
              {t('next', { number: soiree.current + 1, game: title(next.gameId) })}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" size="game" onClick={onSkipNext}>{t('skip')}</Button>
              <Button variant="quiet" size="game" onClick={() => setConfirmFinish(true)}>{t('finish')}</Button>
            </div>
          </>
        ) : (
          <Button variant="primary" size="gameLg" className="w-full" onClick={onFinish}>
            {t('addition')}
          </Button>
        )}
      </SoireeCta>
    </>
  )
}
