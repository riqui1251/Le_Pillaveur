"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { Dice6, Trophy, ArrowRight, RefreshCw, Home, Target, Link2, CircleDot, Sparkles, Swords, History, Shuffle, User, Check, Beer, Volume2, VolumeX } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Player as BasePlayer, PlayerPreferences, PLAYER_ICONS, getPlayerGameBoost, resolveValidatedPlayerName, getPlayerNameValidationError } from '@/lib/players'
import { nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { detectBrowserCapabilities } from '@/lib/browser-support'
import { getSafeStorage } from '@/lib/storage'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { formatPlayerNameHtml } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import ReactConfetti from 'react-confetti'
import {
  type Case,
  type CaseType,
  type Difficulty,
  type PetitBuveurT,
  generateCase,
  getCaseTypeLabel,
  getDefiWheelChallenges,
  CASES_NO_TARGET,
} from '../case-config'
import type { GamePlayer } from '../case-types'
import {
  type CaseNotificationState,
  type EffectOutcome,
  type NotificationBuildContext,
  type StoredCase,
  buildLastActionHtml,
  buildNotificationHtml,
  normalizeSavedCase,
  outcomeFromLegacyHtml,
  toStoredCase,
} from '../case-notification'
import {
  outcomeAnchorApplied,
  outcomeBombe,
  outcomeCannotRecul,
  outcomeCaseBase,
  outcomeChainLinked,
  outcomeCompose,
  outcomeCopie,
  outcomeCurseApplied,
  outcomeDoublePeine,
  outcomeDrinks,
  outcomeGenericApplied,
  outcomeInversion,
  outcomeI18n,
  outcomeMelange,
  outcomeMirrorLink,
  outcomeMiroirSwap,
  outcomeMove,
  outcomeNoPreviousCase,
  outcomeProtectionApplied,
  outcomeProtectedTarget,
  outcomeRewindSafe,
  outcomeRouletteMiss,
  outcomeRouletteProtected,
  outcomeRouletteSafe,
  outcomeSafeCase,
  outcomeSkipTurnNext,
  outcomeSkipTurnSelf,
  outcomeSpared,
  outcomeTrap,
  outcomeTrapProtected,
  outcomeChallengeResult,
} from '../outcome-helpers'
import { resolveNoTargetCase, getLeader, getLastPlayer } from '../resolve-case'
import { ShameDice, getDeHonteOutcomeLabel, buildDeHonteDescription } from './shame-dice'
import { CoinFlip, getPileFaceOutcomeLabel, type CoinSide } from './coin-flip'
import { DiceOverlay, type DiceOverlayState } from '@/components/petit-buveur/DiceOverlay'
import { TurnOverlay } from '@/components/petit-buveur/TurnOverlay'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { useDrinkDeltas, FloatingDrinkBadge, PulsingCount } from '@/components/petit-buveur/drink-feedback'
import { useGameSounds } from '@/hooks/useGameSounds'
import { isSoundMuted } from '@/lib/sound/game-sounds'
import { CaseRevealCard } from '@/components/petit-buveur/CaseRevealCard'
import { getCaseMeta, getCaseFamilyStyle } from '@/lib/petit-buveur/case-families'

const CASE_TYPES_NO_LAST_CASE: CaseType[] = ['repetition', 'chance', 'echange', 'rewind', 'double-case']

const isReplayableCase = (caseType: Case | null | undefined): caseType is Case =>
  caseType != null && !CASE_TYPES_NO_LAST_CASE.includes(caseType.type)

// Vérifier si le navigateur supporte certaines fonctionnalités avancées
const checkBrowserSupport = () => {
  if (typeof window === 'undefined') return false; // SSR
  
  try {
    // Vérifier si le navigateur supporte les animations et transformations
    return 'animation' in document.documentElement.style && 
           'transform' in document.documentElement.style &&
           'ontouchstart' in window; // Probablement un appareil mobile
  } catch (e) {
    return false;
  }
};

interface PendingChallenge {
  targetId: string
  drinks: number
  case: StoredCase
}

interface ActiveEffectItem {
  id: string
  icon: string
  title: string
  description: string
  remainingTurns: number
  player: GamePlayer
  linkedPlayer?: GamePlayer
  accentClass: string
}

interface LastActionRecord {
  turnNumber: number
  actorId: string
  caseType: CaseType
  outcome: EffectOutcome
  targetId: string | null
  duelPrefix?: boolean
  includeEffectsSummary?: boolean
}

const formatEffectRemainingTurns = (turns: number, t: PetitBuveurT) =>
  t('game.turnsRemaining', { count: turns })

type WheelSegment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
}

const DIFFICULTY_EMOJI: Record<Difficulty, string> = {
  facile: '🌱',
  normal: '🌟',
  difficile: '🔥',
  extreme: '💀',
}

const resolveDifficulty = (value: Difficulty | undefined): Difficulty =>
  value && value in DIFFICULTY_EMOJI ? value : 'normal'

function tWithHtml(
  t: PetitBuveurT,
  key: string,
  html: Record<string, string>,
  plain?: Record<string, string | number>
): string {
  const placeholders = Object.fromEntries(Object.keys(html).map(k => [k, `__HTML_${k}__`]))
  let result = t(key, { ...plain, ...placeholders })
  for (const [k, v] of Object.entries(html)) {
    result = result.replaceAll(`__HTML_${k}__`, v)
  }
  return result
}

const playerColors = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-amber-500', 'bg-lime-500'
]

interface GameSave {
  id: string;
  timestamp: number;
  players: GamePlayer[];
  currentPlayer: number;
  turnCount: number;
  gameDifficulty: Difficulty;
  lastCase: Case | null;
  gameStarted: boolean;
  winner: GamePlayer | null;
}

interface GameProps {
  players: BasePlayer[];
  onGameEnd: () => void;
  difficulty?: Difficulty;
  initialMode?: 'new' | 'resume';
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal', initialMode = 'new' }: GameProps) {
  const t = useTranslations('games.petit-buveur') as PetitBuveurT
  const tCommon = useTranslations('common')
  const { updatePlayerStats } = usePlayers();
  const defaultColor = 'bg-primary';

  const simCompliments = useMemo(() => t.raw('game.messages.compliments') as string[], [t])
  const debMessages = useMemo(() => t.raw('game.messages.deb') as string[], [t])
  const randomMessages = useMemo(() => t.raw('game.messages.cheers') as string[], [t])
  const drinkingMessages = useMemo(() => t.raw('game.messages.drinking') as string[], [t])

  const difficultyNames = useMemo(() => ({
    facile: `${DIFFICULTY_EMOJI.facile} ${t('difficultyLabels.facile')}`,
    normal: `${DIFFICULTY_EMOJI.normal} ${t('difficultyLabels.normal')}`,
    difficile: `${DIFFICULTY_EMOJI.difficile} ${t('difficultyLabels.difficile')}`,
    extreme: `${DIFFICULTY_EMOJI.extreme} ${t('difficultyLabels.extreme')}`,
  }), [t])

  const generateWheelSegments = useCallback((): WheelSegment[] => {
    const n = 15
    const arr: WheelSegment[] = []
    for (let i = 0; i < n; i++) {
      const isSafe = (i + 1) % 3 === 0
      const value = isSafe ? 0 : 1 + Math.floor(Math.random() * 12)
      arr.push({
        id: `seg-${i}-${value}-${Math.random().toString(36).slice(2, 6)}`,
        label: value === 0 ? t('wheel.safe') : t('wheel.sips', { count: value }),
        value,
      })
    }
    return arr
  }, [t])

  const generateDuelWheelSegments = useCallback((): WheelSegment[] => {
    const arr: WheelSegment[] = []
    for (let i = 0; i < 12; i++) {
      const isWinner = i % 2 === 0
      arr.push({
        id: `duel-seg-${i}`,
        label: isWinner ? t('wheel.winner') : t('wheel.loser'),
        value: isWinner ? 1 : 0,
      })
    }
    return arr
  }, [t])

  const generateDefiWheelSegments = useCallback((): WheelSegment[] => {
    const challenges = getDefiWheelChallenges(t)
    const safeLabel = t('wheel.safe')
    return challenges.map((label, i) => ({
      id: `defi-seg-${i}`,
      label,
      value: label === safeLabel || label === 'SAFE' ? 0 : label.toLowerCase().includes('boit') || label.toLowerCase().includes('drink') ? 2 : 0,
    }))
  }, [t])

  const formatPlayer = useCallback(
    (player: GamePlayer, options?: { compliment?: string }) =>
      formatPlayerNameHtml(player, options),
    []
  )
  
  // État pour stocker les capacités du navigateur
  const [browserCapabilities, setBrowserCapabilities] = useState({
    advancedAnimations: true,
    backgroundClipText: true,
    isMobile: false,
    isLimitedBrowser: false
  });
  
