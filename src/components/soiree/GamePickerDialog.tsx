"use client"

import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocalizedGames } from '@/lib/games-i18n'
import { DifficultyBadge } from '@/components/game/DifficultyBadge'
import { DrinkLevelBadge } from '@/components/game/DrinkLevelBadge'
import { useGameCatalog, useGameDifficulty, useGameDrinkLevel, useSoireeGameIds } from '@/hooks/useGameCatalog'
import { cn } from '@/lib/utils'
import { soireeCounting, soireeMinPlayers, soireeMinutes } from '@/lib/soiree/catalog'
import { GameBadge, gameGradient } from './soiree-ui'

/** Choisir un jeu à ajouter (ou à mettre à la place d'une manche) parmi les jeux de la soirée. */
export function GamePickerDialog({
  open,
  title,
  playerCount,
  inProgram,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  playerCount: number
  inProgram: readonly string[]
  onPick: (gameId: string) => void
  onClose: () => void
}) {
  const t = useTranslations('soiree.picker')
  const games = useLocalizedGames()
  const { hiddenIds } = useGameCatalog()
  const soireeIds = useSoireeGameIds()
  const difficultyOf = useGameDifficulty()
  const drinkLevelOf = useGameDrinkLevel()
  const byId = new Map(games.map((g) => [g.id, g]))
  const rows = soireeIds.filter((id) => !hiddenIds.includes(id)).map((id) => ({ id, game: byId.get(id) }))
    .filter((row) => row.game)
    .sort((a, b) => drinkLevelOf(a.id) - drinkLevelOf(b.id) || a.game!.title.localeCompare(b.game!.title))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-gold/20 bg-felt-deep text-cream sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-cream">{title}</DialogTitle>
          <DialogDescription className="text-cream/70">{t('lead')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {rows.map(({ id, game }) => {
            const tooFew = playerCount < soireeMinPlayers(id)
            const counting = soireeCounting(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={tooFew}
                  onClick={() => onPick(id)}
                  className={cn(
                    'relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-[#D8CCAE] bg-cream py-2.5 pl-4 pr-3 text-left text-[#24201A] transition hover:bg-[#FBF6E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                    tooFew && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: gameGradient(id, 180) }} />
                  <GameBadge gameId={id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-bold leading-tight">{game!.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5E5444]">
                      <DrinkLevelBadge level={drinkLevelOf(id)} tone="card" />
                      <DifficultyBadge level={difficultyOf(id)} tone="card" />
                      <span>{t('minutes', { minutes: soireeMinutes(id) })}</span>
                      {counting !== 'auto' && <span className="font-semibold">{t(`counting.${counting}`)}</span>}
                      {inProgram.includes(id) && <span className="font-semibold text-suit-red">{t('inProgram')}</span>}
                      {tooFew && <span className="font-semibold">{t('minPlayers', { count: soireeMinPlayers(id) })}</span>}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
