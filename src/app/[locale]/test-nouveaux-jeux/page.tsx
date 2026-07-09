"use client"

import { useLocalizedGames } from '@/lib/games-i18n'
import { GameCard } from '@/components/hub/GameCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { useAuth } from '@/components/providers/AuthProvider'

const NEW_GAME_IDS = ['bluff', 'espion', 'tabou', 'crobard', 'telephone-dessine']

/** Page de QA : accès direct aux 5 nouveaux jeux soft, sans passer par le catalogue complet. */
export default function TestNouveauxJeuxPage() {
  const games = useLocalizedGames().filter((g) => NEW_GAME_IDS.includes(g.id))
  const { user } = useAuth()
  const isOnline = user?.playMode === 'online'

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Test — 5 nouveaux jeux soft</h1>
        <p className="mt-1 text-sm text-white/50">
          Bluff, Espion, Tabou, Crobard, Téléphone Dessiné — accès direct pour tester.
        </p>
        {!isOnline && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Ces jeux sont en ligne uniquement : passe en mode en ligne (Compte) avant de tester.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              icon={<GameIconById id={game.id} className="h-5 w-5" />}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
