"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlayerName } from '@/components/ui/PlayerName'
import { EndConfetti } from '@/components/online/EndConfetti'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { RefreshCw, Trophy, Home, Skull, Heart, Star } from 'lucide-react'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import {
  advancePenduGame,
  applyPenduHint,
  createPenduGame,
  DIFFICULTY_CONFIG,
  evaluatePenduRound,
  expirePenduTimer,
  guessPenduLetter,
  HINT_COST_SECONDS,
  MAX_HINTS,
  PENDU_ALPHABET,
  PENDU_SAVE_ID,
  PENDU_SAVE_VERSION,
  penduDisplayWord,
  penduHangmanStage,
  penduWinner,
  restorePenduSave,
  TIMEOUT_MARK,
  toPenduSave,
  type PenduDifficulty,
  type PenduSave,
  type PenduState,
} from '@/lib/pendu/engine'

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
  difficulty?: PenduDifficulty
  updatePlayerStats?: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

// Types de styles de pendu
type HangmanStyle = 'classic' | 'modern' | 'space'

// Types de thèmes de couleur
type ColorTheme = 'default' | 'ocean' | 'sunset' | 'forest' | 'galaxy' | 'fire' | 'ice'

// Configuration des thèmes de couleur (styles CSS uniquement — noms via i18n)
const COLOR_THEME_STYLES = {
  default: {
    background: 'from-purple-900 via-blue-900 to-indigo-900',
    cardBg: 'bg-white/10',
    cardBorder: 'border-white/20',
    title: 'from-yellow-400 to-orange-400',
    subtitle: 'text-purple-200',
    wordText: 'from-green-400 to-blue-400',
    category: 'text-yellow-400',
    hangmanBg: 'from-sky-100 to-sky-200'
  },
  ocean: {
    background: 'from-blue-900 via-cyan-900 to-teal-900',
    cardBg: 'bg-cyan-500/10',
    cardBorder: 'border-cyan-300/20',
    title: 'from-cyan-300 to-blue-300',
    subtitle: 'text-cyan-200',
    wordText: 'from-teal-300 to-cyan-300',
    category: 'text-cyan-300',
    hangmanBg: 'from-cyan-100 to-blue-100'
  },
  sunset: {
    background: 'from-orange-900 via-red-900 to-pink-900',
    cardBg: 'bg-orange-500/10',
    cardBorder: 'border-orange-300/20',
    title: 'from-orange-300 to-pink-300',
    subtitle: 'text-orange-200',
    wordText: 'from-yellow-300 to-orange-300',
    category: 'text-orange-300',
    hangmanBg: 'from-orange-100 to-pink-100'
  },
  forest: {
    background: 'from-green-900 via-emerald-900 to-teal-900',
    cardBg: 'bg-green-500/10',
    cardBorder: 'border-green-300/20',
    title: 'from-green-300 to-emerald-300',
    subtitle: 'text-green-200',
    wordText: 'from-lime-300 to-green-300',
    category: 'text-green-300',
    hangmanBg: 'from-green-100 to-emerald-100'
  },
  galaxy: {
    background: 'from-purple-900 via-violet-900 to-indigo-900',
    cardBg: 'bg-purple-500/10',
    cardBorder: 'border-purple-300/20',
    title: 'from-purple-300 to-pink-300',
    subtitle: 'text-purple-200',
    wordText: 'from-violet-300 to-purple-300',
    category: 'text-purple-300',
    hangmanBg: 'from-purple-100 to-violet-100'
  },
  fire: {
    background: 'from-red-900 via-orange-900 to-yellow-900',
    cardBg: 'bg-red-500/10',
    cardBorder: 'border-red-300/20',
    title: 'from-red-300 to-yellow-300',
    subtitle: 'text-red-200',
    wordText: 'from-orange-300 to-red-300',
    category: 'text-red-300',
    hangmanBg: 'from-red-100 to-orange-100'
  },
  ice: {
    background: 'from-blue-900 via-indigo-900 to-slate-900',
    cardBg: 'bg-blue-500/10',
    cardBorder: 'border-blue-300/20',
    title: 'from-blue-300 to-slate-300',
    subtitle: 'text-blue-200',
    wordText: 'from-slate-300 to-blue-300',
    category: 'text-blue-300',
    hangmanBg: 'from-blue-100 to-slate-100'
  }
}

