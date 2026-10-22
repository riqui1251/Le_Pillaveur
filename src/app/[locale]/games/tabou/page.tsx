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
// vitrine n'a pas à télécharger le lobby, le briefing et la bibliothèque
// d'animation. Pas de `ssr: false` : le squelette (en-tête indexable) reste
// dans le HTML, et tient aussi la place du morceau.
const TabouOnline = dynamic(
  () => import('@/components/online/TabouOnline').then((m) => m.TabouOnline),
  { loading: () => <OnlineGameSkeleton gameId="tabou" /> }
)

/**
 * Tabou Vocal — jeu EN LIGNE uniquement : le mot secret et les tabous
 * transitent par le serveur, l'équipe qui devine ne les voit jamais. Pas de bots au
 * lancement (botsFillable absent) : TryBotsGate n'offre donc au visiteur que
 * la connexion.
 */
export default function TabouPage() {
  const t = useTranslations('games.tabou.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="tabou" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <TabouOnline />
      </OnlineGameStage>
    )
  }

  return (
    <GameShowcase gameId="tabou" accentClassName={SHOWCASE_ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${SHOWCASE_ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="tabou" accentClassName={SHOWCASE_ACCENT} />
      )}
    </GameShowcase>
  )
}
