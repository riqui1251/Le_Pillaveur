"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Volume2, VolumeX, ChevronDown, ChevronsDown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Player } from '@/types/game'
import { getPlayerGameBoost } from '@/lib/players'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { GameShell } from '@/components/game/GameShell'
import { cn } from '@/lib/utils'
import { playGameSound, isSoundMuted, setSoundMuted as persistSoundMuted } from '@/lib/sound/game-sounds'

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

// Nombre de rangées d'obstacles (valeur desktop par défaut)
const ROWS = 8;

// --- NOUVEAU: Configuration du nombre de pins par rangée --- 
// const generateRandomPinsConfig = () => {
//   const config = new Map<number, number>();
//   for (let row = 0; row < ROWS; row++) {
//     // Générer un nombre aléatoire entre 3 et 9 pour chaque rangée
//     const pinsInRow = Math.floor(Math.random() * 8) + 6; // 7 possibilités (3 à 9) + 3 pour le minimum
//     config.set(row, pinsInRow);
//   }
//   return config;
// };

const DEFAULT_PINS_PER_ROW_FALLBACK = (row: number) => row + 2; // Fallback si non défini
// -----------------------------------------------------------

// Anciennes constantes (non utilisées) supprimées

// --- NOUVEAU: Paramètres physiques et visuels centralisés ---
// Anciennes constantes de physique en % (non utilisées) supprimées
// Facteurs pour la physique des rebonds
// const PHYSICS_HORIZONTAL_PUSH_FACTOR = 2.0; // Poussée horizontale après rebond
const PHYSICS_OVERLAP_PUSH_MULTIPLIER = 1.1; // Pour mieux séparer après collision
// Taille visuelle des éléments (classes Tailwind)
// Mobile: éléments légèrement plus petits pour garder de l'espace vertical
// Desktop (>= sm): tailles précédentes
const VISUAL_BALL_SIZE_CLASS = 'w-4 h-4 sm:w-5 sm:h-5';
const VISUAL_NORMAL_PIN_SIZE_CLASS = 'w-2.5 h-2.5 sm:w-3.5 sm:h-3.5';
// Pins spéciaux agrandis (16px mobile / 20px desktop) : place pour le glyphe et
// alignement avec la hitbox de collision (déjà ~16/20px, cf. specialSumRadius).
const VISUAL_SPECIAL_PIN_SIZE_CLASS = 'w-4 h-4 sm:w-5 sm:h-5';
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
const SPECIAL_PINS_PERCENTAGE = 0.35;
const JACKPOT_VALUE = 7;
const MAX_ROUND_DRINKS = 2; // Plafond tournées générales par partie

// Table de poids pour le tirage des types de pins (plus haut = plus fréquent)
const PIN_TYPE_WEIGHTS: Partial<Record<SpecialPinType, number>> = {
  addSip:       3,
  subtractSip:  3,
  multiplier:   3,
  colorSwap:    2,
  shake:        2,
  mystery:      2,
  cancellation: 2,
  split:        2,
  addBall:      2,
  gravityFlip:  3,
  magnetLeft:   3,
  magnetRight:  3,
  doubleEffect: 1,
  scoreSwap:    1,
  teleportation:1,
  slowMotion:   1,
  jackpot:      1,
  roundDrinks:  1,
}

// Tableau pondéré précalculé (chaque type apparaît autant de fois que son poids)
const WEIGHTED_PIN_TYPES: SpecialPinType[] = (Object.entries(PIN_TYPE_WEIGHTS) as [SpecialPinType, number][])
  .flatMap(([type, w]) => Array<SpecialPinType>(w).fill(type))
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
    'jackpot' |
    'teleportation' |
    'gravityFlip' |
    'slowMotion' |
    'split' |
    'scoreSwap' |
    'doubleEffect' |
    'magnetLeft' |
    'magnetRight';
// ----------------------------------------------

// Couleurs ET pictogramme de chaque pin spécial.
// Le pictogramme (glyph) est l'identifiant PRIMAIRE : la couleur seule ne suffit
// pas à distinguer 18 types (et est inaccessible aux daltoniens). Le glyphe est
// rendu au centre du pin ; la couleur reste un repère secondaire.
// magnetLeft / magnetRight partagent volontairement la même couleur : c'est la
// flèche (← / →) qui les distingue.
const SPECIAL_PIN_COLORS: Record<SpecialPinType, { border: string; bg: string; glyph: string }> = {
  multiplier:   { border: 'border-red-900',     bg: 'bg-red-400',     glyph: '×2' },
  addBall:      { border: 'border-blue-900',    bg: 'bg-blue-400',    glyph: '🎱' },
  addSip:       { border: 'border-green-900',   bg: 'bg-green-400',   glyph: '+1' },
  subtractSip:  { border: 'border-orange-900',  bg: 'bg-orange-400',  glyph: '−1' },
  cancellation: { border: 'border-gray-900',    bg: 'bg-gray-300',    glyph: '🚫' },
  colorSwap:    { border: 'border-pink-900',    bg: 'bg-pink-400',    glyph: '🎨' },
  mystery:      { border: 'border-indigo-900',  bg: 'bg-indigo-400',  glyph: '❓' },
  shake:        { border: 'border-yellow-900',  bg: 'bg-yellow-300',  glyph: '🔀' },
  roundDrinks:  { border: 'border-teal-900',    bg: 'bg-teal-400',    glyph: '🍻' },
  jackpot:      { border: 'border-amber-900',   bg: 'bg-amber-300',   glyph: '💰' },
  teleportation:{ border: 'border-purple-900',  bg: 'bg-purple-400',  glyph: '🌀' },
  gravityFlip:  { border: 'border-sky-900',     bg: 'bg-sky-400',     glyph: '↕' },
  slowMotion:   { border: 'border-cyan-900',    bg: 'bg-cyan-300',    glyph: '🐌' },
  split:        { border: 'border-lime-900',    bg: 'bg-lime-400',    glyph: '✂️' },
  scoreSwap:    { border: 'border-fuchsia-900', bg: 'bg-fuchsia-400', glyph: '🔄' },
  doubleEffect: { border: 'border-rose-900',    bg: 'bg-rose-400',    glyph: '💥' },
  magnetLeft:   { border: 'border-slate-900',   bg: 'bg-slate-400',   glyph: '←' },
  magnetRight:  { border: 'border-zinc-900',    bg: 'bg-zinc-500',    glyph: '→' },
};
// -------------------------------------------------------

const ALL_PIN_TYPES = Object.keys(PIN_TYPE_WEIGHTS) as SpecialPinType[]

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
    firstPinHit?: boolean;
    // Effets accumulés par CETTE balle
    effects: {
        multiplierCount: number;
        sipsToAdd: number;
        sipsToSubtract: number;
        hitCountPerPin: Map<string, number>; 
        effectsReset: boolean;
        jackpotHit: boolean;
        gravityFlipUntilMs?: number;
        slowMotionUntilMs?: number;
        magnetUntilMs?: number;
        magnetDir?: 'left' | 'right';
        scoreSwap?: boolean;
        doubleEffectArmed?: boolean;
    };
    finalSipResult?: number; // Stocke le résultat quand active devient false
    powerupEvents?: PowerupEvent[]; // Ajouté
    // Guidage pour garantir les collisions avec la 1ère puis 2nde rangée
    guidance?: { firstRowHit: boolean; secondRowTargetX?: number };
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

type ResultDisplayPhase = 'tournees' | 'details' | 'final';

// Hook personnalisé pour la gestion des pins
// const usePinCalculator = (pinsPerRowConfig: Map<number, number>) => {
//   return useCallback((row: number) => {
//     let pinsInRow = pinsPerRowConfig.get(row);
//     if (pinsInRow === undefined) {
//         pinsInRow = DEFAULT_PINS_PER_ROW_FALLBACK(row);
//         console.warn(`Configuration manquante pour la rangée ${row + 1} (index ${row}). Utilisation du fallback: ${pinsInRow} pins.`);
//     }
    
//     const isEvenRow = row % 2 === 0;
//     const intervals = pinsInRow + (isEvenRow ? 0 : 1); 
    
//     return Array.from({ length: pinsInRow }).map((_, index) => {
//       let xPos;
//       if (isEvenRow) {
//         xPos = ((index + 0.5) * 100) / pinsInRow;
//       } else {
//         xPos = ((index + 1) * 100) / intervals;
//       }
//       const yPos = (row + 1) * (100 / (ROWS + 1));
//       return { x: xPos, y: yPos };
//     });
//   }, [pinsPerRowConfig]);
// };

