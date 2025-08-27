"use client"

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Player } from '@/types/game'
import { Home, Play, RotateCcw, Settings, ArrowLeft } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

interface GameProps {
  players: Player[]
  onGameEnd: () => void
  difficulty: 'facile' | 'normal' | 'difficile' | 'extreme'
}

interface Pawn {
  id: string
  playerId: string
  x: number
  y: number
  color: string
}

interface Zone {
  x: number
  y: number
  radius: number
  active: boolean
}

// Configuration selon la difficulté
const difficultyConfig = {
  facile: {
    zoneCount: 5,
    zoneRadius: 120,
    sipsPerZone: 2,
    zoneDuration: 1000,
    spawnDelay: 500
  },
  normal: {
    zoneCount: 5,
    zoneRadius: 120,
    sipsPerZone: 2,
    zoneDuration: 1000,
    spawnDelay: 500
  },
  difficile: {
    zoneCount: 5,
    zoneRadius: 120,
    sipsPerZone: 2,
    zoneDuration: 1000,
    spawnDelay: 500
  },
  extreme: {
    zoneCount: 5,
    zoneRadius: 120,
    sipsPerZone: 2,
    zoneDuration: 1000,
    spawnDelay: 500
  }
}

const playerColors = [
  '#ef4444', // rouge
  '#3b82f6', // bleu
  '#10b981', // vert
  '#f59e0b', // orange
  '#8b5cf6', // violet
  '#ec4899', // rose
  '#06b6d4', // cyan
  '#84cc16'  // lime
]

