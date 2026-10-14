"use client"

import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'

export type TargetGridPlayer = { id: string; name: string; isBot: boolean }

/**
 * Grille de cibles des jeux de table (sonde / vote loup / potion / tir / vote
 * du jour au Loup-Garou, accusation à l'Imposteur) — chaque cible est une
 * mini-carte crème qu'on « abat » sur la table. Noms en encre pure (pas de
 * cosmétiques : illisibles sur crème).
 */
export function TargetGrid({
  players,
  iconOf,
  onPick,
  disabled,
  chosenId,
  excludeIds = [],
  youLabel,
  selfId,
}: {
  players: readonly TargetGridPlayer[]
  iconOf: (p: TargetGridPlayer) => string
  onPick: (id: string) => void
  disabled: boolean
  chosenId?: string | null
  excludeIds?: string[]
  youLabel: string
  selfId: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => {
        const excluded = excludeIds.includes(p.id)
        const chosen = chosenId === p.id
        return (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            disabled={disabled || excluded}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[#24201A] transition-all',
              'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
              chosen
                ? '-translate-y-0.5 border-gold bg-cream ring-2 ring-gold'
                : 'border-[#D8CCAE] bg-cream',
              !disabled && !excluded && 'hover:-translate-y-0.5 active:scale-95',
              excluded && 'opacity-35'
            )}
          >
            <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold">
              {p.name}
              {p.id === selfId && <span className="text-[#6B6455]"> {youLabel}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
