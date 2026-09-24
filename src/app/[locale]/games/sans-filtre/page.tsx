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
const SansFiltreOnline = dynamic(
  () => import('@/components/online/SansFiltreOnline').then((m) => m.SansFiltreOnline),
  { loading: () => <OnlineGameSkeleton gameId="sans-filtre" /> }
)

/** Dégradé du jeu sur le bouton principal — vitrine en attente, « passer en ligne » et TryBotsGate. */
const ACCENT =
  'w-full rounded-2xl bg-gradient-to-r from-zinc-700 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/25 hover:from-zinc-600 hover:to-amber-500'

/**
 * Sans Filtre — jeu EN LIGNE uniquement : mains secrètes, abattage anonyme et
 * couronnement transitent par le serveur, impossible en passe-et-joue.
 */
export default function SansFiltrePage() {
  const t = useTranslations('games.sans-filtre.page')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    // Même vitrine que hors salle, bouton principal désactivé : le HTML rendu
    // au build — celui que lit Googlebot — est déjà ce que le visiteur verra.
    return <GameShowcase gameId="sans-filtre" accentClassName={ACCENT} note={t('onlineOnly')} pending />
  }

  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-gray-950 sm:top-[3.75rem]">
        <SansFiltreOnline />
      </div>
    )
  }

  return (
    <GameShowcase gameId="sans-filtre" accentClassName={ACCENT} note={t('onlineOnly')}>
      {user ? (
        <Button
          onClick={() => { void setPlayMode('online') }}
          className={`${ACCENT} transition-all`}
        >
          <Globe className="mr-2 h-4 w-4" />
          {t('switchOnline')}
        </Button>
      ) : (
        <TryBotsGate gameId="sans-filtre" accentClassName={ACCENT} />
      )}
    </GameShowcase>
  )
}
