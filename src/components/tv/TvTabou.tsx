"use client"

import type { ReactNode } from 'react'
import { Ban, Check, Mic, SkipForward, Trophy, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { TABOU_BOT_DESCRIBER_ROUND_MS, TABOU_COUNTDOWN_MS, TABOU_ROUND_MS, type TabouClientView, type TabouPlayerView, type TabouTeam } from '@/lib/tabou/engine'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { rematchCounter } from '@/components/online/end-screen'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

const TEAM_STYLES: Record<TabouTeam, { card: string; active: string; text: string }> = {
  A: { card: 'border-sky-400/25 bg-sky-500/5', active: 'border-sky-300 bg-sky-500/20', text: 'text-sky-300' },
  B: { card: 'border-rose-400/25 bg-rose-500/5', active: 'border-rose-300 bg-rose-500/20', text: 'text-rose-300' },
}

/**
 * TABOU VOCAL sur grand écran : les deux équipes en colonnes (score, joueurs,
 * décrivant marqué), la phase au centre. Les devineurs regardent la télé :
 * JAMAIS le mot en cours ni ses tabous (la vue spectateur ne les porte pas),
 * seul le mot du bilan devient public, comme sur les téléphones.
 */
export function TvTabou({ room, state }: { room: TvRoomDto; state: TabouClientView }) {
  const t = useTranslations('games.tabou.game')
  const tTv = useTranslations('tv')
  const describer = state.players.find((p) => p.id === state.describerId)
  const describing = state.phase === 'describing'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  let center: ReactNode
  if (state.phase === 'finished') {
    const color = state.winnerTeam === 'A' ? 'text-sky-300' : 'text-rose-300'
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    center = (
      <>
        <Trophy aria-hidden className={cn('h-28 w-28', color)} />
        <p className="font-display text-5xl font-black leading-tight text-gold">
          {state.winnerTeam === 'A' ? t('victory.teamAWin') : t('victory.teamBWin')}
        </p>
        <p className="text-3xl font-bold text-white/80">{t('score', { a: state.scores.A, b: state.scores.B })}</p>
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-3 text-2xl font-bold text-gold">
            {tTv('rematchPending')} <span className="tabular-nums">{rematch.count}/{rematch.total}</span>
          </p>
        )}
      </>
    )
  } else if (state.phase === 'countdown') {
    center = (
      <>
        <p className="text-4xl font-black uppercase tracking-widest text-emerald-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => (
            <TvBigCountdown seconds={Math.min(TABOU_COUNTDOWN_MS / 1000, Math.max(1, seconds))} colorClass="text-emerald-200" />
          )}
        </PhaseCountdown>
        <p className="text-2xl font-semibold text-white/80">{t('countdown.hint')}</p>
      </>
    )
  } else if (state.phase === 'roundEnd') {
    center = (
      <>
        <p className="text-xl font-bold uppercase tracking-widest text-emerald-300">{t('roundEnd.title')}</p>
        {state.lastRoundWord && (
          <p className="break-words font-display text-6xl font-black leading-tight text-white">
            {t('roundEnd.wordWas', { word: state.lastRoundWord.word })}
          </p>
        )}
        <div className="grid w-full grid-cols-3 gap-4">
          <RoundStat icon={Check} value={state.roundStats.found} label={t('roundEnd.found')} className="text-emerald-300" />
          <RoundStat icon={SkipForward} value={state.roundStats.passed} label={t('roundEnd.passed')} className="text-cream/80" />
          <RoundStat icon={Ban} value={state.roundStats.taboo} label={t('roundEnd.taboo')} className="text-red-300" />
        </div>
      </>
    )
  } else {
    // Un bot décrivant écourte la manche côté moteur : la barre part de sa vraie durée.
    const total = describer?.isBot ? TABOU_BOT_DESCRIBER_ROUND_MS : TABOU_ROUND_MS
    const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
    center = (
      <>
        <p className="text-xl font-bold uppercase tracking-widest text-emerald-300">{t('phaseDescribing')}</p>
        {describer && (
          <p className={cn('text-3xl font-black uppercase tracking-widest', TEAM_STYLES[describer.team].text)}>
            {describer.team === 'A' ? t('teamA') : t('teamB')}
          </p>
        )}
        <p className="line-clamp-2 break-words font-display text-5xl font-black leading-tight text-white">
          {describer ? t('describerIs', { name: describer.name }) : t('phaseDescribing')}
        </p>
        {state.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs, seconds }) => (
              <div className="flex w-full flex-col items-center gap-3">
                <span className={cn('text-8xl font-black leading-none tabular-nums', leftMs < 15_000 ? 'text-red-300' : 'text-white')}>
                  {Math.min(total / 1000, seconds)}
                </span>
                <div className="flex w-full">
                  <TvTimeBar timeLeftMs={leftMs} totalMs={total} dangerMs={15_000} colorClass="bg-emerald-400" dangerClass="bg-red-400" />
                </div>
              </div>
            )}
          </PhaseCountdown>
        )}
        {leftPlayer?.leftAt && (
          <p className="line-clamp-2 w-full break-words rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-2 text-xl font-semibold leading-snug text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </p>
        )}
      </>
    )
  }

  const column = (team: TabouTeam) => (
    <TeamColumn
      team={team}
      label={team === 'A' ? t('teamA') : t('teamB')}
      score={state.scores[team]}
      target={state.targetScore}
      players={state.players.filter((p) => p.team === team)}
      describerId={describing ? state.describerId : null}
      highlighted={state.phase === 'finished' ? state.winnerTeam === team : describing && describer?.team === team}
      iconOf={iconOf}
    />
  )

  return (
    <div className="flex h-full min-h-0 w-full items-stretch gap-8 px-8 py-6">
      {column('A')}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 text-center">{center}</div>
      {column('B')}
    </div>
  )
}

