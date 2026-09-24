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
const TelephoneDessineOnline = dynamic(
  () => import('@/components/online/TelephoneDessineOnline').then((m) => m.TelephoneDessineOnline),
  { loading: () => <OnlineGameSkeleton gameId="telephone-dessine" /> }
)

/** Dégradé du jeu sur le bouton principal — vitrine en attente, « passer en ligne » et TryBotsGate. */
const ACCENT =
  'w-full rounded-2xl bg-gradient-to-r from-teal-700 to-indigo-600 py-5 text-base font-bold text-white shadow-lg shadow-indigo-500/25 hover:from-teal-600 hover:to-indigo-500'

/**
 * Téléphone Dessiné — jeu EN LIGNE uniquement : les chaînes phrase/dessin
 * transitent par le serveur, chaque joueur ne voit que son maillon assigné.
 */
export default function TelephoneDessinePage() {
  const t = useTranslations('games.telephone-dessine.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="telephone-dessine" accentClassName={ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-gray-950 sm:top-[3.75rem]">
        <TelephoneDessineOnline />
      </div>
    )
  }

  return (
    <GameShowcase gameId="telephone-dessine" accentClassName={ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="telephone-dessine" accentClassName={ACCENT} />
      )}
    </GameShowcase>
  )
}
