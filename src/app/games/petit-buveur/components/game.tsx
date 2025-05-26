/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Sun, Moon, Dice6, User, Users, Trophy, ArrowRight, RefreshCw, Home } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences, PLAYER_ICONS } from '@/lib/players'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { detectBrowserCapabilities } from '@/lib/browser-support'
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
  type: 'normal' | 'defi' | 'gorgée' | 'recul' | 'avance' | 'tous'
  description: string
  effect: number
}

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

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

const generateCase = (difficulty: Difficulty): Case => {
  // Réduire la probabilité d'obtenir une case de type 'tous' à maximum 10%
  const random = Math.random();
  let type: 'normal' | 'defi' | 'gorgée' | 'recul' | 'avance' | 'tous';
  
  if (random < 0.1) {
    // 10% de chance d'obtenir une case 'tous'
    type = 'tous';
  } else {
    // Répartir les autres types sur les 90% restants
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
    initialPlayers.map(p => ({
      ...p,
      position: 0,
      drinks: 0,
      preferences: p.preferences || {
        color: defaultColor,
        icon: PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)],
        specialEffect: null
      },
      id: p.id || `player-${Math.random().toString(36).substring(2, 9)}`
    }))
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
    if (isProcessingTurn || isDiceRolling) return;
    
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
        
        // Générer un effet aléatoire
        const caseType = generateCase(gameDifficulty);
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

    // Pour toutes les cases, y compris les cases normales, utiliser la logique de ciblage
    console.log("Affichage de la fenêtre de ciblage pour la case de type: " + caseType.type);
    setPendingCase(caseType);
    setPendingPosition(currentPosition);
    
    setPlayers(updatedPlayers);
    
    // Afficher la description générique avant le ciblage
    setCurrentCase({
      ...caseType,
      description: `Vous devez choisir un joueur à cibler !`
    });
    
    setShowTargetDialog(true);
    // La logique de `handleTargetSelection` et `applyEffectToPlayer` prendra le relais
  };

  const movePlayer = (playerId: string, newPosition: number) => {
    // Fonction simplifiée pour déplacer un joueur directement
    console.log(`movePlayer: Déplacement du joueur ${playerId} vers la position ${newPosition + 1}`);
    setPlayers(prevPlayers => 
      prevPlayers.map(p => p.id === playerId ? { ...p, position: newPosition } : p)
    );
  };

  const handleTargetSelection = (targetId: string) => {
    // Fermer la fenêtre de ciblage
    setShowTargetDialog(false);
    
    console.log(`handleTargetSelection: Joueur ciblé: ${targetId}, pendingCase: ${pendingCase?.type}`);
    
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
    
    // Révéler l'effet maintenant que le joueur est ciblé
    let descriptionEffet = pendingCase.description;
    
    // Pour les cases "safe"
    if (pendingCase.type === 'normal') {
      descriptionEffet = `Case safe ! Le joueur <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> est en sécurité pour ce tour.`;
    }
    // Pour les cases "avance" ou "recul"
    else if (pendingCase.type === 'avance' || pendingCase.type === 'recul') {
      // Garder les compliments pour Sim ou Riqui
      if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
        const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
        descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span>`;
      } else {
        // Format standard pour les autres joueurs
        descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
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
        } 
        // Cas spécial pour Deb - sans phrase spéciale quand elle est épargnée
        else if (targetPlayer.name.toLowerCase() === 'deb') {
          descriptionEffet = `${pendingCase.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
        }
        else {
          descriptionEffet = `${pendingCase.description}\n\nJoueur épargné : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
        }
      } else {
        // Easter egg pour Sim ou Riqui
        if (targetPlayer.name.toLowerCase() === 'sim' || targetPlayer.name.toLowerCase() === 'riqui') {
          const compliment = simCompliments[Math.floor(Math.random() * simCompliments.length)];
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">"${compliment}" ${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
        } 
        // Cas spécial pour Deb - avec message spécial quand elle boit directement, mais sans couleur
        else if (targetPlayer.name.toLowerCase() === 'deb') {
          const message = debMessages[Math.floor(Math.random() * debMessages.length)];
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span> ${message}`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
        }
        else {
          descriptionEffet = `${pendingCase.description}\n\nJoueur ciblé : <span class="${targetPlayer.preferences.color} text-white px-2 py-1 rounded-md">${targetPlayer.name}</span>`;
          if (showRandomMessage) {
            descriptionEffet += `\n\n<span class="italic text-sm">${randomMessage}</span>`;
          }
        }
      }
    }
    
    setCurrentCase({
      ...pendingCase,
      description: descriptionEffet
    });
    
    // Afficher la notification avec l'effet révélé
    setShowNotification(true);
    
    // Masquer la notification après un délai
    setTimeout(() => {
      setShowNotification(false);
    }, 3000);
    
    // Appliquer l'effet au joueur ciblé
    applyEffectToPlayer(targetId);
  };

  const applyEffectToPlayer = (targetPlayerId: string) => {
    if (!pendingCase || pendingPosition === null) {
      setIsProcessingTurn(false);
      return;
    }
    
    console.log(`applyEffectToPlayer: Joueur ciblé: ${targetPlayerId}, type de case: ${pendingCase.type}`);
    
    // Créer une copie des joueurs pour la mise à jour
    const updatedPlayers = [...players];
    const targetPlayer = updatedPlayers.find(p => p.id === targetPlayerId);
    
    if (!targetPlayer) {
      setIsProcessingTurn(false);
      return;
    }
    
    // Appliquer l'effet en fonction du type de case
    switch (pendingCase.type) {
      case 'normal':
        // Pour les cases safe, on ne fait rien de spécial
        console.log(`Le joueur ${targetPlayer.name} est sur une case safe`);
        break;
        
      case 'tous':
        // Faire boire tous les autres joueurs sauf le joueur ciblé
        updatedPlayers.forEach((p) => {
          if (p.id !== targetPlayerId) {
            p.drinks += pendingCase.effect;
            console.log(`Le joueur ${p.name} boit ${pendingCase.effect} gorgées`);
            
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
        break;
        
      case 'gorgée':
        // Ajouter des gorgées au joueur ciblé
        targetPlayer.drinks += pendingCase.effect;
        console.log(`Le joueur ${targetPlayer.name} boit ${pendingCase.effect} gorgées`);
        
        // Mettre à jour les statistiques
        try {
          updatePlayerStats(targetPlayer.id, 'petit-buveur', {
            totalDrinks: targetPlayer.drinks
          });
        } catch (error) {
          console.error("Erreur lors de la mise à jour des statistiques:", error);
        }
        break;
        
      case 'avance':
      case 'recul':
        // Vérifier si le joueur est sur la case 1 et que l'effet est un recul
        if (pendingCase.type === 'recul' && pendingPosition === 0) {
          console.log(`Le joueur ${targetPlayer.name} est sur la case 1 et ne peut pas reculer`);
          // Ne pas appliquer l'effet de recul
          break;
        }

        // Calculer la nouvelle position après l'effet
        const effectPosition = Math.max(0, Math.min(boardSize - 1, pendingPosition + pendingCase.effect));
        console.log(`applyEffectToPlayer: Effet ${pendingCase.type}, déplacement de ${pendingPosition + 1} vers ${effectPosition + 1}`);
        
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
        break;
        
      // Pour les autres types de cases (normal, defi)
      default:
        console.log(`Aucun effet spécial à appliquer pour la case de type ${pendingCase.type}`);
        break;
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
      
      // Passer au joueur suivant après un délai
      const nextPlayer = (currentPlayer + 1) % updatedPlayers.length;
      if (nextPlayer === 0) {
        setTurnCount(turnCount + 1);
      }
      setCurrentPlayer(nextPlayer);
      setIsProcessingTurn(false);
    }, 2000);
  };

  const selectRandomPlayer = () => {
    console.log("Sélection d'un joueur aléatoire");
    
    // Sélectionner un joueur aléatoire parmi tous les joueurs
    const eligiblePlayers = [...players];
    if (eligiblePlayers.length > 0) {
      const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
      const randomPlayer = eligiblePlayers[randomIndex];
      console.log(`Joueur aléatoire sélectionné: ${randomPlayer.name}`);
      handleTargetSelection(randomPlayer.id);
    } else {
      // S'il n'y a pas d'autres joueurs, sélectionner le joueur actuel
      console.log(`Aucun autre joueur disponible, sélection du joueur actuel: ${players[currentPlayer].name}`);
      handleTargetSelection(players[currentPlayer].id);
    }
  };

  const startGame = () => {
    if (players.length >= 2) {
      // Réinitialiser les positions et les boissons des joueurs
      const resetPlayers = players.map(p => ({
        ...p,
        position: 0,
        drinks: 0
      }));
      
      // Mettre à jour l'état des joueurs
      setPlayers(resetPlayers);
      
      // Initialiser les autres états du jeu
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
      
      console.log("Jeu démarré avec les joueurs:", resetPlayers);
    }
  }

  const resetGame = useCallback(() => {
    setPlayers(
      initialPlayers.map(p => ({
        ...p,
        position: 0,
        drinks: 0,
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
                Ajoutez des joueurs pour commencer la partie !
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Input
                placeholder="Nom du joueur"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="bg-white/20 border-white/20 text-white"
              />
              <Button 
                onClick={addPlayer}
                className="bg-white/20 hover:bg-white/30 text-white"
              >
                Ajouter
              </Button>
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

            {players.length > 0 && (
              <div className="space-y-4">
                <h3 className={`text-xl font-semibold ${getTextColor()}`}>Joueurs :</h3>
                <div className="grid grid-cols-2 gap-2">
                  {players.map(player => (
                    <div 
                      key={player.id}
                      className={`p-3 rounded-lg ${player.preferences.color} flex items-center justify-between`}
                    >
                      <PlayerName player={player} className="text-white font-medium" />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPlayerToDelete(player.id);
                          setShowConfirmation('delete-player');
                        }}
                        className="text-white/80 hover:text-white"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex mt-8">
              <Button
                onClick={startGame}
                disabled={players.length < 2}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold py-3"
              >
                Commencer la partie
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <Button 
          onClick={() => {
            if (confirm("Êtes-vous sûr de vouloir quitter la partie en cours ?")) {
              onGameEnd();
            }
          }} 
          variant="outline" 
          className="text-sm"
        >
          Quitter
        </Button>
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
              <p className="text-lg whitespace-pre-line" dangerouslySetInnerHTML={{ __html: currentCase.description }}></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton de lancement de dé et nom du joueur fixés en bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 z-40 shadow-lg">
        <div className="container mx-auto">
          <div className="mb-2 text-center">
            <p className="font-medium text-primary">
              Au tour de <PlayerName player={players[currentPlayer]} className="font-bold text-lg" />
            </p>
          </div>
          <Button
            onClick={rollDice}
            disabled={isProcessingTurn}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold py-6 px-8 text-xl shadow-lg"
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-32">
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
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Dialog pour sélectionner un joueur cible */}
      <Dialog open={showTargetDialog} onOpenChange={(open) => {
        // Si l'utilisateur ferme la fenêtre manuellement, on considère qu'il annule
        if (!open && showTargetDialog) {
          console.log("Fermeture manuelle de la fenêtre de ciblage");
          // Sélectionner le joueur actuel par défaut
          handleTargetSelection(players[currentPlayer].id);
        }
        setShowTargetDialog(open);
      }}>
        <DialogContent className="sm:max-w-md pb-6">
          <DialogHeader>
            <DialogTitle>Choisissez un joueur à cibler</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            <p className="text-center text-muted-foreground">
              Sélectionnez un joueur pour révéler et appliquer l'effet de la case !
            </p>
            
            {/* Afficher d'abord les autres joueurs */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {players.filter(p => p.id !== players[currentPlayer].id).map(player => (
                <Button
                  key={player.id}
                  onClick={() => handleTargetSelection(player.id)}
                  className={`p-3 ${player.preferences.color} text-white font-bold`}
                >
                  <PlayerName player={player} />
                </Button>
              ))}
            </div>
            
            {/* Puis les options "Joueur aléatoire" et "Vous-même" */}
            <Button 
              onClick={selectRandomPlayer}
              className="p-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold"
            >
              Joueur aléatoire
            </Button>
            
            <Button 
              onClick={() => handleTargetSelection(players[currentPlayer].id)}
              className={`p-4 ${players[currentPlayer].preferences.color} text-white font-bold`}
            >
              Vous-même (<PlayerName player={players[currentPlayer]} />)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}