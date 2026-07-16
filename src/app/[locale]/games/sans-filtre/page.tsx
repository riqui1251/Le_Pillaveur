"use client"

import { useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { SansFiltreOnline } from '@/components/online/SansFiltreOnline'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * Sans Filtre — jeu EN LIGNE uniquement : mains secrètes, abattage anonyme et
 * couronnement transitent par le serveur, impossible en passe-et-joue.
 */
export default function SansFiltrePage() {
  const t = useTranslations('games.sans-filtre.page')
  const tCatalog = useTranslations('games.catalog.sans-filtre')
  const { user, loading, setPlayMode } = useAuth()

  if (loading) {
    return <div className="min-h-screen bg-gray-950" aria-hidden />
  }

  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-gray-950 sm:top-[3.75rem]">
        <SansFiltreOnline />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 -left-40 h-80 w-80 rounded-full bg-zinc-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-10">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-800 to-amber-600 text-4xl shadow-lg shadow-amber-500/30">
            <GameIconById id="sans-filtre" className="text-4xl" />
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">{tCatalog('title')}</h1>
          <p className="mb-6 text-sm text-white/55">{t('onlineOnly')}</p>
          {user ? (
            <Button
              onClick={() => { void setPlayMode('online') }}
              className="w-full rounded-2xl bg-gradient-to-r from-zinc-700 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-zinc-600 hover:to-amber-500"
            >
              <Globe className="mr-2 h-4 w-4" />
              {t('switchOnline')}
            </Button>
          ) : (
            <Button asChild className="w-full rounded-2xl bg-gradient-to-r from-zinc-700 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/25 hover:from-zinc-600 hover:to-amber-500">
              <Link href="/compte">Se connecter</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
