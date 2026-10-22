"use client"

import { Check, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  BLUFF_POINTS_FOUND_REAL,
  BLUFF_POINTS_PER_FOOLED,
  BLUFF_SUBMIT_MS,
  BLUFF_VOTE_MS,
  type BluffClientView,
} from '@/lib/bluff/engine'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { rematchCounter } from '@/components/online/end-screen'
import { TV_FEED_SIZE, speechFeedItems } from '@/components/online/bot-speech/bot-speech-feed'
import { BluffSpeechFeed } from '@/components/online/bluff/BluffSpeechFeed'
import { bluffRevealReactions } from '@/lib/bluff/reveal-reactions'
import { TV_FEED_CLIP, TvBigCountdown, TvTimeBar } from './tv-shared'

type BluffPlayerView = BluffClientView['players'][number]

/**
 * Grille des propositions (vote) et des révélations : colonnes, taille du
 * texte et nombre de lignes affichées selon le nombre de cartes — jusqu'à 17
 * (16 bluffs + la vraie) doivent tenir dans la toile sans défilement.
 * `tight` : le bandeau « en attente du retour » mange ≈ 2,7 rem, on retire
 * une ligne (ou un cran de taille) là où la marge ne suffit plus.
 * `avatars` : votants affichés par carte avant « +N », borné pour que le nom
 * de l'auteur garde au moins 6 rem en 4 colonnes.
 */
function cardGrid(n: number, tight: boolean) {
  if (n <= 4) {
    return { cols: 2, voteText: 'text-4xl', revealText: 'text-4xl', clampVote: 'line-clamp-3', clampReveal: 'line-clamp-2', footer: 'text-2xl', avatars: 8, dense: false }
  }
  if (n <= 9) {
    return { cols: 3, voteText: 'text-3xl', revealText: tight ? 'text-2xl' : 'text-3xl', clampVote: 'line-clamp-2', clampReveal: 'line-clamp-2', footer: 'text-xl', avatars: 4, dense: false }
  }
  if (n <= 12) {
    return { cols: 4, voteText: 'text-2xl', revealText: 'text-2xl', clampVote: 'line-clamp-3', clampReveal: 'line-clamp-2', footer: 'text-xl', avatars: 2, dense: false }
  }
  if (n <= 16) {
    return { cols: 4, voteText: 'text-xl', revealText: 'text-xl', clampVote: tight ? 'line-clamp-2' : 'line-clamp-3', clampReveal: tight ? 'line-clamp-1' : 'line-clamp-2', footer: 'text-xl', avatars: 2, dense: tight }
  }
  return { cols: 4, voteText: 'text-xl', revealText: 'text-xl', clampVote: 'line-clamp-2', clampReveal: 'line-clamp-1', footer: 'text-xl', avatars: 2, dense: tight }
}

function gridStyle(n: number, cols: number) {
  const rows = Math.max(1, Math.ceil(n / cols))
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }
}

/**
 * LE GRAND BLUFF sur grand écran. La vue reçue est celle du spectateur
 * (`toBluffSpectatorView`) : aucun bluff ni vote individuel avant le reveal,
 * propositions anonymes pendant le vote — exactement ce que voit chaque
 * téléphone. Le reveal n'a pas de mise en scène côté téléphone (affiché dès
 * l'état reçu) : la TV suit sans délai.
 */
