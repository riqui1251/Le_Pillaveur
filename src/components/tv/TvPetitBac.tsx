"use client"

import type { ReactNode } from 'react'
import { AlertTriangle, Check, RotateCcw, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  pbcContestThreshold,
  PBC_WRITE_MS,
  type PbcClientView,
  type PbcRevealCell,
  type PbcState,
} from '@/lib/petit-bac/engine'
import { useDeadline } from '@/hooks/useDeadline'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

type Player = PbcClientView['players'][number]

/**
 * PETIT BAC sur grand écran : la lettre en géant et la progression des copies
 * pendant l'écriture (jamais les réponses : la vue spectateur ne les porte
 * qu'au reveal), puis la grille de comptage joueur × catégorie et le classement.
 */
export function TvPetitBac({ room, state }: { room: TvRoomDto; state: PbcClientView }) {
  const t = useTranslations('games.petit-bac.game')
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const stopUnlocked = useDeadline(state.stopAt)
  // Même bandeau que les téléphones, limité à la fenêtre de retour probable.
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const returnWindowClosed = useDeadline(leftPlayer?.leftAt ? leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS : null)
  const leftBanner =
    leftPlayer && state.phase !== 'finished' && !returnWindowClosed ? (
      <p className="shrink-0 truncate rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-1.5 text-center text-xl font-semibold text-amber-100">
        {t('leftTable', { name: leftPlayer.name })}
      </p>
    ) : null

  if (state.phase === 'finished') return <Finished state={state} iconOf={iconOf} />

  if (state.phase === 'countdown') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-10 py-6 text-center">
        <p className="text-2xl font-bold text-white/80">{t('round', { n: state.round + 1, total: state.totalRounds })}</p>
        <p className="text-4xl font-black uppercase tracking-widest text-sky-300">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-sky-200" />}
        </PhaseCountdown>
        <p className="text-3xl font-semibold text-white/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  if (state.phase === 'reveal' && state.revealGrid) {
    return <Reveal state={state} iconOf={iconOf} banner={leftBanner} />
  }

  const active = state.players.filter((p) => !p.leftAt)
  const submittedCount = active.filter((p) => p.hasSubmitted).length
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—'
  // Au-delà de 12, la bande passe sur 3 rangées : la lettre rétrécit pour lui laisser la hauteur.
  const many = active.length > 12

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-5">
      <div className="flex shrink-0 items-center gap-6">
        <p className="shrink-0 text-2xl font-bold text-white/80">
          {t('round', { n: state.round + 1, total: state.totalRounds })}
        </p>
        {state.phase === 'write' && state.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs }) => <TvTimeBar timeLeftMs={leftMs} totalMs={PBC_WRITE_MS} dangerMs={15_000} />}
          </PhaseCountdown>
        )}
      </div>
      {leftBanner}

      <div className={cn('flex min-h-0 flex-1 items-center justify-center', many ? 'gap-10' : 'gap-12')}>
        <span
          className={cn(
            'flex shrink-0 items-center justify-center border-4 border-gold/50 bg-gold/10 font-display font-black leading-none text-gold shadow-[0_1.5rem_3rem_-1.5rem_rgba(0,0,0,0.8)]',
            many ? 'h-[17rem] w-[17rem] rounded-[2.5rem] text-[12rem]' : 'h-[21rem] w-[21rem] rounded-[3rem] text-[15rem]'
          )}
        >
          {state.letter}
        </span>
        <div className="flex min-w-0 max-w-[56rem] flex-1 flex-col gap-2">
          {state.categories.map((cat) => (
            <span
              key={cat}
              className="truncate rounded-2xl border-2 border-[#D8CCAE] bg-cream px-6 py-1 text-3xl font-black text-[#24201A] shadow-[0_0.75rem_1.5rem_-0.75rem_rgba(0,0,0,0.8)]"
            >
              {t(`categories.${cat}`)}
            </span>
          ))}
          <div className="mt-1 flex min-w-0 items-center gap-4 text-3xl font-black leading-tight">
            {state.phase === 'flush' ? (
              <>
                <span className="line-clamp-2 min-w-0 flex-1 text-amber-200">
                  {state.stopperId ? t('stopBy', { name: nameOf(state.stopperId) }) : t('flushHint')}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-2xl text-emerald-200">
                  <Check className="h-7 w-7" aria-hidden />
                  <span className="tabular-nums">{submittedCount}/{active.length}</span>
                </span>
              </>
            ) : state.stopAt !== null && !stopUnlocked ? (
              <span className="min-w-0 text-white/80">
                <PhaseCountdown endsAt={state.stopAt}>{({ seconds }) => t('stopLocked', { seconds })}</PhaseCountdown>
              </span>
            ) : (
              <span className="line-clamp-2 min-w-0 flex-1 text-gold">{t('countdown.hint')}</span>
            )}
          </div>
        </div>
      </div>

      <PlayerStrip players={active} iconOf={iconOf} showSubmitted={state.phase === 'flush'} />
    </div>
  )
}

