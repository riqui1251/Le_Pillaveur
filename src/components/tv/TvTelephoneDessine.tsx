"use client"

import { useTranslations } from 'next-intl'
import { Check, PenLine, Pencil, ScanEye, Sparkles } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  telephoneSpeechRound,
  TELEPHONE_DRAW_MS,
  TELEPHONE_WRITE_MS,
  type TelephoneClientView,
  type TelephoneContribution,
} from '@/lib/telephone-dessine/engine'
import { PartyCanvas } from '@/components/online/PartyCanvas'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { TelephoneSpeechFeed } from '@/components/online/telephone-dessine/TelephoneSpeechFeed'
import { cn } from '@/lib/utils'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * TÉLÉPHONE DESSINÉ sur grand écran : pendant les manches, la consigne
 * commune, le minuteur et qui a déjà rendu son maillon (jamais son contenu :
 * la vue spectateur n'en porte aucun) ; au reveal, LA vitrine — la chaîne
 * entière tient d'un coup sur la toile, comme sur les téléphones.
 */

/**
 * Gabarit de la chaîne révélée selon son nombre de maillons (= joueurs, 3 à 8),
 * calculé pour que tout tienne sur la toile 80×39 rem sans défilement. Le
 * dessin est en 4:3 : sa largeur fixe aussi la hauteur des cartes de texte.
 */
type RevealLayout = { cols: string; canvasRem: number; text: readonly [string, string, string, string] }

const TEXT_LARGE = ['text-5xl', 'text-4xl', 'text-3xl', 'text-2xl'] as const
const TEXT_COMPACT = ['text-4xl', 'text-3xl', 'text-2xl', 'text-xl'] as const

function revealLayout(links: number): RevealLayout {
  if (links <= 3) return { cols: 'grid-cols-3', canvasRem: 22, text: TEXT_LARGE }
  if (links === 4) return { cols: 'grid-cols-4', canvasRem: 16, text: TEXT_COMPACT }
  if (links <= 6) return { cols: 'grid-cols-3', canvasRem: 14.5, text: TEXT_COMPACT }
  return { cols: 'grid-cols-4', canvasRem: 13.25, text: TEXT_COMPACT }
}

/** Une phrase de 140 signes doit tenir dans la carte : la taille (puis la graisse) baisse avec la longueur. */
function textSizeClass(text: string, sizes: RevealLayout['text']): string {
  const len = text.length
  if (len <= 25) return `${sizes[0]} font-black`
  if (len <= 60) return `${sizes[1]} font-black`
  if (len <= 100) return `${sizes[2]} font-black`
  return `${sizes[3]} font-bold`
}

function RevealLink({
  link,
  index,
  layout,
}: {
  link: TelephoneContribution
  index: number
  layout: RevealLayout
}) {
  const t = useTranslations('games.telephone-dessine.game')
  const contentStyle = { width: `${layout.canvasRem}rem`, height: `${(layout.canvasRem * 3) / 4}rem` }
  const blank = (
    <div style={contentStyle} className="flex max-w-full items-center justify-center text-center">
      <p className="text-xl italic text-white/70">{t('reveal.blank')}</p>
    </div>
  )
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="self-start text-lg font-bold uppercase leading-none tracking-wide text-teal-200/90">
        {t('reveal.step', { n: index + 1 })}
      </p>
      {link.type === 'text' ? (
        link.text.trim() ? (
          <div className="flex w-full flex-1 items-center justify-center text-center" style={{ minHeight: contentStyle.height }}>
            <p className={cn('min-w-0 break-words leading-tight text-white', textSizeClass(link.text, layout.text))}>
              {link.text}
            </p>
          </div>
        ) : (
          blank
        )
      ) : link.strokes.length > 0 ? (
        <div style={contentStyle} className="max-w-full">
          <PartyCanvas strokes={link.strokes} readOnly />
        </div>
      ) : (
        blank
      )}
    </div>
  )
}

