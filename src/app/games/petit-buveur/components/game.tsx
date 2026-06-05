/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { Dice6, Trophy, ArrowRight, RefreshCw, Home, MapPin, Target, Link2, CircleDot, Sparkles, Swords, History, Shuffle, User } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences, PLAYER_ICONS, getPlayerGameBoost } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { detectBrowserCapabilities } from '@/lib/browser-support'
import { getSafeStorage } from '@/lib/storage'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import ReactConfetti from 'react-confetti'
import {
  type Case,
  type CaseType,
  type Difficulty,
  generateCase,
  getCaseTypeLabel,
  CASES_NO_TARGET,
  DEFI_WHEEL_CHALLENGES,
} from '../case-config'
import type { GamePlayer } from '../case-types'
import { resolveNoTargetCase, getLeader, getLastPlayer } from '../resolve-case'
import { ShameDice, getDeHonteOutcomeLabel } from './shame-dice'

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

interface ActiveEffectItem {
  id: string
  icon: string
  title: string
  remainingTurns: number
  player: GamePlayer
  accentClass: string
}

interface LastActionRecord {
  turnNumber: number
  actor: GamePlayer
  caseType: CaseType
  caseLabel: string
  effectHtml: string
  target: GamePlayer | null
}

const formatEffectRemainingTurns = (turns: number) =>
  `${turns} tour${turns > 1 ? 's' : ''}`

type WheelSegment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
}

const difficultyNames: Record<Difficulty, string> = {
  facile: '🌱 Facile',
  normal: '🌟 Normal',
  difficile: '🔥 Difficile',
  extreme: '💀 Extrême'
}

// Génération des segments de la roue (fonction utilitaire)
const generateWheelSegments = (): WheelSegment[] => {
  const n = 15 // 15 segments
  const arr: WheelSegment[] = []
  for (let i = 0; i < n; i++) {
    const isSafe = (i + 1) % 3 === 0
    const value = isSafe ? 0 : 1 + Math.floor(Math.random() * 12)
    arr.push({ 
      id: `seg-${i}-${value}-${Math.random().toString(36).slice(2,6)}`, 
      label: value === 0 ? 'SAFE' : `${value} gorgées`, 
      value 
    })
  }
  return arr
}

/** Roue de duel : 12 segments alternant gagnant / perdant (value 1 = gagnant, 0 = perdant). */
const generateDuelWheelSegments = (): WheelSegment[] => {
  const arr: WheelSegment[] = []
  for (let i = 0; i < 12; i++) {
    const isWinner = i % 2 === 0
    arr.push({
      id: `duel-seg-${i}`,
      label: isWinner ? 'Gagnant' : 'Perdant',
      value: isWinner ? 1 : 0,
    })
  }
  return arr
}

const generateDefiWheelSegments = (): WheelSegment[] =>
  DEFI_WHEEL_CHALLENGES.map((label, i) => ({
    id: `defi-seg-${i}`,
    label,
    value: label === 'SAFE' ? 0 : label.includes('boit') ? 2 : 0,
  }))

const playerColors = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-emerald-500',
  'bg-violet-500', 'bg-amber-500', 'bg-lime-500'
]

const simCompliments = [
  'Le tout puissant',
  'Le magnifique',
  'Le grand sage',
  'Le maître',
  'Sa majesté',
  'Le créateur',
  'L\'invincible',
  'Le légendaire',
  'Le suprême',
  'L\'incontestable'
]

const debMessages = [
  'Boit des vrais gorgées',
  'Des gorgées pas des centilitres',
  'Pas que 2 cl !',
  'Boit vraiment cette fois',
  'Pas de triche',
  'Arrête de faire semblant',
  'On t\'a vu tricher',
  'Bois pour de vrai',
  'Pas d\'eau cette fois'
]

// Nouveaux messages aléatoires pour tous les joueurs
const randomMessages = [
  'Courage !',
  'Santé !',
  'À la tienne !',
  'Tchin-tchin !',
  'Cul sec !',
  'Bottoms up !',
  'Glou glou !',
  'Skål !',
  'Prost !',
  'Kanpai !'
]

// Nouveaux messages aléatoires pour les joueurs qui doivent boire
const drinkingMessages = [
  'Santé et à la vôtre !',
  'Une petite gorgée pour toi, un grand pas vers l\'ivresse !',
  'La bière, c\'est de la vitamine B, c\'est bon pour la santé !',
  'Les grands alcooliques ont commencé comme toi !',
  'Un verre, ça va... deux verres, bonjour les dégâts !',
  'Tu te souviendras de cette gorgée demain matin !',
  'L\'abus d\'alcool est dangereux pour la santé... mais tellement bon pour le moral !',
  'À consommer avec modération... ou pas !',
  'Ce n\'est pas une gorgée, c\'est un investissement pour ta soirée !',
  'Si tu ne bois pas, quelqu\'un d\'autre le fera pour toi !',
  'Une gorgée de plus ne fait jamais de mal... enfin presque !',
  'Lève ton verre plus haut que ton moral !',
  'Plus tu bois, plus tu deviens intéressant !',
  'C\'est pour hydrater tes neurones !',
  'L\'alcool tue lentement, mais on n\'est pas pressés !',
  'Une soirée sans alcool, c\'est comme une pizza sans fromage !',
  'Tu es sur la bonne voie pour devenir une légende !',
  'À ce rythme, tu vas finir champion olympique de descente !',
  'La vie est trop courte pour boire de mauvais alcool !'
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
}

