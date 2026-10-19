"use client"

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Crown, Gavel, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { SF_COUNTDOWN_MS, SF_JUDGE_MS, SF_SUBMIT_MS, type SFClientView, type SFPlayerView } from '@/lib/sans-filtre/engine'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { MedalDot } from '@/components/online/MedalDot'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * SANS FILTRE sur grand écran : la carte noire en géant, la progression des
 * abattages (jamais le contenu des mains), puis les réponses anonymes pendant
 * la lecture du juge et la carte couronnée avec son auteur. À droite, la
 * table dans l'ordre des téléphones : juge, « a joué », couronnes.
 */

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Largeur utile (rem) de la colonne de jeu : toile de 80 rem moins marges, avec ou sans la table à droite. */
const MAIN_W_WITH_TABLE = 80 - 3 - 20 - 1.5
const MAIN_W_FULL = 80 - 3
const ANSWER_GAP = 0.75

/**
 * Paliers des réponses du jugement, du plus grand au plus serré : la taille
 * retenue est la première qui TIENT dans la hauteur restante (mesurée), et
 * la table de droite ne cède sa place qu'en dernier recours (grandes tablées
 * aux réponses longues). `cardW` = largeur visée d'une carte, en rem.
 */
const ANSWER_LEVELS = [
  { size: 'text-4xl', cardW: 17, table: true },
  { size: 'text-3xl', cardW: 15, table: true },
  { size: 'text-2xl', cardW: 13, table: true },
  { size: 'text-xl', cardW: 11.5, table: true },
  { size: 'text-2xl', cardW: 13.5, table: false },
  { size: 'text-xl', cardW: 13.5, table: false },
] as const

function answerCols(count: number, cardW: number, width: number): number {
  const max = Math.max(1, Math.min(count, Math.floor((width + ANSWER_GAP) / (cardW + ANSWER_GAP))))
  const rows = Math.ceil(count / max)
  return Math.ceil(count / rows)
}

function blackSize(length: number, compact: boolean): string {
  if (compact) return length <= 60 ? 'text-3xl' : 'text-2xl'
  if (length <= 45) return 'text-5xl'
  if (length <= 70) return 'text-4xl'
  return 'text-3xl'
}

/** Lignes de la table : plus il y a de joueurs, plus elles s'affinent (16 tiennent dans ~33 rem). */
function rowTier(count: number) {
  if (count <= 6) return { list: 'gap-3', row: 'h-14 gap-3 rounded-2xl px-5 text-3xl', icon: 'h-8 w-8' }
  if (count <= 10) return { list: 'gap-1.5', row: 'h-11 gap-3 rounded-xl px-4 text-2xl', icon: 'h-7 w-7' }
  return { list: 'gap-px', row: 'h-8 gap-2 rounded-lg px-3 text-xl', icon: 'h-6 w-6' }
}

/**
 * Palier d'ajustement mesuré : repart du plus grand à chaque nouveau contenu
 * (`key`) ou redimensionnement de la fenêtre, et descend tant que le contenu
 * dépasse sa boîte. Les montées successives se font dans l'effet de mise en
 * page, avant peinture.
 */
function useFitLevel(key: string, maxLevel: number) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ key, level: 0, epoch: 0 })
  const level = fit.key === key ? fit.level : 0

  useIsoLayoutEffect(() => {
    const box = boxRef.current
    const content = box?.firstElementChild as HTMLElement | null
    if (!box || !content || level >= maxLevel) return
    if (content.offsetHeight > box.clientHeight + 1) setFit({ key, level: level + 1, epoch: fit.epoch })
  }, [key, level, maxLevel, fit.epoch])

  useEffect(() => {
    const reset = () => setFit((f) => ({ key: f.key, level: 0, epoch: f.epoch + 1 }))
    window.addEventListener('resize', reset)
    // Les métriques changent quand la police d'affichage finit de charger.
    void document.fonts?.ready.then(reset)
    return () => window.removeEventListener('resize', reset)
  }, [])

  // La boîte rétrécit quand un frère de hauteur variable apparaît (bandeau de
  // retour) : on revérifie sans revenir au plus grand palier, sinon masquer la
  // table (carte noire plus large, donc moins haute) ferait osciller la mesure.
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    let lastHeight = box.clientHeight
    const observer = new ResizeObserver(() => {
      if (box.clientHeight === lastHeight) return
      lastHeight = box.clientHeight
      setFit((f) => ({ ...f, epoch: f.epoch + 1 }))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [key])

  return { boxRef, level }
}

