"use client"

import { useRouter } from 'next/navigation'
import { PlayerManager } from '@/components/PlayerManager'
import { Card } from '@/components/ui/card'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'

export default function JoueursPage() {
	const router = useRouter()
	const { select } = useSelectedPlayers()

	return (
		<main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
			<div className="relative container mx-auto px-4 py-8 space-y-6">
				<div>
					<h1 className="text-3xl sm:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300">Sélection des joueurs</h1>
					<p className="text-sm text-white/70 mt-2">Ajoutez et sélectionnez les joueurs, puis lancez la sélection du jeu.</p>
				</div>

				<Card className="p-4 bg-white/5 border-white/10">
					<PlayerManager 
						onPlayersSelected={(ids) => {
							select(ids)
							router.push('/jeux')
						}}
						minPlayers={2}
						hideRemoveButtons={true}
					/>
				</Card>
			</div>
		</main>
	)
}


