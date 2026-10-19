"use client"

import { Fragment, useState, useEffect, useCallback, useId, useMemo, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { Dice6, Trophy, ArrowRight, RefreshCw, Home, Target, Link2, CircleDot, Sparkles, Swords, History, Shuffle, User, Check, Beer, Leaf, Volume2, VolumeX, Tv } from 'lucide-react'
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
import { TurnOverlay } from '@/components/petit-buveur/TurnOverlay'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { useDrinkDeltas, FloatingDrinkBadge, PulsingCount, drinkIcon } from '@/components/petit-buveur/drink-feedback'
import { useGameSounds } from '@/hooks/useGameSounds'
import { isSoundMuted } from '@/lib/sound/game-sounds'
import { CaseRevealCard } from '@/components/petit-buveur/CaseRevealCard'
import { getCaseMeta, getCaseFamilyStyle } from '@/lib/petit-buveur/case-families'

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

type WheelSegment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
  /** Roue des défis seulement. */
  kind?: DefiWheelSegmentKind
}

const DEFI_WHEEL_DRINKS = 2

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
  const [browserCapabilities, setBrowserCapabilities] = useState({
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
  const headerRef = useRef<HTMLElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const footerRef = useRef<HTMLElement | null>(null)
  const customModalOpen =
    showDuelDialog ||
    showTargetDialog ||
    showChainDialog ||
    showWheel ||
    (showVictoryScreen && Boolean(winner)) ||
    (showNotification && Boolean(caseNotification))
  useEffect(() => {
    for (const el of [headerRef.current, mainRef.current, footerRef.current]) {
      if (el) el.inert = customModalOpen
    }
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
          icon: '🛡️',
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
          icon: '👻',
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
          icon: '🔗',
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
          icon: '⏭️',
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
          icon: '⚓',
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
          icon: '🪞',
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
          return `🔗 ${formatPlayerNameHtml(e.player)} → ${formatPlayerNameHtml(linked)} (${t('game.turnsRemaining', { count: e.player.linkedTurns })})`
        }
      }
      if (e.id.startsWith('prot-')) {
        return `🛡️ ${tWithHtml(t, 'game.effects.protectedStatus', { player: formatPlayerNameHtml(e.player) })}`
      }
      if (e.id.startsWith('curse-')) {
        return `👻 ${tWithHtml(t, 'game.effects.cursedStatus', { player: formatPlayerNameHtml(e.player) }, { count: e.player.cursed })}`
      }
      // Miroir inversé, passe-tour, ancre : jamais affichés comme une malédiction.
      const linked = e.linkedPlayer ? ` → ${formatPlayerNameHtml(e.linkedPlayer)}` : ''
      return `${e.icon} ${formatPlayerNameHtml(e.player)}${linked} · ${e.title}`
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
          'inline-flex shrink-0 items-center justify-center rounded-md border border-gold/20 bg-black/25 font-bold tabular-nums text-cream/60',
          size === 'sm' ? 'h-5 min-w-[1.25rem] px-1 text-[10px]' : 'h-6 min-w-[1.5rem] px-1.5 text-xs'
        )}
      >
        {index + 1}
      </span>
    )

  /** Bandeau classement compact (réutilisé dans les modales de ciblage). */
  const renderCompactRanking = () => (
    <div className="rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
      <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
        {t('game.ranking')}
      </p>
      <ul className="space-y-1">
        {getPlayerRanking().map((player, index) => {
          const isActive = players[currentPlayer]?.id === player.id
          return (
            <li
              key={player.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                isActive ? 'bg-gold/[0.15]' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {renderRankBadge(index, 'sm')}
                <PlayerIcon player={player} size="sm" className="h-5 w-5 shrink-0 text-xs" />
                <PlayerName
                  player={player}
                  className={`truncate font-medium ${isActive ? 'text-gold' : 'text-cream'}`}
                />
              </span>
              <span className="shrink-0 text-[11px] text-cream/60">
                {t('game.caseLabel', { number: shownCaseNumber(player) })}
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
        <PlayerName player={player} className={`${textSize} max-w-[6rem] truncate font-semibold text-cream sm:max-w-[8rem]`} />
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
            <span className="font-display text-sm font-bold text-cream">{effect.title}</span>
            <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold">
              {t('game.effects.turnsLeft', { count: effect.remainingTurns })}
            </span>
          </div>
          {effect.linkedPlayer ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {renderPlayerChip(effect.player, 'md')}
              <span className="shrink-0 text-base font-bold text-gold" aria-hidden="true">→</span>
              {renderPlayerChip(effect.linkedPlayer, 'md')}
            </div>
          ) : (
            <div className="mt-1">{renderPlayerChip(effect.player)}</div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-cream/60">{effect.description}</p>
        </div>
      </div>
    </div>
  )

  const renderActiveEffectsSection = (className = '') => {
    const items = collectActiveEffects()
    if (items.length === 0) return null
    return (
      <div className={`rounded-2xl border border-gold/15 bg-felt-deep/70 p-4 ${className}`}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-gold" />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.effects.activeTitle')}</span>
          <span className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-0.5 font-display text-[11px] font-bold text-gold">
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
      <div className="mt-2 rounded-xl border border-gold/20 bg-black/20 px-3 py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <History className="h-3.5 w-3.5 shrink-0 text-gold/75" />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
            {t('game.history.title')}
          </span>
          <span className="text-[11px] text-cream/60">{t('game.turn', { count: turnNumber })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <PlayerName player={actor} className="font-semibold text-cream" />
          <span className="text-cream/50">·</span>
          <span className="font-medium text-gold">{caseLabel}</span>
          {target ? (
            <>
              <span className="text-cream/50">→</span>
              <PlayerName player={target} className="font-semibold text-cream" />
            </>
          ) : (
            <span className="text-[11px] text-cream/60">{t('game.history.selfTarget')}</span>
          )}
        </div>
        <div
          className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-cream/60 [&_.player-name-special]:align-baseline [&_strong]:text-cream"
          dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(effectHtml) }}
        />
      </div>
    )
  }

  const renderActiveEffectsChips = () => renderActiveEffectsSection('mt-3')

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
            isActive && 'scale-110 ring-2 ring-gold rounded-full'
          )}
        />
      </motion.div>
    )
  }

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
        <p className="text-sm text-cream/50">{t('game.loading')}</p>
      </div>
    )
  }

  const highlights = boardHighlights(players, currentPlayer, shownPositions)

  const getBoardCaseBaseClass = (index: number) => {
    if (index === 0) return 'pb-board-case pb-board-start'
    if (index === boardSize - 1) return 'pb-board-case pb-board-finish'
    return 'pb-board-case'
  }

  const showDiceActionBar = !hasBlockingDialog() && !(showNotification && caseNotification)

  return (
    /* grid-cols-[minmax(0,1fr)] : sans lui, le min-content d'une rangée (en-tête)
       étire la colonne implicite au-delà du viewport → débordement mobile. */
    <div className="relative grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-hidden bg-felt text-cream">
      {/* En-tête */}
      <header ref={headerRef} className="relative z-30 shrink-0 border-b border-gold/20 bg-felt-deep/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={onGameEnd}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-black/20 text-cream/70 transition-all hover:text-gold"
            aria-label={t('game.back')}
          >
            ←
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center font-display text-base font-bold text-gold sm:text-lg">
            {t('game.title')}
          </h1>
          <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold">
            {difficultyNames[gameDifficulty]}
          </span>
          <button
            onClick={toggleMuted}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-black/20 text-cream/70 transition-all hover:text-gold"
            aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleCast}
            aria-pressed={castActive}
            aria-label={tTv('castToTv')}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-all',
              castActive ? 'border-gold/60 bg-gold/[0.15] text-gold' : 'border-gold/20 bg-black/20 text-cream/70 hover:text-gold',
            )}
          >
            <Tv className="h-4 w-4 shrink-0" /> {tTv('castShort')}
          </button>
        </div>
        {castActive && castCode && (
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 border-t border-gold/20 bg-gold/10 px-4 py-1.5 text-center text-xs text-cream">
            <Tv className="h-3.5 w-3.5 shrink-0 text-gold" /> {tTv('castHint')}{' '}
            <span className="font-mono text-sm font-black tracking-widest text-gold">{castCode}</span>
          </div>
        )}
      </header>

      {/* Zone scrollable : plateau + classement uniquement (barre d'action en footer fixe) */}
      <main ref={mainRef} className="relative min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto flex w-full max-w-3xl flex-col space-y-3 px-3 py-3 pb-4 sm:px-4">
      {/* HUD tour + joueur actif */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-3">
        <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1 font-display text-xs font-bold text-gold">
          {t('game.turn', { count: turnCount })}
        </span>
        <div className="min-w-0 flex-1 text-center">
          <p className="mb-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.turnOf')}</p>
          <div className="truncate font-display font-bold text-cream">
            <PlayerName player={players[currentPlayer]} />
          </div>
        </div>
        <span className="shrink-0 font-display text-xs font-medium text-gold">
          {players[currentPlayer] ? shownCaseNumber(players[currentPlayer]) : '—'}/{boardSize}
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
            <span className="text-sm font-semibold text-cream/70">
              {t('game.caseLabel', { number: players[currentPlayer]?.position != null ? players[currentPlayer].position + 1 : '—' })}
            </span>
          }
        >
          <div
            className="mt-2 max-h-28 overflow-y-auto text-sm leading-relaxed text-cream/90 [&_strong]:text-gold"
            dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
          />
        </CaseRevealCard>
      )}

      {collectActiveEffects().length > 0 && !showNotification && renderActiveEffectsChips()}

      {/* Plateau */}
      <div className="pb-board">
        <div className="pb-board-grid grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: boardSize }).map((_, index) => {
          const playersOnCase = players.filter(p => shownPosition(p, shownPositions) === index)
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
                boardHighlightClass(index, highlights),
                isFinish && 'min-h-[3.25rem] sm:min-h-[4rem]'
              )}
            >
              {!isFinish && (
                <span className={cn(
                  'absolute left-0.5 top-0.5 z-[1] pb-board-case-num text-[11px] font-semibold sm:left-1 sm:top-1 sm:text-xs',
                  isStart ? 'text-emerald-400/70' : 'text-cream/75'
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
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-gold" />
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.ranking')}</h3>
        </div>
        <div className="flex gap-2 overflow-x-auto p-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {getPlayerRanking().map((player, index) => {
            const isActive = players[currentPlayer]?.id === player.id
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
                  'relative flex w-[8.5rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[9.5rem] sm:p-2.5',
                  isActive
                    ? 'border-gold/60 bg-gold/[0.15] shadow-[inset_0_0_0_1px_rgb(var(--gold-rgb)/0.35)]'
                    : rankBorder
                )}
              >
                <FloatingDrinkBadge deltas={drinkDeltas.filter((d) => d.playerId === player.id)} />
                {renderRankBadge(index)}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <PlayerIcon player={player} size="sm" className="h-6 w-6 shrink-0 text-sm" />
                    <PlayerName player={player} className="min-w-0 truncate text-xs font-semibold text-cream" />
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-cream/60">
                    {t('game.caseLabel', { number: shownCaseNumber(player) })}
                    <DrinkGlyph className="h-3 w-3" /> <PulsingCount value={player.drinks} />
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
          ref={footerRef}
          className="relative z-40 border-t border-gold/20 bg-felt-deep/90 px-3 py-3 backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
          aria-label={t('game.turnActions')}
        >
          <div className="mx-auto flex w-full max-w-lg items-stretch gap-2 sm:max-w-3xl sm:gap-3">
            {players[currentPlayer] && (
              <div
                className="flex shrink-0 flex-col justify-center gap-1.5 rounded-2xl border border-gold/60 bg-gold/[0.15] px-3 py-2.5 sm:px-4 sm:py-3"
                aria-label={`${t('game.turnOf')} ${players[currentPlayer].name}`}
              >
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 sm:text-xs">
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
                    className="max-w-[5.5rem] truncate font-display text-sm font-bold text-cream sm:max-w-[7.5rem] sm:text-base"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={rollDice}
              disabled={!canRollDice()}
              className="min-w-0 flex-1 touch-manipulation select-none rounded-2xl bg-amber-500 py-3.5 text-base font-bold text-black shadow-none transition-all hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
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
      <DiceOverlay
        state={diceOverlay}
        onSkip={() => diceSkipRef.current?.()}
        skipLabel={t('game.tapToSkip')}
      />
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
                  <p className="mt-2 max-w-[18rem] text-xs text-cream/60">
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
                            <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                            <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={skipDuelAndTarget}
                      className="mt-5 h-11 w-full rounded-2xl border border-gold/25 bg-black/20 font-semibold text-cream/80 shadow-none hover:bg-black/30 hover:text-cream"
                    >
                      {t('game.duel.skip')}
                    </Button>
                  </>
                )}

                {duelPhase === 'wheel' && duelOpponentId && (
                  <div className="mt-4 flex flex-col items-center gap-5">
                    <p className="text-center text-sm">
                      {renderSlots(translateWithSlots(t, 'game.duel.vs', ['a', 'b']), {
                        a: <PlayerName player={players[currentPlayer]} className="font-semibold text-gold" />,
                        b: (
                          <PlayerName
                            player={players.find(p => p.id === duelOpponentId)!}
                            className="font-semibold text-cream"
                          />
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
                            const path = arcPath(100, 100, 95, start, end)
                            return (
                              <g key={seg.id}>
                                <path d={path} fill={colorForDuelSegment(seg.value)} opacity={0.95} />
                                <path
                                  d={`M 100 100 L ${polar(100, 100, 95, start).x} ${polar(100, 100, 95, start).y}`}
                                  stroke="rgb(var(--felt-deep-rgb))"
                                  strokeWidth={1.2}
                                />
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
                        disabled={duelWheelSpinning}
                        onClick={spinDuelWheel}
                        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-500 py-4 text-base font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
                      >
                        {duelWheelSpinning ? t('game.duel.spinning') : t('game.duel.spin')}
                      </Button>
                    )}

                    {duelWheelResult && (
                      <div className="w-full rounded-xl border border-gold/40 bg-gold/[0.12] px-4 py-4 text-center">
                        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.duel.result')}</p>
                        <p className="mt-1 font-display text-2xl font-bold text-gold">{duelWheelResult.label}</p>
                        <p className="mt-2 text-sm text-cream/70">
                          {duelResultLine()}
                        </p>
                        <Button
                          onClick={finishDuelAndTarget}
                          className="mt-4 w-full max-w-xs rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
                        >
                          {t('game.duel.applyCase')}
                        </Button>
                      </div>
                    )}

                    {!duelWheelResult && !duelWheelSpinning && (
                      <Button type="button" variant="ghost" onClick={() => setDuelPhase('pick')} className="text-xs text-cream/70 hover:bg-black/20 hover:text-gold">
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('target')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="px-5 pb-5 pt-5">
                <div className="mb-5 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/30">
                    <Target className="h-6 w-6 text-gold" />
                  </div>
                  <h3 id={dialogTitleId('target')} className="font-display text-lg font-bold text-cream">{t('game.target.title')}</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-cream/70">
                    {t('game.target.hint')}
                  </p>
                  <div className="mt-3 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-gold/40 bg-gold/10 text-2xl text-gold">
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
                        className="flex flex-col items-center gap-2 rounded-xl border border-gold/20 bg-black/20 p-3 text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full border border-gold/20 bg-black/25 px-2 py-0.5 text-[10px] font-medium text-cream/70">
                          {t('game.caseLabel', { number: player.position + 1 })}
                        </span>
                      </button>
                    ))}
                </div>

                <div className="mt-5 space-y-2 border-t border-gold/20 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={selectRandomPlayer}
                    className="h-11 w-full gap-2 rounded-2xl border border-gold/25 bg-black/20 font-semibold text-cream/80 shadow-none hover:bg-black/30 hover:text-cream"
                  >
                    <Shuffle className="h-4 w-4 text-gold" />
                    {t('game.target.random')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleTargetSelection(players[currentPlayer].id)}
                    className="h-11 w-full gap-2 rounded-2xl border border-gold/30 bg-gold/10 text-cream shadow-none hover:bg-gold/20"
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
            <DialogTitle className="font-display text-cream">{t('game.dialogs.teleport')}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-cream/70">
            {t('game.dialogs.teleportPrompt')}
          </p>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button onClick={() => applyTeleportChoice('leader')} className="rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40">
              {t('game.dialogs.teleportLeader', { name: getLeader(players).name })}
            </Button>
            <Button onClick={() => applyTeleportChoice('last')} variant="secondary" className="rounded-2xl border border-gold/25 bg-black/20 font-bold text-cream/80 shadow-none hover:bg-black/30 hover:text-cream">
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
                onClick={() => applyVoteTarget(player.id)}
                className="rounded-xl border border-gold/20 bg-black/20 text-cream shadow-none hover:border-gold/60 hover:bg-gold/[0.15]"
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
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
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
              onClick={applyDeHonteOutcome}
              className="w-full rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
            >
              {t('game.continue')}
            </Button>
          ) : (
            <Button
              onClick={rollDeHonte}
              disabled={deHonteRolling}
              className="w-full rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
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
                onClick={() => startPileFaceFlip('pile')}
                className="h-auto flex-col gap-1 rounded-2xl border border-gold/25 bg-black/20 py-4 font-bold text-cream shadow-none hover:border-gold/60 hover:bg-gold/[0.15]"
              >
                <span className="text-2xl">1</span>
                {t('coinFlip.pile')}
              </Button>
              <Button
                onClick={() => startPileFaceFlip('face')}
                variant="secondary"
                className="h-auto flex-col gap-1 rounded-2xl border border-gold/25 bg-black/20 py-4 font-bold text-cream shadow-none hover:border-gold/60 hover:bg-gold/[0.15]"
              >
                <span className="text-2xl">👤</span>
                {t('coinFlip.face')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-xs text-cream/60">
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
                    <p className="mt-1 text-xs text-cream/60">
                      {t('game.dialogs.drinksToTake', { count: pendingCase?.effect || 2 })}
                    </p>
                  )}
                </motion.div>
              )}

              {!pileFaceFlipping && pileFaceFlipResult ? (
                <Button
                  onClick={applyPileFaceOutcome}
                  className="w-full rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
                >
                  {t('game.continue')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <p className="text-center text-xs text-cream/60 animate-pulse">
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
                onClick={() => {
                  setShowChanceDialog(false);
                  // Relancer le dé avec la fonction spéciale
                  rerollDice();
                }}
                className="rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
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
                className="rounded-2xl bg-chip-blue font-bold text-cream shadow-none hover:bg-chip-blue/90"
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('chain')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="px-5 pb-5 pt-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/30">
                    <Link2 className="h-6 w-6 text-gold" />
                  </div>
                  <h3 id={dialogTitleId('chain')} className="font-display text-lg font-bold text-cream">{t('game.dialogs.chainTitle')}</h3>
                  <p className="mt-1 max-w-[18rem] text-sm text-cream/70">
                    {t('game.dialogs.chainPrompt', { count: pendingCase?.effect || 5 })}
                  </p>
                  <p className="mt-2 text-xs text-gold">
                    {renderSlots(translateWithSlots(t, 'game.dialogs.chainChooser', ['player']), {
                      player: <PlayerName player={players[currentPlayer]} className="font-semibold" />,
                    })}
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
                        className="flex flex-col items-center gap-2 rounded-xl border border-gold/20 bg-black/20 p-3 text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        <PlayerIcon player={player} size="lg" className="h-12 w-12 text-2xl" />
                        <PlayerName player={player} className="max-w-full truncate text-center text-sm font-semibold" />
                        <span className="rounded-full border border-gold/20 bg-black/25 px-2 py-0.5 text-[10px] font-medium text-cream/70">
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
                  className="rounded-xl border border-gold/20 bg-black/20 p-3 font-bold text-cream shadow-none hover:border-gold/60 hover:bg-gold/[0.15]"
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
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('wheel')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="z-[100] max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-5">
                <div className="mb-4 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                    <CircleDot className="h-6 w-6 text-gold" />
                  </div>
                  <h2 id={dialogTitleId('wheel')} className="font-display text-lg font-bold text-cream">
                    {wheelMode === 'defis' ? t('game.wheel.defis') : t('game.wheel.drinks')}
                  </h2>
                  <p className="mt-1 text-sm text-cream/60">
                    {t('game.wheel.turnOf', { player: players[currentPlayer]?.name ?? '' })}
                  </p>
                </div>

                <div className="mt-4 flex flex-col items-center gap-5">
                  <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                    {/* Flèche fixe (pointeur résultat) */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 drop-shadow">
                      <svg width="28" height="28" viewBox="0 0 28 28">
                        <polygon points="14,0 24,16 4,16" style={{ fill: 'rgb(var(--gold-rgb))' }} />
                        <rect x="12.5" y="16" width="3" height="8" rx="1.5" style={{ fill: 'rgb(var(--gold-rgb))' }} />
                      </svg>
                    </div>

                    {/* Roue animée */}
                    <motion.div
                      className="absolute inset-0 rounded-full ring-2 ring-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-visible"
                      style={{ originX: 0.5, originY: 0.5, rotate: wheelRotation }}
                      ref={wheelRef}
                    >
                      <svg viewBox="0 0 200 200" width="100%" height="100%">
                        {/* Fond */}
                        <circle cx="100" cy="100" r="98" style={{ fill: 'rgb(var(--felt-deep-rgb))' }} />
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
                              <path d={`M 100 100 L ${polar(100,100,95,start).x} ${polar(100,100,95,start).y}`} style={{ stroke: 'rgb(var(--felt-deep-rgb))' }} strokeWidth={1.2} />
                            </g>
                          )
                        })}
                        {/* Moyeu */}
                        <circle cx="100" cy="100" r="10" style={{ fill: 'rgb(var(--cream-rgb))' }} />
                        <circle cx="100" cy="100" r="4" style={{ fill: 'rgb(var(--gold-rgb))' }} />
                      </svg>
                    </motion.div>
                  </div>

                  {!wheelResult && (
                    <Button
                      disabled={wheelSpinning}
                      onClick={spinWheel}
                      className="mx-auto w-full max-w-xs rounded-2xl bg-amber-500 py-4 text-base font-bold text-black shadow-none hover:bg-amber-400 disabled:opacity-40"
                    >
                      {wheelSpinning ? t('game.wheel.spinning') : t('game.wheel.spin')}
                    </Button>
                  )}

                  {wheelResult && (
                    <div className="w-full rounded-xl border border-gold/30 bg-gold/10 px-4 py-4 text-center">
                      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.duel.result')}</p>
                      <p className="mt-1 font-display text-2xl font-bold text-gold">{wheelResult.label}</p>
                      <Button
                        onClick={finishWheelModal}
                        className="mt-4 w-full max-w-xs rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400"
                      >
                        {t('game.continue')}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Légende des couleurs */}
                {wheelSegments.length > 0 && !wheelSpinning && (
                  <div className="mt-4 rounded-xl border border-gold/20 bg-black/20 px-3 py-2">
                    <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.wheel.legend')}</p>
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
                          <span className="text-cream/70">{label}{info.count > 1 ? ` ×${info.count}` : ''}</span>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            {/* z-[2] : le rideau reste au-dessus de la carte animée, comme avec react-confetti. */}
            <EndConfetti rain pieces={200} className="z-[2]" />
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${dialogTitleId('victory')} ${dialogTitleId('victory-name')}`}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-6">
                {/* Trophée animé */}
                <div className="mb-4 flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    className="flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/40 bg-gold/[0.15] text-gold"
                  >
                    <Trophy className="h-10 w-10" />
                  </motion.div>
                  <div className="text-center">
                    <p id={dialogTitleId('victory')} className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.victory.winner')}</p>
                    <h2 id={dialogTitleId('victory-name')} className="mt-1 font-display text-2xl font-bold">
                      <PlayerName player={winner} className="text-cream" />
                    </h2>
                    <p className="mt-0.5 text-sm text-cream/60">{t('game.victory.wonGame')}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-gold">{turnCount}</p>
                    <p className="text-[11px] text-cream/60">{t('game.victory.turns')}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-gold">{players.length}</p>
                    <p className="text-[11px] text-cream/60">{t('game.victory.players')}</p>
                  </div>
                  <div className="text-center">
                    {(() => {
                      const diffKey = resolveDifficulty(gameDifficulty)
                      return (
                        <>
                          <p className="text-xl leading-none" aria-hidden>{DIFFICULTY_EMOJI[diffKey]}</p>
                          <p className="mt-1 font-display text-sm font-bold text-gold">{t(`difficultyLabels.${diffKey}`)}</p>
                        </>
                      )
                    })()}
                    <p className="mt-0.5 text-[11px] text-cream/60">{t('game.victory.difficulty')}</p>
                  </div>
                </div>

                {/* {t('game.finalRanking')} */}
                <div className="mb-5 space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
                  <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('game.finalRanking')}</p>
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
                        <PlayerIcon player={player} size="sm" className="h-7 w-7 shrink-0 text-sm" />
                        <PlayerName player={player} className="truncate text-sm font-semibold text-cream" />
                      </div>
                      <div className="flex shrink-0 gap-3 text-xs text-cream/60">
                        <span>{player.drinks}{drinkIcon(ambiance)}</span>
                        <span>{t('game.caseLabel', { number: shownCaseNumber(player) })}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <FirstGameFeedbackCard mode="local" gameId="petit-buveur" className="mb-5" />

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={resetGame}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3.5 font-bold text-black shadow-none transition-all hover:bg-amber-400"
                  >
                    <RefreshCw className="h-4 w-4" /> {t('game.replay')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/25 bg-black/20 py-3 text-sm font-semibold text-cream/80 transition-all hover:bg-black/30 hover:text-cream"
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
                    className="w-full rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400"
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
                    className="w-full rounded-2xl border-gold/25 bg-black/20 font-semibold text-cream/80 hover:bg-black/30 hover:text-cream"
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
                  onClick={() => setShowSaveDialog(false)}
                  className="w-full rounded-2xl bg-amber-500 font-bold text-black shadow-none hover:bg-amber-400"
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
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId('effect')}
              tabIndex={-1}
              ref={focusDialogOnMount}
              className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <div className="p-5">
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
                  <h2 id={dialogTitleId('effect')} className="font-display text-lg font-bold text-cream">{t('game.effectTitle')}</h2>
                  <p className="mt-1 text-sm text-cream/60">
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
                        {' '}· <PlayerName player={players[currentPlayer]} className="font-semibold text-gold" />
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-gold/20 bg-black/20 p-4 text-left">
                  <div
                    className="text-sm leading-relaxed text-cream/90 [&_strong]:text-gold [&_span]:inline-flex"
                    dangerouslySetInnerHTML={{ __html: getCaseEffectMainHtml(activeNotificationHtml) }}
                  />
                </div>

                {renderActiveEffectsPanel()}

                {pendingChallenge ? (
                  <div className="mt-5 space-y-2">
                    <p className="text-center text-xs font-medium text-cream/60">
                      {t('game.challengeQuestion')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => resolveChallengeChoice(true)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-700/30 py-3.5 font-bold text-emerald-100 transition-all hover:bg-emerald-700/40 active:scale-[0.98]"
                      >
                        <Check className="h-4 w-4 shrink-0" />
                        {t('game.challengeSuccess')}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveChallengeChoice(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-suit-red/50 bg-suit-red/[0.15] py-3.5 font-bold text-cream transition-all hover:bg-suit-red/25 active:scale-[0.98]"
                      >
                        <DrinkGlyph className="h-4 w-4 shrink-0" />
                        {t('game.challengeDrink', { count: pendingChallenge.drinks })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleNextButtonClick}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3.5 font-bold text-black shadow-none transition-all hover:bg-amber-400"
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