export function TvSansFiltre({ room, state }: { room: TvRoomDto; state: SFClientView }) {
  const t = useTranslations('games.sans-filtre.game')
  const submissions = state.phase === 'judging' ? state.submissions ?? [] : []
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const fitKey = `${state.phase}#${state.round}#${submissions.map((s) => s.card).join(',')}#${leftPlayer?.id ?? ''}`
  const { boxRef, level } = useFitLevel(fitKey, ANSWER_LEVELS.length - 1)

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—'

  if (state.phase === 'finished') {
    return <SansFiltrePodium room={room} state={state} iconOf={iconOf} nameOf={nameOf} />
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <p className="text-2xl font-bold text-white/80">{t('round', { n: 1, total: state.totalRounds })}</p>
        <p className="text-5xl font-black uppercase tracking-widest text-amber-200">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => (
            <TvBigCountdown seconds={Math.min(SF_COUNTDOWN_MS / 1000, Math.max(1, seconds))} colorClass="text-amber-200" />
          )}
        </PhaseCountdown>
        <p className="text-3xl font-bold text-white">{t('countdown.hint')}</p>
      </div>
    )
  }

  const judge = state.players.find((p) => p.isJudge)
  const inRound = state.players.filter((p) => !p.isJudge && !p.leftAt)
  const playedCount = inRound.filter((p) => p.hasPlayed).length
  const totalPhaseMs = state.phase === 'judging' ? SF_JUDGE_MS : SF_SUBMIT_MS
  const fitLevel = ANSWER_LEVELS[state.phase === 'judging' ? level : 0]
  const showTable = state.phase !== 'judging' || fitLevel.table
  const cols = answerCols(
    Math.max(1, submissions.length),
    fitLevel.cardW,
    showTable ? MAIN_W_WITH_TABLE : MAIN_W_FULL
  )
  const tier = rowTier(state.players.length)
  const crownBoard = showTable ? [] : [...state.players].filter((p) => p.crowns > 0).sort((a, b) => b.crowns - a.crowns)
  const phaseLabel =
    state.phase === 'submit' ? t('phaseSubmit') : state.phase === 'judging' ? t('phaseJudging') : t('phaseReveal')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-3">
      <header className="flex h-11 shrink-0 items-center gap-5">
        <span className="shrink-0 text-3xl font-black tabular-nums text-white">
          {t('round', { n: state.round + 1, total: state.totalRounds })}
        </span>
        <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-4 py-1 text-lg font-bold uppercase tracking-widest text-gold">
          {phaseLabel}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-bold text-amber-100">
          <Gavel aria-hidden className="h-7 w-7 shrink-0 text-amber-300" />
          <span className="truncate">{t('judgeIs', { name: judge?.name ?? '—' })}</span>
        </span>
        {state.phaseEndsAt !== null && (
          <div className="flex w-72 shrink-0 items-center gap-3">
            <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
              {({ leftMs, seconds }) => (
                <>
                  <TvTimeBar timeLeftMs={leftMs} totalMs={totalPhaseMs} dangerMs={10_000} colorClass="bg-gold" dangerClass="bg-suit-red" />
                  <span className={cn('w-14 shrink-0 text-right text-3xl font-black tabular-nums', leftMs < 10_000 ? 'text-red-300' : 'text-white')}>
                    {Math.min(seconds, totalPhaseMs / 1000)}
                  </span>
                </>
              )}
            </PhaseCountdown>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-6">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {leftPlayer?.leftAt && (
            <p className="shrink-0 truncate rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-2 text-center text-xl font-bold text-amber-100">
              <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
                {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
              </PhaseCountdown>
            </p>
          )}

          {crownBoard.length > 0 && (
            <ol className="flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden">
              {crownBoard.map((p) => (
                <li
                  key={p.id}
                  className="flex h-10 min-w-0 max-w-[16rem] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-lg font-bold text-white"
                >
                  <span className="shrink-0" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-1 font-black tabular-nums text-amber-200">
                    <Crown aria-hidden className="h-6 w-6" />
                    {p.crowns}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {state.black && (
            <div
              className={cn(
                'shrink-0 rounded-3xl border-2 border-gold/50 bg-[#1d1a14] text-center shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]',
                state.phase === 'submit' ? 'px-8 py-5' : 'px-6 py-3'
              )}
            >
              {state.phase === 'submit' && (
                <p className="text-base font-semibold uppercase tracking-[0.25em] text-gold/90">{t('blackLabel')}</p>
              )}
              <p
                className={cn(
                  'font-display font-bold leading-snug text-cream',
                  state.phase === 'submit' && 'mt-2',
                  blackSize(state.black.length, state.phase !== 'submit')
                )}
              >
                {state.black}
              </p>
            </div>
          )}

          {state.phase === 'submit' && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
              <div className="flex max-w-full flex-wrap justify-center gap-3">
                {inRound.map((p) => (
                  <span
                    key={p.id}
                    aria-hidden
                    className={cn(
                      'flex items-center justify-center rounded-xl transition-colors',
                      inRound.length <= 8 ? 'h-28 w-20 text-4xl' : 'h-20 w-14 text-3xl',
                      p.hasPlayed
                        ? 'border-2 border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.8)]'
                        : 'border-2 border-dashed border-white/30 bg-white/5'
                    )}
                  >
                    {p.hasPlayed && '♣'}
                  </span>
                ))}
              </div>
              <p className="text-3xl font-bold text-white">
                {t('judgeWaits', { count: playedCount, total: inRound.length })}
              </p>
            </div>
          )}

          {state.phase === 'judging' && (
            <div ref={boxRef} className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
              <ol
                className="grid shrink-0 gap-3"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {submissions.map((s) => (
                  <li
                    key={s.card}
                    className={cn(
                      'flex min-w-0 items-center justify-center rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-2 text-center font-bold leading-tight text-[#24201A] shadow-[0_10px_20px_-12px_rgba(0,0,0,0.8)]',
                      fitLevel.size
                    )}
                  >
                    {s.text}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {state.phase === 'reveal' && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
              {state.crowned ? (
                <>
                  <p className="flex items-center gap-3 font-display text-4xl font-bold text-gold">
                    <Crown aria-hidden className="h-10 w-10" /> {t('crowned.title')}
                  </p>
                  <div
                    className={cn(
                      'w-full rounded-3xl border-2 border-gold/60 bg-cream px-8 py-5 text-center font-black leading-tight text-[#24201A] shadow-[0_18px_36px_-16px_rgba(0,0,0,0.85)]',
                      state.crowned.text.length <= 40 ? 'text-5xl' : 'text-4xl'
                    )}
                  >
                    {state.crowned.text}
                  </div>
                  <p className="max-w-full truncate text-3xl font-bold text-amber-200">
                    {t('crowned.by', { name: state.crowned.playerName })}
                  </p>
                </>
              ) : (
                <p className="text-center text-3xl font-bold text-white/80">{t('crowned.nobody')}</p>
              )}
            </div>
          )}
        </section>

        {showTable && (
          <aside className="flex w-80 shrink-0 flex-col justify-center">
            <ol className={cn('flex min-h-0 flex-col', tier.list)}>
              {state.players.map((p) => (
                <TableRow
                  key={p.id}
                  player={p}
                  icon={iconOf(p)}
                  played={state.phase === 'submit' && !p.isJudge && p.hasPlayed}
                  crownedNow={state.phase === 'reveal' && state.crowned?.playerId === p.id}
                  rowClass={tier.row}
                  iconClass={tier.icon}
                />
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  )
}

function TableRow({
  player,
  icon,
  played,
  crownedNow,
  rowClass,
  iconClass,
}: {
  player: SFPlayerView
  icon: string
  played: boolean
  crownedNow: boolean
  rowClass: string
  iconClass: string
}) {
  // Une couleur explicite plutôt qu'une opacité, qui se multiplierait à celle du texte.
  const tone = player.leftAt
    ? 'border-dashed border-white/30 bg-white/5 text-white/60'
    : player.isJudge
      ? 'border-amber-400/50 bg-amber-500/20 text-amber-100'
      : crownedNow
        ? 'border-gold/70 bg-gold/20 text-white'
        : played
          ? 'border-emerald-400/50 bg-emerald-500/20 text-white'
          : 'border-white/10 bg-white/5 text-white/80'
  return (
    <li className={cn('flex shrink-0 items-center border font-bold', rowClass, tone)}>
      <span className="shrink-0" aria-hidden><PlayerAvatarGlyph value={icon} /></span>
      <span className="min-w-0 flex-1 truncate">{player.name}</span>
      {player.isJudge && <Gavel aria-hidden className={cn('shrink-0 text-amber-300', iconClass)} />}
      {played && <Check aria-hidden className={cn('shrink-0 text-emerald-300', iconClass)} strokeWidth={3} />}
      {crownedNow && <span className="shrink-0 font-black tabular-nums text-gold">+1</span>}
      <span className={cn('flex min-w-[3.5rem] shrink-0 items-center justify-end gap-1 font-black tabular-nums', player.crowns > 0 ? 'text-amber-200' : 'text-white/70')}>
        <Crown aria-hidden className={cn('shrink-0', iconClass)} />
        {player.crowns}
      </span>
    </li>
  )
}

function SansFiltrePodium({
  room,
  state,
  iconOf,
  nameOf,
}: {
  room: TvRoomDto
  state: SFClientView
  iconOf: (p: SFPlayerView) => string
  nameOf: (id: string | null | undefined) => string
}) {
  const t = useTranslations('games.sans-filtre.game')
  const tTv = useTranslations('tv')
  const ranking = [...state.players].sort((a, b) => b.crowns - a.crowns)
  const count = ranking.length
  const cols = count <= 6 ? 1 : count <= 12 ? 2 : 3
  const rows = Math.ceil(count / cols)
  // Hauteur selon le nombre de LIGNES : 6 lignes de h-12 + titre + pastille de revanche tiennent dans ~39 rem.
  const row = cn(rows <= 4 ? 'h-16' : 'h-12', cols === 3 ? 'text-xl' : rows <= 4 ? 'text-3xl' : 'text-2xl')
  const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-3">
      <p className="flex min-w-0 max-w-full items-center gap-4 text-6xl font-black text-gold">
        <Trophy aria-hidden className="h-14 w-14 shrink-0" />
        <span className="truncate">
          {state.winnerId ? t('victory.winnerIs', { name: nameOf(state.winnerId) }) : t('victory.tie')}
        </span>
      </p>
      <p className="text-base font-semibold uppercase tracking-[0.25em] text-gold/90">{t('victory.finalScore')}</p>
      <ol
        className={cn('grid grid-flow-col gap-x-6 gap-y-3', cols === 1 ? 'w-[44rem]' : 'w-full')}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {ranking.map((p) => {
          const winner = p.id === state.winnerId
          // Les ex aequo partagent leur rang (et leur médaille).
          const position = ranking.findIndex((q) => q.crowns === p.crowns) + 1
          return (
            <li
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border px-4 font-bold',
                row,
                winner ? 'border-amber-400/50 bg-amber-500/20 text-amber-100' : 'border-white/10 bg-white/5 text-white'
              )}
            >
              {position <= 3 && p.crowns > 0 ? (
                <MedalDot position={position} className="h-10 w-10 shrink-0 text-xl" />
              ) : (
                <span className="w-10 shrink-0 text-center tabular-nums text-white/70">{position}</span>
              )}
              <span className="shrink-0" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="flex shrink-0 items-center gap-1.5 font-black tabular-nums text-amber-200">
                <Crown aria-hidden className="h-6 w-6" />
                {p.crowns}
              </span>
            </li>
          )
        })}
      </ol>
      {counter.total > 1 && counter.count > 0 && (
        <p className="rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-3 text-2xl font-bold text-gold">
          {tTv('rematchPending')} <span className="tabular-nums">{counter.count}/{counter.total}</span>
        </p>
      )}
    </div>
  )
}
