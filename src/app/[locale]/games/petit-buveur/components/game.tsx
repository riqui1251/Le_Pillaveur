"use client"

import { Fragment, useState, useEffect, useCallback, useId, useMemo, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence, useMotionValue, useReducedMotion, animate } from 'framer-motion'
import { Dice6, Trophy, ArrowRight, RefreshCw, Home, Target, Link2, CircleDot, Sparkles, Swords, History, Shuffle, User, Check, Beer, Leaf, Volume2, VolumeX, Tv, ChevronDown, ChevronRight, Shield, Crown, Flag } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useCastRoom } from '@/hooks/useCastRoom'
import type { PetitBuveurCastEffect, PetitBuveurCastReveal, PetitBuveurCastStage } from '@/lib/cast-types'
import { Card } from '@/components/ui/card'
import { Player as BasePlayer, PlayerPreferences, PLAYER_ICONS, resolveValidatedPlayerName, getPlayerNameValidationError } from '@/lib/players'
import { nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { detectBrowserCapabilities } from '@/lib/browser-support'
import { getSafeStorage } from '@/lib/storage'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { ALCOHOL_WHEEL_CHALLENGE_INDEX, resolveAmbianceMode, withAmbiance } from '../ambiance'
import { PlayerName, isSpecialPlayer } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { formatPlayerNameHtml } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import { EndConfetti } from '@/components/online/EndConfetti'
import { MedalDot } from '@/components/online/MedalDot'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { GameShell } from '@/components/game/GameShell'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { EndActionDock } from '@/components/game/EndActionDock'
import { recordWinnerStats } from '@/lib/petit-buveur/local-stats'
// Plateau (grille, cases, pions) : la feuille suit le composant — servie avec
// ce morceau seulement, pas avec chaque page de /games (idem PetitBuveurOnline).
import '@/styles/petit-buveur-board.css'
import {
  type Case,
  type CaseType,
  type Difficulty,
  type PetitBuveurT,
  generateCase,
  getCaseTypeLabel,
  getDefiWheelChallenges,
} from '../case-config'
import type { GamePlayer } from '../case-types'
import {
  type CaseNotificationState,
  type EffectOutcome,
  type NotificationBuildContext,
  type StoredCase,
  buildEffectsSummaryHtml,
  buildLastActionHtml,
  buildNotificationHtml,
  formatCaseDescription,
  normalizeSavedCase,
  resolveOutcomeHtml,
  toStoredCase,
} from '../case-notification'
import {
  outcomeCannotRecul,
  outcomeCaseBase,
  outcomeChainLinked,
  outcomeCompose,
  outcomeDrinks,
  outcomeI18n,
  outcomeProtectedTarget,
  outcomeReplayedCase,
  outcomeSkipTurnSelf,
  outcomeChallengeResult,
} from '../outcome-helpers'
import { resolveNoTargetCase, getLeader, getLastPlayer } from '../resolve-case'
import {
  addDrinks,
  applyDuelResult,
  caseNeedsTarget,
  classifyDefiWheelSegment,
  drawSimpleCases,
  isNoTargetCase,
  isProtected,
  isReplayableCase,
  isShielded,
  resetPlayersForNewGame,
  tickTurnEnd,
  NON_SIMPLE_CASE_TYPES,
  type DefiWheelSegmentKind,
  type DrinkEntry,
  type DrinkOptions,
  type FreshLinks,
} from '../local-rules'
import {
  applyDoubleCase,
  applyTargetedCase,
  resolveExchange,
  resolveTeleport,
  type ApplyContext,
  type ApplyResult,
} from '../apply-case'
import { applyDiceRoll, clampBoardPosition, clonePlayers, detectWinner, hopDurationMs } from '../turn-state'
import {
  boardHighlightClass,
  boardHighlights,
  buildLocalCastState,
  castChanges,
  castEffectOf,
  LOCAL_DICE_RESULT_MS,
  LOCAL_DICE_ROLL_MS,
  localRevealContent,
  nextCastCue,
  rankByShownPosition,
  shownPosition,
  translateWithSlots,
  type SlotPart,
} from '../board-display'
import { ShameDice, getDeHonteOutcomeLabel, buildDeHonteDescription } from './shame-dice'
import { CoinFlip, getPileFaceOutcomeLabel, type CoinSide } from './coin-flip'
import { DiceOverlay, type DiceOverlayState } from '@/components/petit-buveur/DiceOverlay'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { useDrinkDeltas, FloatingDrinkBadge, PulsingCount, drinkIcon } from '@/components/petit-buveur/drink-feedback'
import { useGameSounds } from '@/hooks/useGameSounds'
import { isSoundMuted } from '@/lib/sound/game-sounds'
import { CaseRevealCard } from '@/components/petit-buveur/CaseRevealCard'
import { CaseToken } from '@/components/petit-buveur/CaseToken'
import { PbPawn, pbPawnColumns, pbPawnSize } from '@/components/petit-buveur/PbPawn'
import { PbDifficultyIcon, PbEffectIcon, PB_EFFECT_STYLE, pbEffectKindOf } from '@/components/petit-buveur/effects'
import { PbDialogClose, allowEscapeClose } from '@/components/petit-buveur/PbDialogClose'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

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

type WheelSegment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
  /** Roue des défis seulement. */
  kind?: DefiWheelSegmentKind
}

const DEFI_WHEEL_DRINKS = 2

const DIFFICULTIES: readonly Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

const resolveDifficulty = (value: Difficulty | undefined): Difficulty =>
  value && DIFFICULTIES.includes(value) ? value : 'normal'

/** Encre sur or (7,2:1) ou crème sur feutre : le chiffre d'un secteur reste lisible sur sa couleur. */
const INK = '#24201A'
const CREAM = 'rgb(var(--cream-rgb))'

/**
 * Secteur de la roue des gorgées : palier de couleur du thème, et la valeur
 * écrite dessus. La teinte glissait de 5° par gorgée (« 3 » et « 4 »
 * indiscernables) et rien n'était écrit.
 */
function wheelTier(value: number): { fill: string; ink: string } {
  if (value === 0) return { fill: '#047857', ink: CREAM }
  if (value <= 4) return { fill: 'rgb(var(--gold-rgb))', ink: INK }
  if (value <= 8) return { fill: '#B8862F', ink: INK }
  return { fill: 'rgb(var(--suit-red-rgb))', ink: CREAM }
}

/** Roue des défis : gorgées en rouge, sauvé en vert, défis en or et cuivre alternés. */
function defiTier(kind: DefiWheelSegmentKind | undefined, index: number): { fill: string; ink: string } {
  if (kind === 'drink') return { fill: 'rgb(var(--suit-red-rgb))', ink: CREAM }
  if (kind === 'safe') return { fill: '#047857', ink: CREAM }
  return index % 2 === 0 ? { fill: 'rgb(var(--gold-rgb))', ink: INK } : { fill: '#B8862F', ink: INK }
}

/** Initiale d'un joueur pour les secteurs du duel. */
const initialOf = (name: string | undefined) => (name?.trim().charAt(0) || '?').toUpperCase()

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

