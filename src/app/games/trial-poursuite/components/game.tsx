"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import ReactConfetti from 'react-confetti'
import { RefreshCw, Trophy, Home, Clock, Target, Flame, CheckCircle, XCircle, Zap } from 'lucide-react'

interface GamePlayer extends Omit<BasePlayer, 'stats' | 'createdAt'> {
  score: number
  drinks: number
  wins: number
  stats?: {
    gamesPlayed: number;
    wins: number;
    totalDrinks: number;
    favoriteGame?: string;
    lastPlayed?: number;
  }
  createdAt?: number
  preferences: PlayerPreferences
  id: string
}

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
  difficulty: Difficulty
}

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

// Liste des défis "Trial Poursuite"
const TRIAL_CHALLENGES = {
  géographie: [
    "Cite 5 pays européens en 30 secondes",
    "Nomme 3 capitales qui commencent par 'P'",
    "Invente un nouveau nom de continent",
    "Décris avec tes mains la forme de l'Italie",
    "Mime un touriste qui se perd dans une ville inconnue",
    "Chante l'hymne national d'un pays inventé",
    "Explique où se trouve le Kilimandjaro sans le nommer",
    "Dessine la carte de France en 30 secondes"
  ],
  
  divertissement: [
    "Invente un nouveau genre de film en 1 minute",
    "Mime une scène d'action avec les effets sonores",
    "Raconte une blague que personne ne connaît",
    "Joue une publicité pour un produit bizarre",
    "Invente une danse spéciale pour ton propre doublage",
    "Créé un sketch de 30 secondes sur les réseaux sociaux",
    "Met en scène une émission de téléréalité complète",
    "Interprète un monologue tragique en 45 secondes"
  ],
  
  histoire: [
    "Explique l'Histoire de France en 45 secondes chrono",
    "Joue Napoléon qui prépare sa stratégie militaire",
    "Mime Charles de Gaulle dans un discours télévisé",
    "Invente ce qui s'est réellement passé en 1066",
    "Raconte la Révolution française version TikTok",
    "Interprète un habitant de Pompei qui découvre l'éruption",
    "Reconstitue une scène de guerre avec les effets sonores"
  ],
  
  "arts et littérature": [
    "Lis un poème que tu improvises sur-le-champ",
    "Mimique une statue antique qui s'anime",
    "Interprète une pièce théâtrale dramatique",
    "Invente une nouvelle oeuvre artistique",
    "Créé un personnage littéraire épique",
    "Peins une toile invisible devant nos yeux", 
    "Explique le sens caché d'une oeuvre littéraire"
  ],
  
  "sciences et nature": [
    "Explique la photosynthèse avec des mouvements de bras",
    "Définie un organisme que tu inventes", 
    "Simule une éruption volcanique avec audio complet",
    "Invente une nouvelle espèce animale et décris-la", 
    "Explique l'Univers à un extraterrestre",
    "Invente un médicament contre une maladie fictive"
  ],
  
  "sports et loisirs": [
    "Invente un nouveau sport et montre les règles",
    "Joue un commentaire sportif hystérique",
    "Mime une équipe de rugby en chanson",
    "Créé une discipline olympique délirante",
    "Joue un arbitre fou avec sifflets et cartons", 
    "Invente un sport aquatique impossible"
  ]
}

// Configuration par difficulté
const DIFFICULTY_CONFIG = {
  facile: {
    timePerChallenge: 60, // secondes
    maxChallenges: 3,
    drinkPenalty: 1,
    drinksOnComplete: 0,
    drinksOnFail: 2
  },
  normal: {
    timePerChallenge: 45,
    maxChallenges: 4,
    drinkPenalty: 1,
    drinksOnComplete: 0,
    drinksOnFail: 3
  },
  difficile: {
    timePerChallenge: 30,
    maxChallenges: 5,
    drinkPenalty: 2,
    drinksOnComplete: 0,
    drinksOnFail: 4
  },
  extreme: {
    timePerChallenge: 20,
    maxChallenges: 6,
    drinkPenalty: 2,
    drinksOnComplete: 0,
    drinksOnFail: 5
  }
}

