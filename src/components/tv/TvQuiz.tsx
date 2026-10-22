"use client"

import { Beer, Check, Flame, TimerOff, Trophy, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { QUIZ_COUNTDOWN_MS, QUIZ_QUESTION_MS, QUIZ_REVEAL_MS, type QuizClientView, type QuizPlayerView } from '@/lib/quiz/engine'
import { cn } from '@/lib/utils'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { MedalDot } from '@/components/online/MedalDot'
import { rematchCounter, type RematchCounter } from '@/components/online/end-screen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { QuizSpeechFeed } from '@/components/online/quiz/QuizSpeechFeed'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * LE GRAND PILLAVEUR sur grand écran : la question en TRÈS grand, les
 * 4 choix couleur+forme, la barre de temps, et à droite le classement où
 * l'on voit qui a buzzé — les téléphones restent les buzzers. La vue reçue
 * est NEUTRE : la bonne réponse n'y figure qu'à la révélation (lastResult).
 */

const CHOICE_STYLE = [
  { shape: '▲', bg: 'from-red-600 to-rose-500' },
  { shape: '■', bg: 'from-blue-600 to-sky-500' },
  { shape: '●', bg: 'from-amber-600 to-yellow-500' },
  { shape: '◆', bg: 'from-emerald-600 to-green-500' },
] as const

// Paliers calés sur ~47 rem de large et ≤ 10 rem de haut pour l'énoncé
// (le reste revient à la grille des choix) : 2 lignes en 6xl/5xl, 3 en 4xl,
// 4 en 3xl, 5 en 2xl (énoncés jusqu'à 195 caractères dans les banques).
function questionSize(length: number): string {
  if (length <= 36) return 'text-6xl'
  if (length <= 48) return 'text-5xl'
  if (length <= 95) return 'text-4xl'
  if (length <= 150) return 'text-3xl'
  return 'text-2xl'
}

// Texte d'un choix : ~16,75 rem de large sur ~6,5 rem de haut, IDENTIQUE en
// question et en révélation (les pastilles vont dans la colonne de la forme).
// Le mot le plus long compte autant que la longueur : il ne se coupe pas.
function choiceSize(choices: readonly string[]): string {
  const longest = Math.max(...choices.map((c) => c.length))
  const word = Math.max(...choices.flatMap((c) => c.split(/\s+/).map((w) => w.length)))
  if (longest <= 18 && word <= 12) return 'text-4xl'
  if (longest <= 26 && word <= 15) return 'text-3xl'
  if (longest <= 48 && word <= 19) return 'text-2xl'
  return 'text-xl'
}

/**
 * Lignes du classement latéral (w-96) : sur deux lignes jusqu'à 6 joueurs,
 * pour garder les noms entiers, puis une ligne de plus en plus fine
 * (16 lignes tiennent dans ~35 rem).
 */
function rowTier(count: number) {
  if (count <= 6) return { stacked: true, list: 'gap-3', row: 'h-20 gap-3 rounded-2xl px-4', icon: 'h-6 w-6' }
  if (count <= 10) return { stacked: false, list: 'gap-1.5', row: 'h-12 gap-2 rounded-xl px-3 text-xl', icon: 'h-6 w-6' }
  return { stacked: false, list: 'gap-0.5', row: 'h-8 gap-2 rounded-lg px-3 text-xl', icon: 'h-6 w-6' }
}

export function TvQuiz({ room, state }: { room: TvRoomDto; state: QuizClientView }) {
  const t = useTranslations('tv')
  const tQ = useTranslations('games.quiz.game')
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const question = state.currentQuestion
  const reveal = state.phase === 'reveal' ? state.lastResult : null
  const totalPhaseMs = state.phase === 'question' ? QUIZ_QUESTION_MS : QUIZ_REVEAL_MS
  const ranking = [...state.players].sort((a, b) => b.score - a.score)
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  if (state.phase === 'finished') {
    // Même quorum que les téléphones (OnlineEndScreen) : les membres de la table et leurs seuls votes.
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return <QuizPodium ranking={ranking} rematch={rematch} soft={soft} iconOf={iconOf} />
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <p className="text-2xl font-bold text-white/80">
          {tQ('progress', { n: 1, total: state.questionCount })}
        </p>
        <p className="text-5xl font-black uppercase tracking-widest text-cyan-200">
          {tQ('countdown.title')}
        </p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => (
            <TvBigCountdown seconds={Math.max(1, Math.min(seconds, QUIZ_COUNTDOWN_MS / 1000))} colorClass="text-cyan-200" />
          )}
        </PhaseCountdown>
        <p className="text-3xl font-bold text-white">{tQ('countdown.hint')}</p>
        <p className="text-2xl text-white/80">{t('answerOnPhone')}</p>
      </div>
    )
  }

  const pickCounts = [0, 1, 2, 3].map((idx) =>
    reveal ? Object.values(reveal.perPlayer).filter((r) => r.choice === idx).length : 0
  )
  // Le moteur n'attend que les joueurs présents : le compteur aussi.
  const present = state.players.filter((p) => !p.leftAt)
  const answeredCount = present.filter((p) => p.hasAnswered).length
  const textSize = question ? choiceSize(question.choices) : 'text-4xl'
  const hasSpeech = (state.speech ?? []).some((sp) => sp.round === state.qIdx)
  const tier = rowTier(ranking.length)

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-6 py-4">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 items-center gap-5">
          <span className="shrink-0 text-3xl font-black tabular-nums text-white">
            {tQ('progress', { n: state.qIdx + 1, total: state.questionCount })}
          </span>
          {question && (
            <span className="shrink-0 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-1 text-lg font-bold uppercase tracking-widest text-cyan-200">
              {tQ(`cat.${question.cat}`)}
            </span>
          )}
          {state.phaseEndsAt !== null && (
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={250}>
              {({ leftMs, seconds }) => (
                <>
                  <TvTimeBar timeLeftMs={leftMs} totalMs={totalPhaseMs} dangerMs={5000} colorClass="bg-cyan-400" dangerClass="bg-red-400" />
                  {state.phase === 'question' && (
                    <span className={cn('w-16 shrink-0 text-right text-4xl font-black tabular-nums', leftMs < 5000 ? 'text-red-300' : 'text-white')}>
                      {Math.min(seconds, QUIZ_QUESTION_MS / 1000)}
                    </span>
                  )}
                </>
              )}
            </PhaseCountdown>
          )}
        </div>

        {question && (
          <div className="flex shrink-0 items-center justify-center rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-blue-600/20 to-transparent px-8 py-5 text-center">
            <p className={cn('font-black leading-tight text-white', questionSize(question.q.length))}>{question.q}</p>
          </div>
        )}

        {question && (
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-4">
            {question.choices.map((choice, idx) => {
              const style = CHOICE_STYLE[idx]
              const isCorrect = reveal?.answer === idx
              // On n'atténue que le FOND : texte et compte restent lisibles.
              const dimmed = Boolean(reveal) && !isCorrect
              return (
                <div
                  key={idx}
                  className={cn(
                    'relative flex min-h-0 min-w-0 items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br px-5 py-3 text-white shadow-lg',
                    style.bg,
                    dimmed && 'saturate-50',
                    isCorrect && 'ring-4 ring-white'
                  )}
                >
                  {dimmed && <span aria-hidden className="absolute inset-0 bg-black/50" />}
                  <span className="relative flex w-20 shrink-0 flex-col items-center gap-1">
                    {isCorrect ? (
                      <Check aria-hidden className="h-12 w-12" strokeWidth={3} />
                    ) : (
                      <span className="text-5xl leading-none drop-shadow-md" aria-hidden>{style.shape}</span>
                    )}
                    {reveal && (
                      <span className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-2xl font-black tabular-nums">
                        <Users aria-hidden className="h-6 w-6" />
                        {pickCounts[idx]}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'relative min-w-0 flex-1 break-words font-black leading-tight drop-shadow-md',
                      textSize,
                      dimmed ? 'text-white/80' : 'text-white'
                    )}
                  >
                    {choice}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {state.phase === 'question' && (
          <p className="shrink-0 text-center text-2xl font-bold text-white/80">{t('answerOnPhone')}</p>
        )}
        {/* Deux bulles au plus par question (une en buzzant, une à la
            révélation) : la grille des choix cède ces quelques rem. */}
        {hasSpeech && (
          <div className="flex shrink-0 justify-center">
            <QuizSpeechFeed
              speech={state.speech}
              qIdx={state.qIdx}
              players={state.players}
              iconOf={iconOf}
              variant="tv"
              soft={soft}
            />
          </div>
        )}
      </section>

      <aside className="flex w-96 shrink-0 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <p className="text-base font-semibold uppercase tracking-[0.25em] text-gold/90">{t('standings')}</p>
          {state.phase === 'question' && (
            <span className="flex items-center gap-1.5 text-lg font-black tabular-nums text-emerald-300">
              <Check aria-hidden className="h-6 w-6" strokeWidth={3} />
              {answeredCount}/{present.length}
            </span>
          )}
        </div>
        <ol className={cn('flex min-h-0 flex-1 flex-col justify-center', tier.list)}>
          {ranking.map((p) => (
            <QuizPlayerRow
              key={p.id}
              player={p}
              icon={iconOf(p)}
              phase={state.phase}
              result={reveal?.perPlayer[p.id] ?? null}
              stacked={tier.stacked}
              rowClass={tier.row}
              iconClass={tier.icon}
            />
          ))}
        </ol>
      </aside>
    </div>
  )
}

function QuizPlayerRow({
  player,
  icon,
  phase,
  result,
  stacked,
  rowClass,
  iconClass,
}: {
  player: QuizPlayerView
  icon: string
  phase: QuizClientView['phase']
  result: { choice: number | null; correct: boolean; points: number } | null
  stacked: boolean
  rowClass: string
  iconClass: string
}) {
  const answered = phase === 'question' && player.hasAnswered
  const status = (
    <>
      {player.streak >= 3 && (
        <span className="flex shrink-0 items-center text-orange-300">
          <Flame aria-hidden className={iconClass} />
          <span className="tabular-nums">{player.streak}</span>
        </span>
      )}
      {answered && <Check aria-hidden className={cn('shrink-0 text-emerald-300', iconClass)} strokeWidth={3} />}
      {result?.correct && <span className="shrink-0 font-black tabular-nums text-emerald-300">+{result.points}</span>}
      {result && !result.correct && (result.choice === null
        ? <TimerOff aria-hidden className={cn('shrink-0 text-red-300', iconClass)} />
        : <X aria-hidden className={cn('shrink-0 text-red-300', iconClass)} strokeWidth={3} />)}
    </>
  )
  return (
    <li
      className={cn(
        'flex shrink-0 items-center border font-bold',
        rowClass,
        player.leftAt
          ? 'border-white/10 bg-white/5 text-white/60'
          : answered || result?.correct
            ? 'border-emerald-400/50 bg-emerald-500/20 text-white'
            : result
              ? 'border-red-400/40 bg-red-500/10 text-white'
              : 'border-white/10 bg-white/5 text-white/80'
      )}
    >
      {stacked ? (
        <>
          <span className="shrink-0 text-4xl" aria-hidden><PlayerAvatarGlyph value={icon} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-2xl">{player.name}</span>
            <span className="flex h-7 items-center gap-3 text-xl">{status}</span>
          </span>
          <span className="shrink-0 text-right text-3xl font-black tabular-nums text-cyan-200">{player.score}</span>
        </>
      ) : (
        <>
          <span className="shrink-0" aria-hidden><PlayerAvatarGlyph value={icon} /></span>
          <span className="min-w-0 flex-1 truncate">{player.name}</span>
          {status}
          <span className="min-w-[3.5rem] shrink-0 text-right font-black tabular-nums text-cyan-200">{player.score}</span>
        </>
      )}
    </li>
  )
}

function QuizPodium({
  ranking,
  rematch,
  soft,
  iconOf,
}: {
  ranking: QuizPlayerView[]
  rematch: RematchCounter
  soft: boolean
  iconOf: (p: QuizPlayerView) => string
}) {
  const t = useTranslations('tv')
  const tQ = useTranslations('games.quiz.game')
  const last = ranking[ranking.length - 1]
  const count = ranking.length
  const cols = count <= 6 ? 1 : count <= 12 ? 2 : 3
  const rows = Math.ceil(count / cols)
  const row = count <= 6 ? 'h-16 text-3xl' : count <= 12 ? 'h-14 text-2xl' : 'h-12 text-xl'

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 py-4">
      <p className="flex min-w-0 max-w-full items-center gap-4 text-6xl font-black text-gold">
        <Trophy aria-hidden className="h-14 w-14 shrink-0" />
        <span className="truncate">{tQ('victoryTitle', { name: ranking[0]?.name ?? '—' })}</span>
      </p>
      {!soft && last && <p className="max-w-full truncate text-3xl font-bold text-amber-200">{tQ('lastDrinks', { name: last.name })}</p>}
      <ol
        className={cn('grid grid-flow-col gap-x-6 gap-y-3', cols === 1 ? 'w-[44rem]' : 'w-full')}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, auto)`,
        }}
      >
        {ranking.map((p, idx) => (
          <li
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-2xl border px-4 font-bold',
              row,
              idx === 0 ? 'border-amber-400/50 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-white/5 text-white'
            )}
          >
            {idx < 3 ? (
              <MedalDot position={idx + 1} className="h-10 w-10 shrink-0 text-xl" />
            ) : (
              <span className="w-10 shrink-0 text-center tabular-nums text-white/70">{idx + 1}</span>
            )}
            <span className="shrink-0" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 font-black tabular-nums text-cyan-200">{p.score}</span>
            {!soft && (
              <span className="flex shrink-0 items-center gap-1 text-white/80">
                <Beer aria-hidden className="h-6 w-6 text-amber-300" />
                <span className="tabular-nums">{p.sips}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      {rematch.count > 0 && (
        <p className="text-2xl font-bold text-white/80">
          {t('rematchPending')} <span className="tabular-nums">{rematch.count}/{rematch.total}</span>
        </p>
      )}
    </div>
  )
}
