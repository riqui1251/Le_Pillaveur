/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowUp, ArrowDown, RotateCcw, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import useScreenSize from '@/hooks/useScreenSize'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import {
  acknowledgeHiLoMiss,
  advanceHiLoTurn,
  currentHiLoPlayerId,
  DECK_SIZE,
  HI_LO_SAVE_ID,
  HI_LO_SAVE_VERSION,
  hiLoCardsPlayed,
  resolveHiLoGuess,
  restoreHiLoSave,
  startHiLoGame,
  toHiLoSave,
  type HiLoEnd,
  type HiLoGuess,
  type HiLoSave,
  type HiLoState,
} from '@/lib/hi-lo/engine'
import { GameMode } from '../page'
import { PlayerName } from '@/components/ui/PlayerName'

// Propriétés du composant Game
interface GameProps {
  players: Player[]
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number, totalDrinks?: number, wins?: number }) => void
  gameMode: GameMode
}

// Fonction pour obtenir la classe CSS de l'effet spécial du joueur
const getSpecialEffectClass = (effect: string | null | undefined): string => {
  if (!effect) return '';

  switch (effect) {
    case 'red': return 'special-player-name-red';
    case 'blue': return 'special-player-name-blue';
    case 'rainbow': return 'special-player-name-rainbow';
    case 'gold': return 'special-player-name-gold';
    case 'fire': return 'special-player-name-fire';
    case 'neon': return 'special-player-name-neon';
    default: return '';
  }
}

// Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
const isSpecialPlayer = (player: any): boolean => {
  if (!player) return false;

  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (player?.preferences?.specialEffect) {
    return true;
  }

  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = typeof player === 'string'
    ? player.toLowerCase()
    : player?.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
}

// Durée de l'animation de retournement, puis délai avant le tour suivant après une bonne réponse.
const FLIP_MS = 600
const AUTO_NEXT_MS = 1500