function PlayerStrip({
  players,
  iconOf,
  showSubmitted,
}: {
  players: Player[]
  iconOf: (p: Player) => string
  showSubmitted: boolean
}) {
  const rows = players.length > 12 ? 3 : players.length > 8 ? 2 : 0
  const chip = (p: Player, className?: string) => {
    const done = showSubmitted && p.hasSubmitted
    return (
      <span
        key={p.id}
        className={cn(
          'flex min-w-0 items-center rounded-full border py-1 text-xl font-bold',
          rows === 3 ? 'gap-1.5 px-2.5' : 'gap-2 px-3',
          className,
          done ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100' : 'border-white/20 bg-white/5 text-white/80'
        )}
      >
        {/* La coche prend la place de l'avatar : le nom garde toute la largeur de la puce. */}
        {done ? (
          <Check className="h-6 w-6 shrink-0" aria-hidden />
        ) : (
          <span aria-hidden className="shrink-0">
            <PlayerAvatarGlyph value={iconOf(p)} />
          </span>
        )}
        <span className="min-w-0 truncate">{p.name}</span>
      </span>
    )
  }
  if (rows > 0) {
    return (
      <div
        className="grid shrink-0 gap-x-3 gap-y-2"
        style={{ gridTemplateColumns: `repeat(${Math.ceil(players.length / rows)}, minmax(0, 1fr))` }}
      >
        {players.map((p) => chip(p))}
      </div>
    )
  }
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-3">
      {players.map((p) => chip(p, 'max-w-[18rem]'))}
    </div>
  )
}

const ANSWER_SIZES = [
  { cls: '', rem: 1.5 },
  { cls: 'text-xl', rem: 1.25 },
  { cls: 'text-lg', rem: 1.125 },
  { cls: 'text-base', rem: 1 },
] as const

/**
 * Taille d'une réponse de la grille non compacte (text-2xl par défaut) : le
 * mot le plus long doit tenir sur une ligne de sa colonne, sinon il se coupait
 * en plein milieu (« Madagas / car ») — les télés n'ont pas de césure.
 * Largeur estimée d'une colonne : toile de 77 rem moins noms (15) et scores (8),
 * moins la marge interne, les points de la case et, s'il y en a, le compteur de
 * contestation ou l'icône de rejet posés à côté de la réponse.
 */
export function answerSizeClass(
  answer: string,
  categoryCount: number,
  marks: { contested?: boolean; rejected?: boolean } = {}
): string {
  const longest = Math.max(0, ...answer.split(/\s+/).map((w) => w.length))
  const n = Math.max(1, categoryCount)
  const badgesRem = 1.5 + (marks.contested ? 3.5 : 0) + (marks.rejected ? 2 : 0)
  const columnRem = (77 - 23 - 0.5 * (n + 1)) / n - 1.6 - badgesRem
  const fit = ANSWER_SIZES.find((s) => longest * 0.62 * s.rem <= columnRem)
  return (fit ?? ANSWER_SIZES[ANSWER_SIZES.length - 1]).cls
}

