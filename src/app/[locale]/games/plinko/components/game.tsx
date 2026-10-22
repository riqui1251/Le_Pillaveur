"use client"

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Volume2, VolumeX, ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, Loader2, PartyPopper, RefreshCw, Trophy, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Player } from '@/types/game'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { GameShell } from '@/components/game/GameShell'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { cn } from '@/lib/utils'
import { playGameSound, isSoundMuted, setSoundMuted as persistSoundMuted } from '@/lib/sound/game-sounds'
import { useCastRoom } from '@/hooks/useCastRoom'
import type { PlinkoCastState } from '@/lib/cast-types'
import { SPECIAL_PIN_COLORS, SPECIAL_PIN_FAMILIES, SPECIAL_PIN_FAMILY_STYLE, type SpecialPinType } from '@/lib/plinko-pins'
import {
  applyScoreEffect,
  ballCategory,
  calculateFinalSips,
  previewSlotValues,
  tallyTurn,
  type BallColor,
} from '../plinko-scoring'
import {
  createLiveBalls,
  snapshotEffects,
  withHit,
  withLanding,
  withSpawn,
  type LiveBalls,
  type LivePinHit,
} from '../plinko-live'
import { LiveEffectsBar, LiveSlotValues, PinBubbleLayer, PinDot, type PinBubble } from './live-feedback'

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
// Pins spéciaux à 24 px, glyphe de 13-14 px : à 16 px avec un glyphe de 9 px,
// ils se lisaient comme des confettis. La hitbox suit ce diamètre (specialSumRadiusPx).
const VISUAL_SPECIAL_PIN_SIZE_CLASS = 'w-6 h-6 text-[13px] sm:text-sm';
const SPECIAL_PIN_DIAMETER_PX = 24;
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

// SpecialPinType et SPECIAL_PIN_COLORS sont désormais partagés avec le rendu TV
// (cast) — voir l'import depuis '@/lib/plinko-pins'.

const ALL_PIN_TYPES = Object.keys(PIN_TYPE_WEIGHTS) as SpecialPinType[]

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

const PIN_BUBBLE_MS = 900;

// Le flash « Passe le téléphone » attend que le lanceur ait vu ses balles
// arriver ; le résultat, lui, reste affiché jusqu'au lancer suivant.
const PASS_PHONE_DELAY_MS = 1500;

const HEADER_BUTTON_CLASS = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold';
// Pendant la chute, une pastille d'état lisible plutôt qu'un bouton or délavé à 40 %.
const FALLING_CLASS = 'disabled:border disabled:border-gold/20 disabled:bg-black/20 disabled:text-cream/80 disabled:opacity-100 disabled:shadow-none';

const IDLE_LIVE_BALLS: LiveBalls = createLiveBalls();

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
const generateStaticSpecialPins = (normalPins: PinPosition[], specialPinsPercentage: number, boardId: number): SpecialPin[] => {
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
      id: `special-${boardId}-${i}`,
      x: pin.x,
      y: pin.y,
      type,
      hitByBallIds: new Set<string>(),
      usedThisTurn: false
    });
  });

  return newSpecialPins;
};

interface Board {
  normalPins: PinPosition[];
  specialPins: SpecialPin[];
  slots: number[];
}

let boardSeq = 0;

// Plateau moins dense sous 640 px de large (6 rangées de 4 à 8 pions).
const generateBoard = (isMobile: boolean, difficulty: DifficultyLevel): Board => {
  const rows = isMobile ? 6 : ROWS;
  const minPins = isMobile ? 4 : 5;
  const maxPins = isMobile ? 8 : 12;
  const specialPct = isMobile ? 0.25 : SPECIAL_PINS_PERCENTAGE;
  const normalPins = generateStaticNormalPins(rows, minPins, maxPins);
  const specialPins = generateStaticSpecialPins(normalPins, specialPct, ++boardSeq);
  const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
  const slots = Array.from({ length: TARGET_NUM_SLOTS }, () => Math.floor(Math.random() * (max - min + 1)) + min);
  return { normalPins, specialPins, slots };
};

function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false // navigateur sans :focus-visible : le clic (Entrée, Espace) ouvre l'infobulle
  }
}

function tooltipPosition(x: number, y: number): CSSProperties {
  // Sous le pion près du haut : au-dessus, la bulle serait rognée par le plateau.
  const below = y < 25;
  const top = below ? `calc(${y}% + 16px)` : `calc(${y}% - 16px)`;
  const ty = below ? '0' : '-100%';
  if (x < 33) return { left: '2%', top, transform: `translateY(${ty})` };
  if (x > 67) return { right: '2%', top, transform: `translateY(${ty})` };
  return { left: `${x}%`, top, transform: `translate(-50%, ${ty})` };
}

