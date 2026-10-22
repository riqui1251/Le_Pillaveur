"use client"

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { OnlineGameStage } from '@/components/online/OnlineGameStage'
import { GameShowcase } from '@/components/online/GameShowcase'
import { Button } from '@/components/ui/button'
import { TryBotsGate } from '@/components/online/TryBotsGate'
import { SHOWCASE_ACCENT } from '@/components/online/showcase-accent'

// Composant en ligne chargé À LA DEMANDE : le visiteur qui ne voit que la
// vitrine « essayer avec des bots » n'a pas à télécharger le lobby, le
// briefing et la bibliothèque d'animation. Pas de `ssr: false` : le squelette
// (en-tête indexable) reste dans le HTML, et tient aussi la place du morceau.
const ToucherCouleOnline = dynamic(
  () => import('@/components/online/ToucherCouleOnline').then((m) => m.ToucherCouleOnline),
  { loading: () => <OnlineGameSkeleton gameId="toucher-coule" /> }
)

/**
 * Toucher-Coulé — jeu EN LIGNE uniquement : chaque équipe cache sa flotte,
 * donc impossible en passe-et-joue sur un seul écran. Les bots comblent les
 * places vides, un joueur seul peut donc lancer une partie.
 */
export default function ToucherCoulePage() {
  const t = useTranslations('games.toucher-coule.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="toucher-coule" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <ToucherCouleOnline />
      </OnlineGameStage>
    )
  }

  return (
    <GameShowcase gameId="toucher-coule" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${SHOWCASE_ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="toucher-coule" accentClassName={SHOWCASE_ACCENT} />
      )}
    </GameShowcase>
  )
}
