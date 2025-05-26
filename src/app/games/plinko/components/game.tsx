"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Player } from '@/types/game'

// --- MODIFICATION: Exporter le type DifficultyLevel ---
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
// ----------------------------------------------------

interface GameProps {
  players: Player[]
  onGameEnd: () => void
  onRestartGame: () => void
  difficulty: DifficultyLevel
  isCumulativeMode: boolean
}

// --- AJOUT: Définition des settings de difficulté ici pour l'utiliser dans le setup ---
const DIFFICULTY_SETTINGS: Record<DifficultyLevel, { range: { min: number; max: number } }> = {
  easy:   { range: { min: 1, max: 2 } },
  medium: { range: { min: 1, max: 3 } },
  hard:   { range: { min: 1, max: 4 } }
};
// ---------------------------------------------------------------------------------

// Définition des valeurs des cases (nombre de gorgées)
// const SLOT_VALUES = [5, 2, 1, 2, 5] // Anciennement MULTIPLIERS - SUPPRIMÉ

// Nombre de rangées d'obstacles
const ROWS = 8;

// --- NOUVEAU: Configuration du nombre de pins par rangée --- 
const generateRandomPinsConfig = () => {
  const config = new Map<number, number>();
  for (let row = 0; row < ROWS; row++) {
    // Générer un nombre aléatoire entre 3 et 9 pour chaque rangée
    const pinsInRow = Math.floor(Math.random() * 8) + 5; // 7 possibilités (3 à 9) + 3 pour le minimum
    config.set(row, pinsInRow);
  }
  return config;
};

const DEFAULT_PINS_PER_ROW_FALLBACK = (row: number) => row + 2; // Fallback si non défini
// -----------------------------------------------------------

// Paramètres de gravité et rebond
const GRAVITY = 0.6; // Facteur d'accélération
const BOUNCINESS = 0.8; // Facteur de rebond (réduction de vitesse après rebond)

// --- NOUVEAU: Paramètres physiques et visuels centralisés ---
// Rayons pour la physique des collisions (en % de la largeur/hauteur)
const PHYSICS_BALL_RADIUS_PERCENT = 1.2;
const PHYSICS_PIN_RADIUS_PERCENT = 1; // Utilisé pour pins normaux ET spéciaux
// Facteurs pour la physique des rebonds
// const PHYSICS_HORIZONTAL_PUSH_FACTOR = 2.0; // Poussée horizontale après rebond
const PHYSICS_OVERLAP_PUSH_MULTIPLIER = 1.1; // Pour mieux séparer après collision
// Taille visuelle des éléments (classes Tailwind)
const VISUAL_BALL_SIZE_CLASS = 'w-5 h-5';
const VISUAL_NORMAL_PIN_SIZE_CLASS = 'w-4 h-4';
const VISUAL_SPECIAL_PIN_SIZE_CLASS = 'w-4 h-4';
// Paramètres de départ des balles
const DROP_START_X_MIN = 10;
const DROP_START_X_MAX = 90;
const ADD_BALL_START_X_MIN = 10;
const ADD_BALL_START_X_MAX = 90;
const ADD_BALL_VELOCITY_X_MAGNITUDE = 2.0;
const INITIAL_VELOCITY_Y = 0.1;
// ---------------------------------------------------------

// Nombre cible de cases en bas
const TARGET_NUM_SLOTS = 10;

// Distance minimale 2D entre les pins normaux
const MIN_NORMAL_PIN_DISTANCE_PERCENT = 5;

// --- Configuration des Pins Spéciaux ---
// --- MODIFICATION: Calculer le nombre de pins spéciaux comme 30% des pins normaux --- 
const SPECIAL_PINS_PERCENTAGE = 0.40; // 30% des pins normaux seront spéciaux
const JACKPOT_VALUE = 7; // Valeur fixe pour le jackpot
// -----------------------------------------------------------------------

// Types de pins spéciaux
// --- MODIFICATION: Ajouter les nouveaux types ---
type SpecialPinType = 
    'multiplier' | 
    'addBall' | 
    'addSip' | 
    'subtractSip' | 
    'cancellation' | 
    'colorSwap' | 
    'mystery' | 
    'shake' | 
    'roundDrinks' | 
    'jackpot';
// ----------------------------------------------

// Couleurs des pins spéciaux (Tailwind classes)
// --- MODIFICATION: Ajouter les couleurs des nouveaux pins ---
const SPECIAL_PIN_COLORS: Record<SpecialPinType, { border: string; bg: string; }> = {
  multiplier:   { border: 'border-red-800',    bg: 'bg-red-400' },    
  addBall:      { border: 'border-blue-800',   bg: 'bg-blue-400' },   
  addSip:       { border: 'border-green-800',  bg: 'bg-green-400' },  
  subtractSip:  { border: 'border-orange-800', bg: 'bg-orange-400' }, 
  cancellation: { border: 'border-gray-800',   bg: 'bg-gray-400' },   
  colorSwap:    { border: 'border-pink-800',   bg: 'bg-pink-400' },   
  mystery:      { border: 'border-indigo-800', bg: 'bg-indigo-400' }, 
  shake:        { border: 'border-yellow-800', bg: 'bg-yellow-400' }, 
  roundDrinks:  { border: 'border-teal-800',   bg: 'bg-teal-400' },   
  jackpot:      { border: 'border-amber-800',  bg: 'bg-amber-400' },  
};
// -------------------------------------------------------

// --- Descriptions des effets des pins spéciaux ---
// --- MODIFICATION: Ajouter les descriptions des nouveaux pins ---
const SPECIAL_PIN_EFFECTS: Record<SpecialPinType, string> = {
  multiplier:   "Multiplie les gorgées x2",
  addBall:      "Lance une balle supplémentaire (même couleur)",
  addSip:       "Ajoute +1 gorgée au résultat",
  subtractSip:  "Retire -1 gorgée au résultat (min 0)",
  cancellation: "Annule tous les effets de la balle",
  colorSwap:    "Inverse la couleur de la balle (Rouge <-> Vert)",
  mystery:      "Déclenche un effet spécial aléatoire (?)",
  shake:        "Mélange les valeurs des cases du bas !",
  roundDrinks:  "Tournée Générale ! (+1 gorgée pour tous)",
  jackpot:      `JACKPOT ! Vaut ${JACKPOT_VALUE} gorgées fixes`,
};
// -----------------------------------------------------------
// --- Fin Descriptions ---

/* // Désactivé car non utilisé pour l'instant
// Composant Badge pour afficher un pin avec son type et sa couleur
const SpecialPinBadge = ({ type }: { type: SpecialPinType }) => {
  const colors = SPECIAL_PIN_COLORS[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${colors.border.replace('border-', 'text-')} bg-slate-800 border ${colors.border} mr-1`}>
      {type}
    </span>
  );
};
*/

// Composant pour afficher les logs d'effets avec une meilleure présentation
/* // Désactivé car non utilisé pour l'instant
const EffectLogItem = ({ log }: { log: string }) => {
  // Cherche si le log commence par "Pin X:" pour extraire le type
  const pinTypeMatch = log.match(/^Pin (\w+):/);
  if (pinTypeMatch && pinTypeMatch[1]) {
    const pinType = pinTypeMatch[1] as SpecialPinType;
    const restOfLog = log.replace(/^Pin \w+: /, '');
    
    return (
      <li className="flex items-start">
        <SpecialPinBadge type={pinType} />
        <span>{restOfLog}</span>
      </li>
    );
  }
  
  // Pour les logs d'effets induits (commençant par "->")
  if (log.startsWith('->')) {
    return <li className="ml-5 text-slate-400">{log}</li>;
  }
  
  // Fallback pour les autres types de logs
  return <li>{log}</li>;
};
*/

// Structure du plateau : nombre de compartiments - Dépendra de l'état
// const NUM_SLOTS = SLOT_VALUES.length // Supprimé

