/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Sun, Moon, Dice6, User, Users, Trophy, ArrowRight, RefreshCw, Home } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences, PLAYER_ICONS, getPlayerGameBoost } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { detectBrowserCapabilities } from '@/lib/browser-support'
import { getSafeStorage } from '@/lib/storage'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import ReactConfetti from 'react-confetti'

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

interface GamePlayer extends Omit<BasePlayer, 'stats' | 'createdAt'> {
  position: number
  drinks: number
  protected: boolean
  cursed: number // Nombre de tours restants pour la malédiction
  linkedTo?: string // ID du joueur avec qui il est lié (défi en chaîne)
  linkedTurns: number // Nombre de tours restants pour le lien
  stats?: {
    gamesPlayed: number;
    wins: number;
    totalDrinks: number;
    favoriteGame?: string;
    lastPlayed?: number;
  }
  createdAt?: number
  color?: string
  preferences: PlayerPreferences
  id: string
}

interface Case {
  type: 'normal' | 'defi' | 'gorgée' | 'recul' | 'avance' | 'tous' | 'roue' | 'echange' | 'bombe' | 'protection' | 'malediction' | 'chance' | 'repetition' | 'miroir' | 'defi-chaine' | 'piege' | 'melange'
  description: string
  effect: number
}

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

type WheelSegment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
}

