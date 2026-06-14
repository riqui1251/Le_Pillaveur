"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlayerName } from '@/components/ui/PlayerName'
import ReactConfetti from 'react-confetti'
import { RefreshCw, Home, Clock, CheckCircle, XCircle } from 'lucide-react'

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
  updatePlayerStats?: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

type ChallengeCategory =
  | 'geographie'
  | 'divertissement'
  | 'histoire'
  | 'artsEtLitterature'
  | 'sciencesEtNature'
  | 'sportsEtLoisirs'

const CATEGORY_ORDER: ChallengeCategory[] = [
  'geographie',
  'divertissement',
  'histoire',
  'artsEtLitterature',
  'sciencesEtNature',
  'sportsEtLoisirs',
]

const DIFFICULTY_CONFIG = {
  facile: {
    timePerChallenge: 60,
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

const CATEGORY_CONFIG: Record<ChallengeCategory, {
  color: string
  order: number
  icon: string
  tokenColor: string
  neededTokenColor?: string
}> = {
  geographie: {
    color: 'bg-blue-500',
    order: 1,
    icon: '🌍',
    tokenColor: 'blue'
  },
  divertissement: {
    color: 'bg-red-500',
    order: 2,
    icon: '🎬',
    tokenColor: 'red',
    neededTokenColor: 'blue'
  },
  histoire: {
    color: 'bg-purple-500',
    order: 3,
    icon: '🏛️',
    tokenColor: 'purple',
    neededTokenColor: 'red'
  },
  artsEtLitterature: {
    color: 'bg-yellow-500',
    order: 4,
    icon: '📚',
    tokenColor: 'yellow',
    neededTokenColor: 'purple'
  },
  sciencesEtNature: {
    color: 'bg-green-500',
    order: 5,
    icon: '🔬',
    tokenColor: 'green',
    neededTokenColor: 'yellow'
  },
  sportsEtLoisirs: {
    color: 'bg-orange-500',
    order: 6,
    icon: '⚽',
    tokenColor: 'orange',
    neededTokenColor: 'green'
  }
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal', updatePlayerStats }: GameProps) {
  const t = useTranslations('games.trial-poursuite')
  const tc = useTranslations('common')
  const statsFlushedRef = useRef(false)

  const trialChallenges = useMemo(
    () => t.raw('challenges') as Record<ChallengeCategory, string[]>,
    [t]
  )

  const getCategoryLabel = useCallback(
    (category: ChallengeCategory) => t(`categories.${category}`),
    [t]
  )

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
  const [currentCategory, setCurrentCategory] = useState<ChallengeCategory>('geographie')
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
  const [unlockedCategories, setUnlockedCategories] = useState<ChallengeCategory[]>(['geographie'])
  const [playerProgress, setPlayerProgress] = useState<Record<string, number>>({})
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0)
  const [isAllCategoriesCompleted, setIsAllCategoriesCompleted] = useState(false)

  const config = DIFFICULTY_CONFIG[difficulty]
  const currentPlayer = players[currentPlayerIndex]

  const startTimer = useCallback(() => {
    setTimeLeft(config.timePerChallenge)
    setIsActive(true)

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setIsActive(false)
          setGameState('failed')
          setChallengesFailed(prevFailed => prevFailed + 1)
          setResultMessage(t('timeout', { name: currentPlayer.name, count: config.drinksOnFail }))
          setShowResultDialog(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return timer
  }, [config, currentPlayer.name, t])

  const generateNewChallenge = useCallback(() => {
    const currentPlayerId = currentPlayer.id
    const playerCurrentProgress = playerProgress[currentPlayerId] || 0

    if (playerCurrentProgress >= CATEGORY_ORDER.length) {
      setIsAllCategoriesCompleted(true)
      setGameState('completed')
      return
    }

    const targetCategory = CATEGORY_ORDER[playerCurrentProgress]
    const challenges = trialChallenges[targetCategory]
    const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)]

    setCurrentChallenge(randomChallenge)
    setCurrentCategory(targetCategory)
    setGameState('playing')
  }, [currentPlayer.id, playerProgress, trialChallenges])

  useEffect(() => {
    if (gameState === 'preparing') {
      generateNewChallenge()
    }
  }, [gameState, generateNewChallenge])

  useEffect(() => {
    if (gameState === 'playing') {
      const timer = startTimer()
      return () => clearInterval(timer)
    }
  }, [gameState, startTimer])

  const completeChallenge = () => {
    setIsActive(false)
    setGameState('completed')
    setChallengesCompleted(prev => prev + 1)

    const newTokenColor = CATEGORY_CONFIG[currentCategory].tokenColor
    const currentPlayerId = currentPlayer.id

    setPlayerTokens(prev => ({
      ...prev,
      [currentPlayerId]: [...(prev[currentPlayerId] || []), newTokenColor]
    }))

    const newProgress = (playerProgress[currentPlayerId] || 0) + 1

    setPlayerProgress(prev => ({
      ...prev,
      [currentPlayerId]: newProgress
    }))

    if (newProgress >= CATEGORY_ORDER.length) {
      setIsAllCategoriesCompleted(true)
      setResultMessage(t('victoryMessage', { name: currentPlayer.name }))
      setShowResultDialog(true)
      setGameState('completed')
      setFinalResults([...players])
      setShowEndDialog(true)
      return
    }

    setResultMessage(t('successMessage', {
      name: currentPlayer.name,
      category: getCategoryLabel(currentCategory),
    }))
    setShowResultDialog(true)
  }

  const failChallenge = () => {
    setIsActive(false)
    setGameState('failed')
    setChallengesFailed(prev => prev + 1)
    setResultMessage(t('failMessage', {
      name: currentPlayer.name,
      count: config.drinksOnFail,
    }))
    setShowResultDialog(true)
  }

  const nextPlayer = () => {
    const wasSuccess = gameState === 'completed'
    const drinksToAdd = wasSuccess ? 0 : config.drinksOnFail

    if (drinksToAdd > 0) {
      setPlayers(prev => prev.map((p, i) =>
        i === currentPlayerIndex ? { ...p, drinks: p.drinks + drinksToAdd } : p
      ))
    }

    if (isAllCategoriesCompleted) {
      setGameState('completed')
      setFinalResults([...players])
      setShowEndDialog(true)
      return
    }

    const nextIndex = (currentPlayerIndex + 1) % players.length
    setCurrentPlayerIndex(nextIndex)

    setGameState('preparing')
    setShowResultDialog(false)
  }

  const handleFinish = () => {
    if (!statsFlushedRef.current) {
      statsFlushedRef.current = true
      players.forEach(p => {
        updatePlayerStats?.(p.id, 'trial-poursuite', {
          gamesPlayed: 1,
          totalDrinks: p.drinks,
        })
      })
    }
    onGameEnd()
  }

  const restartGame = () => {
    statsFlushedRef.current = false
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

  const winner = useMemo(() => {
    if (gameState !== 'completed') return null
    return players.reduce((prev, current) => {
      const currentTokens = playerTokens[current.id]?.length || 0
      const prevTokens = playerTokens[prev.id]?.length || 0
      return currentTokens > prevTokens ? current : prev
    })
  }, [players, gameState, playerTokens])

  const currentProgress = playerProgress[currentPlayer.id] || 0
  const categoryLabel = getCategoryLabel(currentCategory)
  const difficultyLabel = t(`difficulties.${difficulty}`)

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900 text-white">
      {showConfetti && <ReactConfetti />}

      <div className="container mx-auto max-w-4xl px-2 py-4 space-y-4">
        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              🏍️ {t('title')}
            </h1>
            <p className="text-lg text-orange-200">
              {t('headerStatus', {
                name: currentPlayer.name,
                current: currentProgress + 1,
                total: CATEGORY_ORDER.length,
                icon: getChallengeCategoryConfig(currentCategory).icon,
                category: categoryLabel,
                difficulty: difficultyLabel,
              })}
            </p>
          </div>
        </Card>

        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <div className="flex items-center justify-between mb-6">
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
                <div className="text-sm text-yellow-200">{t('yourTurn')}</div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Clock className="w-6 h-6 text-yellow-400" />
              <span className={`text-2xl font-bold ${getTimerColor()}`}>
                {timeLeft}
              </span>
            </div>
          </div>

          {currentChallenge && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="text-2xl mb-4">
                  {getChallengeCategoryConfig(currentCategory).icon} {t('challengeLabel', { category: categoryLabel })}
                </div>
                <div className="text-xl mb-6 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent font-semibold">
                  {currentChallenge}
                </div>
              </div>

              <div className="flex justify-center space-x-4">
                {gameState === 'playing' && (
                  <>
                    <Button
                      onClick={completeChallenge}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      {t('challengeSuccess')}
                    </Button>

                    <Button
                      onClick={failChallenge}
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3"
                    >
                      <XCircle className="w-5 h-5 mr-2" />
                      {t('challengeFailed')}
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
                    {t('willDrink')}
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </Card>

        <Card className="bg-black/20 backdrop-blur-sm border-white/20 p-6">
          <h3 className="text-xl font-bold mb-4">{t('playerTokens')}</h3>
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
                        <span className="text-yellow-400 mr-2">{t('progression')}</span>
                        <span className="text-cyan-400">
                          {t('categoriesCount', {
                            current: playerProgress[player.id] || 0,
                            total: CATEGORY_ORDER.length,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 flex-wrap">
                        <span className="text-yellow-400 mr-2">{t('tokens')}</span>
                        {playerTokens[player.id]?.map((token, i) => (
                          <div
                            key={i}
                            className={`w-4 h-4 rounded-full ${'bg-' + token + '-500'} mr-1`}
                            title={t('tokensCount', { count: 1 })}
                          />
                        )) || <span className="text-gray-400">{t('noTokens')}</span>}
                      </div>
                      {player.drinks > 0 && (
                        <div className="text-red-400">{t('sips', { count: player.drinks })}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <h4 className="text-lg font-semibold mb-3">
              {t('playerProgressTitle', { name: currentPlayer.name })}
            </h4>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map((category, index) => {
                const categoryConfig = getChallengeCategoryConfig(category)
                const currentPlayerProgress = playerProgress[currentPlayer.id] || 0
                const isCompleted = index < currentPlayerProgress
                const isCurrent = index === currentPlayerProgress
                const label = getCategoryLabel(category)

                return (
                  <div
                    key={category}
                    className={`px-3 py-1 rounded-full text-white text-sm ${
                      isCompleted
                        ? 'bg-green-500'
                        : isCurrent
                          ? 'bg-yellow-500'
                          : 'bg-gray-600'
                    }`}
                  >
                    <span className="mr-1">{categoryConfig.icon}</span>
                    {label} {isCompleted ? '✅' : isCurrent ? '🔥' : ''}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        <div className="flex justify-center space-x-4">
          <Button
            onClick={handleFinish}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <Home className="w-4 h-4 mr-2" />
            {tc('quit')}
          </Button>
          <Button
            onClick={restartGame}
            className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('restart')}
          </Button>
        </div>
      </div>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {gameState === 'completed' ? t('dialogSuccessTitle') : t('dialogFailTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-lg">{resultMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={nextPlayer} className="w-full">
              {t('nextPlayer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl">
              {t('gameCompletedTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-6">
            {winner && (
              <div className="space-y-2">
                <p className="text-2xl">{t('championLabel')}</p>
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
                    <div className="text-yellow-400">
                      {t('tokensCount', { count: playerTokens[winner.id]?.length || 0 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-lg font-semibold">{t('finalResults')}</h4>
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
                        <div>{t('tokensCount', { count: playerTokens[player.id]?.length || 0 })}</div>
                        {player.drinks > 0 && (
                          <div className="text-red-400 text-sm">{t('sips', { count: player.drinks })}</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col space-y-2">
            <Button onClick={restartGame} className="w-full">
              {tc('replay')}
            </Button>
            <Button onClick={handleFinish} variant="outline" className="w-full">
              {t('backToMenu')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
