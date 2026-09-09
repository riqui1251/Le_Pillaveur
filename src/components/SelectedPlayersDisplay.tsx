"use client"

import { Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { Link } from '@/i18n/navigation'

interface SelectedPlayersDisplayProps {
  players: Player[]
  title?: string
  className?: string
  /**
   * Minimum exigé par le jeu appelant : sert uniquement au message de l'état
   * vide. Tous les jeux locaux qui utilisent ce composant démarrent à 2.
   */
  minPlayers?: number
}

export function SelectedPlayersDisplay({
  players,
  title,
  className = "",
  minPlayers = 2,
}: SelectedPlayersDisplayProps) {
  const t = useTranslations('players')

  if (!players || !Array.isArray(players)) {
    return (
      <Card className={`p-4 ${className}`}>
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
      </Card>
    )
  }

  if (players.length === 0) {
    // Le groupe qui arrive de la vitrine tombait ici sur un carton mort : un
    // constat en français codé en dur, sans aucun chemin vers /joueurs, juste
    // au-dessus d'un bouton grisé. On calque l'état vide des autres jeux
    // locaux (1220, Purple) : le compte manquant + le lien qui débloque.
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('selectionStatus.needMore', { min: minPlayers, current: 0 })}
          </p>
          {/* `asChild` : un <button> dans un <a> est du HTML invalide (et deux
              anneaux de focus concurrents) — le bouton EST le lien. */}
          <Button asChild variant="outline" className="w-full">
            <Link href="/joueurs">{t('selectTitle')}</Link>
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className={`p-4 ${className}`}>
      <h2 className="mb-3 font-display text-lg font-semibold">{title ?? t('selectedTitle')}</h2>
      {/* Les lignes étaient des rectangles `bg-gray-100 / dark:bg-gray-800`
          avec un compteur `text-gray-600` : un gris de maquette posé sur le
          feutre, illisible et étranger à l'identité. On reprend la grammaire
          des autres listes de convives (liseré or, avatar, pseudo coloré). */}
      <div className="space-y-2">
        {players.map((player, index) => {
          if (!player || !player.id || !player.name) {
            return null
          }

          return (
            <div
              key={player.id}
              className="flex items-center gap-2.5 rounded-lg border border-gold/15 bg-black/20 px-3 py-2"
            >
              <span className="w-4 shrink-0 text-center font-display text-sm font-bold text-gold/70">
                {index + 1}
              </span>
              <PlayerIcon player={player} size="sm" className="h-7 w-7 shrink-0 text-base" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                <PlayerName player={player} />
              </span>
              {player.stats && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('gamesPlayedCount', { count: player.stats.gamesPlayed || 0 })}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
