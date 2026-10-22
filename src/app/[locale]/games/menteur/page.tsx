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
const MenteurOnline = dynamic(
  () => import('@/components/online/MenteurOnline').then((m) => m.MenteurOnline),
  { loading: () => <OnlineGameSkeleton gameId="menteur" /> }
)

/**
 * Le Menteur — jeu EN LIGNE uniquement : chaque joueur cache ses dés sous
 * son gobelet, donc impossible en passe-et-joue sur un seul écran.
 */
export default function MenteurPage() {
  const t = useTranslations('games.menteur.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="menteur" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <MenteurOnline />
      </OnlineGameStage>
    )
  }

  return (
    <GameShowcase gameId="menteur" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${SHOWCASE_ACCENT} transition-all`}
        >
          <Globe aria-hidden className="mr-2 h-5 w-5" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="menteur" accentClassName={SHOWCASE_ACCENT} />
      )}
    </GameShowcase>
  )
}