// Couleurs des balles
// const BALL_COLORS = {
//   RED: 'bg-red-500', // Gorgées à boire
//   GREEN: 'bg-green-500' // Gorgées à donner
// } - SUPPRIMÉ

// Interface pour TOUS les pins spéciaux
interface SpecialPin extends PinPosition {
  id: string;
  type: SpecialPinType;
  hitByBallIds: Set<string>; // Gardé pour info: quelles balles ont touché
  usedThisTurn: boolean; 
}

interface PinPosition {
  x: number;
  y: number;
}

// Interface pour l'état d'une balle (utilisé pour extra et l'état interne anim)
interface BallAnimationData {
    id: string; // ID Unique pour les balles extra
    x: number;
    y: number;
    velocityY: number;
    velocityX: number;
    active: boolean;
    color: 'red' | 'green';
    // Effets accumulés par CETTE balle
    effects: {
        multiplierCount: number;
        sipsToAdd: number;
        sipsToSubtract: number;
        hitCountPerPin: Map<string, number>; 
        effectsReset: boolean;
        jackpotHit: boolean;
    };
    finalSipResult?: number; // Stocke le résultat quand active devient false
    powerupEvents?: PowerupEvent[]; // Ajouté
    // effectLog: string[]; // SUPPRIMÉ
}

// --- Interface pour l'état interne de l'animation --- 
interface AnimationState {
    red: BallAnimationData | null;
    green: BallAnimationData | null;
    extra: BallAnimationData[]; // Doit être un tableau maintenant
}
// --- Fin Interface ---

// --- SUPPRIMÉ: État pour l'historique complet des effets ---
// const [gameHistory, setGameHistory] = useState<...>([]);

// Ajouter après les autres interfaces
interface PowerupEvent {
  type: SpecialPinType;
  timestamp: number;
  description: string;
  color: 'red' | 'green'; // Ajouté
}

interface TurnResult {
  redSips: number;
  greenSips: number;
  powerups: PowerupEvent[];
}

// Modifier l'interface des résultats joueur
interface PlayerResults {
  redSips: number;
  greenSips: number;
  powerups: PowerupEvent[];
}[]

type ResultDisplayPhase = 'tournees' | 'details' | 'final';

// Mapping pour affichage simplifié des powerups
const SPECIAL_PIN_LABELS: Record<SpecialPinType, string> = {
  multiplier: 'x2',
  addBall: '+balle',
  addSip: '+1',
  subtractSip: '-1',
  cancellation: 'supprime tous les effets',
  colorSwap: 'changement de couleur',
  mystery: 'Aléatoire',
  shake: 'Changement de gorgée des cases',
  roundDrinks: 'Tournée Générale',
  jackpot: 'Jackpot',
};