export default function Game({ players: initialPlayers, onGameEnd, difficulty = 'normal' }: GameProps) {
  const { updatePlayerStats } = usePlayers();
  const defaultColor = 'bg-primary';
  
  // État pour stocker les capacités du navigateur
  const [browserCapabilities, setBrowserCapabilities] = useState({
    advancedAnimations: true,
    backgroundClipText: true,
    isMobile: false,
    isLimitedBrowser: false
  });
  
  const [players, setPlayers] = useState<GamePlayer[]>(
    initialPlayers.length > 0 ? initialPlayers.map(p => ({
      ...p,
      position: 0,
      drinks: 0,
      protected: false,
      protectedUntilTurn: undefined,
      cursed: 0,
      linkedTo: undefined,
      linkedTurns: 0,
      skipNextTurn: false,
      anchored: false,
      mirrorDrinkTargetId: undefined,
      mirrorDrinkTurns: 0,
      jokerCase: null,
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
        jokerCase: null,
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
        jokerCase: null,
        preferences: {
          color: 'bg-red-500',
          icon: '🎲',
          specialEffect: null
        }
      }
    ]
  );
  const [newPlayerName, setNewPlayerName] = useState('')
  const [currentPlayer, setCurrentPlayer] = useState<number>(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [winner, setWinner] = useState<GamePlayer | null>(null);
  const [turnCount, setTurnCount] = useState<number>(1);
  const [gameDifficulty, setGameDifficulty] = useState<Difficulty>(difficulty);
  const boardSize = 30;
  const [animatingPlayer, setAnimatingPlayer] = useState<string | null>(null);
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
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [animatedDiceValue, setAnimatedDiceValue] = useState<number | null>(null);
  const [clickCount, setClickCount] = useState<Record<string, number>>({});
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [showVictoryScreen, setShowVictoryScreen] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  
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
  
  // États pour les nouvelles cases
  const [lastCase, setLastCase] = useState<Case | null>(null);
  const [showChanceDialog, setShowChanceDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showChainDialog, setShowChainDialog] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);

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

  // Débloque le dé si le tour est marqué en cours sans UI active (filet de sécurité)
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
      (showNotification && showNextButton) ||
      wheelSpinning ||
      duelWheelSpinning ||
      isDiceRolling

    if (!isProcessingTurn || hasBlockingUi) return

    const timer = setTimeout(() => {
      setIsProcessingTurn(false)
    }, 500)

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
    showNextButton,
    wheelSpinning,
    duelWheelSpinning,
    isDiceRolling,
  ]);

  // Fonctions de sauvegarde et chargement
  const saveGame = useCallback(() => {
    const saveData: GameSave = {
      id: `save_${Date.now()}`,
      timestamp: Date.now(),
      players,
      currentPlayer,
      turnCount,
      gameDifficulty,
      lastCase,
      gameStarted,
      winner
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
      setPlayers(saveData.players);
      setCurrentPlayer(saveData.currentPlayer);
      setTurnCount(saveData.turnCount);
      setGameDifficulty(saveData.gameDifficulty);
      setLastCase(saveData.lastCase);
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
    if (newPlayerName.trim() && players.length < 15) {
      setPlayers([
        ...players,
        {
          id: Date.now().toString(),
          name: newPlayerName.trim(),
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
          jokerCase: null,
        } as GamePlayer
      ])
      setNewPlayerName('')
    }
  }

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  }

  /** Protection active jusqu'à la fin du tour de table en cours (tous les joueurs). */
  const isPlayerProtected = (player: GamePlayer, round: number = turnCount) =>
    player.protected &&
    (player.protectedUntilTurn == null || round < player.protectedUntilTurn)

  const expireExpiredProtections = (list: GamePlayer[], round: number = turnCount) => {
    list.forEach(p => {
      if (p.protected && p.protectedUntilTurn != null && round >= p.protectedUntilTurn) {
        p.protected = false
        p.protectedUntilTurn = undefined
      }
    })
  }

  const getProtectionRemainingRounds = (player: GamePlayer) =>
    Math.max(1, (player.protectedUntilTurn ?? turnCount + 1) - turnCount)

  const isDiceActionBlocked = () =>
    isDiceRolling ||
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
    (showNotification && showNextButton) ||
    wheelSpinning ||
    duelWheelSpinning

  const rollDice = () => {
    if (isDiceActionBlocked()) {
      return
    }
    
    // Masquer toute notification précédente
    setShowNotification(false);
    setCurrentCase(null);
    
    // Gérer les protections et malédictions au début du tour
    const currentPlayerObj = players[currentPlayer];

    if (currentPlayerObj?.skipNextTurn) {
      const skipped = players.map((p, idx) =>
        idx === currentPlayer ? { ...p, skipNextTurn: false } : p
      )
      setPlayers(skipped)
      setCurrentCase({
        type: 'passe-tour',
        description: `⏭️ <span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> passe automatiquement ce tour.`,
        effect: 0,
      })
      recordLastAction(currentPlayerObj, 'passe-tour', `⏭️ ${currentPlayerObj.name} passe son tour.`, null)
      setIsProcessingTurn(true)
      setShowNotification(true)
      setShowNextButton(true)
      return
    }
    if (currentPlayerObj) {
      const updatedPlayers = [...players];
      expireExpiredProtections(updatedPlayers);

      // Appliquer la malédiction si le joueur est maudit
      if (currentPlayerObj.cursed > 0) {
        currentPlayerObj.drinks += 1;
        applyMirrorDrinkIfActive(currentPlayer, 1, updatedPlayers);
        currentPlayerObj.cursed -= 1;
        
        // Mettre à jour les statistiques
        try {
          updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
            totalDrinks: currentPlayerObj.drinks
          });
        } catch (error) {
          console.error("Erreur lors de la mise à jour des statistiques:", error);
        }
        
        setPlayers(updatedPlayers);
        
        // Appliquer la malédiction en arrière-plan sans notification
      }
      
      // Gérer les liens de chaîne
      if (currentPlayerObj.linkedTo && currentPlayerObj.linkedTurns > 0) {
        const linkedPlayer = updatedPlayers.find(p => p.id === currentPlayerObj.linkedTo);
        if (linkedPlayer) {
          // Le joueur boit comme le joueur lié
          currentPlayerObj.drinks += 1;
          currentPlayerObj.linkedTurns -= 1;
          
          // Mettre à jour les statistiques
          try {
            updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
              totalDrinks: currentPlayerObj.drinks
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques:", error);
          }
          
          // Appliquer le lien en arrière-plan sans notification
          
          // Retirer le lien si expiré
          if (currentPlayerObj.linkedTurns <= 0) {
            currentPlayerObj.linkedTo = undefined;
          }
        }
      }
      
      // Mettre à jour l'état des joueurs après avoir appliqué tous les effets actifs
      setPlayers(updatedPlayers);
    }
    
    // Marquer le début du traitement
    setIsProcessingTurn(true);
    setIsDiceRolling(true);
    
    // Générer un résultat de dé entre 1 et 6
    const result = Math.floor(Math.random() * 6) + 1;
    setDiceResult(result);
    setDiceValue(result);
    
    // Animation simple du dé
    const duration = 800;
    const interval = 100;
    const steps = duration / interval;
    let currentStep = 0;
    
    const rollInterval = setInterval(() => {
      if (currentStep < steps - 1) {
        setAnimatedDiceValue(Math.floor(Math.random() * 6) + 1);
        currentStep++;
      } else {
        clearInterval(rollInterval);
        setAnimatedDiceValue(result);
        setIsDiceRolling(false);
        
        // Obtenir le joueur actuel
        const player = players[currentPlayer];
        if (!player) {
          setIsProcessingTurn(false);
          return;
        }
        
        let moveDelta = result
        if (player.anchored) {
          moveDelta = 0
        }
        lastMoveDeltaRef.current = moveDelta

        const newPosition = Math.min(player.position + moveDelta, boardSize - 1);
        
        // Activer l'animation de déplacement
        setAnimatingPlayer(player.id);
        
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
        
        // Mettre à jour l'état des joueurs immédiatement
        setPlayers(updatedPlayers);
        
        // Vérifier si le joueur a gagné
        if (newPosition === boardSize - 1) {
          setWinner(updatedPlayers[currentPlayer]);
          try {
            updatePlayerStats(player.id, 'petit-buveur', {
              wins: 1
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
          }
          setIsProcessingTurn(false);
          return;
        }
        
        // Générer un effet aléatoire (boost possible pour le joueur actuel)
        const caseType = generateCase(gameDifficulty, updatedPlayers[currentPlayer]);
        
        // Réinitialiser l'animation après un délai
        setTimeout(() => {
          setAnimatingPlayer(null);
        }, 500);
        
        // Appliquer l'effet après un court délai
        setTimeout(() => {
          applyEffectToCurrentPlayer(caseType, newPosition, currentPlayer, updatedPlayers);
        }, 800);
      }
    }, interval);
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
    
    // Sauvegarder la case pour la répétition (sauf pour les cases spéciales)
    if (caseType.type !== 'repetition' && caseType.type !== 'chance' && caseType.type !== 'echange') {
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
      setCurrentCase(null);
      setTimeout(() => setShowDuelDialog(true), 100);
      return;
    }

    continueCaseFlow(caseType);
  };

  const proceedToTargetSelection = (_caseType: Case) => {
    setCurrentCase(null)
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
    setCurrentCase(null)
    setShowWheel(true)
  }

  const showCaseResultNotification = (
    caseType: Case,
    description: string,
    target: GamePlayer | null = null
  ) => {
    const actor = players[currentPlayer]
    const duelPrefix = pendingDuelNote ? `${pendingDuelNote}\n\n` : ''
    if (pendingDuelNote) setPendingDuelNote(undefined)
    const summaryPlayer = target ?? actor
    const effectsSummary = summaryPlayer
      ? generateEffectsSummary(summaryPlayer)
      : `<em>Aucun effet spécial en cours</em>`
    setCurrentCase({
      ...caseType,
      description: `${duelPrefix}${description}\n\n${effectsSummary}`,
    })
    if (target) lastTargetIdRef.current = target.id
    else if (actor) lastTargetIdRef.current = actor.id
    setShowNotification(true)
    setShowNextButton(true)
  }

  const applyNoTargetCaseFlow = (caseType: Case) => {
    const { players: updated, description } = resolveNoTargetCase(caseType, players, {
      boardSize,
      actorIndex: currentPlayer,
      lastMoveDelta: lastMoveDeltaRef.current,
      lastCase,
    })
    if (caseType.type === 'solo') {
      applyMirrorDrinkIfActive(currentPlayer, caseType.effect, updated)
    }
    setPlayers(updated)
    const actor = updated[currentPlayer]
    if (actor) {
      recordLastAction(actor, caseType.type, description, null)
    }
    showCaseResultNotification(caseType, description, null)
  }

  const applyMirrorDrinkIfActive = (
    drinkerIndex: number,
    drinks: number,
    updatedPlayers: GamePlayer[]
  ) => {
    const drinker = updatedPlayers[drinkerIndex]
    if (!drinker?.mirrorDrinkTargetId || (drinker.mirrorDrinkTurns ?? 0) <= 0) return
    const mirror = updatedPlayers.find(p => p.id === drinker.mirrorDrinkTargetId)
    if (mirror) {
      mirror.drinks += drinks
      try {
        updatePlayerStats(mirror.id, 'petit-buveur', { totalDrinks: mirror.drinks })
      } catch (error) {
        console.error('Erreur stats miroir:', error)
      }
      drinker.mirrorDrinkTurns = (drinker.mirrorDrinkTurns ?? 1) - 1
      if ((drinker.mirrorDrinkTurns ?? 0) <= 0) {
        drinker.mirrorDrinkTargetId = undefined
      }
    }
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
    const desc = `🌀 <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> échange sa place avec <span class="${partner.preferences.color} text-white px-2 py-1 rounded-md">${partner.name}</span> (${which === 'leader' ? '1er' : 'dernier'} du classement) !`
    recordLastAction(actor, 'teleport', desc, partner)
    showCaseResultNotification(pendingCase, desc, partner)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const applyVoteTarget = (votedId: string) => {
    setShowVoteDialog(false)
    const actor = players[currentPlayer]
    const voted = players.find(p => p.id === votedId)
    if (!actor || !voted || !pendingCase) return
    const drinks = pendingCase.effect || 3
    const updated = players.map(p =>
      p.id === votedId ? { ...p, drinks: p.drinks + drinks } : p
    )
    setPlayers(updated)
    try {
      updatePlayerStats(votedId, 'petit-buveur', {
        totalDrinks: updated.find(p => p.id === votedId)!.drinks,
      })
    } catch (error) {
      console.error('Erreur stats vote:', error)
    }
    const desc = `🗳️ Vote : <span class="${voted.preferences.color} text-white px-2 py-1 rounded-md">${voted.name}</span> boit ${drinks} gorgée${drinks > 1 ? 's' : ''} !`
    recordLastAction(actor, 'vote', desc, voted)
    showCaseResultNotification(pendingCase, desc, voted)
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

  const buildDeHonteDescription = (r: number, player: GamePlayer) => {
    if (r <= 2) {
      return `🎲 Dé de la honte (${r}) : <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> est safe !`
    }
    if (r <= 4) {
      return `🎲 Dé de la honte (${r}) : <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> boit 2 gorgées !`
    }
    if (r === 5) {
      return `🎲 Dé de la honte (5) : <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> avance d'une case !`
    }
    return `🎲 Dé de la honte (6) : <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> recule d'une case !`
  }

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
      p.drinks += drinks
      applyMirrorDrinkIfActive(currentPlayer, drinks, updated)
      try {
        updatePlayerStats(p.id, 'petit-buveur', { totalDrinks: p.drinks })
      } catch (error) {
        console.error('Erreur stats dé honte:', error)
      }
    } else if (r === 5) {
      p.position = Math.min(p.position + 1, boardSize - 1)
    } else if (r === 6) {
      p.position = Math.max(0, p.position - 1)
    }

    const desc = buildDeHonteDescription(r, p)
    setPlayers(updated)
    clearDeHonteRollInterval()
    setDeHonteRolling(false)
    setDeHonteResult(null)
    setShowDeHonteDialog(false)
    recordLastAction(actor, 'de-honte', desc, null)
    showCaseResultNotification(pendingCase, desc, null)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const resolvePileFace = (choice: 'pile' | 'face') => {
    setShowPileFaceDialog(false)
    const targetId = pileFaceTargetId
    setPileFaceTargetId(null)
    const actor = players[currentPlayer]
    const target = targetId ? players.find(p => p.id === targetId) : null
    if (!actor || !target || !pendingCase) return
    const flip = Math.random() < 0.5 ? 'pile' : 'face'
    const wins = choice === flip
    const drinks = pendingCase.effect || 2
    let desc = ''
    const updated = [...players]
    const tp = updated.find(p => p.id === target.id)
    if (!tp) return
    if (wins) {
      desc = `🪙 Pile ou face : <span class="${tp.preferences.color} text-white px-2 py-1 rounded-md">${tp.name}</span> a choisi ${choice}, tirage ${flip} — safe !`
    } else {
      tp.drinks += drinks
      try {
        updatePlayerStats(tp.id, 'petit-buveur', { totalDrinks: tp.drinks })
      } catch (error) {
        console.error('Erreur stats pile-face:', error)
      }
      desc = `🪙 Pile ou face : tirage ${flip}, <span class="${tp.preferences.color} text-white px-2 py-1 rounded-md">${tp.name}</span> boit ${drinks} gorgée${drinks > 1 ? 's' : ''} !`
    }
    setPlayers(updated)
    recordLastAction(actor, 'pile-face', desc, target)
    showCaseResultNotification(pendingCase, desc, target)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const playJokerCase = () => {
    const actor = players[currentPlayer]
    if (!actor?.jokerCase) return
    const saved = actor.jokerCase
    setPlayers(prev =>
      prev.map(p => (p.id === actor.id ? { ...p, jokerCase: null } : p))
    )
    setPendingCase(saved)
    setPendingPosition(actor.position)
    setIsProcessingTurn(true)
    continueCaseFlow(saved)
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
      const first = generateCase(gameDifficulty, players[currentPlayer])
      const second = generateCase(gameDifficulty, players[currentPlayer])
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
      return `⚔️ Duel terminé : <span class="font-semibold">${challenger.name}</span> gagne (reste sur place), <span class="font-semibold">${opponent.name}</span> recule d&apos;une case.`
    }
    return `⚔️ Duel terminé : <span class="font-semibold">${opponent.name}</span> gagne, <span class="font-semibold">${challenger.name}</span> recule d&apos;une case.`
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
    setDeHonteResult(null)
    setDeHonteRolling(false)
    clearDeHonteRollInterval()
    setPileFaceTargetId(null)
    extraCaseQueueRef.current = []
    setPendingCase(null)
    setPendingPosition(null)
    setPendingDuelNote(undefined)
    setCurrentCase(null)
  }

  const commitLastActionFromCurrentTurn = () => {
    const actor = players[currentPlayer]
    if (!actor || !currentCase) return

    const targetId = lastTargetIdRef.current
    const targetPlayer = targetId ? players.find(p => p.id === targetId) ?? null : null
    const displayTarget =
      targetPlayer && targetPlayer.id !== actor.id ? targetPlayer : null

    setLastActionHistory({
      turnNumber: turnCount,
      actor,
      caseType: currentCase.type,
      caseLabel: getCaseTypeLabel(currentCase.type),
      effectHtml: currentCase.description,
      target: displayTarget,
    })
  }

  const recordLastAction = (
    actor: GamePlayer,
    caseType: Case['type'],
    effectHtml: string,
    target: GamePlayer | null
  ) => {
    const displayTarget = target && target.id !== actor.id ? target : null
    setLastActionHistory({
      turnNumber: turnCount,
      actor,
      caseType,
      caseLabel: getCaseTypeLabel(caseType),
      effectHtml,
      target: displayTarget,
    })
  }

  const advanceToNextPlayer = () => {
    clearTurnBlockingUi()
    const nextPlayer = (currentPlayer + 1) % players.length
    const nextTurnCount = nextPlayer === 0 ? turnCount + 1 : turnCount
    if (nextPlayer === 0) {
      setTurnCount(nextTurnCount)
    }
    setPlayers(prev => {
      const updated = [...prev]
      expireExpiredProtections(updated, nextTurnCount)
      return updated
    })
    setCurrentPlayer(nextPlayer)
    setIsProcessingTurn(false)
    setIsDiceRolling(false)
    setTimeout(() => saveGame(), 100)
  }

  // Fonction pour gérer le clic sur le bouton "Suivant"
  const handleNextButtonClick = () => {
    commitLastActionFromCurrentTurn()
    if (extraCaseQueueRef.current.length > 0) {
      const nextCase = extraCaseQueueRef.current.shift()!
      setShowNotification(false)
      setShowNextButton(false)
      setCurrentCase(null)
      setPendingCase(nextCase)
      setTimeout(() => continueCaseFlow(nextCase), 80)
      return
    }
    advanceToNextPlayer()
  };

  // Fonction de secours pour débloquer le jeu
  const forceNextPlayer = () => {
    advanceToNextPlayer()
  };

  // Fonction utilitaire pour remplacer les passages automatiques
  const replaceAutomaticNextPlayer = () => {
    // Ne rien faire - le passage se fait maintenant via le bouton "Suivant"
  };

  /** Liste structurée des effets actifs (tous joueurs). */
  const collectActiveEffects = (): ActiveEffectItem[] => {
    const items: ActiveEffectItem[] = []
    players.forEach(player => {
      if (isPlayerProtected(player)) {
        items.push({
          id: `prot-${player.id}`,
          icon: '🛡️',
          title: 'Protégé',
          remainingTurns: getProtectionRemainingRounds(player),
          player,
          accentClass: 'border-blue-400/40 bg-blue-500/10',
        })
      }
      if (player.cursed > 0) {
        items.push({
          id: `curse-${player.id}`,
          icon: '👻',
          title: 'Maudit',
          remainingTurns: player.cursed,
          player,
          accentClass: 'border-red-400/40 bg-red-500/10',
        })
      }
      if (player.linkedTo && player.linkedTurns > 0) {
        items.push({
          id: `link-${player.id}`,
          icon: '🔗',
          title: 'Lié',
          remainingTurns: player.linkedTurns,
          player,
          accentClass: 'border-indigo-400/40 bg-indigo-500/10',
        })
      }
      if (player.skipNextTurn) {
        items.push({
          id: `skip-${player.id}`,
          icon: '⏭️',
          title: 'Passe tour',
          remainingTurns: 1,
          player,
          accentClass: 'border-slate-400/40 bg-slate-500/10',
        })
      }
      if (player.anchored) {
        items.push({
          id: `anchor-${player.id}`,
          icon: '⚓',
          title: 'Ancré',
          remainingTurns: 1,
          player,
          accentClass: 'border-cyan-400/40 bg-cyan-500/10',
        })
      }
      if (player.mirrorDrinkTargetId && (player.mirrorDrinkTurns ?? 0) > 0) {
        items.push({
          id: `mirror-${player.id}`,
          icon: '🪞',
          title: 'Miroir',
          remainingTurns: player.mirrorDrinkTurns ?? 1,
          player,
          accentClass: 'border-pink-400/40 bg-pink-500/10',
        })
      }
      if (player.jokerCase) {
        items.push({
          id: `joker-${player.id}`,
          icon: '🃏',
          title: 'Joker',
          remainingTurns: 1,
          player,
          accentClass: 'border-amber-400/40 bg-amber-500/10',
        })
      }
    })
    return items
  }

  const getCaseEffectMainHtml = (description: string) => {
    const markers = ['<strong>Effets en cours', '<em>Aucun effet spécial']
    let cut = description.length
    for (const m of markers) {
      const i = description.indexOf(m)
      if (i !== -1 && i < cut) cut = i
    }
    return description.slice(0, cut).replace(/\n\n+$/, '').trim()
  }

  // Résumé HTML (compatibilité descriptions existantes)
  const generateEffectsSummary = (_targetPlayer: GamePlayer) => {
    const items = collectActiveEffects()
    if (items.length === 0) return `<em>Aucun effet spécial en cours</em>`
    const lines = items.map(e => {
      if (e.id.startsWith('link-')) {
        const linked = players.find(p => p.id === e.player.linkedTo)
        if (linked) {
          return `🔗 <span class="${e.player.preferences.color} text-white px-2 py-1 rounded-md">${e.player.name}</span> est <strong>lié</strong> à <span class="${linked.preferences.color} text-white px-2 py-1 rounded-md">${linked.name}</span> (${e.player.linkedTurns} tours)`
        }
      }
      if (e.id.startsWith('prot-')) {
        return `🛡️ <span class="${e.player.preferences.color} text-white px-2 py-1 rounded-md">${e.player.name}</span> est <strong>protégé</strong>`
      }
      return `👻 <span class="${e.player.preferences.color} text-white px-2 py-1 rounded-md">${e.player.name}</span> est <strong>maudit</strong> (${e.player.cursed} tours)`
    })
    return `<strong>Effets en cours :</strong>\n${lines.join('\n')}`
  }

  const handleTargetSelection = (targetId: string) => {
    lastTargetIdRef.current = targetId

    // Fermer la fenêtre de ciblage
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
      if (lastCase) {
        // Appliquer la case précédente
        applyEffectToPlayer(targetId, lastCase);
        return;
      } else {
        // Si pas de case précédente, case safe
        setCurrentCase({
          type: 'normal',
          description: 'Pas de case précédente, tu es safe !\n\n<em>Aucun effet spécial en cours</em>',
          effect: 0
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
      }
    }
    
    // Générer le résumé complet des effets
    const effectsSummary = generateEffectsSummary(targetPlayer);
    
    // Personnaliser la description en fonction du type de case
    let descriptionEffet = effectsSummary;
    
    // Pour les cases "safe"
    if (pendingCase.type === 'normal') {
      descriptionEffet = `Case safe ! Le joueur <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est en sécurité pour ce tour.\n\n${effectsSummary}`;
    }
    // Pour les cases "piège" - afficher la position et le nombre de gorgées
    else if (pendingCase.type === 'piege') {
      const trapDrinks = targetPlayer.position + 1;
      if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
        const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
        descriptionEffet = `🕳️ Piège ! <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span> boit ${trapDrinks} gorgée${trapDrinks > 1 ? 's' : ''} (position ${targetPlayer.position + 1}) !\n\n${effectsSummary}`;
      } else if (targetPlayer.name.toLowerCase() === 'deb') {
        const message = debMessages[Math.floor(Math.random() * debMessages.length)];
        descriptionEffet = `🕳️ Piège ! <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${trapDrinks} gorgée${trapDrinks > 1 ? 's' : ''} (position ${targetPlayer.position + 1}) ${message}\n\n${effectsSummary}`;
      } else {
        descriptionEffet = `🕳️ Piège ! <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${trapDrinks} gorgée${trapDrinks > 1 ? 's' : ''} (position ${targetPlayer.position + 1}) !\n\n${effectsSummary}`;
      }
    }
    // Pour les cases "avance" ou "recul"
    else if (pendingCase.type === 'avance' || pendingCase.type === 'recul') {
      // Garder les compliments pour Sim ou Riqui
      if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
        const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
        descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span>\n\n${effectsSummary}`;
      } else {
        // Format standard pour les autres joueurs
        descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>\n\n${effectsSummary}`;
      }
    } else {
      // Sélectionner un message aléatoire pour les joueurs qui doivent boire (40% de chance)
      const showRandomMessage = Math.random() < 0.4;
      const randomMessage = showRandomMessage ? drinkingMessages[Math.floor(Math.random() * drinkingMessages.length)] : '';
      
      // Personnaliser la description en fonction du type de case
      if (pendingCase.type === 'tous') {
        // Easter egg pour Sim ou Riqui
        if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
          const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
          descriptionEffet = `${pendingCase.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        } 
        // Cas spécial pour Deb - sans phrase spéciale quand elle est épargnée
        else if (targetPlayer.name.toLowerCase() === 'deb') {
          descriptionEffet = `${pendingCase.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        }
        else {
          descriptionEffet = `${pendingCase.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        }
      } else {
        // Easter egg pour Sim ou Riqui
        if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
          const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        } 
        // Cas spécial pour Deb - avec message spécial quand elle boit directement, mais sans couleur
        else if (targetPlayer.name.toLowerCase() === 'deb') {
          const message = debMessages[Math.floor(Math.random() * debMessages.length)];
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> ${message}`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        }
        else {
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
          descriptionEffet += `\n\n${effectsSummary}`;
        }
      }
    }
    
    const duelPrefix = pendingDuelNote ? `${pendingDuelNote}\n\n` : ''
    if (pendingDuelNote) {
      setPendingDuelNote(undefined)
    }

    setCurrentCase({
      ...pendingCase,
      description: `${duelPrefix}${descriptionEffet}`,
    });
    
    // Afficher la notification avec l'effet révélé et le bouton "Suivant"
    setShowNotification(true);
    setShowNextButton(true);
    
    // Appliquer l'effet au joueur ciblé
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
    
    // Générer le résumé des effets en cours
    const effectsSummary = generateEffectsSummary(targetPlayer);
    
    // Appliquer l'effet en fonction du type de case
    switch (caseToApply.type) {
      case 'normal':
        // Pour les cases safe, on ne fait rien de spécial
        
        // Afficher la notification de case safe
        setCurrentCase({
          ...caseToApply,
          description: `✅ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est sur une case safe !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'gorgée':
      case 'defi':
        // Vérifier si le joueur est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }
        
        // Si pas protégé, continuer normalement
        targetPlayer.drinks += caseToApply.effect;
        
        // Mettre à jour les statistiques
        try {
          updatePlayerStats(targetPlayer.id, 'petit-buveur', {
            totalDrinks: targetPlayer.drinks
          });
        } catch (error) {
          console.error("Erreur lors de la mise à jour des statistiques:", error);
        }
        
        // Afficher la notification de gorgée/défi
        setCurrentCase({
          ...caseToApply,
          description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${caseToApply.effect} gorgée${caseToApply.effect > 1 ? 's' : ''} !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'tous':
        // Faire boire tous les autres joueurs sauf le joueur ciblé
        updatedPlayers.forEach((p) => {
          if (p.id !== targetPlayerId) {
            p.drinks += caseToApply.effect;
            
            // Mettre à jour les statistiques
            try {
              updatePlayerStats(p.id, 'petit-buveur', {
                totalDrinks: p.drinks
              });
            } catch (error) {
              console.error("Erreur lors de la mise à jour des statistiques:", error);
            }
          }
        });
        
        // Afficher la notification de "tous"
        setCurrentCase({
          ...caseToApply,
          description: `${caseToApply.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'avance':
      case 'recul':
        // Vérifier si le joueur est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }
        
        // Vérifier si le joueur ciblé est sur la case 1 et que l'effet est un recul
        if (caseToApply.type === 'recul' && targetPlayer.position === 0) {
          // Afficher un message pour le recul impossible
          setCurrentCase({
            ...caseToApply,
            description: `❌ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est sur la case 1 et ne peut pas reculer !\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }

        // Calculer la nouvelle position après l'effet
        const effectPosition = Math.max(0, Math.min(boardSize - 1, targetPlayer.position + caseToApply.effect));
        
        // Mettre à jour la position du joueur avec animation
        setAnimatingPlayer(targetPlayer.id);
        
        // Mettre à jour la position du joueur
        targetPlayer.position = effectPosition;
        
        // Vérifier si le joueur a gagné après l'effet
        if (effectPosition === boardSize - 1) {
          setPlayers(updatedPlayers);
          setWinner(targetPlayer);
          try {
            updatePlayerStats(targetPlayer.id, 'petit-buveur', {
              wins: 1
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
          }
          setIsProcessingTurn(false);
          return;
        }
        
        // Afficher la notification de déplacement
        setCurrentCase({
          ...caseToApply,
          description: `${caseToApply.type === 'avance' ? '➡️' : '⬅️'} <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> se déplace de la case ${targetPlayer.position - caseToApply.effect + 1} vers la case ${targetPlayer.position + 1} !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'bombe':
        // Faire boire tous les joueurs, mais le ciblé boit double (sauf s'il est protégé)
        updatedPlayers.forEach((p) => {
          if (p.id === targetPlayerId) {
            if (isPlayerProtected(p)) {
              // Afficher un message spécial pour le joueur protégé
              setCurrentCase({
                ...caseToApply,
                description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${p.preferences.color} text-white px-2 py-1 rounded-md">${p.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>`
              });
              setShowNotification(true);
              setShowNextButton(true);
              return;
            } else {
              p.drinks += caseToApply.effect * 2; // Double pour le ciblé
            }
          } else {
            p.drinks += caseToApply.effect;
          }
          
          // Mettre à jour les statistiques
          try {
            updatePlayerStats(p.id, 'petit-buveur', {
              totalDrinks: p.drinks
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques:", error);
          }
        });
        
        // Afficher la notification de bombe
        setCurrentCase({
          ...caseToApply,
          description: `💣 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> a déclenché une bombe ! Tout le monde boit ${caseToApply.effect} gorgée${caseToApply.effect > 1 ? 's' : ''}, mais ${targetPlayer.name} boit double !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'protection':
        targetPlayer.protected = true;
        targetPlayer.protectedUntilTurn = turnCount + 1;
        setPlayers(updatedPlayers);
        setCurrentCase({
          ...caseToApply,
          description: `🛡️ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est protégé jusqu'à la fin du tour de table (tous les joueurs) !\n\n${effectsSummary}`,
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'malediction':
        // Vérifier si le joueur est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setTimeout(() => {
            setShowNotification(false);
          }, 3000);
          
          // Passer au joueur suivant
          setTimeout(() => {
            commitLastActionFromCurrentTurn()
            const nextPlayer = (currentPlayer + 1) % players.length;
            if (nextPlayer === 0) {
              setTurnCount(turnCount + 1);
            }
            setCurrentPlayer(nextPlayer);
            setIsProcessingTurn(false);
            
            // Sauvegarde automatique après passage au joueur suivant
            setTimeout(() => {
              saveGame();
            }, 100);
          }, 2000);
          return;
        }
        
        // Maudire le joueur pendant 3 tours
        targetPlayer.cursed = 3;
        
        // Afficher la notification de malédiction
        setCurrentCase({
          ...caseToApply,
          description: `👻 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est maintenant maudit pendant 3 tours !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'miroir':
        // Vérifier si le joueur ciblé est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }
        
        // Inverser les positions de tous les joueurs (premier devient dernier, etc.)
        const sortedPlayers = [...updatedPlayers].sort((a, b) => b.position - a.position);
        const mirrorPositions = sortedPlayers.map(p => p.position);
        
        // Créer un mapping d'inversion : premier joueur prend la position du dernier, etc.
        updatedPlayers.forEach((p) => {
          const sortedIndex = sortedPlayers.findIndex(sp => sp.id === p.id);
          const invertedIndex = mirrorPositions.length - 1 - sortedIndex;
          p.position = mirrorPositions[invertedIndex];
        });
        
        
        // Afficher la notification de miroir
        setCurrentCase({
          ...caseToApply,
          description: `🪞 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> a inversé toutes les positions ! (premier ↔ dernier)\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'piege':
        // Vérifier si le joueur est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          const trapDrinks = targetPlayer.position + 1;
          setCurrentCase({
            ...caseToApply,
            description: `🕳️ Piège ! <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> aurait dû boire ${trapDrinks} gorgée${trapDrinks > 1 ? 's' : ''} (position ${targetPlayer.position + 1}) mais <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }
        
        // Si pas protégé, continuer normalement
        const trapDrinks = targetPlayer.position + 1;
        targetPlayer.drinks += trapDrinks;
        
        // Mettre à jour les statistiques
        try {
          updatePlayerStats(targetPlayer.id, 'petit-buveur', {
            totalDrinks: targetPlayer.drinks
          });
        } catch (error) {
          console.error("Erreur lors de la mise à jour des statistiques:", error);
        }
        
        // Afficher la notification de piège
        setCurrentCase({
          ...caseToApply,
          description: `🕳️ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${trapDrinks} gorgée${trapDrinks > 1 ? 's' : ''} (position ${targetPlayer.position + 1}) !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'passe-tour':
        targetPlayer.skipNextTurn = true
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `⏭️ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> ne lancera pas au prochain tour !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return

      case 'double-peine': {
        if (isPlayerProtected(targetPlayer)) {
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\n<span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`,
          })
          setShowNotification(true)
          setShowNextButton(true)
          return
        }
        const doubled = caseToApply.effect * 2
        targetPlayer.drinks += doubled
        try {
          updatePlayerStats(targetPlayer.id, 'petit-buveur', { totalDrinks: targetPlayer.drinks })
        } catch (error) {
          console.error('Erreur stats double-peine:', error)
        }
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `💥 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${doubled} gorgées (double peine) !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
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
        setCurrentCase({
          ...caseToApply,
          description: `👯 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> copie le dé (${delta >= 0 ? '+' : ''}${delta}) : case ${before + 1} → ${targetPlayer.position + 1} !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return
      }

      case 'roulette-russe': {
        if (isPlayerProtected(targetPlayer)) {
          setCurrentCase({
            ...caseToApply,
            description: `🔫 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`,
          })
          setShowNotification(true)
          setShowNextButton(true)
          return
        }
        const hit = Math.random() < 1 / 3
        if (hit) {
          targetPlayer.drinks += caseToApply.effect
          try {
            updatePlayerStats(targetPlayer.id, 'petit-buveur', { totalDrinks: targetPlayer.drinks })
          } catch (error) {
            console.error('Erreur stats roulette:', error)
          }
          setPlayers(updatedPlayers)
          setCurrentCase({
            ...caseToApply,
            description: `🔫 Raté ! <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> boit ${caseToApply.effect} gorgées !\n\n${effectsSummary}`,
          })
        } else {
          setCurrentCase({
            ...caseToApply,
            description: `🔫 Click… <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est safe !\n\n${effectsSummary}`,
          })
        }
        setShowNotification(true)
        setShowNextButton(true)
        return
      }

      case 'ancre':
        targetPlayer.anchored = true
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `⚓ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> ne pourra pas avancer au prochain tour !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return

      case 'question':
        if (isPlayerProtected(targetPlayer)) {
          setCurrentCase({
            ...caseToApply,
            description: `❓ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`,
          })
          setShowNotification(true)
          setShowNextButton(true)
          return
        }
        targetPlayer.drinks += caseToApply.effect
        try {
          updatePlayerStats(targetPlayer.id, 'petit-buveur', { totalDrinks: targetPlayer.drinks })
        } catch (error) {
          console.error('Erreur stats question:', error)
        }
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `❓ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> répond à voix haute ou boit ${caseToApply.effect} gorgée${caseToApply.effect > 1 ? 's' : ''} !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return

      case 'inversion': {
        if (isPlayerProtected(targetPlayer)) {
          setCurrentCase({
            ...caseToApply,
            description: `🔃 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`,
          })
          setShowNotification(true)
          setShowNextButton(true)
          return
        }
        const lastPlace = updatedPlayers.reduce((min, p) =>
          p.position < min.position ? p : min
        )
        lastPlace.drinks += caseToApply.effect
        try {
          updatePlayerStats(lastPlace.id, 'petit-buveur', { totalDrinks: lastPlace.drinks })
        } catch (error) {
          console.error('Erreur stats inversion:', error)
        }
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `🔃 Inversion ! <span class="${lastPlace.preferences.color} text-white px-2 py-1 rounded-md">${lastPlace.name}</span> (dernier) boit ${caseToApply.effect} gorgée${caseToApply.effect > 1 ? 's' : ''} à la place de <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return
      }

      case 'miroir-inverse': {
        const actor = updatedPlayers[currentPlayer]
        if (actor) {
          actor.mirrorDrinkTargetId = targetPlayerId
          actor.mirrorDrinkTurns = caseToApply.effect || 1
        }
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `🪞 <span class="${actor?.preferences.color} text-white px-2 py-1 rounded-md">${actor?.name}</span> est lié à <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> : quand l'un boit, l'autre aussi (${actor?.mirrorDrinkTurns ?? 1} tour) !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return
      }

      case 'rewind':
        if (lastCase) {
          applyEffectToPlayer(targetPlayerId, lastCase)
          return
        }
        setCurrentCase({
          ...caseToApply,
          description: `⏪ Pas de case précédente — <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est safe !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return

      case 'joker': {
        const actor = updatedPlayers[currentPlayer]
        if (actor) {
          actor.jokerCase = { ...caseToApply, type: caseToApply.type, description: caseToApply.description }
        }
        setPlayers(updatedPlayers)
        setCurrentCase({
          ...caseToApply,
          description: `🃏 <span class="${actor?.preferences.color} text-white px-2 py-1 rounded-md">${actor?.name}</span> garde cette case en main !\n\n${effectsSummary}`,
        })
        setShowNotification(true)
        setShowNextButton(true)
        return
      }

      case 'melange':
        // Vérifier si le joueur ciblé est protégé
        if (isPlayerProtected(targetPlayer)) {
          // Afficher un message spécial pour le joueur protégé
          setCurrentCase({
            ...caseToApply,
            description: `${caseToApply.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> <span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">A ÉTÉ PROTÉGÉ !</span>\n\n${effectsSummary}`
          });
          setShowNotification(true);
          setShowNextButton(true);
          return;
        }
        
        // Mélanger aléatoirement les positions de tous les joueurs
        const shufflePositions = updatedPlayers.map(p => p.position);
        const shuffledPositions = [...shufflePositions].sort(() => Math.random() - 0.5);
        
        updatedPlayers.forEach((p, index) => {
          p.position = shuffledPositions[index];
        });
        
        
        // Afficher la notification de mélange
        setCurrentCase({
          ...caseToApply,
          description: `🔀 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> a mélangé toutes les positions !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      // Pour les autres types de cases (normal, defi)
      default:
        
        // Afficher une notification pour les cases sans effet spécial
        setCurrentCase({
          ...caseToApply,
          description: `Case ${caseToApply.type} appliquée à <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
    }
    
    // Mettre à jour l'état des joueurs
    setPlayers(updatedPlayers);
    
    // Réinitialiser l'animation après un délai
    setTimeout(() => {
      setAnimatingPlayer(null);
    }, 500);
    
    // Réinitialiser les états
    setTimeout(() => {
      setPendingCase(null);
      setPendingPosition(null);
      
      // Ne pas passer automatiquement au joueur suivant - c'est le bouton "Suivant" qui s'en charge
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
        protectedUntilTurn: undefined,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
        jokerCase: null,
      }));
      
      // Mettre à jour l'état des joueurs
      setPlayers(resetPlayers);
      extraCaseQueueRef.current = [];
      
      // Initialiser tous les états du jeu
      setGameStarted(true);
      setCurrentPlayer(0);
      setWinner(null);
      setTurnCount(1);
      setDiceResult(null);
      setCurrentCase(null);
      setLastActionHistory(null);
      lastTargetIdRef.current = null;
      setIsProcessingTurn(false);
      setIsDiceRolling(false);
      setAnimatedDiceValue(null);
      setSelectingPlayer(false);
      setSelectedPosition(null);
      setPendingCase(null);
      setPendingPosition(null);
      setTargetPlayerId(null);
      setAnimatingPlayer(null);
      setShowNotification(false);
      setShowNextButton(false);
      setShowTargetDialog(false);
      setShowWheel(false);
      setShowChanceDialog(false);
      setShowExchangeDialog(false);
      setShowChainDialog(false);
      
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
        protectedUntilTurn: undefined,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        skipNextTurn: false,
        anchored: false,
        mirrorDrinkTargetId: undefined,
        mirrorDrinkTurns: 0,
        jokerCase: null,
        color: defaultColor
      }))
    );
    extraCaseQueueRef.current = [];
    setCurrentPlayer(0);
    setWinner(null);
    setShowVictoryScreen(false);
    setDiceResult(null);
    setCurrentCase(null);
    setIsProcessingTurn(false);
    setIsDiceRolling(false);
    setAnimatedDiceValue(null);
    setSelectedPosition(null);
    setShowNotification(false);
    setTargetPlayerId(null);
    setShowTargetDialog(false);
    setTurnCount(1);
    setGameDifficulty(difficulty);
    setGameStarted(false);
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

  /** Bandeau classement compact (réutilisé dans les modales). */
  const renderCompactRanking = () => (
    <div className="rounded-xl border border-border/40 bg-background/50 px-2 py-2">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Classement
      </p>
      <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {getPlayerRanking().map((player, index) => {
          const isActive = players[currentPlayer]?.id === player.id
          return (
            <div
              key={player.id}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 ${
                isActive ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-border/40 bg-card/60'
              }`}
            >
              <span className="w-4 text-center text-[10px] leading-none">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
              </span>
              <Avatar className={`${player.preferences.color} h-6 w-6 shrink-0`}>
                {player.preferences.avatar ? (
                  <AvatarImage src={player.preferences.avatar} alt={player.name} />
                ) : (
                  <AvatarFallback className="text-[9px]">
                    {player.preferences.icon || player.name[0].toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 pr-0.5">
                <PlayerName player={player} className="block max-w-[4.5rem] truncate text-[10px] font-medium leading-tight" />
                <span className="text-[9px] text-muted-foreground">Case {player.position + 1}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderActiveEffectLabel = (effect: ActiveEffectItem) => {
    const linked =
      effect.id.startsWith('link-') ? players.find(p => p.id === effect.player.linkedTo) : null
    const tooltip = linked
      ? `${effect.title} — ${effect.player.name} avec ${linked.name}`
      : `${effect.title} — ${effect.player.name}`

    return (
      <div
        key={effect.id}
        title={tooltip}
        className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 ${effect.accentClass}`}
      >
        <span className="text-xs leading-none">{effect.icon}</span>
        <PlayerName player={effect.player} className="max-w-[5.5rem] truncate text-[10px] font-semibold leading-tight" />
        <span className="whitespace-nowrap text-[9px] font-medium text-muted-foreground">
          {formatEffectRemainingTurns(effect.remainingTurns)}
        </span>
      </div>
    )
  }

  const renderActiveEffectsPanel = () => {
    const items = collectActiveEffects()
    if (items.length === 0) return null
    return (
      <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          <span className="text-xs font-semibold text-violet-200">Effets en cours</span>
          <span className="rounded-full bg-violet-500/25 px-1.5 py-0.5 text-[10px] font-bold leading-none text-violet-100">
            {items.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map(effect => renderActiveEffectLabel(effect))}
        </div>
      </div>
    )
  }

  const renderLastActionHistory = () => {
    if (!lastActionHistory) return null
    const { actor, target, caseLabel, effectHtml, turnNumber } = lastActionHistory

    return (
      <div className="mt-2 rounded-xl border border-slate-500/35 bg-slate-800/50 px-3 py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <History className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Action précédente
          </span>
          <span className="text-[9px] text-muted-foreground">Tour {turnNumber}</span>
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
            <span className="text-[10px] text-muted-foreground">(soi / aucune cible)</span>
          )}
        </div>
        <div
          className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground [&_span]:inline [&_strong]:text-slate-300"
          dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(effectHtml) }}
        />
      </div>
    )
  }

  const renderActiveEffectsChips = () => {
    const items = collectActiveEffects()
    if (items.length === 0) return null
    return (
      <div className="mt-3 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-600/15 to-indigo-600/10 p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
          <span className="text-sm font-semibold text-violet-100">Effets en cours</span>
          <span className="rounded-full bg-violet-500/30 px-1.5 text-[10px] font-bold text-violet-50">
            {items.length}
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map(effect => renderActiveEffectLabel(effect))}
        </div>
      </div>
    )
  }

  const handleChainPlayerSelect = (targetPlayerId: string) => {
    setShowChainDialog(false)
    const currentPlayerObj = players[currentPlayer]
    const targetPlayerObj = players.find(p => p.id === targetPlayerId)
    if (!currentPlayerObj || !targetPlayerObj) return

    const updatedPlayers = players.map(p => {
      if (p.id === currentPlayerObj.id) {
        return {
          ...p,
          linkedTo: targetPlayerObj.id,
          linkedTurns: 5,
        }
      }
      return p
    })

    setPlayers(updatedPlayers)
    const chainDescription = `🔗 ${currentPlayerObj.name} est maintenant lié à ${targetPlayerObj.name} pendant 5 tours !`
    setCurrentCase({
      type: 'defi-chaine',
      description: chainDescription,
      effect: 5,
    })
    recordLastAction(currentPlayerObj, 'defi-chaine', chainDescription, targetPlayerObj)
    setShowNotification(true)
    setTimeout(() => setShowNotification(false), 3000)

    const nextPlayer = (currentPlayer + 1) % players.length
    if (nextPlayer === 0) {
      setTurnCount(turnCount + 1)
    }
    setCurrentPlayer(nextPlayer)
    setIsProcessingTurn(false)
    setTimeout(() => saveGame(), 100)
  }

  const renderPlayerToken = (player: GamePlayer, index?: number) => {
    return (
      <div
        key={player.id}
        className={`flex items-center justify-center ${
          player.id === players[currentPlayer]?.id
            ? 'z-10'
            : 'z-0 opacity-80'
        } transition-all duration-300 w-full h-full`}
      >
        <div
          className={`${
            player.preferences.color
          } rounded-full aspect-square flex items-center justify-center ${
            player.id === players[currentPlayer]?.id
              ? 'ring-1 ring-white'
              : ''
          } w-[60%] h-[60%] text-[0.6rem] overflow-hidden`}
        >
          {player.preferences.icon}
        </div>
      </div>
    );
  };

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
        <Avatar className={player.preferences?.color || defaultColor}>
          <AvatarFallback>
            {player.preferences?.icon || player.name[0].toUpperCase()}
          </AvatarFallback>
          {player.preferences?.avatar && (
            <AvatarImage src={player.preferences.avatar} alt={player.name} />
          )}
        </Avatar>
        <div className="flex flex-col">
          <PlayerName player={player} className="font-medium" />
          <span className="text-xs text-muted-foreground">
            {player.drinks} gorgée{player.drinks > 1 ? 's' : ''}
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
      messageText = `<span class="bg-yellow-600 text-white px-2 py-1 rounded-md font-bold">Tout le monde boit ${drinkAmount} gorgée${drinkAmount > 1 ? 's' : ''} pour honorer "${compliment}"</span>`;
    } else if (targetPlayer.name.toLowerCase() === 'deb') {
      const debMessage = debMessages[Math.floor(Math.random() * debMessages.length)];
      messageText = `<span class="bg-pink-600 text-white px-2 py-1 rounded-md">Tout le monde boit ${drinkAmount} gorgée${drinkAmount > 1 ? 's' : ''} sauf </span> <PlayerName player={targetPlayer} className="font-bold" />`;
    } else {
      const randomMessage = randomMessages[Math.floor(Math.random() * randomMessages.length)];
      messageText = `<span class="bg-blue-600 text-white px-2 py-1 rounded-md">Tout le monde boit ${drinkAmount} gorgée${drinkAmount > 1 ? 's' : ''} sauf </span> <PlayerName player={targetPlayer} className="font-bold" /> ${randomMessage}`;
    }
    
    // Mise à jour des gorgées pour tous les joueurs sauf la cible
    const updatedPlayers = players.map(p => {
      if (p.id !== targetPlayerId) {
        return {
          ...p,
          drinks: p.drinks + drinkAmount
        };
      }
      return p;
    });
    
    setPlayers(updatedPlayers);
    
    // Utilisons setCurrentCase au lieu de setMessage
    if (messageText) {
      setCurrentCase({
        type: 'tous',
        description: messageText,
        effect: drinkAmount
      });
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
    setAnimatedDiceValue(null);
    setDiceResult(null);
    setDiceValue(null);
    
    // Masquer toute notification précédente
    setShowNotification(false);
    
    // Marquer le début du traitement
    setIsProcessingTurn(true);
    setIsDiceRolling(true);
    
    // Générer un résultat de dé entre 1 et 6
    const result = Math.floor(Math.random() * 6) + 1;
    setDiceResult(result);
    setDiceValue(result);
    
    // Animation simple du dé
    const duration = 800;
    const interval = 100;
    const steps = duration / interval;
    let currentStep = 0;
    
    const rollInterval = setInterval(() => {
      if (currentStep < steps - 1) {
        setAnimatedDiceValue(Math.floor(Math.random() * 6) + 1);
        currentStep++;
      } else {
        clearInterval(rollInterval);
        setAnimatedDiceValue(result);
        setIsDiceRolling(false);
        
        // Obtenir le joueur actuel
        const player = players[currentPlayer];
        if (!player) {
          setIsProcessingTurn(false);
          return;
        }
        
        let moveDelta = result
        if (player.anchored) {
          moveDelta = 0
        }
        lastMoveDeltaRef.current = moveDelta

        const newPosition = Math.min(player.position + moveDelta, boardSize - 1);
        
        // Activer l'animation de déplacement
        setAnimatingPlayer(player.id);
        
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
        
        // Mettre à jour l'état des joueurs immédiatement
        setPlayers(updatedPlayers);
        
        // Vérifier si le joueur a gagné
        if (newPosition === boardSize - 1) {
          setWinner(updatedPlayers[currentPlayer]);
          try {
            updatePlayerStats(player.id, 'petit-buveur', {
              wins: 1
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques du gagnant:", error);
          }
          setIsProcessingTurn(false);
          return;
        }
        
        // Générer un effet aléatoire (boost possible pour le joueur actuel)
        const caseType = generateCase(gameDifficulty, updatedPlayers[currentPlayer]);
        
        // Réinitialiser l'animation après un délai
        setTimeout(() => {
          setAnimatingPlayer(null);
        }, 500);
        
        // Appliquer l'effet après un court délai
        setTimeout(() => {
          applyEffectToCurrentPlayer(caseType, newPosition, currentPlayer, updatedPlayers);
        }, 800);
      }
    }, interval);
  };

  const applyWheelOutcome = useCallback(
    (result: WheelSegment) => {
      if (wheelOutcomeAppliedRef.current) return
      wheelOutcomeAppliedRef.current = true

      const currentPlayerObj = players[currentPlayer]
      if (!currentPlayerObj) return

      lastTargetIdRef.current = currentPlayerObj.id

      const duelPrefix = pendingDuelNote ? `${pendingDuelNote}\n\n` : ''
      if (pendingDuelNote) {
        setPendingDuelNote(undefined)
      }

      const isDefiWheel = wheelMode === 'defis'
      const defiDrinks =
        isDefiWheel &&
        (result.value > 0 || result.label.toLowerCase().includes('boit'))

      if (result.value > 0 || defiDrinks) {
        const drinks = defiDrinks && result.value === 0 ? 2 : result.value
        setPlayers(prev => {
          const updated = prev.map((p, idx) =>
            idx === currentPlayer ? { ...p, drinks: p.drinks + drinks } : p
          )
          applyMirrorDrinkIfActive(currentPlayer, drinks, updated)
          const after = updated[currentPlayer]
          if (after) {
            try {
              updatePlayerStats(after.id, 'petit-buveur', {
                totalDrinks: after.drinks,
              })
            } catch (error) {
              console.error('Erreur lors de la mise à jour des statistiques:', error)
            }
          }
          return updated
        })
        setCurrentCase({
          type: isDefiWheel ? 'roue-defis' : 'gorgée',
          description: isDefiWheel
            ? `${duelPrefix}🎭 Défi : ${result.label} !\n\n<span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span>${defiDrinks ? ` boit ${drinks} gorgées.` : ' — à toi de jouer !'}`
            : `${duelPrefix}🎯 Résultat de la roue : ${result.label} !\n\n<span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> boit (joueur au tour).`,
          effect: drinks,
        })
      } else {
        setCurrentCase({
          type: isDefiWheel ? 'roue-defis' : 'normal',
          description: isDefiWheel
            ? `${duelPrefix}🎭 Défi : ${result.label} !\n\n<span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> — exécute le défi (ou bois si tu refuses).`
            : `${duelPrefix}🎯 Résultat de la roue : SAFE !\n\n<span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> est en sécurité (joueur au tour).`,
          effect: 0,
        })
      }

      setPendingCase(null)
      setPendingPosition(null)
      setShowNotification(true)
      setShowNextButton(true)
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
          <Avatar className={player.preferences?.color || defaultColor}>
            <AvatarFallback>
              {player.preferences?.icon || player.name[0].toUpperCase()}
            </AvatarFallback>
            {player.preferences?.avatar && (
              <AvatarImage src={player.preferences.avatar} alt={player.name} />
            )}
          </Avatar>
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
      <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
          <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
        </div>
        <div className="relative z-10 mx-auto max-w-lg px-4 py-8 pb-12">
          <div className="mb-8 flex items-center justify-between">
            <button
              onClick={onGameEnd}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
            >
              <Home className="h-4 w-4" />
              Retour
            </button>
            <span className="text-xs font-medium text-white/30">🍺 Jeu de plateau</span>
          </div>

          <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-4xl shadow-lg shadow-amber-500/30">
              🍺
            </div>
            <h1 className="mb-1 text-2xl font-bold">Le Petit Buveur</h1>
            <p className="text-sm text-white/50">Choisis la difficulté et lance la partie !</p>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">Difficulté</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(difficultyNames) as Difficulty[]).map((diff) => {
                const gradients: Record<Difficulty, string> = {
                  facile: 'from-emerald-500 to-green-600 shadow-emerald-500/30',
                  normal: 'from-amber-500 to-yellow-600 shadow-amber-500/30',
                  difficile: 'from-orange-500 to-red-600 shadow-orange-500/30',
                  extreme: 'from-red-600 to-rose-700 shadow-red-500/30',
                }
                return (
                  <button
                    key={diff}
                    onClick={() => setGameDifficulty(diff)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-all ${
                      gameDifficulty === diff
                        ? `border-transparent bg-gradient-to-r ${gradients[diff]} text-white shadow-lg`
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {difficultyNames[diff]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={startGame}
              disabled={players.length < 2}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Commencer la partie
            </button>
            {hasActiveSave && (
              <button
                onClick={resumeGame}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Reprendre la partie en cours
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const leaderBoardPosition =
    players.length > 0 ? Math.max(...players.map(p => p.position)) : -1
  const activeTurnBoardPosition = players[currentPlayer]?.position ?? -1

  const getBoardCaseHighlightClass = (index: number) => {
    const isLeaderCase = index === leaderBoardPosition
    const isActiveTurnCase = index === activeTurnBoardPosition
    if (isActiveTurnCase && isLeaderCase) {
      return 'ring-2 ring-emerald-400/95 bg-gradient-to-br from-emerald-500/35 to-amber-400/40 shadow-[0_0_10px_rgba(52,211,153,0.35),0_0_14px_rgba(251,191,36,0.35)]'
    }
    if (isActiveTurnCase) {
      return 'ring-2 ring-emerald-400/95 bg-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
    }
    if (isLeaderCase) {
      return 'ring-2 ring-amber-400/95 bg-amber-400/35 shadow-[0_0_12px_rgba(251,191,36,0.45)]'
    }
    return 'bg-white/20'
  }

  return (
    <div className="relative min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Blobs animés */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      {/* En-tête fixe */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={onGameEnd}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label="Retour"
          >
            ←
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold sm:text-lg">
            🍺 Le Petit Buveur
          </h1>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/60">
            {difficultyNames[gameDifficulty]}
          </span>
        </div>
      </header>

      {/* Contenu scrollable */}
      <main className="relative z-10 flex-1 overflow-y-auto px-3 pb-32 pt-16 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-3 py-3">
      {/* HUD tour + joueur actif */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
          Tour {turnCount}
        </span>
        <div className="min-w-0 flex-1 text-center">
          <p className="mb-0.5 text-[10px] uppercase tracking-widest text-white/40">Au tour de</p>
          <PlayerName player={players[currentPlayer]} className="block truncate font-bold text-white" />
        </div>
        <span className="shrink-0 text-xs font-medium text-white/40">
          {players[currentPlayer]?.position != null ? players[currentPlayer].position + 1 : '—'}/{boardSize}
        </span>
      </div>

      {renderLastActionHistory()}

      {/* Case actuelle — visible uniquement après révélation (cible choisie) */}
      {currentCase && !showNotification && !showTargetDialog && !showDuelDialog && !showWheel && !showChanceDialog && !showExchangeDialog && !showChainDialog && !showTeleportDialog && !showVoteDialog && !showDeHonteDialog && !showPileFaceDialog && (
        <div className="mt-3 rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="text-sm font-semibold text-amber-200">
              Case {players[currentPlayer]?.position != null ? players[currentPlayer].position + 1 : '—'}
            </span>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-100">
              {getCaseTypeLabel(currentCase.type)}
            </span>
          </div>
          <div
            className="max-h-28 overflow-y-auto text-sm leading-relaxed text-foreground/90 [&_strong]:text-amber-100"
            dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(currentCase.description) }}
          />
        </div>
      )}

      {collectActiveEffects().length > 0 && !showNotification && renderActiveEffectsChips()}

      {/* Plateau */}
      <div className="mt-3 grid grid-cols-6 gap-1.5 rounded-2xl border border-white/10 bg-gray-900/70 p-3 backdrop-blur-md sm:gap-2 sm:p-4">
        {Array.from({ length: boardSize }).map((_, index) => {
          const playersOnCase = players.filter(p => p.position === index)
          const isStart = index === 0
          const isFinish = index === boardSize - 1
          const isMilestone = (index + 1) % 5 === 0 && !isFinish
          const gridCols = playersOnCase.length > 4
            ? 'grid-cols-3'
            : playersOnCase.length > 2
              ? 'grid-cols-2'
              : 'grid-cols-1'

          const squareBase = isStart
            ? 'bg-emerald-500/20 border border-emerald-500/40'
            : isFinish
              ? 'bg-amber-500/25 border border-amber-500/50'
              : isMilestone
                ? 'bg-white/8 border border-white/20'
                : 'bg-white/5 border border-white/8'

          return (
            <div
              key={index}
              className={`relative flex aspect-square items-center justify-center rounded-lg sm:rounded-xl ${squareBase} ${getBoardCaseHighlightClass(index)}`}
            >
              <span className={`text-[9px] font-semibold sm:text-[11px] ${isStart ? 'text-emerald-400' : isFinish ? 'text-amber-400' : isMilestone ? 'text-white/50' : 'text-white/30'}`}>
                {isStart ? '🏁' : isFinish ? '🏆' : index + 1}
              </span>
              <div className={`absolute inset-1 grid ${gridCols} gap-[2px] place-items-center overflow-hidden sm:inset-1.5`}>
                {playersOnCase.map((player) => renderPlayerToken(player))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Classement — défilement horizontal */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
        <div className="mb-2.5 flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <h3 className="text-xs font-semibold text-white/80">Classement</h3>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {getPlayerRanking().map((player, index) => {
            const isActive = players[currentPlayer]?.id === player.id
            const rankBorder =
              index === 0
                ? 'border-amber-400/40 bg-amber-500/10'
                : index === 1
                  ? 'border-slate-400/30 bg-white/5'
                  : index === 2
                    ? 'border-orange-600/30 bg-white/5'
                    : 'border-white/8 bg-white/3'
            return (
              <div
                key={player.id}
                className={`flex w-[6.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${rankBorder} ${
                  isActive ? 'ring-2 ring-amber-400/50 border-transparent' : ''
                }`}
              >
                <span className="text-base leading-none">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                </span>
                <Avatar className={`${player.preferences.color} h-9 w-9 ring-1 ring-white/20`}>
                  {player.preferences.avatar ? (
                    <AvatarImage src={player.preferences.avatar} alt={player.name} />
                  ) : (
                    <AvatarFallback className="text-xs">
                      {player.preferences.icon || player.name[0].toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <PlayerName player={player} className="max-w-full truncate text-center text-xs font-medium text-white/90" />
                <span className="text-[10px] font-medium text-white/40">
                  Case {player.position + 1}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Effet de la case — modale alignée sur les autres overlays */}
      <AnimatePresence>
        {showNotification && currentCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-md"
            >
              <div className="bg-gradient-to-br from-amber-600/15 via-transparent to-orange-600/10 p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 ring-1 ring-amber-400/30">
                    <Sparkles className="h-6 w-6 text-amber-400" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Effet de la case</h2>
                  <p className="mt-1 text-sm text-white/50">
                    {getCaseTypeLabel(currentCase.type)}
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
                    dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(currentCase.description) }}
                  />
                </div>

                {renderActiveEffectsPanel()}

                <button
                  onClick={handleNextButtonClick}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
                >
                  Suivant
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duel sur case partagée (avant le ciblage) */}
      <AnimatePresence>
        {showDuelDialog && duelBoardPosition != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
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
                  <h2 className="text-lg font-bold">Duel sur la case</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Case {duelBoardPosition + 1} ·{' '}
                    <PlayerName player={players[currentPlayer]} className="font-semibold text-rose-400" />
                  </p>
                  <p className="mt-2 max-w-[18rem] text-xs text-muted-foreground">
                    Gagnant : ne bouge pas · Perdant : recule d&apos;une case
                  </p>
                </div>

                {duelPhase === 'pick' && (
                  <>
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Choisis un adversaire sur cette case
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
                            <Avatar className={`${player.preferences.color} h-12 w-12 ring-2 ring-white/10`}>
                              {player.preferences.avatar ? (
                                <AvatarImage src={player.preferences.avatar} alt={player.name} />
                              ) : (
                                <AvatarFallback className="text-base">
                                  {player.preferences.icon || player.name[0].toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
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
                      Passer le duel
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
                        {duelWheelSpinning ? 'La roue tourne…' : 'Lancer le duel'}
                      </Button>
                    )}

                    {duelWheelResult && (
                      <div className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-rose-400/90">Résultat</p>
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
                          Appliquer l&apos;effet de la case
                        </Button>
                      </div>
                    )}

                    {!duelWheelResult && !duelWheelSpinning && (
                      <Button type="button" variant="ghost" onClick={() => setDuelPhase('pick')} className="text-xs">
                        Changer d&apos;adversaire
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
            className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
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
                  <h3 className="text-lg font-bold">Qui cibler ?</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
                    L&apos;effet de la case sera révélé après ton choix
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
                        <Avatar className={`${player.preferences.color} h-12 w-12 ring-2 ring-white/10`}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback className="text-base">
                              {player.preferences.icon || player.name[0].toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Case {player.position + 1}
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
                    Joueur aléatoire
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleTargetSelection(players[currentPlayer].id)}
                    className={`h-11 w-full gap-2 ${players[currentPlayer].preferences.color} text-white hover:opacity-90`}
                  >
                    <User className="h-4 w-4 opacity-90" />
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      Moi —
                      <PlayerName player={players[currentPlayer]} className="font-semibold" />
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      <Dialog open={showTeleportDialog} onOpenChange={setShowTeleportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🌀 Téléport</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            Échange ta position avec :
          </p>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button onClick={() => applyTeleportChoice('leader')} className="font-bold">
              🏆 Le 1er du classement ({getLeader(players).name})
            </Button>
            <Button onClick={() => applyTeleportChoice('last')} variant="secondary" className="font-bold">
              🐢 Le dernier ({getLastPlayer(players).name})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVoteDialog} onOpenChange={setShowVoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🗳️ Vote</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            Main levée — qui boit {pendingCase?.effect ?? 3} gorgées ?
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {players.map(player => (
              <Button
                key={player.id}
                onClick={() => applyVoteTarget(player.id)}
                className={`${player.preferences.color} text-white`}
              >
                <PlayerName player={player} />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeHonteDialog}
        onOpenChange={open => {
          if (!open && !deHonteRolling) {
            clearDeHonteRollInterval()
            setDeHonteResult(null)
            setShowDeHonteDialog(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>🎲 Dé de la honte</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            1–2 safe · 3–4 gorgées · 5 avance · 6 recul
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
                  {getDeHonteOutcomeLabel(deHonteResult)}
                </p>
              </motion.div>
            )}
          </div>

          {deHonteResult != null && !deHonteRolling ? (
            <Button
              onClick={applyDeHonteOutcome}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 font-bold text-white"
            >
              Continuer
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
                  Le dé roule…
                </span>
              ) : (
                'Lancer le D6'
              )}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPileFaceDialog} onOpenChange={setShowPileFaceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🪙 Pile ou face</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {pileFaceTargetId
              ? `${players.find(p => p.id === pileFaceTargetId)?.name ?? 'La cible'} choisit :`
              : 'Choix pile ou face'}
          </p>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Button onClick={() => resolvePileFace('pile')} className="font-bold">
              Pile
            </Button>
            <Button onClick={() => resolvePileFace('face')} variant="secondary" className="font-bold">
              Face
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pour la case Chance */}
      <Dialog open={showChanceDialog} onOpenChange={setShowChanceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🍀 Case Chance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              Choisis ton action :
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
                🎲 Relancer le dé
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

                    const chanceAdvanceDescription = `🍀 Chance : <span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> avance de 2 cases (case ${newPosition + 1}) !`
                    recordLastAction(currentPlayerObj, 'chance', chanceAdvanceDescription, null)
                    
                    // Passer au joueur suivant
                    const nextPlayer = (currentPlayer + 1) % players.length;
                    if (nextPlayer === 0) {
                      setTurnCount(turnCount + 1);
                    }
                    setCurrentPlayer(nextPlayer);
                    setIsProcessingTurn(false);
                    
                    // Sauvegarde automatique après passage au joueur suivant
                    setTimeout(() => {
                      saveGame();
                    }, 100);
                  }
                }}
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold"
              >
                ➡️ Avancer de 2 cases
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
            className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
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
                  <h3 className="text-lg font-bold">Défi en chaîne</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-muted-foreground">
                    Choisis ton partenaire pour <span className="font-semibold text-foreground">5 tours</span> liés
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
                        <Avatar className={`${player.preferences.color} h-12 w-12 ring-2 ring-white/10`}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback className="text-base">
                              {player.preferences.icon || player.name[0].toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Case {player.position + 1}
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
      <Dialog open={showExchangeDialog} onOpenChange={setShowExchangeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🔄 Case Échange</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              Choisis un joueur avec qui échanger ta position :
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
                    
                    const exchangeDescription = `🔄 ${currentPlayerObj.name} et ${targetPlayerObj.name} ont échangé leurs positions !`
                    setCurrentCase({
                      type: 'echange',
                      description: exchangeDescription,
                      effect: 0
                    });
                    recordLastAction(currentPlayerObj, 'echange', exchangeDescription, targetPlayerObj)
                    
                    setShowNotification(true);
                    setTimeout(() => {
                      setShowNotification(false);
                    }, 3000);
                    
                    // Passer au joueur suivant
                    const nextPlayer = (currentPlayer + 1) % players.length;
                    if (nextPlayer === 0) {
                      setTurnCount(turnCount + 1);
                    }
                    setCurrentPlayer(nextPlayer);
                    setIsProcessingTurn(false);
                    
                    // Sauvegarde automatique après passage au joueur suivant
                    setTimeout(() => {
                      saveGame();
                    }, 100);
                  }}
                  className={`p-3 ${player.preferences.color} text-white font-bold`}
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
            className="fixed inset-0 z-[99] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
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
                    {wheelMode === 'defis' ? 'Roue des défis' : 'Roue des gorgées'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Au tour de <PlayerName player={players[currentPlayer]} className="font-semibold text-amber-400" />
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
                      {wheelSpinning ? 'La roue tourne…' : 'Lancer la roue'}
                    </Button>
                  )}

                  {wheelResult && (
                    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">Résultat</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{wheelResult.label}</p>
                      <Button
                        onClick={finishWheelModal}
                        className="mt-4 w-full max-w-xs bg-gradient-to-r from-emerald-500 to-teal-500 font-bold text-white shadow-lg"
                      >
                        Continuer
                      </Button>
                    </div>
                  )}
                </div>

                {/* Légende des couleurs */}
                {wheelSegments.length > 0 && !wheelSpinning && (
                  <div className="mt-4 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Légende</p>
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
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70">Vainqueur !</p>
                    <h2 className="mt-1 text-2xl font-bold">
                      <PlayerName player={winner} className="text-white" />
                    </h2>
                    <p className="mt-0.5 text-sm text-white/50">a remporté la partie 🎉</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{turnCount}</p>
                    <p className="text-[10px] text-white/40">Tours</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{players.length}</p>
                    <p className="text-[10px] text-white/40">Joueurs</p>
                  </div>
                  <div className="text-center">
                    <p className="truncate text-sm font-bold text-amber-300">{difficultyNames[gameDifficulty].split(' ')[0]}</p>
                    <p className="text-[10px] text-white/40">Difficulté</p>
                  </div>
                </div>

                {/* Classement final */}
                <div className="mb-5 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Classement final</p>
                  {getPlayerRanking().map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                        player.id === winner.id
                          ? 'border border-amber-400/30 bg-amber-500/15'
                          : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-center text-sm">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                        </span>
                        <Avatar className={`${player.preferences.color} h-7 w-7 ring-1 ring-white/20`}>
                          {player.preferences.avatar ? (
                            <AvatarImage src={player.preferences.avatar} alt={player.name} />
                          ) : (
                            <AvatarFallback className="text-xs">{player.name[0].toUpperCase()}</AvatarFallback>
                          )}
                        </Avatar>
                        <PlayerName player={player} className="text-sm font-semibold" />
                      </div>
                      <div className="flex gap-3 text-xs text-white/50">
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
                    <RefreshCw className="h-4 w-4" /> Rejouer
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Home className="h-4 w-4" /> Retour au menu
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
            <DialogTitle>💾 Partie en cours</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {hasActiveSave ? (
              <>
                <p className="text-center text-muted-foreground">
                  Une partie est en cours. Voulez-vous la reprendre ou commencer une nouvelle partie ?
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      resumeGame();
                    }}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reprendre la partie
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
                    Nouvelle partie
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-muted-foreground">
                  Aucune partie sauvegardée trouvée.
                </p>
                <Button
                  onClick={() => setShowSaveDialog(false)}
                  className="w-full"
                >
                  Fermer
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
        </div>
      </main>

      {/* Barre d'action fixe en bas */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-3 py-3 sm:px-4">
          {players[currentPlayer]?.jokerCase && !isDiceActionBlocked() && (
            <button
              type="button"
              onClick={playJokerCase}
              className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-500/20"
            >
              🃏 Jouer le joker ({getCaseTypeLabel(players[currentPlayer].jokerCase!.type)})
            </button>
          )}
          <div className="relative flex w-full items-center justify-center">
            {isProcessingTurn && !isDiceRolling && (
              <button
                onClick={forceNextPlayer}
                className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 transition-all hover:bg-red-500/20"
                title="Débloquer le jeu"
                aria-label="Débloquer"
              >
                🔧
              </button>
            )}
            <button
              onClick={rollDice}
              disabled={isDiceActionBlocked()}
              className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center justify-center gap-2">
                <span>Lancer le dé</span>
                <Dice6 className={`h-5 w-5 ${isDiceRolling ? 'animate-spin' : ''}`} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}