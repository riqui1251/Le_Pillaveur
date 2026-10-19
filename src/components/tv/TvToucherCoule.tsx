"use client"

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Anchor, Beer, Bomb, Check, Crosshair, Hourglass, LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { TC_MODES, TC_REJOIN_GRACE_MS, otherTeam, type TCClientView, type TCPlayer, type TeamId } from '@/lib/toucher-coule/engine'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { cn } from '@/lib/utils'
import { TvAvatar, tvColor, tvRem } from './tv-shared'

/*
 * Toile de jeu ≈ 80 × 39 rem (TvStage). Budget fixe, en rem, pour que les deux
 * grilles restent carrées et entières avec 8 joueurs : colonne centrale
 * (tour + dernier tir) de 17 rem, deux panneaux d'équipe de 28 rem.
 */
const INNER_HEIGHT_REM = 36.5
const PANEL_WIDTH_REM = 28
const PANEL_HEADER_REM = 2.75
const PANEL_GAPS_REM = 1.5
const ROSTER_ROW_REM = 3.5
const ROSTER_GAP_REM = 0.5
const GRID_PAD_REM = 0.375
const GRID_GAP_REM = 0.125

function teamText(team: TeamId): string {
  return team === 'A' ? 'text-sky-300' : 'text-rose-300'
}

const AVATAR_PX = 40

function formatMmSs(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Icône publique du joueur (portrait de bot, icône du compte) comme sur le téléphone ; initiale sinon. */
function RosterAvatar({ icon, name, index, active }: { icon: string | null; name: string; index: number; active: boolean }) {
  if (!icon) return <TvAvatar name={name} index={index} size={AVATAR_PX} active={active} />
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-felt-deep leading-none',
        active && 'ring-4 ring-white/80',
      )}
      style={{
        width: tvRem(AVATAR_PX),
        height: tvRem(AVATAR_PX),
        border: `${tvRem(3)} solid ${tvColor(index)}`,
        fontSize: tvRem(AVATAR_PX * 0.58),
      }}
    >
      <PlayerAvatarGlyph value={icon} />
    </span>
  )
}

function rosterLayout(perTeam: number) {
  const cols = perTeam > 1 ? 2 : 1
  const rows = Math.ceil(perTeam / cols)
  const height = rows * ROSTER_ROW_REM + (rows - 1) * ROSTER_GAP_REM
  return { cols, height }
}

