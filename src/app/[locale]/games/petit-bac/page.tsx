"use client"

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'
import { TryBotsGate } from '@/components/online/TryBotsGate'

// Composant en ligne chargé À LA DEMANDE : le visiteur qui ne voit que la
// vitrine « essayer avec des bots » n'a pas à télécharger le lobby, le
// briefing et la bibliothèque d'animation. Pas de `ssr: false` : le squelette
// (en-tête indexable) reste dans le HTML, et tient aussi la place du morceau.
const PetitBacOnline = dynamic(
  () => import('@/components/online/PetitBacOnline').then((m) => m.PetitBacOnline),
  { loading: () => <OnlineGameSkeleton gameId="petit-bac" /> }
)

/**
 * Petit Bac — jeu EN LIGNE uniquement : les réponses restent secrètes
 * jusqu'au comptage, chacun tape sur son propre téléphone.
 */
export default function PetitBacPage() {
  const t = useTranslations('games.petit-bac.page')
  const tCatalog = useTranslations('games.catalog.petit-bac')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    return <OnlineGameSkeleton gameId="petit-bac" />
  }

  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-gray-950 sm:top-[3.75rem]">
        <PetitBacOnline />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-sky-700/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 -left-40 h-80 w-80 rounded-full bg-amber-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-10">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-700 to-amber-600 text-4xl shadow-lg shadow-sky-500/30">
            <GameIconById id="petit-bac" className="text-4xl" />
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">{tCatalog('title')}</h1>
          <p className="mb-6 text-sm text-white/55">{t('onlineOnly')}</p>
          {user ? (
            <Button
              onClick={() => { void setPlayMode('online') }}
              className="w-full rounded-2xl bg-gradient-to-r from-sky-700 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:from-sky-600 hover:to-amber-500"
            >
              <Globe className="mr-2 h-4 w-4" />
              {t('switchOnline')}
            </Button>
          ) : (
            <TryBotsGate
              gameId="petit-bac"
              accentClassName="w-full rounded-2xl bg-gradient-to-r from-sky-700 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-600 hover:to-amber-500"
            />
          )}
        </div>
      </div>
    </div>
  )
}