const difficultyMultipliers: Record<Difficulty, number> = {
  facile: 1,
  normal: 2,
  difficile: 3,
  extreme: 4
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

const generateCase = (difficulty: Difficulty, currentPlayer?: GamePlayer): Case => {
  const boost = currentPlayer ? getPlayerGameBoost(currentPlayer, 'petit-buveur') : 0
  if (boost > 0 && Math.random() * 100 < boost) {
    const avanceSpaces = Math.floor(Math.random() * 3) + 1
    return { type: 'avance', description: `Avance de ${avanceSpaces} case${avanceSpaces > 1 ? 's' : ''} !`, effect: avanceSpaces }
  }
  // Répartir les probabilités pour toutes les cases
  const random = Math.random();
  let type: 'normal' | 'defi' | 'gorgée' | 'recul' | 'avance' | 'tous' | 'roue' | 'echange' | 'bombe' | 'protection' | 'malediction' | 'chance' | 'repetition' | 'miroir' | 'defi-chaine' | 'piege' | 'melange';
  
  if (random < 0.08) {
    // 8% de chance d'obtenir une case 'roue'
    type = 'roue';
  } else if (random < 0.15) {
    // 7% de chance d'obtenir une case 'tous'
    type = 'tous';
  } else if (random < 0.20) {
    // 5% de chance d'obtenir une case 'echange'
    type = 'echange';
  } else if (random < 0.25) {
    // 5% de chance d'obtenir une case 'bombe'
    type = 'bombe';
  } else if (random < 0.30) {
    // 5% de chance d'obtenir une case 'protection'
    type = 'protection';
  } else if (random < 0.35) {
    // 5% de chance d'obtenir une case 'malediction'
    type = 'malediction';
  } else   if (random < 0.40) {
    // 5% de chance d'obtenir une case 'chance'
    type = 'chance';
  } else if (random < 0.45) {
    // 5% de chance d'obtenir une case 'repetition'
    type = 'repetition';
  } else if (random < 0.50) {
    // 5% de chance d'obtenir une case 'miroir'
    type = 'miroir';
  } else if (random < 0.55) {
    // 5% de chance d'obtenir une case 'defi-chaine'
    type = 'defi-chaine';
  } else if (random < 0.60) {
    // 5% de chance d'obtenir une case 'piege'
    type = 'piege';
  } else if (random < 0.65) {
    // 5% de chance d'obtenir une case 'melange'
    type = 'melange';
  } else {
    // Répartir les autres types sur les 35% restants
    const types = ['normal', 'defi', 'gorgée', 'recul', 'avance'] as const;
    type = types[Math.floor(Math.random() * types.length)];
  }
  
  // Générer un effet unique pour cette case, même si deux joueurs sont sur la même case
  // Chaque appel à generateCase donne un résultat différent
  const defis = [
    { text: 'Fais 10 pompes', drinks: 3 },
    { text: 'Raconte une blague', drinks: 3 },
    { text: 'Chante une chanson', drinks: 3 },
    { text: 'Imite un animal', drinks: 3 },
    { text: 'Fais 10 squats', drinks: 3 },
    { text: 'Fais 30 secondes de gainage', drinks: 3 },
    { text: 'Mime un film sans parler', drinks: 2 },
    { text: 'Imite un autre joueur', drinks: 2 },
    { text: 'Fais 10 tours sur toi-même', drinks: 2 },
    { text: 'Danse pendant 20 secondes', drinks: 2 },
    { text: 'Raconte ton souvenir de soirée le plus gênant', drinks: 3 },
    { text: 'Parle avec un accent pendant 2 tours', drinks: 2 },
    { text: 'Fais le poirier contre un mur', drinks: 3 },
    { text: 'Fais deviner un mot sans parler', drinks: 2 },
    { text: 'Récite l\'alphabet à l\'envers', drinks: 3 },
    { text: 'Fais 5 sauts de grenouille', drinks: 2 },
    { text: 'Ne touche pas ton téléphone pendant 3 tours', drinks: 8 },
    { text: 'Bois sans utiliser tes mains', drinks: 2 }
  ]

  const multiplier = difficultyMultipliers[difficulty]

  switch (type) {
    case 'normal':
      return { type, description: 'Case safe', effect: 0 }
    case 'gorgée': {
      const baseGorgees = Math.floor(Math.random() * 3) + 1
      const drinks = baseGorgees * multiplier
      let finalDrinks = drinks
      let description = ''

      if (difficulty === 'difficile' && drinks > 8) {
        finalDrinks = 8
      }

      if (difficulty === 'extreme' && drinks >= 12) {
        description = 'Cul sec ! 🍺'
      } else {
        description = `Bois ${finalDrinks} gorgée${finalDrinks > 1 ? 's' : ''} !`
      }
      
      return { type, description, effect: finalDrinks }
    }
    case 'defi': {
      const defi = defis[Math.floor(Math.random() * defis.length)]
      const drinks = Math.min(defi.drinks * multiplier, 4)
      return { 
        type, 
        description: `Défi : ${defi.text} ou bois ${drinks} gorgée${drinks > 1 ? 's' : ''} !`, 
        effect: 0 
      }
    }
    case 'recul':
      return { type, description: `Recule de 1 case !`, effect: -1 }
    case 'avance':
      return { type, description: `Avance de 1 case !`, effect: 1 }
    case 'tous': {
      const baseGorgees = Math.floor(Math.random() * 2) + 1
      const drinks = Math.min(baseGorgees * multiplier, 3)
      return { 
        type, 
        description: `Tout le monde boit ${drinks} gorgée${drinks > 1 ? 's' : ''} sauf la personne ciblée ! 🍻`, 
        effect: drinks 
      }
    }
    case 'roue': {
      return { 
        type, 
        description: `🎯 Case spéciale : Roue des gorgées ! 🎯`, 
        effect: 0 
      }
    }
    case 'echange': {
      return { 
        type, 
        description: `🔄 Échange ta position avec un autre joueur !`, 
        effect: 0 
      }
    }
    case 'bombe': {
      return { 
        type, 
        description: `💣 Bombe ! Tout le monde boit, mais toi tu bois double !`, 
        effect: 2 
      }
    }
    case 'protection': {
      return { 
        type, 
        description: `🛡️ Tu es protégé pendant 1 tour !`, 
        effect: 0 
      }
    }
    case 'malediction': {
      return { 
        type, 
        description: `👻 Malédiction ! Tu bois à chaque tour pendant 3 tours !`, 
        effect: 3 
      }
    }
    case 'chance': {
      return { 
        type, 
        description: `🍀 Chance ! Relance le dé ou avance de 2 cases !`, 
        effect: 0 
      }
    }
    case 'repetition': {
      return { 
        type, 
        description: `🔄 Répète l'action de la case précédente !`, 
        effect: 0 
      }
    }
    case 'miroir': {
      return { 
        type, 
        description: `🪞 Miroir ! Les positions sont inversées !`, 
        effect: 0 
      }
    }
    case 'defi-chaine': {
      return { 
        type, 
        description: `🔗 Défi en chaîne ! Choisis avec qui tu seras lié pendant 5 tours !`, 
        effect: 5 
      }
    }
    case 'piege': {
      return { 
        type, 
        description: `🕳️ Piège ! Le joueur ciblé boira autant de gorgées que sa position actuelle !`, 
        effect: 0 
      }
    }
    case 'melange': {
      return { 
        type, 
        description: `🔀 Mélange ! Les positions sont mélangées !`, 
        effect: 0 
      }
    }
  }
}

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
  const { theme } = useTheme()
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
      cursed: 0,
      linkedTo: undefined,
      linkedTurns: 0,
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  
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
    console.log(`État de showTargetDialog changé: ${showTargetDialog}`);
    if (showTargetDialog) {
      console.log("Fenêtre de sélection ouverte - vérification des joueurs:", players.length);
    }
  }, [showTargetDialog, players.length]);

  // Debug: Surveiller l'état du traitement du tour
  useEffect(() => {
    console.log(`État du traitement du tour: isProcessingTurn=${isProcessingTurn}, isDiceRolling=${isDiceRolling}`);
    if (isProcessingTurn && !isDiceRolling) {
      console.log("Tour en cours de traitement - vérification des états:");
      console.log("- pendingCase:", pendingCase?.type);
      console.log("- showTargetDialog:", showTargetDialog);
      console.log("- showWheel:", showWheel);
      console.log("- showChanceDialog:", showChanceDialog);
      console.log("- showExchangeDialog:", showExchangeDialog);
      console.log("- showChainDialog:", showChainDialog);
    }
  }, [isProcessingTurn, isDiceRolling, pendingCase, showTargetDialog, showWheel, showChanceDialog, showExchangeDialog, showChainDialog]);

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
        console.log('saveGame: Tentative de sauvegarde dans localStorage');
        storage.setItem('petit-buveur-save', JSON.stringify(saveData));
        setHasActiveSave(true);
        console.log('saveGame: Partie sauvegardée avec succès');
      }
    } catch (error) {
      console.error('saveGame: Erreur lors de la sauvegarde:', error);
    }
  }, [players, currentPlayer, turnCount, gameDifficulty, lastCase, gameStarted, winner]);

  const loadGame = (): GameSave | null => {
    try {
      const storage = getSafeStorage();
      if (!storage) return null;
      console.log('loadGame: Tentative de chargement depuis localStorage');
      const saveData = storage.getItem('petit-buveur-save');
      console.log('loadGame: Données brutes récupérées:', saveData);
      
      if (saveData) {
        const parsed = JSON.parse(saveData) as GameSave;
        console.log('loadGame: Données parsées avec succès:', parsed);
        return parsed;
      } else {
        console.log('loadGame: Aucune donnée trouvée dans localStorage');
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
        console.log('deleteSave: Tentative de suppression de la sauvegarde');
        storage.removeItem('petit-buveur-save');
      }
      setHasActiveSave(false);
      console.log('deleteSave: Sauvegarde supprimée avec succès');
    } catch (error) {
      console.error('deleteSave: Erreur lors de la suppression:', error);
    }
  };

  const resumeGame = () => {
    console.log('resumeGame: Début de la fonction');
    const saveData = loadGame();
    console.log('resumeGame: Données de sauvegarde récupérées:', saveData);
    
    if (saveData) {
      console.log('resumeGame: Application des données de sauvegarde');
      setPlayers(saveData.players);
      setCurrentPlayer(saveData.currentPlayer);
      setTurnCount(saveData.turnCount);
      setGameDifficulty(saveData.gameDifficulty);
      setLastCase(saveData.lastCase);
      setGameStarted(saveData.gameStarted);
      setWinner(saveData.winner);
      setShowSaveDialog(false);
      console.log('Partie reprise avec succès');
    } else {
      console.log('resumeGame: Aucune donnée de sauvegarde trouvée');
    }
  };

  // Vérifier s'il y a une sauvegarde au chargement (sans reprendre automatiquement)
  useEffect(() => {
    const saveData = loadGame();
    setHasActiveSave(!!saveData);
    console.log('useEffect: Sauvegarde détectée:', !!saveData);
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
    console.log('useEffect: gameStarted a changé:', gameStarted);
    console.log('useEffect: nombre de joueurs:', players.length);
    console.log('useEffect: currentPlayer:', currentPlayer);
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
          }
        } as GamePlayer
      ])
      setNewPlayerName('')
    }
  }

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  }

  const rollDice = () => {
    if (isProcessingTurn || isDiceRolling) {
      console.log("Tentative de lancement de dé bloquée - tour en cours");
      return;
    }
    
    // Masquer toute notification précédente
    setShowNotification(false);
    
    // Gérer les protections et malédictions au début du tour
    const currentPlayerObj = players[currentPlayer];
    if (currentPlayerObj) {
      const updatedPlayers = [...players];
      
      // Appliquer la malédiction si le joueur est maudit
      if (currentPlayerObj.cursed > 0) {
        currentPlayerObj.drinks += 1;
        currentPlayerObj.cursed -= 1;
        console.log(`Le joueur ${currentPlayerObj.name} boit 1 gorgée à cause de la malédiction (${currentPlayerObj.cursed} tours restants)`);
        
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
        console.log(`Malédiction appliquée en arrière-plan pour ${currentPlayerObj.name}`);
      }
      
      // Retirer la protection après 1 tour
      if (currentPlayerObj.protected) {
        currentPlayerObj.protected = false;
        console.log(`La protection de ${currentPlayerObj.name} a expiré`);
      }
      
      // Gérer les liens de chaîne
      if (currentPlayerObj.linkedTo && currentPlayerObj.linkedTurns > 0) {
        const linkedPlayer = updatedPlayers.find(p => p.id === currentPlayerObj.linkedTo);
        if (linkedPlayer) {
          // Le joueur boit comme le joueur lié
          currentPlayerObj.drinks += 1;
          currentPlayerObj.linkedTurns -= 1;
          console.log(`Le joueur ${currentPlayerObj.name} boit 1 gorgée car lié à ${linkedPlayer.name} (${currentPlayerObj.linkedTurns} tours restants)`);
          
          // Mettre à jour les statistiques
          try {
            updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
              totalDrinks: currentPlayerObj.drinks
            });
          } catch (error) {
            console.error("Erreur lors de la mise à jour des statistiques:", error);
          }
          
          // Appliquer le lien en arrière-plan sans notification
          console.log(`Lien de chaîne appliqué en arrière-plan pour ${currentPlayerObj.name}`);
          
          // Retirer le lien si expiré
          if (currentPlayerObj.linkedTurns <= 0) {
            currentPlayerObj.linkedTo = undefined;
            console.log(`Le lien de ${currentPlayerObj.name} a expiré`);
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
        
        // Calculer la nouvelle position
        const newPosition = Math.min(player.position + result, boardSize - 1);
        console.log(`Joueur ${player.name} avance de la case ${player.position + 1} à la case ${newPosition + 1}`);
        
        // Activer l'animation de déplacement
        setAnimatingPlayer(player.id);
        
        // Mettre à jour directement la position du joueur
        const updatedPlayers = players.map((p, idx) => {
          if (idx === currentPlayer) {
            return { ...p, position: newPosition };
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
        console.log(`Case générée: type=${caseType.type}, description=${caseType.description}, effet=${caseType.effect}`);
        
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
    
    console.log(`applyEffectToCurrentPlayer: Joueur ${player.name}, position actuelle: ${currentPosition + 1}, type de case: ${caseType.type}`);

    // Pour toutes les cases, y compris la roue, utiliser la logique de ciblage
    console.log("Affichage de la fenêtre de ciblage pour la case de type: " + caseType.type);
    setPendingCase(caseType);
    setPendingPosition(currentPosition);
    
    // Sauvegarder la case pour la répétition (sauf pour les cases spéciales)
    if (caseType.type !== 'repetition' && caseType.type !== 'chance' && caseType.type !== 'echange') {
      setLastCase(caseType);
    }
    
    setPlayers(updatedPlayers);
    
    // Afficher la description générique avant le ciblage
    setCurrentCase({
      ...caseType,
      description: `Vous devez choisir un joueur à cibler !`
    });
    
    // Forcer la mise à jour de l'état et ajouter un délai pour s'assurer que le DOM est mis à jour
    setTimeout(() => {
      console.log("Ouverture de la fenêtre de ciblage...");
      setShowTargetDialog(true);
      
      // Vérification de secours après 500ms
      setTimeout(() => {
        if (!showTargetDialog) {
          console.log("Problème détecté - forçage de l'ouverture de la fenêtre");
          setShowTargetDialog(true);
        }
      }, 500);
    }, 100);
    
    // La logique de `handleTargetSelection` et `applyEffectToPlayer` prendra le relais
  };

  const movePlayer = (playerId: string, newPosition: number) => {
    // Fonction simplifiée pour déplacer un joueur directement
    console.log(`movePlayer: Déplacement du joueur ${playerId} vers la position ${newPosition + 1}`);
    setPlayers(prevPlayers => 
      prevPlayers.map(p => p.id === playerId ? { ...p, position: newPosition } : p)
    );
  };

  // Fonction pour gérer le clic sur le bouton "Suivant"
  const handleNextButtonClick = () => {
    console.log("Passage au joueur suivant via bouton Suivant");
    setShowNotification(false);
    setShowNextButton(false);
    
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
  };

  // Fonction de secours pour débloquer le jeu
  const forceNextPlayer = () => {
    console.log("FORÇAGE du passage au joueur suivant - déblocage du jeu");
    setShowNotification(false);
    setShowNextButton(false);
    setShowTargetDialog(false);
    setShowWheel(false);
    setShowChanceDialog(false);
    setShowExchangeDialog(false);
    setShowChainDialog(false);
    setPendingCase(null);
    setPendingPosition(null);
    
    // Passer au joueur suivant
    const nextPlayer = (currentPlayer + 1) % players.length;
    if (nextPlayer === 0) {
      setTurnCount(turnCount + 1);
    }
    setCurrentPlayer(nextPlayer);
    setIsProcessingTurn(false);
    setIsDiceRolling(false);
    
    // Sauvegarde automatique après passage au joueur suivant
    setTimeout(() => {
      saveGame();
    }, 100);
  };

  // Fonction utilitaire pour remplacer les passages automatiques
  const replaceAutomaticNextPlayer = () => {
    // Ne rien faire - le passage se fait maintenant via le bouton "Suivant"
  };

  // Fonction pour générer le résumé des effets en cours
  const generateEffectsSummary = (targetPlayer: GamePlayer) => {
    // Ajouter les effets actifs du joueur ciblé
    const activeEffects = [];
    
    if (targetPlayer.protected) {
      activeEffects.push(`🛡️ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est <strong>protégé</strong> (immunisé à tout effet négatif)`);
    }
    
    if (targetPlayer.cursed > 0) {
      activeEffects.push(`👻 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est <strong>maudit</strong> (boit 1 gorgée par tour pendant ${targetPlayer.cursed} tours)`);
    }
    
    if (targetPlayer.linkedTo) {
      const linkedPlayer = players.find(p => p.id === targetPlayer.linkedTo);
      if (linkedPlayer) {
        activeEffects.push(`🔗 <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est <strong>lié</strong> à <span class="${linkedPlayer.preferences.color} text-white px-2 py-1 rounded-md">${linkedPlayer.name}</span> (boit comme lui pendant ${targetPlayer.linkedTurns} tours)`);
      }
    }
    
    // Ajouter les effets des autres joueurs qui peuvent affecter le joueur ciblé
    players.forEach(player => {
      if (player.id !== targetPlayer.id) {
        if (player.protected) {
          activeEffects.push(`🛡️ <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> est <strong>protégé</strong>`);
        }
        if (player.cursed > 0) {
          activeEffects.push(`👻 <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> est <strong>maudit</strong> (${player.cursed} tours restants)`);
        }
        if (player.linkedTo) {
          const linkedPlayer = players.find(p => p.id === player.linkedTo);
          if (linkedPlayer) {
            activeEffects.push(`🔗 <span class="${player.preferences.color} text-white px-2 py-1 rounded-md">${player.name}</span> est <strong>lié</strong> à <span class="${linkedPlayer.preferences.color} text-white px-2 py-1 rounded-md">${linkedPlayer.name}</span> (${player.linkedTurns} tours restants)`);
          }
        }
      }
    });
    
    if (activeEffects.length > 0) {
      return `<strong>Effets en cours :</strong>\n${activeEffects.join('\n')}`;
    } else {
      return `<em>Aucun effet spécial en cours</em>`;
    }
  };

  const handleTargetSelection = (targetId: string) => {
    console.log(`handleTargetSelection: Début - Joueur ciblé: ${targetId}, pendingCase: ${pendingCase?.type}`);
    
    // Fermer la fenêtre de ciblage
    setShowTargetDialog(false);
    
    console.log(`handleTargetSelection: Fenêtre fermée, pendingCase: ${pendingCase?.type}`);
    
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
      console.log("Ouverture de la roue des gorgées");
      setWheelSegments(generateWheelSegments());
      setWheelResult(null);
      setShowWheel(true);
      setCurrentCase(pendingCase);
      return;
    }
    
    if (pendingCase.type === 'chance') {
      console.log("Ouverture du dialogue de chance");
      setShowChanceDialog(true);
      setCurrentCase(pendingCase);
      return;
    }
    
    if (pendingCase.type === 'echange') {
      console.log("Ouverture du dialogue d'échange");
      setShowExchangeDialog(true);
      setCurrentCase(pendingCase);
      return;
    }
    
    if (pendingCase.type === 'defi-chaine') {
      console.log("Ouverture du dialogue de défi en chaîne");
      setShowChainDialog(true);
      setCurrentCase(pendingCase);
      return;
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
    
    setCurrentCase({
      ...pendingCase,
      description: descriptionEffet
    });
    
    // Afficher la notification avec l'effet révélé et le bouton "Suivant"
    setShowNotification(true);
    setShowNextButton(true);
    
    // Appliquer l'effet au joueur ciblé
    applyEffectToPlayer(targetId);
  };

  const applyEffectToPlayer = (targetPlayerId: string, customCase?: Case) => {
    const caseToApply = customCase || pendingCase;
    if (!caseToApply || pendingPosition === null) {
      setIsProcessingTurn(false);
      return;
    }
    
    console.log(`applyEffectToPlayer: Joueur ciblé: ${targetPlayerId}, type de case: ${caseToApply.type}`);
    
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
        console.log(`Le joueur ${targetPlayer.name} est sur une case safe`);
        
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
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé`);
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
        console.log(`Le joueur ${targetPlayer.name} boit ${caseToApply.effect} gorgées`);
        
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
            console.log(`Le joueur ${p.name} boit ${caseToApply.effect} gorgées`);
            
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
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé du déplacement`);
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
          console.log(`Le joueur ${targetPlayer.name} est sur la case 1 et ne peut pas reculer`);
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
        console.log(`applyEffectToPlayer: Effet ${caseToApply.type}, déplacement de ${targetPlayer.position + 1} vers ${effectPosition + 1}`);
        
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
            if (p.protected) {
              console.log(`Le joueur ${p.name} a été protégé de la bombe`);
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
              console.log(`Le joueur ${p.name} boit ${caseToApply.effect * 2} gorgées (double)`);
            }
          } else {
            p.drinks += caseToApply.effect;
            console.log(`Le joueur ${p.name} boit ${caseToApply.effect} gorgées`);
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
        // Protéger le joueur pendant 1 tour
        targetPlayer.protected = true;
        console.log(`Le joueur ${targetPlayer.name} est protégé pendant 1 tour`);
        
        // Afficher la notification de protection
        setCurrentCase({
          ...caseToApply,
          description: `🛡️ <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est maintenant protégé pendant 1 tour !\n\n${effectsSummary}`
        });
        setShowNotification(true);
        setShowNextButton(true);
        return;
        
      case 'malediction':
        // Vérifier si le joueur est protégé
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé de la malédiction`);
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
        console.log(`Le joueur ${targetPlayer.name} est maudit pendant 3 tours`);
        
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
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé du miroir`);
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
        
        console.log('Positions inversées par effet miroir (premier ↔ dernier)');
        
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
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé du piège`);
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
        console.log(`Le joueur ${targetPlayer.name} boit ${trapDrinks} gorgées (position ${targetPlayer.position + 1})`);
        
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
        
      case 'melange':
        // Vérifier si le joueur ciblé est protégé
        if (targetPlayer.protected) {
          console.log(`Le joueur ${targetPlayer.name} a été protégé du mélange`);
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
        
        console.log('Positions mélangées aléatoirement');
        
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
        console.log(`Aucun effet spécial à appliquer pour la case de type ${caseToApply.type}`);
        
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
    console.log("Sélection d'un joueur aléatoire");
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
      console.log(`Joueur aléatoire sélectionné: ${chosen.name}`);
      handleTargetSelection(chosen.id);
    } else {
      console.log(`Aucun autre joueur disponible, sélection du joueur actuel: ${players[currentPlayer].name}`);
      handleTargetSelection(players[currentPlayer].id);
    }
  };

  const startGame = () => {
    console.log('startGame: Début de la fonction');
    console.log('startGame: Nombre de joueurs:', players.length);
    console.log('startGame: Difficulté:', gameDifficulty);
    
    if (players.length >= 2) {
      console.log('startGame: Démarrage du jeu...');
      
      // Réinitialiser les positions et les boissons des joueurs
      const resetPlayers = players.map(p => ({
        ...p,
        position: 0,
        drinks: 0,
        protected: false,
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0
      }));
      
      // Mettre à jour l'état des joueurs
      setPlayers(resetPlayers);
      
      // Initialiser tous les états du jeu
      setGameStarted(true);
      setCurrentPlayer(0);
      setWinner(null);
      setTurnCount(1);
      setDiceResult(null);
      setCurrentCase(null);
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
      
      console.log("startGame: Jeu démarré avec succès !");
      console.log("startGame: Joueurs réinitialisés:", resetPlayers);
    } else {
      console.log('startGame: ERREUR - Pas assez de joueurs pour démarrer (minimum 2 requis)');
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
        cursed: 0,
        linkedTo: undefined,
        linkedTurns: 0,
        color: defaultColor
      }))
    );
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
    console.log("Jeu réinitialisé avec la difficulté:", difficulty);
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
        
        // Calculer la nouvelle position
        const newPosition = Math.min(player.position + result, boardSize - 1);
        console.log(`Joueur ${player.name} avance de la case ${player.position + 1} à la case ${newPosition + 1} (relance)`);
        
        // Activer l'animation de déplacement
        setAnimatingPlayer(player.id);
        
        // Mettre à jour directement la position du joueur
        const updatedPlayers = players.map((p, idx) => {
          if (idx === currentPlayer) {
            return { ...p, position: newPosition };
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
        console.log(`Case générée (relance): type=${caseType.type}, description=${caseType.description}, effet=${caseType.effect}`);
        
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

  // Fonction pour gérer la fin de la roue
  const handleWheelComplete = useCallback(() => {
    if (!wheelResult) return;
    
    const currentPlayerObj = players[currentPlayer];
    if (!currentPlayerObj) return;
    
    // Appliquer le résultat de la roue
    if (wheelResult.value > 0) {
      // Le joueur doit boire
      const updatedPlayers = players.map((p, idx) => {
        if (idx === currentPlayer) {
          return { ...p, drinks: p.drinks + wheelResult.value };
        }
        return p;
      });
      
      setPlayers(updatedPlayers);
      
      // Mettre à jour les statistiques
      try {
        updatePlayerStats(currentPlayerObj.id, 'petit-buveur', {
          totalDrinks: currentPlayerObj.drinks + wheelResult.value
        });
      } catch (error) {
        console.error("Erreur lors de la mise à jour des statistiques:", error);
      }
      
      // Afficher le résultat
      setCurrentCase({
        type: 'gorgée',
        description: `🎯 Résultat de la roue : ${wheelResult.label} !\n\nJoueur ciblé : <span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span>`,
        effect: wheelResult.value
      });
      
      setShowNotification(true);
      setShowNextButton(true);
    } else {
      // Case SAFE
      setCurrentCase({
        type: 'normal',
        description: `🎯 Résultat de la roue : SAFE !\n\nJoueur ciblé : <span class="${currentPlayerObj.preferences.color} text-white px-2 py-1 rounded-md">${currentPlayerObj.name}</span> est en sécurité !`,
        effect: 0
      });
      
      setShowNotification(true);
      setShowNextButton(true);
    }
    
    // Ne pas fermer la roue automatiquement - elle se fermera quand on clique sur "Continuer"
    // Ne pas passer automatiquement au joueur suivant - c'est le bouton "Suivant" qui s'en charge
  }, [wheelResult, players, currentPlayer, updatePlayerStats]);

  // Gérer la fin de la roue
  useEffect(() => {
    if (wheelResult && !wheelSpinning) {
      // Attendre un peu avant d'appliquer le résultat
      const timer = setTimeout(() => {
        handleWheelComplete();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [wheelResult, wheelSpinning, handleWheelComplete]);

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
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-4">
          <Button onClick={onGameEnd} variant="outline" className="text-sm">
            ← Retour
          </Button>
        </div>

        {showSettings ? (
          <div className="space-y-6">
            <h3 className={`text-xl font-semibold ${getTextColor()}`}>
              Gestion des joueurs
            </h3>
            {players.length > 0 ? (
              <div className="space-y-2">
                {players.map(player => (
                  <div 
                    key={player.id}
                    className={`p-3 rounded-lg flex items-center justify-center ${player.preferences.color}`}
                  >
                    <PlayerName player={player} className="text-white font-medium" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-lg text-gray-300">
                Aucun joueur ajouté pour le moment.
              </p>
            )}
            <Button
              onClick={() => setShowSettings(false)}
              className="bg-white/20 hover:bg-white/30 text-white"
            >
              Retour
            </Button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-4">
              <h2 className={`text-3xl font-bold ${getTextColor()}`}>Le Petit Buveur</h2>
              <p className="text-lg text-gray-300">
                Choisissez la difficulté et commencez la partie !
              </p>
            </div>

            <div className="space-y-4">
              <h3 className={`text-xl font-semibold ${getTextColor()}`}>Difficulté :</h3>
              <div className="grid grid-cols-2 gap-4">
                {(Object.keys(difficultyMultipliers) as Difficulty[]).map((diff) => (
                  <Button
                    key={diff}
                    onClick={() => setGameDifficulty(diff)}
                    className={`${
                      gameDifficulty === diff
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                        : 'bg-white/20 hover:bg-white/30 text-white'
                    } font-bold`}
                  >
                    {difficultyNames[diff]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <Button
                onClick={() => {
                  console.log('Bouton "Commencer la partie" cliqué');
                  console.log('Nombre de joueurs:', players.length);
                  console.log('Difficulté sélectionnée:', gameDifficulty);
                  
                  // Lancer directement la partie
                  startGame();
                }}
                disabled={players.length < 2}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold py-3"
              >
                Commencer la partie
              </Button>
              
              <Button
                onClick={() => {
                  console.log('Bouton "Charger la partie en cours" cliqué');
                  if (hasActiveSave) {
                    console.log('Chargement de la partie sauvegardée');
                    resumeGame();
                  } else {
                    console.log('Aucune partie sauvegardée trouvée');
                    alert('Aucune partie en cours trouvée !');
                  }
                }}
                disabled={!hasActiveSave}
                variant="outline"
                className="flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold py-3"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Charger la partie en cours
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center mb-4">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-gray-400">
            Mode {difficultyNames[gameDifficulty]} {gameDifficulty === 'difficile' ? '(max 8 gorgées)' : ''}
          </p>
        </div>
      </div>

      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">Le Petit Buveur</h2>
        <div className="text-gray-300">
          <div className="flex justify-between items-center text-gray-300">
            <p className="text-lg">
              Tour <span className="font-bold">{turnCount}</span>
            </p>
            <p className="text-lg">
              Au tour de <PlayerName player={players[currentPlayer]} className="font-bold" />
            </p>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-6 gap-2 p-4 ${getBgColor()} rounded-lg mb-20`}>
        {Array.from({ length: boardSize }).map((_, index) => {
          const playersOnCase = players.filter(p => p.position === index)
          const gridCols = playersOnCase.length > 4 
            ? 'grid-cols-3' 
            : playersOnCase.length > 2 
              ? 'grid-cols-2' 
              : 'grid-cols-1';
          
          return (
            <div
              key={index}
              className="aspect-square rounded-lg flex items-center justify-center relative bg-white/20"
            >
              <span className={`text-sm font-medium ${getTextColor()}`}>{index + 1}</span>
              <div className={`absolute inset-3 grid ${gridCols} gap-[2px] place-items-center overflow-hidden`}>
                {playersOnCase.map((player) => renderPlayerToken(player))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bouton de lancement de dé et nom du joueur juste après le plateau */}
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg mb-6">
        <div className="container mx-auto">
          <div className="mb-2 text-center">
            <p className="font-medium text-primary">
              Au tour de <PlayerName player={players[currentPlayer]} className="font-bold text-lg" />
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={rollDice}
              disabled={isProcessingTurn}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold py-6 px-8 text-xl shadow-lg"
            >
              <div className="flex items-center justify-center gap-2">
                <span>Lancer le dé</span>
                {isDiceRolling ? (
                  <div className="animate-spin">
                    <Dice6 className="h-6 w-6" />
                  </div>
                ) : (
                  <Dice6 className="h-6 w-6" />
                )}
              </div>
            </Button>
            
            {/* Bouton de secours pour débloquer le jeu */}
            {isProcessingTurn && !isDiceRolling && (
              <Button
                onClick={forceNextPlayer}
                variant="outline"
                className="px-4 text-sm text-red-600 border-red-600 hover:bg-red-50"
                title="Débloquer le jeu si il se bloque"
              >
                🔧
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 ${getBgColor()} rounded-lg shadow-sm`}>
          <h3 className="font-bold mb-2">Classement :</h3>
          <div className="space-y-2">
            {getPlayerRanking().map((player, index) => (
              <div key={player.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{index + 1}.</span>
                  <div className={`w-4 h-4 rounded-full ${player.preferences.color} ring-1 ring-white/30`}></div>
                  <PlayerName player={player} />
                </div>
                <span className="bg-card text-card-foreground px-2 py-1 rounded-md text-sm">Case {player.position + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {currentCase && (
          <div className={`p-4 ${getBgColor()} rounded-lg shadow-sm`}>
            <h3 className="font-bold mb-2">Case actuelle :</h3>
            <p className="whitespace-pre-line bg-card/80 p-3 rounded-md" dangerouslySetInnerHTML={{ __html: currentCase.description }}></p>
          </div>
        )}
      </div>

      {/* Notification d'effet de case - plus visible */}
      <AnimatePresence>
        {showNotification && currentCase && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-x-0 top-1/2 transform -translate-y-1/2 mx-auto w-5/6 max-w-md z-50"
          >
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-6 rounded-lg shadow-lg text-center">
              <h3 className="text-xl font-bold mb-2">Effet de la case :</h3>
              <p className="text-lg whitespace-pre-line mb-4" dangerouslySetInnerHTML={{ __html: currentCase.description }}></p>
              
              {/* Bouton "Suivant" */}
              {showNextButton && (
                <Button
                  onClick={handleNextButtonClick}
                  className="bg-white text-emerald-600 hover:bg-gray-100 font-bold py-2 px-6 rounded-lg shadow-md transition-colors"
                >
                  Suivant
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {players.map((player, index) => (
          <Card
            key={player.id}
            className={`p-4 ${currentPlayer === index ? 'ring-2 ring-primary' : ''} bg-card text-card-foreground`}
          >
            <div className="flex items-center gap-3">
              <Avatar className={`${player.preferences.color} h-10 w-10`}>
                {player.preferences.avatar ? (
                  <AvatarImage src={player.preferences.avatar} alt={player.name} />
                ) : (
                  <AvatarFallback>{player.name[0].toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div>
                <PlayerName player={player} className="font-medium" />
                <div className="text-sm text-muted-foreground">
                  {player.drinks} gorgées
                </div>
                <div className="flex gap-1 mt-1">
                  {player.protected && (
                    <span className="text-xs bg-blue-500 text-white px-1 rounded">🛡️</span>
                  )}
                  {player.cursed > 0 && (
                    <span className="text-xs bg-red-500 text-white px-1 rounded">👻 {player.cursed}</span>
                  )}
                  {player.linkedTo && player.linkedTurns > 0 && (
                    <span className="text-xs bg-purple-500 text-white px-1 rounded">🔗 {player.linkedTurns}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

            {/* Dialog pour sélectionner un joueur cible */}
      {showTargetDialog && (
        <>
          {/* Overlay de secours en cas de problème avec le Dialog */}
          <div className="fixed inset-0 bg-black/80 z-[99] flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6 z-[100]">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold">Choisissez un joueur à cibler</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Sélectionnez un joueur pour révéler et appliquer l'effet de la case !
                </p>
              </div>
              
              {/* Afficher d'abord les autres joueurs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {players.filter(p => p.id !== players[currentPlayer].id).map(player => (
                  <Button
                    key={player.id}
                    onClick={() => {
                      console.log(`Clic sur le joueur: ${player.name}`);
                      handleTargetSelection(player.id);
                    }}
                    className={`p-3 ${player.preferences.color} text-white font-bold`}
                  >
                    <PlayerName player={player} />
                  </Button>
                ))}
              </div>
              
              {/* Puis les options "Joueur aléatoire" et "Vous-même" */}
              <Button 
                onClick={() => {
                  console.log("Clic sur joueur aléatoire");
                  selectRandomPlayer();
                }}
                className="p-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold w-full mb-2"
              >
                Joueur aléatoire
              </Button>
              
              <Button 
                onClick={() => {
                  console.log(`Clic sur vous-même: ${players[currentPlayer].name}`);
                  handleTargetSelection(players[currentPlayer].id);
                }}
                className={`p-4 ${players[currentPlayer].preferences.color} text-white font-bold w-full`}
              >
                Vous-même (<PlayerName player={players[currentPlayer]} />)
              </Button>
            </div>
          </div>
        </>
      )}

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

      {/* Dialog pour la case Défi en chaîne */}
      <Dialog open={showChainDialog} onOpenChange={setShowChainDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🔗 Défi en chaîne</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">
              Choisis avec qui tu seras lié pendant 5 tours :
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.filter(p => p.id !== players[currentPlayer].id).map(player => (
                <Button
                  key={player.id}
                  onClick={() => {
                    setShowChainDialog(false);
                    // Lier le joueur actuel au joueur ciblé
                    const currentPlayerObj = players[currentPlayer];
                    const targetPlayerObj = player;
                    
                    const updatedPlayers = players.map(p => {
                      if (p.id === currentPlayerObj.id) {
                        return { 
                          ...p, 
                          linkedTo: targetPlayerObj.id,
                          linkedTurns: 5
                        };
                      }
                      return p;
                    });
                    
                    setPlayers(updatedPlayers);
                    
                    // Afficher le résultat
                    setCurrentCase({
                      type: 'defi-chaine',
                      description: `🔗 ${currentPlayerObj.name} est maintenant lié à ${targetPlayerObj.name} pendant 5 tours !`,
                      effect: 5
                    });
                    
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
                    
                    // Afficher le résultat
                    setCurrentCase({
                      type: 'echange',
                      description: `🔄 ${currentPlayerObj.name} et ${targetPlayerObj.name} ont échangé leurs positions !`,
                      effect: 0
                    });
                    
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 20
              }}
              className="bg-card/90 backdrop-blur-md rounded-lg shadow-xl max-w-2xl w-full mx-auto overflow-hidden"
            >
              <div className="p-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-2">🎯 Roue des Gorgées</h2>
                  <p className="text-muted-foreground">
                    Au tour de <PlayerName player={players[currentPlayer]} className="font-bold" />
                  </p>
                </div>

                <div className="flex flex-col items-center gap-6">
                  <div className="relative w-64 h-64 md:w-80 md:h-80">
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
                      className="px-8 py-4 text-lg font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                    >
                      {wheelSpinning ? 'La roue tourne…' : 'Lancer la roue'}
                    </Button>
                  )}

                  {wheelResult && (
                    <div className="text-center">
                      <div className="text-xl font-bold mb-2">
                        Résultat : {wheelResult.label}
                      </div>
                      <Button 
                        onClick={() => {
                          setShowWheel(false);
                          setWheelResult(null);
                          // Le bouton "Suivant" sera affiché par handleWheelComplete
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg shadow-lg"
                      >
                        Continuer
                      </Button>
                    </div>
                  )}
                </div>

                {/* Légende des couleurs */}
                {wheelSegments.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3">Légende</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      {Object.entries(wheelSegments.reduce<Record<string, { color: string; count: number }>>((acc, s) => {
                        const key = s.label
                        const color = colorForValue(s.value)
                        if (!acc[key]) acc[key] = { color, count: 0 }
                        acc[key].count += 1
                        return acc
                      }, {})).map(([label, info]) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: info.color }} />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 20,
                delay: 0.2
              }}
              className="bg-card/90 backdrop-blur-md rounded-lg shadow-xl max-w-md w-full mx-auto overflow-hidden"
            >
              <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary-foreground opacity-30 z-0"></div>
                <div className="p-6 relative z-10">
                  <div className="flex justify-center mb-4">
                    <motion.div
                      initial={{ rotateY: 0 }}
                      animate={{ rotateY: 360 }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        repeatType: "loop",
                        ease: "linear"
                      }}
                    >
                      <Trophy className="w-16 h-16 text-yellow-400" />
                    </motion.div>
                  </div>
                  
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl font-bold text-center mb-6"
                  >
                    🎉 <PlayerName player={winner} /> a gagné ! 🎉
                  </motion.h2>
                  
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-6"
                  >
                    <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3">Statistiques de partie</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Tours joués:</span>
                          <span className="font-medium">{turnCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mode de jeu:</span>
                          <span className="font-medium">{difficultyNames[gameDifficulty]}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Joueurs:</span>
                          <span className="font-medium">{players.length}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3">Classement final</h3>
                      <div className="space-y-3">
                        {getPlayerRanking().map((player, index) => (
                          <div 
                            key={player.id} 
                            className={`flex items-center justify-between p-2 rounded-md ${
                              player.id === winner.id 
                                ? 'bg-gradient-to-r from-yellow-400/30 to-amber-500/30 border border-yellow-400/50' 
                                : 'bg-card/50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-amber-700' : ''}`}>
                                {index + 1}.
                              </span>
                              <Avatar className={`${player.preferences.color} h-6 w-6`}>
                                {player.preferences.avatar ? (
                                  <AvatarImage src={player.preferences.avatar} alt={player.name} />
                                ) : (
                                  <AvatarFallback>{player.name[0].toUpperCase()}</AvatarFallback>
                                )}
                              </Avatar>
                              <PlayerName player={player} className="font-medium" />
                              {player.id === winner.id && (
                                <Trophy className="h-4 w-4 text-yellow-400 ml-1" />
                              )}
                            </div>
                            <div className="flex items-center">
                              <span className="text-sm">{player.drinks} gorgées</span>
                              <span className="mx-2">•</span>
                              <span className="text-sm">Case {player.position + 1}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 pt-2">
                      <Button
                        onClick={resetGame}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold py-4"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" /> Rejouer
                      </Button>
                      <Button
                        onClick={onGameEnd}
                        variant="outline"
                        className="py-4"
                      >
                        <Home className="mr-2 h-4 w-4" /> Retour au menu
                      </Button>
                    </div>
                  </motion.div>
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
                      console.log('Bouton "Reprendre la partie" dans le dialogue cliqué');
                      resumeGame();
                    }}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reprendre la partie
                  </Button>
                  <Button
                    onClick={() => {
                      console.log('Bouton "Nouvelle partie" dans le dialogue cliqué');
                      deleteSave();
                      setShowSaveDialog(false);
                      // Continuer vers la sélection de difficulté
                      console.log('Continuation vers la sélection de difficulté');
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
  );
}