  const [players, setPlayers] = useState<GamePlayer[]>(
    initialPlayers.length > 0 ? initialPlayers.map((p, index) => ({
      ...p,
      name: resolveValidatedPlayerName(p.name) ?? `Joueur ${index + 1}`,
      position: 0,
      drinks: 0,
      protected: false,
      protectionTurnsLeft: undefined,
      cursed: 0,
      linkedTo: undefined,
      linkedTurns: 0,
      skipNextTurn: false,
      anchored: false,
      mirrorDrinkTargetId: undefined,
      mirrorDrinkTurns: 0,
      preferences: p.preferences || {
        color: defaultColor,
        icon: PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)],
        specialEffect: null
      },
      id: p.id || `player-${Math.random().toString(36).substring(2, 9)}`
    })) : [
      {
        id: 'player-1',
        name: 'Joueur 1',
        position: 0,
        drinks: 0,
        protected: false,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
        preferences: {
          color: 'bg-blue-500',
          icon: '🎮',
          specialEffect: null
        }
      },
      {
        id: 'player-2',
        name: 'Joueur 2',
        position: 0,
        drinks: 0,
        protected: false,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
        preferences: {
          color: 'bg-red-500',
          icon: '🎲',
          specialEffect: null
        }
      }
    ]
  );
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerNameError, setNewPlayerNameError] = useState<string | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<number>(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [caseNotification, setCaseNotification] = useState<CaseNotificationState | null>(null);
  const [winner, setWinner] = useState<GamePlayer | null>(null);
  const [turnCount, setTurnCount] = useState<number>(1);
  const [gameDifficulty, setGameDifficulty] = useState<Difficulty>(difficulty);
  const boardSize = 30;
  const [diceOverlay, setDiceOverlay] = useState<DiceOverlayState | null>(null);
  const [selectingPlayer, setSelectingPlayer] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [pendingCase, setPendingCase] = useState<Case | null>(null);
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const [pendingDuelNote, setPendingDuelNote] = useState<string | undefined>(undefined);
  const [lastActionHistory, setLastActionHistory] = useState<LastActionRecord | null>(null);
  const lastTargetIdRef = useRef<string | null>(null);
  const lastMoveDeltaRef = useRef(0);
  const extraCaseQueueRef = useRef<Case[]>([]);
  const [wheelMode, setWheelMode] = useState<'drinks' | 'defis'>('drinks');
  const [showTeleportDialog, setShowTeleportDialog] = useState(false);
  const [showVoteDialog, setShowVoteDialog] = useState(false);
  const [showDeHonteDialog, setShowDeHonteDialog] = useState(false);
  const [deHonteResult, setDeHonteResult] = useState<number | null>(null);
  const [deHonteRolling, setDeHonteRolling] = useState(false);
  const [deHonteDisplayValue, setDeHonteDisplayValue] = useState(1);
  const deHonteRollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pileFaceTargetId, setPileFaceTargetId] = useState<string | null>(null);
  const [showPileFaceDialog, setShowPileFaceDialog] = useState(false);
  const [pileFaceChoice, setPileFaceChoice] = useState<CoinSide | null>(null);
  const [pileFaceFlipResult, setPileFaceFlipResult] = useState<CoinSide | null>(null);
  const [pileFaceFlipping, setPileFaceFlipping] = useState(false);
  const pileFaceFlipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [clickCount, setClickCount] = useState<Record<string, number>>({});
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showVictoryScreen, setShowVictoryScreen] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Pions animés case par case + feedback gorgées (composants partagés petit-buveur).
  const positionsById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of players) rec[p.id] = p.position
    return rec
  }, [players])
  const { positions: shownPositions } = useSteppedPositions(positionsById)
  const drinksById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of players) rec[p.id] = p.drinks
    return rec
  }, [players])
  const drinkDeltas = useDrinkDeltas(drinksById)

  // Sons : fanfare de victoire (une seule fois) + toggle mute dans l'en-tête.
  const { muted, toggleMuted, play: playSound } = useGameSounds()
  const prevWinnerRef = useRef(false)
  useEffect(() => {
    const hasWinner = Boolean(winner)
    if (hasWinner && !prevWinnerRef.current) playSound('victory')
    prevWinnerRef.current = hasWinner
  }, [winner, playSound])
  
  // États pour la sauvegarde
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [hasActiveSave, setHasActiveSave] = useState(false);
  
  // États pour la roue des gorgées
  const [showWheel, setShowWheel] = useState(false);
  const [wheelSegments, setWheelSegments] = useState<WheelSegment[]>([]);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState<WheelSegment | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelRotation = useMotionValue(0);
  const lastWheelTickRef = useRef<number>(0);
  const wheelOutcomeAppliedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Duel sur case partagée (avant le ciblage)
  const [showDuelDialog, setShowDuelDialog] = useState(false);
  const [duelPhase, setDuelPhase] = useState<'pick' | 'wheel'>('pick');
  const [duelBoardPosition, setDuelBoardPosition] = useState<number | null>(null);
  const [duelOpponentId, setDuelOpponentId] = useState<string | null>(null);
  const [duelWheelSegments, setDuelWheelSegments] = useState<WheelSegment[]>([]);
  const [duelWheelSpinning, setDuelWheelSpinning] = useState(false);
  const [duelWheelResult, setDuelWheelResult] = useState<WheelSegment | null>(null);
  const duelWheelRotation = useMotionValue(0);
  const lastDuelWheelTickRef = useRef<number>(0);
  /** Vrai si le joueur au tour a lancé le dé pendant ce tour (pour expirer miroir / chaîne). */
  const turnHadDiceRollRef = useRef(false);
  
  // États pour les nouvelles cases
  const [lastCase, setLastCase] = useState<Case | null>(null);
  const [showChanceDialog, setShowChanceDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showChainDialog, setShowChainDialog] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);

  // Détection des fonctionnalités du navigateur au chargement
  useEffect(() => {
    // Seulement exécuter côté client
    if (typeof window !== 'undefined') {
      setBrowserCapabilities(detectBrowserCapabilities());
    }
  }, []);

  // Mettre à jour la taille de la fenêtre pour les confettis
  useEffect(() => {
    const updateWindowSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    // Définir la taille initiale
    updateWindowSize();

    // Mettre à jour la taille lors du redimensionnement
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  // Montrer l'écran de victoire quand il y a un gagnant
  useEffect(() => {
    if (winner) {
      setShowVictoryScreen(true);
    } else {
      setShowVictoryScreen(false);
    }
  }, [winner]);

  // Debug: Surveiller l'état de la fenêtre de sélection
  useEffect(() => {
    if (showTargetDialog) {
    }
  }, [showTargetDialog, players.length]);

  // Debug: Surveiller l'état du traitement du tour
  useEffect(() => {
    if (isProcessingTurn && !isDiceRolling) {
    }
  }, [isProcessingTurn, isDiceRolling, pendingCase, showTargetDialog, showWheel, showDuelDialog, showChanceDialog, showExchangeDialog, showChainDialog]);

  // Notification orpheline (showNotification sans caseNotification) → barre bloquée sans modal
  useEffect(() => {
    if (!showNotification || caseNotification) return
    const timer = setTimeout(() => {
      setShowNotification(false)
      setShowNextButton(false)
      setIsProcessingTurn(false)
    }, 200)
    return () => clearTimeout(timer)
  }, [showNotification, caseNotification])

  // Déblocage après blocage prolongé sans UI visible (évite une partie figée)
  useEffect(() => {
    const hasBlockingUi =
      showTargetDialog ||
      showWheel ||
      showDuelDialog ||
      showChanceDialog ||
      showExchangeDialog ||
      showChainDialog ||
      showTeleportDialog ||
      showVoteDialog ||
      showDeHonteDialog ||
      showPileFaceDialog ||
      (showNotification && caseNotification) ||
      wheelSpinning ||
      duelWheelSpinning ||
      isDiceRolling

    if (!isProcessingTurn || hasBlockingUi) return

    const timer = setTimeout(() => {
      setIsProcessingTurn(false)
    }, 12_000)

    return () => clearTimeout(timer)
  }, [
    isProcessingTurn,
    showTargetDialog,
    showWheel,
    showDuelDialog,
    showChanceDialog,
    showExchangeDialog,
    showChainDialog,
    showTeleportDialog,
    showVoteDialog,
    showDeHonteDialog,
    showPileFaceDialog,
    showNotification,
    caseNotification,
    wheelSpinning,
    duelWheelSpinning,
    isDiceRolling,
  ])

  // Fonctions de sauvegarde et chargement
  type GameSaveOverrides = Partial<
    Pick<GameSave, 'players' | 'currentPlayer' | 'turnCount' | 'gameDifficulty' | 'lastCase' | 'gameStarted' | 'winner'>
  >

  const saveGame = useCallback((overrides?: GameSaveOverrides) => {
    const saveData: GameSave = {
      id: `save_${Date.now()}`,
      timestamp: Date.now(),
      players: overrides?.players ?? players,
      currentPlayer: overrides?.currentPlayer ?? currentPlayer,
      turnCount: overrides?.turnCount ?? turnCount,
      gameDifficulty: overrides?.gameDifficulty ?? gameDifficulty,
      lastCase: overrides?.lastCase !== undefined ? overrides.lastCase : lastCase,
      gameStarted: overrides?.gameStarted ?? gameStarted,
      winner: overrides?.winner !== undefined ? overrides.winner : winner,
    };

    try {
      const storage = getSafeStorage();
      if (storage) {
        storage.setItem('petit-buveur-save', JSON.stringify(saveData));
        setHasActiveSave(true);
      }
    } catch (error) {
      console.error('saveGame: Erreur lors de la sauvegarde:', error);
    }
  }, [players, currentPlayer, turnCount, gameDifficulty, lastCase, gameStarted, winner]);

  const loadGame = (): GameSave | null => {
    try {
      const storage = getSafeStorage();
      if (!storage) return null;
      const saveData = storage.getItem('petit-buveur-save');
      
      if (saveData) {
        const parsed = JSON.parse(saveData) as GameSave;
        return parsed;
      } else {
      }
    } catch (error) {
      console.error('loadGame: Erreur lors du chargement:', error);
    }
    return null;
  };

  const deleteSave = () => {
    try {
      const storage = getSafeStorage();
      if (storage) {
        storage.removeItem('petit-buveur-save');
      }
      setHasActiveSave(false);
    } catch (error) {
      console.error('deleteSave: Erreur lors de la suppression:', error);
    }
  };

  const resumeGame = () => {
    const saveData = loadGame();
    
    if (saveData) {
      setPlayers(
        saveData.players.map(p => {
          const loaded = p as GamePlayer & { protectedUntilTurn?: number }
          if (loaded.protected && (loaded.protectionTurnsLeft == null || loaded.protectionTurnsLeft <= 0)) {
            return {
              ...loaded,
              protectionTurnsLeft: Math.max(saveData.players.length, 1),
            }
          }
          return loaded
        })
      );
      setCurrentPlayer(saveData.currentPlayer);
      setTurnCount(saveData.turnCount);
      setGameDifficulty(resolveDifficulty(saveData.gameDifficulty));
      setLastCase(normalizeSavedCase(saveData.lastCase));
      setGameStarted(saveData.gameStarted);
      setWinner(saveData.winner);
      setShowSaveDialog(false);
    } else {
    }
  };

  // Vérifier s'il y a une sauvegarde au chargement (sans reprendre automatiquement)
  useEffect(() => {
    const saveData = loadGame();
    setHasActiveSave(!!saveData);
  }, []);

  const hasInitializedRef = useRef(false);

  // Démarrage automatique : le menu est géré par page.tsx
  useEffect(() => {
    if (hasInitializedRef.current || gameStarted) return;
    hasInitializedRef.current = true;

    if (initialMode === 'resume') {
      const saveData = loadGame();
      if (saveData?.gameStarted) {
        resumeGame();
        return;
      }
    }

    if (players.length >= 2) {
      startGame();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  // Sauvegarde automatique quand la partie change
  useEffect(() => {
    if (gameStarted && !winner) {
      // Sauvegarde automatique toutes les 30 secondes (sauvegarde de sécurité)
      const autoSaveInterval = setInterval(() => {
        saveGame();
      }, 30000);
      
      return () => clearInterval(autoSaveInterval);
    }
  }, [gameStarted, players, currentPlayer, turnCount, winner, saveGame]);

  // Surveiller les changements d'état du jeu
  useEffect(() => {
  }, [gameStarted, players.length, currentPlayer]);



  const addPlayer = () => {
    const trimmed = newPlayerName.trim()
    if (!trimmed || players.length >= 15) return

    const validationError = getPlayerNameValidationError(trimmed)
    if (validationError) {
      void reportProfanityIfNeeded(trimmed, validationError, 'local_player_add')
      const key = nameValidationI18nKey(validationError)
      const messageKey =
        validationError === 'invalid_characters' ? 'invalidCharactersPlayer' : key
      setNewPlayerNameError(tCommon(`nameValidation.${messageKey}`))
      return
    }

    const validName = resolveValidatedPlayerName(trimmed)
    if (!validName) return

    setNewPlayerNameError(null)
    setPlayers([
      ...players,
      {
        id: Date.now().toString(),
        name: validName,
          position: 0,
          drinks: 0,
          preferences: {
            color: playerColors[players.length % playerColors.length],
            icon: PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)]
          },
          skipNextTurn: false,
          anchored: false,
          mirrorDrinkTargetId: undefined,
          mirrorDrinkTurns: 0,
        } as GamePlayer
    ])
    setNewPlayerName('')
  }

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  }

  /** Protection active pendant un tour de table complet (tous les autres joueurs jouent une fois). */
  const isPlayerProtected = (player: GamePlayer) =>
    player.protected && (player.protectionTurnsLeft ?? 0) > 0

  const tickProtectionTurns = (list: GamePlayer[]) => {
    list.forEach(p => {
      if (!p.protected || p.protectionTurnsLeft == null) return
      p.protectionTurnsLeft -= 1
      if (p.protectionTurnsLeft <= 0) {
        p.protected = false
        p.protectionTurnsLeft = undefined
      }
    })
  }

  const getProtectionRemainingRounds = (player: GamePlayer) =>
    Math.max(1, Math.ceil((player.protectionTurnsLeft ?? 1) / Math.max(players.length, 1)))

  type DrinkPropagation = { skipMirror?: boolean; skipChain?: boolean }

  function addPlayerDrinks(
    playerId: string,
    drinks: number,
    list: GamePlayer[],
    propagation: DrinkPropagation = {}
  ) {
    if (drinks <= 0) return
    const player = list.find(p => p.id === playerId)
    if (!player) return
    if (isPlayerProtected(player)) return

    player.drinks += drinks
    try {
      updatePlayerStats(player.id, 'petit-buveur', { totalDrinks: player.drinks })
    } catch (error) {
      console.error('Erreur lors de la mise à jour des statistiques:', error)
    }

    if (!propagation.skipMirror) {
      for (const initiator of list) {
        if ((initiator.mirrorDrinkTurns ?? 0) <= 0 || !initiator.mirrorDrinkTargetId) continue
        const targetId = initiator.mirrorDrinkTargetId
        if (playerId === initiator.id) {
          addPlayerDrinks(targetId, drinks, list, { ...propagation, skipMirror: true })
          break
        }
        if (playerId === targetId) {
          addPlayerDrinks(initiator.id, drinks, list, { ...propagation, skipMirror: true })
          break
        }
      }
    }

    if (!propagation.skipChain) {
      for (const initiator of list) {
        if (!initiator.linkedTo || initiator.linkedTurns <= 0) continue
        const partnerId = initiator.linkedTo
        if (playerId === initiator.id) {
          addPlayerDrinks(partnerId, drinks, list, { ...propagation, skipChain: true })
          break
        }
        if (playerId === partnerId) {
          addPlayerDrinks(initiator.id, drinks, list, { ...propagation, skipChain: true })
          break
        }
      }
    }
  }

  /** Défi en chaîne : décrémenté en fin de tour de l'initiateur (après un lancer de dé). */
  const tickChainLinkOnTurnEnd = (player: GamePlayer) => {
    if (!player.linkedTo || player.linkedTurns <= 0) return
    player.linkedTurns -= 1
    if (player.linkedTurns <= 0) player.linkedTo = undefined
  }

  /** Miroir inversé : décrémenté en fin du tour de l'initiateur (après un lancer de dé). */
  const tickMirrorLinkOnTurnEnd = (player: GamePlayer) => {
    if ((player.mirrorDrinkTurns ?? 0) <= 0) return
    player.mirrorDrinkTurns = (player.mirrorDrinkTurns ?? 1) - 1
    if ((player.mirrorDrinkTurns ?? 0) <= 0) player.mirrorDrinkTargetId = undefined
  }

  const tickInitiatorTimedEffectsOnTurnEnd = (player: GamePlayer, hadDiceRoll: boolean) => {
    if (!hadDiceRoll) return
    tickMirrorLinkOnTurnEnd(player)
    tickChainLinkOnTurnEnd(player)
  }

  const applyCurseAtTurnStart = (player: GamePlayer, list: GamePlayer[]) => {
    if (player.cursed <= 0) return
    if (!isPlayerProtected(player)) {
      addPlayerDrinks(player.id, 1, list)
    }
    player.cursed -= 1
  }

  const hasBlockingDialog = () =>
    showTargetDialog ||
    showWheel ||
    showDuelDialog ||
    showChanceDialog ||
    showExchangeDialog ||
    showChainDialog ||
    showTeleportDialog ||
    showVoteDialog ||
    showDeHonteDialog ||
    showPileFaceDialog ||
    wheelSpinning ||
    duelWheelSpinning

  const canRollDice = () =>
    !isDiceRolling &&
    !isProcessingTurn &&
    !hasBlockingDialog() &&
    !(showNotification && caseNotification)

  const rollDice = () => {
    if (!canRollDice()) {
      return
    }
    
    // Masquer toute notification précédente
    setShowNotification(false);
    setCaseNotification(null);
    
    // Gérer les protections et malédictions au début du tour
    const currentPlayerObj = players[currentPlayer];

    if (currentPlayerObj?.skipNextTurn) {
      const skipped = players.map((p, idx) => {
        if (idx !== currentPlayer) return p
        const next = { ...p, skipNextTurn: false }
        return next
      })
      const skippedPlayer = skipped[currentPlayer]
      if (skippedPlayer) applyCurseAtTurnStart(skippedPlayer, skipped)
      setPlayers(skipped)
      const skipOutcome = outcomeSkipTurnSelf(currentPlayerObj.id)
      showCaseOutcome({ type: 'passe-tour', effect: 0, description: undefined }, skipOutcome)
      recordLastAction(currentPlayerObj, 'passe-tour', skipOutcome, null)
      setIsProcessingTurn(true)
      return
    }
    if (currentPlayerObj) {
      const updatedPlayers = [...players];

      applyCurseAtTurnStart(currentPlayerObj, updatedPlayers)

      turnHadDiceRollRef.current = true
      setPlayers(updatedPlayers);
    }

    performDiceRoll();
  };

  /**
   * Séquence complète d'un lancer, partagée par rollDice et rerollDice :
   * overlay du dé (roule 750 ms → résultat maintenu 700 ms) → déplacement du
   * pion case par case (useSteppedPositions) → révélation de la case.
   * Le résultat est tiré immédiatement ; tout le reste n'est que mise en scène.
   */
  const performDiceRoll = () => {
    setIsProcessingTurn(true);
    setIsDiceRolling(true);

    const player = players[currentPlayer];
    if (!player) {
      setIsProcessingTurn(false);
      setIsDiceRolling(false);
      return;
    }

    const result = Math.floor(Math.random() * 6) + 1;
    const overlayIcon = <PlayerIcon player={player} size="sm" />;
    setDiceOverlay({ phase: 'rolling', playerName: player.name, playerIcon: overlayIcon });

    setTimeout(() => {
      setDiceOverlay({ phase: 'result', value: result, playerName: player.name, playerIcon: overlayIcon });

      setTimeout(() => {
        setDiceOverlay(null);
        setIsDiceRolling(false);

        let moveDelta = result;
        if (player.anchored) {
          moveDelta = 0;
        }
        lastMoveDeltaRef.current = moveDelta;

        const newPosition = Math.min(player.position + moveDelta, boardSize - 1);

        const updatedPlayers = players.map((p, idx) => {
          if (idx === currentPlayer) {
            return {
              ...p,
              position: newPosition,
              anchored: p.anchored ? false : p.anchored,
            };
          }
          return p;
        });

        // L'état saute à la position finale ; l'affichage avance case par case.
        setPlayers(updatedPlayers);
        const hopMs = Math.abs(newPosition - player.position) * 120 + 250;

        // Vérifier si le joueur a gagné (après l'arrivée visuelle du pion)
        if (newPosition === boardSize - 1) {
          setTimeout(() => {
            setWinner(updatedPlayers[currentPlayer]);
            try {
              updatePlayerStats(player.id, 'petit-buveur', {
                wins: 1
              });
            } catch (error) {
              console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
            }
            setIsProcessingTurn(false);
          }, hopMs);
          return;
        }

        // Générer un effet aléatoire (boost possible pour le joueur actuel)
        const caseType = generateCase(gameDifficulty, t, updatedPlayers[currentPlayer]);

        // Appliquer l'effet une fois le pion arrivé sur sa case
        setTimeout(() => {
          applyEffectToCurrentPlayer(caseType, newPosition, currentPlayer, updatedPlayers);
        }, hopMs);
      }, 700);
    }, 750);
  };

  const applyEffectToCurrentPlayer = (caseType: Case, currentPosition: number, playerIndex: number, currentPlayers: GamePlayer[]) => {
    const updatedPlayers = [...currentPlayers];
    const player = updatedPlayers[playerIndex];
    
    if (!player) {
      setIsProcessingTurn(false);
      return;
    }
    

    setPendingCase(caseType);
    setPendingPosition(currentPosition);
    
    // Sauvegarder la case pour répétition / rewind (sauf méta-cases)
    if (!CASE_TYPES_NO_LAST_CASE.includes(caseType.type)) {
      setLastCase(caseType);
    }
    
    setPlayers(updatedPlayers);

    const opponentsOnCase = updatedPlayers.filter(
      p => p.position === currentPosition && p.id !== player.id
    );
    const canOfferDuel = currentPosition > 0 && opponentsOnCase.length >= 1;

    if (canOfferDuel) {
      setDuelBoardPosition(currentPosition);
      setDuelPhase('pick');
      setDuelOpponentId(null);
      setDuelWheelSegments([]);
      setDuelWheelResult(null);
      setDuelWheelSpinning(false);
      duelWheelRotation.set(0);
      setCaseNotification(null);
      setTimeout(() => setShowDuelDialog(true), 100);
      return;
    }

    continueCaseFlow(caseType);
  };

  const proceedToTargetSelection = (_caseType: Case) => {
    setCaseNotification(null)
    setTimeout(() => {
      setShowTargetDialog(true)
    }, 120)
  }

  /** Roue des gorgées / défis : toujours pour le joueur au tour, sans ciblage. */
  const openWheelForCurrentPlayer = (mode: 'drinks' | 'defis' = wheelMode) => {
    wheelOutcomeAppliedRef.current = false
    setWheelMode(mode)
    setWheelSegments(mode === 'defis' ? generateDefiWheelSegments() : generateWheelSegments())
    setWheelResult(null)
    setWheelSpinning(false)
    setShowTargetDialog(false)
    setCaseNotification(null)
    setShowWheel(true)
  }

  /** Liste structurée des effets actifs (tous joueurs). */
  const collectActiveEffects = (): ActiveEffectItem[] => {
    const items: ActiveEffectItem[] = []
    players.forEach(player => {
      if (isPlayerProtected(player)) {
        items.push({
          id: `prot-${player.id}`,
          icon: '🛡️',
          title: t('game.effects.protection'),
          description: t('game.effects.protectionDesc'),
          remainingTurns: getProtectionRemainingRounds(player),
          player,
          accentClass: 'border-blue-400/50 bg-blue-500/15',
        })
      }
      if (player.cursed > 0) {
        items.push({
          id: `curse-${player.id}`,
          icon: '👻',
          title: t('game.effects.curse'),
          description: t('game.effects.curseDesc'),
          remainingTurns: player.cursed,
          player,
          accentClass: 'border-red-400/50 bg-red-500/15',
        })
      }
      if (player.linkedTo && player.linkedTurns > 0) {
        const linked = players.find(p => p.id === player.linkedTo)
        items.push({
          id: `link-${player.id}`,
          icon: '🔗',
          title: t('game.effects.chain'),
          description: t('game.effects.chainDesc'),
          remainingTurns: player.linkedTurns,
          player,
          linkedPlayer: linked,
          accentClass: 'border-indigo-400/50 bg-indigo-500/15',
        })
      }
      if (player.skipNextTurn) {
        items.push({
          id: `skip-${player.id}`,
          icon: '⏭️',
          title: t('game.effects.skipTurn'),
          description: t('game.effects.skipTurnDesc'),
          remainingTurns: 1,
          player,
          accentClass: 'border-slate-400/50 bg-slate-500/15',
        })
      }
      if (player.anchored) {
        items.push({
          id: `anchor-${player.id}`,
          icon: '⚓',
          title: t('game.effects.anchor'),
          description: t('game.effects.anchorDesc'),
          remainingTurns: 1,
          player,
          accentClass: 'border-cyan-400/50 bg-cyan-500/15',
        })
      }
      if (player.mirrorDrinkTargetId && (player.mirrorDrinkTurns ?? 0) > 0) {
        const mirrorTarget = players.find(p => p.id === player.mirrorDrinkTargetId)
        items.push({
          id: `mirror-${player.id}`,
          icon: '🪞',
          title: t('game.effects.mirror'),
          description: mirrorTarget
            ? t('game.effects.mirrorDesc', { a: player.name, b: mirrorTarget.name })
            : t('game.effects.mirrorDescShort'),
          remainingTurns: player.mirrorDrinkTurns ?? 1,
          player,
          linkedPlayer: mirrorTarget,
          accentClass: 'border-pink-400/50 bg-pink-500/15',
        })
      }
    })
    return items
  }

  const getCaseEffectMainHtml = (description: string) => {
    const markers = [`<strong>${t('game.effects.active')}`, `<em>${t('game.effects.none').split(' ')[0]}`]
    let cut = description.length
    for (const m of markers) {
      const i = description.indexOf(m)
      if (i !== -1 && i < cut) cut = i
    }
    return description.slice(0, cut).replace(/\n\n+$/, '').trim()
  }

  const getEffectsSummaryHtml = useCallback(() => {
    const items = collectActiveEffects()
    if (items.length === 0) return `<em>${t('game.effects.none')}</em>`
    const lines = items.map(e => {
      if (e.id.startsWith('link-')) {
        const linked = players.find(p => p.id === e.player.linkedTo)
        if (linked) {
          return `🔗 ${formatPlayerNameHtml(e.player)} → ${formatPlayerNameHtml(linked)} (${t('game.turnsRemaining', { count: e.player.linkedTurns })})`
        }
      }
      if (e.id.startsWith('prot-')) {
        return `🛡️ ${tWithHtml(t, 'game.effects.protectedStatus', { player: formatPlayerNameHtml(e.player) })}`
      }
      return `👻 ${tWithHtml(t, 'game.effects.cursedStatus', { player: formatPlayerNameHtml(e.player) }, { count: e.player.cursed })}`
    })
    return `<strong>${t('game.effects.active').replace(' :', '')} :</strong>\n${lines.join('\n')}`
  }, [players, t])

  const notificationCtx = useMemo((): NotificationBuildContext => ({
    t,
    players,
    formatPlayerNameHtml: (player, opts) => formatPlayerNameHtml(player as GamePlayer, opts),
    effectsSummaryHtml: getEffectsSummaryHtml(),
    duelNoteHtml: pendingDuelNote,
    randomMessages: drinkingMessages,
    debMessages,
    compliments: simCompliments,
  }), [t, players, pendingDuelNote, drinkingMessages, debMessages, simCompliments, getEffectsSummaryHtml])

  const activeNotificationHtml = useMemo(
    () => (caseNotification ? buildNotificationHtml(caseNotification, notificationCtx) : ''),
    [caseNotification, notificationCtx]
  )

  function showCaseNotification(state: CaseNotificationState) {
    setCaseNotification(state)
    setShowNotification(true)
    setShowNextButton(true)
  }

  function showCaseOutcome(
    caseData: Case,
    outcome: EffectOutcome,
    opts?: Partial<CaseNotificationState>
  ) {
    const duelPrefix = !!pendingDuelNote
    if (pendingDuelNote) setPendingDuelNote(undefined)
    showCaseNotification({
      case: toStoredCase(caseData),
      outcome,
      duelPrefix,
      includeEffectsSummary: true,
      ...opts,
    })
  }

  const showCaseResultNotification = (
    caseType: Case,
    outcome: EffectOutcome,
    target: GamePlayer | null = null
  ) => {
    if (target) lastTargetIdRef.current = target.id
    else {
      const actor = players[currentPlayer]
      if (actor) lastTargetIdRef.current = actor.id
    }
    showCaseOutcome(caseType, outcome, { targetPlayerId: target?.id ?? null })
  }

  const recordLastAction = (
    actor: GamePlayer,
    caseType: Case['type'],
    outcome: EffectOutcome,
    target: GamePlayer | null,
    opts?: Partial<Pick<LastActionRecord, 'duelPrefix' | 'includeEffectsSummary'>>
  ) => {
    setLastActionHistory({
      turnNumber: turnCount,
      actorId: actor.id,
      caseType,
      outcome,
      targetId: target && target.id !== actor.id ? target.id : null,
      ...opts,
    })
  }

  const commitLastActionFromCurrentTurn = () => {
    const actor = players[currentPlayer]
    if (!actor || !caseNotification) return

    setLastActionHistory({
      turnNumber: turnCount,
      actorId: actor.id,
      caseType: caseNotification.case.type,
      outcome: caseNotification.outcome,
      targetId: caseNotification.targetPlayerId ?? lastTargetIdRef.current,
      duelPrefix: caseNotification.duelPrefix,
      includeEffectsSummary: caseNotification.includeEffectsSummary,
    })
  }

  const applyNoTargetCaseFlow = (caseType: Case) => {
    const { players: updated, outcome } = resolveNoTargetCase(caseType, players, {
      boardSize,
      actorIndex: currentPlayer,
      lastMoveDelta: lastMoveDeltaRef.current,
      lastCase,
    }, t, formatPlayer)
    setPlayers(updated)
    const actor = updated[currentPlayer]
    if (actor) {
      recordLastAction(actor, caseType.type, outcome, null)
    }
    showCaseResultNotification(caseType, outcome, null)
  }

  const applyTeleportChoice = (which: 'leader' | 'last') => {
    setShowTeleportDialog(false)
    const actor = players[currentPlayer]
    if (!actor || !pendingCase) return
    const partner = which === 'leader' ? getLeader(players) : getLastPlayer(players)
    const updated = players.map(p => {
      if (p.id === actor.id) return { ...p, position: partner.position }
      if (p.id === partner.id) return { ...p, position: actor.position }
      return p
    })
    setPlayers(updated)
    const teleportOutcome = outcomeI18n('game.outcomes.teleport', {
      playerRefs: { actor: actor.id, partner: partner.id },
      params: {
        rank: which === 'leader' ? t('game.outcomes.teleportLeader') : t('game.outcomes.teleportLast'),
      },
    })
    recordLastAction(actor, 'teleport', teleportOutcome, partner)
    showCaseResultNotification(pendingCase, teleportOutcome, partner)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const applyVoteTarget = (votedId: string) => {
    setShowVoteDialog(false)
    const actor = players[currentPlayer]
    const voted = players.find(p => p.id === votedId)
    if (!actor || !voted || !pendingCase) return
    const drinks = pendingCase.effect || 3
    const updated = [...players]
    if (isPlayerProtected(voted)) {
      const voteOutcome = outcomeProtectedTarget(t, voted.id)
      recordLastAction(actor, 'vote', voteOutcome, voted)
      showCaseResultNotification(pendingCase, voteOutcome, voted)
      setPendingCase(null)
      setPendingPosition(null)
      return
    }
    addPlayerDrinks(votedId, drinks, updated)
    setPlayers(updated)
    const voteOutcome = outcomeDrinks(voted.id, drinks)
    recordLastAction(actor, 'vote', voteOutcome, voted)
    showCaseResultNotification(pendingCase, voteOutcome, voted)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const clearDeHonteRollInterval = () => {
    if (deHonteRollIntervalRef.current) {
      clearInterval(deHonteRollIntervalRef.current)
      deHonteRollIntervalRef.current = null
    }
  }

  useEffect(() => () => clearDeHonteRollInterval(), [])
  useEffect(() => () => {
    if (pileFaceFlipTimeoutRef.current) clearTimeout(pileFaceFlipTimeoutRef.current)
  }, [])

  const resetPileFaceState = () => {
    if (pileFaceFlipTimeoutRef.current) {
      clearTimeout(pileFaceFlipTimeoutRef.current)
      pileFaceFlipTimeoutRef.current = null
    }
    setPileFaceChoice(null)
    setPileFaceFlipResult(null)
    setPileFaceFlipping(false)
    setPileFaceTargetId(null)
  }

  const buildDeHonteDescriptionLocal = (r: number, player: GamePlayer) =>
    buildDeHonteDescription(r, formatPlayerNameHtml(player), t)

  const rollDeHonte = () => {
    if (deHonteRolling) return
    clearDeHonteRollInterval()
    setDeHonteResult(null)
    setDeHonteRolling(true)

    const result = Math.floor(Math.random() * 6) + 1
    const duration = 900
    const interval = 90
    const steps = Math.floor(duration / interval)
    let step = 0

    deHonteRollIntervalRef.current = setInterval(() => {
      if (step < steps - 1) {
        setDeHonteDisplayValue(Math.floor(Math.random() * 6) + 1)
        step++
      } else {
        clearDeHonteRollInterval()
        setDeHonteDisplayValue(result)
        setDeHonteResult(result)
        setDeHonteRolling(false)
      }
    }, interval)
  }

  const applyDeHonteOutcome = () => {
    const r = deHonteResult
    const actor = players[currentPlayer]
    if (r == null || !actor || !pendingCase) return

    const updated = [...players]
    const p = updated[currentPlayer]
    if (!p) return

    if (r > 2 && r <= 4) {
      const drinks = 2
      addPlayerDrinks(p.id, drinks, updated)
    } else if (r === 5) {
      p.position = Math.min(p.position + 1, boardSize - 1)
    } else if (r === 6) {
      p.position = Math.max(0, p.position - 1)
    }

    setPlayers(updated)
    clearDeHonteRollInterval()
    setDeHonteRolling(false)
    setDeHonteResult(null)
    setShowDeHonteDialog(false)
    let deHonteKey = 'shameDice.outcomeBack'
    if (r <= 2) deHonteKey = 'shameDice.outcomeSafe'
    else if (r <= 4) deHonteKey = 'shameDice.outcomeDrink'
    else if (r === 5) deHonteKey = 'shameDice.outcomeAdvance'
    const deHonteOutcome = outcomeI18n(deHonteKey, { params: { roll: r }, playerRefs: { player: p.id } })
    recordLastAction(actor, 'de-honte', deHonteOutcome, null)
    showCaseResultNotification(pendingCase, deHonteOutcome, null)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const startPileFaceFlip = (choice: CoinSide) => {
    if (pileFaceFlipping) return
    const flip: CoinSide = Math.random() < 0.5 ? 'pile' : 'face'
    setPileFaceChoice(choice)
    setPileFaceFlipResult(flip)
    setPileFaceFlipping(true)
    if (pileFaceFlipTimeoutRef.current) clearTimeout(pileFaceFlipTimeoutRef.current)
    pileFaceFlipTimeoutRef.current = setTimeout(() => {
      setPileFaceFlipping(false)
      pileFaceFlipTimeoutRef.current = null
    }, 2200)
  }

  const applyPileFaceOutcome = () => {
    const targetId = pileFaceTargetId
    const choice = pileFaceChoice
    const flip = pileFaceFlipResult
    setShowPileFaceDialog(false)
    resetPileFaceState()

    const actor = players[currentPlayer]
    const target = targetId ? players.find(p => p.id === targetId) : null
    if (!actor || !target || !pendingCase || !choice || !flip) return

    const wins = choice === flip
    const drinks = pendingCase.effect || 2
    const updated = [...players]
    const tp = updated.find(p => p.id === target.id)
    if (!tp) return

    let pileFaceOutcome: EffectOutcome
    if (wins) {
      pileFaceOutcome = outcomeI18n('game.outcomes.pileFaceWin', {
        playerRefs: { player: tp.id },
        params: { choice: t(`coinFlip.${choice}`), result: t(`coinFlip.${flip}`) },
      })
    } else {
      addPlayerDrinks(tp.id, drinks, updated)
      pileFaceOutcome = outcomeI18n('game.outcomes.pileFaceLose', {
        playerRefs: { player: tp.id },
        params: { result: t(`coinFlip.${flip}`), count: drinks },
      })
    }
    setPlayers(updated)
    recordLastAction(actor, 'pile-face', pileFaceOutcome, target)
    showCaseResultNotification(pendingCase, pileFaceOutcome, target)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const continueCaseFlow = (caseType: Case) => {
    if (caseType.type === 'roue') {
      openWheelForCurrentPlayer('drinks')
      return
    }
    if (caseType.type === 'roue-defis') {
      openWheelForCurrentPlayer('defis')
      return
    }
    if (CASES_NO_TARGET.has(caseType.type)) {
      applyNoTargetCaseFlow(caseType)
      return
    }
    if (caseType.type === 'de-honte') {
      clearDeHonteRollInterval()
      setDeHonteResult(null)
      setDeHonteRolling(false)
      setDeHonteDisplayValue(Math.floor(Math.random() * 6) + 1)
      setShowDeHonteDialog(true)
      return
    }
    if (caseType.type === 'vote') {
      setShowVoteDialog(true)
      return
    }
    if (caseType.type === 'teleport') {
      setShowTeleportDialog(true)
      return
    }
    if (caseType.type === 'double-case') {
      const first = generateCase(gameDifficulty, t, players[currentPlayer])
      const second = generateCase(gameDifficulty, t, players[currentPlayer])
      extraCaseQueueRef.current = [second]
      setPendingCase(first)
      setTimeout(() => continueCaseFlow(first), 0)
      return
    }
    proceedToTargetSelection(caseType)
  }

  const resetDuelState = () => {
    setShowDuelDialog(false);
    setDuelPhase('pick');
    setDuelBoardPosition(null);
    setDuelOpponentId(null);
    setDuelWheelSegments([]);
    setDuelWheelResult(null);
    setDuelWheelSpinning(false);
    duelWheelRotation.set(0);
  };

  const skipDuelAndTarget = () => {
    resetDuelState();
    if (pendingCase) {
      continueCaseFlow(pendingCase);
    } else {
      setIsProcessingTurn(false);
    }
  };

  const startDuelWithOpponent = (opponentId: string) => {
    setDuelOpponentId(opponentId);
    setDuelWheelSegments(generateDuelWheelSegments());
    setDuelWheelResult(null);
    setDuelWheelSpinning(false);
    duelWheelRotation.set(0);
    setDuelPhase('wheel');
  };

  const applyDuelOutcome = (
    challengerId: string,
    opponentId: string,
    challengerWins: boolean
  ) => {
    setPlayers(prev =>
      prev.map(p => {
        if (challengerWins && p.id === opponentId) {
          return { ...p, position: Math.max(0, p.position - 1) }
        }
        if (!challengerWins && p.id === challengerId) {
          return { ...p, position: Math.max(0, p.position - 1) }
        }
        return p
      })
    )
  }

  const buildDuelOutcomeNote = (
    challengerWins: boolean,
    challenger: GamePlayer,
    opponent: GamePlayer
  ) => {
    if (challengerWins) {
      return t('game.outcomes.duelChallengerWins', { challenger: challenger.name, opponent: opponent.name })
    }
    return t('game.outcomes.duelOpponentWins', { challenger: challenger.name, opponent: opponent.name })
  }

  const finishDuelAndTarget = () => {
    const caseToResolve = pendingCase
    const opponentId = duelOpponentId
    const challenger = players[currentPlayer]
    const opponent = opponentId ? players.find(p => p.id === opponentId) : null
    const challengerWins = duelWheelResult?.value === 1

    let duelNote: string | undefined
    if (duelWheelResult && challenger && opponent) {
      applyDuelOutcome(challenger.id, opponent.id, challengerWins)
      duelNote = buildDuelOutcomeNote(challengerWins, challenger, opponent)
    }

    resetDuelState()

    if (duelNote) {
      setPendingDuelNote(duelNote)
    }
    if (caseToResolve) {
      setTimeout(() => {
        continueCaseFlow(caseToResolve)
      }, 80)
    } else {
      setIsProcessingTurn(false)
    }
  }

  const movePlayer = (playerId: string, newPosition: number) => {
    // Fonction simplifiée pour déplacer un joueur directement
    setPlayers(prevPlayers => 
      prevPlayers.map(p => p.id === playerId ? { ...p, position: newPosition } : p)
    );
  };

  const clearTurnBlockingUi = () => {
    setShowNotification(false)
    setShowNextButton(false)
    setShowTargetDialog(false)
    setShowWheel(false)
    setWheelResult(null)
    setWheelSpinning(false)
    wheelOutcomeAppliedRef.current = false
    resetDuelState()
    setShowChanceDialog(false)
    setShowExchangeDialog(false)
    setShowChainDialog(false)
    setShowTeleportDialog(false)
    setShowVoteDialog(false)
    setShowDeHonteDialog(false)
    setShowPileFaceDialog(false)
    resetPileFaceState()
    setDeHonteResult(null)
    setDeHonteRolling(false)
    clearDeHonteRollInterval()
    extraCaseQueueRef.current = []
    setPendingCase(null)
    setPendingPosition(null)
    setPendingDuelNote(undefined)
    setCaseNotification(null)
    setPendingChallenge(null)
  }

  const openChallengeResolution = (
    targetPlayer: GamePlayer,
    caseToApply: Case,
    updatedPlayers: GamePlayer[],
  ) => {
    lastTargetIdRef.current = targetPlayer.id
    setPlayers(updatedPlayers)
    setPendingChallenge({
      targetId: targetPlayer.id,
      drinks: caseToApply.effect,
      case: toStoredCase(caseToApply),
    })
    showCaseNotification({
      case: toStoredCase(caseToApply),
      outcome: outcomeCompose(
        outcomeCaseBase(),
        outcomeI18n('game.targetLabel', { playerRefs: { player: targetPlayer.id } })
      ),
      targetPlayerId: targetPlayer.id,
      duelPrefix: !!pendingDuelNote,
      includeEffectsSummary: true,
    })
    if (pendingDuelNote) setPendingDuelNote(undefined)
  }

  const resolveChallengeChoice = (completed: boolean) => {
    if (!pendingChallenge || !caseNotification) return

    const { targetId, drinks } = pendingChallenge
    setPlayers(prev => {
      const updated = [...prev]
      const target = updated.find(p => p.id === targetId)
      if (!target) return prev
      if (!completed) addPlayerDrinks(targetId, drinks, updated)
      return updated
    })
    setCaseNotification(prev =>
      prev
        ? {
            ...prev,
            outcome: outcomeCompose(
              prev.outcome,
              outcomeChallengeResult(targetId, completed, drinks)
            ),
          }
        : prev
    )
    setPendingChallenge(null)
  }

  const incrementPlayerTurn = (playersSnapshot?: GamePlayer[]) => {
    const leavingIndex = currentPlayer
    const hadDiceRoll = turnHadDiceRollRef.current
    turnHadDiceRollRef.current = false

    const nextPlayer = (leavingIndex + 1) % players.length
    const nextTurnCount = nextPlayer === 0 ? turnCount + 1 : turnCount
    const updated = [...(playersSnapshot ?? players)]
    tickProtectionTurns(updated)
    const leaving = updated[leavingIndex]
    if (leaving) tickInitiatorTimedEffectsOnTurnEnd(leaving, hadDiceRoll)

    setPlayers(updated)
    setCurrentPlayer(nextPlayer)
    if (nextPlayer === 0) {
      setTurnCount(nextTurnCount)
    }

    return { nextPlayer, nextTurnCount, updatedPlayers: updated }
  }

  const advanceToNextPlayer = () => {
    clearTurnBlockingUi()
    const { nextPlayer, nextTurnCount, updatedPlayers } = incrementPlayerTurn()
    setIsProcessingTurn(false)
    setIsDiceRolling(false)
    saveGame({ currentPlayer: nextPlayer, turnCount: nextTurnCount, players: updatedPlayers })
  }

  // Fonction pour gérer le clic sur le bouton "{t('game.next')}"
  const handleNextButtonClick = () => {
    if (pendingChallenge) return
    commitLastActionFromCurrentTurn()
    if (extraCaseQueueRef.current.length > 0) {
      const nextCase = extraCaseQueueRef.current.shift()!
      setShowNotification(false)
      setShowNextButton(false)
      setCaseNotification(null)
      setPendingCase(nextCase)
      setTimeout(() => continueCaseFlow(nextCase), 80)
      return
    }
    advanceToNextPlayer()
  };

  // Fonction utilitaire pour remplacer les passages automatiques
  const replaceAutomaticNextPlayer = () => {
    // Ne rien faire - le passage se fait maintenant via le bouton "{t('game.next')}"
  };

  const handleTargetSelection = (targetId: string) => {
    lastTargetIdRef.current = targetId

    // {t('game.close')} la fenêtre de ciblage
    setShowTargetDialog(false);
    
    
    if (!pendingCase) {
      setIsProcessingTurn(false);
      return;
    }
    
    // Trouver le joueur ciblé
    const targetPlayer = players.find(p => p.id === targetId);
    if (!targetPlayer) {
      setIsProcessingTurn(false);
      return;
    }

    // Cas spéciaux pour les nouvelles cases
    if (pendingCase.type === 'roue') {
      openWheelForCurrentPlayer()
      return
    }
    
    if (pendingCase.type === 'chance') {
      setShowChanceDialog(true);
      return;
    }
    
    if (pendingCase.type === 'echange') {
      setShowExchangeDialog(true);
      return;
    }
    
    if (pendingCase.type === 'defi-chaine') {
      setShowChainDialog(true);
      return;
    }

    if (pendingCase.type === 'pile-face') {
      setPileFaceTargetId(targetId)
      setShowPileFaceDialog(true)
      return
    }
    
    if (pendingCase.type === 'repetition') {
      if (isReplayableCase(lastCase)) {
        applyEffectToPlayer(targetId, lastCase);
        return;
      }
      showCaseOutcome({ type: 'normal', effect: 0 }, outcomeNoPreviousCase(), { includeEffectsSummary: true })
      return;
    }

    if (pendingCase.type === 'rewind') {
      applyEffectToPlayer(targetId);
      return;
    }

    applyEffectToPlayer(targetId);
  };

  const applyEffectToPlayer = (targetPlayerId: string, customCase?: Case) => {
    lastTargetIdRef.current = targetPlayerId

    const caseToApply = customCase || pendingCase;
    if (!caseToApply || pendingPosition === null) {
      setIsProcessingTurn(false);
      return;
    }
    
    
    // Créer une copie des joueurs pour la mise à jour
    const updatedPlayers = [...players];
    const targetPlayer = updatedPlayers.find(p => p.id === targetPlayerId);
    
    if (!targetPlayer) {
      setIsProcessingTurn(false);
      return;
    }
    
    
    const notifyOpts = { targetPlayerId: targetPlayerId }

    switch (caseToApply.type) {
      case 'normal':
        showCaseOutcome(caseToApply, outcomeSafeCase(targetPlayerId), notifyOpts)
        return

      case 'gorgée':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        addPlayerDrinks(targetPlayer.id, caseToApply.effect, updatedPlayers)
        showCaseOutcome(caseToApply, outcomeDrinks(targetPlayerId, caseToApply.effect), notifyOpts)
        return

      case 'defi':
      case 'question':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        openChallengeResolution(targetPlayer, caseToApply, updatedPlayers)
        return

      case 'tous':
        updatedPlayers.forEach((p) => {
          if (p.id !== targetPlayerId) {
            addPlayerDrinks(p.id, caseToApply.effect, updatedPlayers)
          }
        })
        showCaseOutcome(caseToApply, outcomeSpared(targetPlayerId), notifyOpts)
        return

      case 'avance':
      case 'recul':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        if (caseToApply.type === 'recul' && targetPlayer.position === 0) {
          showCaseOutcome(caseToApply, outcomeCannotRecul(targetPlayerId), notifyOpts)
          return
        }
        {
          const effectPosition = Math.max(0, Math.min(boardSize - 1, targetPlayer.position + caseToApply.effect))
          targetPlayer.position = effectPosition
          if (effectPosition === boardSize - 1) {
            setPlayers(updatedPlayers)
            setWinner(targetPlayer)
            try {
              updatePlayerStats(targetPlayer.id, 'petit-buveur', { wins: 1 })
            } catch (error) {
              console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error)
            }
            setIsProcessingTurn(false)
            return
          }
          showCaseOutcome(
            caseToApply,
            outcomeMove(
              targetPlayerId,
              caseToApply.type === 'avance' ? '➡️' : '⬅️',
              targetPlayer.position - caseToApply.effect + 1,
              targetPlayer.position + 1
            ),
            notifyOpts
          )
        }
        return

      case 'bombe': {
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        updatedPlayers.forEach((p) => {
          const amount = p.id === targetPlayerId ? caseToApply.effect * 2 : caseToApply.effect
          addPlayerDrinks(p.id, amount, updatedPlayers)
        })
        setPlayers(updatedPlayers)
        showCaseOutcome(
          caseToApply,
          outcomeBombe(targetPlayerId, caseToApply.effect, targetPlayer.name),
          notifyOpts
        )
        return
      }

      case 'protection': {
        const protectionTurns = Math.max(players.length, 1)
        targetPlayer.protected = true
        targetPlayer.protectionTurnsLeft = protectionTurns
        setPlayers(updatedPlayers)
        showCaseOutcome(caseToApply, outcomeProtectionApplied(targetPlayerId), notifyOpts)
        return
      }

      case 'malediction':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          setTimeout(() => setShowNotification(false), 3000)
          setTimeout(() => {
            commitLastActionFromCurrentTurn()
            const { nextPlayer, nextTurnCount, updatedPlayers } = incrementPlayerTurn()
            setIsProcessingTurn(false)
            saveGame({ currentPlayer: nextPlayer, turnCount: nextTurnCount, players: updatedPlayers })
          }, 2000)
          return
        }
        targetPlayer.cursed = caseToApply.effect || 3
        showCaseOutcome(
          caseToApply,
          outcomeCurseApplied(targetPlayerId, caseToApply.effect || 3),
          notifyOpts
        )
        return

      case 'miroir':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        {
          const sortedPlayers = [...updatedPlayers].sort((a, b) => b.position - a.position)
          const mirrorPositions = sortedPlayers.map(p => p.position)
          updatedPlayers.forEach((p) => {
            const sortedIndex = sortedPlayers.findIndex(sp => sp.id === p.id)
            const invertedIndex = mirrorPositions.length - 1 - sortedIndex
            p.position = mirrorPositions[invertedIndex]
          })
          showCaseOutcome(caseToApply, outcomeMiroirSwap(targetPlayerId), notifyOpts)
        }
        return

      case 'piege': {
        const trapDrinks = targetPlayer.position + 1
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(
            caseToApply,
            outcomeTrapProtected(t, targetPlayerId, trapDrinks, targetPlayer.position + 1),
            notifyOpts
          )
          return
        }
        addPlayerDrinks(targetPlayer.id, trapDrinks, updatedPlayers)
        showCaseOutcome(
          caseToApply,
          outcomeTrap(targetPlayerId, trapDrinks, targetPlayer.position + 1),
          notifyOpts
        )
        return
      }

      case 'passe-tour':
        targetPlayer.skipNextTurn = true
        setPlayers(updatedPlayers)
        showCaseOutcome(caseToApply, outcomeSkipTurnNext(targetPlayerId), notifyOpts)
        return

      case 'double-peine': {
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        const doubled = caseToApply.effect * 2
        addPlayerDrinks(targetPlayer.id, doubled, updatedPlayers)
        setPlayers(updatedPlayers)
        showCaseOutcome(caseToApply, outcomeDoublePeine(targetPlayerId, doubled), notifyOpts)
        return
      }

      case 'copie': {
        const delta = lastMoveDeltaRef.current
        const before = targetPlayer.position
        targetPlayer.position = Math.max(
          0,
          Math.min(boardSize - 1, targetPlayer.position + delta)
        )
        setPlayers(updatedPlayers)
        showCaseOutcome(
          caseToApply,
          outcomeCopie(targetPlayerId, delta, before + 1, targetPlayer.position + 1),
          notifyOpts
        )
        return
      }

      case 'roulette-russe': {
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeRouletteProtected(t, targetPlayerId), notifyOpts)
          return
        }
        const hit = Math.random() < 1 / 3
        if (hit) {
          addPlayerDrinks(targetPlayer.id, caseToApply.effect, updatedPlayers)
          setPlayers(updatedPlayers)
          showCaseOutcome(caseToApply, outcomeRouletteMiss(targetPlayerId, caseToApply.effect), notifyOpts)
        } else {
          showCaseOutcome(caseToApply, outcomeRouletteSafe(targetPlayerId), notifyOpts)
        }
        return
      }

      case 'ancre':
        targetPlayer.anchored = true
        setPlayers(updatedPlayers)
        showCaseOutcome(caseToApply, outcomeAnchorApplied(targetPlayerId), notifyOpts)
        return

      case 'inversion': {
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        const lastPlace = updatedPlayers.reduce((min, p) =>
          p.position < min.position ? p : min
        )
        addPlayerDrinks(lastPlace.id, caseToApply.effect, updatedPlayers)
        setPlayers(updatedPlayers)
        showCaseOutcome(
          caseToApply,
          outcomeInversion(lastPlace.id, targetPlayerId, caseToApply.effect),
          notifyOpts
        )
        return
      }

      case 'miroir-inverse': {
        const actor = updatedPlayers[currentPlayer]
        if (actor) {
          actor.mirrorDrinkTargetId = targetPlayerId
          actor.mirrorDrinkTurns = caseToApply.effect || 1
        }
        setPlayers(updatedPlayers)
        showCaseOutcome(
          caseToApply,
          outcomeMirrorLink(actor?.id ?? targetPlayerId, targetPlayerId, actor?.mirrorDrinkTurns ?? 1),
          notifyOpts
        )
        return
      }

      case 'rewind':
        if (isReplayableCase(lastCase)) {
          applyEffectToPlayer(targetPlayerId, lastCase)
          return
        }
        showCaseOutcome(caseToApply, outcomeRewindSafe(targetPlayerId), notifyOpts)
        return

      case 'melange':
        if (isPlayerProtected(targetPlayer)) {
          showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), notifyOpts)
          return
        }
        {
          const shufflePositions = updatedPlayers.map(p => p.position)
          const shuffledPositions = [...shufflePositions].sort(() => Math.random() - 0.5)
          updatedPlayers.forEach((p, index) => {
            p.position = shuffledPositions[index]
          })
          showCaseOutcome(caseToApply, outcomeMelange(targetPlayerId), notifyOpts)
        }
        return

      default:
        showCaseOutcome(
          caseToApply,
          outcomeGenericApplied(targetPlayerId, caseToApply.type),
          notifyOpts
        )
        return
    }
    
    // Mettre à jour l'état des joueurs
    setPlayers(updatedPlayers);

    // Réinitialiser les états
    setTimeout(() => {
      setPendingCase(null);
      setPendingPosition(null);
      
      // Ne pas passer automatiquement au joueur suivant - c'est le bouton "{t('game.next')}" qui s'en charge
      // setIsProcessingTurn(false);
    }, 500);
  };

  const selectRandomPlayer = () => {
    const eligiblePlayers = [...players];
    if (eligiblePlayers.length > 0) {
      const weights = eligiblePlayers.map((p) => 1 / (1 + getPlayerGameBoost(p, 'petit-buveur') / 100));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      let chosen = eligiblePlayers[0];
      for (let i = 0; i < eligiblePlayers.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          chosen = eligiblePlayers[i];
          break;
        }
      }
      handleTargetSelection(chosen.id);
    } else {
      handleTargetSelection(players[currentPlayer].id);
    }
  };

  const startGame = () => {
    
    if (players.length >= 2) {
      
      // Réinitialiser les positions et les boissons des joueurs
      const resetPlayers = players.map(p => ({
        ...p,
        position: 0,
        drinks: 0,
        protected: false,
        protectionTurnsLeft: undefined,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
      }));
      
      // Mettre à jour l'état des joueurs
      setPlayers(resetPlayers);
      extraCaseQueueRef.current = [];
      
      // Initialiser tous les états du jeu
      setGameStarted(true);
      setCurrentPlayer(0);
      setWinner(null);
      setTurnCount(1);
      setCaseNotification(null);
      setLastActionHistory(null);
      lastTargetIdRef.current = null;
      setIsProcessingTurn(false);
      setIsDiceRolling(false);
      setSelectingPlayer(false);
      setSelectedPosition(null);
      setPendingCase(null);
      setPendingPosition(null);
      setTargetPlayerId(null);
      setShowNotification(false);
      setShowNextButton(false);
      setShowTargetDialog(false);
      setShowWheel(false);
      setShowChanceDialog(false);
      setShowExchangeDialog(false);
      setShowChainDialog(false);

      try {
        const storage = getSafeStorage();
        if (storage) {
          storage.setItem(
            'petit-buveur-save',
            JSON.stringify({
              id: `save_${Date.now()}`,
              timestamp: Date.now(),
              players: resetPlayers,
              currentPlayer: 0,
              turnCount: 1,
              gameDifficulty,
              lastCase: null,
              gameStarted: true,
              winner: null,
            } satisfies GameSave)
          );
          setHasActiveSave(true);
        }
      } catch (error) {
        console.error('startGame: Erreur lors de la sauvegarde initiale:', error);
      }
      
    } else {
      alert('Il faut au moins 2 joueurs pour commencer une partie !');
    }
  }

  const resetGame = useCallback(() => {
    setPlayers(
      initialPlayers.map(p => ({
        ...p,
        position: 0,
        drinks: 0,
        protected: false,
        protectionTurnsLeft: undefined,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
        color: defaultColor
      }))
    );
    extraCaseQueueRef.current = [];
    setCurrentPlayer(0);
    setWinner(null);
    setShowVictoryScreen(false);
    setCaseNotification(null);
    setIsProcessingTurn(false);
    setIsDiceRolling(false);
    setSelectedPosition(null);
    setShowNotification(false);
    setTargetPlayerId(null);
    setShowTargetDialog(false);
    setTurnCount(1);
    setGameDifficulty(difficulty);
    setGameStarted(true);
  }, [initialPlayers, setPlayers, difficulty]);

  const getBgColor = () => {
    return 'bg-gray-800 text-white'
  }

  const getTextColor = () => {
    return 'text-white'
  }

  const getPlayerRanking = () => {
    return [...players].sort((a, b) => b.position - a.position)
  }

  const getRankBadgeClass = (index: number) => {
    if (index === 0) return 'border-amber-400/45 bg-amber-500/20 text-amber-100'
    if (index === 1) return 'border-white/25 bg-white/10 text-white/80'
    if (index === 2) return 'border-orange-500/35 bg-orange-600/15 text-orange-100'
    return 'border-white/10 bg-white/5 text-white/50'
  }

  const renderRankBadge = (index: number, size: 'sm' | 'md' = 'md') => (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-bold tabular-nums',
        size === 'sm' ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-6 min-w-6 px-1.5 text-xs',
        getRankBadgeClass(index)
      )}
    >
      {index + 1}
    </span>
  )

  /** Bandeau classement compact (réutilisé dans les modales de ciblage). */
  const renderCompactRanking = () => (
    <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Classement
      </p>
      <ul className="space-y-1">
        {getPlayerRanking().map((player, index) => {
          const isActive = players[currentPlayer]?.id === player.id
          return (
            <li
              key={player.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                isActive ? 'bg-emerald-500/10' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {renderRankBadge(index, 'sm')}
                <PlayerIcon player={player} size="sm" className="h-5 w-5 shrink-0 text-xs" />
                <PlayerName
                  player={player}
                  className={`truncate font-medium ${isActive ? 'text-emerald-300' : ''}`}
                />
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                case {player.position + 1}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )

  const renderPlayerChip = (player: GamePlayer, size: 'sm' | 'md' = 'sm') => {
    const textSize = size === 'md' ? 'text-sm' : 'text-xs'
    const iconSize = size === 'md' ? 'h-8 w-8 text-base' : 'h-6 w-6 text-sm'
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <PlayerIcon player={player} size={size} className={`${iconSize} shrink-0`} />
        <PlayerName player={player} className={`${textSize} max-w-[6rem] truncate font-semibold text-amber-200 sm:max-w-[8rem]`} />
      </div>
    )
  }

  const renderActiveEffectCard = (effect: ActiveEffectItem) => (
    <div
      key={effect.id}
      className={`rounded-xl border p-3 ${effect.accentClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">{effect.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-white">{effect.title}</span>
            <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/80">
              {formatEffectRemainingTurns(effect.remainingTurns, t)} restant{effect.remainingTurns > 1 ? 's' : ''}
            </span>
          </div>
          {effect.linkedPlayer ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {renderPlayerChip(effect.player, 'md')}
              <span className="shrink-0 text-base font-bold text-indigo-300" aria-hidden="true">→</span>
              {renderPlayerChip(effect.linkedPlayer, 'md')}
            </div>
          ) : (
            <div className="mt-1">{renderPlayerChip(effect.player)}</div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-white/60">{effect.description}</p>
        </div>
      </div>
    </div>
  )

  const renderActiveEffectsSection = (className = '') => {
    const items = collectActiveEffects()
    if (items.length === 0) return null
    return (
      <div className={`rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-600/15 to-indigo-600/10 p-4 backdrop-blur-md ${className}`}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="text-sm font-semibold text-violet-100">{t('game.effects.active').replace(' :', '')}</span>
          <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[11px] font-bold text-violet-50">
            {items.length}
          </span>
        </div>
        <div className="space-y-2">
          {items.map(effect => renderActiveEffectCard(effect))}
        </div>
      </div>
    )
  }

  const renderActiveEffectsPanel = () => renderActiveEffectsSection('mt-4')

  const renderLastActionHistory = () => {
    if (!lastActionHistory) return null
    const { actorId, targetId, caseType, turnNumber } = lastActionHistory
    const actor = players.find(p => p.id === actorId)
    const target = targetId ? players.find(p => p.id === targetId) : null
    if (!actor) return null
    const caseLabel = getCaseTypeLabel(caseType, t)
    const effectHtml = buildLastActionHtml(lastActionHistory, notificationCtx)

    return (
      <div className="mt-2 rounded-xl border border-slate-500/35 bg-slate-800/50 px-3 py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <History className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('game.history.title')}
          </span>
          <span className="text-[9px] text-muted-foreground">{t('game.turn', { count: turnNumber })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <PlayerName player={actor} className="font-semibold text-slate-200" />
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-violet-300">{caseLabel}</span>
          {target ? (
            <>
              <span className="text-muted-foreground">→</span>
              <PlayerName player={target} className="font-semibold text-amber-200" />
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">{t('game.history.selfTarget')}</span>
          )}
        </div>
        <div
          className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground [&_.player-name-special]:align-baseline [&_strong]:text-slate-300"
          dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(effectHtml) }}
        />
      </div>
    )
  }

  const renderActiveEffectsChips = () => renderActiveEffectsSection('mt-3')

  const handleChainPlayerSelect = (targetPlayerId: string) => {
    setShowChainDialog(false)
    const currentPlayerObj = players[currentPlayer]
    const targetPlayerObj = players.find(p => p.id === targetPlayerId)
    if (!currentPlayerObj || !targetPlayerObj) return

    const chainTurns = pendingCase?.effect ?? 5

    const updatedPlayers = players.map(p => {
      if (p.id === currentPlayerObj.id) {
        return {
          ...p,
          linkedTo: targetPlayerObj.id,
          linkedTurns: chainTurns,
        }
      }
      return p
    })

    setPlayers(updatedPlayers)
    const chainOutcome = outcomeChainLinked(currentPlayerObj.id, targetPlayerObj.id, chainTurns)
    showCaseNotification({
      case: { type: 'defi-chaine', effect: chainTurns },
      outcome: chainOutcome,
      includeEffectsSummary: false,
    })
    recordLastAction(currentPlayerObj, 'defi-chaine', chainOutcome, targetPlayerObj)
    setTimeout(() => setShowNotification(false), 3000)

    turnHadDiceRollRef.current = false
    const turn = incrementPlayerTurn(updatedPlayers)
    setIsProcessingTurn(false)
    saveGame({
      currentPlayer: turn.nextPlayer,
      turnCount: turn.nextTurnCount,
      players: turn.updatedPlayers,
    })
  }

  const renderPlayerToken = (player: GamePlayer, playersOnCaseCount: number) => {
    const isActive = player.id === players[currentPlayer]?.id
    const iconSize =
      playersOnCaseCount === 1
        ? 'h-full w-full min-h-[1.75rem] min-w-[1.75rem] text-xl sm:text-2xl'
        : playersOnCaseCount <= 2
          ? 'h-[95%] w-[95%] text-base sm:text-xl'
          : playersOnCaseCount <= 4
            ? 'h-[92%] w-[92%] text-sm sm:text-lg'
            : 'h-[88%] w-[88%] text-xs sm:text-base'
    return (
      <motion.div
        key={player.id}
        layoutId={`pb-token-${player.id}`}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className={cn(
          'flex h-full w-full items-center justify-center',
          isActive ? 'z-10' : 'z-0',
          !isActive && playersOnCaseCount > 1 && 'opacity-90'
        )}
      >
        <PlayerIcon
          player={player}
          size="md"
          className={cn(
            iconSize,
            isActive && 'scale-110 ring-2 ring-white/80 rounded-full'
          )}
        />
      </motion.div>
    )
  }

  // Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
  const isSpecialPlayer = (player: any): boolean => {
    // Si le joueur a explicitement activé l'effet spécial dans ses préférences
    if (player.preferences?.specialEffect) {
      return true;
    }
    
    // Sinon, vérifier si c'est un des noms spéciaux par défaut
    const name = typeof player === 'string' 
      ? player.toLowerCase() 
      : player.name?.toLowerCase();
    return name === 'sim' || name === 'riqui';
  };

  // Fonction pour rendu conditionnel des animations
  const renderAnimatedComponent = (component: React.ReactNode, animationProps = {}) => {
    if (browserCapabilities.isMobile || !browserCapabilities.advancedAnimations) {
      // Version simplifiée pour mobile sans animation
      return <div className="mobile-friendly-animation">{component}</div>;
    }
    
    // Version complète avec animation pour desktop
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
        {...animationProps}
      >
        {component}
      </motion.div>
    );
  };

  // Mise à jour du rendu des cartes de joueurs dans les dialogues et les alertes
  const renderPlayerCard = (player: GamePlayer) => {
    return (
      <div className="flex items-center space-x-3 p-2">
        <PlayerIcon player={player} size="md" />
        <div className="flex flex-col">
          <PlayerName player={player} className="font-medium" />
          <span className="text-xs text-muted-foreground">
            {t('game.drinksShort', { count: player.drinks })}
          </span>
        </div>
      </div>
    )
  }

  // Correction de la fonction handleAllPlayersEffect
  const handleAllPlayersEffect = (targetPlayerId: string, drinkAmount: number) => {
    const targetPlayer = players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) return;
    
    let messageText = '';
    if (isSpecialPlayer(targetPlayer)) {
      const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
      messageText = `<span class="bg-yellow-600 text-white px-2 py-1 rounded-md font-bold">${t('game.outcomes.everyoneDrinksHonor', { count: drinkAmount, compliment })}</span>`;
    } else if (targetPlayer.name.toLowerCase() === 'deb') {
      const debMessage = debMessages[Math.floor(Math.random() * debMessages.length)];
      messageText = `<span class="bg-pink-600 text-white px-2 py-1 rounded-md">${t('game.outcomes.everyoneDrinksExcept', { count: drinkAmount })} </span> <PlayerName player={targetPlayer} className="font-bold" />`;
    } else {
      const randomMessage = randomMessages[Math.floor(Math.random() * randomMessages.length)];
      messageText = `<span class="bg-blue-600 text-white px-2 py-1 rounded-md">${t('game.outcomes.everyoneDrinksExcept', { count: drinkAmount })} </span> <PlayerName player={targetPlayer} className="font-bold" /> ${randomMessage}`;
    }
    
    // Mise à jour des gorgées pour tous les joueurs sauf la cible
    const updatedPlayers = [...players]
    updatedPlayers.forEach(p => {
      if (p.id !== targetPlayerId) {
        addPlayerDrinks(p.id, drinkAmount, updatedPlayers)
      }
    })
    
    setPlayers(updatedPlayers);

    if (messageText) {
      showCaseOutcome(
        { type: 'tous', effect: drinkAmount },
        outcomeFromLegacyHtml(messageText),
        { includeEffectsSummary: false }
      )
    }
  }

  // Fonctions utilitaires pour la roue des gorgées
  const toRad = (deg: number) => (Math.PI / 180) * deg
  const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
    const a = toRad(angleDeg)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const start = polar(cx, cy, r, startDeg)
    const end = polar(cx, cy, r, endDeg)
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
  }

  const ensureAudioCtx = async () => {
    if (!audioCtxRef.current) {
      const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
      const Ctx = win.AudioContext || win.webkitAudioContext
      if (Ctx) {
        audioCtxRef.current = new Ctx()
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try { await audioCtxRef.current.resume() } catch {}
    }
  }

  const playTick = () => {
    if (isSoundMuted()) return
    const ctx = audioCtxRef.current
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 900 + Math.random() * 300
    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(0.12, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.08)
  }

  const colorForDuelSegment = (v: number): string => (v === 1 ? '#10b981' : '#ef4444')

  // Couleur basée sur la valeur (0 = SAFE → vert; 1..12 → jaune→orange→rouge)
  const colorForValue = (v: number): string => {
    if (v === 0) return '#10b981' // SAFE vert
    const ratio = Math.max(0, Math.min(1, v / 12))
    const hue = 60 - 60 * ratio // 60 (jaune) → 0 (rouge)
    const saturation = 85
    const lightness = 55 - 10 * ratio // plus élevé = plus sombre
    return `hsl(${hue}deg ${saturation}% ${lightness}%)`
  }



  // Fonction pour faire tourner la roue
  const spinWheel = async () => {
    if (wheelSpinning || wheelSegments.length === 0) return
    setWheelSpinning(true)

    const anglePerSegment = 360 / Math.max(wheelSegments.length, 1)
    const randomIndex = Math.floor(Math.random() * wheelSegments.length)
    const segStart = randomIndex * anglePerSegment
    const segAngle = anglePerSegment
    const extraSpins = 4 + Math.floor(Math.random() * 7) // 4-10 tours
    const duration = 4 + Math.random() * 2
    const offsetWithinSegment = Math.random() * segAngle
    const targetAngle = 360 * extraSpins - (segStart + offsetWithinSegment)
    const overshootAngle = segAngle * (0.12 + Math.random() * 0.18)
    const accelAngle = targetAngle * 0.25

    await ensureAudioCtx()
    wheelRotation.set(0)
    lastWheelTickRef.current = 0

    animate(wheelRotation, [0, accelAngle, targetAngle + overshootAngle, targetAngle], {
      duration,
      times: [0, 0.25, 0.9, 1],
      ease: ['easeIn', [0.16, 1, 0.3, 1], 'easeOut'],
      onUpdate: (v) => {
        const mod = ((v % 360) + 360) % 360
        const tickIndex = Math.floor(mod / anglePerSegment)
        if (tickIndex !== lastWheelTickRef.current) { 
          lastWheelTickRef.current = tickIndex; 
          playTick() 
        }
      }
    })

    await new Promise(resolve => setTimeout(resolve, Math.ceil(duration * 1000) + 80))

    const result = wheelSegments[randomIndex]
    setWheelResult(result)
    setWheelSpinning(false)
  }

  const spinDuelWheel = async () => {
    if (duelWheelSpinning || duelWheelSegments.length === 0) return
    setDuelWheelSpinning(true)

    const anglePerSegment = 360 / duelWheelSegments.length
    const randomIndex = Math.floor(Math.random() * duelWheelSegments.length)
    const segStart = randomIndex * anglePerSegment
    const segAngle = anglePerSegment
    const extraSpins = 4 + Math.floor(Math.random() * 7)
    const duration = 4 + Math.random() * 2
    const offsetWithinSegment = Math.random() * segAngle
    const targetAngle = 360 * extraSpins - (segStart + offsetWithinSegment)
    const overshootAngle = segAngle * (0.12 + Math.random() * 0.18)
    const accelAngle = targetAngle * 0.25

    await ensureAudioCtx()
    duelWheelRotation.set(0)
    lastDuelWheelTickRef.current = 0

    animate(duelWheelRotation, [0, accelAngle, targetAngle + overshootAngle, targetAngle], {
      duration,
      times: [0, 0.25, 0.9, 1],
      ease: ['easeIn', [0.16, 1, 0.3, 1], 'easeOut'],
      onUpdate: v => {
        const mod = ((v % 360) + 360) % 360
        const tickIndex = Math.floor(mod / anglePerSegment)
        if (tickIndex !== lastDuelWheelTickRef.current) {
          lastDuelWheelTickRef.current = tickIndex
          playTick()
        }
      },
    })

    await new Promise(resolve => setTimeout(resolve, Math.ceil(duration * 1000) + 80))

    setDuelWheelResult(duelWheelSegments[randomIndex])
    setDuelWheelSpinning(false)
  }

  // Fonction pour relancer le dé (utilisée par la case Chance)
  const rerollDice = () => {
    // Réinitialiser les états de traitement
    setIsProcessingTurn(false);
    setIsDiceRolling(false);

    // Masquer toute notification précédente
    setShowNotification(false);

    performDiceRoll();
  };

  const applyWheelOutcome = useCallback(
    (result: WheelSegment) => {
      if (wheelOutcomeAppliedRef.current) return
      wheelOutcomeAppliedRef.current = true

      const currentPlayerObj = players[currentPlayer]
      if (!currentPlayerObj) return

      lastTargetIdRef.current = currentPlayerObj.id

      const isDefiWheel = wheelMode === 'defis'
      const defiDrinks =
        isDefiWheel &&
        (result.value > 0 || result.label.toLowerCase().includes('boit'))

      if (result.value > 0 || defiDrinks) {
        const drinks = defiDrinks && result.value === 0 ? 2 : result.value
        setPlayers(prev => {
          const updated = [...prev]
          const actor = updated[currentPlayer]
          if (actor) addPlayerDrinks(actor.id, drinks, updated)
          return updated
        })
        const wheelCase: Case = { type: isDefiWheel ? 'roue-defis' : 'gorgée', effect: drinks }
        showCaseOutcome(
          wheelCase,
          isDefiWheel
            ? outcomeCompose(
                outcomeI18n('game.outcomes.wheelDefi', { params: { label: result.label } }),
                defiDrinks
                  ? outcomeDrinks(currentPlayerObj.id, drinks)
                  : outcomeI18n('game.outcomes.wheelDefiPlay', { playerRefs: { player: currentPlayerObj.id } })
              )
            : outcomeCompose(
                outcomeI18n('game.outcomes.wheelResult', { params: { label: result.label } }),
                outcomeI18n('game.outcomes.wheelDrink', { playerRefs: { player: currentPlayerObj.id } })
              ),
          { targetPlayerId: currentPlayerObj.id }
        )
      } else {
        const wheelCase: Case = { type: isDefiWheel ? 'roue-defis' : 'normal', effect: isDefiWheel ? 2 : 0 }
        showCaseOutcome(
          wheelCase,
          isDefiWheel
            ? outcomeCompose(
                outcomeI18n('game.outcomes.wheelDefi', { params: { label: result.label } }),
                outcomeI18n('game.outcomes.wheelDefiOrDrink', { playerRefs: { player: currentPlayerObj.id } })
              )
            : outcomeCompose(
                outcomeI18n('game.outcomes.wheelResult', { params: { label: 'SAFE' } }),
                outcomeI18n('game.outcomes.wheelSafePlayer', { playerRefs: { player: currentPlayerObj.id } })
              ),
          { targetPlayerId: currentPlayerObj.id }
        )

        if (isDefiWheel && result.label !== 'SAFE') {
          setPendingChallenge({
            targetId: currentPlayerObj.id,
            drinks: 2,
            case: toStoredCase(wheelCase),
          })
        }
      }

      setPendingCase(null)
      setPendingPosition(null)
    },
    [players, currentPlayer, updatePlayerStats, pendingDuelNote, wheelMode]
  )

  const finishWheelModal = () => {
    if (wheelResult) {
      applyWheelOutcome(wheelResult)
    }
    setShowWheel(false)
  }

  // Mise à jour du rendu des classements des joueurs
  const renderPlayerRanking = (player: GamePlayer, index: number) => {
    return (
      <div 
        key={player.id}
        className="flex items-center justify-between p-2 bg-card/50 rounded-md mb-2"
      >
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
            {index + 1}
          </div>
          <PlayerIcon player={player} size="md" />
          <div className="flex flex-col">
            <PlayerName player={player} className="font-medium" />
            <span className="text-xs text-muted-foreground">
              Position: {player.position + 1} / {boardSize}
            </span>
          </div>
        </div>
        <div className="text-sm font-medium">
          {player.drinks} gorgée{player.drinks !== 1 ? 's' : ''}
        </div>
      </div>
    )
  }

  if (!gameStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-sm text-white/50">{t('game.loading')}</p>
      </div>
    )
  }

  const leaderBoardPosition =
    players.length > 0 ? Math.max(...players.map(p => p.position)) : -1
  const activeTurnBoardPosition = players[currentPlayer]?.position ?? -1

  const getBoardCaseBaseClass = (index: number) => {
    if (index === 0) return 'pb-board-case pb-board-start'
    if (index === boardSize - 1) return 'pb-board-case pb-board-finish'
    return 'pb-board-case'
  }

  const getBoardCaseHighlightClass = (index: number) => {
    const isLeaderCase = index === leaderBoardPosition
    const isActiveTurnCase = index === activeTurnBoardPosition
    if (isActiveTurnCase && isLeaderCase) return 'pb-board-highlight-both'
    if (isActiveTurnCase) return 'pb-board-highlight-active'
    if (isLeaderCase) return 'pb-board-highlight-leader'
    return ''
  }

  const showDiceActionBar = !hasBlockingDialog() && !(showNotification && caseNotification)

  return (
    <div className="relative grid h-full min-h-0 w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-gray-950 text-white">
      {/* Blobs animés */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      {/* En-tête */}
      <header className="relative z-30 shrink-0 border-b border-white/10 bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={onGameEnd}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={t('game.back')}
          >
            ←
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold sm:text-lg">
            {t('game.title')}
          </h1>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/60">
            {difficultyNames[gameDifficulty]}
          </span>
          <button
            onClick={toggleMuted}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Zone scrollable : plateau + classement uniquement (barre d'action en footer fixe) */}
      <main className="relative min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto flex w-full max-w-3xl flex-col space-y-3 px-3 py-3 pb-4 sm:px-4">
      {/* HUD tour + joueur actif */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
          {t('game.turn', { count: turnCount })}
        </span>
        <div className="min-w-0 flex-1 text-center">
          <p className="mb-0.5 text-[10px] uppercase tracking-widest text-white/40">{t('game.turnOf')}</p>
          <div className="truncate font-bold">
            <PlayerName player={players[currentPlayer]} />
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-white/40">
          {players[currentPlayer]?.position != null ? players[currentPlayer].position + 1 : '—'}/{boardSize}
        </span>
      </div>

      {renderLastActionHistory()}

      {/* Case actuelle — carte flip teintée par la famille de case */}
      {caseNotification && !showNotification && !showTargetDialog && !showDuelDialog && !showWheel && !showChanceDialog && !showExchangeDialog && !showChainDialog && !showTeleportDialog && !showVoteDialog && !showDeHonteDialog && !showPileFaceDialog && (
        <CaseRevealCard
          className="mt-3"
          caseType={caseNotification.case.type}
          label={getCaseTypeLabel(caseNotification.case.type, t)}
          revealKey={`${turnCount}:${caseNotification.case.type}:${pendingPosition ?? ''}`}
          headerExtra={
            <span className="text-sm font-semibold text-white/70">
              {t('game.caseLabel', { number: players[currentPlayer]?.position != null ? players[currentPlayer].position + 1 : '—' })}
            </span>
          }
        >
          <div
            className="mt-2 max-h-28 overflow-y-auto text-sm leading-relaxed text-foreground/90 [&_strong]:text-amber-100"
            dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
          />
        </CaseRevealCard>
      )}

      {collectActiveEffects().length > 0 && !showNotification && renderActiveEffectsChips()}

      {/* Plateau */}
      <div className="pb-board">
        <div className="pb-board-grid grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: boardSize }).map((_, index) => {
          const playersOnCase = players.filter(p => (shownPositions[p.id] ?? p.position) === index)
          const isStart = index === 0
          const isFinish = index === boardSize - 1
          const gridCols = playersOnCase.length > 4
            ? 'grid-cols-3'
            : playersOnCase.length > 2
              ? 'grid-cols-2'
              : 'grid-cols-1'

          return (
            <div
              key={index}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-lg sm:rounded-xl min-h-[2.75rem] sm:min-h-[3.25rem]',
                getBoardCaseBaseClass(index),
                getBoardCaseHighlightClass(index),
                isFinish && 'min-h-[3.25rem] sm:min-h-[4rem]'
              )}
            >
              {!isFinish && (
                <span className={cn(
                  'absolute left-0.5 top-0.5 z-[1] pb-board-case-num text-[8px] font-semibold sm:left-1 sm:top-1 sm:text-[9px]',
                  isStart ? 'text-emerald-400/70' : 'text-white/30'
                )}>
                  {isStart ? '🏁' : index + 1}
                </span>
              )}
              {isFinish && playersOnCase.length === 0 && (
                <span className="pb-board-finish-icon text-3xl sm:text-4xl" aria-hidden>🏆</span>
              )}
              {isFinish && playersOnCase.length > 0 && (
                <span className="absolute right-0.5 top-0.5 z-[1] pb-board-finish-icon text-base sm:text-lg" aria-hidden>🏆</span>
              )}
              <div className={cn(
                'pb-board-players absolute inset-0 grid place-items-center gap-0.5 p-1 sm:p-1.5',
                gridCols,
                isFinish && playersOnCase.length === 0 && 'hidden'
              )}>
                {playersOnCase.map((player) => renderPlayerToken(player, playersOnCase.length))}
              </div>
            </div>
          )
        })}
        </div>
      </div>

      {/* Classement — défilement horizontal */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
        <div className="mb-2.5 flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <h3 className="text-xs font-semibold text-white/80">{t('game.ranking')}</h3>
        </div>
        <div className="flex gap-2 overflow-x-auto p-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {getPlayerRanking().map((player, index) => {
            const isActive = players[currentPlayer]?.id === player.id
            const rankBorder =
              index === 0
                ? 'border-amber-400/35 bg-amber-500/8'
                : index === 1
                  ? 'border-white/15 bg-white/5'
                  : index === 2
                    ? 'border-orange-500/25 bg-orange-600/8'
                    : 'border-white/8 bg-white/3'
            return (
              <div
                key={player.id}
                className={cn(
                  'relative flex w-[8.5rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[9.5rem] sm:p-2.5',
                  isActive
                    ? 'border-emerald-400/60 bg-emerald-500/12 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'
                    : rankBorder
                )}
              >
                <FloatingDrinkBadge deltas={drinkDeltas.filter((d) => d.playerId === player.id)} />
                {renderRankBadge(index)}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <PlayerIcon player={player} size="sm" className="h-6 w-6 shrink-0 text-sm" />
                    <PlayerName player={player} className="min-w-0 truncate text-xs font-semibold text-white/90" />
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/40">
                    {t('game.caseLabel', { number: player.position + 1 })}
                    <Beer className="h-3 w-3" /> <PulsingCount value={player.drinks} />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

        </div>
      </main>

      {showDiceActionBar && (
        <footer
          className="relative z-40 border-t border-white/10 bg-gray-950/95 px-3 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
          aria-label="Actions de tour"
        >
          <div className="mx-auto flex w-full max-w-lg items-stretch gap-2 sm:max-w-3xl sm:gap-3">
            {players[currentPlayer] && (
              <div
                className="flex shrink-0 flex-col justify-center gap-1.5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 sm:px-4 sm:py-3"
                aria-label={`${t('game.turnOf')} ${players[currentPlayer].name}`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80 sm:text-xs">
                  {t('game.turnShort')}
                </span>
                <div className="flex items-center gap-2">
                  <PlayerIcon
                    player={players[currentPlayer]}
                    size="md"
                    className="h-8 w-8 shrink-0 text-base sm:h-9 sm:w-9 sm:text-lg"
                  />
                  <PlayerName
                    player={players[currentPlayer]}
                    className="max-w-[5.5rem] truncate text-sm font-bold text-emerald-100 sm:max-w-[7.5rem] sm:text-base"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={rollDice}
              disabled={!canRollDice()}
              className="min-w-0 flex-1 touch-manipulation select-none rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <span>
                  {isDiceRolling
                    ? t('game.rolling')
                    : showNotification && caseNotification
                      ? t('game.validateEffect')
                      : hasBlockingDialog()
                        ? t('game.actionInProgress')
                        : t('game.rollDice')}
                </span>
                <Dice6 className={`h-5 w-5 ${isDiceRolling ? 'animate-spin' : ''}`} />
              </span>
            </button>
          </div>
        </footer>
      )}

      {/* Mise en scène du lancer de dé + flash de changement de tour */}
      <DiceOverlay state={diceOverlay} />
      <TurnOverlay
        activeKey={gameStarted && !winner && !diceOverlay ? players[currentPlayer]?.id ?? null : null}
        icon={
          players[currentPlayer] ? (
            <PlayerIcon player={players[currentPlayer]} size="lg" className="h-16 w-16 text-4xl" />
          ) : (
            ''
          )
        }
        name={players[currentPlayer]?.name ?? ''}
        labelOf={`${t('game.turnOf')} ${players[currentPlayer]?.name ?? ''}`}
      />

      {/* Duel sur case partagée (avant le ciblage) */}
      <AnimatePresence>
        {showDuelDialog && duelBoardPosition != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl"
            >
              <div className="bg-gradient-to-br from-rose-600/20 via-card to-orange-600/10 p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 ring-1 ring-rose-400/30">
                    <Swords className="h-6 w-6 text-rose-400" />
                  </div>
                  <h2 className="text-lg font-bold">{t('game.duel.title')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Case {duelBoardPosition + 1} ·{' '}
                    <PlayerName player={players[currentPlayer]} className="font-semibold text-rose-400" />
                  </p>
                  <p className="mt-2 max-w-[18rem] text-xs text-muted-foreground">
                    {t('game.duel.rules')}
                  </p>
                </div>

                {duelPhase === 'pick' && (
                  <>
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      {t('game.duel.pickOpponent')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {players
                        .filter(
                          p =>
                            p.position === duelBoardPosition &&
                            p.id !== players[currentPlayer]?.id
                        )
                        .map(player => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => startDuelWithOpponent(player.id)}
                            className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/60 p-3 transition-all hover:border-rose-400/60 hover:bg-rose-500/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                          >
                            <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                            <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={skipDuelAndTarget}
                      className="mt-5 h-11 w-full border-border/60"
                    >
                      {t('game.duel.skip')}
                    </Button>
                  </>
                )}

                {duelPhase === 'wheel' && duelOpponentId && (
                  <div className="mt-4 flex flex-col items-center gap-5">
                    <p className="text-center text-sm">
                      <PlayerName player={players[currentPlayer]} className="font-semibold text-rose-300" />
                      {' vs '}
                      <PlayerName
                        player={players.find(p => p.id === duelOpponentId)!}
                        className="font-semibold text-amber-300"
                      />
                    </p>

                    <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 drop-shadow">
                        <svg width="28" height="28" viewBox="0 0 28 28">
                          <polygon points="14,0 24,16 4,16" fill="#f43f5e" />
                          <rect x="12.5" y="16" width="3" height="8" rx="1.5" fill="#f43f5e" />
                        </svg>
                      </div>
                      <motion.div
                        className="absolute inset-0 overflow-visible rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-2 ring-white/20"
                        style={{ originX: 0.5, originY: 0.5, rotate: duelWheelRotation }}
                      >
                        <svg viewBox="0 0 200 200" width="100%" height="100%">
                          <circle cx="100" cy="100" r="98" fill="#0f172a" />
                          {duelWheelSegments.map((seg, i) => {
                            const anglePerSegment = 360 / Math.max(duelWheelSegments.length, 1)
                            const start = -90 + i * anglePerSegment
                            const end = start + anglePerSegment
                            const path = arcPath(100, 100, 95, start, end)
                            return (
                              <g key={seg.id}>
                                <path d={path} fill={colorForDuelSegment(seg.value)} opacity={0.95} />
                                <path
                                  d={`M 100 100 L ${polar(100, 100, 95, start).x} ${polar(100, 100, 95, start).y}`}
                                  stroke="#0f172a"
                                  strokeWidth={1.2}
                                />
                              </g>
                            )
                          })}
                          <circle cx="100" cy="100" r="10" fill="#ffffff" />
                          <circle cx="100" cy="100" r="4" fill="#0f172a" />
                        </svg>
                      </motion.div>
                    </div>

                    {!duelWheelResult && (
                      <Button
                        disabled={duelWheelSpinning}
                        onClick={spinDuelWheel}
                        className="mx-auto w-full max-w-xs bg-gradient-to-r from-rose-500 to-orange-500 py-4 text-base font-bold text-white shadow-lg hover:from-rose-600 hover:to-orange-600"
                      >
                        {duelWheelSpinning ? t('game.duel.spinning') : t('game.duel.spin')}
                      </Button>
                    )}

                    {duelWheelResult && (
                      <div className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-rose-400/90">{t('game.duel.result')}</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">{duelWheelResult.label}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {duelWheelResult.value === 1 ? (
                            <>
                              <PlayerName player={players[currentPlayer]} className="font-semibold" /> gagne et
                              reste ·{' '}
                              <PlayerName
                                player={players.find(p => p.id === duelOpponentId)!}
                                className="font-semibold"
                              />{' '}
                              recule d&apos;une case
                            </>
                          ) : (
                            <>
                              <PlayerName
                                player={players.find(p => p.id === duelOpponentId)!}
                                className="font-semibold"
                              />{' '}
                              gagne · <PlayerName player={players[currentPlayer]} className="font-semibold" /> recule
                              d&apos;une case
                            </>
                          )}
                        </p>
                        <Button
                          onClick={finishDuelAndTarget}
                          className="mt-4 w-full max-w-xs bg-gradient-to-r from-emerald-500 to-teal-500 font-bold text-white shadow-lg"
                        >
                          {t('game.duel.applyCase')}
                        </Button>
                      </div>
                    )}

                    {!duelWheelResult && !duelWheelSpinning && (
                      <Button type="button" variant="ghost" onClick={() => setDuelPhase('pick')} className="text-xs">
                        {t('game.duel.changeOpponent')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sélection du joueur à cibler */}
      <AnimatePresence>
      {showTargetDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
            >
              <div className="bg-gradient-to-br from-violet-600/20 via-card to-emerald-600/10 px-5 pb-5 pt-5">
                <div className="mb-5 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/30">
                    <Target className="h-6 w-6 text-violet-400" />
                  </div>
                  <h3 className="text-lg font-bold">{t('game.target.title')}</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
                    {t('game.target.hint')}
                  </p>
                  <div className="mt-3 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-violet-400/40 bg-violet-500/10 text-2xl">
                    ?
                  </div>
                </div>

                {renderCompactRanking()}

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {players
                    .filter(p => p.id !== players[currentPlayer].id)
                    .map(player => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleTargetSelection(player.id)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/60 p-3 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t('game.caseLabel', { number: player.position + 1 })}
                        </span>
                      </button>
                    ))}
                </div>

                <div className="mt-5 space-y-2 border-t border-border/50 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={selectRandomPlayer}
                    className="h-11 w-full gap-2 border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/15"
                  >
                    <Shuffle className="h-4 w-4 text-violet-400" />
                    {t('game.target.random')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleTargetSelection(players[currentPlayer].id)}
                    className="h-11 w-full gap-2 border-amber-500/30 bg-amber-500/10 text-white hover:bg-amber-500/20"
                  >
                    <User className="h-4 w-4 opacity-90" />
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {t('game.target.me')}
                      <PlayerName player={players[currentPlayer]} className="font-semibold" />
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      <Dialog open={showTeleportDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.teleport')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {t('game.dialogs.teleportPrompt')}
          </p>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button onClick={() => applyTeleportChoice('leader')} className="font-bold">
              {t('game.dialogs.teleportLeader', { name: getLeader(players).name })}
            </Button>
            <Button onClick={() => applyTeleportChoice('last')} variant="secondary" className="font-bold">
              {t('game.dialogs.teleportLast', { name: getLastPlayer(players).name })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVoteDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.vote')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {t('game.dialogs.votePrompt', { count: pendingCase?.effect ?? 3 })}
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {players.map(player => (
              <Button
                key={player.id}
                onClick={() => applyVoteTarget(player.id)}
                className="border-white/15 bg-white/[0.06] text-white hover:bg-white/10"
              >
                <PlayerName player={player} />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeHonteDialog}
        onOpenChange={() => {}}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.shameDice')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {t('game.dialogs.shameDiceRules')}
          </p>

          <div className="flex flex-col items-center gap-4 py-4">
            <ShameDice
              displayValue={deHonteDisplayValue}
              isRolling={deHonteRolling}
            />

            {deHonteResult != null && !deHonteRolling && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-center"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">
                  Résultat
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{deHonteResult}</p>
                <p className="mt-1 text-sm font-medium text-violet-100">
                  {getDeHonteOutcomeLabel(deHonteResult, t)}
                </p>
              </motion.div>
            )}
          </div>

          {deHonteResult != null && !deHonteRolling ? (
            <Button
              onClick={applyDeHonteOutcome}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 font-bold text-white"
            >
              {t('game.continue')}
            </Button>
          ) : (
            <Button
              onClick={rollDeHonte}
              disabled={deHonteRolling}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 font-bold text-white"
            >
              {deHonteRolling ? (
                <span className="flex items-center justify-center gap-2">
                  <Dice6 className="h-5 w-5 animate-spin" />
                  {t('game.dialogs.diceRolling')}
                </span>
              ) : (
                t('game.dialogs.rollD6')
              )}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPileFaceDialog}
        onOpenChange={() => {}}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.coinFlip')}</DialogTitle>
          </DialogHeader>

          {pileFaceTargetId && (() => {
            const pileFaceTarget = players.find(p => p.id === pileFaceTargetId)
            if (!pileFaceTarget) return null
            return (
              <p className="text-center text-sm text-muted-foreground">
                <PlayerName player={pileFaceTarget} className="font-semibold text-amber-200" />
                {' '}{t('game.dialogs.coinChooses')}
              </p>
            )
          })()}

          {!pileFaceChoice ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <Button
                onClick={() => startPileFaceFlip('pile')}
                className="h-auto flex-col gap-1 py-4 font-bold"
              >
                <span className="text-2xl">1</span>
                {t('coinFlip.pile')}
              </Button>
              <Button
                onClick={() => startPileFaceFlip('face')}
                variant="secondary"
                className="h-auto flex-col gap-1 py-4 font-bold"
              >
                <span className="text-2xl">👤</span>
                {t('coinFlip.face')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs text-muted-foreground">
                {t('game.dialogs.coinChoice', {
                  choice:
                    pileFaceChoice === 'pile'
                      ? t('coinFlip.pile')
                      : t('coinFlip.face'),
                })}
              </p>

              {pileFaceFlipResult && (
                <CoinFlip result={pileFaceFlipResult} isFlipping={pileFaceFlipping} />
              )}

              {!pileFaceFlipping && pileFaceFlipResult && pileFaceChoice && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border px-4 py-3 text-center ${
                    pileFaceChoice === pileFaceFlipResult
                      ? 'border-emerald-400/40 bg-emerald-500/15'
                      : 'border-rose-400/40 bg-rose-500/15'
                  }`}
                >
                  <p className="text-sm font-bold text-white">
                    {getPileFaceOutcomeLabel(pileFaceChoice, pileFaceFlipResult, t).label}
                  </p>
                  {pileFaceChoice !== pileFaceFlipResult && (
                    <p className="mt-1 text-xs text-white/60">
                      {t('game.dialogs.drinksToTake', { count: pendingCase?.effect || 2 })}
                    </p>
                  )}
                </motion.div>
              )}

              {!pileFaceFlipping && pileFaceFlipResult ? (
                <Button
                  onClick={applyPileFaceOutcome}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-white"
                >
                  {t('game.continue')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <p className="text-center text-xs text-muted-foreground animate-pulse">
                  {t('game.dialogs.coinSpinning')}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog pour la case Chance */}
      <Dialog open={showChanceDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.chance')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              {t('game.dialogs.chancePrompt')}
            </p>
            <div className="grid grid-cols-1 gap-3">
              <Button 
                onClick={() => {
                  setShowChanceDialog(false);
                  // Relancer le dé avec la fonction spéciale
                  rerollDice();
                }}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold"
              >
                {t('game.dialogs.chanceReroll')}
              </Button>
              <Button 
                onClick={() => {
                  setShowChanceDialog(false);
                  // Avancer de 2 cases
                  const currentPlayerObj = players[currentPlayer];
                  if (currentPlayerObj) {
                    const newPosition = Math.min(currentPlayerObj.position + 2, boardSize - 1);
                    const updatedPlayers = players.map((p, idx) => {
                      if (idx === currentPlayer) {
                        return { ...p, position: newPosition };
                      }
                      return p;
                    });
                    setPlayers(updatedPlayers);
                    
                    // Vérifier si le joueur a gagné
                    if (newPosition === boardSize - 1) {
                      setWinner(updatedPlayers[currentPlayer]);
                      try {
                        updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
                          wins: 1
                        });
                      } catch (error) {
                        console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
                      }
                      setIsProcessingTurn(false);
                      return;
                    }

                    const chanceOutcome = outcomeI18n('game.outcomes.chanceAdvance', {
                      playerRefs: { player: currentPlayerObj.id },
                      params: { case: newPosition + 1 },
                    })
                    recordLastAction(currentPlayerObj, 'chance', chanceOutcome, null)

                    const turn = incrementPlayerTurn(updatedPlayers)
                    setIsProcessingTurn(false)
                    saveGame({
                      currentPlayer: turn.nextPlayer,
                      turnCount: turn.nextTurnCount,
                      players: turn.updatedPlayers,
                    })
                  }
                }}
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold"
              >
                {t('game.dialogs.chanceAdvance')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Défi en chaîne — sélection du partenaire */}
      <AnimatePresence>
        {showChainDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
            >
              <div className="bg-gradient-to-br from-indigo-600/20 via-card to-violet-600/10 px-5 pb-5 pt-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20 ring-1 ring-indigo-400/30">
                    <Link2 className="h-6 w-6 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold">{t('game.dialogs.chainTitle')}</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
                    {t('game.dialogs.chainPrompt', { count: 5 })}
                  </p>
                  <p className="mt-2 text-xs text-indigo-300/90">
                    <PlayerName player={players[currentPlayer]} className="font-semibold" /> choisit
                  </p>
                </div>

                {renderCompactRanking()}

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {players
                    .filter(p => p.id !== players[currentPlayer].id)
                    .map(player => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleChainPlayerSelect(player.id)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/60 p-3 transition-all hover:border-indigo-400/60 hover:bg-indigo-500/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t('game.caseLabel', { number: player.position + 1 })}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog pour la case Échange */}
      <Dialog open={showExchangeDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.exchange')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              {t('game.dialogs.exchangePrompt')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.filter(p => p.id !== players[currentPlayer].id).map(player => (
                <Button
                  key={player.id}
                  onClick={() => {
                    setShowExchangeDialog(false);
                    // Échanger les positions
                    const currentPlayerObj = players[currentPlayer];
                    const targetPlayerObj = player;
                    const currentPos = currentPlayerObj.position;
                    const targetPos = targetPlayerObj.position;
                    
                    const updatedPlayers = players.map(p => {
                      if (p.id === currentPlayerObj.id) {
                        return { ...p, position: targetPos };
                      }
                      if (p.id === targetPlayerObj.id) {
                        return { ...p, position: currentPos };
                      }
                      return p;
                    });
                    
                    setPlayers(updatedPlayers);
                    
                    // Vérifier si un des joueurs a gagné
                    if (targetPos === boardSize - 1) {
                      setWinner(updatedPlayers[currentPlayer]);
                      try {
                        updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
                          wins: 1
                        });
                      } catch (error) {
                        console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
                      }
                      setIsProcessingTurn(false);
                      return;
                    }
                    
                    const exchangeOutcome = outcomeI18n('game.outcomes.exchange', {
                      playerRefs: { a: currentPlayerObj.id, b: targetPlayerObj.id },
                    })
                    showCaseNotification({
                      case: { type: 'echange', effect: 0 },
                      outcome: exchangeOutcome,
                      includeEffectsSummary: false,
                    })
                    recordLastAction(currentPlayerObj, 'echange', exchangeOutcome, targetPlayerObj)
                    
                    setTimeout(() => {
                      setShowNotification(false);
                    }, 3000);

                    const turn = incrementPlayerTurn(updatedPlayers)
                    setIsProcessingTurn(false)
                    saveGame({
                      currentPlayer: turn.nextPlayer,
                      turnCount: turn.nextTurnCount,
                      players: turn.updatedPlayers,
                    })
                  }}
                  className="border-white/15 bg-white/[0.06] p-3 font-bold text-white hover:bg-white/10"
                >
                  <PlayerName player={player} />
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Roue des gorgées */}
      <AnimatePresence>
        {showWheel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl"
            >
              <div className="bg-gradient-to-br from-amber-600/20 via-card to-rose-600/10 p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/30">
                    <CircleDot className="h-6 w-6 text-amber-400" />
                  </div>
                  <h2 className="text-lg font-bold">
                    {wheelMode === 'defis' ? t('game.wheel.defis') : t('game.wheel.drinks')}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('game.wheel.turnOf', { player: players[currentPlayer]?.name ?? '' })}
                  </p>
                </div>

                <div className="mt-4 flex flex-col items-center gap-5">
                  <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                    {/* Flèche fixe (pointeur résultat) */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 drop-shadow">
                      <svg width="28" height="28" viewBox="0 0 28 28">
                        <polygon points="14,0 24,16 4,16" fill="#f43f5e" />
                        <rect x="12.5" y="16" width="3" height="8" rx="1.5" fill="#f43f5e" />
                      </svg>
                    </div>

                    {/* Roue animée */}
                    <motion.div
                      className="absolute inset-0 rounded-full ring-2 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-visible"
                      style={{ originX: 0.5, originY: 0.5, rotate: wheelRotation }}
                      ref={wheelRef}
                    >
                      <svg viewBox="0 0 200 200" width="100%" height="100%">
                        {/* Fond */}
                        <circle cx="100" cy="100" r="98" fill="#0f172a" />
                        {/* Segments */}
                        {wheelSegments.map((seg, i) => {
                          const anglePerSegment = 360 / Math.max(wheelSegments.length, 1)
                          const start = -90 + i * anglePerSegment
                          const end = start + anglePerSegment
                          const path = arcPath(100, 100, 95, start, end)
                          return (
                            <g key={seg.id}>
                              <path d={path} fill={colorForValue(seg.value)} opacity={0.95} />
                              {/* séparateur */}
                              <path d={`M 100 100 L ${polar(100,100,95,start).x} ${polar(100,100,95,start).y}`} stroke="#0f172a" strokeWidth={1.2} />
                            </g>
                          )
                        })}
                        {/* Moyeu */}
                        <circle cx="100" cy="100" r="10" fill="#ffffff" />
                        <circle cx="100" cy="100" r="4" fill="#0f172a" />
                      </svg>
                    </motion.div>
                  </div>

                  {!wheelResult && (
                    <Button
                      disabled={wheelSpinning}
                      onClick={spinWheel}
                      className="mx-auto w-full max-w-xs bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-bold text-white shadow-lg hover:from-amber-600 hover:to-orange-600"
                    >
                      {wheelSpinning ? t('game.wheel.spinning') : t('game.wheel.spin')}
                    </Button>
                  )}

                  {wheelResult && (
                    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">{t('game.duel.result')}</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{wheelResult.label}</p>
                      <Button
                        onClick={finishWheelModal}
                        className="mt-4 w-full max-w-xs bg-gradient-to-r from-emerald-500 to-teal-500 font-bold text-white shadow-lg"
                      >
                        {t('game.continue')}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Légende des couleurs */}
                {wheelSegments.length > 0 && !wheelSpinning && (
                  <div className="mt-4 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('game.wheel.legend')}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
                      {Object.entries(wheelSegments.reduce<Record<string, { color: string; count: number }>>((acc, s) => {
                        const key = s.label
                        const color = colorForValue(s.value)
                        if (!acc[key]) acc[key] = { color, count: 0 }
                        acc[key].count += 1
                        return acc
                      }, {})).map(([label, info]) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: info.color }} />
                          <span className="text-muted-foreground">{label}{info.count > 1 ? ` ×${info.count}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Écran de victoire */}
      <AnimatePresence>
        {showVictoryScreen && winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            {windowSize.width > 0 && windowSize.height > 0 && (
              <ReactConfetti
                width={windowSize.width}
                height={windowSize.height}
                recycle={true}
                numberOfPieces={200}
                gravity={0.15}
              />
            )}
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
              className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-md"
            >
              <div className="bg-gradient-to-br from-amber-600/20 via-transparent to-orange-600/10 p-6">
                {/* Trophée animé */}
                <div className="mb-4 flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-4xl shadow-xl shadow-amber-500/40"
                  >
                    🏆
                  </motion.div>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70">{t('game.victory.winner')}</p>
                    <h2 className="mt-1 text-2xl font-bold">
                      <PlayerName player={winner} className="text-white" />
                    </h2>
                    <p className="mt-0.5 text-sm text-white/50">{t('game.victory.wonGame')}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{turnCount}</p>
                    <p className="text-[10px] text-white/40">{t('game.victory.turns')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{players.length}</p>
                    <p className="text-[10px] text-white/40">{t('game.victory.players')}</p>
                  </div>
                  <div className="text-center">
                    {(() => {
                      const diffKey = resolveDifficulty(gameDifficulty)
                      return (
                        <>
                          <p className="text-xl leading-none" aria-hidden>{DIFFICULTY_EMOJI[diffKey]}</p>
                          <p className="mt-1 text-sm font-bold text-amber-300">{t(`difficultyLabels.${diffKey}`)}</p>
                        </>
                      )
                    })()}
                    <p className="mt-0.5 text-[10px] text-white/40">{t('game.victory.difficulty')}</p>
                  </div>
                </div>

                {/* {t('game.finalRanking')} */}
                <div className="mb-5 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">{t('game.finalRanking')}</p>
                  {getPlayerRanking().map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                        player.id === winner.id
                          ? 'border border-amber-400/30 bg-amber-500/15'
                          : 'bg-white/5'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {renderRankBadge(index, 'sm')}
                        <PlayerIcon player={player} size="sm" className="h-7 w-7 shrink-0 text-sm" />
                        <PlayerName player={player} className="truncate text-sm font-semibold" />
                      </div>
                      <div className="flex shrink-0 gap-3 text-xs text-white/50">
                        <span>{player.drinks}🍺</span>
                        <span>C.{player.position + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={resetGame}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
                  >
                    <RefreshCw className="h-4 w-4" /> {t('game.replay')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Home className="h-4 w-4" /> {t('game.backToMenu')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog de sauvegarde */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('game.dialogs.saveGame')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {hasActiveSave ? (
              <>
                <p className="text-center text-muted-foreground">
                  {t('game.save.prompt')}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      resumeGame();
                    }}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('game.save.resume')}
                  </Button>
                  <Button
                    onClick={() => {
                      deleteSave();
                      setShowSaveDialog(false);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    {t('game.save.newGame')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-muted-foreground">
                  {t('game.save.none')}
                </p>
                <Button
                  onClick={() => setShowSaveDialog(false)}
                  className="w-full"
                >
                  {t('game.close')}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Effet de la case — centré, au-dessus de la barre d'action */}
      <AnimatePresence>
        {showNotification && caseNotification && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-md"
            >
              <div className="bg-gradient-to-br from-amber-600/15 via-transparent to-orange-600/10 p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -25 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 15, delay: 0.05 }}
                    className={cn(
                      'mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl',
                      getCaseFamilyStyle(caseNotification.case.type).border,
                      getCaseFamilyStyle(caseNotification.case.type).bg
                    )}
                    aria-hidden
                  >
                    {getCaseMeta(caseNotification.case.type).icon}
                  </motion.div>
                  <h2 className="text-lg font-bold text-white">{t('game.effectTitle')}</h2>
                  <p className="mt-1 text-sm text-white/50">
                    <span
                      className={cn(
                        'mr-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        getCaseFamilyStyle(caseNotification.case.type).chip
                      )}
                    >
                      {getCaseTypeLabel(caseNotification.case.type, t)}
                    </span>
                    {players[currentPlayer] && (
                      <>
                        {' '}· <PlayerName player={players[currentPlayer]} className="font-semibold text-amber-300" />
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-white/5 p-4 text-left">
                  <div
                    className="text-sm leading-relaxed text-white/90 [&_strong]:text-amber-200 [&_span]:inline-flex"
                    dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
                  />
                </div>

                {renderActiveEffectsPanel()}

                {pendingChallenge ? (
                  <div className="mt-5 space-y-2">
                    <p className="text-center text-xs font-medium text-white/50">
                      {t('game.challengeQuestion')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => resolveChallengeChoice(true)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 py-3.5 font-bold text-emerald-100 transition-all hover:bg-emerald-500/25 active:scale-[0.98]"
                      >
                        <Check className="h-4 w-4 shrink-0" />
                        {t('game.challengeSuccess')}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveChallengeChoice(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/15 py-3.5 font-bold text-amber-100 transition-all hover:bg-amber-500/25 active:scale-[0.98]"
                      >
                        <Beer className="h-4 w-4 shrink-0" />
                        {t('game.challengeDrink', { count: pendingChallenge.drinks })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleNextButtonClick}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
                  >
                    {t('game.next')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}