// Génération statique des pins
const generateStaticPinsConfig = (rows: number, minPinsPerRow: number, maxPinsPerRow: number) => {
  const config = new Map<number, number>();
  for (let row = 0; row < rows; row++) {
    let pinsInRow = Math.floor(Math.random() * (maxPinsPerRow - minPinsPerRow + 1)) + minPinsPerRow;
    // Limiter la première rangée à 8 pins maximum
    if (row === 0) pinsInRow = Math.min(pinsInRow, 8);
    config.set(row, pinsInRow);
  }
  return config;
};

// Génération statique des positions des pins normaux
const generateStaticNormalPins = (rows: number, minPinsPerRow: number, maxPinsPerRow: number) => {
  const pins: PinPosition[] = [];
  const config = generateStaticPinsConfig(rows, minPinsPerRow, maxPinsPerRow);
  for (let row = 0; row < rows; row++) {
    const pinsInRow = config.get(row) || DEFAULT_PINS_PER_ROW_FALLBACK(row);
    const rowY = (row + 1) * (100 / (rows + 1));
    const spacing = 100 / (pinsInRow + 1);
    
    for (let i = 0; i < pinsInRow; i++) {
      pins.push({
        x: spacing * (i + 1),
        y: rowY
      });
    }
  }
  
  // Assurer un pin au point de départ
  const startPinY = (0 + 1) * (100 / (rows + 1));
  const startPinX = 50;
  const proximityThreshold = MIN_NORMAL_PIN_DISTANCE_PERCENT / 2;
  let pinExistsNearStart = false;
  
  for(const pin of pins) {
    if (Math.abs(pin.x - startPinX) < proximityThreshold && Math.abs(pin.y - startPinY) < proximityThreshold) {
      pinExistsNearStart = true;
      break;
    }
  }
  
  // Ne pas dépasser 8 sur la première rangée (mobile) et éviter d'ajouter un 9e pin
  const firstRowPinsCount = pins.filter(p => Math.abs(p.y - startPinY) < 0.1).length;
  if (!pinExistsNearStart && firstRowPinsCount < 8) {
    pins.push({ x: startPinX, y: startPinY });
  }
  
  return pins;
};

// Génération statique des pins spéciaux
const generateStaticSpecialPins = (normalPins: PinPosition[], specialPinsPercentage: number): SpecialPin[] => {
  const newSpecialPins: SpecialPin[] = [];
  const numNormalPins = normalPins.length;
  if (numNormalPins === 0) return [];
  
  const totalPinsToPlace = Math.round(numNormalPins * specialPinsPercentage);

  const normalPinIndices = Array.from({ length: numNormalPins }, (_, i) => i);
  for (let i = normalPinIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [normalPinIndices[i], normalPinIndices[j]] = [normalPinIndices[j], normalPinIndices[i]];
  }
  
  const indicesToReplace = normalPinIndices.slice(0, totalPinsToPlace);
  const staticCounts = { addBall: 0, jackpot: 0, roundDrinks: 0 };

  indicesToReplace.forEach((index, i) => {
    const pin = normalPins[index];
    let type: SpecialPinType;
    let attempts = 0;
    do {
      type = WEIGHTED_PIN_TYPES[Math.floor(Math.random() * WEIGHTED_PIN_TYPES.length)];
      attempts++;
    } while (
      attempts < 20 && (
        (type === 'addBall' && staticCounts.addBall >= 1) ||
        (type === 'jackpot' && staticCounts.jackpot >= 1) ||
        (type === 'roundDrinks' && staticCounts.roundDrinks >= 1)
      )
    );
    if (type === 'addBall') staticCounts.addBall++;
    if (type === 'jackpot') staticCounts.jackpot++;
    if (type === 'roundDrinks') staticCounts.roundDrinks++;
    newSpecialPins.push({
      id: `special-${i}`,
      x: pin.x,
      y: pin.y,
      type,
      hitByBallIds: new Set<string>(),
      usedThisTurn: false
    });
  });
  
  return newSpecialPins;
};

