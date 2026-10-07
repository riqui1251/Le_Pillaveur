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
import { EndConfetti } from '@/components/online/EndConfetti'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { RefreshCw, Home, Clock, CheckCircle, XCircle } from 'lucide-react'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'

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

type GameState = 'preparing' | 'playing' | 'completed' | 'failed'

// Reprise de partie : six catégories à franchir par joueur, chacun son tour —
// une course qui dure, et que le moindre retour arrière effaçait. L'état est du
// JSON pur ; les profils n'y sont pas copiés (avatars compris) : la sauvegarde
// ne porte que des identifiants et des gorgées, le reste revient de la table.
const SAVE_ID = 'trial-poursuite'
const SAVE_VERSION = 1

type TrialSave = {
  /** Difficulté de la partie sauvegardée : la reprise la garde, même si la page a été rechargée sur « normal ». */
  difficulty: Difficulty
  /** Ordre de passage de la partie : `currentPlayerIndex` s'y réfère. */
  playerIds: string[]
  drinksByPlayer: Record<string, number>
  currentPlayerIndex: number
  currentChallenge: string
  currentCategory: ChallengeCategory
  /** Secondes restantes au chrono : un rechargement n'offre pas de temps en plus. */
  timeLeft: number
  gameState: GameState
  challengesCompleted: number
  challengesFailed: number
  playerTokens: Record<string, string[]>
  playerProgress: Record<string, number>
  /** Fenêtre de résultat ouverte : les gorgées d'un échec ne sont comptées qu'au « joueur suivant ». */
  showResultDialog: boolean
  resultMessage: string
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal', updatePlayerStats }: GameProps) {
  const t = useTranslations('games.trial-poursuite')
  const tc = useTranslations('common')
  const statsFlushedRef = useRef(false)
  // La difficulté vient de la page, sauf reprise : la partie continue alors avec
  // la sienne (la page, rechargée ou quittée pour l'onglet de configuration —
  // qui démonte le jeu —, peut en afficher une autre).
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty>(difficulty)
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<TrialSave>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, initialPlayers)
  )
  /** Chrono à reprendre au prochain démarrage du minuteur (reprise d'un défi en cours). */
  const resumeTimeLeftRef = useRef<number | null>(null)

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
  const [gameState, setGameState] = useState<GameState>('preparing')
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

  const config = DIFFICULTY_CONFIG[activeDifficulty]
  const currentPlayer = players[currentPlayerIndex]

  const startTimer = useCallback(() => {
    // Reprise d'un défi en cours : le chrono repart d'où il s'était arrêté.
    const resumedTimeLeft = resumeTimeLeftRef.current
    resumeTimeLeftRef.current = null
    setTimeLeft(resumedTimeLeft ?? config.timePerChallenge)
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

  // Démarrage — jamais tant qu'une reprise est proposée : le joueur doit pouvoir
  // dire non avant qu'un défi ne soit tiré et que le chrono ne tourne.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    setStarted(true)
  }, [session.ready, session.pending, started])

  useEffect(() => {
    if (started && gameState === 'preparing') {
      generateNewChallenge()
    }
  }, [started, gameState, generateNewChallenge])

  useEffect(() => {
    if (gameState === 'playing') {
      const timer = startTimer()
      return () => clearInterval(timer)
    }
  }, [gameState, startTimer])

  // Sauvegarde continue tant que la course n'est pas gagnée (le chrono compris :
  // une écriture par seconde pendant un défi, quelques centaines d'octets).
  useEffect(() => {
    if (!started || showEndDialog || isAllCategoriesCompleted) return
    session.save({
      difficulty: activeDifficulty,
      playerIds: players.map(p => p.id),
      drinksByPlayer: Object.fromEntries(players.map(p => [p.id, p.drinks])),
      currentPlayerIndex,
      currentChallenge,
      currentCategory,
      timeLeft,
      gameState,
      challengesCompleted,
      challengesFailed,
      playerTokens,
      playerProgress,
      showResultDialog,
      resultMessage,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, showEndDialog, isAllCategoriesCompleted, activeDifficulty, players, currentPlayerIndex,
      currentChallenge, currentCategory, timeLeft, gameState, challengesCompleted, challengesFailed,
      playerTokens, playerProgress, showResultDialog, resultMessage])

  // Course gagnée : une partie terminée ne doit rien laisser derrière elle.
  useEffect(() => {
    if (!started || !(showEndDialog || isAllCategoriesCompleted)) return
    session.clear()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, showEndDialog, isAllCategoriesCompleted])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Table différente : les jetons et les gorgées iraient à des gens qui n'ont
    // pas joué cette course. On jette la sauvegarde, une partie neuve démarre.
    if (!isSameLocalTable(saved.playerIds, initialPlayers)) {
      session.discard()
      return
    }
    // Réhydratation dans l'ordre de passage sauvegardé : les profils viennent
    // de la table courante, la sauvegarde ne connaît que des identifiants.
    const byId = new Map(initialPlayers.map(p => [p.id, p]))
    const restoredPlayers: GamePlayer[] = saved.playerIds
      .map(id => byId.get(id))
      .filter((p): p is BasePlayer => Boolean(p))
      .map(p => ({
        ...p,
        score: 0,
        drinks: saved.drinksByPlayer[p.id] ?? 0,
        wins: 0,
        preferences: p.preferences || { color: 'bg-blue-500', icon: '👤' }
      }))
    const restoredIndex = Math.min(Math.max(0, saved.currentPlayerIndex), restoredPlayers.length - 1)
    // Défi en cours : le chrono reprend là où il en était (sinon il repartirait plein).
    resumeTimeLeftRef.current = saved.gameState === 'playing' && saved.timeLeft > 0 ? saved.timeLeft : null
    setActiveDifficulty(saved.difficulty in DIFFICULTY_CONFIG ? saved.difficulty : activeDifficulty)
    setPlayers(restoredPlayers)
    setCurrentPlayerIndex(restoredIndex)
    setCurrentChallenge(saved.currentChallenge)
    setCurrentCategory(saved.currentCategory)
    setTimeLeft(saved.timeLeft)
    setIsActive(false)
    setChallengesCompleted(saved.challengesCompleted)
    setChallengesFailed(saved.challengesFailed)
    setPlayerTokens(saved.playerTokens)
    setPlayerProgress(saved.playerProgress)
    setIsAllCategoriesCompleted(false)
    setResultMessage(saved.resultMessage)
    setShowResultDialog(saved.showResultDialog)
    setShowEndDialog(false)
    setGameState(saved.gameState)
    setStarted(true)
  }

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
    // Quitter clôt la partie : rien à proposer de reprendre la prochaine fois.
    session.clear()
    onGameEnd()
  }

  const restartGame = () => {
    session.clear()
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
  const difficultyLabel = t(`difficulties.${activeDifficulty}`)

  // Tant que le stockage n'est pas lu, ni plateau ni proposition : pas de
  // plateau qui clignote avant l'écran de reprise.
  if (!session.ready) return null

  if (session.pending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4 text-white">
        <div className="w-full max-w-sm space-y-4 rounded-3xl border border-amber-500/20 bg-amber-950/20 p-6 text-center">
          <h2 className="text-xl font-extrabold">{tc('resumeGame.title')}</h2>
          <p className="text-sm text-white/55">{tc('resumeGame.body')}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={resumeSavedGame}
              className="min-h-[44px] w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-sm font-bold text-white hover:from-amber-400 hover:to-orange-500"
            >
              {tc('resumeGame.resume')}
            </button>
            <button
              type="button"
              onClick={session.discard}
              className="min-h-[44px] w-full rounded-2xl border border-white/[0.15] bg-white/[0.05] py-3 text-sm font-semibold text-white/70 hover:bg-white/10"
            >
              {tc('resumeGame.newGame')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900 text-white">
      {/* Rideau de fin (200 pièces recyclées, l'ancien défaut) ; z-[2] : au-dessus
          des cartes positionnées, comme le posait react-confetti. `relative` sur
          la racine : le canevas se borne au jeu au lieu de s'ancrer sur la page
          entière (et de grandir avec elle). */}
      {showConfetti && <EndConfetti rain pieces={200} className="z-[2]" />}

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
        {/* Hauteur bornée et défilante : classement + avis de première partie
            peuvent dépasser un petit écran, et le pied (Rejouer) doit rester atteignable. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-gray-900 border-white/20">
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
          <FirstGameFeedbackCard mode="local" gameId="trial-poursuite" />
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