function RoundStat({ icon: Icon, value, label, className }: { icon: LucideIcon; value: number; label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-3xl border border-white/10 bg-black/20 px-4 py-4">
      <Icon aria-hidden className={cn('h-10 w-10', className)} />
      <span className={cn('text-7xl font-black leading-none tabular-nums', className)}>{value}</span>
      <span className={cn('text-2xl font-bold', className)}>{label}</span>
    </div>
  )
}

function TeamColumn({
  team,
  label,
  score,
  target,
  players,
  describerId,
  highlighted,
  iconOf,
}: {
  team: TabouTeam
  label: string
  score: number
  target: number
  players: TabouPlayerView[]
  describerId: string | null
  highlighted: boolean
  iconOf: (p: TabouPlayerView) => string
}) {
  const style = TEAM_STYLES[team]
  // Jusqu'à 8 joueurs par équipe : rangées en 2xl ; une petite équipe garde de grandes rangées.
  const roomy = players.length <= 4
  return (
    <div className="flex min-h-0 w-[21rem] shrink-0 flex-col justify-center">
      <div className={cn('flex max-h-full min-h-0 flex-col gap-3 overflow-hidden rounded-3xl border-2 p-5', highlighted ? style.active : style.card)}>
        <div className="flex items-end justify-between gap-3">
          <p className={cn('truncate text-2xl font-black uppercase tracking-widest', style.text)}>{label}</p>
          <p className="shrink-0 leading-none">
            <span className="text-6xl font-black tabular-nums text-white">{score}</span>
            <span className="text-2xl font-bold text-white/70"> / {target}</span>
          </p>
        </div>
        <ul className={cn('flex min-h-0 flex-col', roomy ? 'gap-3' : 'gap-2')}>
          {players.map((p) => {
            const isDescriber = p.id === describerId
            return (
              <li
                key={p.id}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-2xl px-3 font-bold',
                  roomy ? 'py-2 text-3xl' : 'py-1.5 text-2xl',
                  isDescriber ? 'bg-white/10 text-white ring-2 ring-gold' : 'text-white/90',
                  p.leftAt && 'opacity-70'
                )}
              >
                <span aria-hidden className="shrink-0 leading-none">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {isDescriber && <Mic aria-hidden className="h-7 w-7 shrink-0 text-gold" />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