export function TvTelephoneDessine({ room, state }: { room: TvRoomDto; state: TelephoneClientView }) {
  const t = useTranslations('games.telephone-dessine.game')
  const tLobby = useTranslations('onlineLobby')
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const { mode } = useAmbianceMode()

  if (state.phase === 'finished') {
    const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-10 py-6 text-center">
        <Sparkles aria-hidden className="h-24 w-24 text-teal-300" />
        <p className="font-display text-6xl font-black text-gold">{t('victory.title')}</p>
        <p className="text-3xl font-semibold text-white/80">{t('victory.subtitle')}</p>
        {counter.total > 1 && counter.count > 0 && (
          <p className="rounded-full border border-teal-300/40 bg-teal-400/10 px-6 py-2 text-2xl font-bold text-teal-100">
            {tLobby('end.rematchStatus', { count: counter.count, total: counter.total })}
          </p>
        )}
      </div>
    )
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-10 py-6 text-center">
        <p className="text-4xl font-black uppercase tracking-widest text-teal-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-teal-200" />}
        </PhaseCountdown>
        <p className="text-3xl font-semibold text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  if (state.phase === 'reveal' && state.revealChain) {
    const layout = revealLayout(state.revealChain.linkCount)
    const leaderName = state.players.find((p) => p.id === room.currentTurnUserId)?.name ?? ''
    const hasSpeech = (state.speech ?? []).some((sp) => sp.round === telephoneSpeechRound(state))
    return (
      <div className="flex h-full w-full flex-col gap-4 px-6 py-4">
        <div className="flex shrink-0 items-center gap-6">
          <span className="shrink-0 rounded-full border border-teal-300/40 bg-teal-400/10 px-5 py-1.5 text-2xl font-black uppercase tracking-widest text-teal-200">
            {t('reveal.title', { current: state.revealIdx + 1, total: state.revealOrder.length })}
          </span>
          <p className="min-w-0 flex-1 truncate text-center text-5xl font-black text-white">
            {t('reveal.chainOf', { name: state.revealChain.ownerName })}
          </p>
          <ScanEye aria-hidden className="h-10 w-10 shrink-0 text-teal-300" />
        </div>
        <div className="flex min-h-0 flex-1 items-center">
          <div className={cn('grid w-full gap-4', layout.cols)}>
            {state.revealChain.links.map((link, i) => (
              <RevealLink key={`${state.revealIdx}-${i}`} link={link} index={i} layout={layout} />
            ))}
          </div>
        </div>
        {hasSpeech ? (
          // La réaction d'un bot à la chute, à côté du meneur attendu : une
          // bulle par chaîne, la grille calibrée garde sa hauteur.
          <div className="flex shrink-0 items-end gap-6">
            <div className="min-w-0 flex-1">
              <TelephoneSpeechFeed view={state} iconOf={iconOf} variant="tv" soft={mode === 'soft'} />
            </div>
            {leaderName && (
              <p className="max-w-[24rem] shrink-0 truncate text-xl font-semibold text-white/80">
                {t('reveal.waitingLeader', { name: leaderName })}
              </p>
            )}
          </div>
        ) : (
          leaderName && (
            <p className="shrink-0 truncate text-center text-xl font-semibold text-white/80">
              {t('reveal.waitingLeader', { name: leaderName })}
            </p>
          )
        )}
      </div>
    )
  }

  const submitted = new Set(state.submittedIds ?? [])
  const totalMs = state.actionType === 'draw' ? TELEPHONE_DRAW_MS : TELEPHONE_WRITE_MS
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const PhaseIcon = state.actionType === 'draw' ? Pencil : PenLine
  const phaseLabel =
    state.round === 0 ? t('tv.writing') : state.actionType === 'draw' ? t('tv.drawing') : t('tv.guessing')
  const cols = state.players.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="flex h-full w-full flex-col gap-5 px-8 py-5">
      <div className="flex shrink-0 items-center justify-between gap-6">
        <span className="shrink-0 rounded-full border border-teal-300/40 bg-teal-400/10 px-5 py-1.5 text-2xl font-black uppercase tracking-widest text-teal-200">
          {t('tv.round', { current: state.round + 1, total: state.totalRounds })}
        </span>
        {leftPlayer?.leftAt && (
          <span className="min-w-0 truncate rounded-full border border-amber-300/40 bg-amber-500/10 px-5 py-1.5 text-xl font-semibold text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        <div className="flex max-w-full items-center gap-5">
          <PhaseIcon aria-hidden className="h-16 w-16 shrink-0 text-teal-300" />
          <p className="min-w-0 text-6xl font-black leading-tight text-white">{phaseLabel}</p>
        </div>
        <p className="text-5xl font-black tabular-nums text-gold">
          {t('submittedCount', { count: state.submittedCount, total: state.totalToSubmit })}
        </p>
        {state.phaseEndsAt !== null && (
          <div className="flex w-full max-w-[56rem] items-center gap-5">
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
              {({ leftMs, seconds }) => (
                <>
                  <TvTimeBar timeLeftMs={leftMs} totalMs={totalMs} dangerMs={15_000} colorClass="bg-teal-400" dangerClass="bg-red-400" />
                  <span
                    className={cn(
                      'w-20 shrink-0 text-right text-4xl font-black tabular-nums',
                      leftMs < 15_000 ? 'text-red-300' : 'text-white'
                    )}
                  >
                    {Math.min(seconds, totalMs / 1000)}
                  </span>
                </>
              )}
            </PhaseCountdown>
          </div>
        )}
      </div>

      <div className={cn('grid shrink-0 gap-3', cols)}>
        {state.players.map((p) => {
          const done = submitted.has(p.id)
          return (
            <div
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-2.5',
                done ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-white/5',
                p.leftAt && 'opacity-60'
              )}
            >
              <span aria-hidden className="shrink-0 text-4xl leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className={cn('min-w-0 flex-1 truncate text-2xl font-bold', done ? 'text-white' : 'text-white/80')}>
                {p.name}
              </span>
              {done ? (
                <Check aria-hidden className="h-8 w-8 shrink-0 text-emerald-300" />
              ) : (
                <PhaseIcon aria-hidden className="h-7 w-7 shrink-0 text-white/60" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