export default function Game({ players, onGameEnd, onRestartGame, difficulty, isCumulativeMode }: GameProps) {
  const t = useTranslations('games.plinko')
  const tc = useTranslations('common')
  const tTv = useTranslations('tv')
  const [confirmDialog, confirm] = useConfirmAction()
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
    roundDrinks: number; // tournées générales gagnées à CE lancer
  } | null>(null);
  // Le dernier joueur a lancé : son résultat reste affiché, la fin attend « Voir les résultats ».
  const [allPlayed, setAllPlayed] = useState(false);
  // Joueur du flash « Passe le téléphone », posé un peu après l'arrivée des balles.
  const [passKey, setPassKey] = useState<string | null>(players[0]?.id ?? null);
  const passTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (passTimerRef.current) clearTimeout(passTimerRef.current) }, []);
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

  // Effets touchés par chaque balle pendant le tour : écrit seulement quand un pion agit, jamais à chaque image.
  const [liveBalls, setLiveBalls] = useState<LiveBalls | null>(null)
  const [pinBubbles, setPinBubbles] = useState<PinBubble[]>([])
  const pinBubbleSeqRef = useRef(0)
  const pinBubbleTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>())
  const reduceMotion = !!useReducedMotion()
  const showPinBubble = (x: number, y: number, hit: LivePinHit, category: BallColor) => {
    const key = ++pinBubbleSeqRef.current
    setPinBubbles(prev => [...prev, { key, x, y, hit, category }])
    const timer = setTimeout(() => {
      pinBubbleTimersRef.current.delete(timer)
      setPinBubbles(prev => prev.filter(b => b.key !== key))
    }, PIN_BUBBLE_MS)
    pinBubbleTimersRef.current.add(timer)
  }
  const clearPinBubbles = () => {
    pinBubbleTimersRef.current.forEach(clearTimeout)
    pinBubbleTimersRef.current.clear()
    setPinBubbles([])
  }
  useEffect(() => {
    const timers = pinBubbleTimersRef.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  // Légende ouverte d'entrée, sous le plateau : elle ne liste que les pions présents.
  const [legendOpen, setLegendOpen] = useState(true)

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

  // Cast sur TV : diffusion de l'état d'affichage vers une salle éphémère.
  const { code: castCode, active: castActive, start: startCast, push: pushCast, pushFrame: pushCastFrame, stop: stopCast } = useCastRoom('plinko')

  /** État d'affichage poussé à la TV — uniquement des infos publiques (dont le plateau). */
  const buildCastState = useCallback((): PlinkoCastState => {
    const cp = allPlayed ? undefined : players[currentPlayerIndex]
    const phase: PlinkoCastState['phase'] = gameOver
      ? 'finished'
      : isAnimating
        ? 'dropping'
        : turnResult
          ? 'result'
          : 'ready'
    return {
      castKind: 'plinko',
      phase,
      currentPlayerName: cp?.name ?? null,
      board: {
        normalPins: pinPositions.map((p) => ({ x: p.x, y: p.y })),
        specialPins: specialPins.map((p) => ({ x: p.x, y: p.y, type: p.type })),
        slots: slotSipValues,
      },
      lastDrop: turnResult
        ? {
            playerName: turnResult.player?.name ?? cp?.name ?? '',
            redSlot: finalSlotIndices.red,
            greenSlot: finalSlotIndices.green,
            redSips: turnResult.redSips ?? 0,
            greenSips: turnResult.greenSips ?? 0,
          }
        : null,
      scoreboard: players.map((p) => {
        const rs = playerResults[p.id] ?? []
        return {
          name: p.name,
          totalRed: rs.reduce((s, r) => s + r.redSips, 0),
          totalGreen: rs.reduce((s, r) => s + r.greenSips, 0),
          turns: rs.map((r) => ({ redSips: r.redSips, greenSips: r.greenSips, powerups: r.powerups.map((pu) => pu.type) })),
        }
      }),
      roundDrinks: roundDrinksCount,
      // Tout le monde a lancé : l'index sort de la table (comme il avance après chaque
      // tour) pour que la TV montre le dernier lanceur, sans « ensuite » ni joueur au tour.
      currentPlayerIndex: allPlayed ? players.length : currentPlayerIndex,
      cumulative: isCumulativeMode,
      live: liveBalls,
      extraSlot: finalSlotIndices.extra,
      results: gameOver
        ? {
            phase: resultDisplayPhase,
            playerIndex: currentPlayerResultIndex,
          }
        : null,
    }
  }, [players, currentPlayerIndex, allPlayed, gameOver, isAnimating, turnResult, slotSipValues, finalSlotIndices, playerResults, roundDrinksCount, pinPositions, specialPins, isCumulativeMode, liveBalls, resultDisplayPhase, currentPlayerResultIndex])

  const toggleCast = () => {
    if (castActive) void stopCast()
    else void startCast(JSON.stringify(buildCastState()))
  }

  // Pousse le nouvel état (plateau, scores) à chaque transition (tour, résultat, fin).
  useEffect(() => {
    if (castActive) pushCast(JSON.stringify(buildCastState()))
  }, [castActive, buildCastState, pushCast])

  // Diffuse la position des billes pendant la chute (~12/s) pour l'animer sur la TV.
  const lastFramePushRef = useRef(0)
  useEffect(() => {
    if (!castActive || !isAnimating) return
    const now = Date.now()
    if (now - lastFramePushRef.current < 80) return
    lastFramePushRef.current = now
    const balls: { x: number; y: number; color: 'red' | 'green' }[] = []
    if (ballPositions.red && ballPositions.red.y >= 0) {
      balls.push({ x: ballPositions.red.x, y: ballPositions.red.y, color: ballPositions.red.color })
    }
    if (ballPositions.green && ballPositions.green.y >= 0) {
      balls.push({ x: ballPositions.green.x, y: ballPositions.green.y, color: ballPositions.green.color })
    }
    extraBalls.forEach((b) => {
      if (b.y >= 0) balls.push({ x: b.x, y: b.y, color: b.color })
    })
    pushCastFrame(JSON.stringify({ balls }))
  }, [castActive, isAnimating, ballPositions, extraBalls, pushCastFrame])

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


  // --- MODIFICATION: useEffect pour initialiser/réinitialiser le jeu basé sur les props ---
  useEffect(() => {
    const containerElement = canvasRef.current;
    const viewportWidth = containerElement?.offsetWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const board = generateBoard(viewportWidth < 640, difficulty);
    setPinPositions(board.normalPins);
    setSpecialPins(board.specialPins);
    setSlotSipValues(board.slots);
  }, [difficulty, gameVersion]);

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

  const dropBalls = () => {
    if (isAnimating || allPlayed) return;
    if (!canvasRef.current) {
      console.warn("Canvas non prêt, lancement annulé.")
      return;
    }

    // Le plateau du tour précédent est resté affiché avec son résultat : on ne
    // le renouvelle qu'à ce geste. Au premier lancer, on joue le plateau montré
    // (les pions affichés étaient re-tirés au lancer : on lisait un plateau qui n'existait plus).
    const isMobile = canvasRef.current.offsetWidth < 640;
    let normalPins = pinPositions;
    let currentSpecialPins = specialPins;
    let turnSlotValues = slotSipValues;
    if (turnResult) {
      const board = generateBoard(isMobile, difficulty);
      normalPins = board.normalPins;
      currentSpecialPins = board.specialPins;
      turnSlotValues = board.slots;
      setPinPositions(normalPins);
      setSpecialPins(currentSpecialPins);
      setSlotSipValues(turnSlotValues);
    }
    setPinTooltip(null);
    if (passTimerRef.current) {
      clearTimeout(passTimerRef.current);
      passTimerRef.current = null;
    }
    // Lancé avant le flash : le changement de joueur est noté sans flash (désactivé pendant la chute).
    setPassKey(players[currentPlayerIndex]?.id ?? null);
    const roundDrinksAtDrop = roundDrinksCount;
    let turnRoundDrinkHits = 0;

    setExtraBalls([]);
    setFinalSlotIndices({ red: null, green: null, extra: null });
    setLiveBalls(createLiveBalls());
    clearPinBubbles();
    setIsAnimating(true);
    setTurnResult(null);
    // setTurnEffectLogs(null); // SUPPRIMÉ: Assurer la réinitialisation avant le lancer
    // Positionner les balles pile au-dessus d'un pin de la 1ère rangée (ou 2nde si indisponible)
    const rowsForStart = normalPins
      .map(p => p.y)
      .sort((a, b) => a - b);
    const firstRowY = rowsForStart[0];
    const secondRowY = rowsForStart.find(y => y > firstRowY + 0.1);
    const candidateRowY = firstRowY ?? secondRowY ?? 10;
    const candidatePins = normalPins.filter(p => Math.abs(p.y - candidateRowY) < 0.1);
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
    // Parties du même point à la même vitesse, les deux balles suivaient une fois sur deux la même
    // trajectoire jusqu'en bas : au premier rebond, la rouge et la verte partent de côtés opposés.
    const firstBounceSide = Math.random() < 0.5 ? -1 : 1;
    const firstBounceSideFor = (ballId: string) =>
      ballId === 'red' ? firstBounceSide : ballId === 'green' ? -firstBounceSide : (Math.random() < 0.5 ? -1 : 1);
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

        for (const pin of normalPins) {
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
                  const side = firstBounceSideFor(ballData.id);
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
                const specialSumRadiusPx = (ballRadiusPx + SPECIAL_PIN_DIAMETER_PX / 2) * hitboxScale;
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
                      const side = firstBounceSideFor(ballData.id);
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
                    const doubledByArmedEffect = !!ballData.effects.doubleEffectArmed;
                    let mysteryResolved: SpecialPinType | null = null;
                    let addBallSpawned = false;

                    switch (sPin.type) {
                        case 'addBall': {
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
                                addBallSpawned = true;
                                // Marquer que cette balle a activé un addBall
                                ballData.effects.hitCountPerPin.set('addBall', 1);
                            }
                            break;
                        }
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
                        case 'addSip':
                        case 'subtractSip':
                        case 'cancellation':
                        case 'colorSwap':
                        case 'jackpot':
                        case 'scoreSwap':
                            applyScoreEffect(ballData, sPin.type);
                            break;
                        case 'mystery': {
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
                                    mysteryResolved = 'addBall';
                                    break;
                                }
                                // Ajouter d'autres cas pour mystery si nécessaire
                            }
                            break;
                        }
                        case 'shake': {
                            const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
                            newSlotValuesForShake = Array.from({ length: TARGET_NUM_SLOTS }, () => Math.floor(Math.random() * (max - min + 1)) + min );
                            needsGlobalStateUpdate = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        }
                        case 'roundDrinks':
                            roundDrinksIncrement++;
                            needsGlobalStateUpdate = true;
                            // ballData.effectLog.push(...); // SUPPRIMÉ
                            break;
                        case 'teleportation': {
                            // Téléporter la balle aléatoirement tout en haut du plateau
                            const randomX = Math.random() * (DROP_START_X_MAX - DROP_START_X_MIN) + DROP_START_X_MIN;
                            ballData.x = randomX;
                            ballData.y = 0; // Remettre tout en haut
                            ballData.velocityY = INITIAL_VELOCITY_Y; // Réinitialiser la vitesse verticale
                            ballData.velocityX = (Math.random() - 0.5) * 2; // Légère vitesse horizontale aléatoire
                            break;
                        }
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
                          case 'multiplier':
                          case 'addSip':
                          case 'subtractSip':
                          case 'cancellation':
                          case 'colorSwap':
                          case 'jackpot':
                          case 'scoreSwap':
                            applyScoreEffect(ballData, sPin.type); break;
                          case 'shake': {
                            const { min, max } = DIFFICULTY_SETTINGS[difficulty].range;
                            newSlotValuesForShake = Array.from({ length: TARGET_NUM_SLOTS }, () => Math.floor(Math.random() * (max - min + 1)) + min );
                            needsGlobalStateUpdate = true; break; }
                          case 'roundDrinks': roundDrinksIncrement++; needsGlobalStateUpdate = true; break;
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
                            // Sans elle, l'arrivée compterait les cases d'avant le mélange, alors que le plateau (et l'aperçu) montrent les nouvelles.
                            turnSlotValues = newSlotValuesForShake;
                            setSlotSipValues(newSlotValuesForShake);
                        }
                        if (roundDrinksIncrement > 0) {
                            turnRoundDrinkHits += roundDrinksIncrement;
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

                    // Le doublement ne rejoue ni « mystère » ni un « + balle » déjà consommé : pas de ×2 affiché pour rien.
                    const liveHit: LivePinHit = {
                        type: sPin.type,
                        doubled: doubledByArmedEffect && sPin.type !== 'doubleEffect' && sPin.type !== 'mystery' && sPin.type !== 'addBall',
                        ...(sPin.type === 'mystery' ? { resolved: mysteryResolved } : {}),
                        ...(sPin.type === 'addBall' && !addBallSpawned ? { inert: true } : {}),
                    };
                    const liveSource = { id: ballData.id, color: ballData.color, effects: snapshotEffects(ballData.effects) };
                    setLiveBalls(prev => withHit(prev ?? createLiveBalls(), liveSource, liveHit));
                    if (ballData.id === 'red' || ballData.id === 'green') {
                        showPinBubble(sPin.x, sPin.y, liveHit, ballCategory(ballData, true));
                    }

                }
                // shouldTriggerEffect faux : effet déjà consommé ce tour, rien à faire.
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
            const baseSips = turnSlotValues[slotIndex] ?? 0;
            const finalSips = calculateFinalSips(baseSips, ballData.effects, isCumulativeMode);

            ballData.finalSipResult = finalSips; // Stocker le résultat
            ballData.active = false; // Marquer comme inactive

            // Retour d'atterrissage : son + courte vibration (le mute son coupe
            // aussi la vibration — un seul réglage pour tout le feedback).
            playGameSound('reveal')
            if (!isSoundMuted() && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
              navigator.vibrate(18)
            }

            const landedSource = { id: ballData.id, color: ballData.color, effects: snapshotEffects(ballData.effects) };
            setLiveBalls(prev => withLanding(prev ?? createLiveBalls(), landedSource, slotIndex, finalSips, baseSips));

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
          const spawned = newlyAddedBalls.map(b => ({ id: b.id, color: b.color, effects: snapshotEffects(b.effects) }));
          setLiveBalls(prev => withSpawn(prev ?? createLiveBalls(), spawned));
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
            finishedExtraBallsDataThisTurn, // Passer le tableau des balles extra finies
            Math.min(MAX_ROUND_DRINKS, roundDrinksAtDrop + turnRoundDrinkHits) - roundDrinksAtDrop
        );
      }
    };

    animationRefs.current.red = requestAnimationFrame(animate);
  };

  // --- MODIFICATION: Mise à jour de handleTurnEnd pour traiter les logs ---
  const handleTurnEnd = (
      finalRedData: BallAnimationData | null,
      finalGreenData: BallAnimationData | null,
      finishedExtraBalls: BallAnimationData[],
      roundDrinksGained: number
    ) => {
    const { redSips: totalRedSips, greenSips: totalGreenSips } = tallyTurn(finalRedData, finalGreenData, finishedExtraBalls);

    const currentPlayer = players[currentPlayerIndex];

    const extraSipsForDisplay = finishedExtraBalls.reduce((sum, ballData) => sum + (ballData.finalSipResult ?? 0), 0);
    setTurnResult({ redSips: totalRedSips, greenSips: totalGreenSips, extraSips: extraSipsForDisplay > 0 ? extraSipsForDisplay : null, player: currentPlayer, roundDrinks: roundDrinksGained });

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
      setAllPlayed(true);
    } else {
      const nextPlayer = players[currentPlayerIndex + 1];
      setCurrentPlayerIndex(prev => prev + 1);
      passTimerRef.current = setTimeout(() => {
        passTimerRef.current = null;
        setPassKey(nextPlayer.id);
      }, PASS_PHONE_DELAY_MS);
    }
  };
  // --- Fin de handleTurnEnd ---

  // ── Tour, passage du téléphone, sortie ─────────────────────────────────────

  const currentPlayer = players[currentPlayerIndex]
  const passPlayer = players.find(p => p.id === passKey)

  // Annonce lecteur d'écran du résultat du tour (région aria-live plus bas).
  const turnAnnouncement = turnResult
    ? t('a11y.turnResult', { name: turnResult.player.name, drinks: turnResult.redSips ?? 0, gives: turnResult.greenSips ?? 0 })
      + (turnResult.roundDrinks > 0 ? ` ${t('a11y.roundDrinks')}` : '')
    : ''

  const gameInProgress = !gameOver && (isAnimating || Object.keys(playerResults).length > 0)
  const handleBack = async () => {
    if (gameInProgress) {
      const ok = await confirm({
        title: t('game.quitConfirm.title'),
        description: t('game.quitConfirm.description'),
        confirmLabel: t('game.quitConfirm.confirm'),
        cancelLabel: t('game.quitConfirm.cancel'),
        tone: 'danger',
      })
      if (!ok) return
    }
    onGameEnd()
  }

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMute}
        aria-label={t('a11y.mute')}
        aria-pressed={muted}
        className={HEADER_BUTTON_CLASS}
      >
        {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      </Button>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleCast}
        aria-label={tTv('castToTv')}
        aria-pressed={castActive}
        className={cn(HEADER_BUTTON_CLASS, castActive && 'border-gold/60 bg-gold/[0.15] text-gold hover:bg-gold/20')}
      >
        <Tv aria-hidden className="h-5 w-5" />
      </Button>
    </>
  )

  // ── Barre du bas : le geste du moment, sous le pouce ───────────────────────

  // L'écran « Tournées générales » n'est présenté que s'il y en a eu ; posé ici,
  // au même rendu que la fin, pour ne pas montrer une image de « — » avant de sauter.
  const showResults = () => {
    setResultDisplayPhase(roundDrinksCount > 0 ? 'tournees' : 'details')
    setGameOver(true)
  }

  const boardActionBar = allPlayed && !isAnimating ? (
    <Button variant="primary" size="gameLg" className="w-full" onClick={showResults}>
      <Trophy aria-hidden className="mr-2 h-5 w-5 shrink-0" />
      {t('game.results.seeResults')}
    </Button>
  ) : (
    <Button
      variant="primary"
      size="gameLg"
      onClick={dropBalls}
      disabled={isAnimating}
      className={cn('w-full min-w-0', FALLING_CLASS)}
    >
      {isAnimating ? (
        <>
          <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
          {t('game.inGame')}
        </>
      ) : (
        <>
          <ChevronsDown aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate">{t('game.launchFor', { name: currentPlayer?.name ?? '' })}</span>
        </>
      )}
    </Button>
  )

  const isLastResultPlayer = currentPlayerResultIndex >= players.length - 1
  const allPlayersSeen = maxPlayerResultIndexReached >= players.length - 1
  const resultsActionBar = resultDisplayPhase === 'tournees' ? (
    <Button variant="primary" size="gameLg" className="w-full" onClick={() => setResultDisplayPhase('details')}>
      {roundDrinksCount > 0 ? t('game.results.seeDetails') : t('game.results.seeResults')}
      <ChevronRight aria-hidden className="ml-1.5 h-5 w-5 shrink-0" />
    </Button>
  ) : resultDisplayPhase === 'details' ? (
    <div className="flex w-full gap-2">
      <Button
        variant="quiet"
        size="gameLg"
        className="w-14 shrink-0 px-0"
        aria-label={t('game.results.previous')}
        disabled={currentPlayerResultIndex === 0}
        onClick={() => setCurrentPlayerResultIndex(p => Math.max(0, p - 1))}
      >
        <ChevronLeft aria-hidden className="h-6 w-6" />
      </Button>
      {/* « Joueur suivant » : action principale tant que tout le monde n'a pas été vu */}
      {!isLastResultPlayer && (
        <Button
          variant={allPlayersSeen ? 'quiet' : 'primary'}
          size="gameLg"
          className="min-w-0 flex-1 px-3"
          onClick={() => setCurrentPlayerResultIndex(p => Math.min(players.length - 1, p + 1))}
        >
          <span className="min-w-0 truncate">{t('game.results.nextPlayer')}</span>
          <ChevronRight aria-hidden className="ml-1 h-5 w-5 shrink-0" />
        </Button>
      )}
      {/* Totaux : uniquement après avoir parcouru TOUS les joueurs */}
      {allPlayersSeen && (
        <Button variant="primary" size="gameLg" className="min-w-0 flex-1 px-3" onClick={() => setResultDisplayPhase('final')}>
          <Trophy aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate">{t('game.results.totals')}</span>
        </Button>
      )}
    </div>
  ) : undefined

  // ── Retour en direct : effets touchés et valeurs finales prévues ───────────

  const liveView = liveBalls ?? IDLE_LIVE_BALLS
  const isLiveIdle = liveBalls === null
  const liveRedPreview = useMemo(
    () => previewSlotValues(slotSipValues, liveView.red.effects, isCumulativeMode),
    [slotSipValues, liveView.red.effects, isCumulativeMode],
  )
  const liveGreenPreview = useMemo(
    () => previewSlotValues(slotSipValues, liveView.green.effects, isCumulativeMode),
    [slotSipValues, liveView.green.effects, isCumulativeMode],
  )

  // Légende : les seuls types présents sur le plateau affiché, rangés par famille.
  const legendTypes = useMemo(() => {
    const present = new Set(specialPins.map(p => p.type))
    const familyRank = (type: SpecialPinType) => SPECIAL_PIN_FAMILIES.indexOf(SPECIAL_PIN_COLORS[type].family)
    return ALL_PIN_TYPES.filter(type => present.has(type)).sort((a, b) => familyRank(a) - familyRank(b))
  }, [specialPins])

  const powerupChip = (type: SpecialPinType, key: number) => {
    const c = SPECIAL_PIN_COLORS[type]
    return (
      <span key={key} className={cn('inline-flex items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-2 text-xs font-semibold', c.border, c.bg, c.fg)} title={getPinEffect(type)}>
        <span aria-hidden className="flex text-[13px] leading-none">{c.glyph}</span>
        {getPinLabel(type)}
      </span>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {confirmDialog}
      <PassPhoneOverlay
        playerKey={passKey}
        name={passPlayer?.name ?? ''}
        avatar={passPlayer ? <PlayerIcon player={passPlayer} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        enabled={!gameOver && !isAnimating}
      />
      <GameShell
        title={t('title')}
        headerSubtitle={!gameOver ? t('game.progress', { n: Math.min(currentPlayerIndex + 1, players.length), total: players.length }) : undefined}
        onBack={() => void handleBack()}
        headerRight={headerRight}
        maxWidth={920}
        actionBar={gameOver ? resultsActionBar : boardActionBar}
      >
        <div className="space-y-4 text-cream">

          {/* ── Plateau de jeu ───────────────────────────────────────────── */}
          {!gameOver && (
            <>
              {/* Annonce du résultat pour lecteurs d'écran (invisible à l'œil) */}
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {turnAnnouncement}
              </div>

              {/* File d'attente : le joueur au tour puis les deux suivants (un seul lancer chacun) */}
              <div className="flex min-h-[2.75rem] items-center gap-2 overflow-x-auto pb-1">
                {allPlayed ? (
                  <p className="text-sm font-semibold text-cream/80">{t('game.allPlayed')}</p>
                ) : (
                  players.slice(currentPlayerIndex, currentPlayerIndex + 3).map((p, offset) => {
                    const isActive = offset === 0
                    return (
                      <div key={p.id} className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5',
                        isActive ? 'border-gold/60 bg-gold/[0.15]' : 'border-gold/20 bg-black/25',
                      )}>
                        {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold motion-safe:animate-pulse" aria-hidden />}
                        <PlayerIcon player={p} size="sm" className="h-6 w-6 text-xs" />
                        <span className={cn('text-sm font-semibold', isActive ? 'text-cream' : 'text-cream/80')}>
                          <PlayerName player={p} />
                        </span>
                        {offset === 1 && <span className="text-xs uppercase tracking-wide text-cream/70">{t('game.next')}</span>}
                      </div>
                    )
                  })
                )}
              </div>

              {castActive && castCode && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-center text-xs text-gold">
                  <Tv aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  <span>
                    {tTv('castHint')}{' '}
                    <span className="font-mono text-sm font-black tracking-widest text-cream">{castCode}</span>
                  </span>
                </div>
              )}

              {/* 60vh se mesure barres du navigateur repliées : quand elles sont affichées (iOS,
                  Android), les cases du bas, où le résultat reste surligné, passaient sous la barre
                  d'action. D'où 100svh (barres affichées, stable au défilement) moins l'en-tête,
                  la file d'attente et la barre. */}
              <div
                ref={canvasRef}
                className="relative h-[clamp(360px,60vh,550px)] w-full overflow-hidden rounded-2xl border border-gold/[0.15] bg-felt-deep supports-[height:100svh]:h-[clamp(360px,min(60vh,calc(100svh_-_18rem_-_env(safe-area-inset-bottom,0px))),550px)]"
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
                        isFlashing ? 'bg-gold scale-[2.2] z-30' : 'bg-cream/[0.35]',
                      )}
                      style={{ top: `${pin.y}%`, left: `${pin.x}%`, transform: 'translate(-50%, -50%)' }}
                    />
                  )
                })}

                {/* Pins spéciaux : couleur de famille, glyphe exact */}
                {specialPins.map((pin) => {
                  const colors = SPECIAL_PIN_COLORS[pin.type]
                  const isFlashing = (flashingPinsRef.current.get(pin.id) ?? 0) > Date.now()
                  const isTooltipOpen = pinTooltip?.id === pin.id
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      aria-label={`${getPinLabel(pin.type)} — ${getPinEffect(pin.type)}`}
                      aria-pressed={isTooltipOpen}
                      className={cn(
                        // game-grid-cell : aucun plancher de taille hérité, le pion garde ses 24 px.
                        // La zone touchable, elle, déborde à 44 px (::after) : .touch-target poserait
                        // un position: relative qui disputerait l'absolute du pion.
                        `game-grid-cell absolute ${VISUAL_SPECIAL_PIN_SIZE_CLASS} after:absolute after:-inset-2.5 after:rounded-full flex cursor-pointer items-center justify-center rounded-full border-2 leading-none shadow-[0_1px_4px_rgba(0,0,0,0.55)] transition-[filter,box-shadow] duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-1 focus-visible:ring-offset-felt-deep`,
                        colors.border, colors.bg,
                        (isFlashing || isTooltipOpen) && 'ring-2 ring-cream',
                        isFlashing && 'brightness-125',
                      )}
                      style={{ top: `${pin.y}%`, left: `${pin.x}%`, transform: 'translate(-50%, -50%)', zIndex: isTooltipOpen ? 40 : 25 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPinTooltip(prev => prev?.id === pin.id ? null : { id: pin.id, x: pin.x, y: pin.y, type: pin.type })
                      }}
                      // Au clavier seulement : Chrome (Android compris) donne le focus au toucher,
                      // juste avant le clic, qui refermait aussitôt l'infobulle ouverte par le focus.
                      onFocus={(e) => {
                        if (isKeyboardFocus(e.currentTarget)) setPinTooltip({ id: pin.id, x: pin.x, y: pin.y, type: pin.type })
                      }}
                      onBlur={() => setPinTooltip(prev => (prev?.id === pin.id ? null : prev))}
                    >
                      {colors.glyph}
                    </button>
                  )
                })}

                {/* Tooltip pin spécial */}
                {pinTooltip && (
                  <div
                    className="pointer-events-none absolute z-50 w-max max-w-[220px] rounded-xl border border-gold/30 bg-felt-deep px-3 py-2 shadow-2xl"
                    style={tooltipPosition(pinTooltip.x, pinTooltip.y)}
                  >
                    <p className="flex items-center gap-2 font-display text-sm font-bold text-cream">
                      <PinDot type={pinTooltip.type} />
                      {getPinLabel(pinTooltip.type)}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-cream/80">{getPinEffect(pinTooltip.type)}</p>
                  </div>
                )}

                {/* Bandeau des effets touchés, en surimpression sous les balles */}
                <LiveEffectsBar live={liveView} idle={isLiveIdle} isCumulativeMode={isCumulativeMode} reduceMotion={reduceMotion} />

                {/* Cases en bas : pendant un tour, valeur finale prévue de chaque balle */}
                <div
                  role={isLiveIdle ? undefined : 'group'}
                  aria-label={isLiveIdle ? undefined : t('game.live.previewLabel')}
                  className="absolute bottom-0 w-full flex"
                >
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
                          'flex h-11 sm:h-14 items-center justify-center border-t border-x border-gold/[0.15] transition-colors duration-200',
                          !isLiveIdle && 'flex-col gap-1 px-0.5 sm:gap-1.5',
                          isBoth ? 'bg-gradient-to-r from-suit-red/60 to-emerald-700/60' : isRedHit ? 'bg-suit-red/60' : isGreenHit ? 'bg-emerald-700/60' : isExtraHit ? 'bg-gold/40' : 'bg-black/30',
                        )}
                        style={{ width: `${100 / TARGET_NUM_SLOTS}%` }}
                      >
                        {isLiveIdle
                          ? <span className={cn('font-display font-bold text-sm sm:text-base', isHit ? 'text-cream' : 'text-cream/70')}>{sips}</span>
                          : <LiveSlotValues live={liveView} slot={index} base={sips} redBallValue={liveRedPreview[index]} greenBallValue={liveGreenPreview[index]} />}
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

                {/* Bulles d'effet au-dessus des pins touchés par une balle principale */}
                <PinBubbleLayer bubbles={pinBubbles} reduceMotion={reduceMotion} />

                {/* Verdict du lancer, NOMMÉ, affiché jusqu'au lancer suivant : le
                    joueur qui tend déjà le téléphone a le temps de l'annoncer. */}
                {turnResult && !isAnimating && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[16%] z-40 flex justify-center px-3">
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="w-full max-w-[21rem] rounded-2xl border-2 border-gold bg-cream px-4 py-3 text-center text-[#24201A] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9)]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <PlayerIcon player={turnResult.player} size="md" className="h-9 w-9 text-xl" />
                        <p className="min-w-0 truncate font-display text-[28px] font-bold leading-tight">{turnResult.player.name}</p>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-suit-red px-2 py-1.5 text-cream">
                          <p className="text-xs font-bold uppercase tracking-wider">{t('game.drinks')}</p>
                          <p className="font-display text-3xl font-bold leading-none tabular-nums">{turnResult.redSips ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-emerald-700 px-2 py-1.5 text-cream">
                          <p className="text-xs font-bold uppercase tracking-wider">{t('game.gives')}</p>
                          <p className="font-display text-3xl font-bold leading-none tabular-nums">{turnResult.greenSips ?? 0}</p>
                        </div>
                      </div>
                      {turnResult.roundDrinks > 0 && (
                        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold">
                          <PartyPopper aria-hidden className="h-4 w-4 shrink-0 text-suit-red" />
                          {t('game.turnRoundDrinks', { count: turnResult.roundDrinks })}
                        </p>
                      )}
                    </motion.div>
                  </div>
                )}
              </div>

              {/* ── Légende des pins spéciaux du plateau ─────────────────────── */}
              {legendTypes.length > 0 && (
                <div className="rounded-2xl border border-gold/20 bg-felt-deep/70">
                  <button
                    type="button"
                    onClick={() => setLegendOpen(o => !o)}
                    aria-expanded={legendOpen}
                    aria-controls={legendOpen ? 'plinko-pin-legend' : undefined}
                    className="flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.specialPins')}</span>
                    <ChevronDown aria-hidden className={cn('h-5 w-5 shrink-0 text-cream/70 motion-safe:transition-transform', legendOpen && 'rotate-180')} />
                  </button>
                  {legendOpen && (
                    <div id="plinko-pin-legend" className="px-3 pb-3">
                      <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5">
                        {SPECIAL_PIN_FAMILIES.map((family) => (
                          <li key={family} className="flex items-center gap-1.5 text-xs text-cream/80">
                            <span aria-hidden className={cn('h-3 w-3 shrink-0 rounded-full border', SPECIAL_PIN_FAMILY_STYLE[family].border, SPECIAL_PIN_FAMILY_STYLE[family].bg)} />
                            {t(`game.pinFamilies.${family}`)}
                          </li>
                        ))}
                      </ul>
                      <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {legendTypes.map((type) => (
                          <li key={type} className="flex min-w-0 items-start gap-2.5">
                            <PinDot type={type} size="md" className="mt-0.5" />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-cream">{getPinLabel(type)}</span>
                              <span className="block text-xs leading-snug text-cream/70">{getPinEffect(type)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Résultats finaux ──────────────────────────────────────────── */}
          {gameOver && (
            <div className="space-y-4">
              {/* Titre de phase */}
              <h2 className="text-center font-display text-2xl font-bold text-gold">
                {resultDisplayPhase === 'tournees' && t('game.results.roundDrinksPhase')}
                {resultDisplayPhase === 'details' && t('game.results.detailsPhase')}
                {resultDisplayPhase === 'final' && t('game.results.finalPhase')}
              </h2>

              {/* ── Phase tournées ── */}
              {resultDisplayPhase === 'tournees' && (
                <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-6 text-center">
                  <p className="font-display text-5xl font-bold text-gold">{roundDrinksCount > 0 ? roundDrinksCount : '—'}</p>
                  <p className="mt-2 text-base text-cream/80">
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
                    <div className="flex items-center gap-2.5 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                      <PlayerIcon player={player} size="md" className="h-9 w-9 text-lg" />
                      <span className="min-w-0 truncate font-display text-lg font-bold text-cream">
                        <PlayerName player={player} />
                      </span>
                      <span className="ml-auto shrink-0 text-sm tabular-nums text-cream/70">{currentPlayerResultIndex + 1} / {players.length}</span>
                    </div>
                    {results.map((result, i) => (
                      <div key={i} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                        {/* Un seul lancer par joueur : « Tour 1 » sous chaque nom ne disait rien (la TV le tait aussi). */}
                        {results.length > 1 && <p className="mb-2 text-xs text-cream/70">{t('game.results.turn', { n: i + 1 })}</p>}
                        <div className="mb-3 flex gap-2">
                          <div className="flex-1 rounded-xl border border-suit-red/30 bg-suit-red/[0.15] p-2 text-center">
                            <p className="text-xs text-red-300">{t('game.drinks')}</p>
                            <p className="font-display text-2xl font-bold text-red-300">{result.redSips}</p>
                          </div>
                          <div className="flex-1 rounded-xl border border-emerald-700/40 bg-emerald-700/20 p-2 text-center">
                            <p className="text-xs text-emerald-300">{t('game.gives')}</p>
                            <p className="font-display text-2xl font-bold text-emerald-300">{result.greenSips}</p>
                          </div>
                        </div>
                        {result.powerups.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 border-t border-gold/10 pt-2">
                            {result.powerups.map((pu, pi) => powerupChip(pu.type, pi))}
                          </div>
                        )}
                      </div>
                    ))}
                    {!allPlayersSeen && (
                      <p className="text-center text-sm text-cream/70">{t('game.results.seeAllHint')}</p>
                    )}
                  </div>
                )
              })()}

              {/* ── Phase final ── */}
              {resultDisplayPhase === 'final' && (
                <div className="space-y-3">
                  {roundDrinksCount > 0 && (
                    <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4 text-center">
                      <p className="font-display text-base font-semibold text-gold">
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
                      <div key={player.id} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
                        <div className="mb-3 flex items-center gap-2.5">
                          <PlayerIcon player={player} size="md" />
                          <span className="min-w-0 truncate font-display font-bold text-cream">
                            <PlayerName player={player} />
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 rounded-xl border border-suit-red/30 bg-suit-red/[0.15] p-3 text-center">
                            <p className="text-xs uppercase tracking-wider text-red-300">{t('game.drinks')}</p>
                            <p className="font-display text-2xl font-bold text-red-300">{totalRed}</p>
                          </div>
                          <div className="flex-1 rounded-xl border border-emerald-700/40 bg-emerald-700/20 p-3 text-center">
                            <p className="text-xs uppercase tracking-wider text-emerald-300">{t('game.gives')}</p>
                            <p className="font-display text-2xl font-bold text-emerald-300">{totalGreen}</p>
                          </div>
                        </div>
                        {allPowerups.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {allPowerups.map((pu, pi) => powerupChip(pu.type, pi))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Avis de première partie, sur les totaux seulement (les tournées
                      et le détail par joueur ne sont pas encore la fin), au-dessus de Rejouer. */}
                  <EndActionDock
                    voiceGutter={false}
                    feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="plinko" />}
                  >
                    <Button variant="primary" size="gameLg" className="w-full" onClick={handleRestartGame}>
                      <RefreshCw aria-hidden className="mr-2 h-5 w-5" />
                      {tc('replay')}
                    </Button>
                    <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
                      {t('game.results.back')}
                    </Button>
                  </EndActionDock>
                </div>
              )}
            </div>
          )}

        </div>
      </GameShell>
    </>
  )
}
