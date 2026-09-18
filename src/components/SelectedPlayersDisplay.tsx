"use client"

import { Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { resolveNextGamePath } from '@/lib/next-game-path'
import { enterLocalPlay } from '@/lib/local-play-client'

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
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()

  // Le jeu courant repart avec le groupe (?next=) : /joueurs le relance après
  // « Commencer » au lieu de le renvoyer au hub re-toucher la carte. Seul un
  // chemin de jeu publié passe la garde ; sinon /joueurs nu, comme avant.
  const next = resolveNextGamePath(pathname)
  const playersHref = next ? `/joueurs?next=${encodeURIComponent(next)}` : '/joueurs'
  // Visiteur (ni compte ni mode local) : un lien nu vers /joueurs, route
  // protégée, finissait sur le formulaire de compte — à rebours du « zéro
  // inscription » de la vitrine. Même porte que la bascule PlayModeToggle :
  // le cookie de mode local d'abord (POST /api/auth/local-play), la
  // navigation ensuite ; et on navigue même si la pose échoue, il retombe
  // alors sur /compte comme avant. Tant que l'auth n'a pas répondu, le lien
  // nu reste : un compte n'a pas besoin du cookie.
  const isVisitor = !authLoading && !user
  const goToPlayers = () => {
    void enterLocalPlay()
      .catch(() => undefined)
      .then(() => router.push(playersHref))
  }

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
          {isVisitor ? (
            <Button type="button" variant="outline" className="w-full" onClick={goToPlayers}>
              {t('selectTitle')}
            </Button>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link href={playersHref}>{t('selectTitle')}</Link>
            </Button>
          )}
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
