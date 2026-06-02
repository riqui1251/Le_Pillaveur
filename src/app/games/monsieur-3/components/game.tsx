"use client"

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Home, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import useScreenSize from '@/hooks/useScreenSize'
import confetti from 'canvas-confetti'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences, getPlayerGameBoost } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'

// Types
interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
}

interface Player {
  name: string
  isMonsieur3: boolean
  score: number
  preferences?: PlayerPreferences
  id: string
}

interface DiceRoll {
  dice1: number
  dice2: number
}

export default function Game({ players: initialBasePlayers, onGameEnd }: GameProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0)
  const [dice, setDice] = useState<DiceRoll>({ dice1: 1, dice2: 1 })
  const [rolling, setRolling] = useState<boolean>(false)
  const [gamePhase, setGamePhase] = useState<'setup' | 'play' | 'end'>('setup')
  const [message, setMessage] = useState<string>('')
  const [rollHistory, setRollHistory] = useState<{player: string, dice: DiceRoll, message: string}[]>([])
  const [specialMessage, setSpecialMessage] = useState<string | null>(null)
  const [canRoll, setCanRoll] = useState<boolean>(false)
  const [setupRolls, setSetupRolls] = useState<{playerName: string, roll: number}[]>([])
  const [monsieur3Found, setMonsieur3Found] = useState<boolean>(false)
  const [gameEnded, setGameEnded] = useState<boolean>(false)
  const [monsieur3Index, setMonsieur3Index] = useState<number>(-1)
  const [victoryScreen, setVictoryScreen] = useState<boolean>(false)
  const { isMobile } = useScreenSize()
  
  const confettiRef = useRef<HTMLDivElement>(null)
  const diceContainerRef = useRef<HTMLDivElement>(null)

  // Fonction pour lancer des confettis
  const launchConfetti = () => {
    if (confettiRef.current) {
      const rect = confettiRef.current.getBoundingClientRect()
      const defaults = { 
        particleCount: 100,
        spread: 70,
        origin: { 
          x: rect.left / window.innerWidth + rect.width / window.innerWidth / 2,
          y: rect.top / window.innerHeight
        }
      }

      // Configuration de base
      confetti({
        ...defaults,
        particleCount: 50,
        spread: 80,
      })

      // Second jet de confettis
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 30,
          angle: 60,
          spread: 50,
        })
      }, 250)

      // Troisième jet de confettis
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 30,
          angle: 120,
          spread: 50,
        })
      }, 400)
    }
  }
  
  // Initialisation du jeu
  useEffect(() => {
    // Vérifier que initialBasePlayers est bien défini et est un tableau
    if (!initialBasePlayers || !Array.isArray(initialBasePlayers)) {
      // Initialiser avec un tableau vide si initialBasePlayers n'est pas valide
      setPlayers([]);
      return;
    }
    
    // Initialiser les joueurs en conservant leurs préférences
    const initialPlayers: Player[] = initialBasePlayers.map(player => ({
      name: player?.name || 'Joueur sans nom',
      isMonsieur3: false,
      score: 0,
      preferences: player?.preferences || {},
      id: player?.id || `player-${Math.random().toString(36).substring(2, 9)}`
    }))
    
    setPlayers(initialPlayers)
    setGamePhase('setup')
    setMessage('Lancez le dé pour commencer. Le premier joueur qui obtient un 3 devient "Monsieur 3".')
    setCurrentPlayerIndex(0)
    setCanRoll(true)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
  }, [initialBasePlayers])
  
  // Fonction pour lancer un dé (1-6)
  const rollDie = (): number => {
    return Math.floor(Math.random() * 6) + 1
  }
  
  // Lancer les dés
  const rollDice = () => {
    if (!canRoll) return
    
    setRolling(true)
    setCanRoll(false)
    
    // Animation de roulement
    const rollInterval = setInterval(() => {
      setDice({
        dice1: rollDie(),
        dice2: gamePhase === 'setup' ? 1 : rollDie() // En phase de setup, un seul dé
      })
    }, 50)
    
    // Arrêter l'animation après un délai
    setTimeout(() => {
      clearInterval(rollInterval)
      
      // Résultat final
      const finalDice1 = rollDie()
      const finalDice2 = gamePhase === 'setup' ? 1 : rollDie()
      
      const finalDice = {
        dice1: finalDice1,
        dice2: finalDice2
      }
      
      setDice(finalDice)
      setRolling(false)
      
      // Traiter le résultat
      if (gamePhase === 'setup') {
        handleSetupRoll(finalDice1)
      } else if (gamePhase === 'play') {
        handlePlayRoll(finalDice)
      }
    }, 1000)
  }
  
  // Gérer le lancer pendant la phase de setup
  const handleSetupRoll = (roll: number) => {
    const currentPlayerObj = players[currentPlayerIndex]
    const currentPlayerName = currentPlayerObj.name
    const basePlayer = initialBasePlayers.find(p => p.id === currentPlayerObj.id)
    const boost = basePlayer ? getPlayerGameBoost(basePlayer, 'monsieur-3') : 0
    let effectiveRoll = roll
    if (roll === 3 && boost > 0 && Math.random() * 100 < boost) {
      effectiveRoll = 4
    }
    
    const newSetupRolls = [...setupRolls, { playerName: currentPlayerName, roll: effectiveRoll }]
    setSetupRolls(newSetupRolls)
    
    let newMessage = ''
    
    if (effectiveRoll === 3) {
      // Désigner ce joueur comme Monsieur 3
      const updatedPlayers = [...players]
      updatedPlayers[currentPlayerIndex].isMonsieur3 = true
      setPlayers(updatedPlayers)
      setMonsieur3Index(currentPlayerIndex)
      
      newMessage = `${currentPlayerName} a fait un 3 et devient Monsieur 3!`
      setMessage(newMessage)
      setSpecialMessage('Monsieur 3 trouvé!')
      
      // Lancer des confettis
      launchConfetti()
      
      // Passer à la phase de jeu après un délai
      setTimeout(() => {
        setMonsieur3Found(true)
        setMessage('Monsieur 3 trouvé! La partie va commencer.')
        
        // Le joueur suivant est le joueur à gauche de Monsieur 3 (index + 1, avec retour à 0 si nécessaire)
        const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
        setCurrentPlayerIndex(nextPlayerIndex)
        
        setTimeout(() => {
          setGamePhase('play')
          setMessage(`C'est au tour de ${players[nextPlayerIndex].name} de lancer les dés.`)
          setSpecialMessage(null)
          setCanRoll(true)
        }, 2000)
      }, 2000)
    } else {
      newMessage = `${currentPlayerName} a fait un ${effectiveRoll}.`
      setMessage(newMessage)
      
      // Passer au joueur suivant
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(nextPlayerIndex)
      setCanRoll(true)
    }
    
    setRollHistory(prev => [...prev, {
      player: currentPlayerName,
      dice: { dice1: effectiveRoll, dice2: 1 },
      message: newMessage
    }])
  }
  
  // Gérer le lancer pendant la phase de jeu
  const handlePlayRoll = (diceRoll: DiceRoll) => {
    const { dice1, dice2 } = diceRoll
    const sum = dice1 + dice2
    const isDouble = dice1 === dice2
    const currentPlayerObj = players[currentPlayerIndex]
    const currentPlayerName = currentPlayerObj.name
    const isCurrentPlayerMonsieur3 = currentPlayerObj.isMonsieur3
    const basePlayer = initialBasePlayers.find(p => p.id === currentPlayerObj.id)
    const boost = basePlayer ? getPlayerGameBoost(basePlayer, 'monsieur-3') : 0
    
    let messageText = ''
    let monsieur3ShouldDrink = false
    let ruleTriggered = false
    
    if (isCurrentPlayerMonsieur3) {
      // Si aucune règle n'est déclenchée pour Monsieur 3, on termine la partie
      if (dice1 !== 3 && dice2 !== 3 && sum !== 3 && sum !== 5 && dice1 !== 5 && dice2 !== 5 && sum !== 8 && !isDouble) {
        messageText = `Fin de la partie ! Monsieur 3 a terminé son tour.`
        setGameEnded(true)
        showVictoryScreen()
        setRollHistory(prev => [...prev, {
          player: currentPlayerName,
          dice: diceRoll,
          message: messageText
        }])
        setMessage(messageText)
        return
      }
    }
    
    if (dice1 === 3 || dice2 === 3 || sum === 3 || sum === 5 || dice1 === 5 || dice2 === 5 || sum === 8) {
      monsieur3ShouldDrink = true
      messageText = "Monsieur 3 tu bois !"
      ruleTriggered = true
    }
    if (!isCurrentPlayerMonsieur3 && !monsieur3ShouldDrink && monsieur3Index >= 0 && boost > 0 && Math.random() * 100 < boost) {
      monsieur3ShouldDrink = true
      messageText = "Monsieur 3 tu bois !"
      ruleTriggered = true
    }
    
    if (isDouble) {
      messageText += messageText ? " Et " : "";
      messageText += `${currentPlayerName} peut choisir un joueur pour un duel.`
      ruleTriggered = true
    }
    
    // Mettre à jour le score de Monsieur 3 (une seule gorgée même si plusieurs règles s'appliquent)
    if (monsieur3ShouldDrink && monsieur3Index !== -1) {
      const updatedPlayers = [...players]
      updatedPlayers[monsieur3Index].score += 1
      setPlayers(updatedPlayers)
    }
    
    // Si aucune règle n'est déclenchée
    if (!ruleTriggered && !gameEnded) {
      messageText = `Aucune règle déclenchée pour ${dice1} et ${dice2}.`
      
      // Passer au joueur suivant automatiquement
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(nextPlayerIndex)
    }
    
    // Ajouter au rollHistory
    setRollHistory(prev => [...prev, {
      player: currentPlayerName,
      dice: diceRoll,
      message: messageText
    }])
    
    setMessage(messageText)
    
    // Si le joueur doit relancer ou la partie est terminée
    setTimeout(() => {
      if (ruleTriggered && !gameEnded) {
        setCanRoll(true)
      } else if (gameEnded) {
        setGamePhase('end')
      } else {
        setMessage(`C'est au tour de ${players[(currentPlayerIndex + 1) % players.length].name} de lancer les dés.`)
        setCanRoll(true)
      }
    }, 1000)
  }
  
  // Afficher l'écran de victoire
  const showVictoryScreen = () => {
    setVictoryScreen(true)
    
    // Animations de confettis plus impressionnantes
    launchConfetti()
    
    // Plus de confettis après un délai
    setTimeout(() => {
      launchConfetti()
    }, 1500)
  }
  
  // Redémarrer le jeu
  const restartGame = () => {
    // Vérifier que initialBasePlayers est bien défini et est un tableau
    if (!initialBasePlayers || !Array.isArray(initialBasePlayers)) {
      setPlayers([]);
      return;
    }
    
    // Réinitialiser tous les états en conservant les préférences
    setPlayers(initialBasePlayers.map(player => ({
      name: player?.name || 'Joueur sans nom',
      isMonsieur3: false,
      score: 0,
      preferences: player?.preferences || {},
      id: player?.id || `player-${Math.random().toString(36).substring(2, 9)}`
    })))
    setCurrentPlayerIndex(0)
    setDice({ dice1: 1, dice2: 1 })
    setRolling(false)
    setGamePhase('setup')
    setMessage('Lancez le dé pour commencer. Le premier joueur qui obtient un 3 devient "Monsieur 3".')
    setRollHistory([])
    setSpecialMessage(null)
    setCanRoll(true)
    setSetupRolls([])
    setMonsieur3Found(false)
    setGameEnded(false)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
  }
  
  // Rendu d'un dé
  const renderDie = (value: number, index: number) => {
    return (
      <motion.div 
        key={`die-${index}`}
        className={`w-16 h-16 ${isMobile ? 'w-12 h-12' : 'w-16 h-16'} rounded-lg shadow-lg bg-white flex items-center justify-center`}
        initial={{ rotateX: 0 }}
        animate={rolling ? { 
          rotateX: [0, 360, 720, 1080], 
          rotateY: [0, 360, 720, 1080],
          scale: [1, 1.1, 0.9, 1]
        } : {}}
        transition={{ duration: 1, ease: "easeInOut" }}
      >
        <div className="relative w-full h-full">
          {/* Points du dé basés sur la valeur */}
          {value === 1 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-black rounded-full"></div>
            </div>
          )}
          {value === 2 && (
            <>
              <div className="absolute top-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </>
          )}
          {value === 3 && (
            <>
              <div className="absolute top-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </>
          )}
          {value === 4 && (
            <>
              <div className="absolute top-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute top-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </>
          )}
          {value === 5 && (
            <>
              <div className="absolute top-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute top-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </>
          )}
          {value === 6 && (
            <>
              <div className="absolute top-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute top-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute left-2 top-1/2 -translate-y-1/2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 left-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    )
  }

  // Écran de victoire
  const renderVictoryScreen = () => {
    const monsieur3 = players.find(player => player.isMonsieur3);
    
    return (
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-gradient-to-br from-blue-900/90 to-purple-900/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          className="text-center p-8"
          initial={{ scale: 0.8, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, type: "spring" }}
        >
          <h2 className="text-4xl font-bold text-white mb-6">Partie Terminée !</h2>
          
          <div className="mb-6">
            <div className="text-xl text-yellow-300 font-semibold mb-2">Monsieur 3</div>
            <div className="text-3xl text-white font-bold mb-4">{monsieur3?.name}</div>
            <div className="text-xl text-blue-200">
              A bu {monsieur3?.score} gorgée{monsieur3?.score !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div className="flex flex-col gap-4 mt-8">
            <Button
              onClick={restartGame}
              size="lg"
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 font-bold py-6"
            >
              Nouvelle partie
            </Button>
            
            <Button
              onClick={onGameEnd}
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white/10"
            >
              Retour à la sélection des joueurs
            </Button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  // Pour tout rendu de nom de joueur, utiliser le composant PlayerName
  const renderPlayerCard = (player: Player, index: number) => {
    return (
      <div 
        key={player.id}
        className={`
          flex items-center justify-between p-2 rounded-md
          ${currentPlayerIndex === index ? 'bg-primary/20' : ''}
          ${player.isMonsieur3 ? 'border-2 border-yellow-500' : ''}
          mb-2 hover:bg-primary/10 transition-colors
        `}
        onClick={() => setCurrentPlayerIndex(index)}
      >
        <div className="flex items-center space-x-2">
          <Avatar className={`${player.preferences?.color || ''} ${player.isMonsieur3 ? 'border-2 border-yellow-500' : ''}`}>
            <AvatarFallback>
              {player.preferences?.icon || player.name.charAt(0).toUpperCase()}
            </AvatarFallback>
            {player.preferences?.avatar && (
              <AvatarImage src={player.preferences.avatar} alt={player.name} />
            )}
          </Avatar>
          <div className="flex flex-col">
            <PlayerName player={player} className="font-medium" />
            <div className="text-xs text-muted-foreground">
              {player.score > 0 && player.isMonsieur3 && `${player.score} gorgée${player.score > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
        {player.isMonsieur3 && (
          <div className="px-2 py-1 bg-yellow-500 text-black text-xs rounded-full font-medium">
            Monsieur 3
          </div>
        )}
      </div>
    )
  }
  
  // Rendu du tableau des joueurs avec un titre plus visible
  const renderPlayersList = () => {
    if (!players || players.length === 0) {
      return (
        <div className="text-center p-4 text-blue-200 bg-blue-800/30 rounded-md">
          <p>Aucun joueur sélectionné</p>
          <p className="text-sm mt-2">Retournez à la sélection des joueurs</p>
        </div>
      );
    }
    
    return (
      <div className="divide-y divide-blue-700">
        {players.map((player, index) => renderPlayerCard(player, index))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* En-tête */}
      <div className="flex justify-between items-center mb-6">
        <Button 
          onClick={onGameEnd}
          variant="outline" 
          size="icon"
        >
          <Home className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Monsieur 3</h1>
        <Button 
          onClick={restartGame}
          variant="outline" 
          size="icon"
        >
          <RefreshCw className="w-5 h-5" />
        </Button>
      </div>
      
      {/* Affichage du nombre de joueurs */}
      <div className="mb-4 text-center">
        <p className="text-blue-200">
          {players.length} joueur{players.length > 1 ? 's' : ''} dans la partie
        </p>
      </div>
      
      {/* Zone des dés */}
      <div ref={confettiRef} className="relative">
        <Card className="mb-6 p-6 bg-gradient-to-br from-blue-900/80 to-purple-800/80 border-blue-700">
          <div className="text-blue-100 text-center mb-4">
            {gamePhase === 'setup' && !monsieur3Found && (
              <div className="mb-2">
                <span className="text-lg font-semibold">Recherche de Monsieur 3</span>
                <p className="text-sm">Le premier joueur qui fait un 3 devient Monsieur 3</p>
              </div>
            )}
            
            {/* Joueur actuel */}
            <div className="flex justify-center items-center space-x-3 mb-4">
              {players.length > 0 && currentPlayerIndex < players.length ? (
                <>
                  {players[currentPlayerIndex]?.isMonsieur3 && (
                    <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full">Monsieur 3</span>
                  )}
                  <PlayerName player={players[currentPlayerIndex]} className="text-lg font-bold" />
                </>
              ) : (
                <span className="text-red-300">Aucun joueur actif</span>
              )}
            </div>
          </div>
          
          {/* Animation spéciale */}
          <AnimatePresence>
            {specialMessage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex items-center justify-center z-10"
              >
                <div className="bg-yellow-500 text-black text-2xl font-bold px-6 py-3 rounded-lg shadow-xl">
                  {specialMessage}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Dés */}
          <div 
            ref={diceContainerRef}
            className="flex justify-center items-center space-x-4 mb-6"
          >
            {renderDie(dice.dice1, 1)}
            {gamePhase !== 'setup' && renderDie(dice.dice2, 2)}
          </div>
          
          {/* Message du lancer actuel */}
          <div className="text-center text-blue-100 mb-4 min-h-[3rem] text-xl font-bold">
            {message}
          </div>
          
          {/* Boutons d'action */}
          <div className="flex justify-center space-x-3">
            <Button
              disabled={!canRoll || rolling || victoryScreen || players.length === 0}
              onClick={rollDice}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
            >
              {rolling ? "Lancement..." : "Lancer les dés"}
            </Button>
          </div>
        </Card>
      </div>
      
      {/* Tableau des joueurs */}
      <Card className="p-4 bg-gradient-to-br from-blue-900/60 to-purple-800/60 border-blue-700 mb-6">
        <h2 className="text-xl font-semibold mb-3 text-blue-100">Joueurs</h2>
        {renderPlayersList()}
      </Card>
      
      {/* Historique des lancers */}
      <Card className="p-4 bg-gradient-to-br from-blue-900/60 to-purple-800/60 border-blue-700 mb-6">
        <h2 className="text-xl font-semibold mb-3 text-blue-100">Historique</h2>
        <div className="max-h-40 overflow-y-auto space-y-2">
          {rollHistory.length === 0 ? (
            <div className="text-blue-300 text-center py-4">Aucun lancer effectué</div>
          ) : (
            rollHistory.map((roll, index) => (
              <div key={index} className="text-sm text-blue-100 border-b border-blue-800 pb-1">
                <span className="font-semibold">{roll.player}: </span>
                <span>[{roll.dice.dice1}{gamePhase !== 'setup' || index >= setupRolls.length ? `, ${roll.dice.dice2}` : ''}] </span>
                <span>{roll.message}</span>
              </div>
            )).reverse()
          )}
        </div>
      </Card>
      
      {/* Règles du jeu */}
      <Card className="p-4 bg-gradient-to-br from-blue-900/60 to-purple-800/60 border-blue-700">
        <h2 className="text-xl font-semibold mb-3 text-blue-100">Règles du jeu</h2>
        <div className="text-sm text-blue-100 space-y-2">
          <p>• Seul Monsieur 3 boit des gorgées pendant la partie.</p>
          <p>• Monsieur 3 boit une gorgée chaque fois qu&apos;un dé affiche 3, que la somme des dés est égale à 3.</p>
          <p>• La somme ou un dé égal à 5 : Il faut faire metre les bras en croix et dire whoo! le dernier a faire cela boit une gorgée.</p>
          <p>• La somme égale à 8 : Pouce sur le front et le dernier a faire le geste boit une gorgée.</p>
          <p>• Si un dé 5 et dé 3 est tiré, le cumul est de 8 et il faut faire les 2 gestes cités ci-dessus. </p>
          <p>• Double (deux dés identiques) : le joueur peut choisir un autre joueur pour un duel.</p>
          <p>• Un joueur qui déclenche une règle rejoue jusqu&apos;à faire un lancer qui ne correspond à aucune règle.</p>
          <p>• La partie se termine après un tour complet quand tous les joueurs ont joué et que Monsieur 3 a fait son tour.</p>
        </div>
      </Card>
      
      {/* Écran de victoire */}
      {victoryScreen && renderVictoryScreen()}
    </div>
  )
} 