// Composant SVG pour chaque étape du pendu
const HangmanStage = ({
  stage,
  style = 'classic',
  errorLabel,
}: {
  stage: number
  style?: HangmanStyle
  /** Écran du robot à la mort (style moderne), traduit par l'appelant. */
  errorLabel: string
}) => {
  // Couleurs selon le style
  const getStyleColors = (style: HangmanStyle) => {
    switch (style) {
      case 'modern':
        return {
          base: '#C0C0C0', // Métal
          rope: '#000000', // Noir
          head: '#FFE4C4', // Beige
          body: '#4169E1', // Bleu royal
          limbs: '#FF6347' // Rouge tomate
        }
      case 'space':
        return {
          base: '#708090', // Acier
          rope: '#00CED1', // Turquoise
          head: '#98FB98', // Vert alien
          body: '#4B0082', // Indigo
          limbs: '#FF1493' // Rose vif
        }
      default: // classic
        return {
          base: '#8B4513', // Marron pour le bois
          rope: '#654321', // Marron foncé pour la corde
          head: '#FFD700', // Doré pour la tête
          body: '#FF6B6B', // Rouge pour le corps
          limbs: '#4ECDC4' // Turquoise pour les membres
        }
    }
  }

  const stageColors = getStyleColors(style)

  // Rendu selon le style
  if (style === 'modern') {
    return (
      <svg viewBox="0 0 200 250" className="w-full h-full">
        {/* Gratte-ciel/Building */}
        {stage >= 1 && (
          <rect x="40" y="200" width="120" height="40" fill={stageColors.base} rx="2" />
        )}
        {stage >= 2 && (
          <rect x="95" y="50" width="10" height="200" fill={stageColors.base} rx="1" />
        )}
        {stage >= 3 && (
          <rect x="95" y="50" width="60" height="10" fill={stageColors.base} rx="1" />
        )}
        {/* Câble électrique */}
        {stage >= 4 && (
          <>
            <path d="M 155 60 Q 160 70 155 80 Q 150 90 155 100" stroke={stageColors.rope} strokeWidth="3" fill="none" />
            <circle cx="155" cy="100" r="5" fill="none" stroke={stageColors.rope} strokeWidth="2" />
          </>
        )}
        {/* Robot/Cyborg */}
        {stage >= 5 && (
          <>
            <rect x="145" y="110" width="20" height="20" fill={stageColors.head} rx="3" />
            <rect x="148" y="113" width="4" height="2" fill="#00FF00" />
            <rect x="152" y="113" width="4" height="2" fill="#00FF00" />
            <rect x="149" y="118" width="6" height="1" fill="#333" />
            {stage >= 8 && (
              <>
                <rect x="148" y="113" width="4" height="2" fill="#FF0000" />
                <rect x="152" y="113" width="4" height="2" fill="#FF0000" />
                <text x="155" y="125" fontSize="8" fill="#FF0000">{errorLabel}</text>
              </>
            )}
          </>
        )}
        {/* Corps mécanique */}
        {stage >= 6 && (
          <rect x="150" y="130" width="10" height="30" fill={stageColors.body} rx="2" />
        )}
        {/* Bras mécaniques */}
        {stage >= 7 && (
          <rect x="135" y="140" width="15" height="4" fill={stageColors.limbs} rx="1" />
        )}
        {stage >= 8 && (
          <>
            <rect x="160" y="140" width="15" height="4" fill={stageColors.limbs} rx="1" />
            <rect x="150" y="160" width="4" height="20" fill={stageColors.limbs} rx="1" />
            <rect x="156" y="160" width="4" height="20" fill={stageColors.limbs} rx="1" />
          </>
        )}
      </svg>
    )
  }

  if (style === 'space') {
    return (
      <svg viewBox="0 0 200 250" className="w-full h-full">
        {/* Station spatiale */}
        {stage >= 1 && (
          <ellipse cx="100" cy="230" rx="80" ry="15" fill={stageColors.base} />
        )}
        {stage >= 2 && (
          <rect x="96" y="80" width="8" height="150" fill={stageColors.base} rx="2" />
        )}
        {/* Bras robotique */}
        {stage >= 3 && (
          <>
            <rect x="96" y="80" width="40" height="6" fill={stageColors.base} rx="1" />
            <circle cx="136" cy="83" r="4" fill={stageColors.base} />
          </>
        )}
        {/* Rayon tracteur */}
        {stage >= 4 && (
          <>
            <path d="M 136 87 L 136 120" stroke={stageColors.rope} strokeWidth="3" strokeDasharray="5,3" />
            <circle cx="136" cy="120" r="8" fill="none" stroke={stageColors.rope} strokeWidth="2" opacity="0.7" />
          </>
        )}
        {/* Alien */}
        {stage >= 5 && (
          <>
            <ellipse cx="136" cy="140" rx="18" ry="15" fill={stageColors.head} stroke="#333" strokeWidth="2" />
            <ellipse cx="130" cy="135" rx="4" ry="6" fill="#000" />
            <ellipse cx="142" cy="135" rx="4" ry="6" fill="#000" />
            <ellipse cx="136" cy="148" rx="2" ry="1" fill="#333" />
            {stage >= 8 && (
              <>
                <line x1="126" y1="131" x2="134" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="134" y1="131" x2="126" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="138" y1="131" x2="146" y2="139" stroke="#FF0000" strokeWidth="2" />
                <line x1="146" y1="131" x2="138" y2="139" stroke="#FF0000" strokeWidth="2" />
              </>
            )}
          </>
        )}
        {/* Corps alien */}
        {stage >= 6 && (
          <ellipse cx="136" cy="175" rx="8" ry="20" fill={stageColors.body} />
        )}
        {/* Tentacules */}
        {stage >= 7 && (
          <path d="M 136 165 Q 120 175 115 190 Q 110 200 120 205" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
        )}
        {stage >= 8 && (
          <>
            <path d="M 136 165 Q 152 175 157 190 Q 162 200 152 205" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
            <path d="M 136 185 Q 125 195 120 210" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
            <path d="M 136 185 Q 147 195 152 210" stroke={stageColors.limbs} strokeWidth="3" fill="none" />
          </>
        )}
        {/* Étoiles */}
        <g fill="#FFD700" opacity="0.8">
          <circle cx="30" cy="40" r="1" />
          <circle cx="170" cy="30" r="1.5" />
          <circle cx="50" cy="60" r="1" />
          <circle cx="160" cy="70" r="1" />
        </g>
      </svg>
    )
  }

  // Style classique par défaut
  return (
    <svg viewBox="0 0 200 250" className="w-full h-full">
      {/* Base - toujours visible sauf étape 0 */}
      {stage >= 1 && (
        <rect x="10" y="230" width="180" height="15" fill={stageColors.base} rx="2" />
      )}
      
      {/* Poteau vertical */}
      {stage >= 2 && (
        <rect x="30" y="20" width="8" height="210" fill={stageColors.base} rx="2" />
      )}
      
      {/* Barre horizontale */}
      {stage >= 3 && (
        <rect x="30" y="20" width="100" height="8" fill={stageColors.base} rx="2" />
      )}
      
      {/* Corde - Placée AVANT le corps et la tête pour être en arrière-plan */}
      {stage >= 4 && (
        <>
          <rect x="125" y="28" width="4" height="30" fill={stageColors.rope} rx="1" />
          <circle cx="127" cy="58" r="8" fill="none" stroke={stageColors.rope} strokeWidth="2" />
        </>
      )}
      
      {/* Corps - Placé AVANT la tête pour être en arrière-plan */}
      {stage >= 6 && (
        <rect x="125" y="95" width="4" height="60" fill={stageColors.body} rx="1" />
      )}
      
      {/* Bras gauche */}
      {stage >= 7 && (
        <line x1="127" y1="110" x2="105" y2="135" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
      )}
      
      {/* Bras droit et jambes (mort) */}
      {stage >= 8 && (
        <>
          {/* Bras droit */}
          <line x1="127" y1="110" x2="149" y2="135" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
          {/* Jambe gauche */}
          <line x1="127" y1="155" x2="110" y2="190" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
          {/* Jambe droite */}
          <line x1="127" y1="155" x2="144" y2="190" stroke={stageColors.limbs} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      
      {/* Tête - Placée EN DERNIER pour être au premier plan */}
      {stage >= 5 && (
        <>
          <circle cx="127" cy="80" r="15" fill={stageColors.head} stroke="#333" strokeWidth="2" />
          {/* Yeux */}
          <circle cx="122" cy="76" r="2" fill="#333" />
          <circle cx="132" cy="76" r="2" fill="#333" />
          {/* Bouche */}
          <path d="M 120 85 Q 127 90 134 85" stroke="#333" strokeWidth="2" fill="none" />
          
          {/* Effet de mort - yeux en X (seulement à la mort) */}
          {stage >= 8 && (
            <>
              <g stroke="#FF0000" strokeWidth="2">
                <line x1="119" y1="73" x2="125" y2="79" />
                <line x1="125" y1="73" x2="119" y2="79" />
                <line x1="129" y1="73" x2="135" y2="79" />
                <line x1="135" y1="73" x2="129" y2="79" />
              </g>
            </>
          )}
        </>
      )}
      
      {/* Effet de particules de danger pour les dernières étapes */}
      {stage >= 7 && (
        <g>
          <circle cx="160" cy="40" r="2" fill="#FF0000" opacity="0.6">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="170" cy="60" r="1.5" fill="#FF4500" opacity="0.7">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="165" cy="80" r="1" fill="#FF6347" opacity="0.5">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="0.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  )
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal', updatePlayerStats }: GameProps) {
  const t = useTranslations('games.pendu')
  const tCommon = useTranslations('common')
  const simCompliments = t.raw('compliments') as string[]
  const debMessages = t.raw('debMessages') as string[]
  const statsFlushedRef = useRef(false)
  /** Fin de partie atteinte : plus rien à sauvegarder, même si le minuteur s'égare ensuite. */
  const finishedRef = useRef(false)

  // La partie (mot, lettres, points, gorgées, tours) vit dans le moteur pur
  // src/lib/pendu/engine.ts ; ce composant garde l'affichage, le minuteur,
  // les fenêtres et les thèmes.
  const [game, setGame] = useState<PenduState | null>(null)
  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<PenduSave>(PENDU_SAVE_ID, PENDU_SAVE_VERSION, (s) =>
    s.difficulty === difficulty && isSameLocalTable(s.playerIds, initialPlayers)
  )

  const [showConfetti, setShowConfetti] = useState(false)
  const [showRoundDialog, setShowRoundDialog] = useState(false)
  const [roundResult, setRoundResult] = useState('')
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [timeLeft, setTimeLeft] = useState(DIFFICULTY_CONFIG[difficulty].timerDuration)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [timerRef, setTimerRef] = useState<NodeJS.Timeout | null>(null)
  const [hangmanStyle, setHangmanStyle] = useState<HangmanStyle>('classic')
  const [colorTheme, setColorTheme] = useState<ColorTheme>('default')
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  const config = DIFFICULTY_CONFIG[difficulty]
  const theme = COLOR_THEME_STYLES[colorTheme]

  // Profils de la table (prop) + compteurs de la partie (moteur), dans l'ordre du moteur
  const players = useMemo<GamePlayer[]>(() => {
    const scores = game?.players ?? initialPlayers.map(p => ({ id: p.id, score: 0, drinks: 0, wins: 0 }))
    return scores.flatMap(({ id, score, drinks, wins }) => {
      const profile = initialPlayers.find(p => p.id === id)
      if (!profile) return []
      return [{
        ...profile,
        score,
        drinks,
        wins,
        preferences: profile.preferences || { color: 'bg-blue-500', icon: '👤' }
      }]
    })
  }, [game?.players, initialPlayers])

  const currentPlayerIndex = game?.currentPlayerIndex ?? 0
  const currentPlayer = players[currentPlayerIndex]
  const maxRounds = players.length // Un tour pour chaque joueur

  // Fin de partie : enregistre les stats (une seule fois) puis remonte au parent
  const handleFinish = () => {
    if (!statsFlushedRef.current) {
      statsFlushedRef.current = true
      players.forEach(p => {
        updatePlayerStats?.(p.id, 'pendu', {
          gamesPlayed: 1,
          totalDrinks: p.drinks,
        })
      })
    }
    // Statistiques créditées : la partie ne doit plus être proposée à la reprise.
    session.clear()
    onGameEnd()
  }

  // Calculer les seuils de couleur proportionnels à la durée du minuteur
  const getTimerColor = (timeLeft: number) => {
    const redThreshold = Math.floor(config.timerDuration * 0.17) // ~17% du temps (10/60 = 0.17)
    const orangeThreshold = Math.floor(config.timerDuration * 0.33) // ~33% du temps (20/60 = 0.33)

    if (timeLeft <= redThreshold) return 'text-red-500'
    if (timeLeft <= orangeThreshold) return 'text-orange-500'
    return 'text-green-500'
  }

  const getTimerTextColor = (timeLeft: number) => {
    const redThreshold = Math.floor(config.timerDuration * 0.17)
    const orangeThreshold = Math.floor(config.timerDuration * 0.33)

    if (timeLeft <= redThreshold) return 'text-red-400 animate-pulse'
    if (timeLeft <= orangeThreshold) return 'text-orange-400'
    return 'text-green-400'
  }

  // Démarrer le minuteur (plein, ou depuis le temps restant d'une partie reprise)
  const startTimer = useCallback((from: number = config.timerDuration) => {
    // Nettoyer l'ancien minuteur s'il existe
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })

    setTimeLeft(from)
    setIsTimerActive(true)

    const newTimer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Nettoyer le minuteur immédiatement
          clearInterval(newTimer)
          setIsTimerActive(false)
          setTimerRef(null)

          // Temps écoulé : mot perdu, gorgées attribuées au passage au joueur suivant
          setGame(g => (g ? expirePenduTimer(g) : g))

          return 0
        }
        return prev - 1
      })
    }, 1000)

    setTimerRef(newTimer)
  }, [config])

  // Arrêter le minuteur
  const stopTimer = useCallback(() => {
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    setIsTimerActive(false)
  }, [])

  // Démarrer le minuteur du nouveau mot après 1 s, le temps que le joueur se prépare
  const scheduleTimerStart = useCallback(() => {
    setTimeout(() => {
      startTimer()
    }, 1000)
  }, [startTimer])

  // Première donne — jamais tant qu'une reprise est proposée : le joueur tranche.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    setGame(createPenduGame({ difficulty, playerIds: initialPlayers.map(p => p.id) }))
    setStarted(true)
    scheduleTimerStart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ready, session.pending, started])

  // Sauvegarde continue (minuteur compris) : un onglet recyclé ne coûte plus la partie.
  useEffect(() => {
    if (!started || !game || game.gameState === 'ended' || finishedRef.current) return
    session.save(toPenduSave(game, timeLeft))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, game, timeLeft])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Autre niveau, autre table ou sauvegarde abîmée : partie neuve.
    const restored =
      saved.difficulty === difficulty && isSameLocalTable(saved.playerIds, initialPlayers)
        ? restorePenduSave(saved, initialPlayers.map(p => p.id))
        : null
    if (!restored) {
      session.discard()
      return
    }
    setGame(restored.state)
    setTimeLeft(restored.timeLeft)
    setStarted(true)
    // Mot en cours : le minuteur repart du temps restant, après la même seconde
    // de préparation qu'un nouveau mot. Mot déjà joué : sa fenêtre de résultat
    // se rouvre d'elle-même.
    if (restored.state.gameState === 'playing') {
      setTimeout(() => {
        startTimer(restored.timeLeft)
      }, 1000)
    }
  }

  // Système d'indices (coût : du temps de minuteur)
  const requestHint = () => {
    if (!game) return
    const hint = applyPenduHint(game, timeLeft)
    if (!hint) return
    setTimeLeft(prev => Math.max(0, prev - hint.timeCost))
    setGame(hint.state)
  }

  // Vérifier l'état du mot après chaque changement
  useEffect(() => {
    if (!game) return
    const { outcome } = evaluatePenduRound(game)
    if (!outcome) return
    setGame(g => (g ? evaluatePenduRound(g).state : g))
    // Arrêter le minuteur
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    setIsTimerActive(false)
    if (outcome === 'won') {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3000)
    }
  }, [game])

  // Nettoyer le minuteur au démontage du composant
  useEffect(() => {
    return () => {
      setTimerRef(prevTimer => {
        if (prevTimer) {
          clearInterval(prevTimer)
        }
        return null
      })
    }
  }, [])

  // Gérer la lettre devinée
  const handleLetterGuess = (letter: string) => {
    if (!game) return
    const { gameState } = game
    if (game.guessedLetters.includes(letter) || game.wrongLetters.includes(letter) || gameState !== 'playing' || !isTimerActive) {
      return
    }

    // Arrêter le minuteur actuel
    stopTimer()

    setGame(g => (g ? guessPenduLetter(g, letter) : g))

    // Redémarrer le minuteur après un court délai. `gameState` est celui
    // d'AVANT la lettre (toujours « playing » ici) : le minuteur repart même
    // si la lettre vient de finir le mot — comportement historique conservé.
    setTimeout(() => {
      if (gameState === 'playing') {
        startTimer()
      }
    }, 500)
  }

  // Passer au joueur suivant : gorgées du mot attribuées MAINTENANT, puis
  // nouveau mot — ou fin de partie
  const nextPlayer = () => {
    if (!game) return
    const { state, ended } = advancePenduGame(game)
    setGame(state)

    if (ended) {
      // Fin de partie : une partie terminée ne doit rien laisser derrière elle.
      finishedRef.current = true
      session.clear()
      setShowEndDialog(true)
      return
    }

    // Temps plein posé AVEC le nouveau mot : la sauvegarde continue ne doit pas
    // l'écrire avec le temps restant (parfois 0) du mot précédent pendant la
    // seconde de préparation.
    setTimeLeft(config.timerDuration)
    scheduleTimerStart()
    setShowRoundDialog(false)
  }

  // Fonction pour obtenir le type de joueur spécial
  const getSpecialPlayerType = (playerName: string): 'sim' | 'deb' | null => {
    const name = playerName.toLowerCase()
    if (name === 'sim' || name === 'riqui') return 'sim'
    if (name === 'deb') return 'deb'
    return null
  }

  const gameStateNow = game?.gameState
  const currentWordNow = game?.currentWord ?? ''
  const wrongLettersNow = game?.wrongLetters

  // Afficher le résultat du round
  useEffect(() => {
    if (!currentPlayer || !wrongLettersNow) return
    if (gameStateNow === 'won' || gameStateNow === 'lost') {
      const isWon = gameStateNow === 'won'
      const playerName = currentPlayer.name
      const specialType = getSpecialPlayerType(playerName)

      let message = ''
      if (isWon) {
        if (specialType === 'sim') {
          message = t('game.roundResult.simWon', {
            compliment: simCompliments[Math.floor(Math.random() * simCompliments.length)],
          })
        } else {
          message = t('game.roundResult.won', { name: playerName, word: currentWordNow })
        }
      } else {
        const isTimeout = wrongLettersNow.includes(TIMEOUT_MARK)
        if (isTimeout) {
          if (specialType === 'deb') {
            message = t('game.roundResult.debTimeout', {
              message: debMessages[Math.floor(Math.random() * debMessages.length)],
              word: currentWordNow,
            })
          } else {
            message = t('game.roundResult.timeout', { name: playerName, word: currentWordNow })
          }
        } else {
          if (specialType === 'deb') {
            message = t('game.roundResult.debLost', {
              message: debMessages[Math.floor(Math.random() * debMessages.length)],
              word: currentWordNow,
            })
          } else {
            message = t('game.roundResult.lost', { name: playerName, word: currentWordNow })
          }
        }
      }

      setRoundResult(message)
      setTimeout(() => setShowRoundDialog(true), 1000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStateNow, currentPlayer?.name, currentWordNow, wrongLettersNow, t, simCompliments, debMessages])

  // Afficher le mot avec les lettres devinées
  const displayWord = useMemo(
    () => penduDisplayWord(currentWordNow, game?.guessedLetters ?? []),
    [currentWordNow, game?.guessedLetters]
  )

  // Calculer le gagnant (le plus de points, le premier de la table à égalité)
  const winner = useMemo(() => {
    if (!game || game.gameState !== 'ended') return null
    const best = penduWinner(game)
    return best ? players.find(p => p.id === best.id) ?? null : null
  }, [game, players])

  const restartGame = () => {
    statsFlushedRef.current = false
    finishedRef.current = false
    // Arrêter le minuteur actuel
    setTimerRef(prevTimer => {
      if (prevTimer) {
        clearInterval(prevTimer)
      }
      return null
    })
    setIsTimerActive(false)
    setGame(createPenduGame({ difficulty, playerIds: initialPlayers.map(p => p.id) }))
    // Même raison qu'au joueur suivant : la sauvegarde part avec le temps plein.
    setTimeLeft(config.timerDuration)
    setShowEndDialog(false)
    scheduleTimerStart()
  }

  // Lecture du stockage en cours : rien à afficher encore
  if (!session.ready) return null

  if (session.pending) {
    return (
      <div className={`relative flex min-h-screen items-center justify-center bg-gradient-to-b ${theme.background} p-4 text-white`}>
        <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/15 bg-white/10 p-6 text-center">
          <h2 className="text-xl font-extrabold">{tCommon('resumeGame.title')}</h2>
          <p className="text-sm text-white/70">{tCommon('resumeGame.body')}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={resumeSavedGame}
              className="min-h-[44px] w-full rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 py-3 text-sm font-bold text-black hover:from-yellow-400 hover:to-orange-400"
            >
              {tCommon('resumeGame.resume')}
            </button>
            <button
              type="button"
              onClick={session.discard}
              className="min-h-[44px] w-full rounded-2xl border border-white/20 bg-white/5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              {tCommon('resumeGame.newGame')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Première donne pas encore distribuée (un rendu, le temps de l'effet)
  if (!game || !currentPlayer) return null

  const {
    round,
    currentCategory,
    wrongLetters,
    guessedLetters,
    gameState,
    hintsUsed,
    showCompleteHangman,
  } = game

  return (
    <div className={`relative min-h-screen bg-gradient-to-b ${theme.background} text-white`}>
      {/* Rideau de fin (200 pièces recyclées, l'ancien défaut) ; z-[2] : au-dessus
          des cartes positionnées, comme le posait react-confetti. `relative` sur
          la racine : le canevas se borne au jeu au lieu de s'ancrer sur la page
          entière (et de grandir avec elle). */}
      {showConfetti && <EndConfetti rain pieces={200} className="z-[2]" />}
      
      <div className="container mx-auto max-w-6xl px-2 py-4 space-y-4 md:space-y-6 md:px-4">
        {/* Header - Responsive */}
        <div className="text-center space-y-1 md:space-y-2">
          <h1 className={`text-2xl md:text-4xl font-bold bg-gradient-to-r ${theme.title} bg-clip-text text-transparent`}>
            {t('game.title')}
          </h1>
          <p className={`text-sm md:text-lg ${theme.subtitle}`}>
            {t('game.roundInfo', {
              round,
              max: maxRounds,
              difficulty: t(`difficulty.${difficulty}`),
            })}
          </p>
          
          <div className="flex justify-center mt-4">
            <Button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="px-4 py-2 bg-white/20 text-white hover:bg-white/30 rounded-lg transition-all"
            >
              {t('game.themesButton')}
            </Button>
          </div>
        </div>

        {/* Menu des thèmes et styles */}
        {showThemeMenu && (
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-6 mb-4`}>
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-center mb-4">{t('game.themesMenuTitle')}</h3>
              
              <div className="space-y-2">
                <span className={`${theme.subtitle} text-sm font-semibold`}>{t('game.hangmanStyleLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {(['classic', 'modern', 'space'] as HangmanStyle[]).map(style => (
                    <Button
                      key={style}
                      onClick={() => setHangmanStyle(style)}
                      className={`px-3 py-2 text-sm rounded transition-all ${
                        hangmanStyle === style 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {t(`game.styles.${style}`)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className={`${theme.subtitle} text-sm font-semibold`}>{t('game.colorThemeLabel')}</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(['default', 'ocean', 'sunset', 'forest', 'galaxy', 'fire', 'ice'] as ColorTheme[]).map(themeKey => (
                    <Button
                      key={themeKey}
                      onClick={() => setColorTheme(themeKey)}
                      className={`px-2 py-2 text-xs rounded transition-all ${
                        colorTheme === themeKey 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {t(`themes.${themeKey}`)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => setShowThemeMenu(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                >
                  {t('game.closeMenu')}
                </Button>
              </div>
            </div>
          </Card>
        )}


        {/* Zone de jeu principale */}
        <div className="space-y-3 md:space-y-6">
          {/* Pendu et mot - Centré */}
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-8 relative`}>
            {/* Joueur actuel - En haut à gauche de la card */}
            <div className="absolute top-4 left-4 flex items-center space-x-2">
              <Avatar className="w-8 h-8 border-2 border-yellow-400">
                <AvatarImage src={currentPlayer.preferences?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs font-bold">
                  {currentPlayer.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="text-sm font-semibold">
                  <PlayerName player={currentPlayer} />
                </div>
                <div className="text-xs text-purple-200">{t('game.yourTurn')}</div>
              </div>
            </div>

            {/* Minuteur en haut à droite de la card */}
            <div className="absolute top-2 right-2 md:top-4 md:right-4">
              <div className="relative w-12 h-12 md:w-16 md:h-16">
                {/* Cercle de fond */}
                <svg className="w-12 h-12 md:w-16 md:h-16 transform -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="none"
                    className="text-gray-700"
                  />
                  {/* Cercle de progression */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ${getTimerColor(timeLeft)}`}
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - timeLeft / config.timerDuration)}`}
                  />
                </svg>
                {/* Texte du minuteur */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs md:text-sm font-bold ${getTimerTextColor(timeLeft)}`}>
                    {timeLeft}
                  </span>
                </div>
              </div>
            </div>
            

            <div className="text-center space-y-4 md:space-y-8 mt-2 md:mt-4">
              {/* Dessin du pendu - Version SVG */}
              <div className="flex justify-center relative">
                {/* Pendu complet en fond si timeout */}
                {showCompleteHangman && (
                  <div className="absolute inset-0 flex justify-center items-center opacity-30 z-0">
                    <div className={`bg-gradient-to-b ${theme.hangmanBg} rounded-lg p-3 md:p-6 shadow-lg border-2 ${theme.cardBorder}`}>
                      <div className="w-48 h-60 md:w-64 md:h-80">
                        <HangmanStage 
                          stage={8} // Pendu complet
                          style={hangmanStyle}
                          errorLabel={t('game.robotError')}
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Pendu normal */}
                <div className={`bg-gradient-to-b ${theme.hangmanBg} rounded-lg p-3 md:p-6 shadow-lg border-2 ${theme.cardBorder} ${showCompleteHangman ? 'relative z-10' : ''}`}>
                  <div className="w-48 h-60 md:w-64 md:h-80">
                    <HangmanStage 
                      stage={penduHangmanStage(wrongLetters.length, config.maxErrors)} 
                      style={hangmanStyle}
                      errorLabel={t('game.robotError')}
                    />
                  </div>
                </div>
              </div>
              
              {/* Catégorie */}
              <div className={`text-lg md:text-xl ${theme.category} font-semibold`}>
                {t('game.categoryLabel', {
                  category: t(`categories.${currentCategory}` as 'categories.animaux'),
                })}
              </div>
              
              {/* Mot à deviner */}
              <div className={`text-2xl md:text-4xl font-bold tracking-widest font-mono bg-gradient-to-r ${theme.wordText} bg-clip-text text-transparent break-all`}>
                {displayWord}
              </div>
              
              {/* Erreurs et Indices */}
              <div className="flex flex-col items-center space-y-3 md:space-y-4">
                {/* Erreurs */}
                <div className="flex items-center justify-center space-x-2 md:space-x-3">
                  <Skull className="w-5 h-5 md:w-6 md:h-6 text-red-400" />
                  <span className="text-red-400 text-base md:text-lg">
                    {t('game.errors', { count: wrongLetters.length, max: config.maxErrors })}
                  </span>
                  <div className="flex space-x-1">
                    {Array.from({ length: config.maxErrors }).map((_, i) => (
                      <Heart 
                        key={i} 
                        className={`w-4 h-4 md:w-5 md:h-5 ${i < config.maxErrors - wrongLetters.length ? 'text-red-500' : 'text-gray-600'}`}
                        fill={i < config.maxErrors - wrongLetters.length ? 'currentColor' : 'none'}
                      />
                    ))}
                  </div>
                </div>

                {/* Système d'indices */}
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={requestHint}
                    disabled={hintsUsed >= MAX_HINTS || gameState !== 'playing' || !isTimerActive || timeLeft <= HINT_COST_SECONDS}
                    className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-all"
                  >
                    {t('game.hint', { used: hintsUsed, max: MAX_HINTS })}
                  </Button>
                  <span className="text-yellow-400 text-sm">
                    {t('game.hintCost')}
                  </span>
                </div>

              </div>

              {/* Lettres fausses */}
              {wrongLetters.length > 0 && (
                <div className="text-red-400 text-sm md:text-lg px-2 text-center">
                  {t('game.wrongLetters', {
                    letters: wrongLetters.map(letter =>
                      letter === TIMEOUT_MARK ? t('game.timeExpired') : letter
                    ).join(', '),
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Clavier - En dessous et centré */}
          <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-3 md:p-6`}>
            <h3 className="text-lg md:text-2xl font-bold mb-3 md:mb-6 text-center">{t('game.keyboard')}</h3>
            <div className="max-w-4xl mx-auto">
              {/* Clavier mobile optimisé */}
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-13 gap-1 md:gap-2 justify-center">
                {PENDU_ALPHABET.map(letter => {
                  const isUsed = guessedLetters.includes(letter) || wrongLetters.includes(letter)
                  const isCorrect = guessedLetters.includes(letter)
                  const isWrong = wrongLetters.includes(letter)
                  
                  return (
                    <Button
                      key={letter}
                      onClick={() => handleLetterGuess(letter)}
                      disabled={isUsed || gameState !== 'playing' || !isTimerActive}
                      className={`
                        aspect-square text-sm md:text-xl font-bold transition-all 
                        min-w-[40px] min-h-[40px] md:min-w-[50px] md:min-h-[50px]
                        touch-manipulation
                        ${isCorrect ? 'bg-green-600 hover:bg-green-700 text-white' :
                          isWrong ? 'bg-red-600 hover:bg-red-700 text-white' :
                          !isTimerActive && gameState === 'playing' ? 'bg-gray-600 text-gray-300 cursor-not-allowed' :
                          'bg-white/20 hover:bg-white/30 text-white border-white/30'}
                        ${isUsed || !isTimerActive ? 'cursor-not-allowed opacity-50' : ''}
                      `}
                    >
                      {letter}
                    </Button>
                  )
                })}
              </div>
            </div>
          </Card>

        </div>

        {/* Tableau des scores */}
        <Card className={`${theme.cardBg} backdrop-blur-sm ${theme.cardBorder} p-4 md:p-6`}>
          <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-center">{t('game.scoreboard')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                  <Avatar className="w-12 h-12">
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
                      <div className="flex items-center space-x-1">
                        <Star className="w-3 h-3 text-yellow-400" />
                        <span>{t('game.points', { count: player.score })}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Trophy className="w-3 h-3 text-green-400" />
                        <span>{t('game.wins', { count: player.wins })}</span>
                      </div>
                      {player.drinks > 0 && (
                        <div className="text-red-400">{t('game.drinks', { count: player.drinks })}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
          <Button 
            onClick={handleFinish}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 w-full sm:w-auto"
          >
            <Home className="w-4 h-4 mr-2" />
            {t('game.quit')}
          </Button>
          <Button 
            onClick={restartGame}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 w-full sm:w-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('game.newGame')}
          </Button>
        </div>
      </div>

      {/* Dialog de résultat du round */}
      <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
        <DialogContent className="bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {gameState === 'won' ? t('game.roundDialog.wonTitle') : t('game.roundDialog.lostTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-lg">{roundResult}</p>
            {gameState === 'won' && (
              <p className="text-green-400">{t('game.roundDialog.bonusPoints', { count: config.bonusPoints })}</p>
            )}
            {gameState === 'lost' && currentPlayer.drinks > 0 && (
              <p className="text-red-400">
                {t('game.roundDialog.drinks', { count: Math.ceil(config.drinkMultiplier * 2) })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={nextPlayer} className="w-full">
              {round >= maxRounds ? t('game.roundDialog.seeResults') : t('game.roundDialog.nextPlayer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de fin de partie */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        {/* Hauteur bornée et défilante : classement + avis de première partie
            peuvent dépasser un petit écran, et le pied (Rejouer) doit rester atteignable. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-gray-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl">
              {t('game.endDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-6">
            {winner && (
              <div className="space-y-2">
                <p className="text-2xl">{t('game.endDialog.winner')}</p>
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
                    <div className="text-yellow-400">{t('game.endDialog.points', { count: winner.score })}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Classement final */}
            <div className="space-y-2">
              <h4 className="text-lg font-semibold">{t('game.endDialog.finalRanking')}</h4>
              <div className="space-y-2">
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded bg-white/10">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}</span>
                        <PlayerName player={player} />
                      </div>
                      <div className="text-right">
                        <div>{t('game.points', { count: player.score })}</div>
                        {player.drinks > 0 && (
                          <div className="text-red-400 text-sm">{t('game.drinks', { count: player.drinks })}</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <FirstGameFeedbackCard mode="local" gameId="pendu" />
          <DialogFooter className="flex-col space-y-2">
            <Button onClick={restartGame} className="w-full">
              {t('game.endDialog.replay')}
            </Button>
            <Button onClick={handleFinish} variant="outline" className="w-full">
              {t('game.endDialog.backToMenu')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
