"use client"

import type { ReactNode } from 'react'
import { Check, Swords } from 'lucide-react'
import type { Player } from '@/lib/players'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import { roundKind, type DegaineMatch, type DegaineState } from '@/lib/degaine/engine'
import { matchLabel, stageRef } from '@/lib/degaine/display'
import type { DegaineText } from './use-degaine-text'

const SECTION_TITLE = 'font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold'

function lookup(players: Player[]) {
  return (id: string | null) => (id ? players.find(p => p.id === id) : undefined)
}

/** Le duel à venir, en grand : qui affronte qui, et qui prend quelle moitié de l'écran. */
export function NextDuelCard({
  state,
  match,
  players,
  text,
}: {
  state: DegaineState
  match: DegaineMatch
  players: Player[]
  text: DegaineText
}) {
  const playerOf = lookup(players)
  const a = playerOf(match.a)
  const b = playerOf(match.b)
  // « au meilleur des 3 » se lit ici : en sous-titre de l'en-tête, il finissait tronqué.
  const label = [
    ...matchLabel(state, match.id).map(ref => text(ref.key, ref.values)),
    ...(state.settings.roundsPerDuel === 3 ? [text('board.subtitle.bestOf3')] : []),
  ].join(' · ')
  const started = match.wins.a + match.wins.b > 0

  const badge = (player: Player | undefined) => (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      {player && <PlayerIcon player={player} size="lg" className="h-14 w-14 text-3xl" />}
      {player && <PlayerName player={player} className="max-w-full truncate font-display text-lg font-bold text-cream" />}
    </div>
  )

  return (
    <section className="rounded-2xl border border-gold/40 bg-felt-deep/70 p-4 text-center">
      <h2 className={SECTION_TITLE}>{text('board.nextDuel')}</h2>
      <p className="mt-1 text-sm text-cream/80">{label}</p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        {badge(a)}
        <Swords aria-hidden className="h-6 w-6 text-gold" />
        {badge(b)}
      </div>
      {started && (
        <p className="mt-3 font-display text-2xl font-bold lining-nums tabular-nums text-gold">
          {text('board.score', { a: match.wins.a, b: match.wins.b })}
        </p>
      )}
      {a && b && (
        <p className="mt-3 text-sm text-cream/70">{text('board.seats', { top: a.name, bottom: b.name })}</p>
      )}
    </section>
  )
}

/** Le tableau, tour par tour : vainqueurs en or, exempts signalés, cases encore vides. */
export function BracketView({
  state,
  players,
  text,
}: {
  state: DegaineState
  players: Player[]
  text: DegaineText
}) {
  const playerOf = lookup(players)
  const bestOf3 = state.settings.roundsPerDuel === 3

  const slot = (id: string | null, match: DegaineMatch) => {
    const player = playerOf(id)
    if (!player) {
      return <span className="min-w-0 flex-1 truncate text-sm italic text-cream/60">{text('board.tbd')}</span>
    }
    const won = match.winner === player.id
    const lost = match.winner !== null && !won
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <PlayerIcon player={player} size="sm" />
        <PlayerName
          player={player}
          className={cn(
            'min-w-0 truncate text-sm',
            won ? 'font-bold text-gold' : lost ? 'text-cream/60 line-through' : 'font-semibold text-cream'
          )}
        />
        {won && (
          <>
            <Check aria-hidden className="h-4 w-4 shrink-0 text-gold" />
            <span className="sr-only">{text('board.winner')}</span>
          </>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {state.bracket.map((round, index) => {
        const stage = stageRef(roundKind(state.bracket.length, index), index, true)
        return (
          <section key={index} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <h3 className={cn(SECTION_TITLE, 'mb-2 px-1')}>{text(stage.key, stage.values)}</h3>
            <ul className="space-y-2">
              {round.map(match => {
                const current = match.id === state.currentMatch
                return (
                  <li
                    key={match.id}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2',
                      current ? 'border-gold/60 bg-gold/[0.15]' : 'border-gold/20 bg-black/20'
                    )}
                  >
                    {match.bye ? (
                      <>
                        {slot(match.a, { ...match, winner: null })}
                        <span className="shrink-0 rounded-full border border-cream/30 px-2 py-0.5 text-xs font-semibold text-cream/80">
                          {text('board.bye')}
                        </span>
                      </>
                    ) : (
                      <>
                        {slot(match.a, match)}
                        <span className="shrink-0 text-xs text-cream/60">{text('board.versus')}</span>
                        {slot(match.b, match)}
                        {bestOf3 && match.wins.a + match.wins.b > 0 && (
                          <span className="shrink-0 font-display text-sm font-bold lining-nums tabular-nums text-gold">
                            {text('board.score', { a: match.wins.a, b: match.wins.b })}
                          </span>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Duel libre : la table touche deux joueurs ; le premier prend le haut de l'écran. */
export function FreePicker({
  players,
  picked,
  seats,
  bestOf3,
  onToggle,
  text,
}: {
  players: Player[]
  picked: string[]
  /** Moitié d'écran de chaque duelliste retenu (le duel en cours garde la sienne). */
  seats: Record<string, 'top' | 'bottom'>
  /** Rappel du réglage « au meilleur des 3 », qui finissait tronqué en sous-titre de l'en-tête. */
  bestOf3: boolean
  onToggle: (id: string) => void
  text: DegaineText
}) {
  return (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className={SECTION_TITLE}>{text('board.free.title')}</h2>
        {bestOf3 && (
          <span className="rounded-full border border-gold/40 px-2 py-0.5 text-xs font-semibold text-gold">
            {text('page.roundModes.bestOf3.label')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-cream/70">{text('board.free.hint')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {players.map(player => {
          const active = picked.includes(player.id)
          const seat = seats[player.id]
          return (
            <button
              key={player.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(player.id)}
              className={cn(
                'flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-gold/60 bg-gold/[0.15] text-cream'
                  : 'border-gold/[0.15] bg-black/20 text-cream/75 hover:border-gold/40 hover:text-cream'
              )}
            >
              <PlayerIcon player={player} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <PlayerName player={player} className="min-w-0 truncate text-sm font-bold" />
                {active && seat && (
                  <span className="text-xs text-cream/80">{text(seat === 'top' ? 'board.free.top' : 'board.free.bottom')}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Une ligne de bilan : rang, joueur et ce que la partie lui a coûté, puis le détail sous le nom et le
 * coût, sur toute la largeur : dans une colonne à lui seul, le meilleur temps finissait coupé.
 */
export function TallyRow({
  rank,
  player,
  detail,
  cost,
  highlight = false,
}: {
  rank: number
  player: Player
  detail: ReactNode
  cost: ReactNode
  highlight?: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        highlight ? 'border-gold/60 bg-gold/[0.15]' : 'border-gold/20 bg-black/20'
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-lg font-bold lining-nums tabular-nums text-gold">{rank}</span>
      <PlayerIcon player={player} size="md" className="h-10 w-10 text-xl" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <PlayerName player={player} className="min-w-0 flex-1 truncate font-display text-base font-bold text-cream" />
          <span className="shrink-0 text-right font-display text-sm font-semibold lining-nums tabular-nums text-gold">{cost}</span>
        </span>
        <span className="text-xs leading-snug text-cream/70">{detail}</span>
      </span>
    </li>
  )
}