export function TvBluff({ room, state }: { room: TvRoomDto; state: BluffClientView }) {
  const t = useTranslations('games.bluff.game')
  const reveal = state.lastReveal
  const players = state.players
  const nameOf = (id: string | null | undefined) => players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const iconOfId = (id: string) => {
    const p = players.find((x) => x.id === id)
    return iconOf({ id, name: p?.name ?? '', isBot: p?.isBot ?? false })
  }

  if (state.phase === 'finished') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    const twoCols = sorted.length > 8
    const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-10 py-4">
        <p className="flex min-w-0 max-w-full items-center gap-4 text-6xl font-black text-white">
          <Trophy aria-hidden className="h-14 w-14 shrink-0 text-gold" />
          <span className="truncate">
            {state.winnerId ? t('victory.winnerIs', { name: nameOf(state.winnerId) }) : t('victory.tie')}
          </span>
        </p>
        <p className="text-base font-semibold uppercase tracking-[0.3em] text-white/70">{t('victory.finalScore')}</p>
        <div
          className={cn('grid w-full gap-x-6 gap-y-2', twoCols ? 'grid-cols-2' : 'max-w-4xl grid-cols-1')}
          style={twoCols ? { gridTemplateRows: `repeat(${Math.ceil(sorted.length / 2)}, auto)`, gridAutoFlow: 'column' } : undefined}
        >
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-4 rounded-2xl border px-6 font-bold',
                sorted.length > 5 ? 'py-1 text-2xl' : 'py-3 text-3xl',
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
        {rematch.total > 1 && rematch.count > 0 && (
          <p className="text-xl font-semibold text-white/80">
            {t('victory.rematchWaiting', { count: rematch.count, total: rematch.total })}
          </p>
        )}
      </div>
    )
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-4xl font-black uppercase tracking-widest text-rose-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-rose-200" />}
        </PhaseCountdown>
        <p className="text-2xl text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  const phase = state.phase
  const totalPhaseMs = phase === 'submit' ? BLUFF_SUBMIT_MS : BLUFF_VOTE_MS
  const doneOf = (p: BluffPlayerView) => (phase === 'submit' ? p.hasSubmitted : p.hasVoted)
  const doneCount = players.filter(doneOf).length
  const leftPlayer = players.find((p) => !p.isBot && p.leftAt)
  const prompt = state.prompt ?? ''
  const tight = Boolean(leftPlayer?.leftAt)
  // Mêmes bulles que le fil (paroles de la manche + réactions de la révélation).
  const withFeed =
    speechFeedItems(
      [...(state.speech ?? []), ...bluffRevealReactions(state)],
      state.promptIdx,
      null,
      TV_FEED_SIZE
    ).length > 0
  // Au vote et à la révélation, la question est déjà connue : deux lignes au plus, la place va aux cartes.
  const promptSize =
    phase === 'submit'
      ? prompt.length <= 70 ? 'text-5xl' : prompt.length <= 110 ? 'text-4xl' : 'text-3xl'
      : prompt.length <= 60 ? 'text-3xl' : 'text-2xl'

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 px-8 py-5">
      <div className="flex shrink-0 items-center gap-5">
        <span className="shrink-0 text-2xl font-black text-white/90">
          {t('round', { n: state.promptIdx + 1, total: state.totalRounds })}
        </span>
        <span className="shrink-0 rounded-full border border-rose-400/40 bg-rose-500/20 px-4 py-0.5 text-xl font-bold uppercase tracking-widest text-rose-200">
          {phase === 'submit' && t('phaseSubmit')}
          {phase === 'vote' && t('phaseVote')}
          {phase === 'reveal' && t('phaseReveal')}
        </span>
        {phase === 'vote' && (
          <span className="min-w-0 shrink truncate text-2xl font-bold text-white">{t('votePrompt')}</span>
        )}
        {state.phaseEndsAt !== null ? (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs }) => (
              <TvTimeBar timeLeftMs={leftMs} totalMs={totalPhaseMs} dangerMs={10_000} colorClass="bg-rose-400" dangerClass="bg-red-400" />
            )}
          </PhaseCountdown>
        ) : (
          <span className="flex-1" />
        )}
        {(phase === 'submit' || phase === 'vote') && (
          <span className="flex shrink-0 items-center gap-2 text-3xl font-black tabular-nums text-emerald-200">
            <Check aria-hidden className="h-8 w-8" />
            {doneCount}/{players.length}
          </span>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <div className="shrink-0 truncate rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-0.5 text-center text-xl font-semibold leading-tight text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {prompt && (
            <div className="shrink-0 rounded-3xl border border-rose-400/30 bg-rose-600/10 px-8 py-2.5 text-center">
              {/* leading-tight APRÈS la taille : cn (twMerge) l'efface s'il la précède. */}
              <p className={cn('font-black text-white', promptSize, 'leading-tight', phase === 'submit' ? 'line-clamp-3' : 'line-clamp-2')}>
                {prompt}
              </p>
            </div>
          )}

          {phase === 'submit' && <SubmitCenter players={players} iconOf={iconOf} submitPrompt={t('submitPrompt')} />}

          {phase === 'vote' && state.voteOptions && (
            <>
              <OptionsGrid options={state.voteOptions} tight={tight} />
              <StatusStrip players={players} iconOf={iconOf} doneOf={doneOf} />
            </>
          )}

          {phase === 'reveal' && reveal && (
            <>
              <p
                className={cn(
                  'shrink-0 truncate text-center font-black text-emerald-200',
                  reveal.realAnswer.length > 40 ? 'text-3xl' : 'text-4xl'
                )}
              >
                {t('reveal.realAnswer', { answer: reveal.realAnswer })}
              </p>
              <RevealGrid reveal={reveal} nameOf={nameOf} iconOfId={iconOfId} tight={tight} />
            </>
          )}
        </div>

        {/* Les paroles des bots à droite, comme sur la TV du Menteur : sans
            bulle, la colonne s'efface et laisse toute la largeur aux cartes,
            mais le fil reste monté (région live née avant la 1re parole). */}
        <div className={withFeed ? 'flex w-[22rem] shrink-0 flex-col justify-center' : 'hidden'}>
          <div className={TV_FEED_CLIP}>
            <BluffSpeechFeed view={state} iconOf={iconOf} variant="tv" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SubmitCenter({
  players,
  iconOf,
  submitPrompt,
}: {
  players: BluffPlayerView[]
  iconOf: (p: BluffPlayerView) => string
  submitPrompt: string
}) {
  const n = players.length
  const cols = n <= 3 ? n : n <= 6 ? 3 : 4
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
      <p className="text-4xl font-black text-rose-100">{submitPrompt}</p>
      <div className="grid w-full gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {players.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-1.5 text-2xl font-bold',
              p.hasSubmitted
                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-50'
                : 'border-white/10 bg-white/5 text-white/80'
            )}
          >
            <span aria-hidden className="shrink-0 text-3xl">
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.hasSubmitted && <Check aria-hidden className="h-7 w-7 shrink-0 text-emerald-300" />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Votants (✓) sous les propositions : nominatif jusqu'à 8 joueurs, avatars seuls au-delà pour laisser la place aux cartes. */
function StatusStrip({
  players,
  iconOf,
  doneOf,
}: {
  players: BluffPlayerView[]
  iconOf: (p: BluffPlayerView) => string
  doneOf: (p: BluffPlayerView) => boolean
}) {
  const named = players.length <= 8
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2.5">
      {players.map((p) => {
        const done = doneOf(p)
        return named ? (
          <span
            key={p.id}
            className={cn(
              'flex min-w-0 max-w-[16rem] items-center gap-2 rounded-full border px-4 py-1 text-xl font-bold',
              done ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-50' : 'border-white/10 bg-white/5 text-white/80'
            )}
          >
            <span aria-hidden className="shrink-0 text-2xl">
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className="min-w-0 truncate">{p.name}</span>
            {done && <Check aria-hidden className="h-6 w-6 shrink-0 text-emerald-300" />}
          </span>
        ) : (
          <span
            key={p.id}
            title={p.name}
            className={cn(
              'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-3xl',
              done ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/20 bg-white/5 opacity-60'
            )}
          >
            <span aria-hidden>
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            {done && (
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function OptionsGrid({ options, tight }: { options: Array<{ candidateId: string; text: string }>; tight: boolean }) {
  const g = cardGrid(options.length, tight)
  return (
    <div className="grid min-h-0 flex-1 gap-2" style={gridStyle(options.length, g.cols)}>
      {options.map((opt) => (
        <div
          key={opt.candidateId}
          className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/5 px-5 py-1 text-center"
        >
          <span className={cn('min-w-0 break-words font-black text-white', g.voteText, 'leading-[1.1]', g.clampVote)}>
            « {opt.text} »
          </span>
        </div>
      ))}
    </div>
  )
}

function RevealGrid({
  reveal,
  nameOf,
  iconOfId,
  tight,
}: {
  reveal: NonNullable<BluffClientView['lastReveal']>
  nameOf: (id: string | null | undefined) => string
  iconOfId: (id: string) => string
  tight: boolean
}) {
  const g = cardGrid(reveal.candidates.length, tight)
  return (
    <div className="grid min-h-0 flex-1 gap-2" style={gridStyle(reveal.candidates.length, g.cols)}>
      {reveal.candidates.map((c) => {
        const gained = c.isReal ? BLUFF_POINTS_FOUND_REAL : BLUFF_POINTS_PER_FOOLED * c.votes.length
        const shown = c.votes.length > g.avatars ? c.votes.slice(0, g.avatars - 1) : c.votes
        const extra = c.votes.length - shown.length
        return (
          <div
            key={c.candidateId}
            className={cn(
              'flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl border px-5',
              g.dense ? 'gap-0.5 py-0.5' : 'gap-1 py-1',
              c.isReal ? 'border-emerald-400/70 bg-emerald-500/20' : 'border-white/20 bg-white/5'
            )}
          >
            <span className={cn('min-w-0 break-words font-black text-white', g.revealText, 'leading-[1.1]', g.clampReveal)}>
              {c.isReal && <Check aria-hidden className="mr-2 inline h-[0.9em] w-[0.9em] text-emerald-300" />}« {c.text} »
            </span>
            {/* L'auteur passe avant les votants : plancher de 6 rem, ce sont les avatars qui cèdent. */}
            <div className={cn('flex min-w-0 items-center gap-2 font-bold', g.footer, 'leading-tight')}>
              <span className="min-w-[6rem] flex-1 truncate text-white/90">
                {!c.isReal && c.authorId ? nameOf(c.authorId) : ''}
              </span>
              {c.votes.length > 0 && (
                <span
                  className="flex min-w-0 items-center gap-1 overflow-hidden"
                  aria-label={c.votes.map((id) => nameOf(id)).join(', ')}
                >
                  {shown.map((id) => (
                    <span key={id} aria-hidden className="shrink-0">
                      <PlayerAvatarGlyph value={iconOfId(id)} />
                    </span>
                  ))}
                  {extra > 0 && <span className="shrink-0 text-lg text-white/80">+{extra}</span>}
                </span>
              )}
              {c.votes.length > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/20 px-2 text-lg font-black leading-tight tabular-nums text-amber-200">
                  +{gained}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
