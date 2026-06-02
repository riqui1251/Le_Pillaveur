"use client"

import { PlayerName } from '@/components/ui/PlayerName'
import { Card } from '@/components/ui/card'

export default function TestColorsPage() {
  const testPlayers = [
    { name: 'Joueur Normal', preferences: {} },
    { name: 'Sim', preferences: {} }, // Joueur spécial par défaut
    { name: 'Riqui', preferences: {} }, // Joueur spécial par défaut
    { name: 'Joueur Rouge', preferences: { specialEffect: 'red' } },
    { name: 'Joueur Bleu', preferences: { specialEffect: 'blue' } },
    { name: 'Joueur Arc-en-ciel', preferences: { specialEffect: 'rainbow' } },
    { name: 'Joueur Or', preferences: { specialEffect: 'gold' } },
    { name: 'Joueur Feu', preferences: { specialEffect: 'fire' } },
    { name: 'Joueur Néon', preferences: { specialEffect: 'neon' } },
    { name: 'Joueur Émeraude', preferences: { specialEffect: 'emerald' } },
    { name: 'Joueur Violet', preferences: { specialEffect: 'purple' } },
    { name: 'Joueur Cyber', preferences: { specialEffect: 'cyber' } },
  ]

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8">Test des couleurs des pseudos</h1>
      
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Aperçu des différents styles de noms</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testPlayers.map((player, index) => (
            <div key={index} className="p-4 border rounded bg-card">
              <div className="text-lg">
                <PlayerName player={player} /> 
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {player.preferences.specialEffect 
                  ? `Effet: ${player.preferences.specialEffect}`
                  : player.name === 'Sim' || player.name === 'Riqui'
                    ? 'Joueur spécial (effet par défaut)'
                    : 'Style par défaut'
                }
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Test avec différents arrière-plans</h2>
        <div className="space-y-4">
          <div className="p-4 bg-black rounded">
            <h3 className="text-white mb-2">Sur fond noir :</h3>
            <div className="flex flex-wrap gap-4">
              {testPlayers.slice(0, 6).map((player, index) => (
                <PlayerName key={index} player={player} />
              ))}
            </div>
          </div>
          
          <div className="p-4 bg-white rounded">
            <h3 className="text-black mb-2">Sur fond blanc :</h3>
            <div className="flex flex-wrap gap-4">
              {testPlayers.slice(0, 6).map((player, index) => (
                <PlayerName key={index} player={player} />
              ))}
            </div>
          </div>
          
          <div className="p-4 bg-gray-700 rounded">
            <h3 className="text-white mb-2">Sur fond gris :</h3>
            <div className="flex flex-wrap gap-4">
              {testPlayers.slice(0, 6).map((player, index) => (
                <PlayerName key={index} player={player} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}