export default function Game({ players, onGameEnd, onRestartGame, difficulty, isCumulativeMode }: GameProps) {
  const t = useTranslations('games.plinko')
  const getPinEffect = useCallback((type: SpecialPinType) => t(`pinEffects.${type}`), [t])
  const getPinLabel = useCallback((type: SpecialPinType) => t(`pinLabels.${type}`), [t])

  // États du jeu
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pinPositions, setPinPositions] = useState<PinPosition[]>([]);
  const [slotSipValues, setSlotSipValues] = useState<number[]>([]);
  const [specialPins, setSpecialPins] = useState<SpecialPin[]>([]);
  const [gameVersion, setGameVersion] = useState(0);
  // Supprimer ces deux lignes qui ne sont plus utilisées
  // const [pinsPerRowConfig, setPinsPerRowConfig] = useState<Map<number, number>>(generateRandomPinsConfig());
  // const calculatePinsForRow = usePinCalculator(pinsPerRowConfig);

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
    player: Player; // joueur qui vient de jouer (l'index courant, lui, a déjà avancé)
  } | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, TurnResult[]>>({});
  const [roundDrinksCount, setRoundDrinksCount] = useState(0);
  
  // États pour l'affichage des résultats
  const [resultDisplayPhase, setResultDisplayPhase] = useState<ResultDisplayPhase>('tournees');
  const [currentPlayerResultIndex, setCurrentPlayerResultIndex] = useState(0);
  // Plus haut index de joueur déjà consulté en phase « détails » : on n'ouvre
  // l'accès aux totaux qu'après avoir vu TOUS les joueurs.
  const [maxPlayerResultIndexReached, setMaxPlayerResultIndexReached] = useState(0);

  // Flash visuel sur collision de pin
  const flashingPinsRef = useRef<Map<string, number>>(new Map())
  const [, forceFlashRender] = useState(0)

  // Tooltip sur pin spécial (tap mobile)
  const [pinTooltip, setPinTooltip] = useState<{ id: string; x: number; y: number; type: SpecialPinType } | null>(null)

  // Légende repliée par défaut : les pins portent désormais leur glyphe, la
  // légende n'est qu'un rappel — et repliée elle ne déborde plus sous le pli mobile.
  const [legendOpen, setLegendOpen] = useState(false)

  // Son / vibration (mute partagé avec le reste du site via localStorage)
  const [muted, setMuted] = useState(false)
  useEffect(() => { setMuted(isSoundMuted()) }, [])
  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev
      persistSoundMuted(next)
      if (!next) playGameSound('step') // petit retour audible à la réactivation
      return next
    })
  }
  // Throttle des tics de rebond : une collision de pin peut survenir à chaque
  // sous-pas physique — sans throttle, ce serait un grésillement continu.
  const lastBounceSoundRef = useRef(0)

  const canvasRef = useRef<HTMLDivElement>(null)
  const animationRefs = useRef<{ red: number | null, green: number | null }>({ red: null, green: null })

  // Flash bref sur un pin touché (+ tic sonore throttlé)
  const triggerPinFlash = (id: string) => {
    flashingPinsRef.current.set(id, Date.now() + 350)
    forceFlashRender(n => n + 1)
    const now = Date.now()
    if (now - lastBounceSoundRef.current > 55) {
      lastBounceSoundRef.current = now
      playGameSound('step')
    }
    setTimeout(() => {
      flashingPinsRef.current.delete(id)
      forceFlashRender(n => n + 1)
    }, 360)
  }

  // Annuler proprement toute animation en cours (démontage/changement d'écran)
  useEffect(() => {
    const refs = animationRefs.current;
    return () => {
      if (refs.red) { cancelAnimationFrame(refs.red); }
      if (refs.green) { cancelAnimationFrame(refs.green); }
      refs.red = null;
      refs.green = null;
      setIsAnimating(false);
    }
  }, [])

  // --- Effet pour nettoyer l'état visuel après un changement de joueur --- 
  useEffect(() => {
    // Ne rien faire si le jeu est terminé ou si une animation est en cours
    if (gameOver || isAnimating) {
        return;
    }

    // Mettre un court délai avant de nettoyer pour laisser voir le résultat précédent
    const cleanupTimeout = setTimeout(() => {
        setTurnResult(null);
        setFinalSlotIndices({ red: null, green: null, extra: null });
        setExtraBalls([]);
        setBallPositions({ red: { x: 50, y: -10, color: 'red' }, green: { x: 50, y: -10, color: 'green' } });
        setPinTooltip(null);

        // Régénérer le plateau à chaque nouveau tour
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
        const isMobile = viewportWidth < 640;
        const rows = isMobile ? 6 : ROWS;
        const minPins = isMobile ? 4 : 5;
        const maxPins = isMobile ? 8 : 12;
        const specialPct = isMobile ? 0.25 : SPECIAL_PINS_PERCENTAGE;
        const newNormalPins = generateStaticNormalPins(rows, minPins, maxPins);
        const newSpecialPins = generateStaticSpecialPins(newNormalPins, specialPct);
        setPinPositions(newNormalPins);
        setSpecialPins(newSpecialPins);
        const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
        setSlotSipValues(Array.from({ length: TARGET_NUM_SLOTS }, () =>
          Math.floor(Math.random() * (max - min + 1)) + min
        ));
    }, 1500);

    // Nettoyer le timeout si le composant est démonté ou si l'état change avant la fin
    return () => clearTimeout(cleanupTimeout);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerIndex, gameOver, isAnimating, difficulty]);
  // --- Fin Effet Nettoyage ---

  // --- MODIFICATION: useEffect pour initialiser/réinitialiser le jeu basé sur les props --- 
  useEffect(() => {

    // Déterminer les paramètres responsive (mobile vs desktop)
    const containerElement = canvasRef.current;
    const viewportWidth = containerElement?.offsetWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const isMobile = viewportWidth < 640;
    const rows = isMobile ? 6 : ROWS;
    const minPins = isMobile ? 4 : 5;
    const maxPins = isMobile ? 8 : 12;
    const specialPct = isMobile ? 0.25 : SPECIAL_PINS_PERCENTAGE;

    // Générer une nouvelle configuration de pins moins dense sur mobile
    const newNormalPins = generateStaticNormalPins(rows, minPins, maxPins);
    const newSpecialPins = generateStaticSpecialPins(newNormalPins, specialPct);
    
    setPinPositions(newNormalPins);
    setSpecialPins(newSpecialPins);

    // Générer uniquement les valeurs des cases selon la difficulté
    const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
    const newSlotValues = Array.from({ length: TARGET_NUM_SLOTS }, () =>
      Math.floor(Math.random() * (max - min + 1)) + min
    );
    setSlotSipValues(newSlotValues);
  }, [difficulty, gameVersion]); // Ajouter gameVersion comme dépendance

  // À la fin de la partie : ne présenter l'écran « Tournées générales » que s'il
  // y en a réellement eu ; sinon on saute directement au détail des joueurs.
  useEffect(() => {
    if (gameOver) {
      setResultDisplayPhase(roundDrinksCount > 0 ? 'tournees' : 'details')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver])

  // Mémoriser le joueur le plus loin consulté (navigation séquentielle) : sert à
  // n'autoriser les totaux qu'après avoir parcouru tout le monde.
  useEffect(() => {
    setMaxPlayerResultIndexReached((prev) => Math.max(prev, currentPlayerResultIndex))
  }, [currentPlayerResultIndex])

  // --- MODIFICATION: Mise à jour de onRestartGame pour incrémenter gameVersion ---
  const handleRestartGame = () => {
    setGameVersion(prev => prev + 1); // Incrémenter gameVersion
    onRestartGame(); // Appeler la fonction originale
  };

  // --- Fonction séparée pour générer TOUS les pins spéciaux --- 
  // --- RE-RE-RE-MODIFICATION: Les pins spéciaux remplacent aléatoirement des pins normaux --- 
  const generateSpecialPins = (currentNormalPins: PinPosition[], specialPinsPercentage: number): SpecialPin[] => {
    const newSpecialPins: SpecialPin[] = [];
    
    // 1. Calculer le nombre exact de pins spéciaux (30% des pins normaux)
    const numNormalPins = currentNormalPins.length;
    if (numNormalPins === 0) return []; // Sécurité
    const totalPinsToPlace = Math.round(numNormalPins * specialPinsPercentage);

    // 2. Liste pondérée des types

    // 3. Sélectionner aléatoirement les indices des pins normaux à remplacer
    const normalPinIndices = Array.from({ length: numNormalPins }, (_, i) => i);
    // Mélange Fisher-Yates pour obtenir des indices aléatoires sans répétition
    for (let i = normalPinIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [normalPinIndices[i], normalPinIndices[j]] = [normalPinIndices[j], normalPinIndices[i]];
    }
    const indicesToReplace = normalPinIndices.slice(0, totalPinsToPlace);

    // 4. Créer les pins spéciaux aux positions sélectionnées avec types aléatoires
    const addedCounts = { addBall: 0, jackpot: 0, roundDrinks: 0 }; // Suivi pour les limites

    indicesToReplace.forEach((pinIndex, iterationIndex) => {
        const position = currentNormalPins[pinIndex];
        if (!position) return; // Sécurité

        let randomType: SpecialPinType;
        let selectionAttempts = 0;
        const maxSelectionAttempts = 20;
        
        // Choisir un type aléatoire en respectant les limites
        do {
            randomType = WEIGHTED_PIN_TYPES[Math.floor(Math.random() * WEIGHTED_PIN_TYPES.length)];
            selectionAttempts++;
            if (selectionAttempts > maxSelectionAttempts) break; 
        } while (
            (randomType === 'addBall' && addedCounts.addBall >= 1) ||
            (randomType === 'jackpot' && addedCounts.jackpot >= 1) ||
            (randomType === 'roundDrinks' && addedCounts.roundDrinks >= 1)
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

        if (randomType === 'addBall') addedCounts.addBall++;
        if (randomType === 'jackpot') addedCounts.jackpot++;
        if (randomType === 'roundDrinks') addedCounts.roundDrinks++;
        
    });
    
    return newSpecialPins;
  }
  // ----------------------------------------------------------------------------------------------------

  // --- MODIFICATION: Adapter calculateFinalSips pour TOUS les nouveaux effets --- 
  const calculateFinalSips = useCallback((baseSips: number, ballData: BallAnimationData): number => {
      // 1. Vérifier si effets annulés
      if (ballData.effects.effectsReset) {
          return Math.round(baseSips); // Retourne juste la valeur de la case
      }
      
      // 2. Vérifier si Jackpot
      if (ballData.effects.jackpotHit) {
          return JACKPOT_VALUE; // Retourne la valeur fixe du jackpot
      }
      
      // 3. Calcul standard (si pas annulé et pas jackpot)
      let finalSips = baseSips;
      
      // Appliquer le multiplicateur
      if (ballData.effects.multiplierCount > 0) {
          if (isCumulativeMode) {
              // Mode cumulatif: Appliquer 2^N
              finalSips *= Math.pow(2, ballData.effects.multiplierCount);
          } else {
              // Mode normal: Appliquer x2 une seule fois
              finalSips *= 2;
          }
      }
      
      // Ajouter/Retirer les gorgées (déjà cumulatif par nature)
      finalSips += ballData.effects.sipsToAdd;

      finalSips = Math.max(0, finalSips - ballData.effects.sipsToSubtract);

      return Math.round(finalSips); // Arrondir au cas où les multiplicateurs créent des décimales
  }, [isCumulativeMode]); // <-- Dépendance OK
  // ----------------------------------------------------------------------------------------

  const dropBalls = () => {
    if (isAnimating) return;
    if (!canvasRef.current) {
      console.warn("Canvas non prêt, lancement annulé.")
      return;
    }
    
    const containerElement = canvasRef.current;
    const viewportWidth = containerElement?.offsetWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const isMobile = viewportWidth < 640;
    const specialPct = isMobile ? 0.25 : SPECIAL_PINS_PERCENTAGE;
    const newPinsForTurn = generateSpecialPins(pinPositions, specialPct);
    setSpecialPins(newPinsForTurn);
    const currentSpecialPins = newPinsForTurn;

    setExtraBalls([]); 
    setFinalSlotIndices({ red: null, green: null, extra: null }); 
    setIsAnimating(true);
    setTurnResult(null); 
    // setTurnEffectLogs(null); // SUPPRIMÉ: Assurer la réinitialisation avant le lancer
    // Positionner les balles pile au-dessus d'un pin de la 1ère rangée (ou 2nde si indisponible)
    const rowsForStart = pinPositions
      .map(p => p.y)
      .sort((a, b) => a - b);
    const firstRowY = rowsForStart[0];
    const secondRowY = rowsForStart.find(y => y > firstRowY + 0.1);
    const candidateRowY = firstRowY ?? secondRowY ?? 10;
    const candidatePins = pinPositions.filter(p => Math.abs(p.y - candidateRowY) < 0.1);
    const chosenPin = candidatePins.length > 0 ? candidatePins[Math.floor(Math.random() * candidatePins.length)] : { x: 50, y: candidateRowY };
    const startX = chosenPin.x;
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
          firstPinHit: false,
          effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
          guidance: { firstRowHit: false }
          // effectLog: [] // SUPPRIMÉ
      },
      green: {
          id: 'green',
          x: startX, y: 0,
          velocityY: INITIAL_VELOCITY_Y, velocityX: 0,
          active: true, color: 'green',
          firstPinHit: false,
          effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
          guidance: { firstRowHit: false }
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
          console.warn("Canvas ref manquant: arrêt et nettoyage animation.");
          setIsAnimating(false);
          if (animationRefs.current.red) {
            cancelAnimationFrame(animationRefs.current.red);
            animationRefs.current.red = null;
          }
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

        // Déclarations dépendantes de la taille du conteneur (px) AVANT tout calcul
        const widthPx = containerWidth;
        const heightPx = containerHeight;
        const isSmBreakpoint = widthPx >= 640; // Tailwind sm
        const visualBallDiameterPx = isSmBreakpoint ? 20 : 16; // sm:w-5 => 20px, w-4 => 16px
        const visualPinDiameterPx = isSmBreakpoint ? 16 : 12;  // sm:w-4 => 16px, w-3 => 12px
        const ballRadiusPx = visualBallDiameterPx / 2;
        const pinRadiusPx = visualPinDiameterPx / 2;

        // Intégration plus réaliste (échelle en pixels et traînée légère)
        const nowMs = performance.now();
        let dtSec = Math.max(0.001, Math.min(0.033, deltaTime / 1000));
        // Slow motion effect
        if ((ballData.effects.slowMotionUntilMs ?? 0) > nowMs) {
          dtSec *= 0.5;
        }
        // Gravité (inversée si Gravity Flip actif)
        const baseGravityPx = heightPx * 2.0;
        const gravitySign = ((ballData.effects.gravityFlipUntilMs ?? 0) > nowMs) ? -1 : 1;
        const GRAVITY_PX = baseGravityPx * gravitySign;
        const AIR_DRAG = 0.002;
        // Convertir la position en pixels
        let xPx = (ballData.x / 100) * widthPx;
        let yPx = (ballData.y / 100) * heightPx;
        // Interpréter les vitesses comme px/s
        let vx = ballData.velocityX;
        let vy = ballData.velocityY;
        vy += GRAVITY_PX * dtSec;
        xPx += vx * dtSec;
        yPx += vy * dtSec;
        vx *= Math.max(0.0, 1 - AIR_DRAG * (deltaTime / 16));
        vy *= Math.max(0.0, 1 - (AIR_DRAG * 0.5) * (deltaTime / 16));

        // Aimantation gauche/droite
        if ((ballData.effects.magnetUntilMs ?? 0) > nowMs && ballData.effects.magnetDir) {
          const magnetAccel = widthPx * 3.0; // px/s^2 vers un côté
          const dir = ballData.effects.magnetDir === 'left' ? -1 : 1;
          vx += (magnetAccel * dtSec) * 0.2 * dir; // petite poussée continue
        }
        // Reconversion en % pour le reste du pipeline existant
        ballData.x = (xPx / widthPx) * 100;
        ballData.y = (yPx / heightPx) * 100;
        ballData.velocityX = vx;
        ballData.velocityY = vy;

        // Rayons de COLLISION en pixels
        const hitboxScale = isSmBreakpoint ? 1 : 0.85;
        const sumRadiusPx = (ballRadiusPx * hitboxScale) + (pinRadiusPx * hitboxScale);
        const sumRadiusSqPx = sumRadiusPx * sumRadiusPx;
        const RESTITUTION = 0.9;

        let collisionOccurred = false;

        // (indices de rangées non nécessaires ici)

        for (const pin of pinPositions) {
            // Ignorer le pin normal si un pin spécial est à la même position
            if (currentSpecialPins.some(sp => sp.x === pin.x && sp.y === pin.y)) continue;
            const pinId = `n-${pin.x.toFixed(1)}-${pin.y.toFixed(1)}`;
            if (lastCollisionPin.get(ballId) === pinId) continue;

            // Collision balle/pin en pixels
            const dxPx = (ballData.x / 100) * widthPx - (pin.x / 100) * widthPx;
            const dyPx = (ballData.y / 100) * heightPx - (pin.y / 100) * heightPx;
            const distSqPx = dxPx * dxPx + dyPx * dyPx;

            if (distSqPx < sumRadiusSqPx) {
                collisionOccurred = true; lastCollisionPin.set(ballId, pinId);
                triggerPinFlash(pinId);
                const distPx = Math.max(0.0001, Math.sqrt(distSqPx));
                const nx = dxPx / distPx; const ny = dyPx / distPx;
                // Projection hors du pin
                const overlapPx = (sumRadiusPx - distPx) * PHYSICS_OVERLAP_PUSH_MULTIPLIER + 0.5;
                const projX = ((ballData.x / 100) * widthPx) + nx * overlapPx;
                const projY = ((ballData.y / 100) * heightPx) + ny * overlapPx;
                ballData.x = (projX / widthPx) * 100;
                ballData.y = (projY / heightPx) * 100;
                // Réflexion vitesse (impulsion élastique)
                const vDotN = ballData.velocityX * nx + ballData.velocityY * ny;
                if (vDotN < 0) {
                  ballData.velocityX = ballData.velocityX - (1 + RESTITUTION) * vDotN * nx;
                  ballData.velocityY = ballData.velocityY - (1 + RESTITUTION) * vDotN * ny;
                }
                // Impulsion tangentielle aléatoire au tout premier impact
                if (!ballData.firstPinHit) {
                  const side = Math.random() < 0.5 ? -1 : 1;
                  const tx = -ny; const ty = nx; // tangente
                  const tangentBoost = isSmBreakpoint ? 120 : 80; // px/s
                  ballData.velocityX += tx * tangentBoost * side;
                  ballData.velocityY += ty * tangentBoost * side;
                  ballData.firstPinHit = true;
                }
                ballData.velocityX *= 0.995; ballData.velocityY *= 0.995;
                 break; 
            }
        }

        if (!collisionOccurred) {
            // Collisions PINS SPÉCIAUX en pixels
            let specialCollisionPinIndex = -1; // Index du pin spécial touché
            let specialCollisionPin: SpecialPin | null = null; // Le pin spécial touché

            for (let i = 0; i < currentSpecialPins.length; i++) {
                const sPin = currentSpecialPins[i];
                const dxPxS = (ballData.x / 100) * widthPx - (sPin.x / 100) * widthPx;
                const dyPxS = (ballData.y / 100) * heightPx - (sPin.y / 100) * heightPx;
                const distSqPxS = dxPxS * dxPxS + dyPxS * dyPxS;
                const specialSumRadiusPx = (ballRadiusPx * hitboxScale) + ((pinRadiusPx + 2) * hitboxScale * (isSmBreakpoint ? 1 : 0.85));
                if (distSqPxS < specialSumRadiusPx * specialSumRadiusPx) {
                    const distPxS = Math.max(0.0001, Math.sqrt(distSqPxS));
                    const nxS = dxPxS / distPxS; const nyS = dyPxS / distPxS;
                    // Projection hors du pin spécial
                    const overlapPxS = (specialSumRadiusPx - distPxS) * PHYSICS_OVERLAP_PUSH_MULTIPLIER + 0.5;
                    const projXS = ((ballData.x / 100) * widthPx) + nxS * overlapPxS;
                    const projYS = ((ballData.y / 100) * heightPx) + nyS * overlapPxS;
                    ballData.x = (projXS / widthPx) * 100;
                    ballData.y = (projYS / heightPx) * 100;
                    // Réflexion vitesse (impulsion élastique)
                    const vDotNS = ballData.velocityX * nxS + ballData.velocityY * nyS;
                    if (vDotNS < 0) {
                      ballData.velocityX = ballData.velocityX - (1 + RESTITUTION) * vDotNS * nxS;
                      ballData.velocityY = ballData.velocityY - (1 + RESTITUTION) * vDotNS * nyS;
                    }
                    // Impulsion tangentielle aléatoire si premier impact
                    if (!ballData.firstPinHit) {
                      const side = Math.random() < 0.5 ? -1 : 1;
                      const txS = -nyS; const tyS = nxS;
                      const tangentBoostS = isSmBreakpoint ? 120 : 80;
                      ballData.velocityX += txS * tangentBoostS * side;
                      ballData.velocityY += tyS * tangentBoostS * side;
                      ballData.firstPinHit = true;
                    }
                    ballData.velocityX *= 0.995; ballData.velocityY *= 0.995;

                    specialCollisionPinIndex = i;
                    specialCollisionPin = sPin;
                    collisionOccurred = true;
                    lastCollisionPin.set(ballId, sPin.id);
                    triggerPinFlash(sPin.id);
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


                if (shouldTriggerEffect) {
                    // ballData.effectLog.push(...); // SUPPRIMÉ
                    
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
                            } else {
                            }
                            break;
                        case 'gravityFlip': {
                            const durationMs = 900;
                            const now = performance.now();
                            ballData.effects.gravityFlipUntilMs = Math.max(ballData.effects.gravityFlipUntilMs ?? 0, now + durationMs);
                            break;
                        }
                        case 'slowMotion': {
                            const durationMs = 1000;
                            const now = performance.now();
                            ballData.effects.slowMotionUntilMs = Math.max(ballData.effects.slowMotionUntilMs ?? 0, now + durationMs);
                            break;
                        }
                        case 'split': {
                            const newBall: BallAnimationData = {
                                id: `extra-split-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                                x: ballData.x,
                                y: ballData.y,
                                velocityY: ballData.velocityY,
                                velocityX: -ballData.velocityX,
                                active: true,
                                color: ballData.color,
                                firstPinHit: false,
                                effects: { ...ballData.effects, hitCountPerPin: new Map<string, number>(), doubleEffectArmed: false },
                            };
                            newlyAddedBalls.push(newBall);
                            break;
                        }
                        case 'scoreSwap': {
                            ballData.effects.scoreSwap = true;
                            break;
                        }
                        case 'doubleEffect': {
                            ballData.effects.doubleEffectArmed = true;
                            break;
                        }
                        case 'magnetLeft': {
                            const durationMs = 1200;
                            const now = performance.now();
                            ballData.effects.magnetUntilMs = Math.max(ballData.effects.magnetUntilMs ?? 0, now + durationMs);
                            ballData.effects.magnetDir = 'left';
                            break;
                        }
                        case 'magnetRight': {
                            const durationMs = 1200;
                            const now = performance.now();
                            ballData.effects.magnetUntilMs = Math.max(ballData.effects.magnetUntilMs ?? 0, now + durationMs);
                            ballData.effects.magnetDir = 'right';
                            break;
                        }
                        case 'multiplier': 
                            ballData.effects.multiplierCount++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'addSip': 
                            ballData.effects.sipsToAdd++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'subtractSip': 
                            ballData.effects.sipsToSubtract++; 
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'cancellation':
                            ballData.effects.effectsReset = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'colorSwap':
                            // Inverser la couleur
                            ballData.color = ballData.color === 'red' ? 'green' : 'red';
                            // Inverser la fonction donner/recevoir en échangeant les effets addSip et subtractSip
                            const tempAdd = ballData.effects.sipsToAdd;
                            ballData.effects.sipsToAdd = ballData.effects.sipsToSubtract;
                            ballData.effects.sipsToSubtract = tempAdd;
                            break;
                        case 'mystery':
                            const possibleEffects: SpecialPinType[] = ['multiplier', 'addBall', 'addSip', 'subtractSip', 'cancellation', 'colorSwap', 'shake', 'roundDrinks', 'jackpot', 'teleportation'];
                            const filteredPossibleEffects = possibleEffects.filter(type => type !== 'mystery'); 
                            const randomEffectIndex = Math.floor(Math.random() * filteredPossibleEffects.length);
                            const triggeredEffect = filteredPossibleEffects[randomEffectIndex];
                            // ballData.effectLog.push(...); // SUPPRIMÉ
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
                            break;
                        case 'roundDrinks':
                            roundDrinksIncrement++;
                            needsGlobalStateUpdate = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'jackpot':
                            ballData.effects.jackpotHit = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'teleportation':
                            // Téléporter la balle aléatoirement tout en haut du plateau
                            const randomX = Math.random() * (DROP_START_X_MAX - DROP_START_X_MIN) + DROP_START_X_MIN;
                            ballData.x = randomX;
                            ballData.y = 0; // Remettre tout en haut
                            ballData.velocityY = INITIAL_VELOCITY_Y; // Réinitialiser la vitesse verticale
                            ballData.velocityX = (Math.random() - 0.5) * 2; // Légère vitesse horizontale aléatoire
                            break;
                    } 


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

                    // Double Effect: duplique le prochain effet spécial une seule fois
                    if (ballData.effects.doubleEffectArmed) {
                        ballData.effects.doubleEffectArmed = false;
                        // Rejouer le même effet immédiatement (sans boucle infinie)
                        switch (sPin.type) {
                          case 'multiplier': ballData.effects.multiplierCount++; break;
                          case 'addSip': ballData.effects.sipsToAdd++; break;
                          case 'subtractSip': ballData.effects.sipsToSubtract++; break;
                          case 'cancellation': ballData.effects.effectsReset = true; break;
                          case 'colorSwap': {
                            ballData.color = ballData.color === 'red' ? 'green' : 'red';
                            const tmp = ballData.effects.sipsToAdd; ballData.effects.sipsToAdd = ballData.effects.sipsToSubtract; ballData.effects.sipsToSubtract = tmp;
                            break; }
                          case 'shake': {
                            const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
                            newSlotValuesForShake = Array.from({ length: TARGET_NUM_SLOTS }, () => Math.floor(Math.random() * (max - min + 1)) + min );
                            needsGlobalStateUpdate = true; break; }
                          case 'roundDrinks': roundDrinksIncrement++; needsGlobalStateUpdate = true; break;
                          case 'jackpot': ballData.effects.jackpotHit = true; break;
                          case 'teleportation': {
                            const randomX = Math.random() * (DROP_START_X_MAX - DROP_START_X_MIN) + DROP_START_X_MIN;
                            ballData.x = randomX; ballData.y = 0; ballData.velocityY = INITIAL_VELOCITY_Y; ballData.velocityX = (Math.random() - 0.5) * 2; break;
                          }
                          case 'gravityFlip': {
                            const now = performance.now();
                            ballData.effects.gravityFlipUntilMs = Math.max(ballData.effects.gravityFlipUntilMs ?? 0, now + 900); break;
                          }
                          case 'slowMotion': {
                            const now = performance.now();
                            ballData.effects.slowMotionUntilMs = Math.max(ballData.effects.slowMotionUntilMs ?? 0, now + 1000); break;
                          }
                          case 'split': {
                            const newBall: BallAnimationData = {
                              id: `extra-split-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                              x: ballData.x, y: ballData.y,
                              velocityY: ballData.velocityY, velocityX: -ballData.velocityX,
                              active: true, color: ballData.color, firstPinHit: false,
                              effects: { ...ballData.effects, hitCountPerPin: new Map<string, number>(), doubleEffectArmed: false }
                            };
                            newlyAddedBalls.push(newBall); break;
                          }
                          case 'scoreSwap': ballData.effects.scoreSwap = true; break;
                          case 'doubleEffect': /* no-op: ne pas re-armer */ break;
                          case 'magnetLeft': {
                            const now = performance.now();
                            ballData.effects.magnetUntilMs = Math.max(ballData.effects.magnetUntilMs ?? 0, now + 1200);
                            ballData.effects.magnetDir = 'left'; break; }
                          case 'magnetRight': {
                            const now = performance.now();
                            ballData.effects.magnetUntilMs = Math.max(ballData.effects.magnetUntilMs ?? 0, now + 1200);
                            ballData.effects.magnetDir = 'right'; break; }
                          case 'addBall': {
                            const hasAlreadyAddedBall = (ballData.effects.hitCountPerPin.get('addBall') ?? 0) > 0;
                            if (!hasAlreadyAddedBall) {
                              const randomStartX = Math.random() * (ADD_BALL_START_X_MAX - ADD_BALL_START_X_MIN) + ADD_BALL_START_X_MIN;
                              const randomVelX = (Math.random() - 0.5) * ADD_BALL_VELOCITY_X_MAGNITUDE;
                              const newExtraBallData: BallAnimationData = {
                                  id: `extra-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                                  x: randomStartX, y: 0, velocityY: INITIAL_VELOCITY_Y, velocityX: randomVelX,
                                  active: true, color: ballData.color,
                                  effects: { multiplierCount: 0, sipsToAdd: 0, sipsToSubtract: 0, hitCountPerPin: new Map<string, number>(), effectsReset: false, jackpotHit: false },
                              };
                              newlyAddedBalls.push(newExtraBallData);
                              ballData.effects.hitCountPerPin.set('addBall', 1);
                            }
                            break;
                          }
                        }
                    }

                    // Appliquer les mises à jour d'état global SI nécessaire
                    if (needsGlobalStateUpdate) {
                        if (newSlotValuesForShake) {
                            setSlotSipValues(newSlotValuesForShake);
                        }
                        if (roundDrinksIncrement > 0) {
                            setRoundDrinksCount(prev => Math.min(MAX_ROUND_DRINKS, prev + roundDrinksIncrement));
                        }
                    }

                    if (!ballData.powerupEvents) ballData.powerupEvents = [];
                    ballData.powerupEvents.push({
                        type: sPin.type,
                        timestamp: Date.now(),
                        description: getPinEffect(sPin.type),
                        color: ballData.color
                    });

                } else { // shouldTriggerEffect est faux
                    if (!isCumulativeMode) {
                    } 
                    // En mode cumulatif, cette condition ne devrait pas être atteinte, mais on log au cas où
                    else {
                    }
                }
            } // Fin du if (specialCollisionPin)
            // --- FIN REFACTORISATION ---
        } // Fin du if (!collisionOccurred pour les pins normaux)

        if (!collisionOccurred) lastCollisionPin.set(ballId, null);

        // Pas de guidage artificiel

        // Collisions murs en pixels (reconverties en %)
        {
          const xPxNow = (ballData.x / 100) * widthPx;
          if (xPxNow < ballRadiusPx) {
            ballData.x = (ballRadiusPx / widthPx) * 100;
            ballData.velocityX = -ballData.velocityX * (RESTITUTION * 0.9);
          }
          if (xPxNow > widthPx - ballRadiusPx) {
            ballData.x = ((widthPx - ballRadiusPx) / widthPx) * 100;
            ballData.velocityX = -ballData.velocityX * (RESTITUTION * 0.9);
          }
        }

        // Comparaison bas du plateau en pixels pour coller au rendu visuel
        const ballYPx = (ballData.y / 100) * heightPx;
        if (ballYPx >= heightPx - ballRadiusPx) {
            const slotWidthPercent = 100 / TARGET_NUM_SLOTS;
            const slotIndex = Math.min(TARGET_NUM_SLOTS - 1, Math.max(0, Math.floor(ballData.x / slotWidthPercent)));
            const baseSips = slotSipValues[slotIndex] ?? 0;
            const finalSips = calculateFinalSips(baseSips, ballData);

            ballData.finalSipResult = finalSips; // Stocker le résultat
            ballData.active = false; // Marquer comme inactive

            // Retour d'atterrissage : son + courte vibration (le mute son coupe
            // aussi la vibration — un seul réglage pour tout le feedback).
            playGameSound('reveal')
            if (!isSoundMuted() && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(18)
            }

            if (ballData.id === 'red' || ballData.id === 'green') {
                setFinalSlotIndices(prev => ({ ...prev, [ballData.id as 'red' | 'green']: slotIndex }));
            } else {
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
    const redBase = finalRedData?.finalSipResult ?? 0;
    const greenBase = finalGreenData?.finalSipResult ?? 0;
    const redSwap = finalRedData?.effects.scoreSwap ? 1 : 0;
    const greenSwap = finalGreenData?.effects.scoreSwap ? 1 : 0;
    let totalRedSips = 0;
    let totalGreenSips = 0;
    // Appliquer Score Swap: si activé, on inverse l’affectation
    if (finalRedData) {
      if (finalRedData.color === 'red') {
        if (redSwap) totalGreenSips += redBase; else totalRedSips += redBase;
      } else {
        if (redSwap) totalRedSips += redBase; else totalGreenSips += redBase;
      }
    }
    if (finalGreenData) {
      if (finalGreenData.color === 'green') {
        if (greenSwap) totalRedSips += greenBase; else totalGreenSips += greenBase;
      } else {
        if (greenSwap) totalGreenSips += greenBase; else totalRedSips += greenBase;
      }
    }
    
    // (déjà pris en compte plus haut via la logique Score Swap)
    

    // Traiter chaque balle supplémentaire en fonction de sa couleur FINALE
    finishedExtraBalls.forEach(ballData => {
        const sips = ballData.finalSipResult ?? 0;
        // Ajouter les gorgées à la catégorie correspondant à la couleur finale de la balle
        if (ballData.color === 'red') {
            totalRedSips += sips;
        } else {
            totalGreenSips += sips;
        }
    });

    const currentPlayer = players[currentPlayerIndex];
    const boost = currentPlayer ? getPlayerGameBoost(currentPlayer, 'plinko') : 0;
    if (boost > 0) {
      totalGreenSips += Math.floor(totalGreenSips * boost / 100);
      totalRedSips = Math.max(0, totalRedSips - Math.floor(totalRedSips * boost / 100));
    }


    const extraSipsForDisplay = finishedExtraBalls.reduce((sum, ballData) => sum + (ballData.finalSipResult ?? 0), 0);
    setTurnResult({ redSips: totalRedSips, greenSips: totalGreenSips, extraSips: extraSipsForDisplay > 0 ? extraSipsForDisplay : null, player: currentPlayer });

    // Mettre à jour l'historique du tour actuel // SUPPRIMÉ
    // const currentTurnLogs = { ... };
    // setTurnEffectLogs(currentTurnLogs);

    // Ajouter à l'historique global // SUPPRIMÉ
    // const currentPlayer = players[currentPlayerIndex];
    // if (...) { setGameHistory(...) }

    // currentPlayer déjà défini plus haut
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
      setGameOver(true);
    } else {
      setCurrentPlayerIndex(prev => prev + 1);
    }
  };
  // --- Fin de handleTurnEnd ---

  // ── Action bar ─────────────────────────────────────────────────────────────

  const currentPlayer = players[currentPlayerIndex]

  // Annonce lecteur d'écran du résultat du tour (région aria-live plus bas).
  const turnAnnouncement = turnResult
    ? t('a11y.turnResult', { drinks: turnResult.redSips ?? 0, gives: turnResult.greenSips ?? 0 })
      + (roundDrinksCount > 0 ? ` ${t('a11y.roundDrinks')}` : '')
    : ''

  const actionBar = !gameOver ? (
    <div className="flex w-full items-center gap-2.5">
      {turnResult ? (
        // ── État RÉSULTAT : le joueur qui vient de jouer + son score, puis « ensuite » ──
        <>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-full ring-2 ring-white/25">
              <PlayerIcon player={turnResult.player} size="md" className="h-9 w-9 text-base" />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-bold text-red-400">
                {t('game.drinks')} {turnResult.redSips ?? 0} 🍺
              </span>
              <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-400">
                {t('game.gives')} {turnResult.greenSips ?? 0} 🍺
              </span>
              {roundDrinksCount > 0 && (
                <span className="rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-400">
                  {t('game.roundDrinksShort')} 🥂
                </span>
              )}
            </div>
          </div>

          {/* Qui vient ensuite (l'index a déjà avancé vers currentPlayer) */}
          <div className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5">
            <ArrowRight className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
            <div className="leading-tight">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-violet-300/70">{t('game.nextUp')}</p>
              <p className="max-w-[92px] truncate text-xs font-bold text-white"><PlayerName player={currentPlayer} /></p>
            </div>
            <PlayerIcon player={currentPlayer} size="sm" className="h-6 w-6 shrink-0 text-xs" />
          </div>
        </>
      ) : (
        // ── État PRÊT (à lancer) ou EN CHUTE ──
        <>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex shrink-0">
              {!isAnimating && <span className="absolute inset-0 -m-0.5 animate-ping rounded-full bg-violet-500/40" aria-hidden />}
              <span className="relative rounded-full ring-2 ring-violet-400/80">
                <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-lg" />
              </span>
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/70">{t('game.turnLabel')}</p>
              <p className="truncate text-base font-extrabold text-white"><PlayerName player={currentPlayer} /></p>
            </div>
          </div>

          <div className="relative ml-auto shrink-0">
            {!isAnimating && <span className="pointer-events-none absolute inset-0 animate-ping rounded-md bg-violet-500/25" aria-hidden />}
            <Button
              onClick={dropBalls}
              disabled={isAnimating}
              className="relative h-11 gap-1.5 bg-gradient-to-r from-violet-600 to-purple-700 px-5 text-base font-bold text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-purple-600 disabled:opacity-60"
            >
              {isAnimating
                ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-white/80" />{t('game.inGame')}</span>
                : <><ChevronsDown className="h-5 w-5 shrink-0" aria-hidden />{t('game.launch')}</>}
            </Button>
          </div>
        </>
      )}
    </div>
  ) : undefined

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <GameShell title={t('title')} onBack={onGameEnd} maxWidth={920} actionBar={actionBar}>
      <div className="space-y-4">

        {/* ── Plateau de jeu ───────────────────────────────────────────── */}
        {!gameOver && (
          <>
            {/* Annonce du résultat pour lecteurs d'écran (invisible à l'œil) */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {turnAnnouncement}
            </div>

            {/* File d'attente joueurs + bouton son */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-1">
                {players.map((p, i) => {
                  const distance = ((i - currentPlayerIndex) + players.length) % players.length
                  if (distance > 2) return null
                  const isActive = distance === 0
                  return (
                    <div key={p.id} className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-xl border transition-all duration-200',
                      isActive
                        ? 'border-violet-400/70 bg-violet-500/20 px-2.5 py-1.5 shadow-lg shadow-violet-900/30 ring-1 ring-violet-400/30'
                        : 'border-white/[0.07] bg-white/[0.03] px-2 py-1 opacity-45',
                    )}>
                      {isActive && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-violet-300" aria-hidden />}
                      <PlayerIcon player={p} size="sm" className={cn(isActive ? 'h-6 w-6' : 'h-5 w-5', 'text-xs')} />
                      <span className={cn('font-semibold', isActive ? 'text-sm text-white' : 'text-xs text-white/50')}>
                        <PlayerName player={p} />
                      </span>
                      {distance === 1 && <span className="text-[9px] uppercase tracking-wide text-white/30">{t('game.next')}</span>}
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? t('a11y.unmute') : t('a11y.mute')}
                aria-pressed={muted}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            <div
              ref={canvasRef}
              className="relative w-full overflow-hidden rounded-2xl border border-white/10"
              style={{ height: 'clamp(360px, 60vh, 550px)', background: 'radial-gradient(ellipse at 50% -10%, rgba(124,58,237,0.22) 0%, rgba(9,6,20,1) 65%)' }}
              onClick={() => setPinTooltip(null)}
            >
              {/* Pins normaux */}
              {pinPositions.map((pin, index) => {
                const pinId = `n-${pin.x.toFixed(1)}-${pin.y.toFixed(1)}`
                const isFlashing = (flashingPinsRef.current.get(pinId) ?? 0) > Date.now()
                return (
                  <div
                    key={`pin-${index}`}
                    className={cn(
                      `absolute ${VISUAL_NORMAL_PIN_SIZE_CLASS} rounded-full transition-all duration-75`,
                      isFlashing ? 'bg-purple-200 scale-[2.2] z-30' : 'bg-violet-400/50',
                    )}
                    style={{ top: `${pin.y}%`, left: `${pin.x}%`, transform: 'translate(-50%, -50%)' }}
                  />
                )
              })}

              {/* Pins spéciaux */}
              {specialPins.map((pin) => {
                const colors = SPECIAL_PIN_COLORS[pin.type]
                const isFlashing = (flashingPinsRef.current.get(pin.id) ?? 0) > Date.now()
                const isTooltipOpen = pinTooltip?.id === pin.id
                const openTooltip = () => setPinTooltip({ id: pin.id, x: pin.x, y: pin.y, type: pin.type })
                return (
                  <button
                    key={pin.id}
                    type="button"
                    aria-label={`${getPinLabel(pin.type)} — ${getPinEffect(pin.type)}`}
                    aria-pressed={isTooltipOpen}
                    className={cn(
                      // game-grid-cell : neutralise le min tap-target 40/44px que
                      // globals.css impose à tout <button> sur mobile (sinon le
                      // pin s'affiche à 40px au lieu de 16/20px).
                      `game-grid-cell absolute ${VISUAL_SPECIAL_PIN_SIZE_CLASS} flex items-center justify-center rounded-full border-2 cursor-pointer transition-all duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`,
                      colors.border, colors.bg,
                      isFlashing && 'scale-[2.5] brightness-150',
                    )}
                    style={{ top: `${pin.y}%`, left: `${pin.x}%`, transform: 'translate(-50%, -50%)', zIndex: isTooltipOpen ? 40 : 25 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPinTooltip(prev => prev?.id === pin.id ? null : { id: pin.id, x: pin.x, y: pin.y, type: pin.type })
                    }}
                    onFocus={openTooltip}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none select-none text-[9px] font-black leading-none text-black/80 drop-shadow-sm sm:text-[11px]"
                    >
                      {colors.glyph}
                    </span>
                  </button>
                )
              })}

              {/* Tooltip pin spécial */}
              {pinTooltip && (
                <div
                  className="pointer-events-none absolute z-50 rounded-xl border border-violet-500/30 bg-violet-950/95 px-3 py-2 shadow-2xl"
                  style={{
                    left: `${Math.min(82, Math.max(18, pinTooltip.x))}%`,
                    top: `${Math.max(6, pinTooltip.y - 10)}%`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-white">
                    <span aria-hidden className="text-sm leading-none">{SPECIAL_PIN_COLORS[pinTooltip.type].glyph}</span>
                    {getPinLabel(pinTooltip.type)}
                  </p>
                  <p className="mt-0.5 max-w-[180px] text-[10px] leading-tight text-white/60">{getPinEffect(pinTooltip.type)}</p>
                </div>
              )}

              {/* Cases en bas */}
              <div className="absolute bottom-0 w-full flex">
                {slotSipValues.map((sips, index) => {
                  const isRedHit = finalSlotIndices.red === index
                  const isGreenHit = finalSlotIndices.green === index
                  const isExtraHit = finalSlotIndices.extra === index
                  const isHit = isRedHit || isGreenHit || isExtraHit
                  const isBoth = isRedHit && isGreenHit
                  return (
                    <div
                      key={index}
                      className={cn(
                        'flex h-11 sm:h-14 items-center justify-center border-t border-x border-violet-800/25 transition-colors duration-200',
                        isBoth ? 'bg-purple-400/50' : isRedHit ? 'bg-red-500/45' : isGreenHit ? 'bg-emerald-500/45' : isExtraHit ? 'bg-violet-500/45' : 'bg-violet-950/40',
                      )}
                      style={{ width: `${100 / TARGET_NUM_SLOTS}%` }}
                    >
                      <span className={cn('font-bold text-sm sm:text-base', isHit ? 'text-white' : 'text-white/55')}>{sips}</span>
                    </div>
                  )
                })}
              </div>

              {/* Balle rouge */}
              {ballPositions.red?.y >= 0 && (
                <div
                  className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full z-20`}
                  style={{
                    left: `${ballPositions.red.x}%`,
                    top: `${ballPositions.red.y}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: ballPositions.red.color === 'red' ? '#ef4444' : '#22c55e',
                    boxShadow: `0 0 12px ${ballPositions.red.color === 'red' ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)'}`,
                  }}
                />
              )}

              {/* Balle verte */}
              {ballPositions.green?.y >= 0 && (
                <div
                  className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full z-20`}
                  style={{
                    left: `${ballPositions.green.x}%`,
                    top: `${ballPositions.green.y}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: ballPositions.green.color === 'red' ? '#ef4444' : '#22c55e',
                    boxShadow: `0 0 12px ${ballPositions.green.color === 'red' ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)'}`,
                  }}
                />
              )}

              {/* Balles extra */}
              {extraBalls.map((ball) => (
                <div
                  key={ball.id}
                  className={`absolute ${VISUAL_BALL_SIZE_CLASS} rounded-full z-20`}
                  style={{
                    left: `${ball.x}%`,
                    top: `${ball.y}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: ball.color === 'red' ? '#ef4444' : '#22c55e',
                    boxShadow: `0 0 12px ${ball.color === 'red' ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)'}`,
                  }}
                />
              ))}
            </div>

            {/* ── Légende repliable des pins spéciaux ─────────────────────── */}
            <div className="rounded-2xl border border-violet-800/20 bg-violet-950/30">
              <button
                type="button"
                onClick={() => setLegendOpen(o => !o)}
                aria-expanded={legendOpen}
                className="flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-violet-400/60">{t('game.specialPins')}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', legendOpen && 'rotate-180')} />
              </button>
              {legendOpen && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ALL_PIN_TYPES.map((type) => {
                    const colors = SPECIAL_PIN_COLORS[type]
                    if (!colors) return null
                    return (
                      <div key={type} className="flex items-center gap-2 min-w-0">
                        <span
                          aria-hidden
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-black leading-none text-black/80 ${colors.border} ${colors.bg}`}
                        >
                          {colors.glyph}
                        </span>
                        <span className="min-w-0 truncate text-xs text-white/55">
                          <span className="font-semibold text-white/75">{getPinLabel(type)}</span>
                          <span className="text-white/40"> · {getPinEffect(type)}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Résultats finaux ──────────────────────────────────────────── */}
        {gameOver && (
          <div className="space-y-4">
            {/* Titre de phase */}
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400/70">
              {resultDisplayPhase === 'tournees' && t('game.results.roundDrinksPhase')}
              {resultDisplayPhase === 'details' && t('game.results.detailsPhase')}
              {resultDisplayPhase === 'final' && t('game.results.finalPhase')}
            </p>

            {/* ── Phase tournées ── */}
            {resultDisplayPhase === 'tournees' && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] p-6 text-center">
                <p className="text-5xl font-extrabold text-violet-300">{roundDrinksCount > 0 ? roundDrinksCount : '—'}</p>
                <p className="mt-2 text-sm text-white/60">
                  {roundDrinksCount > 0
                    ? t('roundDrinksBanner', {
                        label: roundDrinksCount === 1 ? t('roundDrinksSingular') : t('roundDrinksPlural'),
                        count: roundDrinksCount,
                      })
                    : t('noRoundDrinks')}
                </p>
              </div>
            )}

            {/* ── Phase détails ── */}
            {resultDisplayPhase === 'details' && (() => {
              const player = players[currentPlayerResultIndex]
              const results = playerResults[player?.id] || []
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-violet-800/20 bg-violet-950/30 p-3">
                    <PlayerIcon player={player} size="md" className="h-9 w-9 text-lg" />
                    <span className="font-bold">
                      <PlayerName player={player} />
                    </span>
                    <span className="ml-auto text-xs text-white/35">{currentPlayerResultIndex + 1} / {players.length}</span>
                  </div>
                  {results.map((result, i) => (
                    <div key={i} className="rounded-2xl border border-violet-800/20 bg-violet-950/30 p-3">
                      <p className="mb-2 text-xs text-white/35">{t('game.results.turn', { n: i + 1 })}</p>
                      <div className="flex gap-2 mb-3">
                        <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-center">
                          <p className="text-xs text-red-400/70">{t('game.drinks')}</p>
                          <p className="text-xl font-extrabold text-red-400">{result.redSips}</p>
                        </div>
                        <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-center">
                          <p className="text-xs text-emerald-400/70">{t('game.gives')}</p>
                          <p className="text-xl font-extrabold text-emerald-400">{result.greenSips}</p>
                        </div>
                      </div>
                      {result.powerups.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
                          {result.powerups.map((pu, pi) => {
                            const c = SPECIAL_PIN_COLORS[pu.type]
                            return (
                              <span key={pi} className={`rounded-full border px-2 py-0.5 text-xs ${c.border} ${c.bg} text-white`} title={getPinEffect(pu.type)}>
                                {getPinLabel(pu.type)}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* ── Phase final ── */}
            {resultDisplayPhase === 'final' && (
              <div className="space-y-3">
                {roundDrinksCount > 0 && (
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] p-4 text-center">
                    <p className="text-sm font-semibold text-violet-300">
                      {t('game.results.roundDrinksAll', { count: roundDrinksCount })}
                    </p>
                  </div>
                )}
                {players.map(player => {
                  const results = playerResults[player.id] || []
                  const totalRed = results.reduce((s, r) => s + r.redSips, 0)
                  const totalGreen = results.reduce((s, r) => s + r.greenSips, 0)
                  const allPowerups = results.flatMap(r => r.powerups)
                  return (
                    <div key={player.id} className="rounded-2xl border border-violet-800/20 bg-violet-950/30 p-4">
                      <div className="mb-3 flex items-center gap-2.5">
                        <PlayerIcon player={player} size="md" />
                        <span className="font-bold">
                          <PlayerName player={player} />
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
                          <p className="text-xs text-red-400/70 uppercase tracking-wider">{t('game.drinks')}</p>
                          <p className="text-2xl font-extrabold text-red-400">{totalRed}</p>
                        </div>
                        <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
                          <p className="text-xs text-emerald-400/70 uppercase tracking-wider">{t('game.gives')}</p>
                          <p className="text-2xl font-extrabold text-emerald-400">{totalGreen}</p>
                        </div>
                      </div>
                      {allPowerups.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {allPowerups.map((pu, pi) => {
                            const c = SPECIAL_PIN_COLORS[pu.type]
                            return (
                              <span key={pi} className={`rounded-full border px-2 py-0.5 text-xs ${c.border} ${c.bg} text-white`} title={getPinEffect(pu.type)}>
                                {getPinLabel(pu.type)}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-center gap-3 pt-2">
              {resultDisplayPhase === 'tournees' && (
                <button
                  onClick={() => setResultDisplayPhase('details')}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-600"
                >
                  {roundDrinksCount > 0 ? t('game.results.seeDetails') : t('game.results.seeResults')}
                </button>
              )}

              {resultDisplayPhase === 'details' && (() => {
                const isLastPlayer = currentPlayerResultIndex >= players.length - 1
                const allPlayersSeen = maxPlayerResultIndexReached >= players.length - 1
                return (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        onClick={() => setCurrentPlayerResultIndex(p => Math.max(0, p - 1))}
                        disabled={currentPlayerResultIndex === 0}
                        className="rounded-xl border border-violet-800/30 bg-violet-950/30 px-4 py-2.5 text-sm text-white/70 disabled:opacity-30 hover:bg-violet-900/40"
                      >
                        {t('game.results.previous')}
                      </button>
                      {/* « Joueur suivant » : CTA principal tant que tout le monde n'a pas été vu */}
                      {!isLastPlayer && (
                        <button
                          onClick={() => setCurrentPlayerResultIndex(p => Math.min(players.length - 1, p + 1))}
                          className={cn(
                            'rounded-xl px-5 py-2.5 text-sm font-semibold',
                            allPlayersSeen
                              ? 'border border-violet-800/30 bg-violet-950/30 text-white/70 hover:bg-violet-900/40'
                              : 'bg-gradient-to-r from-violet-600 to-purple-700 text-white hover:from-violet-500 hover:to-purple-600',
                          )}
                        >
                          {t('game.results.nextPlayer')}
                        </button>
                      )}
                      {/* Totaux : uniquement après avoir parcouru TOUS les joueurs */}
                      {allPlayersSeen && (
                        <button
                          onClick={() => setResultDisplayPhase('final')}
                          className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-600"
                        >
                          {t('game.results.totals')}
                        </button>
                      )}
                    </div>
                    {!allPlayersSeen && (
                      <p className="text-xs text-white/40">{t('game.results.seeAllHint')}</p>
                    )}
                  </div>
                )
              })()}

              {resultDisplayPhase === 'final' && (
                <>
                  <button
                    onClick={handleRestartGame}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-600"
                  >
                    {t('game.results.newGame')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="rounded-xl border border-violet-800/30 bg-violet-950/30 px-5 py-2.5 text-sm text-white/70 hover:bg-violet-900/40"
                  >
                    {t('game.results.back')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </GameShell>
  )
} 