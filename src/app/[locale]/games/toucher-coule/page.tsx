"use client"

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { GameShowcase } from '@/components/online/GameShowcase'
import { Button } from '@/components/ui/button'
import { TryBotsGate } from '@/components/online/TryBotsGate'

// Composant en ligne chargé À LA DEMANDE : le visiteur qui ne voit que la
// vitrine « essayer avec des bots » n'a pas à télécharger le lobby, le
// briefing et la bibliothèque d'animation. Pas de `ssr: false` : le squelette
// (en-tête indexable) reste dans le HTML, et tient aussi la place du morceau.
const ToucherCouleOnline = dynamic(
  () => import('@/components/online/ToucherCouleOnline').then((m) => m.ToucherCouleOnline),
  { loading: () => <OnlineGameSkeleton gameId="toucher-coule" /> }
)

/** Dégradé du jeu sur le bouton principal — vitrine en attente, « passer en ligne » et TryBotsGate. */
const ACCENT =
  'w-full rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 py-5 text-base font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-500 hover:to-cyan-400'

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
    return <GameShowcase gameId="toucher-coule" accentClassName={ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-gray-950 sm:top-[3.75rem]">
        <ToucherCouleOnline />
      </div>
    )
  }

  return (
    <GameShowcase gameId="toucher-coule" accentClassName={ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="toucher-coule" accentClassName={ACCENT} />
      )}
    </GameShowcase>
  )
}