type ChallengeCategory = 'géographie' | 'divertissement' | 'histoire' | 'arts et littérature' | 'sciences et nature' | 'sports et loisirs'
type ChallengeStatus = 'awaiting' | 'playing' | 'completed' | 'failed'

// Couleurs et ordre des catégories
const CATEGORY_CONFIG = {
  'géographie': {
    color: 'bg-blue-500',
    order: 1,
    icon: '🌍',
    tokenColor: 'blue'
  },
  'divertissement': {
    color: 'bg-red-500',
    order: 2,
    icon: '🎬',
    tokenColor: 'red',
    neededTokenColor: 'blue' // Nécessite un jeton bleu (géographie)
  },
  'histoire': {
    color: 'bg-purple-500',
    order: 3,
    icon: '🏛️',
    tokenColor: 'purple',
    neededTokenColor: 'red' // Nécessite un jeton rouge (divertissement)
  },
  'arts et littérature': {
    color: 'bg-yellow-500',
    order: 4,
    icon: '📚',
    tokenColor: 'yellow',
    neededTokenColor: 'purple' // Nécessite un jeton violet (histoire)
  },
  'sciences et nature': {
    color: 'bg-green-500',
    order: 5,
    icon: '🔬',
    tokenColor: 'green',
    neededTokenColor: 'yellow' // Nécessite un jeton jaune (arts et littérature)
  },
  'sports et loisirs': {
    color: 'bg-orange-500',
    order: 6,
    icon: '⚽',
    tokenColor: 'orange',
    neededTokenColor: 'green' // Nécessite un jeton vert (sciences et nature)
  }
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal' }: GameProps) {
  const [players, setPlayers] = useState<GamePlayer[]>(
    initialPlayers.map(p => ({ 
      ...p, 
      score: 0, 
      drinks: 0, 
      wins: 0,
      preferences: p.preferences || { color: 'bg-blue-500', icon: '👤' }
    }))
  )
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [currentChallenge, setCurrentChallenge] = useState('')
  const [currentCategory, setCurrentCategory] = useState<ChallengeCategory>('géographie')
  const [timeLeft, setTimeLeft] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [challengesCompleted, setChallengesCompleted] = useState(0)
  const [challengesFailed, setChallengesFailed] = useState(0)
  const [gameState, setGameState] = useState<'preparing' | 'playing' | 'completed' | 'failed'>('preparing')
  const [round, setRound] = useState(1)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [finalResults, setFinalResults] = useState<GamePlayer[]>([])
  const [playerTokens, setPlayerTokens] = useState<Record<string, string[]>>({})
  const [unlockedCategories, setUnlockedCategories] = useState<ChallengeCategory[]>(['géographie']) // Géographie toujours débloquée
  const [playerProgress, setPlayerProgress] = useState<Record<string, number>>({}) // Progression individuelle de chaque joueur (0-5)
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0) // Index pour suivre la progression séquentielle pour le joueur actuel
  const [isAllCategoriesCompleted, setIsAllCategoriesCompleted] = useState(false)

  const config = DIFFICULTY_CONFIG[difficulty]
  const currentPlayer = players[currentPlayerIndex]
  
  // Ordre séquentiel des catégories
  const categoryOrder: ChallengeCategory[] = useMemo(() => [
    'géographie',
    'divertissement', 
    'histoire',
    'arts et littérature',
    'sciences et nature',
    'sports et loisirs'
  ], [])
  
  // Lancement du timer
  const startTimer = useCallback(() => {
    setTimeLeft(config.timePerChallenge)
    setIsActive(true)
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setIsActive(false)
          setGameState('failed')
          setChallengesFailed(prev => prev + 1)
          setResultMessage(`⏰ Temps écoulé ! ${currentPlayer.name} boit ${config.drinksOnFail} gorgées ! Ton tour est fini, au tour du joueur suivant !`)
          setShowResultDialog(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return timer
  }, [config, currentPlayer.name])

  // Sélection du défi de la catégorie actuelle basée sur la progression du joueur actuel
  const generateNewChallenge = useCallback(() => {
    const currentPlayerId = currentPlayer.id
    const playerCurrentProgress = playerProgress[currentPlayerId] || 0
    
    if (playerCurrentProgress >= categoryOrder.length) {
      setIsAllCategoriesCompleted(true)
      setGameState('completed')
      return
    }
    
    const targetCategory = categoryOrder[playerCurrentProgress]
    const challenges = TRIAL_CHALLENGES[targetCategory]
    const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)]
    
    setCurrentChallenge(randomChallenge)
    setCurrentCategory(targetCategory)
    setGameState('playing')
  }, [currentPlayer.id, playerProgress, categoryOrder])

  // Début du tour du joueur
  useEffect(() => {
    if (gameState === 'preparing') {
      generateNewChallenge()
    }
  }, [gameState, generateNewChallenge])

  // Démarrage automatique du timer au début du challenge
  useEffect(() => {
    if (gameState === 'playing') {
      const timer = startTimer()
      return () => clearInterval(timer)
    }
  }, [gameState, startTimer])

  // Gestion du succès d'un challenge
  const completeChallenge = () => {
    setIsActive(false)
    setGameState('completed')
    setChallengesCompleted(prev => prev + 1)
    
    // Ajout du jeton de la catégorie actuelle
    const newTokenColor = CATEGORY_CONFIG[currentCategory].tokenColor
    const currentPlayerId = currentPlayer.id
    
    setPlayerTokens(prev => ({
      ...prev,
      [currentPlayerId]: [...(prev[currentPlayerId] || []), newTokenColor]
    }))
    
    // Mettre à jour la progression du joueur actuel
    const newProgress = (playerProgress[currentPlayerId] || 0) + 1
    
    setPlayerProgress(prev => ({
      ...prev,
      [currentPlayerId]: newProgress
    }))
    
    if (newProgress >= categoryOrder.length) {
      // Ce joueur a terminé TOUTES les catégories - il gagne !
      setIsAllCategoriesCompleted(true)
      setResultMessage(`🏆 ${currentPlayer.name} a terminé toutes les catégories ! VICTOIRE TOTALE !`)
      setShowResultDialog(true)
      setGameState('completed')
      setFinalResults([...players])
      setShowEndDialog(true)
      return
    } else {
      // Ce joueur a réussi sa catégorie et passe à la suivante, puis au tour du joueur suivant
      setResultMessage(`🎉 Bravo ${currentPlayer.name} ! Catégorie ${currentCategory} réussie ! Ton tour est fini, au tour du joueur suivant !`)
    }
    
    setShowResultDialog(true)
  }

  // Passage au joueur suivant après qu'un joueur ait joué (réussite ou échec)
  const nextPlayer = () => {
    // En cas d'échec, ajouter les gorgées de pénalité
    const wasSuccess = gameState === 'completed'
    const drinksToAdd = wasSuccess ? 0 : config.drinksOnFail
    
    if (drinksToAdd > 0) {
      setPlayers(prev => prev.map((p, i) => 
        i === currentPlayerIndex ? { ...p, drinks: p.drinks + drinksToAdd } : p
      ))
    }
    
    // Si toutes les catégories sont terminées par ce joueur  
    if (isAllCategoriesCompleted) {
      setGameState('completed')
      setFinalResults([...players])
      setShowEndDialog(true)
      return
    }

    // Dans tous les cas (succès ou échec), passer au joueur suivant
    // Le joueur passe son tour après avoir tenté UNE SEULE FOIS
    const nextIndex = (currentPlayerIndex + 1) % players.length
    setCurrentPlayerIndex(nextIndex)
    
    setGameState('preparing')
    setShowResultDialog(false)
  }

  // Redémarrage complet du jeu
  const restartGame = () => {
    setPlayers(
      initialPlayers.map(p => ({ 
        ...p, 
        score: 0,
        drinks: 0, 
        wins: 0,
        preferences: p.preferences || { color: 'bg-blue-500', icon: '👤' }
      }))
    )
    setCurrentPlayerIndex(0)
    setCurrentCategoryIndex(0)
    setChallengesCompleted(0)
    setChallengesFailed(0)
    setPlayerTokens({})
    setPlayerProgress({})
    setIsAllCategoriesCompleted(false)
    setGameState('preparing')
    setShowEndDialog(false)
    setIsActive(false)
    setTimeLeft(0)
  }

  const getChallengeCategoryConfig = (category: ChallengeCategory) => {
    return CATEGORY_CONFIG[category]
  }

  const getTimerColor = () => {
    if (timeLeft <= 5) return 'text-red-500 animate-pulse'
    if (timeLeft <= 10) return 'text-orange-500'
    return 'text-green-500'
  }

  // Calcul gagnant final (par nombre de jetons)
  const winner = useMemo(() => {
    if (gameState !== 'completed') return null
    return players.reduce((prev, current) => {
      const currentTokens = playerTokens[current.id]?.length || 0
      const prevTokens = playerTokens[prev.id]?.length || 0
      return currentTokens > prevTokens ? current : prev
    })
  }, [players, gameState, playerTokens])

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900 text-white">
      {showConfetti && <ReactConfetti />}
      
      <div className="container mx-auto max-w-4xl px-2 py-4 space-y-4">
        {/* Header */}
        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              🏍️ Trial Poursuite
            </h1>
            <p className="text-lg text-orange-200">
              {currentPlayer.name} - Catégorie {(playerProgress[currentPlayer.id] || 0) + 1}/{categoryOrder.length} - {getChallengeCategoryConfig(currentCategory).icon} {currentCategory} - Difficulté: {difficulty}
            </p>
          </div>
        </Card>

        {/* Zone de jeu principale */}
        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <div className="flex items-center justify-between mb-6">
            {/* Joueur actuel */}
            <div className="flex items-center space-x-3">
              <Avatar className="w-12 h-12 border-2 border-yellow-400">
                <AvatarImage src={currentPlayer.preferences?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold">
                  {currentPlayer.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold">
                  <PlayerName player={currentPlayer} />
                </div>
                <div className="text-sm text-yellow-200">À toi de relever le défi !</div>
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center space-x-2">
              <Clock className="w-6 h-6 text-yellow-400" />
              <span className={`text-2xl font-bold ${getTimerColor()}`}>
                {timeLeft}
              </span>
            </div>
          </div>

          {/* Défi actuel */}
          {currentChallenge && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="text-2xl mb-4">
                  {getChallengeCategoryConfig(currentCategory).icon} Défi {currentCategory}
                </div>
                <div className="text-xl mb-6 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent font-semibold">
                  {currentChallenge}
                </div>
              </div>
              
              {/* Boutons d'action */}
              <div className="flex justify-center space-x-4">
                {gameState === 'playing' && (
                  <>
                    <Button
                      onClick={completeChallenge}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Challenge Réussi !
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setIsActive(false)
                        setGameState('failed')
                        setChallengesFailed(prev => prev + 1)
                        setResultMessage(`💀 ${currentPlayer.name} a échoué le challenge ! Boit ${config.drinksOnFail} gorgées ! Ton tour est fini, au tour du joueur suivant !`)
                        setShowResultDialog(true)
                      }}
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3"
                    >
                      <XCircle className="w-5 h-5 mr-2" />
                      Challenge Non Réussi
                    </Button>
                  </>
                )}
                
                {gameState === 'failed' && (
                  <Button
                    onClick={() => setGameState('failed')}
                    size="lg"
                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3"
                  >
                    <XCircle className="w-5 h-5 mr-2" />
                    Il faudra boire !
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </Card>

        {/* Scoreboard */}
        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <h3 className="text-xl font-bold mb-4">Jetons des Joueurs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((player, index) => (
              <div 
                key={player.id} 
                className={`p-4 rounded-lg border-2 transition-all ${
                  index === currentPlayerIndex 
                    ? 'border-yellow-400 bg-yellow-400/10' 
                    : 'border-white/20 bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={player.preferences?.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold">
                      {player.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-semibold">
                      <PlayerName player={player} />
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center space-x-1 flex-wrap">
                        <span className="text-yellow-400 mr-2">Progression:</span>
                        <span className="text-cyan-400">{(playerProgress[player.id] || 0)}/{categoryOrder.length} catégories</span>
                      </div>
                      <div className="flex items-center space-x-1 flex-wrap">
                        <span className="text-yellow-400 mr-2">Jetons:</span>
                        {playerTokens[player.id]?.map((token, i) => (
                          <div key={i} className={`w-4 h-4 rounded-full ${'bg-' + token + '-500'} mr-1`} 
                               title={`Jeton ${token}`}></div>
                        )) || <span className="text-gray-400">Aucun jeton</span>}
                      </div>
                      {player.drinks > 0 && (
                        <div className="text-red-400">🍺 {player.drinks} gorgées</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Affichage du progrès des catégories du joueur actuel */}
          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <h4 className="text-lg font-semibold mb-3">Progrès de {currentPlayer.name}:</h4>
            <div className="flex flex-wrap gap-2">
              {categoryOrder.map((category, index) => {
                const categoryConfig = getChallengeCategoryConfig(category)
                const currentPlayerProgress = playerProgress[currentPlayer.id] || 0
                const isCompleted = index < currentPlayerProgress
                const isCurrent = index === currentPlayerProgress
                
                return (
                  <div key={category} className={`px-3 py-1 rounded-full text-white text-sm ${
                    isCompleted 
                      ? 'bg-green-500' 
                      : isCurrent 
                        ? 'bg-yellow-500' 
                        : 'bg-gray-600'
                  }`}>
                    <span className="mr-1">{categoryConfig.icon}</span>
                    {category} {isCompleted ? '✅' : isCurrent ? '🔥' : ''}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Boutons d'action */}
        <div className="flex justify-center space-x-4">
          <Button 
            onClick={onGameEnd}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <Home className="w-4 h-4 mr-2" />
            Quitter
          </Button>
          <Button 
            onClick={restartGame}
            className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recommencer
          </Button>
        </div>
      </div>

      {/* Dialog résultat challenge */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {gameState === 'completed' ? '🎉 Bravo !' : '💀 Échec !'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-lg">{resultMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={nextPlayer} className="w-full">
              Joueur suivant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog fin de partie */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl">
              🏆 Trial Completed !
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-6">
            {winner && (
              <div className="space-y-2">
                <p className="text-2xl">🥇 Champion Trial:</p>
                <div className="flex items-center justify-center space-x-3">
                  <Avatar className="w-16 h-16 border-4 border-yellow-400">
                    <AvatarImage src={winner.preferences?.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xl font-bold">
                      {winner.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-xl font-bold">
                      <PlayerName player={winner} />
                    </div>
                    <div className="text-yellow-400">{playerTokens[winner.id]?.length || 0} jetons</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-lg font-semibold">Résultats finals :</h4>
              <div className="space-y-2">
                {players
                  .sort((a, b) => {
                    const aTokens = playerTokens[a.id]?.length || 0
                    const bTokens = playerTokens[b.id]?.length || 0
                    return bTokens - aTokens
                  })
                  .map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded bg-white/10">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}</span>
                        <PlayerName player={player} />
                      </div>
                        <div className="text-right">
                          <div>{playerTokens[player.id]?.length || 0} jetons</div>
                          {player.drinks > 0 && (
                            <div className="text-red-400 text-sm">🍺 {player.drinks}</div>
                          )}
                        </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col space-y-2">
            <Button onClick={restartGame} className="w-full">
              Rejouer 
            </Button>
            <Button onClick={onGameEnd} variant="outline" className="w-full">
              Retour au menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