export default function Game({ players, onGameEnd, onRestartGame, difficulty, isCumulativeMode }: GameProps) {
  // États du jeu
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pinPositions, setPinPositions] = useState<PinPosition[]>([]);
  const [slotSipValues, setSlotSipValues] = useState<number[]>([]);
  const [specialPins, setSpecialPins] = useState<SpecialPin[]>([]);
  const [gameVersion, setGameVersion] = useState(0);
  const [pinsPerRowConfig, setPinsPerRowConfig] = useState<Map<number, number>>(generateRandomPinsConfig());
  const [ballPositions, setBallPositions] = useState<{
    red: { x: number; y: number; color: 'red' | 'green' };
    green: { x: number; y: number; color: 'red' | 'green' };
  }>({ 
    red: { x: 50, y: -10, color: 'red' }, 
    green: { x: 50, y: -10, color: 'green' } 
  });
  const [extraBalls, setExtraBalls] = useState<BallAnimationData[]>([]);
  const [finalSlotIndices, setFinalSlotIndices] = useState<{
    red: number | null;
    green: number | null;
    extra: number | null;
  }>({ red: null, green: null, extra: null });
  const [turnResult, setTurnResult] = useState<{
    redSips: number | null;
    greenSips: number | null;
    extraSips?: number | null;
  } | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, TurnResult[]>>({});
  const [roundDrinksCount, setRoundDrinksCount] = useState(0);
  
  // États pour l'affichage des résultats
  const [resultDisplayPhase, setResultDisplayPhase] = useState<ResultDisplayPhase>('tournees');
  const [currentPlayerResultIndex, setCurrentPlayerResultIndex] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null)
  const animationRefs = useRef<{ red: number | null, green: number | null }>({ red: null, green: null })

  // --- Effet pour nettoyer l'état visuel après un changement de joueur --- 
  useEffect(() => {
    // Ne rien faire si le jeu est terminé ou si une animation est en cours
    if (gameOver || isAnimating) {
        return;
    }

    // Mettre un court délai avant de nettoyer pour laisser voir le résultat précédent
    const cleanupTimeout = setTimeout(() => {
        console.log("Nettoyage de l'état visuel pour le nouveau tour.");
        setTurnResult(null); // Effacer l'affichage du résultat précédent
        setFinalSlotIndices({ red: null, green: null, extra: null }); // Effacer le highlight
        setExtraBalls([]); // Effacer les balles extra visibles
        // --- MODIFICATION: Réinitialiser usedThisTurn et hitByBallIds --- 
        setSpecialPins(prevPins => prevPins.map(p => ({ ...p, hitByBallIds: new Set<string>(), usedThisTurn: false })));
        // -------------------------------------------------------------
        // Reset ball positions to off-screen ready for next drop
        setBallPositions({ red: { x: 50, y: -10, color: 'red' }, green: { x: 50, y: -10, color: 'green' } }); 
        // Ne pas nettoyer turnEffectLogs:
        // setTurnEffectLogs(null); // <<< NOUVEAU: Nettoyer l'historique
    }, 1500); // Délai de 1.5 secondes

    // Nettoyer le timeout si le composant est démonté ou si l'état change avant la fin
    return () => clearTimeout(cleanupTimeout);

  }, [currentPlayerIndex, gameOver, isAnimating]); // Déclencher au changement de joueur (et vérifier gameOver/isAnimating)
  // --- Fin Effet Nettoyage ---

  // --- MODIFICATION: useEffect pour initialiser/réinitialiser le jeu basé sur les props --- 
  useEffect(() => {
    console.log(`Initialisation/Réinitialisation du jeu en mode : ${difficulty}`);

    // Générer une nouvelle configuration de pins
    setPinsPerRowConfig(generateRandomPinsConfig());

    // 1. Générer les valeurs des gorgées pour les cases selon la difficulté reçue
    const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
    const newSlotValues = Array.from({ length: TARGET_NUM_SLOTS }, () =>
      Math.floor(Math.random() * (max - min + 1)) + min
    );
    setSlotSipValues(newSlotValues);
    console.log("Valeurs des cases générées :", newSlotValues);

    // 2. Générer les positions des pins normaux
    const newNormalPins: PinPosition[] = [];
    for (let row = 0; row < ROWS; row++) {
        newNormalPins.push(...calculatePinsForRow(row));
    }
    // Assurer un pin au point de départ
    const startPinY = (0 + 1) * (100 / (ROWS + 1));
    const startPinX = 50;
    const proximityThreshold = MIN_NORMAL_PIN_DISTANCE_PERCENT / 2;
    let pinExistsNearStart = false;
    for(const pin of newNormalPins) {
        if (Math.abs(pin.x - startPinX) < proximityThreshold && Math.abs(pin.y - startPinY) < proximityThreshold) {
            pinExistsNearStart = true;
            break;
        }
    }
    if (!pinExistsNearStart) {
        console.log("Aucun pin proche du départ, ajout d'un pin de départ forcé.");
        newNormalPins.push({ x: startPinX, y: startPinY });
    }
    setPinPositions(newNormalPins);
    console.log("Pins normaux générés :", newNormalPins.length);

    // 3. Générer TOUS les pins spéciaux
    const newSpecialPins = generateSpecialPins(newNormalPins);
    // --- MODIFICATION: Initialiser usedThisTurn et hitByBallIds --- 
    setSpecialPins(newSpecialPins.map(p => ({...p, hitByBallIds: new Set<string>(), usedThisTurn: false })));
    // -------------------------------------------------------------
    console.log("Pins spéciaux générés :", newSpecialPins.length);

    // 4. Réinitialiser les états spécifiques au tour/jeu
    setCurrentPlayerIndex(0);
    setGameOver(false);
    setIsAnimating(false);
    setBallPositions({ red: { x: 50, y: -10, color: 'red' }, green: { x: 50, y: -10, color: 'green' } });
    setExtraBalls([]);
    setFinalSlotIndices({ red: null, green: null, extra: null });
    setTurnResult(null);
    setPlayerResults({});
    // --- AJOUT: Réinitialiser le compteur de tournées --- 
    setRoundDrinksCount(0); 
    // setTurnEffectLogs(null); // SUPPRIMÉ: Réinitialiser l'historique
    
    // Nettoyer les animations au démontage ou si les props changent
    const animRef = animationRefs.current;
    return () => {
      if (animRef.red) cancelAnimationFrame(animRef.red);
      if (animRef.green) cancelAnimationFrame(animRef.green);
       animationRefs.current = { red: null, green: null }; // Aussi reset la ref
    }
    // Se déclenche si la difficulté ou les joueurs changent (nouvelle partie)
  }, [difficulty, players, gameVersion]); 
  // --- Fin useEffect Initialisation ---

  // --- MODIFICATION: Mise à jour de onRestartGame pour incrémenter gameVersion ---
  const handleRestartGame = () => {
    setGameVersion(prev => prev + 1); // Incrémenter gameVersion
    onRestartGame(); // Appeler la fonction originale
  };

  // Calcule les positions des pins pour une rangée, style Plinko classique (quinconce)
  const calculatePinsForRow = (row: number) => {
    // --- MODIFICATION: Utiliser la configuration dynamique des pins --- 
    let pinsInRow = pinsPerRowConfig.get(row);
    if (pinsInRow === undefined) {
        pinsInRow = DEFAULT_PINS_PER_ROW_FALLBACK(row);
        console.warn(`Configuration manquante pour la rangée ${row + 1} (index ${row}). Utilisation du fallback: ${pinsInRow} pins.`);
    }
    // ------------------------------------------------------------------
    
    const isEvenRow = row % 2 === 0;
    const intervals = pinsInRow + (isEvenRow ? 0 : 1); 
    
    return Array.from({ length: pinsInRow }).map((_, index) => {
      let xPos;
      if (isEvenRow) {
        xPos = ((index + 0.5) * 100) / pinsInRow;
      } else {
        xPos = ((index + 1) * 100) / intervals;
      }
      const yPos = (row + 1) * (100 / (ROWS + 1));
      return { x: xPos, y: yPos };
    });
  }

  // --- Fonction séparée pour générer TOUS les pins spéciaux --- 
  // --- RE-RE-RE-MODIFICATION: Les pins spéciaux remplacent aléatoirement des pins normaux --- 
  const generateSpecialPins = (currentNormalPins: PinPosition[]): SpecialPin[] => {
    const newSpecialPins: SpecialPin[] = [];
    
    // 1. Calculer le nombre exact de pins spéciaux (30% des pins normaux)
    const numNormalPins = currentNormalPins.length;
    if (numNormalPins === 0) return []; // Sécurité
    const totalPinsToPlace = Math.round(numNormalPins * SPECIAL_PINS_PERCENTAGE);
    console.log(` -> Calcul du nombre de pins spéciaux: ${numNormalPins} pins normaux * ${SPECIAL_PINS_PERCENTAGE * 100}% = ${totalPinsToPlace} pins spéciaux`);

    // 2. Liste des types possibles
    const availablePinTypes: SpecialPinType[] = [
        'multiplier', 'addBall', 'addSip', 'subtractSip', 'cancellation', 
        'colorSwap', 'mystery', 'shake', 'roundDrinks', 'jackpot'
    ];

    // 3. Sélectionner aléatoirement les indices des pins normaux à remplacer
    const normalPinIndices = Array.from({ length: numNormalPins }, (_, i) => i);
    // Mélange Fisher-Yates pour obtenir des indices aléatoires sans répétition
    for (let i = normalPinIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [normalPinIndices[i], normalPinIndices[j]] = [normalPinIndices[j], normalPinIndices[i]];
    }
    const indicesToReplace = normalPinIndices.slice(0, totalPinsToPlace);
    console.log(`   -> Indices des pins normaux remplacés: [${indicesToReplace.join(', ')}]`);

    // 4. Créer les pins spéciaux aux positions sélectionnées avec types aléatoires
    const addedCounts = { addBall: 0, jackpot: 0 }; // Suivi pour les limites

    indicesToReplace.forEach((pinIndex, iterationIndex) => {
        const position = currentNormalPins[pinIndex];
        if (!position) return; // Sécurité

        let randomType: SpecialPinType;
        let selectionAttempts = 0;
        const maxSelectionAttempts = 20;
        
        // Choisir un type aléatoire en respectant les limites
        do {
            randomType = availablePinTypes[Math.floor(Math.random() * availablePinTypes.length)];
            selectionAttempts++;
            if (selectionAttempts > maxSelectionAttempts) break; 
        } while (
            (randomType === 'addBall' && addedCounts.addBall >= 1) ||
            (randomType === 'jackpot' && addedCounts.jackpot >= 1)
        );

        if (selectionAttempts > maxSelectionAttempts) {
             console.warn(`   -> Impossible de choisir un type valide pour l'index ${pinIndex}, pin spécial non créé.`);
             return; // Ne pas créer ce pin spécial si on ne trouve pas de type valide
        }

        const newPin: SpecialPin = {
            id: `s-${randomType}-${iterationIndex}-${Date.now()}`,
            x: position.x, // Utiliser la position du pin normal
            y: position.y, // Utiliser la position du pin normal
            type: randomType,
            hitByBallIds: new Set<string>(), 
            usedThisTurn: false 
        };
        newSpecialPins.push(newPin);

        // Mettre à jour les compteurs si type limité
        if (randomType === 'addBall') addedCounts.addBall++;
        if (randomType === 'jackpot') addedCounts.jackpot++;
        
        console.log(`   -> Pin Spécial ${newPin.id} (${newPin.type}) créé à la position du pin normal index ${pinIndex} (X:${position.x.toFixed(1)}, Y:${position.y.toFixed(1)})`);
    });
    
    console.log(` -> Génération de ${newSpecialPins.length} pins spéciaux terminée (${(newSpecialPins.length / numNormalPins * 100).toFixed(1)}% des pins normaux).`);
    return newSpecialPins;
  }
  // ----------------------------------------------------------------------------------------------------

  // --- MODIFICATION: Adapter calculateFinalSips pour TOUS les nouveaux effets --- 
  const calculateFinalSips = useCallback((baseSips: number, ballData: BallAnimationData): number => {
      // 1. Vérifier si effets annulés
      if (ballData.effects.effectsReset) {
          console.log(` -> Effects Reset! Final sips based on slot only: ${baseSips}`);
          return Math.round(baseSips); // Retourne juste la valeur de la case
      }
      
      // 2. Vérifier si Jackpot
      if (ballData.effects.jackpotHit) {
          console.log(` -> JACKPOT HIT! Final sips: ${JACKPOT_VALUE}`);
          return JACKPOT_VALUE; // Retourne la valeur fixe du jackpot
      }
      
      // 3. Calcul standard (si pas annulé et pas jackpot)
      let finalSips = baseSips;
      console.log(` -> Starting calculation with base sips: ${baseSips}`);
      
      // Appliquer le multiplicateur
      if (ballData.effects.multiplierCount > 0) {
          if (isCumulativeMode) {
              // Mode cumulatif: Appliquer 2^N
              finalSips *= Math.pow(2, ballData.effects.multiplierCount);
              console.log(` -> Cumulative Multiplier applied: x${Math.pow(2, ballData.effects.multiplierCount)} (Count: ${ballData.effects.multiplierCount})`);
          } else {
              // Mode normal: Appliquer x2 une seule fois
              finalSips *= 2;
              console.log(` -> Normal Multiplier applied: x2 (Count: ${ballData.effects.multiplierCount})`);
          }
      }
      
      // Ajouter/Retirer les gorgées (déjà cumulatif par nature)
      finalSips += ballData.effects.sipsToAdd;
      if (ballData.effects.sipsToAdd > 0) console.log(` -> Sips Added: +${ballData.effects.sipsToAdd}`);
      
      finalSips = Math.max(0, finalSips - ballData.effects.sipsToSubtract);
      if (ballData.effects.sipsToSubtract > 0) console.log(` -> Sips Subtracted: -${ballData.effects.sipsToSubtract} (Result clamped at 0)`);

      return Math.round(finalSips); // Arrondir au cas où les multiplicateurs créent des décimales
  }, [isCumulativeMode]); // <-- Dépendance OK
  // ----------------------------------------------------------------------------------------

  const dropBalls = () => {
    if (isAnimating) return;
    
    console.log("Génération des pins spéciaux pour le nouveau tour...");
    const newPinsForTurn = generateSpecialPins(pinPositions);
    setSpecialPins(newPinsForTurn);
    const currentSpecialPins = newPinsForTurn;

    setExtraBalls([]); 
    setFinalSlotIndices({ red: null, green: null, extra: null }); 
    setIsAnimating(true);
    setTurnResult(null); 
    // setTurnEffectLogs(null); // SUPPRIMÉ: Assurer la réinitialisation avant le lancer
    const startX = Math.random() * (DROP_START_X_MAX - DROP_START_X_MIN) + DROP_START_X_MIN;
    setBallPositions({ 
      red: { x: startX, y: 0, color: 'red' }, 
      green: { x: startX, y: 0, color: 'green' } 
    });

    const animState: AnimationState = {
      red: {
          id: 'red', 
          x: startX, y: 0, 
          velocityY: INITIAL_VELOCITY_Y, velocityX: 0, 
          active: true, color: 'red',
          effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
          // effectLog: [] // SUPPRIMÉ
      },
      green: {
          id: 'green', 
          x: startX, y: 0, 
          velocityY: INITIAL_VELOCITY_Y, velocityX: 0, 
          active: true, color: 'green',
          effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
          // effectLog: [] // SUPPRIMÉ
      },
      extra: [] 
    };

    let lastTime = performance.now();
    const lastCollisionPin = new Map<string, string | null>();
    // --- MODIFICATION: Stocker les données complètes des balles extra finies ---
    const finishedExtraBallsDataThisTurn: BallAnimationData[] = []; 
    // const finishedExtraBallResultsThisTurn: { color: 'red' | 'green'; sips: number }[] = []; // Supprimé/Remplacé

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      const containerElement = canvasRef.current;
      if (!containerElement) {
          console.error("Canvas ref non trouvé, arrêt animation.");
          return;
      }
      const containerWidth = containerElement.offsetWidth;
      const containerHeight = containerElement.offsetHeight;
      if (containerWidth <= 0 || containerHeight <= 0) {
          requestAnimationFrame(animate);
          return;
      }

      let nextFrameNeeded = false;
      const currentAnimState = animState;
      const newlyAddedBalls: BallAnimationData[] = [];

      const processBallFrame = (ballData: BallAnimationData) => {
        if (!ballData || !ballData.active) return; 
        nextFrameNeeded = true; 

        const ballId = ballData.id;
        lastCollisionPin.set(ballId, lastCollisionPin.get(ballId) || null);

        ballData.velocityY += GRAVITY * (deltaTime / 100);
        ballData.y += ballData.velocityY * (deltaTime / 24) * 0.5;
        ballData.x += ballData.velocityX * (deltaTime / 24) * 0.5;
        ballData.velocityX *= 0.99;

        const ballRadius = PHYSICS_BALL_RADIUS_PERCENT;  
        const pinRadius = PHYSICS_PIN_RADIUS_PERCENT;   
        const collisionDistance = ballRadius + pinRadius;
        const collisionDistanceSquared = collisionDistance * collisionDistance;

        let collisionOccurred = false;

        for (const pin of pinPositions) {
            // Ignorer le pin normal si un pin spécial est à la même position
            if (currentSpecialPins.some(sp => sp.x === pin.x && sp.y === pin.y)) continue;
            const pinId = `n-${pin.x.toFixed(1)}-${pin.y.toFixed(1)}`;
            if (lastCollisionPin.get(ballId) === pinId) continue;

            const dx = ballData.x - pin.x;
            const dy = ballData.y - pin.y;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < collisionDistanceSquared) {
                console.log(`*** COLLISION NORMALE *** Balle ${ballId} Pin ${pinId} | distSq=${distanceSquared.toFixed(2)} <= threshSq=${collisionDistanceSquared.toFixed(2)}`);
                collisionOccurred = true; lastCollisionPin.set(ballId, pinId);
                
                const distance = Math.sqrt(distanceSquared);
                const angle = Math.atan2(dy, dx); 
                const oldVX = ballData.velocityX; const oldVY = ballData.velocityY;

                ballData.velocityY = -oldVY * BOUNCINESS;
                ballData.velocityX = (Math.random() - 0.5) * 3.5; 

                const overlap = collisionDistance - distance;
                const pushX = Math.cos(angle) * overlap * PHYSICS_OVERLAP_PUSH_MULTIPLIER;
                const pushY = Math.sin(angle) * overlap * PHYSICS_OVERLAP_PUSH_MULTIPLIER;
                ballData.x += pushX;
                ballData.y += pushY;
                 
                console.log(`   -> Rebond Normal: Velo In=(${oldVX.toFixed(2)}, ${oldVY.toFixed(2)}), Out=(${ballData.velocityX.toFixed(2)}, ${ballData.velocityY.toFixed(2)}), Push=(${pushX.toFixed(2)}, ${pushY.toFixed(2)})`);
                 break; 
            }
        }

        if (!collisionOccurred) {
            // --- REFACTORISATION MAJEURE : Gestion Collision Pins Spéciaux ---
            let specialCollisionPinIndex = -1; // Index du pin spécial touché
            let specialCollisionPin: SpecialPin | null = null; // Le pin spécial touché

            for (let i = 0; i < currentSpecialPins.length; i++) {
                const sPin = currentSpecialPins[i];
                const dxS = ballData.x - sPin.x;
                const dyS = ballData.y - sPin.y;
                const distanceSquaredS = dxS * dxS + dyS * dyS;

                if (distanceSquaredS < collisionDistanceSquared) {
                    console.log(`*** COLLISION SPÉCIALE *** Balle ${ballId} Pin ${sPin.id} (${sPin.type}) | distSq=${distanceSquaredS.toFixed(2)} <= threshSq=${collisionDistanceSquared.toFixed(2)}`);
                    
                    // --- Calcul physique du rebond (inchangé) ---
                    const distanceS = Math.sqrt(distanceSquaredS);
                    const angleS = Math.atan2(dyS, dxS);
                    const oldVXS = ballData.velocityX; const oldVYS = ballData.velocityY;
                    ballData.velocityY = -oldVYS * BOUNCINESS;
                    ballData.velocityX = (Math.random() - 0.5) * 3.5;
                    const overlapS = collisionDistance - distanceS;
                    const pushXS = Math.cos(angleS) * overlapS * PHYSICS_OVERLAP_PUSH_MULTIPLIER;
                    const pushYS = Math.sin(angleS) * overlapS * PHYSICS_OVERLAP_PUSH_MULTIPLIER;
                    ballData.x += pushXS;
                    ballData.y += pushYS;
                    console.log(`   -> Rebond Spécial: Velo In=(${oldVXS.toFixed(2)}, ${oldVYS.toFixed(2)}), Out=(${ballData.velocityX.toFixed(2)}, ${ballData.velocityY.toFixed(2)}), Push=(${pushXS.toFixed(2)}, ${pushYS.toFixed(2)})`);
                    // --- Fin Calcul physique ---

                    specialCollisionPinIndex = i;
                    specialCollisionPin = sPin;
                    collisionOccurred = true; // Marquer qu'une collision (spéciale) a eu lieu
                    lastCollisionPin.set(ballId, sPin.id); // Mettre à jour le dernier pin touché (spécial)
                    break; // Sortir de la boucle des pins spéciaux une fois qu'un est touché
                }
            }

            // Si une collision spéciale a eu lieu, gérer l'effet APRES la boucle
            if (specialCollisionPin && specialCollisionPinIndex !== -1) {
                const sPin = specialCollisionPin; // Alias pour clarté
                let shouldTriggerEffect = false;
                if (isCumulativeMode) {
                    shouldTriggerEffect = true;
                } else {
                    // En mode non-cumulatif, on vérifie si le pin a déjà été utilisé ce tour
                    shouldTriggerEffect = !sPin.usedThisTurn;
                }

                console.log(`[Effet Check] Balle ${ballId} vs Pin ${sPin.id} (${sPin.type}): isCumulative=${isCumulativeMode}, usedThisTurn=${sPin.usedThisTurn} => shouldTriggerEffect=${shouldTriggerEffect}`);

                if (shouldTriggerEffect) {
                    // ballData.effectLog.push(...); // SUPPRIMÉ
                    console.log(`   -> [Effet Triggered!] Balle ${ballId} (${ballData.color}) déclenche Pin ${sPin.id}.`);
                    
                    let needsGlobalStateUpdate = false;
                    let newSlotValuesForShake: number[] | null = null;
                    let roundDrinksIncrement = 0;

                    switch (sPin.type) {
                        case 'addBall':
                            // Vérifier si cette balle a déjà activé un addBall
                            const hasAlreadyAddedBall = (ballData.effects.hitCountPerPin.get('addBall') ?? 0) > 0;
                            if (!hasAlreadyAddedBall) {
                                const randomStartX = Math.random() * (ADD_BALL_START_X_MAX - ADD_BALL_START_X_MIN) + ADD_BALL_START_X_MIN;
                                const randomVelX = (Math.random() - 0.5) * ADD_BALL_VELOCITY_X_MAGNITUDE;
                                const newExtraBallData: BallAnimationData = {
                                    id: `extra-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                                    x: randomStartX, y: 0, 
                                    velocityY: INITIAL_VELOCITY_Y,
                                    velocityX: randomVelX,
                                    active: true, color: ballData.color,
                                    effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
                                };
                                newlyAddedBalls.push(newExtraBallData);
                                // Marquer que cette balle a activé un addBall
                                ballData.effects.hitCountPerPin.set('addBall', 1);
                                console.log(`   -> ADD_BALL applied to ball ${ballId} (first time)`);
                            } else {
                                console.log(`   -> ADD_BALL skipped for ball ${ballId} (already added a ball)`);
                            }
                            break;
                        case 'multiplier': 
                            ballData.effects.multiplierCount++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> MULTIPLIER Count: ${ballData.effects.multiplierCount}`);
                            break;
                        case 'addSip': 
                            ballData.effects.sipsToAdd++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> ADD_SIP Total: ${ballData.effects.sipsToAdd}`);
                            break;
                        case 'subtractSip': 
                            ballData.effects.sipsToSubtract++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> SUBTRACT_SIP Total: ${ballData.effects.sipsToSubtract}`);
                            break;
                        case 'cancellation':
                            ballData.effects.effectsReset = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> CANCELLATION applied to ball ${ballId}`);
                            break;
                        case 'colorSwap':
                            // Inverser la couleur
                            ballData.color = ballData.color === 'red' ? 'green' : 'red';
                            // Inverser la fonction donner/recevoir en échangeant les effets addSip et subtractSip
                            const tempAdd = ballData.effects.sipsToAdd;
                            ballData.effects.sipsToAdd = ballData.effects.sipsToSubtract;
                            ballData.effects.sipsToSubtract = tempAdd;
                            console.log(`   -> COLOR SWAP applied to ball ${ballId}. New color: ${ballData.color}, Effects swapped: Add=${ballData.effects.sipsToAdd}, Subtract=${ballData.effects.sipsToSubtract}`);
                            break;
                        case 'mystery':
                            const possibleEffects: SpecialPinType[] = ['multiplier', 'addBall', 'addSip', 'subtractSip', 'cancellation', 'colorSwap', 'shake', 'roundDrinks', 'jackpot'];
                            const filteredPossibleEffects = possibleEffects.filter(type => type !== 'mystery'); 
                            const randomEffectIndex = Math.floor(Math.random() * filteredPossibleEffects.length);
                            const triggeredEffect = filteredPossibleEffects[randomEffectIndex];
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> MYSTERY triggered! Applying effect: ${triggeredEffect}`);
                            switch (triggeredEffect) {
                                case 'addBall': { 
                                    const randomStartX = Math.random() * (ADD_BALL_START_X_MAX - ADD_BALL_START_X_MIN) + ADD_BALL_START_X_MIN;
                                    const randomVelX = (Math.random() - 0.5) * ADD_BALL_VELOCITY_X_MAGNITUDE;
                                    const newExtraBallData: BallAnimationData = {
                                        id: `extra-mystery-${Date.now()}-${Math.random().toString(16).slice(2)}`, 
                                        x: randomStartX, 
                                        y: 0, 
                                        velocityY: INITIAL_VELOCITY_Y, 
                                        velocityX: randomVelX, 
                                        active: true, 
                                        color: ballData.color, 
                                        effects: { 
                                          multiplierCount: 0, 
                                          sipsToAdd: 0, 
                                          sipsToSubtract: 0, 
                                          hitCountPerPin: new Map<string, number>(), 
                                          effectsReset: false, 
                                          jackpotHit: false 
                                        },
                                        // effectLog: [] // SUPPRIMÉ
                                    };
                                    newlyAddedBalls.push(newExtraBallData); 
                                    // ballData.effectLog.push(...); // SUPPRIMÉ
                                    break;
                                } 
                                // Ajouter d'autres cas pour mystery si nécessaire
                            }
                            break; 
                        case 'shake':
                            const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
                            newSlotValuesForShake = Array.from({ length: TARGET_NUM_SLOTS }, () => Math.floor(Math.random() * (max - min + 1)) + min );
                            needsGlobalStateUpdate = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> SHAKE applied! New slot values will be: ${newSlotValuesForShake}`);
                            break;
                        case 'roundDrinks':
                            roundDrinksIncrement++;
                            needsGlobalStateUpdate = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> ROUND DRINKS applied! Incrementing count.`);
                            break;
                        case 'jackpot':
                            ballData.effects.jackpotHit = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            console.log(`   -> JACKPOT applied to ball ${ballId}`);
                            break;
                    } 

                    console.log(`   -> [Effet Applied] Effet ${sPin.type} traité pour balle ${ballId}.`);

                    // Mise à jour de l'état global (si nécessaire) ET de l'état du pin touché
                    // Se fait en une seule fois pour éviter les problèmes de mutation
                    setSpecialPins(prevPins => 
                        prevPins.map((p, index) => { 
                            if (index === specialCollisionPinIndex) {
                                const updatedHitByBallIds = new Set(p.hitByBallIds);
                                updatedHitByBallIds.add(ballId);
                                // Marquer comme utilisé seulement en mode non-cumulatif
                                const updatedUsedThisTurn = !isCumulativeMode ? true : p.usedThisTurn; 
                                return { 
                                    ...p, 
                                    hitByBallIds: updatedHitByBallIds, 
                                    usedThisTurn: updatedUsedThisTurn 
                                };
                            }
                            return p;
                        })
                    );

                    // Appliquer les mises à jour d'état global SI nécessaire
                    if (needsGlobalStateUpdate) {
                        if (newSlotValuesForShake) {
                            setSlotSipValues(newSlotValuesForShake);
                        }
                        if (roundDrinksIncrement > 0) {
                            setRoundDrinksCount(prev => prev + roundDrinksIncrement);
                        }
                    }

                    if (!ballData.powerupEvents) ballData.powerupEvents = [];
                    ballData.powerupEvents.push({
                        type: sPin.type,
                        timestamp: Date.now(),
                        description: SPECIAL_PIN_EFFECTS[sPin.type],
                        color: ballData.color
                    });

                } else { // shouldTriggerEffect est faux
                    if (!isCumulativeMode) {
                        console.log(`   -> [Effet Blocked] Pin ${sPin.id} (${sPin.type}) déjà utilisé ce tour (Mode Normal).`);
                    } 
                    // En mode cumulatif, cette condition ne devrait pas être atteinte, mais on log au cas où
                    else {
                        console.log(`   -> [Effet Blocked - Inattendu] Pin ${sPin.id} (${sPin.type}) bloqué en mode cumulatif.`);
                    }
                }
            } // Fin du if (specialCollisionPin)
            // --- FIN REFACTORISATION ---
        } // Fin du if (!collisionOccurred pour les pins normaux)

        if (!collisionOccurred) lastCollisionPin.set(ballId, null);

        if (ballData.x < ballRadius) {
            ballData.x = ballRadius; 
            ballData.velocityX *= -BOUNCINESS * 0.5; 
        }
        if (ballData.x > 100 - ballRadius) { 
            ballData.x = 100 - ballRadius; 
            ballData.velocityX *= -BOUNCINESS * 0.5; 
        }

        if (ballData.y >= 100 - ballRadius) {
            const slotWidthPercent = 100 / TARGET_NUM_SLOTS;
            const slotIndex = Math.min(TARGET_NUM_SLOTS - 1, Math.max(0, Math.floor(ballData.x / slotWidthPercent)));
            const baseSips = slotSipValues[slotIndex] ?? 0;
            const finalSips = calculateFinalSips(baseSips, ballData);

            ballData.finalSipResult = finalSips; // Stocker le résultat
            ballData.active = false; // Marquer comme inactive

            if (ballData.id === 'red' || ballData.id === 'green') {
                setFinalSlotIndices(prev => ({ ...prev, [ballData.id as 'red' | 'green']: slotIndex }));
                console.log(`Balle principale ${ballData.id} terminée : ${finalSips} gorgées`);
            } else {
                console.log(`Balle extra ${ballData.id} (${ballData.color}) terminée : ${finalSips} gorgées`);
                // <<< MODIFICATION: Stocker toutes les données de la balle extra finie >>>
                finishedExtraBallsDataThisTurn.push({ ...ballData }); // Copier les données
                setFinalSlotIndices(prev => ({ ...prev, extra: slotIndex })); 
            }
        }
      };

      if (currentAnimState.red) processBallFrame(currentAnimState.red);
      if (currentAnimState.green) processBallFrame(currentAnimState.green);
      // Ajouter les nouvelles balles extra générées pendant ce frame
      if (newlyAddedBalls.length > 0) {
          console.log(`Ajout de ${newlyAddedBalls.length} balle(s) extra à l'animation.`);
          currentAnimState.extra.push(...newlyAddedBalls);
      }
      currentAnimState.extra.forEach(extraBall => processBallFrame(extraBall));

      // --- Mise à jour de l'état React pour la position visuelle (inchangé) ---
      if (currentAnimState.red) {
        setBallPositions(prev => ({ 
          ...prev, 
          red: { 
            x: currentAnimState.red!.x, 
            y: currentAnimState.red!.y, 
            color: currentAnimState.red!.color // Mettre à jour la couleur
          } 
        }));
      }
      if (currentAnimState.green) {
        setBallPositions(prev => ({ 
          ...prev, 
          green: { 
            x: currentAnimState.green!.x, 
            y: currentAnimState.green!.y, 
            color: currentAnimState.green!.color // Mettre à jour la couleur
          } 
        }));
      }
      setExtraBalls(currentAnimState.extra.filter(b => b.active)); // Mettre à jour les balles extra visibles

      // --- Vérification de fin d'animation (inchangé) ---
      nextFrameNeeded = (currentAnimState.red?.active ?? false) ||
                        (currentAnimState.green?.active ?? false) ||
                        currentAnimState.extra.some(b => b.active);

      if (nextFrameNeeded) {
        animationRefs.current.red = requestAnimationFrame(animate);
      } else {
        console.log("Animation physique terminée. Appel direct de handleTurnEnd.");
        setIsAnimating(false); 
        animationRefs.current.red = null; 
        // --- MODIFICATION: Passer les données complètes (avec logs) à handleTurnEnd ---
        handleTurnEnd(
            currentAnimState.red, 
            currentAnimState.green, 
            finishedExtraBallsDataThisTurn // Passer le tableau des balles extra finies
        );
      }
    };

    animationRefs.current.red = requestAnimationFrame(animate);
  };

  // --- MODIFICATION: Mise à jour de handleTurnEnd pour traiter les logs ---
  const handleTurnEnd = (
      finalRedData: BallAnimationData | null,
      finalGreenData: BallAnimationData | null,
      finishedExtraBalls: BallAnimationData[] 
    ) => {
    // Calculer les gorgées de base en fonction de la couleur FINALE de chaque balle principale
    let totalRedSips = finalRedData?.color === 'red' ? (finalRedData?.finalSipResult ?? 0) : 0;
    let totalGreenSips = finalGreenData?.color === 'green' ? (finalGreenData?.finalSipResult ?? 0) : 0;
    
    // Si la couleur a été inversée, ajouter dans l'autre catégorie
    if (finalRedData?.color === 'green') {
      totalGreenSips += finalRedData?.finalSipResult ?? 0;
    }
    if (finalGreenData?.color === 'red') {
      totalRedSips += finalGreenData?.finalSipResult ?? 0;
    }
    
    console.log("Données initiales des balles principales:", { 
      red: finalRedData ? { color: finalRedData.color, sips: finalRedData.finalSipResult } : null,
      green: finalGreenData ? { color: finalGreenData.color, sips: finalGreenData.finalSipResult } : null
    });

    // Traiter chaque balle supplémentaire en fonction de sa couleur FINALE
    finishedExtraBalls.forEach(ballData => {
        const sips = ballData.finalSipResult ?? 0;
        // Ajouter les gorgées à la catégorie correspondant à la couleur finale de la balle
        if (ballData.color === 'red') {
            totalRedSips += sips;
            console.log(`Balle extra ${ballData.id} (ROUGE) ajoute ${sips} gorgées aux gorgées à BOIRE`);
        } else {
            totalGreenSips += sips;
            console.log(`Balle extra ${ballData.id} (VERTE) ajoute ${sips} gorgées aux gorgées à DONNER`);
        }
    });

    console.log("Totaux calculés:", { totalRedSips, totalGreenSips });

    const extraSipsForDisplay = finishedExtraBalls.reduce((sum, ballData) => sum + (ballData.finalSipResult ?? 0), 0);
    setTurnResult({ redSips: totalRedSips, greenSips: totalGreenSips, extraSips: extraSipsForDisplay > 0 ? extraSipsForDisplay : null });

    // Mettre à jour l'historique du tour actuel // SUPPRIMÉ
    // const currentTurnLogs = { ... };
    // setTurnEffectLogs(currentTurnLogs);

    // Ajouter à l'historique global // SUPPRIMÉ
    // const currentPlayer = players[currentPlayerIndex];
    // if (...) { setGameHistory(...) }

    const currentPlayer = players[currentPlayerIndex]; // Gardé pour les résultats
    const currentResults = playerResults[currentPlayer.id] || [];
    
    // Collecter tous les powerups de ce tour (nouvelle méthode fiable)
    const turnPowerups: PowerupEvent[] = [];
    if (finalRedData?.powerupEvents) turnPowerups.push(...finalRedData.powerupEvents);
    if (finalGreenData?.powerupEvents) turnPowerups.push(...finalGreenData.powerupEvents);
    finishedExtraBalls.forEach(ball => {
        if (ball.powerupEvents) turnPowerups.push(...ball.powerupEvents);
    });

    setPlayerResults(prev => ({
        ...prev,
        [currentPlayer.id]: [...currentResults, { 
            redSips: totalRedSips, 
            greenSips: totalGreenSips,
            powerups: turnPowerups
        }]
    }));

    if (currentPlayerIndex === players.length - 1) {
      console.log("Dernier joueur a terminé, fin de partie.")
      setGameOver(true);
    } else {
      console.log(`Passage immédiat au joueur suivant: ${currentPlayerIndex + 1}`);
      setCurrentPlayerIndex(prev => prev + 1);
    }
  };
  // --- Fin de handleTurnEnd ---

  return (
    // Conteneur principal avec padding pour la barre fixe en bas
    <div className="space-y-6 max-w-4xl mx-auto pb-24"> 
      
      {/* Section Plateau de jeu + Légende (visible si !gameOver) */}
      {!gameOver && (
        <>
          {/* Plateau de jeu */}
          <Card className="p-4 bg-slate-800 border-slate-700">
            <div 
              ref={canvasRef} 
              className="relative w-full h-[550px] bg-slate-900 rounded-lg overflow-hidden"
            >
              {pinPositions.map((pin, index) => (
                <div 
                  key={`pin-${index}`}
                  className={`absolute ${VISUAL_NORMAL_PIN_SIZE_CLASS} rounded-full bg-slate-400`}
                  style={{
                    top: `${pin.y}%`,
                    left: `${pin.x}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              ))}
              
              {specialPins.map((pin) => {
                const colors = SPECIAL_PIN_COLORS[pin.type];
                return (
                    <div 
                        key={pin.id}
                        className={`absolute ${VISUAL_SPECIAL_PIN_SIZE_CLASS} rounded-full border-2 ${colors.border} ${colors.bg}`}
                        style={{
                          top: `${pin.y}%`,
                          left: `${pin.x}%`,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 25 
                        }}
                        title={`Pin ${pin.type}`}
                    />
                );
              })}
            
              <div className="absolute bottom-0 w-full flex">
                {slotSipValues.map((sips, index) => (
                  <div 
                    key={index} 
                    className={`h-16 flex items-center justify-center border-t-2 border-x border-slate-600
                              ${finalSlotIndices.red === index || finalSlotIndices.green === index || finalSlotIndices.extra === index ? 'bg-purple-600' : 'bg-slate-700'}
                              ${finalSlotIndices.red === index && finalSlotIndices.green === index ? '!bg-fuchsia-600' : ''}
                              transition-colors duration-200`}
                    style={{
                        width: `${100 / TARGET_NUM_SLOTS}%`
                    }}
                  >
                    <span className="text-slate-200 font-bold">{sips}</span>
                  </div>
                ))}
              </div>
            
              {ballPositions.red && ballPositions.red.y >= 0 && (
                  <div 
                      className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full ${ballPositions.red.color === 'red' ? 'bg-red-500' : 'bg-green-500'} shadow-lg z-20 transition-transform opacity-100`}
                      style={{ 
                          left: `${ballPositions.red.x}%`, 
                          top: `${ballPositions.red.y}%`, 
                          transform: 'translate(-50%, -50%)',
                          boxShadow: `0 0 10px ${ballPositions.red.color === 'red' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}` 
                      }} 
                  />
              )}
              {ballPositions.green && ballPositions.green.y >= 0 && (
                  <div 
                      className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full ${ballPositions.green.color === 'red' ? 'bg-red-500' : 'bg-green-500'} shadow-lg z-20 transition-transform opacity-100`}
                      style={{ 
                          left: `${ballPositions.green.x}%`, 
                          top: `${ballPositions.green.y}%`, 
                          transform: 'translate(-50%, -50%)',
                          boxShadow: `0 0 10px ${ballPositions.green.color === 'red' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}`
                      }} 
                  />
              )}
               {extraBalls.map((ball) => (
                    <div 
                        key={ball.id} 
                        className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full ${ball.color === 'red' ? 'bg-red-500' : 'bg-green-500'} shadow-lg z-20 transition-transform opacity-100`}
                        style={{
                          left: `${ball.x}%`,
                          top: `${ball.y}%`,
                          transform: 'translate(-50%, -50%)',
                          boxShadow: `0 0 10px ${ball.color === 'red' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}` 
                        }}
                    />
               ))}
            </div>
          </Card>

          {/* Légende */}
          <Card className="mt-4 p-3 bg-slate-800 border-slate-700">
              <CardHeader className="p-1 mb-2">
                  <CardTitle className="text-base text-center text-slate-300">Légende</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                  {Object.entries(SPECIAL_PIN_EFFECTS).map(([type, description]) => {
                      const colors = SPECIAL_PIN_COLORS[type as SpecialPinType];
                      if (!colors) return null; 
                      return (
                          <div key={type} className="flex items-center space-x-2">
                              <div 
                                  className={`w-4 h-4 rounded-full border-2 ${colors.border} ${colors.bg}`}
                                  title={`Pin ${type}`}
                              />
                              <span className="text-sm text-slate-400">
                                  {description}
                              </span>
                          </div>
                      );
                  })}
              </CardContent>
          </Card>
        </> // Fin du fragment pour !gameOver (Plateau + Légende) 
      )}

      {/* SUPPRIMÉ: Section Historique (visible si logs existent...) */}
      {/* {turnEffectLogs && turnResult && !isAnimating && !gameOver && (...)} */}

      {/* Section Barre d'action (visible si !gameOver) */}
      {!gameOver && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-slate-700 z-50 flex justify-between items-center">
          <span className="text-lg font-semibold text-slate-200">Au tour de {players[currentPlayerIndex]?.name}</span>
          {/* Affichage résultat simplifié ici */}
          {turnResult && (
            <div className="text-center text-sm px-2 py-1 rounded bg-slate-700/50 border border-slate-600">
                <span className="text-red-400">Bois {turnResult.redSips ?? 0}</span> / <span className="text-green-400">Donne {turnResult.greenSips ?? 0}</span>
                {roundDrinksCount > 0 && (
                    <span className="ml-2 text-yellow-400 text-xs">(+{roundDrinksCount} Tournée!)</span>
                )}
            </div>
          )}
          {/* Bouton Lancer */}
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={dropBalls}
            disabled={isAnimating || !!turnResult}
          >
            {isAnimating ? "Balles en mouvement..." : (turnResult ? "Tour Suivant" : "Lancer les balles")} 
          </Button>
        </div>
      )}

      {/* Section Résultats Finaux (visible si gameOver) */}
      {gameOver && (
        <div className="space-y-6">
          <Card className="mt-4 p-4 bg-slate-800 border-slate-700">
            <CardHeader className="p-2">
              <CardTitle className="text-center text-2xl text-slate-200">
                {resultDisplayPhase === 'tournees' && "Tournées Générales"}
                {resultDisplayPhase === 'details' && "Détails des Tours"}
                {resultDisplayPhase === 'final' && "Résultats Finaux"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-3">
              {resultDisplayPhase === 'tournees' && roundDrinksCount > 0 && (
                <div className="text-center space-y-4">
                  <div className="text-yellow-400 text-4xl font-bold">
                    {roundDrinksCount} {roundDrinksCount === 1 ? 'Tournée Générale' : 'Tournées Générales'}
                  </div>
                  <p className="text-slate-300">
                    Chaque joueur doit boire {roundDrinksCount} gorgée{roundDrinksCount > 1 ? 's' : ''} !
                  </p>
                </div>
              )}

              {resultDisplayPhase === 'details' && (
                <div className="space-y-4">
                  {(() => {
                    const player = players[currentPlayerResultIndex];
                    const results = playerResults[player.id] || [];
                    const content = (
                      <div className="border border-slate-600 p-4 rounded-md bg-slate-700/50">
                        <h3 className="text-xl font-bold mb-4 text-center text-slate-100">{player.name}</h3>
                        {results.map((result, index) => (
                          <div key={index} className="mb-4 p-3 bg-slate-800/50 rounded border border-slate-600">
                            <div className="text-sm text-slate-400 mb-2">Tour {index + 1}</div>
                            <div className="flex justify-around items-stretch text-center gap-3 mb-3">
                              <div className="flex-1 bg-slate-800/50 p-2 rounded border border-red-500/50">
                                <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Boit</div>
                                <div className="text-xl font-bold text-red-400">{result.redSips}</div>
                              </div>
                              <div className="flex-1 bg-slate-800/50 p-2 rounded border border-green-500/50">
                                <div className="text-xs text-green-400 uppercase tracking-wider mb-1">Donne</div>
                                <div className="text-xl font-bold text-green-400">{result.greenSips}</div>
                              </div>
                            </div>
                            {result.powerups.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-600">
                                <div className="flex flex-col md:flex-row gap-4">
                                  {/* Powerups Boit (rouge) */}
                                  <div className="flex-1">
                                    <div className="text-xs text-red-400 mb-1">Powerups Boit</div>
                                    <div className="flex flex-wrap gap-2">
                                      {result.powerups.filter(p => p.color === 'red').length === 0 && (
                                        <span className="text-xs text-slate-500">Aucun</span>
                                      )}
                                      {result.powerups.filter(p => p.color === 'red').map((powerup, pIndex) => {
                                        const colors = SPECIAL_PIN_COLORS[powerup.type];
                                        return (
                                          <div
                                            key={pIndex}
                                            className={`px-2 py-1 rounded-full text-xs ${colors.border} ${colors.bg} border`}
                                            title={SPECIAL_PIN_EFFECTS[powerup.type]}
                                          >
                                            {SPECIAL_PIN_LABELS[powerup.type]}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {/* Powerups Donne (verte) */}
                                  <div className="flex-1">
                                    <div className="text-xs text-green-400 mb-1">Powerups Donne</div>
                                    <div className="flex flex-wrap gap-2">
                                      {result.powerups.filter(p => p.color === 'green').length === 0 && (
                                        <span className="text-xs text-slate-500">Aucun</span>
                                      )}
                                      {result.powerups.filter(p => p.color === 'green').map((powerup, pIndex) => {
                                        const colors = SPECIAL_PIN_COLORS[powerup.type];
                                        return (
                                          <div
                                            key={pIndex}
                                            className={`px-2 py-1 rounded-full text-xs ${colors.border} ${colors.bg} border`}
                                            title={SPECIAL_PIN_EFFECTS[powerup.type]}
                                          >
                                            {SPECIAL_PIN_LABELS[powerup.type]}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                    return content;
                  })()}
                </div>
              )}

              {resultDisplayPhase === 'final' && (
                <>
                  {players.map(player => {
                    const results = playerResults[player.id] || [];
                    const totalRedSips = results.reduce((sum, result) => sum + result.redSips, 0);
                    const totalGreenSips = results.reduce((sum, result) => sum + result.greenSips, 0);
                    // Séparer les powerups par type
                    const redPowerups = results.flatMap(result => result.powerups.filter(p => p.color === 'red'));
                    const greenPowerups = results.flatMap(result => result.powerups.filter(p => p.color === 'green'));
                    return (
                      <div key={player.id} className="border border-slate-600 p-3 rounded-md bg-slate-700/50">
                        <h3 className="text-lg font-bold mb-3 text-center text-slate-100">{player.name}</h3>
                        <div className="flex justify-around items-stretch text-center text-sm text-slate-300 pt-1 gap-3">
                          <div className="flex-1 bg-slate-800/50 p-2 rounded border border-red-500/50">
                            <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Boit</div>
                            <div className="text-2xl font-bold text-red-400">{totalRedSips}</div>
                            {redPowerups.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2 justify-center">
                                {redPowerups.map((powerup, idx) => {
                                  const colors = SPECIAL_PIN_COLORS[powerup.type];
                                  return (
                                    <div
                                      key={idx}
                                      className={`px-2 py-1 rounded-full text-xs ${colors.border} ${colors.bg} border`}
                                      title={SPECIAL_PIN_EFFECTS[powerup.type]}
                                    >
                                      {SPECIAL_PIN_LABELS[powerup.type]}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 bg-slate-800/50 p-2 rounded border border-green-500/50">
                            <div className="text-xs text-green-400 uppercase tracking-wider mb-1">Donne</div>
                            <div className="text-2xl font-bold text-green-400">{totalGreenSips}</div>
                            {greenPowerups.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2 justify-center">
                                {greenPowerups.map((powerup, idx) => {
                                  const colors = SPECIAL_PIN_COLORS[powerup.type];
                                  return (
                                    <div
                                      key={idx}
                                      className={`px-2 py-1 rounded-full text-xs ${colors.border} ${colors.bg} border`}
                                      title={SPECIAL_PIN_EFFECTS[powerup.type]}
                                    >
                                      {SPECIAL_PIN_LABELS[powerup.type]}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Boutons de navigation */}
              <div className="flex justify-center space-x-4 pt-4">
                {resultDisplayPhase === 'tournees' && (
                  <Button 
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setResultDisplayPhase('details')}
                  >
                    {roundDrinksCount > 0 ? "Voir les détails" : "Voir les résultats"}
                  </Button>
                )}

                {resultDisplayPhase === 'details' && (
                  <>
                    <Button 
                      variant="outline" 
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                      onClick={() => setCurrentPlayerResultIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentPlayerResultIndex === 0}
                    >
                      Précédent
                    </Button>
                    <span className="text-slate-300">
                      {currentPlayerResultIndex + 1} / {players.length}
                    </span>
                    <Button 
                      variant="outline" 
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                      onClick={() => setCurrentPlayerResultIndex(prev => Math.min(players.length - 1, prev + 1))}
                      disabled={currentPlayerResultIndex === players.length - 1}
                    >
                      Suivant
                    </Button>
                    <Button 
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => setResultDisplayPhase('final')}
                    >
                      Voir les totaux
                    </Button>
                  </>
                )}

                {resultDisplayPhase === 'final' && (
                  <>
                    <Button 
                      className="bg-purple-600 hover:bg-purple-700 text-white" 
                      onClick={handleRestartGame} // Utiliser handleRestartGame au lieu de onRestartGame
                    >
                      Nouvelle partie
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100" 
                      onClick={onGameEnd}
                    >
                      Retour à la sélection
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SUPPRIMÉ: Journal des effets du tour actuel */}
          {/* {turnEffectLogs && (...)} */}

          {/* SUPPRIMÉ: Historique du Dernier Tour (dans l'écran GameOver) */}
          {/* {gameHistory.length > 0 && (...)} */}
        </div>
      )}

    </div> // Fin du conteneur principal
  );
} 