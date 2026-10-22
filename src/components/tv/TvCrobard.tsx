"use client"

import { Pencil, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import {
  CROBARD_BOT_DRAWER_ROUND_MS,
  CROBARD_CHOOSING_MS,
  CROBARD_COUNTDOWN_MS,
  CROBARD_DRAWING_MS,
  type CrobardClientView,
  type CrobardPlayerView,
} from '@/lib/crobard/engine'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { PartyCanvas } from '@/components/online/PartyCanvas'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { rematchCounter } from '@/components/online/end-screen'
import { TV_FEED_SIZE, speechFeedItems } from '@/components/online/bot-speech/bot-speech-feed'
import { CrobardSpeechFeed } from '@/components/online/crobard/CrobardSpeechFeed'
import { cn } from '@/lib/utils'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

type RowTone = 'drawer' | 'found' | 'plain'

/**
 * Le fil ne défile pas sur la TV : calé en bas de sa colonne et rogné en
 * haut s'il déborde, les dernières réactions restent lisibles. À côté de la
 * toile, il cède la place au tableau des seize joueurs : deux ou trois bulles.
 */
const FEED_CLIP = 'flex min-h-0 w-full shrink-0 flex-col justify-end overflow-hidden'
const FEED_ROOMY = 'max-h-[13rem]'
const FEED_BESIDE_CANVAS = 'max-h-[9rem]'

/**
 * Tableau des joueurs : une colonne jusqu'à 8, deux au-delà (16 au plus) —
 * hauteur comptée pour tenir sous la toile de 39 rem avec les noms longs.
 */
function PlayerBoard({
  players,
  toneOf,
  iconOf,
  roomy = false,
}: {
  players: CrobardPlayerView[]
  toneOf: (p: CrobardPlayerView) => RowTone
  iconOf: (p: CrobardPlayerView) => string
  roomy?: boolean
}) {
  const n = players.length
  const twoCols = n > 8
  const large = n <= 6 || (roomy && n <= 7)
  return (
    <div
      className={cn('grid min-h-0 content-start gap-x-3 gap-y-2', twoCols ? 'grid-cols-2' : 'grid-cols-1')}
      style={twoCols ? { gridTemplateRows: `repeat(${Math.ceil(n / 2)}, auto)`, gridAutoFlow: 'column' } : undefined}
    >
      {players.map((p) => {
        const tone = toneOf(p)
        return (
          <div
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-xl border px-3 font-bold',
              large ? 'py-2 text-2xl' : twoCols ? 'py-1 text-xl' : 'py-1.5 text-xl',
              tone === 'drawer'
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-100'
                : tone === 'found'
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                  : 'border-white/10 bg-white/5 text-white/90',
              p.leftAt && 'opacity-60'
            )}
          >
            <span aria-hidden className="shrink-0">
              {tone === 'drawer' ? <Pencil className="h-6 w-6 text-amber-300" /> : <PlayerAvatarGlyph value={iconOf(p)} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 font-black tabular-nums text-amber-200">{p.score}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * CROBARD sur grand écran. La vue reçue est celle du spectateur
 * (`toCrobardSpectatorView`) : jamais le mot ni les 3 choix, seulement les
 * traits (publics, le clou du spectacle), qui a trouvé, les scores et le mot
 * de la manche finie au bilan — comme sur chaque téléphone de devineur, qui
 * n'a aucune mise en scène : la TV suit l'état sans délai.
 */
export function TvCrobard({ room, state }: { room: TvRoomDto; state: CrobardClientView }) {
  const t = useTranslations('games.crobard.game')
  const players = state.players
  const ranking = [...players].sort((a, b) => b.score - a.score)
  const nameOf = (id: string | null | undefined) => players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const drawer = players.find((p) => p.id === state.drawerId)
  const roundLabel = t('round', { round: state.round, total: state.totalRounds })
  const toneOf = (p: CrobardPlayerView): RowTone =>
    p.id === state.drawerId ? 'drawer' : state.correctGuessers.includes(p.id) ? 'found' : 'plain'
  // Réactions des bots de la manche ; sans aucune, chaque colonne garde sa hauteur.
  const talking = speechFeedItems(state.speech ?? [], state.round, null, TV_FEED_SIZE).length > 0
  const feedIn = (height: string) =>
    talking ? (
      <div className={cn(FEED_CLIP, height)}>
        <CrobardSpeechFeed view={state} iconOf={iconOf} variant="tv" />
      </div>
    ) : null

  if (state.phase === 'finished') {
    const twoCols = ranking.length > 8
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-10 py-6">
        <p className="flex min-w-0 max-w-full items-center gap-4 text-6xl font-black text-white">
          <Trophy aria-hidden className="h-14 w-14 shrink-0 text-gold" />
          <span className="truncate">{t('victory.title', { name: nameOf(state.winnerId) })}</span>
        </p>
        <div
          className={cn('grid w-full gap-x-6 gap-y-2', twoCols ? 'grid-cols-2' : 'max-w-4xl grid-cols-1')}
          style={twoCols ? { gridTemplateRows: `repeat(${Math.ceil(ranking.length / 2)}, auto)`, gridAutoFlow: 'column' } : undefined}
        >
          {ranking.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-4 rounded-2xl border px-6 font-bold',
                ranking.length > 5 ? 'py-1.5 text-2xl' : 'py-3 text-3xl',
                p.id === state.winnerId
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                  : 'border-white/10 bg-white/5 text-white/90'
              )}
            >
              <span className="w-10 shrink-0 text-center tabular-nums text-white/70">{i + 1}</span>
              <span aria-hidden className="shrink-0">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 font-black tabular-nums text-amber-200">{p.score}</span>
            </div>
          ))}
        </div>
        {rematch.count > 0 && (
          <p className="text-xl font-semibold text-white/80">
            {t('victory.rematchWaiting', { count: rematch.count, total: rematch.total })}
          </p>
        )}
      </div>
    )
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6">
        <p className="text-4xl font-black uppercase tracking-widest text-gold">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.min(CROBARD_COUNTDOWN_MS / 1000, Math.max(1, seconds))} colorClass="text-gold" />}
        </PhaseCountdown>
        <p className="text-2xl text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  if (state.phase === 'roundEnd') {
    const word = state.lastRoundWord
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
        <div className="shrink-0 text-center">
          <p className="text-xl font-bold uppercase tracking-[0.3em] text-gold/90">
            {t('roundEnd.title')} · {roundLabel}
          </p>
          {word && (
            <p className={cn('mt-1 break-words font-black leading-tight text-cream', word.length > 14 ? 'text-5xl' : 'text-6xl')}>
              {t('roundEnd.wordWas', { word })}
            </p>
          )}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-6">
          {state.strokes.length > 0 && (
            <div className="flex aspect-[4/3] h-full max-w-[48%] shrink-0 items-center">
              <PartyCanvas strokes={state.strokes} readOnly className="w-full" />
            </div>
          )}
          <div className="flex min-w-0 max-w-5xl flex-1 flex-col justify-center gap-4 self-stretch">
            <div className="min-h-0 overflow-hidden">
              <PlayerBoard players={ranking} toneOf={toneOf} iconOf={iconOf} roomy />
            </div>
            {feedIn(FEED_ROOMY)}
          </div>
        </div>
      </div>
    )
  }

  if (state.phase === 'choosing') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-10 py-6 text-center">
        <p className="text-xl font-bold uppercase tracking-[0.3em] text-gold/90">{roundLabel}</p>
        <p className="flex min-w-0 max-w-full flex-col items-center gap-2 text-3xl font-bold text-white/80">
          {t.rich('choosing.waitingForName', {
            name: nameOf(state.drawerId),
            b: (chunks) => (
              <span className="flex min-w-0 max-w-full items-center gap-5 text-6xl font-black text-white">
                {drawer && (
                  <span aria-hidden className="shrink-0">
                    <PlayerAvatarGlyph value={iconOf(drawer)} />
                  </span>
                )}
                <span className="min-w-0 truncate">{chunks}</span>
              </span>
            ),
          })}
        </p>
        {state.phaseEndsAt !== null && (
          <div className="flex w-3/5 items-center">
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
              {({ leftMs }) => (
                <TvTimeBar timeLeftMs={Math.min(CROBARD_CHOOSING_MS, leftMs)} totalMs={CROBARD_CHOOSING_MS} dangerMs={3_000} colorClass="bg-gold" dangerClass="bg-red-400" />
              )}
            </PhaseCountdown>
          </div>
        )}
        <div className="mt-2 flex w-full flex-wrap justify-center gap-3">
          {ranking.map((p) => (
            <span
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-full border px-4 py-1.5 text-xl font-bold',
                p.id === state.drawerId ? 'border-amber-400/50 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-white/5 text-white/90',
                p.leftAt && 'opacity-60'
              )}
            >
              <span aria-hidden className="shrink-0">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="max-w-[12rem] truncate">{p.name}</span>
              <span className="shrink-0 font-black tabular-nums text-amber-200">{p.score}</span>
            </span>
          ))}
        </div>
        {talking && <div className="flex w-full max-w-3xl min-h-0 shrink-0 justify-center">{feedIn(FEED_ROOMY)}</div>}
      </div>
    )
  }

  // La durée de la manche est fixée au départ (80 s, 5 s si un bot dessine) : un
  // dessinateur remplacé par un bot en cours de manche garde ses 80 s. La marge
  // absorbe le décalage d'horloge entre serveur et TV au départ d'une manche de bot.
  const roundTotalMs = (leftMs: number) =>
    drawer?.isBot && leftMs <= CROBARD_BOT_DRAWER_ROUND_MS + 2_000 ? CROBARD_BOT_DRAWER_ROUND_MS : CROBARD_DRAWING_MS
  const leftPlayer = players.find((p) => !p.isBot && p.leftAt)
  const guesserCount = players.filter((p) => p.id !== state.drawerId && !p.leftAt).length

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-6 py-4">
      <div className="flex aspect-[4/3] h-full max-w-[60%] shrink-0 flex-col gap-2">
        {leftPlayer?.leftAt && (
          <p className="shrink-0 break-words rounded-2xl border border-amber-400/50 bg-amber-500/20 px-5 py-2 text-center text-xl font-bold leading-snug text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </p>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex aspect-[4/3] h-full max-w-full items-center">
            <PartyCanvas strokes={state.strokes} readOnly className="w-full" />
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-lg font-bold uppercase tracking-[0.2em] text-gold/90">{roundLabel}</p>
          <p className="shrink-0 text-2xl font-black text-emerald-300">
            {t('foundCount', { found: state.correctGuessers.length, total: guesserCount })}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-500/20 px-4 py-2">
          <Pencil aria-hidden className="h-8 w-8 shrink-0 text-amber-300" />
          <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-3xl font-black text-amber-100">
            {t.rich('drawerIs', {
              name: drawer?.name ?? '—',
              b: (chunks) => <span className="min-w-0 truncate">{chunks}</span>,
            })}
          </span>
        </div>
        {state.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs }) => {
              const totalPhaseMs = roundTotalMs(leftMs)
              const ms = Math.min(totalPhaseMs, leftMs)
              const danger = ms < 15_000
              return (
                <div className="flex items-center gap-4">
                  <span className={cn('w-16 shrink-0 text-right text-4xl font-black tabular-nums', danger ? 'text-red-300' : 'text-white')}>
                    {Math.ceil(ms / 1000)}
                  </span>
                  <TvTimeBar timeLeftMs={ms} totalMs={totalPhaseMs} dangerMs={15_000} colorClass="bg-gold" dangerClass="bg-red-400" />
                </div>
              )
            }}
          </PhaseCountdown>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <PlayerBoard players={ranking} toneOf={toneOf} iconOf={iconOf} />
        </div>
        {feedIn(FEED_BESIDE_CANVAS)}
      </aside>
    </div>
  )
}
