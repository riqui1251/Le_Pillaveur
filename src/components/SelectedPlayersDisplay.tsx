"use client"

import { Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
      <h2 className="text-lg font-semibold mb-3">{title ?? t('selectedTitle')}</h2>
      <div className="space-y-2">
        {players.map((player, index) => {
          if (!player || !player.id || !player.name) {
            return null
          }

          return (
            <div key={player.id} className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <span className="player-name-default font-medium">{index + 1}. {player.name}</span>
              {player.stats && (
                <span className="text-sm text-gray-600 ml-2">
                  ({t('gamesPlayedCount', { count: player.stats.gamesPlayed || 0 })})
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