function renderSlots(parts: SlotPart[], nodes: Record<string, ReactNode>): ReactNode {
  return parts.map((part, i) => (
    <Fragment key={i}>{typeof part === 'string' ? part : nodes[part.slot]}</Fragment>
  ))
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
  const baseT = useTranslations('games.petit-buveur') as PetitBuveurT
  const { user } = useAuth()
  // Ambiance de la table (compte s'il y en a un, sinon l'appareil) : en Soft,
  // les formulations alcoolisées du jeu basculent sur leurs équivalents en
  // gages (mêmes cases, mêmes effets).
  const { mode: ambianceMode } = useAmbianceMode()
  const ambiance = resolveAmbianceMode(ambianceMode)
  const t = useMemo(() => withAmbiance(baseT, ambiance), [baseT, ambiance])
  const DrinkGlyph = ambiance === 'soft' ? Leaf : Beer
  const tCommon = useTranslations('common')
  const { updatePlayerStats } = usePlayers();
  const defaultColor = 'bg-primary';

  const simCompliments = useMemo(() => t.raw('game.messages.compliments') as string[], [t])
  const debMessages = useMemo(() => t.raw('game.messages.deb') as string[], [t])
  const drinkingMessages = useMemo(() => t.raw('game.messages.drinking') as string[], [t])

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
    return challenges.map((label, i) => {
      const kind = classifyDefiWheelSegment(i, label, safeLabel, ALCOHOL_WHEEL_CHALLENGE_INDEX)
      return {
        id: `defi-seg-${i}`,
        label,
        kind,
        value: kind === 'drink' ? DEFI_WHEEL_DRINKS : 0,
      }
    })
  }, [t])

  const formatPlayer = useCallback(
    (player: GamePlayer, options?: { compliment?: string }) =>
      formatPlayerNameHtml(player, options),
    []
  )
  
  // État pour stocker les capacités du navigateur
  const [, setBrowserCapabilities] = useState({
    advancedAnimations: true,
    backgroundClipText: true,
    isMobile: false,
    isLimitedBrowser: false
  });
  
  const [players, setPlayers] = useState<GamePlayer[]>(
    initialPlayers.length > 0 ? initialPlayers.map((p, index) => ({
      ...p,
      name: resolveValidatedPlayerName(p.name) ?? t('game.defaultPlayerName', { number: index + 1 }),
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
        name: t('game.defaultPlayerName', { number: 1 }),
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
        name: t('game.defaultPlayerName', { number: 2 }),
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
  /** « Toucher pour passer » : saute à l'étape suivante de la séquence du dé. */
  const diceSkipRef = useRef<(() => void) | null>(null);
  const [selectingPlayer, setSelectingPlayer] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [pendingCase, setPendingCase] = useState<Case | null>(null);
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const [pendingDuelNote, setPendingDuelNote] = useState<string | undefined>(undefined);
  const [lastActionHistory, setLastActionHistory] = useState<LastActionRecord | null>(null);
  const lastTargetIdRef = useRef<string | null>(null);
  const lastMoveDeltaRef = useRef(0);
  /** Double case : les deux cases simples tirées, appliquées ensemble après le ciblage. */
  const doubleCasesRef = useRef<Case[]>([]);
  /** Répétition / Rewind en cours : la prochaine notification annonce la case rejouée. */
  const replayViaRef = useRef<{ via: 'repetition' | 'rewind'; replayed: CaseType } | null>(null);
  const freshLinksRef = useRef<FreshLinks>({ mirror: false, chain: false });
  const skippedTurnRef = useRef(false);
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
  /** Détail des effets en cours (feuille ouverte depuis la rangée de pastilles). */
  const [showEffectsSheet, setShowEffectsSheet] = useState(false);

  // Source de vérité synchrone : les résolutions partent souvent d'un setTimeout
  // (fermeture d'un rendu antérieur) et liraient sinon un état périmé.
  const playersRef = useRef<GamePlayer[]>(players);
  const currentPlayerRef = useRef(currentPlayer);
  const turnCountRef = useRef(turnCount);
  const lastCaseRef = useRef<Case | null>(null);
  const gameStartedRef = useRef(gameStarted);
  const winnerRef = useRef<GamePlayer | null>(null);
  /** Vrai entre le premier geste du tour (lancer) et son passage : la sauvegarde projette alors la fin du tour. */
  const turnInProgressRef = useRef(false);
  /** Garde idempotente : un seul passage de tour par tour, un seul « Suivant » par notification. */
  const turnEndedRef = useRef(false);
  const nextHandledRef = useRef(false);
  const duelNoteUnshownRef = useRef(false);

  // Pions animés case par case + feedback gorgées (composants partagés petit-buveur).
  const positionsById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of players) rec[p.id] = p.position
    return rec
  }, [players])
  // Changée dans le même lot que les positions (reprise, nouvelle partie, Rejouer) :
  // les pions se posent sur leur case au lieu de retraverser le plateau.
  const [boardSnapKey, setBoardSnapKey] = useState(0)
  const snapBoard = () => setBoardSnapKey(k => k + 1)
  const { positions: shownPositions } = useSteppedPositions(positionsById, { snapKey: boardSnapKey })
  // Le pion qui marche reste à l'écran : sous les effets et le classement, il
  // sautait de case en case sans que personne le voie.
  const reducedMotion = useReducedMotion()
  const boardCellRefs = useRef<(HTMLDivElement | null)[]>([])
  const activeShownCase = players[currentPlayer] ? shownPosition(players[currentPlayer], shownPositions) : null
  useEffect(() => {
    if (activeShownCase == null) return
    boardCellRefs.current[activeShownCase]?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [activeShownCase, reducedMotion])
  const drinksById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of players) rec[p.id] = p.drinks
    return rec
  }, [players])
  const drinkDeltas = useDrinkDeltas(drinksById)

  // Sons : fanfare de victoire (une seule fois) + toggle mute dans l'en-tête.
  const { muted, toggleMuted, play: playSound } = useGameSounds()

  // ── Cast sur TV (jeu local diffusé) ──────────────────────────────────────
  // La TV ne reçoit que ce que cet écran montre déjà : la valeur du dé quand
  // l'overlay l'affiche, l'effet d'une case quand sa fenêtre s'ouvre (jamais
  // pendant le choix de cible ni le duel, qui le gardent caché). Le payload
  // est assemblé plus bas, une fois les fenêtres et les effets connus.
  const tTv = useTranslations('tv')
  const { code: castCode, active: castActive, start: startCast, push: pushCast, stop: stopCast } = useCastRoom('petit-buveur')
  const [castDice, setCastDice] = useState<{ value: number; seq: number; phase: 'rolling' | 'result' } | null>(null)
  /** Carte TV laissée par la dernière fenêtre d'effet, une fois refermée (« Action précédente »). */
  const [castLastReveal, setCastLastReveal] = useState<PetitBuveurCastReveal | null>(null)
  /** Seq de la fenêtre d'effet ouverte : le verdict d'un défi la complète sans la retourner à nouveau. */
  const [castNotificationSeq, setCastNotificationSeq] = useState(0)
  /**
   * Une seule suite pour le dé et les cases, lue hors du rendu : la case d'un
   * tour dépasse toujours son dé, même appelée depuis un minuteur posé avant
   * le lancer. Date.now() la garde croissante après un remontage du jeu.
   */
  const castSeqRef = useRef(0)
  const nextCastSeq = () => {
    castSeqRef.current = nextCastCue({ seq: castSeqRef.current }, {}, Date.now()).seq
    return castSeqRef.current
  }
  /** Dé du tour en cours (relance Chance comprise), rappelé sur la carte de la case. */
  const castRollRef = useRef<number | null>(null)
  /** Pions à l'arrivée sur la case : les pastilles de la carte TV en sont l'écart. */
  const castLandingRef = useRef<{
    players: { id: string; position: number; drinks: number }[]
    caseNumber: number | null
    dice: number | null
  } | null>(null)
  const castDiceRoll = () => setCastDice({ value: 0, seq: nextCastSeq(), phase: 'rolling' })
  const castDiceResult = (value: number) => {
    const fresh = nextCastSeq()
    setCastDice(prev => ({ value, seq: prev?.phase === 'rolling' ? prev.seq : fresh, phase: 'result' }))
  }
  const markCastLanding = (position: number | null) => {
    castLandingRef.current = {
      players: playersRef.current.map(p => ({ id: p.id, position: p.position, drinks: p.drinks })),
      caseNumber: position == null ? null : position + 1,
      dice: position == null ? null : castRollRef.current,
    }
  }
  const resetCastTurn = () => {
    // Sans quoi la TV rappellerait le dernier dé de la partie d'avant (« X fait 6 ») au premier joueur.
    setCastDice(null)
    setCastLastReveal(null)
    castLandingRef.current = null
    castRollRef.current = null
  }

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

  // États pour les nouvelles cases
  const [showChanceDialog, setShowChanceDialog] = useState(false);
  const [showExchangeDialog, setShowExchangeDialog] = useState(false);
  const [showChainDialog, setShowChainDialog] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);

  // Modales maison (hors Radix) : nom accessible, focus posé dedans, et le reste
  // de l'écran rendu inerte — sinon Tab atteint « ← » (quitter) sous le voile.
  const dialogUid = useId()
  const dialogTitleId = (name: string) => `${dialogUid}-${name}-title`
  const focusDialogOnMount = useCallback((el: HTMLElement | null) => {
    el?.focus({ preventScroll: true })
  }, [])
  const shellRef = useRef<HTMLDivElement | null>(null)
  const customModalOpen =
    showDuelDialog ||
    showTargetDialog ||
    showChainDialog ||
    showWheel ||
    (showVictoryScreen && Boolean(winner)) ||
    (showNotification && Boolean(caseNotification))
  useEffect(() => {
    if (shellRef.current) shellRef.current.inert = customModalOpen
  })

  // Détection des fonctionnalités du navigateur au chargement
  useEffect(() => {
    // Seulement exécuter côté client
    if (typeof window !== 'undefined') {
      setBrowserCapabilities(detectBrowserCapabilities());
    }
  }, []);

  // Montrer l'écran de victoire quand il y a un gagnant
  useEffect(() => {
    if (winner) {
      setShowVictoryScreen(true);
    } else {
      setShowVictoryScreen(false);
    }
  }, [winner]);

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

  const gameDifficultyRef = useRef(gameDifficulty);

  /** État de début du tour suivant, sans rien committer (passage de tour et sauvegarde en cours de tour). */
  const buildTurnEndState = (list: GamePlayer[], leavingIndex: number, turnCountValue: number) => {
    const updatedPlayers = clonePlayers(list)
    const nextPlayer = updatedPlayers.length > 0 ? (leavingIndex + 1) % updatedPlayers.length : 0
    const nextTurnCount = nextPlayer === 0 ? turnCountValue + 1 : turnCountValue
    tickTurnEnd(updatedPlayers, leavingIndex, {
      fresh: freshLinksRef.current,
      skipped: skippedTurnRef.current,
    })
    return { nextPlayer, nextTurnCount, updatedPlayers }
  }

  // Une sauvegarde prise en plein tour enregistre la fin de ce tour : une reprise
  // ne rejoue jamais un lancer ni une malédiction déjà comptés, et un
  // rechargement ne permet pas de relancer le dé.
  const saveGame = () => {
    if (!gameStartedRef.current || winnerRef.current) return
    const snapshot = turnInProgressRef.current
      ? buildTurnEndState(playersRef.current, currentPlayerRef.current, turnCountRef.current)
      : {
          updatedPlayers: playersRef.current,
          nextPlayer: currentPlayerRef.current,
          nextTurnCount: turnCountRef.current,
        }
    const saveData: GameSave = {
      id: `save_${Date.now()}`,
      timestamp: Date.now(),
      players: snapshot.updatedPlayers,
      currentPlayer: snapshot.nextPlayer,
      turnCount: snapshot.nextTurnCount,
      gameDifficulty: gameDifficultyRef.current,
      lastCase: lastCaseRef.current,
      gameStarted: true,
      winner: null,
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
  };

  const commitCurrentPlayer = (index: number) => {
    currentPlayerRef.current = index
    setCurrentPlayer(index)
  }

  const commitTurnCount = (count: number) => {
    turnCountRef.current = count
    setTurnCount(count)
  }

  const commitLastCase = (value: Case | null) => {
    lastCaseRef.current = value
  }

  const commitGameStarted = (value: boolean) => {
    gameStartedRef.current = value
    setGameStarted(value)
  }

  const commitGameDifficulty = (value: Difficulty) => {
    gameDifficultyRef.current = value
    setGameDifficulty(value)
  }

  const declareWinner = (winningPlayer: GamePlayer, delayMs: number) => {
    winnerRef.current = winningPlayer
    // Effacée tout de suite : la dernière sauvegarde précède le coup gagnant, une
    // reprise pendant l'animation annulerait la victoire.
    deleteSave()
    setIsProcessingTurn(true)
    setTimeout(() => {
      clearTurnBlockingUi()
      setWinner(winningPlayer)
      recordWinnerStats(updatePlayerStats, winningPlayer.id)
      setIsProcessingTurn(false)
      setIsDiceRolling(false)
    }, delayMs)
  }

  /**
   * Seule écriture des joueurs : met à jour la ref ET l'état, sauvegarde, puis
   * teste la victoire (règle 1). Retourne le vainqueur : l'appelant doit alors
   * s'arrêter (aucune notification, aucun passage de tour).
   */
  const commitPlayers = (
    next: GamePlayer[],
    opts: { actorIndex?: number; persist?: boolean } = {}
  ): GamePlayer | null => {
    const before = playersRef.current
    playersRef.current = next
    setPlayers(next)
    if (winnerRef.current) return winnerRef.current
    if (gameStartedRef.current) {
      const found = detectWinner(next, opts.actorIndex ?? currentPlayerRef.current, boardSize)
      if (found) {
        declareWinner(found, hopDurationMs(before, next))
        return found
      }
    }
    if (opts.persist !== false) saveGame()
    return null
  }

  const loadGame = (): GameSave | null => {
    try {
      const storage = getSafeStorage();
      if (!storage) return null;
      const saveData = storage.getItem('petit-buveur-save');
      
      if (saveData) {
        const parsed = JSON.parse(saveData) as GameSave;
        return parsed;
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
      resetTurnRefs()
      resetCastTurn()
      winnerRef.current = saveData.winner
      commitCurrentPlayer(saveData.currentPlayer);
      commitTurnCount(saveData.turnCount);
      commitGameDifficulty(resolveDifficulty(saveData.gameDifficulty));
      commitLastCase(normalizeSavedCase(saveData.lastCase));
      commitGameStarted(saveData.gameStarted);
      setWinner(saveData.winner);
      snapBoard();
      commitPlayers(
        saveData.players.map(p => {
          const loaded = p as GamePlayer & { protectedUntilTurn?: number }
          if (loaded.protected && (loaded.protectionTurnsLeft == null || loaded.protectionTurnsLeft <= 0)) {
            return {
              ...loaded,
              protectionTurnsLeft: Math.max(saveData.players.length, 1),
            }
          }
          return loaded
        }),
        { persist: false }
      );
      setShowSaveDialog(false);
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

  /** Évite de compter deux fois la même partie (re-render, retour sur l'écran de victoire). */
  const gameCountedRef = useRef(false);

  // Fin de partie : c'est le seul moment où le compteur de parties du mode local
  // doit bouger. On en profite pour effacer la sauvegarde — une partie terminée
  // ne doit rien laisser derrière elle, sinon « Reprendre » repropose un podium.
  useEffect(() => {
    if (!winner) {
      gameCountedRef.current = false;
      return;
    }
    if (gameCountedRef.current) return;
    gameCountedRef.current = true;

    players.forEach(p => {
      try {
        updatePlayerStats(p.id, 'petit-buveur', { gamesPlayed: 1 });
      } catch (error) {
        console.error('Erreur lors du comptage de la partie:', error);
      }
    });
    deleteSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);



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
    commitPlayers([
      ...playersRef.current,
      {
        id: Date.now().toString(),
        name: validName,
          position: 0,
          drinks: 0,
          preferences: {
            color: playerColors[playersRef.current.length % playerColors.length],
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
    commitPlayers(playersRef.current.filter(player => player.id !== playerId));
  }

  const isPlayerProtected = isProtected

  const getProtectionRemainingRounds = (player: GamePlayer) =>
    Math.max(1, Math.ceil((player.protectionTurnsLeft ?? 1) / Math.max(players.length, 1)))

  const recordDrinkStats = (log: DrinkEntry[]) => {
    for (const entry of log) {
      try {
        // updatePlayerStats CUMULE ce qu'on lui passe : il faut lui donner le
        // delta du tour, pas le total déjà cumulé du joueur — sinon le compteur
        // de gorgées enfle de façon quadratique (1, 3, 6, 10…).
        updatePlayerStats(entry.playerId, 'petit-buveur', { totalDrinks: entry.count })
      } catch (error) {
        console.error('Erreur lors de la mise à jour des statistiques:', error)
      }
    }
  }

  /** Gorgées (propagation miroir/chaîne, statistiques). Retourne true si la protection a bloqué. */
  const addPlayerDrinks = (
    playerId: string,
    drinks: number,
    list: GamePlayer[],
    opts: DrinkOptions = {}
  ): boolean => {
    const log: DrinkEntry[] = []
    const blocked = addDrinks(list, playerId, drinks, opts, log)
    recordDrinkStats(log)
    return blocked
  }

  /** Malédiction : 1 gorgée en début de tour (bloquée si protégé), même pour un tour sauté. */
  const applyCurseAtTurnStart = (player: GamePlayer, list: GamePlayer[]) => {
    if (player.cursed <= 0) return
    addPlayerDrinks(player.id, 1, list)
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
    const actorIndex = currentPlayerRef.current
    const currentPlayerObj = playersRef.current[actorIndex];
    if (!currentPlayerObj) return

    turnInProgressRef.current = true
    turnEndedRef.current = false
    freshLinksRef.current = { mirror: false, chain: false }
    skippedTurnRef.current = Boolean(currentPlayerObj.skipNextTurn)
    replayViaRef.current = null
    // Total des dés du tour (relance Chance comprise) : c'est ce que copie la case Copie.
    lastMoveDeltaRef.current = 0
    castRollRef.current = null

    if (currentPlayerObj.skipNextTurn) {
      const skipped = clonePlayers(playersRef.current)
      const skippedPlayer = skipped[actorIndex]
      skippedPlayer.skipNextTurn = false
      applyCurseAtTurnStart(skippedPlayer, skipped)
      setIsProcessingTurn(true)
      commitPlayers(skipped)
      const skipOutcome = outcomeSkipTurnSelf(currentPlayerObj.id)
      markCastLanding(null)
      showCaseOutcome({ type: 'passe-tour', effect: 0, description: undefined }, skipOutcome)
      recordLastAction(currentPlayerObj, 'passe-tour', skipOutcome, null)
      return
    }
    const updatedPlayers = clonePlayers(playersRef.current)
    applyCurseAtTurnStart(updatedPlayers[actorIndex], updatedPlayers)
    commitPlayers(updatedPlayers)

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

    const actorIndex = currentPlayerRef.current;
    const player = playersRef.current[actorIndex];
    if (!player) {
      setIsProcessingTurn(false);
      setIsDiceRolling(false);
      return;
    }

    const result = Math.floor(Math.random() * 6) + 1;
    castDiceRoll();
    const overlayIcon = <PlayerIcon player={player} size="sm" />;
    setDiceOverlay({ phase: 'rolling', playerName: player.name, playerIcon: overlayIcon });

    // Séquence skippable : un tap sur l'overlay saute à l'étape suivante.
    let proceeded = false;
    let resultTimer: ReturnType<typeof setTimeout> | undefined;
    const showResult = () => {
      setDiceOverlay({ phase: 'result', value: result, playerName: player.name, playerIcon: overlayIcon });
      castRollRef.current = result;
      castDiceResult(result);
      resultTimer = setTimeout(proceed, LOCAL_DICE_RESULT_MS);
      diceSkipRef.current = () => {
        if (resultTimer) clearTimeout(resultTimer);
        proceed();
      };
    };
    const rollTimer = setTimeout(showResult, LOCAL_DICE_ROLL_MS);
    diceSkipRef.current = () => {
      clearTimeout(rollTimer);
      showResult();
    };

    function proceed() {
      if (proceeded) return;
      proceeded = true;
      diceSkipRef.current = null;
      {
        setDiceOverlay(null);
        setIsDiceRolling(false);

        const before = playersRef.current;
        const move = applyDiceRoll(before, actorIndex, result, boardSize);
        lastMoveDeltaRef.current += move.moveDelta;

        // L'état saute à la position finale ; l'affichage avance case par case.
        if (commitPlayers(move.players, { actorIndex })) return;
        const hopMs = hopDurationMs(before, move.players);

        // Générer un effet aléatoire
        const caseType = generateCase(gameDifficultyRef.current, t);

        // Appliquer l'effet une fois le pion arrivé sur sa case
        setTimeout(() => {
          applyEffectToCurrentPlayer(caseType, move.to);
        }, hopMs);
      }
    }
  };

  const applyEffectToCurrentPlayer = (caseType: Case, currentPosition: number) => {
    const currentPlayers = playersRef.current;
    const player = currentPlayers[currentPlayerRef.current];
    
    if (winnerRef.current) return;
    if (!player) {
      setIsProcessingTurn(false);
      return;
    }

    markCastLanding(currentPosition);
    setPendingCase(caseType);
    setPendingPosition(currentPosition);

    if (isReplayableCase(caseType)) commitLastCase(caseType);

    const opponentsOnCase = currentPlayers.filter(
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
          title: t('game.effects.protection'),
          description: t('game.effects.protectionDesc'),
          remainingTurns: getProtectionRemainingRounds(player),
          player,
          accentClass: 'border-chip-blue/60 bg-chip-blue/30',
        })
      }
      if (player.cursed > 0) {
        items.push({
          id: `curse-${player.id}`,
          title: t('game.effects.curse'),
          description: t('game.effects.curseDesc'),
          remainingTurns: player.cursed,
          player,
          accentClass: 'border-suit-red/50 bg-suit-red/[0.15]',
        })
      }
      if (player.linkedTo && player.linkedTurns > 0) {
        const linked = players.find(p => p.id === player.linkedTo)
        items.push({
          id: `link-${player.id}`,
          title: t('game.effects.chain'),
          description: t('game.effects.chainDesc'),
          remainingTurns: player.linkedTurns,
          player,
          linkedPlayer: linked,
          accentClass: 'border-gold/50 bg-gold/[0.12]',
        })
      }
      if (player.skipNextTurn) {
        items.push({
          id: `skip-${player.id}`,
          title: t('game.effects.skipTurn'),
          description: t('game.effects.skipTurnDesc'),
          remainingTurns: 1,
          player,
          accentClass: 'border-gold/20 bg-black/20',
        })
      }
      if (player.anchored) {
        items.push({
          id: `anchor-${player.id}`,
          title: t('game.effects.anchor'),
          description: t('game.effects.anchorDesc'),
          remainingTurns: 1,
          player,
          accentClass: 'border-chip-blue/60 bg-chip-blue/30',
        })
      }
      if (player.mirrorDrinkTargetId && (player.mirrorDrinkTurns ?? 0) > 0) {
        const mirrorTarget = players.find(p => p.id === player.mirrorDrinkTargetId)
        items.push({
          id: `mirror-${player.id}`,
          title: t('game.effects.mirror'),
          description: mirrorTarget
            ? t('game.effects.mirrorDescOneWay', { a: player.name, b: mirrorTarget.name })
            : t('game.effects.mirrorDescShortOneWay'),
          remainingTurns: player.mirrorDrinkTurns ?? 1,
          player,
          linkedPlayer: mirrorTarget,
          accentClass: 'border-suit-red/50 bg-suit-red/[0.15]',
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
    const lines = collectActiveEffects().map(e => {
      if (e.id.startsWith('link-')) {
        const linked = players.find(p => p.id === e.player.linkedTo)
        if (linked) {
          return `${formatPlayerNameHtml(e.player)} → ${formatPlayerNameHtml(linked)} · ${e.title} (${t('game.turnsRemaining', { count: e.player.linkedTurns })})`
        }
      }
      if (e.id.startsWith('prot-')) {
        return tWithHtml(t, 'game.effects.protectedStatus', { player: formatPlayerNameHtml(e.player) })
      }
      if (e.id.startsWith('curse-')) {
        return tWithHtml(t, 'game.effects.cursedStatus', { player: formatPlayerNameHtml(e.player) }, { count: e.player.cursed })
      }
      // Miroir inversé, passe-tour, ancre : jamais affichés comme une malédiction.
      const linked = e.linkedPlayer ? ` → ${formatPlayerNameHtml(e.linkedPlayer)}` : ''
      return `${formatPlayerNameHtml(e.player)}${linked} · ${e.title}`
    })
    return buildEffectsSummaryHtml(t, lines)
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

  // Carte TV : le contenu de la fenêtre « Effet de la case » pendant qu'elle est ouverte.
  const castNotificationOpen = showNotification && Boolean(caseNotification)
  const castNotificationMain = castNotificationOpen ? getCaseEffectMainHtml(activeNotificationHtml) : ''
  const castNotificationOutcome = caseNotification?.outcome
  const castCaseText =
    castNotificationOpen &&
    caseNotification &&
    (castNotificationOutcome?.type === 'caseBase' ||
      (castNotificationOutcome?.type === 'compose' && castNotificationOutcome.items.some(i => i.type === 'caseBase')))
      ? formatCaseDescription(caseNotification.case, t)
      : null
  // Calculée au rendu : la carte part dans le même envoi que les gorgées et effets qu'elle annonce.
  const castLiveReveal: PetitBuveurCastReveal | null =
    castNotificationOpen && caseNotification
      ? {
          ...localRevealContent({
            caseType: caseNotification.case.type,
            mainHtml: castNotificationMain,
            caseText: castCaseText,
            landing: castLandingRef.current,
            players,
            targetId: caseNotification.targetPlayerId ?? null,
            verdictPending: Boolean(pendingChallenge),
          }),
          seq: castNotificationSeq,
        }
      : null
  const castLiveRevealJson = castLiveReveal ? JSON.stringify(castLiveReveal) : null
  useEffect(() => {
    if (!castLiveRevealJson) return
    // Même carte (re-rendu, ou fenêtre rouverte à l'identique) : garder l'objet évite un rendu de plus du jeu.
    setCastLastReveal(prev =>
      prev && JSON.stringify(prev) === castLiveRevealJson ? prev : (JSON.parse(castLiveRevealJson) as PetitBuveurCastReveal)
    )
  }, [castLiveRevealJson])

  /** Tour fini sans fenêtre d'effet (Chance : avancer de 2) : la TV reprend l'« Action précédente ». */
  const castLastAction = (caseType: CaseType, outcome: EffectOutcome) => {
    const content = localRevealContent({
      caseType,
      mainHtml: resolveOutcomeHtml(outcome, notificationCtx),
      caseText: null,
      landing: castLandingRef.current,
      players: playersRef.current,
      targetId: null,
      verdictPending: false,
    })
    setCastLastReveal({ ...content, seq: nextCastSeq() })
  }

  function showCaseNotification(state: CaseNotificationState) {
    nextHandledRef.current = false
    setCastNotificationSeq(nextCastSeq())
    const replay = replayViaRef.current
    replayViaRef.current = null
    // La case annoncée est celle rejouée : la roue des gorgées, elle, se notifie en « gorgée » ou « normale ».
    if (replay) {
      state = {
        ...state,
        outcome: outcomeCompose(
          outcomeReplayedCase(getCaseTypeLabel(replay.via, t), getCaseTypeLabel(replay.replayed, t)),
          state.outcome
        ),
      }
    }
    setCaseNotification(state)
    setShowNotification(true)
    setShowNextButton(true)
  }

  function showCaseOutcome(
    caseData: Case,
    outcome: EffectOutcome,
    opts?: Partial<CaseNotificationState>
  ) {
    // La note reste en état jusqu'au passage de tour (le rendu en a besoin) ; seule
    // la première notification qui suit le duel la préfixe.
    const duelPrefix = duelNoteUnshownRef.current
    duelNoteUnshownRef.current = false
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
      const actor = playersRef.current[currentPlayerRef.current]
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
      turnNumber: turnCountRef.current,
      actorId: actor.id,
      caseType,
      outcome,
      targetId: target && target.id !== actor.id ? target.id : null,
      ...opts,
    })
  }

  const commitLastActionFromCurrentTurn = () => {
    const actor = playersRef.current[currentPlayerRef.current]
    if (!actor || !caseNotification) return

    setLastActionHistory({
      turnNumber: turnCountRef.current,
      actorId: actor.id,
      caseType: caseNotification.case.type,
      outcome: caseNotification.outcome,
      targetId: caseNotification.targetPlayerId ?? lastTargetIdRef.current,
      duelPrefix: caseNotification.duelPrefix,
      includeEffectsSummary: caseNotification.includeEffectsSummary,
    })
  }

  const applyNoTargetCaseFlow = (caseType: Case) => {
    const actorIndex = currentPlayerRef.current
    const { players: updated, outcome, drinks } = resolveNoTargetCase(caseType, playersRef.current, {
      boardSize,
      actorIndex,
      lastMoveDelta: lastMoveDeltaRef.current,
      lastCase: lastCaseRef.current,
    }, t, formatPlayer)
    recordDrinkStats(drinks)
    if (commitPlayers(updated, { actorIndex })) return
    const actor = updated[actorIndex]
    if (actor) {
      recordLastAction(actor, caseType.type, outcome, null)
    }
    showCaseResultNotification(caseType, outcome, null)
  }

  const applyTeleportChoice = (which: 'leader' | 'last') => {
    setShowTeleportDialog(false)
    const list = playersRef.current
    const actorIndex = currentPlayerRef.current
    const actor = list[actorIndex]
    if (!actor || !pendingCase) return
    const swap = resolveTeleport(list, actorIndex, which, t)
    if (commitPlayers(swap.players, { actorIndex })) return
    const partner = swap.partnerId ? swap.players.find(p => p.id === swap.partnerId) ?? null : null
    recordLastAction(actor, 'teleport', swap.outcome, partner)
    showCaseResultNotification(pendingCase, swap.outcome, partner)
    setPendingCase(null)
    setPendingPosition(null)
  }

  const applyVoteTarget = (votedId: string) => {
    setShowVoteDialog(false)
    const list = playersRef.current
    const actor = list[currentPlayerRef.current]
    const voted = list.find(p => p.id === votedId)
    if (!actor || !voted || !pendingCase) return
    const drinks = pendingCase.effect || 3
    const updated = clonePlayers(list)
    if (addPlayerDrinks(votedId, drinks, updated, { sourceId: actor.id })) {
      const voteOutcome = outcomeProtectedTarget(t, voted.id)
      recordLastAction(actor, 'vote', voteOutcome, voted)
      showCaseResultNotification(pendingCase, voteOutcome, voted)
      setPendingCase(null)
      setPendingPosition(null)
      return
    }
    commitPlayers(updated)
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
    const actorIndex = currentPlayerRef.current
    const actor = playersRef.current[actorIndex]
    if (r == null || !actor || !pendingCase) return

    const updated = clonePlayers(playersRef.current)
    const p = updated[actorIndex]
    if (!p) return

    const cannotBack = r === 6 && p.position === 0
    if (r > 2 && r <= 4) {
      addPlayerDrinks(p.id, 2, updated, { sourceId: p.id })
    } else if (r === 5) {
      p.position = clampBoardPosition(p.position + 1, boardSize)
    } else if (r === 6 && !cannotBack) {
      p.position -= 1
    }

    clearDeHonteRollInterval()
    setDeHonteRolling(false)
    setDeHonteResult(null)
    setShowDeHonteDialog(false)
    if (commitPlayers(updated, { actorIndex })) return
    let deHonteKey = 'shameDice.outcomeBack'
    if (r <= 2) deHonteKey = 'shameDice.outcomeSafe'
    else if (r <= 4) deHonteKey = 'shameDice.outcomeDrink'
    else if (r === 5) deHonteKey = 'shameDice.outcomeAdvance'
    const deHonteOutcome = cannotBack
      ? outcomeCannotRecul(p.id)
      : outcomeI18n(deHonteKey, { params: { roll: r }, playerRefs: { player: p.id } })
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

    const list = playersRef.current
    const actor = list[currentPlayerRef.current]
    const target = targetId ? list.find(p => p.id === targetId) : null
    if (!actor || !target || !pendingCase || !choice || !flip) return

    const wins = choice === flip
    const drinks = pendingCase.effect || 2
    const updated = clonePlayers(list)
    const tp = updated.find(p => p.id === target.id)
    if (!tp) return

    let pileFaceOutcome: EffectOutcome
    if (wins) {
      pileFaceOutcome = outcomeI18n('game.outcomes.pileFaceWin', {
        playerRefs: { player: tp.id },
        params: { choice: t(`coinFlip.${choice}`), result: t(`coinFlip.${flip}`) },
      })
    } else if (addPlayerDrinks(tp.id, drinks, updated, { sourceId: actor.id })) {
      pileFaceOutcome = outcomeProtectedTarget(t, tp.id)
    } else {
      pileFaceOutcome = outcomeI18n('game.outcomes.pileFaceLose', {
        playerRefs: { player: tp.id },
        params: { result: t(`coinFlip.${flip}`), count: drinks },
      })
    }
    commitPlayers(updated)
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
    if (isNoTargetCase(caseType.type)) {
      applyNoTargetCaseFlow(caseType)
      return
    }
    if (caseType.type === 'repetition' || caseType.type === 'rewind') {
      startReplay(caseType.type)
      return
    }
    if (caseType.type === 'chance') {
      setShowChanceDialog(true)
      return
    }
    if (caseType.type === 'echange') {
      setShowExchangeDialog(true)
      return
    }
    if (caseType.type === 'defi-chaine') {
      setShowChainDialog(true)
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
      const cases = drawSimpleCases(() =>
        generateCase(gameDifficultyRef.current, t, NON_SIMPLE_CASE_TYPES)
      )
      doubleCasesRef.current = cases
      // Comme en ligne : la dernière case effective est la seconde case tirée.
      commitLastCase(cases[cases.length - 1])
      if (cases.some(c => caseNeedsTarget(c.type))) {
        proceedToTargetSelection(caseType)
        return
      }
      applyDoubleCaseFlow(null)
      return
    }
    proceedToTargetSelection(caseType)
  }

  /** Règle 10 : rejoue la dernière case effective, ciblée ou d'office selon cette case. */
  const startReplay = (via: 'repetition' | 'rewind') => {
    const replayed = lastCaseRef.current
    if (!isReplayableCase(replayed)) {
      showCaseOutcome({ type: via, effect: 0 }, outcomeI18n('game.outcomes.replayNothing'))
      return
    }
    replayViaRef.current = { via, replayed: replayed.type }
    setPendingCase(replayed)
    continueCaseFlow(replayed)
  }

  const applyContext = (): ApplyContext => ({
    actorIndex: currentPlayerRef.current,
    boardSize,
    turnDiceTotal: lastMoveDeltaRef.current,
    t,
  })

  /** Écrit le résultat d'une case puis l'annonce (rien à annoncer si elle donne la victoire). */
  const commitCaseResult = (caseData: Case, result: ApplyResult, targetId: string | null) => {
    recordDrinkStats(result.drinks)
    if (result.mirrorLinked) freshLinksRef.current.mirror = true
    if (commitPlayers(result.players, { actorIndex: currentPlayerRef.current })) return
    showCaseOutcome(caseData, result.outcome, { targetPlayerId: targetId })
  }

  const applyDoubleCaseFlow = (targetId: string | null) => {
    const cases = doubleCasesRef.current
    doubleCasesRef.current = []
    if (cases.length === 0) return
    if (targetId) lastTargetIdRef.current = targetId
    const result = applyDoubleCase(cases, playersRef.current, targetId, applyContext())
    commitCaseResult({ type: 'double-case', effect: 0 }, result, targetId)
    setPendingCase(null)
    setPendingPosition(null)
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
    const duel = applyDuelResult(playersRef.current, challengerId, opponentId, challengerWins)
    commitPlayers(duel.players)
    return duel
  }

  const buildDuelOutcomeNote = (
    challengerWins: boolean,
    challenger: GamePlayer,
    opponent: GamePlayer,
    loserProtected: boolean
  ) => {
    if (loserProtected) {
      const [winnerName, loserName] = challengerWins
        ? [challenger.name, opponent.name]
        : [opponent.name, challenger.name]
      return t('game.outcomes.duelLoserProtected', { winner: winnerName, loser: loserName })
    }
    if (challengerWins) {
      return t('game.outcomes.duelChallengerWins', { challenger: challenger.name, opponent: opponent.name })
    }
    return t('game.outcomes.duelOpponentWins', { challenger: challenger.name, opponent: opponent.name })
  }

  const finishDuelAndTarget = () => {
    const caseToResolve = pendingCase
    const opponentId = duelOpponentId
    const challenger = playersRef.current[currentPlayerRef.current]
    const opponent = opponentId ? playersRef.current.find(p => p.id === opponentId) : null
    const challengerWins = duelWheelResult?.value === 1

    let duelNote: string | undefined
    if (duelWheelResult && challenger && opponent) {
      const duel = applyDuelOutcome(challenger.id, opponent.id, challengerWins)
      duelNote = buildDuelOutcomeNote(challengerWins, challenger, opponent, duel.loserProtected)
    }

    resetDuelState()

    if (duelNote) {
      duelNoteUnshownRef.current = true
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
    doubleCasesRef.current = []
    setPendingCase(null)
    setPendingPosition(null)
    setPendingDuelNote(undefined)
    duelNoteUnshownRef.current = false
    setCaseNotification(null)
    setPendingChallenge(null)
  }

  const openChallengeResolution = (targetPlayer: GamePlayer, caseToApply: Case) => {
    lastTargetIdRef.current = targetPlayer.id
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
      duelPrefix: duelNoteUnshownRef.current,
      includeEffectsSummary: true,
    })
    duelNoteUnshownRef.current = false
  }

  const resolveChallengeChoice = (completed: boolean) => {
    if (!pendingChallenge || !caseNotification) return

    const { targetId, drinks } = pendingChallenge
    const actor = playersRef.current[currentPlayerRef.current]
    if (!completed && playersRef.current.some(p => p.id === targetId)) {
      const updated = clonePlayers(playersRef.current)
      addPlayerDrinks(targetId, drinks, updated, { sourceId: actor?.id })
      commitPlayers(updated)
    }
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

  /** Seul passage de tour, idempotent : un second appel dans le même tour est ignoré. */
  const endTurn = () => {
    if (turnEndedRef.current || winnerRef.current) return
    turnEndedRef.current = true
    const { nextPlayer, nextTurnCount, updatedPlayers } = buildTurnEndState(
      playersRef.current,
      currentPlayerRef.current,
      turnCountRef.current
    )
    turnInProgressRef.current = false
    commitCurrentPlayer(nextPlayer)
    if (nextTurnCount !== turnCountRef.current) commitTurnCount(nextTurnCount)
    commitPlayers(updatedPlayers)
  }

  const advanceToNextPlayer = () => {
    clearTurnBlockingUi()
    endTurn()
    setIsProcessingTurn(false)
    setIsDiceRolling(false)
  }

  // Fonction pour gérer le clic sur le bouton "{t('game.next')}"
  const handleNextButtonClick = () => {
    if (pendingChallenge || nextHandledRef.current) return
    nextHandledRef.current = true
    commitLastActionFromCurrentTurn()
    advanceToNextPlayer()
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
    const targetPlayer = playersRef.current.find(p => p.id === targetId);
    if (!targetPlayer) {
      setIsProcessingTurn(false);
      return;
    }

    if (pendingCase.type === 'pile-face') {
      setPileFaceTargetId(targetId)
      setShowPileFaceDialog(true)
      return
    }

    if (pendingCase.type === 'double-case') {
      applyDoubleCaseFlow(targetId)
      return
    }

    applyEffectToPlayer(targetId);
  };

  const applyEffectToPlayer = (targetPlayerId: string) => {
    lastTargetIdRef.current = targetPlayerId

    const caseToApply = pendingCase;
    if (!caseToApply || pendingPosition === null) {
      setIsProcessingTurn(false);
      return;
    }

    const list = playersRef.current
    const actor = list[currentPlayerRef.current]
    const targetPlayer = list.find(p => p.id === targetPlayerId);
    if (!actor || !targetPlayer) {
      setIsProcessingTurn(false);
      return;
    }

    if (caseToApply.type === 'defi' || caseToApply.type === 'question') {
      if (isShielded(targetPlayer, actor.id)) {
        showCaseOutcome(caseToApply, outcomeProtectedTarget(t, targetPlayerId), { targetPlayerId })
        return
      }
      openChallengeResolution(targetPlayer, caseToApply)
      return
    }

    commitCaseResult(
      caseToApply,
      applyTargetedCase(caseToApply, list, targetPlayerId, applyContext()),
      targetPlayerId
    )
  };

  const selectRandomPlayer = () => {
    const eligiblePlayers = [...playersRef.current];
    if (eligiblePlayers.length > 0) {
      const chosen = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
      handleTargetSelection(chosen.id);
    } else {
      handleTargetSelection(playersRef.current[currentPlayerRef.current].id);
    }
  };

  const resetTurnRefs = () => {
    winnerRef.current = null
    turnInProgressRef.current = false
    turnEndedRef.current = false
    nextHandledRef.current = false
    duelNoteUnshownRef.current = false
    lastMoveDeltaRef.current = 0
    doubleCasesRef.current = []
    replayViaRef.current = null
    freshLinksRef.current = { mirror: false, chain: false }
    skippedTurnRef.current = false
  }

  const startGame = () => {

    if (playersRef.current.length >= 2) {
      const resetPlayers = resetPlayersForNewGame(playersRef.current)

      resetTurnRefs()
      resetCastTurn()

      // Initialiser tous les états du jeu
      commitGameStarted(true);
      commitCurrentPlayer(0);
      setWinner(null);
      commitTurnCount(1);
      commitLastCase(null);
      snapBoard();
      commitPlayers(resetPlayers);
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
    } else {
      alert(t('game.notEnoughPlayers'));
    }
  }

  // « Rejouer » : la table et la difficulté de la partie jouée (une partie reprise
  // ne correspond pas forcément aux props du prélobby).
  const resetGame = () => {
    resetTurnRefs()
    resetCastTurn()
    clearTurnBlockingUi()
    lastTargetIdRef.current = null
    commitCurrentPlayer(0);
    commitTurnCount(1);
    commitLastCase(null);
    commitGameStarted(true);
    snapBoard();
    commitPlayers(resetPlayersForNewGame(playersRef.current));
    setWinner(null);
    setShowVictoryScreen(false);
    setCaseNotification(null);
    setIsProcessingTurn(false);
    setIsDiceRolling(false);
    setSelectedPosition(null);
    setShowNotification(false);
    setTargetPlayerId(null);
    setShowTargetDialog(false);
    setLastActionHistory(null);
    setPendingCase(null);
    setPendingPosition(null);
  };

  const getPlayerRanking = () => rankByShownPosition(players, shownPositions)
  const shownCaseNumber = (player: GamePlayer) => shownPosition(player, shownPositions) + 1

  const renderRankBadge = (index: number, size: 'sm' | 'md' = 'md') =>
    index < 3 ? (
      <MedalDot
        position={index + 1}
        className={cn('shrink-0', size === 'md' && 'h-6 w-6 text-xs')}
      />
    ) : (
      <span
        className={cn(
          'inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md border border-gold/20 bg-black/25 text-xs font-bold tabular-nums text-cream/80',
          size === 'sm' ? 'px-1' : 'px-1.5'
        )}
      >
        {index + 1}
      </span>
    )

  /** Rang du joueur dans la table : couleur de son pion, la même que sur la TV. */
  const playerIndexOf = (id: string) => Math.max(0, players.findIndex(p => p.id === id))
  const renderPawn = (
    player: GamePlayer,
    size: number,
    opts?: { active?: boolean; className?: string; children?: ReactNode }
  ) => (
    <PbPawn
      icon={player.preferences?.icon ? <PlayerAvatarGlyph value={player.preferences.icon} /> : initialOf(player.name)}
      colorIndex={playerIndexOf(player.id)}
      size={size}
      active={opts?.active}
      className={opts?.className}
    >
      {opts?.children}
    </PbPawn>
  )

  /** Cible des dialogues « Qui cibler ? » et défi en chaîne : une ligne de 56 px (pion, nom, case). */
  const renderTargetTile = (player: GamePlayer, onPick: () => void) => (
    <button
      key={player.id}
      type="button"
      onClick={onPick}
      className="flex h-14 w-full items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 text-left text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {renderPawn(player, 28)}
      <PlayerName player={player} className="min-w-0 flex-1 truncate text-[15px] font-semibold" />
      <span className="shrink-0 rounded-full border border-gold/20 bg-black/25 px-2 py-0.5 text-xs font-medium text-cream/80">
        {t('game.caseLabel', { number: player.position + 1 })}
      </span>
    </button>
  )

  const renderPlayerChip = (player: GamePlayer) => (
    <div className="flex min-w-0 items-center gap-1.5">
      {renderPawn(player, 20)}
      <PlayerName player={player} className="max-w-[7rem] truncate text-sm font-semibold text-cream sm:max-w-[9rem]" />
    </div>
  )

  const renderActiveEffectCard = (effect: ActiveEffectItem) => {
    const kind = pbEffectKindOf(effect.id)
    return (
      <div
        key={effect.id}
        className={cn('rounded-xl border p-3', kind ? PB_EFFECT_STYLE[kind].chip : effect.accentClass)}
      >
        <div className="flex items-start gap-3">
          {kind && <PbEffectIcon kind={kind} className="mt-0.5 h-6 w-6" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="font-display text-base font-bold text-cream">{effect.title}</span>
              <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
                {t('game.effects.turnsLeft', { count: effect.remainingTurns })}
              </span>
            </div>
            {effect.linkedPlayer ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {renderPlayerChip(effect.player)}
                <span className="shrink-0 text-base font-bold text-gold" aria-hidden="true">→</span>
                {renderPlayerChip(effect.linkedPlayer)}
              </div>
            ) : (
              <div className="mt-1.5">{renderPlayerChip(effect.player)}</div>
            )}
            <p className="mt-1.5 text-sm leading-snug text-cream/70">{effect.description}</p>
          </div>
        </div>
      </div>
    )
  }

  /**
   * Effets en cours sous le plateau : une rangée de pastilles (pion, icône,
   * tours restants) qui ouvre le détail. Les cartes de 110 px par effet
   * repoussaient le plateau hors de l'écran dès qu'un effet était actif.
   */
  const renderEffectsRow = (effects: ActiveEffectItem[]) => {
    if (effects.length === 0) return null
    return (
      <button
        type="button"
        onClick={() => setShowEffectsSheet(true)}
        aria-haspopup="dialog"
        className="flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-left transition-colors hover:bg-felt-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-gold" />
        <span className="sr-only">{t('game.effects.activeTitle')} :</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {effects.map(effect => {
            const kind = pbEffectKindOf(effect.id)
            return (
              <span
                key={effect.id}
                className={cn(
                  'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pl-1.5 pr-2 text-sm font-semibold text-cream',
                  kind ? PB_EFFECT_STYLE[kind].chip : effect.accentClass
                )}
              >
                {renderPawn(effect.player, 18)}
                {kind && <PbEffectIcon kind={kind} className="h-4 w-4" />}
                <span className="truncate">{effect.player.name}</span>
                <span className="sr-only">
                  {effect.title} · {t('game.effects.turnsLeft', { count: effect.remainingTurns })}
                </span>
                <span aria-hidden className="rounded-full bg-black/30 px-1.5 text-xs tabular-nums">
                  {effect.remainingTurns}
                </span>
              </span>
            )
          })}
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
      </button>
    )
  }

  /** Action précédente, sous le plateau : une ligne, le détail se déplie. */
  const renderLastActionHistory = () => {
    if (!lastActionHistory) return null
    const { actorId, targetId, caseType, turnNumber } = lastActionHistory
    const actor = players.find(p => p.id === actorId)
    const target = targetId ? players.find(p => p.id === targetId) : null
    if (!actor) return null
    const caseLabel = getCaseTypeLabel(caseType, t)
    const effectHtml = buildLastActionHtml(lastActionHistory, notificationCtx)

    return (
      <details className="group rounded-2xl border border-gold/20 bg-felt-deep/70">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2.5 rounded-2xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
          <History aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          <CaseToken caseType={caseType} size={24} />
          <span className="min-w-0 flex-1 text-sm leading-snug text-cream">
            <span className="sr-only">{t('game.history.title')} · </span>
            <span className="text-cream/70">{t('game.turn', { count: turnNumber })} · </span>
            <PlayerName player={actor} className="font-semibold" />
            <span className="text-cream/70"> · </span>
            <span className="font-semibold text-gold">{caseLabel}</span>
            {target && (
              <>
                <span className="text-cream/70"> → </span>
                <PlayerName player={target} className="font-semibold" />
              </>
            )}
          </span>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-cream/70 transition-transform group-open:rotate-180" />
        </summary>
        <div
          className="border-t border-gold/20 px-3 pb-3 pt-2 text-[13px] leading-snug text-cream/80 [&_.player-name-special]:align-baseline [&_strong]:text-cream"
          dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(effectHtml) }}
        />
      </details>
    )
  }

  const handleChainPlayerSelect = (targetPlayerId: string) => {
    setShowChainDialog(false)
    const list = playersRef.current
    const currentPlayerObj = list[currentPlayerRef.current]
    const targetPlayerObj = list.find(p => p.id === targetPlayerId)
    if (!currentPlayerObj || !targetPlayerObj) return

    const chainTurns = pendingCase?.effect || 5
    if (targetPlayerObj.id === currentPlayerObj.id) return
    lastTargetIdRef.current = targetPlayerObj.id

    if (isShielded(targetPlayerObj, currentPlayerObj.id)) {
      const blocked = outcomeProtectedTarget(t, targetPlayerObj.id)
      showCaseNotification({
        case: { type: 'defi-chaine', effect: chainTurns },
        outcome: blocked,
        targetPlayerId: targetPlayerObj.id,
        includeEffectsSummary: false,
      })
      recordLastAction(currentPlayerObj, 'defi-chaine', blocked, targetPlayerObj)
      return
    }

    const updatedPlayers = list.map(p =>
      p.id === currentPlayerObj.id
        ? { ...p, linkedTo: targetPlayerObj.id, linkedTurns: chainTurns }
        : { ...p }
    )

    freshLinksRef.current.chain = true
    commitPlayers(updatedPlayers)
    const chainOutcome = outcomeChainLinked(currentPlayerObj.id, targetPlayerObj.id, chainTurns)
    showCaseNotification({
      case: { type: 'defi-chaine', effect: chainTurns },
      outcome: chainOutcome,
      targetPlayerId: targetPlayerObj.id,
      includeEffectsSummary: false,
    })
    recordLastAction(currentPlayerObj, 'defi-chaine', chainOutcome, targetPlayerObj)
  }

  const renderBoardPawn = (player: GamePlayer, onCase: number) => {
    const isActive = player.id === players[currentPlayer]?.id
    return (
      <motion.span
        key={player.id}
        layoutId={`pb-token-${player.id}`}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className={cn('relative flex items-center justify-center', isActive ? 'z-10' : 'z-0')}
      >
        {renderPawn(player, pbPawnSize(onCase), {
          active: isActive,
          children: (
            <FloatingDrinkBadge placement="above" deltas={drinkDeltas.filter(d => d.playerId === player.id)} />
          ),
        })}
      </motion.span>
    )
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
      try {
        await audioCtxRef.current.resume()
      } catch {
        // Reprise refusée (le navigateur exige un geste) : le son reviendra au prochain tap.
      }
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
    // Une Chance rejouée par Répétition : la nouvelle case n'est pas « rejouée ».
    replayViaRef.current = null

    performDiceRoll();
  };

  const applyWheelOutcome = (result: WheelSegment) => {
    if (wheelOutcomeAppliedRef.current) return
    wheelOutcomeAppliedRef.current = true

    const actorIndex = currentPlayerRef.current
    const currentPlayerObj = playersRef.current[actorIndex]
    if (!currentPlayerObj) return

    lastTargetIdRef.current = currentPlayerObj.id

    const playerRefs = { player: currentPlayerObj.id }
    const notifyOpts = { targetPlayerId: currentPlayerObj.id }

    if (wheelMode === 'defis') {
      const kind = result.kind ?? 'challenge'
      const wheelCase: Case = { type: 'roue-defis', effect: DEFI_WHEEL_DRINKS }
      const label = outcomeI18n('game.outcomes.wheelDefi', { params: { label: result.label } })
      if (kind === 'drink') {
        const updated = clonePlayers(playersRef.current)
        addPlayerDrinks(currentPlayerObj.id, DEFI_WHEEL_DRINKS, updated, { sourceId: currentPlayerObj.id })
        commitPlayers(updated)
        showCaseOutcome(wheelCase, outcomeCompose(label, outcomeDrinks(currentPlayerObj.id, DEFI_WHEEL_DRINKS)), notifyOpts)
      } else if (kind === 'safe') {
        showCaseOutcome(
          wheelCase,
          outcomeCompose(label, outcomeI18n('game.outcomes.wheelSafePlayer', { playerRefs })),
          notifyOpts
        )
      } else {
        showCaseOutcome(
          wheelCase,
          outcomeCompose(label, outcomeI18n('game.outcomes.wheelDefiOrDrink', { playerRefs })),
          notifyOpts
        )
        setPendingChallenge({
          targetId: currentPlayerObj.id,
          drinks: DEFI_WHEEL_DRINKS,
          case: toStoredCase(wheelCase),
        })
      }
    } else if (result.value > 0) {
      const updated = clonePlayers(playersRef.current)
      addPlayerDrinks(currentPlayerObj.id, result.value, updated, { sourceId: currentPlayerObj.id })
      commitPlayers(updated)
      showCaseOutcome(
        { type: 'gorgée', effect: result.value },
        outcomeCompose(
          outcomeI18n('game.outcomes.wheelResult', { params: { label: result.label } }),
          outcomeI18n('game.outcomes.wheelDrink', { playerRefs })
        ),
        notifyOpts
      )
    } else {
      showCaseOutcome(
        { type: 'normal', effect: 0 },
        outcomeCompose(
          outcomeI18n('game.outcomes.wheelResult', { params: { label: result.label } }),
          outcomeI18n('game.outcomes.wheelSafePlayer', { playerRefs })
        ),
        notifyOpts
      )
    }

    setPendingCase(null)
    setPendingPosition(null)
  }

  const finishWheelModal = () => {
    if (wheelResult) {
      applyWheelOutcome(wheelResult)
    }
    setShowWheel(false)
  }

  /** Issue du duel telle que sa fenêtre l'annonce, une fois la roue arrêtée. */
  const duelResultLine = (): string | null => {
    const challenger = players[currentPlayer]
    const opponent = players.find(p => p.id === duelOpponentId)
    if (!duelWheelResult || !challenger || !opponent) return null
    const challengerWins = duelWheelResult.value === 1
    const [duelWinner, duelLoser] = challengerWins
      ? [challenger, opponent]
      : [opponent, challenger]
    const names = { winner: duelWinner.name, loser: duelLoser.name }
    if (isPlayerProtected(duelLoser)) return t('game.duel.loserProtected', names)
    return challengerWins
      ? t('game.duel.winnerStays', names)
      : t('game.duel.opponentWins', names)
  }

  // Fenêtre ouverte avant l'effet, telle que la TV doit la montrer : le choix
  // de cible et le duel sans la case ; un tirage, son résultat une fois arrêté.
  const castStage: PetitBuveurCastStage | null = showDuelDialog && duelBoardPosition != null
    ? {
        kind: 'duel',
        caseNumber: duelBoardPosition + 1,
        opponentId: duelPhase === 'wheel' ? duelOpponentId : null,
        rolling: duelWheelSpinning,
        result: duelResultLine(),
      }
    : showTargetDialog
      ? { kind: 'target' }
      : showWheel
        ? {
            kind: 'case',
            caseType: wheelMode === 'defis' ? 'roue-defis' : 'roue',
            rolling: wheelSpinning,
            result: wheelResult ? t('game.resultLabel', { outcome: wheelResult.label }) : null,
          }
        : showDeHonteDialog
          ? {
              kind: 'case',
              caseType: 'de-honte',
              rolling: deHonteRolling,
              die: deHonteResult != null && !deHonteRolling ? deHonteResult : null,
              result:
                deHonteResult != null && !deHonteRolling
                  ? t('game.resultLabel', { outcome: getDeHonteOutcomeLabel(deHonteResult, t) })
                  : null,
            }
          : showPileFaceDialog
            ? {
                kind: 'case',
                caseType: 'pile-face',
                targetId: pileFaceTargetId,
                rolling: pileFaceFlipping,
                result:
                  !pileFaceFlipping && pileFaceFlipResult && pileFaceChoice
                    ? getPileFaceOutcomeLabel(pileFaceChoice, pileFaceFlipResult, t).label
                    : null,
              }
            : showChanceDialog
              ? { kind: 'case', caseType: 'chance' }
              : showExchangeDialog
                ? { kind: 'case', caseType: 'echange' }
                : showChainDialog
                  ? { kind: 'case', caseType: 'defi-chaine', effect: pendingCase?.effect || 5 }
                  : showTeleportDialog
                    ? { kind: 'case', caseType: 'teleport' }
                    : showVoteDialog
                      ? { kind: 'case', caseType: 'vote', effect: pendingCase?.effect ?? 3 }
                      : null
  const buildCastPayload = () => JSON.stringify(
    buildLocalCastState({
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        drinks: p.drinks,
        icon: p.preferences?.icon,
      })),
      currentPlayer,
      winnerId: winner?.id ?? null,
      dice: castDice,
      reveal: castLiveReveal ?? castLastReveal,
      ambiance,
      turnCount,
      difficulty: gameDifficulty,
      effects: collectActiveEffects()
        .map(castEffectOf)
        .filter((e): e is PetitBuveurCastEffect => e !== null),
      stage: castStage,
      snapKey: boardSnapKey,
    })
  )
  // Sans diffusion, rien à construire ni à sérialiser à chaque rendu.
  const castPayload = castActive ? buildCastPayload() : ''
  // Tour par tour → push à chaque changement de ce que l'écran montre.
  useEffect(() => {
    if (castActive) pushCast(castPayload)
  }, [castActive, castPayload, pushCast])
  const toggleCast = () => {
    if (castActive) void stopCast()
    else void startCast(buildCastPayload())
  }

  if (!gameStarted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-cream/70">
        <p className="text-sm text-cream/70">{t('game.loading')}</p>
      </div>
    )
  }

  const highlights = boardHighlights(players, currentPlayer, shownPositions)

  const getBoardCaseBaseClass = (index: number) => {
    if (index === 0) return 'pb-board-case pb-board-start'
    if (index === boardSize - 1) return 'pb-board-case pb-board-finish'
    return 'pb-board-case'
  }

  const currentGamePlayer = players[currentPlayer]
  const activeEffects = collectActiveEffects()
  const diffKey = resolveDifficulty(gameDifficulty)
  const headerButtonClass = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'
  // Le nom du joueur dans le bouton : un seul téléphone circule, c'était
  // souvent le mauvais joueur qui lançait.
  const rollLabel = isDiceRolling
    ? t('game.rolling')
    : hasBlockingDialog() || (showNotification && caseNotification)
      ? t('game.actionInProgress')
      : currentGamePlayer
        ? t('game.rollDiceFor', { name: currentGamePlayer.name })
        : t('game.rollDice')

  // Barre du pouce, gardée pendant les fenêtres (elles la recouvrent) : la
  // retirer faisait sauter le plateau. À l'écran de fin, le dock la remplace.
  const actionBar = winner ? undefined : (
    <>
      {currentGamePlayer && (
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold/60 bg-gold/[0.15]"
        >
          {renderPawn(currentGamePlayer, 30)}
        </span>
      )}
      <Button
        type="button"
        variant="primary"
        size="gameLg"
        onClick={rollDice}
        disabled={!canRollDice()}
        className="min-w-0 flex-1 touch-manipulation select-none gap-2"
      >
        <span className="truncate">{rollLabel}</span>
        <Dice6 aria-hidden className={cn('h-5 w-5 shrink-0', isDiceRolling && 'motion-safe:animate-spin')} />
      </Button>
    </>
  )

  return (
    <>
      {/* Enveloppe rendue inerte quand une fenêtre maison est ouverte (les
          fenêtres vivent hors d'elle) : sinon Tab atteint « ← » sous le voile. */}
      <div ref={shellRef} className="flex min-h-0 w-full flex-1 flex-col">
        <GameShell
          title={t('game.title')}
          headerSubtitle={
            <>
              {t('game.turn', { count: turnCount })} ·{' '}
              <PbDifficultyIcon difficulty={diffKey} className="inline h-3.5 w-3.5 align-[-2px] text-gold" />{' '}
              {t(`difficultyLabels.${diffKey}`)}
            </>
          }
          onBack={onGameEnd}
          maxWidth={768}
          contentClassName="gap-3 px-0 pt-3 sm:px-4"
          headerRight={
            <>
              <Button
                type="button"
                variant="ghost"
                size="gameIcon"
                onClick={toggleMuted}
                aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
                className={headerButtonClass}
              >
                {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="gameIcon"
                onClick={toggleCast}
                aria-pressed={castActive}
                aria-label={tTv('castToTv')}
                className={cn(
                  headerButtonClass,
                  castActive && 'border-gold/60 bg-gold/[0.15] text-gold hover:bg-gold/20'
                )}
              >
                <Tv aria-hidden className="h-5 w-5" />
              </Button>
            </>
          }
          actionBar={actionBar}
        >
          {castActive && castCode && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-center text-sm text-cream">
              <Tv aria-hidden className="h-4 w-4 shrink-0 text-gold" /> {tTv('castHint')}{' '}
              <span className="font-mono text-base font-black tracking-widest text-gold">{castCode}</span>
            </div>
          )}

          {/* Plateau EN TÊTE : le pion qui marche reste sous les yeux (rien au-dessus
              ne le repousse sous le pli, même avec des effets en cours). */}
          <div className="pb-board">
            <div className="pb-board-grid grid grid-cols-6 gap-1.5 sm:gap-2.5">
              {Array.from({ length: boardSize }).map((_, index) => {
                const playersOnCase = players.filter(p => shownPosition(p, shownPositions) === index)
                const isStart = index === 0
                const isFinish = index === boardSize - 1

                return (
                  <div
                    key={index}
                    ref={el => {
                      boardCellRefs.current[index] = el
                    }}
                    className={cn(
                      'relative flex aspect-square min-h-[2.75rem] scroll-mb-28 scroll-mt-32 items-center justify-center rounded-lg sm:min-h-[3.25rem] sm:rounded-xl',
                      getBoardCaseBaseClass(index),
                      boardHighlightClass(index, highlights)
                    )}
                  >
                    {!isFinish && (
                      <span
                        className={cn(
                          'pb-board-case-num absolute left-0.5 top-0.5 z-[3] font-semibold sm:left-1 sm:top-1',
                          isStart && 'text-xs text-emerald-300'
                        )}
                      >
                        {isStart ? <Flag aria-hidden className="h-3 w-3" /> : index + 1}
                      </span>
                    )}
                    {isFinish && playersOnCase.length === 0 && (
                      <Trophy aria-hidden className="pb-board-finish-icon h-7 w-7 text-gold sm:h-9 sm:w-9" />
                    )}
                    {isFinish && playersOnCase.length > 0 && (
                      <Trophy aria-hidden className="pb-board-finish-icon absolute right-0.5 top-0.5 z-[3] h-4 w-4 text-gold" />
                    )}
                    {playersOnCase.length > 0 && (
                      <div
                        className={cn(
                          'pb-board-players absolute inset-0 grid place-content-center place-items-center gap-0.5 p-1',
                          pbPawnColumns(playersOnCase.length)
                        )}
                      >
                        {playersOnCase.map(player => renderBoardPawn(player, playersOnCase.length))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Case actuelle — carte flip teintée par la famille de case */}
          {caseNotification && !showNotification && !showTargetDialog && !showDuelDialog && !showWheel && !showChanceDialog && !showExchangeDialog && !showChainDialog && !showTeleportDialog && !showVoteDialog && !showDeHonteDialog && !showPileFaceDialog && (
            <CaseRevealCard
              caseType={caseNotification.case.type}
              label={getCaseTypeLabel(caseNotification.case.type, t)}
              revealKey={`${turnCount}:${caseNotification.case.type}:${pendingPosition ?? ''}`}
              headerExtra={
                <span className="text-sm font-semibold text-cream/80">
                  {t('game.caseLabel', { number: currentGamePlayer?.position != null ? currentGamePlayer.position + 1 : '—' })}
                </span>
              }
            >
              <div
                className="mt-2 max-h-28 overflow-y-auto text-sm leading-relaxed text-cream/90 [&_strong]:text-gold"
                dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
              />
            </CaseRevealCard>
          )}

          {!showNotification && renderEffectsRow(activeEffects)}

          {renderLastActionHistory()}

          {/* Classement — défilement horizontal */}
          <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <Trophy aria-hidden className="h-4 w-4 text-gold" />
              <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.ranking')}</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto p-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {getPlayerRanking().map((player, index) => {
                const isActive = currentGamePlayer?.id === player.id
                const rankBorder =
                  index === 0
                    ? 'border-gold/50 bg-gold/10'
                    : index === 1
                      ? 'border-cream/30 bg-black/20'
                      : index === 2
                        ? 'border-[#D3A275]/40 bg-[#8C5F35]/20'
                        : 'border-gold/20 bg-black/20'
                return (
                  <div
                    key={player.id}
                    className={cn(
                      'relative flex w-[9rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[10rem] sm:p-2.5',
                      isActive
                        ? 'border-gold/60 bg-gold/[0.15] shadow-[inset_0_0_0_1px_rgb(var(--gold-rgb)/0.35)]'
                        : rankBorder
                    )}
                  >
                    {renderRankBadge(index)}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        {renderPawn(player, 18)}
                        <PlayerName player={player} className="min-w-0 truncate text-sm font-semibold text-cream" />
                      </div>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-cream/80">
                        {t('game.caseLabel', { number: shownCaseNumber(player) })}
                        <DrinkGlyph aria-hidden className="h-3.5 w-3.5" /> <PulsingCount value={player.drinks} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </GameShell>
      </div>

      {/* Détail des effets en cours */}
      <Dialog open={showEffectsSheet && activeEffects.length > 0} onOpenChange={setShowEffectsSheet}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={allowEscapeClose}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        >
          <PbDialogClose label={tCommon('close')} />
          <DialogHeader>
            <DialogTitle className="flex min-h-[44px] items-center gap-2 pr-12 font-display text-cream">
              <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {t('game.effects.activeTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">{activeEffects.map(effect => renderActiveEffectCard(effect))}</div>
        </DialogContent>
      </Dialog>

      {/* Mise en scène du lancer de dé + « Passe le téléphone à… » au changement de joueur */}
      <DiceOverlay
        state={diceOverlay}
        onSkip={() => diceSkipRef.current?.()}
        skipLabel={t('game.tapToSkip')}
      />
      <PassPhoneOverlay
        playerKey={!diceOverlay ? currentGamePlayer?.id ?? null : null}
        name={currentGamePlayer?.name ?? ''}
        avatar={currentGamePlayer ? renderPawn(currentGamePlayer, 64) : undefined}
        enabled={gameStarted && !winner}
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('duel')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/30">
                    <Swords className="h-6 w-6 text-gold" />
                  </div>
                  <h2 id={dialogTitleId('duel')} className="font-display text-lg font-bold text-cream">{t('game.duel.title')}</h2>
                  <p className="mt-1 text-sm text-cream/70">
                    {t('game.caseLabel', { number: duelBoardPosition + 1 })} ·{' '}
                    <PlayerName player={players[currentPlayer]} className="font-semibold text-gold" />
                  </p>
                  <p className="mt-2 max-w-[18rem] text-sm text-cream/70">
                    {t('game.duel.rules')}
                  </p>
                </div>

                {duelPhase === 'pick' && (
                  <>
                    <p className="mt-4 text-center text-sm text-cream/70">
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
                            className="flex flex-col items-center gap-2 rounded-xl border border-gold/20 bg-black/20 p-3 text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                          >
                            {renderPawn(player, 40)}
                            <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="quiet"
                      size="game"
                      onClick={skipDuelAndTarget}
                      className="mt-5 w-full"
                    >
                      {t('game.duel.skip')}
                    </Button>
                  </>
                )}

                {duelPhase === 'wheel' && duelOpponentId && (
                  <div className="mt-4 flex flex-col items-center gap-5">
                    {/* Chaque joueur a SA couleur sur la roue (or / bleu jeton) et son
                        initiale sur ses secteurs : le vert contre rouge à 1,5:1 ne
                        disait pas qui gagnait, et se confondait chez un daltonien. */}
                    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-sm">
                      {renderSlots(translateWithSlots(t, 'game.duel.vs', ['a', 'b']), {
                        a: (
                          <span className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 font-semibold text-[#24201A]">
                            <span aria-hidden className="font-display font-bold">{initialOf(players[currentPlayer]?.name)}</span>
                            <span className="truncate">{players[currentPlayer]?.name}</span>
                          </span>
                        ),
                        b: (
                          <span className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full bg-chip-blue px-2.5 py-1 font-semibold text-cream">
                            <span aria-hidden className="font-display font-bold">{initialOf(players.find(p => p.id === duelOpponentId)?.name)}</span>
                            <span className="truncate">{players.find(p => p.id === duelOpponentId)?.name}</span>
                          </span>
                        ),
                      })}
                    </p>

                    <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 drop-shadow">
                        <svg width="28" height="28" viewBox="0 0 28 28">
                          <polygon points="14,0 24,16 4,16" fill="rgb(var(--suit-red-rgb))" />
                          <rect x="12.5" y="16" width="3" height="8" rx="1.5" fill="rgb(var(--suit-red-rgb))" />
                        </svg>
                      </div>
                      <motion.div
                        className="absolute inset-0 overflow-visible rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-2 ring-gold/40"
                        style={{ originX: 0.5, originY: 0.5, rotate: duelWheelRotation }}
                      >
                        <svg viewBox="0 0 200 200" width="100%" height="100%">
                          <circle cx="100" cy="100" r="98" fill="rgb(var(--felt-deep-rgb))" />
                          {duelWheelSegments.map((seg, i) => {
                            const anglePerSegment = 360 / Math.max(duelWheelSegments.length, 1)
                            const start = -90 + i * anglePerSegment
                            const end = start + anglePerSegment
                            const mid = start + anglePerSegment / 2
                            const path = arcPath(100, 100, 95, start, end)
                            const label = polar(100, 100, 68, mid)
                            const challengerSide = seg.value === 1
                            return (
                              <g key={seg.id}>
                                <path
                                  d={path}
                                  style={{ fill: challengerSide ? 'rgb(var(--gold-rgb))' : 'rgb(var(--chip-blue-rgb))' }}
                                />
                                <path
                                  d={`M 100 100 L ${polar(100, 100, 95, start).x} ${polar(100, 100, 95, start).y}`}
                                  style={{ stroke: 'rgb(var(--felt-deep-rgb))' }}
                                  strokeWidth={1.2}
                                />
                                <text
                                  x={label.x}
                                  y={label.y}
                                  transform={`rotate(${mid + 90} ${label.x} ${label.y})`}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  className="font-display"
                                  style={{ fill: challengerSide ? INK : CREAM, fontSize: 20, fontWeight: 700 }}
                                >
                                  {initialOf(
                                    challengerSide
                                      ? players[currentPlayer]?.name
                                      : players.find(p => p.id === duelOpponentId)?.name
                                  )}
                                </text>
                              </g>
                            )
                          })}
                          <circle cx="100" cy="100" r="10" fill="rgb(var(--cream-rgb))" />
                          <circle cx="100" cy="100" r="4" fill="rgb(var(--felt-deep-rgb))" />
                        </svg>
                      </motion.div>
                    </div>

                    {!duelWheelResult && (
                      <Button
                        variant="primary"
                        size="gameLg"
                        disabled={duelWheelSpinning}
                        onClick={spinDuelWheel}
                        className="mx-auto w-full max-w-xs"
                      >
                        {duelWheelSpinning ? t('game.duel.spinning') : t('game.duel.spin')}
                      </Button>
                    )}

                    {duelWheelResult && (
                      <div className="w-full rounded-xl border border-gold/40 bg-gold/[0.12] px-4 py-4 text-center">
                        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.duel.result')}</p>
                        <p className="mt-2 text-base font-semibold text-cream">
                          {duelResultLine()}
                        </p>
                        <Button
                          variant="primary"
                          size="gameLg"
                          onClick={finishDuelAndTarget}
                          className="mt-4 w-full max-w-xs"
                        >
                          {t('game.duel.applyCase')}
                        </Button>
                      </div>
                    )}

                    {!duelWheelResult && !duelWheelSpinning && (
                      <Button type="button" variant="quiet" size="game" onClick={() => setDuelPhase('pick')} className="w-full max-w-xs">
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

      {/* Sélection du joueur à cibler — feuille du bas qui tient dans l'écran :
          en-tête d'une ligne, cibles qui défilent, Aléatoire / Moi collés en
          bas. Sans max-h ni défilement, le titre et la consigne partaient
          au-dessus du viewport dès 4 joueurs. */}
      <AnimatePresence>
      {showTargetDialog && (
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('target')}
              aria-describedby={dialogTitleId('target-hint')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="shrink-0 border-b border-gold/20 px-4 pb-3 pt-4">
                <div className="flex items-center gap-2.5">
                  <Target aria-hidden className="h-6 w-6 shrink-0 text-gold" />
                  <h2 id={dialogTitleId('target')} className="font-display text-lg font-bold text-cream">{t('game.target.title')}</h2>
                </div>
                <p id={dialogTitleId('target-hint')} className="mt-1 text-sm text-cream/70">
                  {t('game.target.hint')}
                </p>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain px-4 py-3 min-[400px]:grid-cols-2">
                {players
                  .filter(p => p.id !== players[currentPlayer].id)
                  .map(player => renderTargetTile(player, () => handleTargetSelection(player.id)))}
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-gold/20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
                <Button type="button" variant="quiet" size="game" onClick={selectRandomPlayer} className="min-w-0 gap-2">
                  <Shuffle aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  <span className="truncate">{t('game.target.random')}</span>
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  size="game"
                  onClick={() => handleTargetSelection(players[currentPlayer].id)}
                  className="min-w-0 gap-2"
                >
                  <User aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  <span className="flex min-w-0 items-center gap-1 truncate">
                    {t('game.target.me')}
                    <PlayerName player={players[currentPlayer]} className="truncate font-semibold" />
                  </span>
                </Button>
              </div>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      <Dialog open={showTeleportDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-cream">{t('game.dialogs.teleport')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-cream/70">
            {t('game.dialogs.teleportPrompt')}
          </p>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button variant="primary" size="game" onClick={() => applyTeleportChoice('leader')} className="w-full whitespace-normal leading-tight">
              {t('game.dialogs.teleportLeader', { name: getLeader(players).name })}
            </Button>
            <Button variant="quiet" size="game" onClick={() => applyTeleportChoice('last')} className="w-full whitespace-normal leading-tight">
              {t('game.dialogs.teleportLast', { name: getLastPlayer(players).name })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVoteDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-cream">{t('game.dialogs.vote')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-cream/70">
            {t('game.dialogs.votePrompt', { count: pendingCase?.effect ?? 3 })}
          </p>
          <div className="grid grid-cols-2 gap-2 py-2">
            {players.map(player => (
              <Button
                key={player.id}
                variant="quiet"
                size="game"
                onClick={() => applyVoteTarget(player.id)}
                className="min-w-0 justify-start gap-2 px-3"
              >
                {renderPawn(player, 22)}
                <PlayerName player={player} className="truncate" />
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
            <DialogTitle className="font-display text-cream">{t('game.dialogs.shameDice')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-cream/70">
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
                className="w-full rounded-xl border border-gold/40 bg-gold/[0.12] px-4 py-3 text-center"
              >
                <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  {t('game.resultHeading')}
                </p>
                <p className="mt-1 font-display text-3xl font-bold tabular-nums text-gold">{deHonteResult}</p>
                <p className="mt-1 text-sm font-medium text-cream">
                  {getDeHonteOutcomeLabel(deHonteResult, t)}
                </p>
              </motion.div>
            )}
          </div>

          {deHonteResult != null && !deHonteRolling ? (
            <Button
              variant="primary"
              size="gameLg"
              onClick={applyDeHonteOutcome}
              className="w-full"
            >
              {t('game.continue')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="gameLg"
              onClick={rollDeHonte}
              disabled={deHonteRolling}
              className="w-full"
            >
              {deHonteRolling ? (
                <span className="flex items-center justify-center gap-2">
                  <Dice6 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
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
            <DialogTitle className="font-display text-cream">{t('game.dialogs.coinFlip')}</DialogTitle>
          </DialogHeader>

          {pileFaceTargetId && (() => {
            const pileFaceTarget = players.find(p => p.id === pileFaceTargetId)
            if (!pileFaceTarget) return null
            return (
              <p className="text-center text-sm text-cream/70">
                <PlayerName player={pileFaceTarget} className="font-semibold text-gold" />
                {' '}{t('game.dialogs.coinChooses')}
              </p>
            )
          })()}

          {!pileFaceChoice ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <Button
                variant="quiet"
                onClick={() => startPileFaceFlip('pile')}
                className="h-auto flex-col gap-1 rounded-2xl py-4 text-base"
              >
                <span aria-hidden className="font-display text-2xl font-bold text-gold">1</span>
                {t('coinFlip.pile')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => startPileFaceFlip('face')}
                className="h-auto flex-col gap-1 rounded-2xl py-4 text-base"
              >
                <Crown aria-hidden className="h-7 w-7 text-gold" />
                {t('coinFlip.face')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-cream/80">
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
                      ? 'border-emerald-400/40 bg-emerald-600/20'
                      : 'border-suit-red/50 bg-suit-red/[0.15]'
                  }`}
                >
                  <p className="text-sm font-bold text-cream">
                    {getPileFaceOutcomeLabel(pileFaceChoice, pileFaceFlipResult, t).label}
                  </p>
                  {pileFaceChoice !== pileFaceFlipResult && (
                    <p className="mt-1 text-sm text-cream/80">
                      {t('game.dialogs.drinksToTake', { count: pendingCase?.effect || 2 })}
                    </p>
                  )}
                </motion.div>
              )}

              {!pileFaceFlipping && pileFaceFlipResult ? (
                <Button
                  variant="primary"
                  size="gameLg"
                  onClick={applyPileFaceOutcome}
                  className="w-full"
                >
                  {t('game.continue')}
                  <ArrowRight aria-hidden className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <p className="text-center text-sm text-cream/80 motion-safe:animate-pulse">
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
            <DialogTitle className="font-display text-cream">{t('game.dialogs.chance')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-cream/70">
              {t('game.dialogs.chancePrompt')}
            </p>
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="primary"
                size="game"
                onClick={() => {
                  setShowChanceDialog(false);
                  // Relancer le dé avec la fonction spéciale
                  rerollDice();
                }}
                className="w-full"
              >
                {t('game.dialogs.chanceReroll')}
              </Button>
              <Button 
                onClick={() => {
                  setShowChanceDialog(false);
                  // Avancer de 2 cases
                  const actorIndex = currentPlayerRef.current;
                  const currentPlayerObj = playersRef.current[actorIndex];
                  if (currentPlayerObj) {
                    const newPosition = clampBoardPosition(currentPlayerObj.position + 2, boardSize);
                    const updatedPlayers = playersRef.current.map((p, idx) =>
                      idx === actorIndex ? { ...p, position: newPosition } : { ...p }
                    );
                    if (commitPlayers(updatedPlayers, { actorIndex })) return;

                    const chanceOutcome = outcomeI18n('game.outcomes.chanceAdvance', {
                      playerRefs: { player: currentPlayerObj.id },
                      params: { case: newPosition + 1 },
                    })
                    recordLastAction(currentPlayerObj, 'chance', chanceOutcome, null)
                    castLastAction('chance', chanceOutcome)
                    advanceToNextPlayer()
                  }
                }}
                variant="quiet"
                size="game"
                className="w-full"
              >
                {t('game.dialogs.chanceAdvance')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Défi en chaîne — sélection du partenaire (même feuille que « Qui cibler ? ») */}
      <AnimatePresence>
        {showChainDialog && (
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('chain')}
              aria-describedby={dialogTitleId('chain-hint')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="shrink-0 border-b border-gold/20 px-4 pb-3 pt-4">
                <div className="flex items-center gap-2.5">
                  <Link2 aria-hidden className="h-6 w-6 shrink-0 text-gold" />
                  <h2 id={dialogTitleId('chain')} className="font-display text-lg font-bold text-cream">{t('game.dialogs.chainTitle')}</h2>
                </div>
                <p id={dialogTitleId('chain-hint')} className="mt-1 text-sm text-cream/70">
                  {t('game.dialogs.chainPrompt', { count: pendingCase?.effect || 5 })}
                </p>
                <p className="mt-1 text-sm text-gold">
                  {renderSlots(translateWithSlots(t, 'game.dialogs.chainChooser', ['player']), {
                    player: <PlayerName player={players[currentPlayer]} className="font-semibold" />,
                  })}
                </p>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 min-[400px]:grid-cols-2">
                {players
                  .filter(p => p.id !== players[currentPlayer].id)
                  .map(player => renderTargetTile(player, () => handleChainPlayerSelect(player.id)))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog pour la case Échange */}
      <Dialog open={showExchangeDialog} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-cream">{t('game.dialogs.exchange')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-cream/70">
              {t('game.dialogs.exchangePrompt')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.filter(p => p.id !== players[currentPlayer].id).map(player => (
                <Button
                  key={player.id}
                  onClick={() => {
                    setShowExchangeDialog(false);
                    const list = playersRef.current;
                    const actorIndex = currentPlayerRef.current;
                    const currentPlayerObj = list[actorIndex];
                    const targetPlayerObj = list.find(p => p.id === player.id);
                    if (!currentPlayerObj || !targetPlayerObj) return;
                    const swap = resolveExchange(list, actorIndex, targetPlayerObj.id, t);
                    if (!swap.partnerId) return;
                    if (commitPlayers(swap.players, { actorIndex })) return;
                    const exchangeOutcome = swap.outcome
                    lastTargetIdRef.current = targetPlayerObj.id
                    showCaseNotification({
                      case: { type: 'echange', effect: 0 },
                      outcome: exchangeOutcome,
                      targetPlayerId: targetPlayerObj.id,
                      includeEffectsSummary: false,
                    })
                    recordLastAction(currentPlayerObj, 'echange', exchangeOutcome, targetPlayerObj)
                  }}
                  variant="quiet"
                  size="game"
                  className="min-w-0 justify-start gap-2 px-3"
                >
                  {renderPawn(player, 22)}
                  <PlayerName player={player} className="truncate" />
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Roue des gorgées / des défis */}
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('wheel')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <CircleDot aria-hidden className="h-6 w-6 shrink-0 text-gold" />
                  <div className="min-w-0">
                    <h2 id={dialogTitleId('wheel')} className="font-display text-lg font-bold text-cream">
                      {wheelMode === 'defis' ? t('game.wheel.defis') : t('game.wheel.drinks')}
                    </h2>
                    <p className="text-sm text-cream/70">
                      {t('game.wheel.turnOf', { player: players[currentPlayer]?.name ?? '' })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-5">
                  <div className="relative h-60 w-60 sm:h-64 sm:w-64">
                    {/* Flèche fixe (pointeur résultat) */}
                    <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 drop-shadow">
                      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
                        <polygon points="14,0 24,16 4,16" style={{ fill: 'rgb(var(--cream-rgb))' }} />
                        <rect x="12.5" y="16" width="3" height="8" rx="1.5" style={{ fill: 'rgb(var(--cream-rgb))' }} />
                      </svg>
                    </div>

                    {/* Roue animée : chaque secteur porte sa valeur (gorgées, SAFE ou numéro du défi). */}
                    <motion.div
                      className="absolute inset-0 overflow-visible rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-2 ring-gold/40"
                      style={{ originX: 0.5, originY: 0.5, rotate: wheelRotation }}
                      ref={wheelRef}
                    >
                      <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
                        <circle cx="100" cy="100" r="98" style={{ fill: 'rgb(var(--felt-deep-rgb))' }} />
                        {wheelSegments.map((seg, i) => {
                          const anglePerSegment = 360 / Math.max(wheelSegments.length, 1)
                          const start = -90 + i * anglePerSegment
                          const end = start + anglePerSegment
                          const mid = start + anglePerSegment / 2
                          const path = arcPath(100, 100, 95, start, end)
                          const tier = wheelMode === 'defis' ? defiTier(seg.kind, i) : wheelTier(seg.value)
                          const label = polar(100, 100, 72, mid)
                          const rotation = `rotate(${mid + 90} ${label.x} ${label.y})`
                          const isSafe = wheelMode === 'defis' ? seg.kind === 'safe' : seg.value === 0
                          return (
                            <g key={seg.id}>
                              <path d={path} style={{ fill: tier.fill }} />
                              <path
                                d={`M 100 100 L ${polar(100, 100, 95, start).x} ${polar(100, 100, 95, start).y}`}
                                style={{ stroke: 'rgb(var(--felt-deep-rgb))' }}
                                strokeWidth={1.2}
                              />
                              {isSafe && wheelMode === 'drinks' ? (
                                <g transform={rotation} style={{ color: tier.ink }}>
                                  <Shield x={label.x - 8} y={label.y - 8} width={16} height={16} strokeWidth={2.5} />
                                </g>
                              ) : (
                                <text
                                  x={label.x}
                                  y={label.y}
                                  transform={rotation}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  className="font-display"
                                  style={{ fill: tier.ink, fontSize: 15, fontWeight: 700 }}
                                >
                                  {wheelMode === 'defis' ? i + 1 : seg.value}
                                </text>
                              )}
                            </g>
                          )
                        })}
                        <circle cx="100" cy="100" r="12" style={{ fill: 'rgb(var(--cream-rgb))' }} />
                        <circle cx="100" cy="100" r="5" style={{ fill: 'rgb(var(--felt-deep-rgb))' }} />
                      </svg>
                    </motion.div>
                  </div>

                  {!wheelResult && (
                    <Button
                      variant="primary"
                      size="gameLg"
                      disabled={wheelSpinning}
                      onClick={spinWheel}
                      className="mx-auto w-full max-w-xs"
                    >
                      {wheelSpinning ? t('game.wheel.spinning') : t('game.wheel.spin')}
                    </Button>
                  )}

                  {wheelResult && (
                    <div className="w-full rounded-xl border border-gold/30 bg-gold/10 px-4 py-4 text-center">
                      <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.duel.result')}</p>
                      <p className="mt-1 font-display text-2xl font-bold text-gold">{wheelResult.label}</p>
                      <p className="mt-1 text-sm font-semibold text-cream">{players[currentPlayer]?.name}</p>
                      <Button
                        variant="primary"
                        size="gameLg"
                        onClick={finishWheelModal}
                        className="mt-4 w-full max-w-xs"
                      >
                        {t('game.continue')}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Roue des défis : un numéro par secteur, le défi en clair ici
                    (visible aussi pendant que la roue tourne). La roue des
                    gorgées écrit ses valeurs sur la roue, sans légende. */}
                {wheelMode === 'defis' && wheelSegments.length > 0 && (
                  <div className="mt-4 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
                    <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.wheel.legend')}</p>
                    <ol className="space-y-1 text-sm">
                      {wheelSegments.map((seg, i) => {
                        const tier = defiTier(seg.kind, i)
                        return (
                          <li key={seg.id} className="flex items-start gap-2">
                            <span
                              aria-hidden
                              className="mt-px inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded px-1 font-display text-xs font-bold tabular-nums"
                              style={{ backgroundColor: tier.fill, color: tier.ink }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-cream/80">{seg.label}</span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Écran de victoire — feuille ancrée en bas sur téléphone : un bandeau
          d'avis qui arrive tard la fait grandir vers le haut, sans recentrer
          la carte ni bouger « Rejouer », collé au bas de la carte. */}
      <AnimatePresence>
        {showVictoryScreen && winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            {/* z-[2] : le rideau reste au-dessus de la carte animée, comme avec react-confetti. */}
            <EndConfetti rain pieces={200} className="z-[2]" />
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { scale: 0.85, y: 30 }}
              animate={reducedMotion ? { opacity: 1 } : { scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${dialogTitleId('victory')} ${dialogTitleId('victory-name')}`}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-6 pb-4">
                {/* Trophée : deux rebonds, pas de boucle (réduire les animations les coupe) */}
                <div className="mb-4 flex flex-col items-center gap-3">
                  <motion.div
                    animate={reducedMotion ? undefined : { scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.5, repeat: 2, repeatDelay: 1.5 }}
                    className="flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/40 bg-gold/[0.15] text-gold"
                  >
                    <Trophy aria-hidden className="h-10 w-10" />
                  </motion.div>
                  <div className="text-center">
                    <p id={dialogTitleId('victory')} className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.victory.winner')}</p>
                    <h2 id={dialogTitleId('victory-name')} className="mt-1 font-display text-2xl font-bold">
                      <PlayerName player={winner} className="text-gold" />
                    </h2>
                    <p className="mt-0.5 text-sm text-cream/70">{t('game.victory.wonGame')}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-gold">{turnCount}</p>
                    <p className="text-xs text-cream/70">{t('game.victory.turns')}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-gold">{players.length}</p>
                    <p className="text-xs text-cream/70">{t('game.victory.players')}</p>
                  </div>
                  <div className="text-center">
                    <p className="flex items-center justify-center gap-1 font-display text-sm font-bold text-gold">
                      <PbDifficultyIcon difficulty={diffKey} className="h-4 w-4" />
                      {t(`difficultyLabels.${diffKey}`)}
                    </p>
                    <p className="mt-0.5 text-xs text-cream/70">{t('game.victory.difficulty')}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                  <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.finalRanking')}</p>
                  {getPlayerRanking().map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                        player.id === winner.id
                          ? 'border border-gold/60 bg-gold/[0.15]'
                          : 'border border-gold/20 bg-black/20'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {renderRankBadge(index, 'sm')}
                        {renderPawn(player, 22)}
                        <PlayerName player={player} className="truncate text-sm font-semibold text-cream" />
                      </div>
                      <div className="flex shrink-0 gap-3 text-xs text-cream/80">
                        <span>{player.drinks} {drinkIcon(ambiance)}</span>
                        <span>{t('game.caseLabel', { number: shownCaseNumber(player) })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <EndActionDock
                mode="sticky"
                className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
                feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="petit-buveur" />}
              >
                <Button variant="primary" size="gameLg" onClick={resetGame} className="w-full">
                  <RefreshCw aria-hidden className="mr-2 h-5 w-5" /> {t('game.replay')}
                </Button>
                <Button variant="quiet" size="game" onClick={onGameEnd} className="w-full">
                  <Home aria-hidden className="mr-2 h-4 w-4" /> {t('game.backToMenu')}
                </Button>
              </EndActionDock>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog de sauvegarde */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-cream">{t('game.dialogs.saveGame')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {hasActiveSave ? (
              <>
                <p className="text-center text-cream/70">
                  {t('game.save.prompt')}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      resumeGame();
                    }}
                    variant="primary"
                    size="game"
                    className="w-full"
                  >
                    <RefreshCw aria-hidden className="mr-2 h-4 w-4" />
                    {t('game.save.resume')}
                  </Button>
                  <Button
                    onClick={() => {
                      deleteSave();
                      setShowSaveDialog(false);
                    }}
                    variant="quiet"
                    size="game"
                    className="w-full"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    {t('game.save.newGame')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-cream/70">
                  {t('game.save.none')}
                </p>
                <Button
                  variant="primary"
                  size="game"
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

      {/* Effet de la case — feuille ancrée en bas : la case en titre, le verdict
          NOMMÉ (qui boit combien) en tête sur une carte crème, et « Suivant »
          dans un pied collé, jamais à défiler pour l'atteindre. */}
      <AnimatePresence>
        {showNotification && caseNotification && (() => {
          const caseType = caseNotification.case.type
          const landing = castLandingRef.current
          const changes = landing ? castChanges(landing.players, players) : []
          const drinkers = changes
            .filter(c => c.drinks > 0)
            .map(c => ({ change: c, player: players.find(p => p.id === c.playerId) }))
            .filter((d): d is { change: typeof d.change; player: GamePlayer } => Boolean(d.player))
          const movers = changes
            .filter(c => c.to !== c.from)
            .map(c => ({ change: c, player: players.find(p => p.id === c.playerId) }))
            .filter((d): d is { change: typeof d.change; player: GamePlayer } => Boolean(d.player))
          const caseNumber = landing?.caseNumber ?? (currentGamePlayer ? currentGamePlayer.position + 1 : null)
          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('effect')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                <div className="mb-4 flex items-center gap-3">
                  <motion.span
                    initial={reducedMotion ? false : { scale: 0, rotate: -25 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 15, delay: 0.05 }}
                    className="inline-flex"
                    aria-hidden
                  >
                    <CaseToken caseType={caseType} size={48} />
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <h2 id={dialogTitleId('effect')} className="font-display text-2xl font-bold leading-tight text-gold">
                      <span className="sr-only">{t('game.effectTitle')} : </span>
                      {getCaseTypeLabel(caseType, t)}
                    </h2>
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-cream/80">
                      {caseNumber != null && <span>{t('game.caseLabel', { number: caseNumber })}</span>}
                      {currentGamePlayer && (
                        <>
                          <span aria-hidden>·</span>
                          <PlayerName player={currentGamePlayer} className="font-semibold text-cream" />
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {drinkers.length > 0 && (
                  <div className="mb-3 rounded-2xl bg-cream p-4 text-[#24201A] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
                    {drinkers.length === 1 ? (
                      <div className="flex items-center gap-3">
                        {renderPawn(drinkers[0].player, 36)}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold">{drinkers[0].player.name}</p>
                          <p className="text-sm text-[#6B6455]">
                            {t('game.verdict.drinks', { count: drinkers[0].change.drinks })}
                          </p>
                        </div>
                        <span className="font-display text-5xl font-bold leading-none tabular-nums">
                          {drinkers[0].change.drinks}
                        </span>
                        <DrinkGlyph aria-hidden className="h-7 w-7 shrink-0" />
                      </div>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {drinkers.map(({ change, player }) => (
                          <li
                            key={player.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#24201A]/20 bg-[#24201A]/[0.06] py-1 pl-1 pr-2.5 text-sm font-bold"
                          >
                            {renderPawn(player, 20)}
                            <span className="truncate">{player.name}</span>
                            <span className="font-display text-lg leading-none tabular-nums">{change.drinks}</span>
                            <DrinkGlyph aria-hidden className="h-4 w-4 shrink-0" />
                            <span className="sr-only">{t('game.verdict.drinks', { count: change.drinks })}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {movers.length > 0 && (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {movers.map(({ change, player }) => (
                      <li
                        key={player.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-chip-blue/60 bg-chip-blue/30 py-1 pl-1 pr-2.5 text-sm font-semibold text-cream"
                      >
                        {renderPawn(player, 20)}
                        <span className="truncate">{player.name}</span>
                        <span aria-hidden>→</span>
                        <span className="whitespace-nowrap">{t('game.caseLabel', { number: change.to + 1 })}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rounded-xl border border-gold/20 bg-black/20 p-4 text-left">
                  <div
                    className="text-base leading-relaxed text-cream [&_span]:inline-flex [&_strong]:text-gold"
                    dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
                  />
                </div>

                {/* Les effets en cours restent sous le plateau : ici, une ligne suffit. */}
                {activeEffects.length > 0 && (
                  <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-cream/80">
                    <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                    <span className="font-semibold">{t('game.effects.activeTitle')}</span>
                    {activeEffects.map(effect => {
                      const kind = pbEffectKindOf(effect.id)
                      return (
                        <span key={effect.id} className="inline-flex items-center gap-1">
                          {kind && <PbEffectIcon kind={kind} className="h-4 w-4" />}
                          <span className="sr-only">{effect.title} :</span>
                          {effect.player.name}
                        </span>
                      )
                    })}
                  </p>
                )}
              </div>

              <div className="shrink-0 border-t border-gold/20 bg-felt-deep/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
                {pendingChallenge ? (
                  <>
                    <p className="mb-2 text-center text-sm font-semibold text-cream/80">
                      {t('game.challengeQuestion')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="gameLg"
                        onClick={() => resolveChallengeChoice(true)}
                        className="min-w-0 gap-2 whitespace-normal px-3 leading-tight"
                      >
                        <Check aria-hidden className="h-5 w-5 shrink-0" />
                        {t('game.challengeSuccess')}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="gameLg"
                        onClick={() => resolveChallengeChoice(false)}
                        className="min-w-0 gap-2 whitespace-normal px-3 leading-tight"
                      >
                        <DrinkGlyph aria-hidden className="h-5 w-5 shrink-0" />
                        {t('game.challengeDrink', { count: pendingChallenge.drinks })}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="gameLg"
                    onClick={handleNextButtonClick}
                    className="w-full gap-2"
                  >
                    {t('game.next')}
                    <ArrowRight aria-hidden className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
          )
        })()}
      </AnimatePresence>
    </>
  );
}