function Reveal({
  state,
  iconOf,
  banner,
}: {
  state: PbcClientView
  iconOf: (p: Player) => string
  banner: ReactNode
}) {
  const t = useTranslations('games.petit-bac.game')
  const grid = state.revealGrid ?? []
  const rowIds = grid[0]?.map((c) => c.playerId) ?? []
  const rows = rowIds
    .map((id, r) => ({ player: state.players.find((p) => p.id === id), cells: grid.map((col) => col[r]) }))
    .filter((row): row is { player: Player; cells: PbcRevealCell[] } => Boolean(row.player))
  // La grille du moteur ne garde que les joueurs actifs : un parti garde sa ligne
  // de score en bas, comme dans les totaux des téléphones.
  const absent = state.players.filter((p) => !rowIds.includes(p.id))
  // Le seuil de la vue spectateur compte TOUS les joueurs (personne n'est
  // exclu du vote) : celui d'une case exclut son propriétaire, comme sur les téléphones.
  const thresholdFor = (targetId: string) =>
    pbcContestThreshold({ players: state.players } as unknown as PbcState, targetId)
  const tooFewToContest = rowIds.length > 0 && rowIds.every((id) => thresholdFor(id) === null)
  const totalOf = (p: Player) => p.total + (state.roundTotals?.[p.id] ?? 0)
  const best = Math.max(0, ...state.players.map(totalOf))
  const rowCount = rows.length + absent.length
  const compact = rowCount > 8

  const nameCell = (player: Player, dim: boolean) => (
    <div key={`${player.id}-name`} className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span aria-hidden className="shrink-0">
        <PlayerAvatarGlyph value={iconOf(player)} />
      </span>
      <span className={cn('min-w-0 truncate font-bold leading-tight', dim ? 'text-white/70' : 'text-white')}>
        {player.name}
      </span>
    </div>
  )
  const scoreCell = (player: Player) => {
    const total = totalOf(player)
    return (
      <div key={`${player.id}-score`} className="flex min-w-0 items-baseline justify-end gap-2 self-center">
        <span className="font-display text-lg font-black leading-tight tabular-nums text-emerald-300">
          +{state.roundTotals?.[player.id] ?? 0}
        </span>
        <span
          className={cn(
            'font-display font-black leading-none tabular-nums',
            compact ? 'text-2xl' : 'text-3xl',
            total === best && best > 0 ? 'text-gold' : 'text-cream'
          )}
        >
          {total}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
      {banner}
      <div
        className={cn('grid min-h-0 flex-1 gap-x-2 gap-y-1', compact ? 'text-xl' : 'text-2xl')}
        style={{
          gridTemplateColumns: `minmax(0, ${compact ? 11 : 15}rem) repeat(${state.categories.length}, minmax(0, 1fr)) ${compact ? 6.5 : 8}rem`,
          gridTemplateRows: `auto repeat(${rowCount}, minmax(0, 4.5rem))`,
          alignContent: 'center',
        }}
      >
        <div className="flex min-w-0 items-center gap-3 pb-1">
          <span className="shrink-0 rounded-xl border-2 border-gold/50 bg-gold/10 px-3 font-display text-4xl font-black leading-tight text-gold">
            {state.letter}
          </span>
          <span className="min-w-0 truncate text-xl font-bold text-white/80">
            {t('round', { n: state.round + 1, total: state.totalRounds })}
          </span>
        </div>
        {state.categories.map((cat) => (
          <p
            key={cat}
            className="line-clamp-2 self-end pb-1 text-center text-lg font-black uppercase leading-tight tracking-wide text-sky-300"
          >
            {t(`categories.${cat}`)}
          </p>
        ))}
        <span aria-hidden />

        {rows.map(({ player, cells }) => {
          const threshold = thresholdFor(player.id)
          return [
            nameCell(player, false),
            ...cells.map((cell, c) => {
              const contested = cell.contestCount > 0 && !cell.rejected
              return (
                <div
                  key={`${player.id}-${c}`}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border bg-cream px-2.5',
                    // L'anneau désigne la case disputée sans prendre de largeur à la réponse.
                    contested ? 'border-amber-500 ring-2 ring-amber-400' : 'border-[#D8CCAE]'
                  )}
                >
                  <span
                    className={cn(
                      // Peu de lignes : la place en hauteur permet deux lignes plutôt qu'une réponse coupée.
                      'min-w-0 flex-1 font-bold leading-tight',
                      compact
                        ? 'truncate'
                        : cn('line-clamp-2 [overflow-wrap:anywhere]', answerSizeClass(cell.answer.trim(), state.categories.length, { contested, rejected: cell.rejected })),
                      cell.rejected ? 'text-[#8A7A55] line-through' : 'text-[#24201A]',
                      !cell.answer.trim() && 'font-semibold text-[#8A7A55]'
                    )}
                  >
                    {cell.answer.trim() || t('empty')}
                  </span>
                  {cell.rejected ? (
                    <AlertTriangle className="h-6 w-6 shrink-0 text-suit-red" aria-hidden />
                  ) : (
                    contested && (
                      <span className="flex shrink-0 items-center gap-0.5 text-lg font-black leading-none text-amber-700">
                        {!compact && <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />}
                        <span className="tabular-nums">
                          {threshold !== null ? `${cell.contestCount}/${threshold}` : cell.contestCount}
                        </span>
                      </span>
                    )
                  )}
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-1.5 font-display font-black leading-tight tabular-nums',
                      cell.points === 2 && 'bg-gold/20 text-[#8A6A1B]',
                      cell.points === 1 && 'bg-sky-600/[0.15] text-sky-800',
                      cell.points === 0 && 'text-[#8A7A55]'
                    )}
                  >
                    {cell.points}
                  </span>
                </div>
              )
            }),
            scoreCell(player),
          ]
        })}

        {absent.map((player) => [
          nameCell(player, true),
          <div
            key={`${player.id}-absent`}
            className="flex min-w-0 items-center justify-center rounded-xl border-2 border-dashed border-white/20 font-bold text-white/70"
            style={{ gridColumn: `span ${state.categories.length}` }}
          >
            —
          </div>,
          scoreCell(player),
        ])}
      </div>
      {tooFewToContest && (
        <p className="shrink-0 text-center text-xl font-semibold text-white/80">{t('contestTooFewPlayers')}</p>
      )}
    </div>
  )
}