export default function Game({ players, onGameEnd, updatePlayerStats, gameMode }: GameProps) {
  const t = useTranslations('games.hi-lo')
  const tc = useTranslations('common')
  const compliments = t.raw('compliments') as string[]
  const debMessages = t.raw('debMessages') as string[]

  // État pour vérifier si le composant est monté (côté client)
  const [isMounted, setIsMounted] = useState(false);

  // La partie (paquet, mise, gorgées, tour, fin) vit dans le moteur pur
  // src/lib/hi-lo/engine.ts ; ce composant ne garde que l'affichage, les
  // fenêtres et les délais d'animation.
  const [game, setGame] = useState<HiLoState | null>(null)
  const [showGameOver, setShowGameOver] = useState(false)
  const [showIncorrectDialog, setShowIncorrectDialog] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  // Indices pour les messages aléatoires (pour éviter les problèmes d'hydratation)
  const [complimentIndex, setComplimentIndex] = useState(0)
  const [debMessageIndex, setDebMessageIndex] = useState(0)

  const { isMobile } = useScreenSize();
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<HiLoSave>(HI_LO_SAVE_ID, HI_LO_SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  /** Une partie ne doit être créditée qu'une fois : plusieurs chemins de fin
   *  (5 cartes identiques, objectif atteint, table vidée) peuvent y mener. */
  const gameCountedRef = useRef(false)
  /** Retournement en cours. Une relance pendant l'animation l'annule : sans
   *  cela, le verdict de l'ancienne partie retombait sur la nouvelle. */
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Joueurs encore en jeu (traversée), réhydratés depuis la table : le moteur
  // ne connaît que des identifiants.
  const activePlayers = useMemo(
    () =>
      (game?.activePlayerIds ?? [])
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p)),
    [game?.activePlayerIds, players]
  )

  // Vérifier si le composant est monté (côté client)
  useEffect(() => {
    setIsMounted(true);

    // Initialiser les indices aléatoires une seule fois après le montage
    setComplimentIndex(Math.floor(Math.random() * compliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }, []);

  // Initialisation du jeu — on ne distribue rien tant qu'une reprise est
  // proposée : c'est le joueur qui tranche.
  useEffect(() => {
    if (!isMounted || !session.ready || session.pending || started) return
    initializeGame();
    setStarted(true)
  }, [isMounted, session.ready, session.pending, started]);

  // Sauvegarde continue : un onglet recyclé par le navigateur ne coûte plus la partie.
  useEffect(() => {
    if (!started || !game || game.gameOver) return
    session.save(toHiLoSave(game))
  }, [started, game]);

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Une sauvegarde d'un autre mode de jeu OU d'une autre table n'est pas
    // rejouable ici : reprendre donnerait un index de joueur hors bornes et
    // créditerait des gorgées à des gens qui n'ont pas joué.
    if (saved.gameMode !== gameMode || !isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    // Réhydratation : les profils viennent de la prop, la sauvegarde ne
    // connaît que des identifiants. Illisible → partie neuve, pas d'écran planté.
    const restored = restoreHiLoSave(saved, players.map(p => p.id))
    if (!restored) {
      session.discard()
      return
    }
    setGame(restored)
    setShowGameOver(false)
    setShowIncorrectDialog(false)
    setIsFlipping(false)
    setIsProcessing(false)
    setStarted(true)
  }

  // Effet pour passer automatiquement au tour suivant après un délai en cas de bonne réponse
  useEffect(() => {
    if (!isMounted) return;

    if (game?.showResult && game.isCorrect && !isProcessing) {
      setIsProcessing(true)
      const timer = setTimeout(() => {
        nextTurn()
        setIsProcessing(false)
      }, AUTO_NEXT_MS)

      return () => clearTimeout(timer)
    }
  }, [game?.showResult, game?.isCorrect, isMounted]);

  const rollMessageIndices = () => {
    setComplimentIndex(Math.floor(Math.random() * compliments.length));
    setDebMessageIndex(Math.floor(Math.random() * debMessages.length));
  }

  const cancelReveal = () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }

  // Initialiser le jeu
  const initializeGame = () => {
    // Nouvelle partie : elle a le droit d'être comptée à son tour.
    gameCountedRef.current = false
    cancelReveal()
    setGame(startHiLoGame({ mode: gameMode, playerIds: players.map(p => p.id), previous: game }))
    setShowIncorrectDialog(false)
    setIsFlipping(false)
    setIsProcessing(false)

    // Générer de nouveaux indices aléatoires pour les messages
    if (isMounted) rollMessageIndices()
  }

  // Gérer la prédiction du joueur
  const handleGuess = (guess: HiLoGuess) => {
    if (!game || isFlipping || isProcessing) return
    const outcome = resolveHiLoGuess(game, guess)
    if (!outcome) return

    // Carte tirée face cachée, puis animation de retournement
    setGame(outcome.drawn)
    setIsFlipping(true)

    // Attendre que l'animation soit terminée avant de montrer le résultat
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null
      setGame(outcome.resolved)
      setIsFlipping(false)
      if (outcome.end) endGame(outcome.end)
      if (outcome.missDialog) setShowIncorrectDialog(true)
    }, FLIP_MS)
  }

  // Fermer la fenêtre de mauvais choix : la mise repart à 1 (sauf égalité non
  // annoncée en traversée, où le cumul est conservé)
  const closeIncorrectDialog = () => {
    setShowIncorrectDialog(false)
    if (game) setGame(acknowledgeHiLoMiss(game))
  }

  // Passer au tour suivant
  const nextTurn = () => {
    if (!game) return
    const turn = advanceHiLoTurn(game, showIncorrectDialog)
    if (turn.state !== game) setGame(turn.state)
    if (turn.end) endGame(turn.end)

    // Générer de nouveaux indices aléatoires pour les messages
    if (turn.advanced && isMounted) rollMessageIndices()
  }

  // Terminer le jeu : fenêtre de fin, statistiques (une seule fois), sauvegarde effacée
  const endGame = (end: HiLoEnd) => {
    setShowGameOver(true)
    if (gameCountedRef.current) return
    gameCountedRef.current = true

    // Mettre à jour les statistiques des joueurs
    end.results.forEach(({ playerId, drinks, won }) => {
      updatePlayerStats(playerId, 'hi-lo', {
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        totalDrinks: drinks
      })
    })

    // Une partie terminée ne doit rien laisser derrière elle.
    session.clear()
  }

  // Redémarrer le jeu
  const restartGame = () => {
    // Fermer la fenêtre de fin de partie
    setShowGameOver(false)
    initializeGame()
  }

  // Quitter le jeu
  const quitGame = () => {
    onGameEnd()
  }

  // Style de carte adapté au thème sombre
  const getCardStyle = (color: string) => {
    return {
      backgroundColor: 'white',
      color: color === 'red' ? '#e53e3e' : '#1a202c',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: '2px solid',
      borderColor: color === 'red' ? '#e53e3e' : '#1a202c'
    }
  }

  // Si le composant n'est pas encore monté (côté client), afficher un état de chargement ou rien
  if (!isMounted || !session.ready) {
    return <div className="p-6 text-center">{t('loading')}</div>;
  }

  if (session.pending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <h2 className="text-xl font-extrabold">{tc('resumeGame.title')}</h2>
          <p className="text-sm opacity-60">{tc('resumeGame.body')}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={resumeSavedGame} className="w-full">{tc('resumeGame.resume')}</Button>
            <Button onClick={session.discard} variant="outline" className="w-full">{tc('resumeGame.newGame')}</Button>
          </div>
        </div>
      </div>
    );
  }

  // Première donne pas encore distribuée (un rendu, le temps de l'effet d'initialisation)
  if (!game) {
    return <div className="p-6 text-center">{t('loading')}</div>;
  }

  const {
    deck,
    currentCard,
    nextCard,
    currentPlayerIndex,
    drinkCounter,
    gameResults,
    sameCardCount,
    correctGuessesInRow,
    targetGuesses,
    gameOver,
    showResult,
    isCorrect,
    isUnguessedEqual,
  } = game

  // Fonction pour obtenir un message personnalisé pour le joueur actuel
  const getPersonalizedMessage = (player: Player): string => {
    if (!player || !player.name) return t('drinkMessageDefault', { name: tc('players'), count: drinkCounter });

    const name = player.name.toLowerCase();

    if (name === 'sim' || name === 'riqui') {
      const compliment = compliments[complimentIndex];
      return t('drinkMessageSpecial', { compliment, name: player.name, count: drinkCounter });
    }
    if (name === 'deb') {
      const message = debMessages[debMessageIndex];
      return t('drinkMessageDeb', { name: player.name, count: drinkCounter, message });
    }

    return t('drinkMessageDefault', { name: player.name, count: drinkCounter });
  }

  // Obtenir le joueur actuel (toute la table en standard, joueurs encore en jeu en traversée)
  const currentPlayerId = currentHiLoPlayerId(game)
  const currentPlayer = currentPlayerId ? players.find(p => p.id === currentPlayerId) : undefined;
  const specialEffectClass = currentPlayer ? getSpecialEffectClass(currentPlayer?.preferences?.specialEffect) : '';

  const cardsPlayed = hiLoCardsPlayed(game)

  const headerRight = (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold">{t('sipsHeader', { count: drinkCounter })}</span>
        <span className="text-[10px] text-gray-400">{t('cardsPlayed', { played: cardsPlayed })}</span>
      </div>
      <Button variant="outline" size="icon" onClick={restartGame} aria-label={t('restart')}>
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )

  const actionBar = !gameOver ? (
    !showResult ? (
      <div className="flex w-full justify-center gap-2">
        <Button onClick={() => handleGuess('higher')} variant="outline" className="flex-1 max-w-[10rem]" disabled={isFlipping || isProcessing}>
          <ArrowUp className="mr-1 h-4 w-4" />
          {t('higher')}
        </Button>
        <Button onClick={() => handleGuess('equal')} variant="outline" className="flex-1 max-w-[8rem]" disabled={isFlipping || isProcessing}>
          <span className="mr-1">=</span>
          {t('equal')}
        </Button>
        <Button onClick={() => handleGuess('lower')} variant="outline" className="flex-1 max-w-[10rem]" disabled={isFlipping || isProcessing}>
          <ArrowDown className="mr-1 h-4 w-4" />
          {t('lower')}
        </Button>
      </div>
    ) : !isCorrect ? (
      <Button onClick={nextTurn} className="mx-auto w-full max-w-xs">{tc('next')}</Button>
    ) : (
      <div className="w-full text-center font-semibold text-green-500">{t('correctNext')}</div>
    )
  ) : null

  return (
    <>
    <GameShell title={t('title')} onBack={quitGame} headerRight={headerRight} actionBar={actionBar} maxWidth={760}>
        {gameMode === 'traversee' && (
          <div className="mb-2 text-center text-sm">
            <span className="font-medium">{t('traverseeMode')}</span>
            <span className="ml-2">{t('traverseeGoal', { current: correctGuessesInRow, target: targetGuesses })}</span>
          </div>
        )}

        {gameMode === 'traversee' && (
          <div className="mb-4 flex gap-2 flex-wrap justify-center">
            {players.map(player => {
              const isActive = activePlayers.some(p => p.id === player.id);
              return (
                <div 
                  key={player.id} 
                  className={`p-1 px-2 rounded-full text-xs flex items-center gap-1 ${
                    isActive ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  <PlayerName player={player} />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col items-center space-y-6">
          {/* Joueur actuel */}
          {currentPlayer && (
            <div className="flex items-center space-x-2 mb-4">
              <Avatar className={`h-10 w-10 ${isSpecialPlayer(currentPlayer) ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                <AvatarImage src={currentPlayer?.preferences?.avatar} />
                <AvatarFallback className={currentPlayer?.preferences?.color || 'bg-primary'}>
                  {currentPlayer?.preferences?.icon || (currentPlayer?.name ? currentPlayer.name.charAt(0).toUpperCase() : '?')}
                </AvatarFallback>
              </Avatar>
              <PlayerName player={currentPlayer} className={`font-semibold ${specialEffectClass}`} />
            </div>
          )}

          {/* Cartes */}
          <div className="flex justify-center items-center gap-3 sm:gap-8">
            {/* Carte actuelle */}
            {currentCard && (
              <div 
                className="w-[clamp(5rem,26vw,8rem)] h-[clamp(7.5rem,39vw,12rem)] rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold relative"
                style={getCardStyle(currentCard.color)}
              >
                <div>{currentCard.value}</div>
                <div>{currentCard.suit}</div>
              </div>
            )}

            {/* Carte suivante avec animation */}
            <div className="relative w-[clamp(5rem,26vw,8rem)] h-[clamp(7.5rem,39vw,12rem)]">
              {isFlipping ? (
                <motion.div
                  className="absolute w-full h-full"
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="absolute w-full h-full backface-hidden rounded-lg flex items-center justify-center text-gray-400 bg-white border-2 border-gray-300">
                    ?
                  </div>
                  <div 
                    className="absolute w-full h-full backface-hidden rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold"
                    style={{
                      transform: 'rotateY(180deg)',
                      backgroundColor: 'white',
                      color: nextCard?.color === 'red' ? '#e53e3e' : '#1a202c',
                      border: '2px solid',
                      borderColor: nextCard?.color === 'red' ? '#e53e3e' : '#1a202c'
                    }}
                  >
                    {nextCard && (
                      <>
                        <div>{nextCard.value}</div>
                        <div>{nextCard.suit}</div>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : showResult ? (
                <div 
                  className="w-full h-full rounded-lg flex flex-col items-center justify-center text-[clamp(1.5rem,8vw,2.25rem)] font-bold"
                  style={nextCard ? getCardStyle(nextCard.color) : {}}
                >
                  {nextCard && (
                    <>
                      <div>{nextCard.value}</div>
                      <div>{nextCard.suit}</div>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-full h-full rounded-lg flex items-center justify-center text-gray-400 bg-white border-2 border-gray-300">
                  ?
                </div>
              )}
            </div>
          </div>

          {/* Indicateur de progression du paquet de cartes */}
          <div className="w-full max-w-xs mt-2">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                style={{ 
                  width: `${(cardsPlayed / DECK_SIZE) * 100}%`,
                  backgroundColor: deck.length < 10 ? '#f56565' : '#3b82f6' 
                }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1 text-gray-500">
              <span>{t('cardsPlayedLabel', { count: cardsPlayed })}</span>
              <span>{t('cardsLeftLabel', { count: deck.length + (nextCard ? 1 : 0) })}</span>
            </div>
          </div>

        </div>
    </GameShell>

      {/* Dialogue de fin de jeu */}
      <Dialog open={showGameOver} onOpenChange={setShowGameOver}>
        <DialogContent className={`${isMobile ? 'w-[95%] max-w-lg p-3 sm:p-6' : ''}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
              {gameMode === 'traversee' && correctGuessesInRow >= targetGuesses
                ? t('gameOver.congrats')
                : sameCardCount[`${nextCard?.value}-${nextCard?.suit}`] > 4
                  ? t('gameOver.fiveCards')
                  : t('gameOver.end')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {gameMode === 'traversee' && correctGuessesInRow >= targetGuesses && (
              <p className="font-medium text-green-600">
                {t('gameOver.goalReached', { count: targetGuesses })}
              </p>
            )}

            {sameCardCount[`${nextCard?.value}-${nextCard?.suit}`] > 4 && (
              <p className="font-medium text-orange-600">
                {t('gameOver.fiveSame', { value: nextCard?.value ?? '', suit: nextCard?.suit ?? '' })}
              </p>
            )}

            <h3 className="font-semibold">{t('gameOver.results')}</h3>
            <ul className={`space-y-2 ${isMobile ? 'max-h-[40vh] overflow-y-auto pr-2' : ''}`}>
              {players.map(player => {
                const specialEffectClass = getSpecialEffectClass(player?.preferences?.specialEffect);
                const isSpecial = isSpecialPlayer(player);
                return (
                  <li key={player.id} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <Avatar className={`h-8 w-8 ${isSpecial ? 'border-2 border-red-500 shadow-lg shadow-red-500/50' : ''}`}>
                        <AvatarImage src={player?.preferences?.avatar} />
                        <AvatarFallback className={player?.preferences?.color || 'bg-primary'}>
                          {player?.preferences?.icon || (player?.name ? player.name.charAt(0).toUpperCase() : '?')}
                        </AvatarFallback>
                      </Avatar>
                      <PlayerName player={player} className={`${specialEffectClass || ''} ${isMobile ? 'text-sm' : ''}`} />
                    </div>
                    <span>{t('gameOver.sipsResult', { count: gameResults[player.id] || 0 })}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          
          <DialogFooter className={`flex ${isMobile ? 'flex-col space-y-2' : 'space-x-2'}`}>
            <Button 
              variant="outline" 
              onClick={restartGame}
              className={isMobile ? 'w-full' : ''}
            >
              {tc('replay')}
            </Button>
            <Button onClick={quitGame} className={isMobile ? 'w-full' : ''}>
              {tc('quit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue pour mauvais choix */}
      <Dialog open={showIncorrectDialog} onOpenChange={setShowIncorrectDialog}>
        <DialogContent className={`bg-red-50 border-red-200 ${isMobile ? 'w-[95%] max-w-lg p-4' : ''}`}>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {isUnguessedEqual && gameMode === 'traversee' ? t('wrong.unguessedEqual') : t('wrong.title')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {gameMode === 'standard' ? (
              <p className="text-center text-lg font-semibold text-black">
                {currentPlayer ? getPersonalizedMessage(currentPlayer) : t('drinkMessageDefault', { name: tc('players'), count: drinkCounter })}
              </p>
            ) : (
              <div className="text-center text-black">
                {isUnguessedEqual ? (
                  <p className="text-lg font-semibold mb-2">
                    {t('wrong.traverseeEqual')}
                  </p>
                ) : (
                  <p className="text-lg font-semibold mb-2">
                    {t('wrong.traverseeAllDrink', { count: drinkCounter })}
                  </p>
                )}
                <p className="text-sm">
                  {!isUnguessedEqual && `${t('wrong.streakReset')} `}
                  {activePlayers.length > 1 &&
                    t('wrong.nextTurn', { name: activePlayers[(currentPlayerIndex + 1) % activePlayers.length]?.name ?? '' })}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={closeIncorrectDialog} className={isMobile ? 'w-full' : ''}>
              {tc('understood')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
    </>
  )
} 