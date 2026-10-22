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
const MotsCodesOnline = dynamic(
  () => import('@/components/online/MotsCodesOnline').then((m) => m.MotsCodesOnline),
  { loading: () => <OnlineGameSkeleton gameId="mots-codes" /> }
)

/**
 * Mots Codés — jeu EN LIGNE uniquement : la solution de la grille n'est
 * envoyée qu'aux maîtres-mots, impossible en passe-et-joue.
 */
export default function MotsCodesPage() {
  const t = useTranslations('games.mots-codes.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="mots-codes" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <MotsCodesOnline />
      </OnlineGameStage>
    )
  }

  return (
    <GameShowcase gameId="mots-codes" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${SHOWCASE_ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="mots-codes" accentClassName={SHOWCASE_ACCENT} />
      )}
    </GameShowcase>
  )
}