export default function Game({ players, onGameEnd, difficulty }: GameProps) {
  const [gameState, setGameState] = useState<'placing' | 'config' | 'playing' | 'finished'>('placing')
  const [pawns, setPawns] = useState<Pawn[]>([])
  const [currentZone, setCurrentZone] = useState<Zone | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [playersInZone, setPlayersInZone] = useState<string[]>([])
  const [totalSips, setTotalSips] = useState<Record<string, number>>({})
  
  // Configuration personnalisée
  const [customConfig, setCustomConfig] = useState({
    zoneCount: difficultyConfig[difficulty].zoneCount,
    zoneRadius: difficultyConfig[difficulty].zoneRadius,
    sipsPerZone: difficultyConfig[difficulty].sipsPerZone,
    zoneDuration: difficultyConfig[difficulty].zoneDuration,
    spawnDelay: difficultyConfig[difficulty].spawnDelay
  })
  
  // État pour l'aperçu en temps réel
  const [previewZone, setPreviewZone] = useState<Zone | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  
  const boardRef = useRef<HTMLDivElement>(null)
  const config = customConfig

  // Initialiser les pions
  useEffect(() => {
    const initialPawns: Pawn[] = players.map((player, index) => ({
      id: `pawn-${player.id}`,
      playerId: player.id,
      x: 50, // Centre par défaut
      y: 50,
      color: playerColors[index % playerColors.length]
    }))
    setPawns(initialPawns)
    console.log('Pions initialisés:', initialPawns)
    
         // Initialiser les gorgées totales
     const initialTotalSips: Record<string, number> = {}
     players.forEach(player => {
       initialTotalSips[player.id] = 0
     })
     setTotalSips(initialTotalSips)
  }, [players])

  // Surveiller la fin de partie (supprimé car maintenant géré dans spawnZone)

         // Fonction pour placer un pion
    const handleBoardClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (gameState !== 'placing') return

      const board = boardRef.current
      if (!board) return

      const rect = board.getBoundingClientRect()
      const boardSize = rect.width // Le plateau est carré
      
      const clickX = event.clientX - rect.left
      const clickY = event.clientY - rect.top
      
      // Calculer la position en pourcentage directement depuis le coin supérieur gauche
      const relativeX = (clickX / boardSize) * 100
      const relativeY = (clickY / boardSize) * 100
      
      // Vérifier que le clic est dans le cercle (centre à 50%, 50%)
      const distanceFromCenter = Math.sqrt(
        Math.pow(relativeX - 50, 2) + Math.pow(relativeY - 50, 2)
      )
      
      console.log('Clic détecté:', { 
        clickX, 
        clickY, 
        relativeX, 
        relativeY, 
        distanceFromCenter, 
        gameState 
      })
      
      if (distanceFromCenter <= 45) { // 45% du rayon pour laisser de la marge
        const placedPawns = pawns.filter(p => p.x !== 50 || p.y !== 50).length
        const currentPlayerIndex = placedPawns
        console.log('Placement du pion:', { placedPawns, currentPlayerIndex, players: players.length })
        
        if (currentPlayerIndex < players.length) {
          console.log('Placing pawn for player:', currentPlayerIndex, 'at position:', { relativeX, relativeY })
          setPawns(prev => {
            const newPawns = [...prev]
            newPawns[currentPlayerIndex] = { 
              ...newPawns[currentPlayerIndex], 
              x: relativeX, 
              y: relativeY 
            }
            console.log('New pawns state:', newPawns)
            return newPawns
          })
          console.log('Pion placé pour le joueur:', currentPlayerIndex)
        } else {
          console.log('Tous les joueurs ont déjà placé leur pion')
        }
      } else {
        console.log('Clic en dehors de la zone valide (distance:', distanceFromCenter, ')')
      }
    }

  // Vérifier si tous les pions sont placés
  const allPawnsPlaced = pawns.every(pawn => pawn.x !== 50 || pawn.y !== 50)

  // Passer à la configuration
  const goToConfig = () => {
    setGameState('config')
  }

  // Démarrer la partie
  const startGame = () => {
    setGameState('playing')
    setCurrentRound(0) // Remettre à 0 au début de la partie
    spawnZone()
  }

  // Faire apparaître une zone
  const spawnZone = () => {
    // Vérifier si le jeu est toujours en cours
    if (gameState !== 'playing') {
      console.log('Jeu arrêté, arrêt de la génération de zones')
      return
    }

    // Incrémenter le round AVANT de créer la zone
    const nextRound = currentRound + 1
    setCurrentRound(nextRound)

    const zone: Zone = {
      x: Math.random() * 60 + 20, // Entre 20% et 80%
      y: Math.random() * 60 + 20,
      radius: config.zoneRadius,
      active: true
    }

    setCurrentZone(zone)

    // Vérifier quels joueurs sont dans la zone
    const playersInZoneIds = pawns
      .filter(pawn => {
        const distance = Math.sqrt(
          Math.pow(pawn.x - zone.x, 2) + Math.pow(pawn.y - zone.y, 2)
        )
        // Le rayon de la zone en pourcentage (diamètre de la zone divisé par 2)
        const zoneRadiusPercent = (config.zoneRadius / 320) * 100 / 2
        console.log('Vérification zone:', {
          pawn: { x: pawn.x, y: pawn.y },
          zone: { x: zone.x, y: zone.y },
          distance,
          zoneRadiusPercent,
          isInZone: distance <= zoneRadiusPercent
        })
        return distance <= zoneRadiusPercent
      })
      .map(pawn => pawn.playerId)

    console.log('Joueurs dans la zone:', playersInZoneIds)
    setPlayersInZone(playersInZoneIds)

    // Ajouter les gorgées aux joueurs dans la zone
    setTotalSips(prev => {
      const newTotalSips = { ...prev }
      playersInZoneIds.forEach(playerId => {
        newTotalSips[playerId] += config.sipsPerZone
      })
      return newTotalSips
    })
  }

  // Passer à la zone suivante
  const nextZone = () => {
    // Vérifier si on a atteint le nombre de zones configuré
    if (currentRound >= config.zoneCount) {
      console.log('Fin de partie - nombre de zones atteint:', { currentRound, zoneCount: config.zoneCount })
      setGameState('finished')
      return
    }

    // Effacer la zone actuelle
    setCurrentZone(null)
    setPlayersInZone([])
    
    // Créer la zone suivante
    spawnZone()
  }

  // Mettre en pause/reprendre (supprimé car plus nécessaire avec le système manuel)

  // Recommencer
  const restartGame = () => {
    setGameState('placing')
    setCurrentRound(0)
         setCurrentZone(null)
     setPlayersInZone([])
     setPawns(prev => prev.map(pawn => ({ ...pawn, x: 50, y: 50 })))
     setTotalSips(prev => {
       const newTotalSips = { ...prev }
       Object.keys(newTotalSips).forEach(key => {
         newTotalSips[key] = 0
       })
       return newTotalSips
     })
    // Réinitialiser la configuration avec les valeurs par défaut
    setCustomConfig({
      zoneCount: difficultyConfig[difficulty].zoneCount,
      zoneRadius: difficultyConfig[difficulty].zoneRadius,
      sipsPerZone: difficultyConfig[difficulty].sipsPerZone,
      zoneDuration: difficultyConfig[difficulty].zoneDuration,
      spawnDelay: difficultyConfig[difficulty].spawnDelay
    })
    console.log('Partie redémarrée avec configuration:', {
      zoneCount: difficultyConfig[difficulty].zoneCount,
      currentRound: 0
    })
  }

  if (gameState === 'placing') {
    const placedPawns = pawns.filter(p => p.x !== 50 || p.y !== 50).length
    const currentPlayerIndex = placedPawns
    const currentPlayer = players[currentPlayerIndex]

    return (
      <div className="space-y-6">
                 <div className="text-center">
           <h2 className="text-2xl font-bold mb-4">Placement des pions</h2>
           <p className="text-muted-foreground mb-4">
             {currentPlayer ? `C'est au tour de ${currentPlayer.name} de placer son pion` : 'Tous les pions sont placés'}
           </p>
           <div className="flex justify-center gap-4 mb-4">
             {players.map((player, index) => {
               const pawn = pawns[index]
               const isPlaced = pawn && (pawn.x !== 50 || pawn.y !== 50)
               const isCurrentPlayer = index === currentPlayerIndex
               
               return (
                 <div
                   key={player.id}
                   className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                     isCurrentPlayer && !isPlaced 
                       ? 'border-yellow-400 bg-yellow-400/10' 
                       : isPlaced 
                         ? 'border-green-500 bg-green-500/10' 
                         : 'border-gray-600 bg-gray-800'
                   }`}
                 >
                   <div 
                     className={`w-4 h-4 rounded-full ${isCurrentPlayer && !isPlaced ? 'animate-pulse' : ''}`}
                     style={{ backgroundColor: playerColors[index % playerColors.length] }}
                   />
                   <span className={`text-sm font-medium ${
                     isCurrentPlayer && !isPlaced ? 'text-yellow-400' : 
                     isPlaced ? 'text-green-400' : 'text-gray-400'
                   }`}>
                     {player.name}
                   </span>
                   {isPlaced && <span className="text-green-400">✓</span>}
                 </div>
               )
             })}
           </div>
         </div>

                 <div className="flex justify-center">
           <div 
             ref={boardRef}
             className="relative w-80 h-80 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full border-4 border-gray-600 cursor-pointer"
             onClick={handleBoardClick}
           >
             {/* Cercle de placement */}
             <div className="absolute inset-4 border-2 border-dashed border-gray-500 rounded-full"></div>
             
                           {/* Zone d'exemple pour visualiser la taille */}
              <div
                className="absolute rounded-full border-2 border-yellow-400/30 bg-yellow-400/5"
                style={{
                  left: '50%',
                  top: '50%',
                  width: `${(config.zoneRadius / 320) * 100}%`,
                  height: `${(config.zoneRadius / 320) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              />
             
             {/* Pions placés */}
             {pawns.map((pawn, index) => {
               const isPlaced = pawn.x !== 50 || pawn.y !== 50
               const isCurrentPlayer = index === currentPlayerIndex
               
               return (
                 <div
                   key={pawn.id}
                   className={`absolute w-6 h-6 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                     isPlaced ? 'opacity-100' : 'opacity-30'
                   } ${isCurrentPlayer && !isPlaced ? 'animate-pulse' : ''}`}
                   style={{
                     backgroundColor: pawn.color,
                     left: `${pawn.x}%`,
                     top: `${pawn.y}%`
                   }}
                 />
               )
             })}
             
             {/* Indicateur de taille */}
             <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-sm">
               Taille des zones: {config.zoneRadius}px
             </div>
           </div>
         </div>

                 <div className="text-center">
           <Button 
             onClick={goToConfig} 
             disabled={!allPawnsPlaced}
             className="px-8"
           >
             <Play className="h-4 w-4 mr-2" />
             Configurer la partie
           </Button>
         </div>
      </div>
         )
   }

       if (gameState === 'config') {
      return (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">⚙️ Configuration de la partie</h2>
            <p className="text-muted-foreground mb-6">
              Ajustez les paramètres selon vos préférences
            </p>
          </div>

                     {/* Aperçu en temps réel */}
           <Card className="p-6">
             <h3 className="text-lg font-semibold mb-4 text-center">👁️ Aperçu en temps réel</h3>
             <div className="flex justify-center">
               <div className="relative w-80 h-80 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full border-4 border-gray-600">
                                   {/* Zone d'aperçu statique */}
                  <div
                    className="absolute rounded-full border-2 border-yellow-400/50 bg-yellow-400/10"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: `${(customConfig.zoneRadius / 320) * 100}%`,
                      height: `${(customConfig.zoneRadius / 320) * 100}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                 
                                   {/* Zone d'aperçu animée (si activée) */}
                  {showPreview && previewZone && (
                    <div
                      className="absolute rounded-full border-2 border-yellow-400 bg-yellow-400/20 animate-pulse"
                      style={{
                        left: `${previewZone.x}%`,
                        top: `${previewZone.y}%`,
                        width: `${(customConfig.zoneRadius / 320) * 100}%`,
                        height: `${(customConfig.zoneRadius / 320) * 100}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    />
                  )}
                 
                                   {/* Pions d'exemple */}
                  {pawns.map((pawn) => (
                   <div
                     key={pawn.id}
                     className="absolute w-6 h-6 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2"
                     style={{
                       backgroundColor: pawn.color,
                       left: `${pawn.x}%`,
                       top: `${pawn.y}%`
                     }}
                   />
                 ))}
                 
                 {/* Indicateur de durée */}
                 <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-sm">
                   Zone visible: {customConfig.zoneDuration / 1000}s
                 </div>
               </div>
             </div>
             <div className="flex justify-center gap-4 mt-4">
               <Button 
                 onClick={() => {
                   if (!showPreview) {
                     setShowPreview(true)
                     const zone: Zone = {
                       x: Math.random() * 60 + 20,
                       y: Math.random() * 60 + 20,
                       radius: customConfig.zoneRadius,
                       active: true
                     }
                     setPreviewZone(zone)
                     
                     // Faire disparaître la zone après la durée configurée
                     setTimeout(() => {
                       setShowPreview(false)
                       setPreviewZone(null)
                     }, customConfig.zoneDuration)
                   }
                 }}
                 disabled={showPreview}
                 variant="outline"
                 size="sm"
               >
                 {showPreview ? 'Test en cours...' : 'Tester une zone'}
               </Button>
             </div>
             <p className="text-center text-sm text-muted-foreground mt-4">
                               La zone jaune montre la taille. Cliquez &quot;Tester une zone&quot; pour voir une zone apparaître aléatoirement.
             </p>
           </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Nombre de zones */}
           <Card className="p-4">
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5" />
                 <h3 className="text-lg font-semibold">Nombre de zones</h3>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="zoneCount">Zones : {customConfig.zoneCount}</Label>
                 <Slider
                   id="zoneCount"
                   min={3}
                   max={20}
                   step={1}
                   value={[customConfig.zoneCount]}
                   onValueChange={(value) => setCustomConfig(prev => ({ ...prev, zoneCount: value[0] }))}
                   className="w-full"
                 />
                 <p className="text-sm text-muted-foreground">
                   Plus de zones = partie plus longue
                 </p>
               </div>
             </div>
           </Card>

           {/* Taille des zones */}
           <Card className="p-4">
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5" />
                 <h3 className="text-lg font-semibold">Taille des zones</h3>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="zoneRadius">Rayon : {customConfig.zoneRadius}px</Label>
                                   <Slider
                    id="zoneRadius"
                    min={0}
                    max={250}
                    step={5}
                    value={[customConfig.zoneRadius]}
                    onValueChange={(value) => setCustomConfig(prev => ({ ...prev, zoneRadius: value[0] }))}
                    className="w-full"
                  />
                 <p className="text-sm text-muted-foreground">
                   Plus grand = plus facile à éviter
                 </p>
               </div>
             </div>
           </Card>

           {/* Gorgées par zone */}
           <Card className="p-4">
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5" />
                 <h3 className="text-lg font-semibold">Gorgées par zone</h3>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="sipsPerZone">Gorgées : {customConfig.sipsPerZone}</Label>
                 <Slider
                   id="sipsPerZone"
                   min={1}
                   max={10}
                   step={1}
                   value={[customConfig.sipsPerZone]}
                   onValueChange={(value) => setCustomConfig(prev => ({ ...prev, sipsPerZone: value[0] }))}
                   className="w-full"
                 />
                 <p className="text-sm text-muted-foreground">
                   Plus de gorgées = plus de défi !
                 </p>
               </div>
             </div>
           </Card>

           {/* Durée des zones */}
           <Card className="p-4">
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5" />
                 <h3 className="text-lg font-semibold">Durée des zones</h3>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="zoneDuration">Durée : {customConfig.zoneDuration / 1000}s</Label>
                 <Slider
                   id="zoneDuration"
                   min={1000}
                   max={5000}
                   step={500}
                   value={[customConfig.zoneDuration]}
                   onValueChange={(value) => setCustomConfig(prev => ({ ...prev, zoneDuration: value[0] }))}
                   className="w-full"
                 />
                 <p className="text-sm text-muted-foreground">
                   Plus long = plus de temps pour voir
                 </p>
               </div>
             </div>
           </Card>

           {/* Délai entre zones */}
           <Card className="p-4">
             <div className="space-y-4">
               <div className="flex items-center gap-2">
                 <Settings className="h-5 w-5" />
                 <h3 className="text-lg font-semibold">Délai entre zones</h3>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="spawnDelay">Délai : {customConfig.spawnDelay / 1000}s</Label>
                 <Slider
                   id="spawnDelay"
                   min={500}
                   max={3000}
                   step={100}
                   value={[customConfig.spawnDelay]}
                   onValueChange={(value) => setCustomConfig(prev => ({ ...prev, spawnDelay: value[0] }))}
                   className="w-full"
                 />
                 <p className="text-sm text-muted-foreground">
                   Plus court = zones plus rapides
                 </p>
               </div>
             </div>
           </Card>

           {/* Résumé de la configuration */}
           <Card className="p-4 md:col-span-2">
             <div className="space-y-4">
               <h3 className="text-lg font-semibold">📊 Résumé de la configuration</h3>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                 <div className="text-center p-2 bg-gray-800 rounded">
                   <div className="font-semibold">{customConfig.zoneCount}</div>
                   <div className="text-muted-foreground">Zones</div>
                 </div>
                 <div className="text-center p-2 bg-gray-800 rounded">
                   <div className="font-semibold">{customConfig.zoneRadius}px</div>
                   <div className="text-muted-foreground">Taille</div>
                 </div>
                 <div className="text-center p-2 bg-gray-800 rounded">
                   <div className="font-semibold">{customConfig.sipsPerZone}</div>
                   <div className="text-muted-foreground">Gorgées/zone</div>
                 </div>
                 <div className="text-center p-2 bg-gray-800 rounded">
                   <div className="font-semibold">{Math.round((customConfig.zoneCount * (customConfig.zoneDuration + customConfig.spawnDelay)) / 1000)}s</div>
                   <div className="text-muted-foreground">Durée totale</div>
                 </div>
               </div>
             </div>
           </Card>
         </div>

         <div className="flex justify-center gap-4">
           <Button onClick={() => setGameState('placing')} variant="outline">
             <ArrowLeft className="h-4 w-4 mr-2" />
             Retour au placement
           </Button>
           <Button onClick={startGame} className="px-8">
             <Play className="h-4 w-4 mr-2" />
             Lancer la partie
           </Button>
         </div>
       </div>
     )
   }

           if (gameState === 'finished') {
      const sortedPlayers = players.sort((a, b) => totalSips[b.id] - totalSips[a.id])
      const winner = sortedPlayers[0]
      const totalGorgées = Object.values(totalSips).reduce((sum, sips) => sum + sips, 0)
      const averageGorgées = Math.round(totalGorgées / players.length)

     return (
       <div className="space-y-6">
         <div className="text-center">
           <h2 className="text-3xl font-bold mb-4">🎉 Partie terminée !</h2>
           <div className="text-xl mb-6">
             <span className="text-yellow-400">🏆 Vainqueur : {winner.name}</span>
             <br />
             <span className="text-muted-foreground">avec {totalSips[winner.id]} gorgées</span>
           </div>
         </div>

         {/* Résumé de la partie */}
         <Card className="p-6">
           <h3 className="text-xl font-semibold mb-4">📊 Résumé de la partie</h3>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
             <div className="text-center p-3 bg-gray-800 rounded">
               <div className="text-2xl font-bold text-blue-400">{config.zoneCount}</div>
               <div className="text-sm text-muted-foreground">Zones jouées</div>
             </div>
             <div className="text-center p-3 bg-gray-800 rounded">
               <div className="text-2xl font-bold text-green-400">{totalGorgées}</div>
               <div className="text-sm text-muted-foreground">Gorgées totales</div>
             </div>
             <div className="text-center p-3 bg-gray-800 rounded">
               <div className="text-2xl font-bold text-yellow-400">{averageGorgées}</div>
               <div className="text-sm text-muted-foreground">Moyenne/joueur</div>
             </div>
             <div className="text-center p-3 bg-gray-800 rounded">
               <div className="text-2xl font-bold text-purple-400">{config.zoneRadius}px</div>
               <div className="text-sm text-muted-foreground">Taille des zones</div>
             </div>
           </div>
         </Card>

         {/* Classement final */}
         <Card className="p-6">
           <h3 className="text-xl font-semibold mb-4">🏆 Classement final</h3>
           <div className="space-y-3">
             {sortedPlayers.map((player, index) => {
               const playerIndex = players.findIndex(p => p.id === player.id)
               const isWinner = index === 0
               const isLast = index === sortedPlayers.length - 1
               
               return (
                 <div 
                   key={player.id} 
                   className={`flex justify-between items-center p-3 rounded-lg border-2 transition-all ${
                     isWinner 
                       ? 'bg-yellow-500/10 border-yellow-500/30' 
                       : isLast 
                         ? 'bg-red-500/10 border-red-500/30'
                         : 'bg-gray-800 border-gray-700'
                   }`}
                 >
                                     <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${
                      isWinner ? 'text-yellow-400' : 
                      isLast ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                    </div>
                    {(() => {
                      // Trouver le pion correspondant à ce joueur pour obtenir la bonne couleur
                      const pawn = pawns.find(p => p.playerId === player.id)
                      const playerColor = pawn ? pawn.color : playerColors[playerIndex % playerColors.length]
                      return (
                        <div 
                          className="w-5 h-5 rounded-full border-2 border-white"
                          style={{ backgroundColor: playerColor }}
                        />
                      )
                    })()}
                    <span className={`font-medium ${
                      isWinner ? 'text-yellow-400' : 
                      isLast ? 'text-red-400' : 'text-white'
                    }`}>
                      {player.name}
                    </span>
                  </div>
                   <div className="text-right">
                     <div className="font-bold text-lg">{totalSips[player.id]} gorgées</div>
                     <div className="text-sm text-muted-foreground">
                       {Math.round((totalSips[player.id] / totalGorgées) * 100)}% du total
                     </div>
                   </div>
                 </div>
               )
             })}
           </div>
         </Card>

         {/* Statistiques détaillées */}
         <Card className="p-6">
           <h3 className="text-xl font-semibold mb-4">📈 Statistiques détaillées</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <h4 className="font-semibold mb-2 text-green-400">Configuration utilisée :</h4>
               <ul className="space-y-1 text-sm text-muted-foreground">
                 <li>• {config.zoneCount} zones au total</li>
                 <li>• {config.sipsPerZone} gorgée{config.sipsPerZone > 1 ? 's' : ''} par zone</li>
                 <li>• Zones de {config.zoneRadius}px de rayon</li>
                 <li>• Durée : {config.zoneDuration / 1000}s par zone</li>
                 <li>• Délai : {config.spawnDelay / 1000}s entre zones</li>
               </ul>
             </div>
             <div>
               <h4 className="font-semibold mb-2 text-blue-400">Performance :</h4>
               <ul className="space-y-1 text-sm text-muted-foreground">
                 <li>• Durée totale : ~{Math.round((config.zoneCount * (config.zoneDuration + config.spawnDelay)) / 1000)}s</li>
                 <li>• Gorgées par zone : {config.sipsPerZone}</li>
                 <li>• Gorgées max possibles : {config.zoneCount * config.sipsPerZone * players.length}</li>
                 <li>• Efficacité : {Math.round((totalGorgées / (config.zoneCount * config.sipsPerZone * players.length)) * 100)}%</li>
               </ul>
             </div>
           </div>
         </Card>

         <div className="flex justify-center gap-4">
           <Button onClick={restartGame} variant="outline" className="px-6">
             <RotateCcw className="h-4 w-4 mr-2" />
             Rejouer
           </Button>
           <Button onClick={onGameEnd} className="px-6">
             <Home className="h-4 w-4 mr-2" />
             Retour au menu
           </Button>
         </div>
       </div>
     )
   }

  return (
    <div className="space-y-6">
             <div className="flex justify-between items-center">
         <div>
           <h2 className="text-2xl font-bold">🎯 Petits Points</h2>
           <p className="text-muted-foreground">Zone {currentRound}/{config.zoneCount}</p>
         </div>
         <div className="flex gap-2">
           <Button onClick={onGameEnd} variant="outline">
             <Home className="h-4 w-4" />
           </Button>
         </div>
       </div>

             <div className="flex justify-center">
         <div 
           ref={boardRef}
           className="relative w-80 h-80 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full border-4 border-gray-600"
         >
                      {/* Zone active */}
            {currentZone && (
              <div
                className="absolute rounded-full border-2 border-yellow-400 bg-yellow-400/20 animate-pulse"
                style={{
                  left: `${currentZone.x}%`,
                  top: `${currentZone.y}%`,
                  width: `${(currentZone.radius / 320) * 100}%`,
                  height: `${(currentZone.radius / 320) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              />
            )}
           
                       {/* Pions */}
            {pawns.map((pawn) => {
             const player = players.find(p => p.id === pawn.playerId)
             const isInZone = playersInZone.includes(pawn.playerId)
             
             return (
               <div
                 key={pawn.id}
                 className={`absolute w-6 h-6 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                   isInZone ? 'scale-125 shadow-lg shadow-yellow-400/50' : ''
                 }`}
                 style={{
                   backgroundColor: pawn.color,
                   left: `${pawn.x}%`,
                   top: `${pawn.y}%`
                 }}
                 title={player?.name}
               />
             )
           })}
         </div>
       </div>

        {/* Bouton zone suivante - toujours à la même place */}
        <div className="text-center">
          <Button 
            onClick={currentRound >= config.zoneCount ? () => setGameState('finished') : nextZone} 
            className="px-8 py-3 text-lg"
          >
            {currentRound >= config.zoneCount ? 'Fin de partie' : 'Zone suivante'}
          </Button>
        </div>

        {/* Joueurs dans la zone - apparaît en dessous du bouton */}
        {playersInZone.length > 0 && (
          <Card className="p-4 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-lg font-semibold mb-2 text-yellow-400">🎯 Joueurs dans la zone :</h3>
            <div className="flex flex-wrap gap-2">
              {playersInZone.map(playerId => {
                const player = players.find(p => p.id === playerId)
                return (
                  <div key={playerId} className="px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-300">
                    {player?.name} : {config.sipsPerZone} gorgée{config.sipsPerZone > 1 ? 's' : ''}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Gorgées totales */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-3">Gorgées totales</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {players.map((player, index) => {
              // Trouver le pion correspondant à ce joueur pour obtenir la bonne couleur
              const pawn = pawns.find(p => p.playerId === player.id)
              const playerColor = pawn ? pawn.color : playerColors[index % playerColors.length]
              
              return (
                <div key={player.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: playerColor }}
                  />
                  <span className="text-sm">{player.name}</span>
                  <span className="ml-auto font-semibold">{totalSips[player.id]} gorgées</span>
                </div>
              )
            })}
          </div>
        </Card>
    </div>
  )
} 