function Finished({ state, iconOf }: { state: PbcClientView; iconOf: (p: Player) => string }) {
  const t = useTranslations('games.petit-bac.game')
  const tTv = useTranslations('tv')
  const podium = [...state.players].sort((a, b) => b.total - a.total)
  const best = podium[0]?.total ?? 0
  const cols = podium.length <= 6 ? 1 : podium.length <= 12 ? 2 : 3
  const perCol = Math.ceil(podium.length / cols)
  // Le DTO de la TV ne dit pas qui est encore à la table (pas de `present`) : un
  // total « x/y » différerait de celui des téléphones. La TV montre QUI veut rejouer.
  const votes = new Set(state.rematchVotes ?? [])
  const voterCount = state.players.filter((p) => votes.has(p.id)).length

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-10 py-6">
      <div className="flex shrink-0 items-center gap-6">
        <Trophy className="h-20 w-20 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-6xl font-black text-gold">{t('finished.title')}</p>
          <p className="text-2xl text-white/80">{t('finished.subtitle')}</p>
        </div>
      </div>
      <ol
        className={cn('grid w-full gap-x-6 gap-y-2.5', cols === 1 && 'max-w-[44rem]')}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${perCol}, auto)`,
          gridAutoFlow: 'column',
        }}
      >
        {podium.map((p, i) => {
          const winner = p.total === best && best > 0
          return (
            <li
              key={p.id}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border-2 px-4 py-2 text-2xl font-bold',
                winner ? 'border-gold/60 bg-gold/[0.15] text-gold' : 'border-white/20 bg-white/5 text-white'
              )}
            >
              <span className="w-8 shrink-0 text-center font-display font-black text-white/70">{i + 1}</span>
              <span aria-hidden className="shrink-0">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {votes.has(p.id) && <RotateCcw className="h-6 w-6 shrink-0 text-emerald-300" aria-hidden />}
              <span className={cn('shrink-0 font-display text-3xl font-black tabular-nums', winner ? 'text-gold' : 'text-cream')}>
                {p.total}
              </span>
            </li>
          )
        })}
      </ol>
      {voterCount > 0 && (
        <p className="flex shrink-0 items-center gap-3 text-2xl font-bold text-white/80">
          <RotateCcw className="h-7 w-7 shrink-0 text-emerald-300" aria-hidden />
          <span>{tTv('rematchPending')}</span>
          <span className="font-display font-black tabular-nums text-emerald-200">{voterCount}</span>
        </p>
      )}
    </div>
  )
}