/** Grille d'une équipe en vue spectateur neutre : tirs reçus + navires coulés, jamais un navire intact. */
function TeamGrid({
  team,
  view,
  sideRem,
  lastCells,
  dimmed,
}: {
  team: TeamId
  view: TCClientView
  sideRem: number
  lastCells: Set<number>
  dimmed: boolean
}) {
  const n = view.gridSize
  const shots = view.shotsAt?.[team] ?? {}
  const sunkCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team === team && ship.sunk) ship.cells.forEach((c) => sunkCells.add(c))
  }
  const cellRem = (sideRem - 2 * GRID_PAD_REM - (n - 1) * GRID_GAP_REM) / n
  return (
    <div
      className={cn('rounded-2xl border border-white/10 bg-felt-deep/60', dimmed && 'opacity-60')}
      style={{ width: `${sideRem}rem`, height: `${sideRem}rem`, padding: `${GRID_PAD_REM}rem` }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gap: `${GRID_GAP_REM}rem`,
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: n * n }).map((_, i) => {
          const shot = shots[i]
          const sunk = sunkCells.has(i)
          const last = lastCells.has(i)
          return (
            <div
              key={i}
              className={cn(
                'relative flex items-center justify-center rounded leading-none',
                sunk ? 'bg-red-800' : shot === 'hit' ? 'bg-red-500/90' : shot === 'miss' ? 'bg-sky-900/70' : 'bg-white/[0.07]',
                last && 'z-10 ring-[0.2rem] ring-gold',
              )}
              style={{ fontSize: `${cellRem * 0.62}rem` }}
            >
              {sunk ? (
                <span aria-hidden>💀</span>
              ) : shot === 'hit' ? (
                <span aria-hidden>💥</span>
              ) : shot === 'miss' ? (
                <span
                  aria-hidden
                  className="rounded-full bg-sky-200/70"
                  style={{ width: `${cellRem * 0.3}rem`, height: `${cellRem * 0.3}rem` }}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RosterRow({
  player,
  icon,
  index,
  active,
  placement,
  soft,
}: {
  player: TCPlayer
  icon: string | null
  index: number
  active: boolean
  placement: boolean
  soft: boolean
}) {
  const t = useTranslations('tv')
  const tg = useTranslations('games.toucher-coule.game')
  const gone = !player.isBot && Boolean(player.leftAt)
  return (
    <li
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-xl px-2.5',
        active ? 'bg-emerald-500/20 ring-[0.15rem] ring-emerald-300/70' : 'bg-white/5',
      )}
      style={{ height: `${ROSTER_ROW_REM}rem` }}
    >
      <RosterAvatar icon={icon} name={player.name} index={index} active={active} />
      <div className="min-w-0 flex-1">
        <p className={cn('flex min-w-0 items-center gap-1.5 text-xl font-bold leading-tight', gone ? 'text-white/70' : 'text-white')}>
          {gone && <LogOut aria-hidden className="h-6 w-6 shrink-0 text-amber-300" />}
          <span className="truncate">{player.name}</span>
        </p>
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-lg leading-tight text-white/80">
          {placement ? (
            player.placed ? (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <Check aria-hidden className="h-6 w-6" />
                {t('ready')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-white/70">
                <Hourglass aria-hidden className="h-6 w-6" />
                {t('notReady')}
              </span>
            )
          ) : (
            <>
              {!soft && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Beer aria-hidden className="h-6 w-6 text-gold" />
                  {player.drinks}
                  <span className="sr-only">{t('drinks')}</span>
                </span>
              )}
              {gone && (
                <span className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-200">
                  <Hourglass aria-hidden className="h-6 w-6" />
                  <PhaseCountdown endsAt={(player.leftAt ?? 0) + TC_REJOIN_GRACE_MS}>
                    {({ seconds }) => formatMmSs(seconds)}
                  </PhaseCountdown>
                </span>
              )}
              {player.hasBomb && (
                <span className="inline-flex items-center gap-1 text-rose-300">
                  <Bomb aria-hidden className="h-6 w-6" />
                  {gone ? <span className="sr-only">{tg('bombButton')}</span> : tg('bombButton')}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** Rendu TV du Toucher-Coulé : les 2 grilles en vue spectateur neutre, équipes + gorgées, tour et dernier tir. */
export function TvToucherCoule({ room, state }: { room: TvRoomDto; state: TCClientView }) {
  const t = useTranslations('tv')
  const tg = useTranslations('games.toucher-coule.game')
  const reduced = useReducedMotion()
  const { mode: ambiance } = useAmbianceMode()
  const soft = ambiance === 'soft'

  const config = TC_MODES[state.mode] ?? TC_MODES['1v1']
  const placement = state.phase === 'placement'
  const activeId = placement
    ? null
    : (state.turnOrder[state.currentTurnIndex] ?? room.currentTurnUserId ?? null)
  const active = state.players.find((p) => p.id === activeId) ?? null
  const targetTeam = active ? otherTeam(active.team) : null
  const nameOf = (id: string | null) => state.players.find((p) => p.id === id)?.name ?? '—'
  const totalShips = config.playersPerTeam * config.shipSizesPerPlayer.length
  // Compté depuis les navires coulés : en placement, les navires pas encore posés ne sont pas « perdus ».
  const shipsLeft = (team: TeamId) => totalShips - state.ships.filter((s) => s.team === team && s.sunk).length
  const iconOf = (p: TCPlayer) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? null
  const teamLabel = (team: TeamId) => (team === 'A' ? t('teamA') : t('teamB'))

  const roster = rosterLayout(config.playersPerTeam)
  const gridSide = Math.min(
    PANEL_WIDTH_REM,
    INNER_HEIGHT_REM - PANEL_HEADER_REM - PANEL_GAPS_REM - roster.height,
  )

  const lastShot = placement ? null : state.lastShot
  const lastCells = new Set<number>(
    lastShot ? (lastShot.bombResults ? lastShot.bombResults.map((r) => r.cell) : [lastShot.cell]) : [],
  )
  const feedMessage = lastShot
    ? lastShot.bombResults
      ? tg('feedBomb', {
          hits: lastShot.bombResults.filter((r) => r.result !== 'miss').length,
          total: lastShot.bombResults.length,
        })
      : lastShot.result === 'miss'
        ? tg(soft ? 'feedMissSoft' : 'feedMiss', { shooter: nameOf(lastShot.shooterId) })
        : lastShot.result === 'hit'
          ? tg(soft ? 'feedHitSoft' : 'feedHit', { owner: nameOf(lastShot.shipOwnerId) })
          : tg(soft ? 'feedSunkSoft' : 'feedSunk', { owner: nameOf(lastShot.shipOwnerId) })
    : null
  const feedTone = !lastShot
    ? ''
    : lastShot.bombResults
      ? 'border-rose-400/40 bg-rose-500/20 text-rose-100'
      : lastShot.result === 'miss'
        ? 'border-sky-400/30 bg-sky-500/10 text-sky-100'
        : lastShot.result === 'hit'
          ? 'border-amber-400/40 bg-amber-500/20 text-amber-100'
          : 'border-red-400/40 bg-red-500/20 text-red-100'

  const leftPlayers = state.players
    .filter((p) => !p.isBot && p.leftAt)
    .sort((a, b) => (a.leftAt ?? 0) - (b.leftAt ?? 0))
  const firstLeft = leftPlayers[0] ?? null

  const panel = (team: TeamId) => {
    const isTarget = targetTeam === team
    return (
      <section className="flex shrink-0 flex-col gap-3" style={{ width: `${PANEL_WIDTH_REM}rem` }}>
        <div className="flex items-center justify-between gap-3" style={{ height: `${PANEL_HEADER_REM}rem` }}>
          <p className={cn('flex min-w-0 items-center gap-2 text-2xl font-black', teamText(team))}>
            {isTarget && <Crosshair aria-hidden className="h-7 w-7 shrink-0 text-emerald-300" />}
            <span className="truncate">{teamLabel(team)}</span>
          </p>
          <p className="flex shrink-0 items-center gap-2 text-white/80">
            <Anchor aria-hidden className="h-6 w-6 text-gold" />
            <span className="text-lg font-semibold">{t('shipsLeft')}</span>
            <span className="text-3xl font-black tabular-nums text-white">
              {shipsLeft(team)}/{totalShips}
            </span>
          </p>
        </div>
        <div
          className={cn(
            'self-center rounded-[1.25rem] transition-colors',
            isTarget ? 'ring-[0.2rem] ring-emerald-400/80' : 'ring-0',
          )}
        >
          <TeamGrid team={team} view={state} sideRem={gridSide} lastCells={lastShot?.targetTeam === team ? lastCells : new Set()} dimmed={placement} />
        </div>
        <ul
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${roster.cols}, minmax(0, 1fr))` }}
        >
          {state.players.map((p, index) =>
            p.team === team ? (
              <RosterRow
                key={p.id}
                player={p}
                icon={iconOf(p)}
                index={index}
                active={p.id === activeId}
                placement={placement}
                soft={soft}
              />
            ) : null,
          )}
        </ul>
      </section>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-6 px-8 py-3">
      {panel('A')}

      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 self-stretch text-center">
        <span className="rounded-full border border-sky-400/40 bg-sky-500/20 px-4 py-1 text-lg font-bold text-sky-100">
          {state.mode} · {state.gridSize}×{state.gridSize}
        </span>

        {placement ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-4xl font-black leading-tight">{tg('placementTitle')}</p>
            <p className="text-2xl font-semibold text-white/80">
              {tg('placedCount', {
                placed: state.players.filter((p) => p.placed).length,
                total: state.players.length,
              })}
            </p>
          </div>
        ) : active ? (
          <div className="flex w-full min-w-0 flex-col items-center gap-2">
            <p className="text-base font-semibold uppercase tracking-[0.25em] text-gold/90">{t('turnOf')}</p>
            <p className={cn('line-clamp-2 w-full break-words text-4xl font-black leading-tight', teamText(active.team))}>
              {active.name}
            </p>
            <p className="text-xl font-bold text-white/80">{teamLabel(active.team)}</p>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {feedMessage && (
            <motion.p
              key={state.version}
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={cn('w-full rounded-2xl border px-4 py-3 text-2xl font-bold leading-snug', feedTone)}
            >
              {feedMessage}
            </motion.p>
          )}
        </AnimatePresence>

        {!placement && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-lg text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-5 w-5 shrink-0 rounded bg-red-500/90" /> {tg('legendHit')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-5 w-5 shrink-0 rounded bg-sky-900" /> {tg('legendMiss')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-5 w-5 shrink-0 rounded bg-red-800" /> {tg('legendSunk')}
            </span>
          </div>
        )}

        {/* Un seul message borné à 3 lignes (la colonne n'a pas de marge) : chaque départ garde son compte à rebours dans la liste de son équipe. */}
        {firstLeft && (
          <div className="flex w-full min-w-0 items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-left">
            <LogOut aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
            <p className="line-clamp-3 min-w-0 flex-1 text-lg font-semibold leading-snug text-amber-100">
              {leftPlayers.length > 1 && (
                <span className="mr-2 rounded-full bg-amber-400/30 px-2 font-black tabular-nums text-amber-50">
                  +{leftPlayers.length - 1}
                </span>
              )}
              <PhaseCountdown endsAt={(firstLeft.leftAt ?? 0) + TC_REJOIN_GRACE_MS}>
                {({ seconds }) => tg('waitingReturn', { name: firstLeft.name, seconds })}
              </PhaseCountdown>
            </p>
          </div>
        )}
      </section>

      {panel('B')}
    </div>
  )
}
