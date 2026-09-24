"use client"

import dynamic from "next/dynamic"
import { useTranslations } from 'next-intl'
import { usePlayers } from "@/hooks/usePlayers"
import { useSelectedPlayers } from "@/hooks/useSelectedPlayers"
import { useRouter } from "@/i18n/navigation"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { PlayerName } from "@/components/ui/PlayerName"
import { Link } from "@/i18n/navigation"
import { ArrowLeft } from "lucide-react"
import { useAuth } from '@/components/providers/AuthProvider'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { GameShowcase } from '@/components/online/GameShowcase'

// Les deux moteurs — le jeu local (un téléphone qui tourne autour de la
// table) et sa version en ligne (lobby, briefing, bibliothèque d'animation) —
// sont chargés À LA DEMANDE selon le mode : la page livrait les deux et n'en
// montrait qu'un. Pas de `ssr: false` : le serveur ne rend ni l'un ni l'autre
// (session inconnue, aucun joueur en mémoire), et le même squelette — en-tête
// du catalogue, zone qui pulse — tient la place le temps que le morceau arrive.
const Game1220Online = dynamic(
  () => import('@/components/online/Game1220Online').then((m) => m.Game1220Online),
  { loading: () => <OnlineGameSkeleton gameId="1220" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="1220" />,
})

/** Dégradé du jeu sur le bouton principal de la vitrine en attente — celui de la tuile d'en-tête. */
const ACCENT =
  'w-full rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-700 py-5 text-base font-bold text-white shadow-lg hover:from-teal-500 hover:to-indigo-600'

export default function Game1220Page() {
  const t = useTranslations('games.1220')
  const tCatalog = useTranslations('games.catalog')
  const tPlayers = useTranslations('players')
  const tCommon = useTranslations('common')
  const { user, loading } = useAuth()
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const router = useRouter()

  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Compte pas encore connu : la vitrine du jeu, bouton principal désactivé —
  // c'est le HTML rendu au build, celui que lit Googlebot (l'écran local, lui,
  // attend ses joueurs). Un compte en ligne ne voit plus l'écran local le
  // temps que la session réponde.
  if (loading) {
    return <GameShowcase gameId="1220" accentClassName={ACCENT} pending />
  }

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-[#07060b] sm:top-[3.75rem]">
        <Game1220Online />
      </div>
    )
  }

  if (selectedPlayers.length >= 2) {
    return <Game players={selectedPlayers} onGameEnd={() => router.push("/jeux")} />
  }

  return (
    <div className="min-h-screen bg-[#07060b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07060b]" />
        <div className="absolute -top-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-teal-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-md px-4 py-8 space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-teal-600 to-indigo-700 text-3xl shadow-xl">
            🎲
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">{t('title')}</h1>
            <p className="text-sm text-white/40">{tCatalog('1220.description')}</p>
          </div>
          <Link href="/jeux" className="ml-auto rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label={t('backToGames')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            {tCommon('players')} — {selectedPlayers.length}
          </p>
          {selectedPlayers.length === 0 ? (
            <p className="text-sm italic text-white/30">{tPlayers('selectionStatus.needMore', { min: 2, current: 0 })}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                  <PlayerIcon player={p} size="sm" />
                  <span className="text-sm font-medium">
                    <PlayerName player={p} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 px-5 py-4 text-center text-sm text-teal-200/80">
          {tPlayers('selectionStatus.needMore', { min: 2, current: selectedPlayers.length })}
        </div>
        <Link href="/joueurs" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {tPlayers('selectTitle')}
        </Link>
      </div>
    </div>
  )
}
