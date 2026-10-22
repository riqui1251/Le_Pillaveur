"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Dice6, Beer, Leaf, Trophy, Sparkles, Shuffle, User, HelpCircle, History, Volume2, VolumeX, Coins, Gavel, Clover, Check, Target, MoreHorizontal, LogOut, ChevronRight, Flag, Swords } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { EndConfetti } from './EndConfetti'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { MedalDot } from './MedalDot'
import { TurnBanner } from '@/components/game/TurnBanner'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PLAYER_ICONS } from '@/lib/players'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { DiceOverlay, type DiceOverlayState } from '@/components/petit-buveur/DiceOverlay'
import { TurnOverlay } from '@/components/petit-buveur/TurnOverlay'
import { useDrinkDeltas, FloatingDrinkBadge, PulsingCount, drinkIcon } from '@/components/petit-buveur/drink-feedback'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import {
  ALCOHOL_DEFI_INDEXES,
  resolveAmbianceMode,
  withAmbiance,
} from '@/app/[locale]/games/petit-buveur/ambiance'
import type { PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import { ChoiceSheet, PRIMARY_CHOICE, SECONDARY_CHOICE, DANGER_CHOICE, focusOnMount } from './petit-buveur/ChoiceSheet'
import { useBoardSequence } from './petit-buveur/useBoardSequence'
import {
  caseDescription,
  choiceOf,
  deciderIdOf,
  defiTextAt,
  duelMessage,
  landingIndex,
  noteMessage,
  outcomeSignature,
  randomTargetPool,
  rankByShown,
  shownDrinks,
  type EngineView,
} from './petit-buveur/view-helpers'
import { useGameSounds } from '@/hooks/useGameSounds'
import { CaseRevealCard } from '@/components/petit-buveur/CaseRevealCard'
import { CaseToken } from '@/components/petit-buveur/CaseToken'
import { PbPawn, pbPawnColumns, pbPawnSize } from '@/components/petit-buveur/PbPawn'
import { PbDifficultyIcon, PbEffectIcon, PB_EFFECT_STYLE, type PbEffectKind } from '@/components/petit-buveur/effects'
import { PbDialogClose, allowEscapeClose } from '@/components/petit-buveur/PbDialogClose'
import { getCaseMeta } from '@/lib/petit-buveur/case-families'
import { InteractionSpectacle } from '@/components/petit-buveur/InteractionSpectacle'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import type { LastOutcome, LastOutcomeChange, OutcomeNote } from '@/lib/petit-buveur/engine'
import '@/styles/petit-buveur-board.css'

/**
 * Écran de jeu Petit Buveur EN LIGNE (serveur-autoritaire).
 *
 * Reprend le langage visuel du mode local (plateau `pb-board-*`, HUD, effets
 * actifs, classement, barre d'action fixe) pour un ressenti cohérent. Affiche
 * l'état poussé par le serveur (SSE + polling de `useOnlineRoom`) et envoie
 * des actions à `POST /.../action` ; le moteur tourne côté serveur.
 */

const BOARD_SIZE = 30
const DIFFICULTIES = ['facile', 'normal', 'difficile', 'extreme']

/**
 * L'avertissement AFK (« joue ! ») s'affiche pendant les 60 dernières secondes
 * avant l'expulsion (elle-même à 3 min d'inactivité, validée côté serveur).
 */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

/** Laisse voir le pion arrivé (case 30) avant la fanfare et l'écran de fin. */
const END_REVEAL_DELAY_MS = 500

type ResolveChoice = {
  targetId?: string
  side?: 'pile' | 'face'
  option?: string
  succeeded?: boolean
  chanceChoice?: 'reroll' | 'plus2'
}

function parseView(json: string | null | undefined): EngineView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EngineView
    return Array.isArray(v.players) ? v : null
  } catch {
    return null
  }
}

/** Icône emoji stable par joueur (dérivée de sa position dans la liste, identique pour tous les clients). */
function iconFor(index: number): string {
  return PLAYER_ICONS[index % PLAYER_ICONS.length]
}

type EffectChip = {
  id: string
  kind: PbEffectKind
  title: string
  desc: string
  remaining: number
  playerId: string
  playerName: string
  linkedName?: string
}

/** Boutons d'icône de l'en-tête et des fenêtres : 44 px, filet or sur le feutre. */
const ICON_BUTTON = 'border border-gold/20 bg-black/20 text-cream/80 hover:bg-black/30 hover:text-gold'

export function PetitBuveurOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const basePB = useTranslations('games.petit-buveur') as PetitBuveurT
  // Ambiance Soft : chaque texte tente d'abord sa variante `soft.<clé>` (gages).
  const { mode: ambianceMode } = useAmbianceMode()
  const ambiance = resolveAmbianceMode(ambianceMode)
  const tPB = useMemo(() => withAmbiance(basePB, ambiance), [basePB, ambiance])
  const t = useMemo(() => {
    const scoped = ((key: string, values?: Record<string, string | number>) =>
      tPB(`online.${key}`, values)) as PetitBuveurT
    scoped.raw = (key: string) => tPB.raw(`online.${key}`)
    return scoped
  }, [tPB])
  const tGame = (key: string, values?: Record<string, string | number>) => tPB(`game.${key}`, values)
  const tDiff = useTranslations('games.petit-buveur.difficultyLabels')
  const tCommon = useTranslations('common')
  const DrinkGlyph = ambiance === 'soft' ? Leaf : Beer
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [rolling, setRolling] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDialog, confirm] = useConfirmAction()
  const reducedMotion = useReducedMotion()
  const [diceOverlay, setDiceOverlay] = useState<DiceOverlayState | null>(null)
  const diceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** « Toucher pour passer » : écourte le maintien du résultat. */
  const diceSkipRef = useRef<(() => void) | null>(null)
  // Dernier dé arrivé par SSE/polling — secours si la réponse HTTP du roll se perd.
  const rollFallbackRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
    }
  }, [])

  const inGame = room?.gameId === 'petit-buveur' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('petit-buveur', inGame)
  const cosmetics = useMemberCosmetics(room)

  const stateVersion = room?.stateVersion ?? -1

  // Ticks « arbitre » (avec secours par rang, cf. useBotReferee) :
  // - tour d'un bot → demande au serveur de jouer UNE action (rythme visible) ;
  // - joueur parti depuis plus de 3 min → demande son remplacement par un bot.
  // La garde expectedVersion rend les ticks concurrents inoffensifs.
  // Le DÉCIDEUR, pas forcément le joueur au tour : la cible choisit pile ou face.
  const deciderId = view ? deciderIdOf(view) : null
  const decider = view?.players.find((p) => p.id === deciderId)
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    // Joueur parti : le serveur joue aussi sa décision en attente (deciderPlaysAuto).
    botTick: decider?.isBot || decider?.leftAt
      ? { body: { action: 'bot' }, delayMs: botTickDelayMs(decider.name) }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Échéance du choix pile ou face de la cible (côté tiré au hasard) : tick
  // « advance » arbitré par rang, comme les phases chronométrées des autres
  // jeux. Le minuteur de service du serveur n'est plus le seul à le tirer.
  const sidePending = view?.pending?.stage === 'side' ? view.pending : null
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      sidePending && typeof sidePending.deadlineAt === 'number'
        ? { phaseKey: `side:${sidePending.targetId ?? ''}`, dueAt: sidePending.deadlineAt }
        : null,
  })

  // Tick AFK : si le décideur (humain, présent, pas moi) ne joue rien
  // pendant 3 min, n'importe quel autre client demande son remplacement —
  // le serveur revalide avec SA propre horloge avant d'expulser.
  const afkTarget = view && view.phase !== 'finished' ? decider : undefined
  // Surveillé seulement s'il reste un AUTRE humain présent : sans lui, personne
  // ne peut déclencher l'expulsion (le dernier humain n'est jamais expulsable).
  const afkWatchable = Boolean(
    afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view?.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  // Début de tour côté client : remis à zéro à chaque écriture d'état serveur.
  // Sert de base aux comptes à rebours AFK (l'horloge d'autorité reste le serveur).
  const turnStartedAt = useAfkTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    targetId: afkTarget?.id,
    enabled: afkWatchable,
  })

  // Avertissement AFK affiché après 1 min sans action du joueur au tour.
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'

  // Pions animés case par case : gelés tant que l'overlay du dé est affiché,
  // puis case du dé → pause → effet de la case (voir useBoardSequence).
  const board = useBoardSequence(view, Boolean(diceOverlay))
  const shownPositions = board.positions
  const boardSettled = !diceOverlay && !board.animating
  // Les gorgées de la case tombent avec son effet, pas pendant que le pion marche vers elle.
  const drinksById = useMemo(
    () => shownDrinks(view?.players ?? [], board.effectPending ? view?.lastOutcome : null),
    [view, board.effectPending]
  )
  const drinkDeltas = useDrinkDeltas(drinksById)

  // Mémorise le dé de la vue courante (voir rollFallbackRef dans handleRoll).
  useEffect(() => {
    rollFallbackRef.current = view?.lastDice ?? null
  }, [view])

  // Fin de partie dévoilée seulement quand le dé est lu et que le pion est
  // arrivé : l'état « finished » arrive avec la réponse du lancer gagnant.
  const { muted, toggleMuted, play } = useGameSounds()
  const finishedNow = Boolean(view && (view.phase === 'finished' || view.winner))
  const [endRevealed, setEndRevealed] = useState(false)
  useEffect(() => {
    if (!finishedNow) {
      setEndRevealed(false)
      return
    }
    if (!boardSettled || endRevealed) return
    const timer = setTimeout(() => setEndRevealed(true), END_REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [finishedNow, boardSettled, endRevealed])
  const prevRevealedRef = useRef(false)
  useEffect(() => {
    if (endRevealed && !prevRevealedRef.current) play('victory')
    prevRevealedRef.current = endRevealed
  }, [endRevealed, play])

  // Tant que la partie n'est pas lancée : le lobby gère création/join/prêt/lancer.
  if (!inGame) {
    return <GameOnlineLobby gameId="petit-buveur" />
  }

  if (!view || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    )
  }

  const active = view.players[view.currentPlayer]
  const isMyTurn = active?.id === user.id
  const finished = view.phase === 'finished' || Boolean(view.winner)
  const winner = view.winner ? view.players.find((p) => p.id === view.winner) : null
  const caseLabel = (type: string) => tPB(`caseTypes.${type}`)
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? ''
  const pending = view.pending
  const isMyDecision = Boolean(pending) && deciderId === user.id && !finished
  const choice = pending ? choiceOf(pending) : null
  // HUD, classement et surbrillance suivent le pion qui marche : pendant
  // l'animation, c'est encore l'acteur de la case qui « a la main » à l'écran.
  const shownTurnPlayer =
    (board.animatedActorId && view.players.find((p) => p.id === board.animatedActorId)) || active
  const defiText = (index: number | undefined) =>
    typeof index === 'number'
      ? defiTextAt(
          basePB.raw('defis') as { text: string }[],
          ambiance === 'soft' && basePB.has?.('soft.defis') ? (basePB.raw('soft.defis') as { text: string }[]) : null,
          ALCOHOL_DEFI_INDEXES,
          index,
          ambiance === 'soft'
        )
      : undefined
  const difficulty = room.settings?.difficulty && DIFFICULTIES.includes(room.settings.difficulty)
    ? room.settings.difficulty
    : 'normal'

  // Icône personnalisée du compte si définie, sinon icône stable dérivée de
  // l'index. Les bots portent le portrait de leur persona (🤖 pour les convertis).
  const iconOf = (id: string) => {
    const player = view.players.find((p) => p.id === id)
    if (player?.isBot) return botAvatarFromName(player.name)
    return (
      room.members.find((m) => m.userId === id)?.preferences?.icon ??
      iconFor(Math.max(0, view.players.findIndex((p) => p.id === id)))
    )
  }
  // Positions AFFICHÉES (le pion avance case par case, l'état réel a déjà sauté).
  const shownPosOf = (id: string) => shownPositions[id] ?? view.players.find((p) => p.id === id)?.position ?? 0
  const leaderPos = Math.max(...view.players.map((p) => shownPosOf(p.id)))
  const activeShownPos = shownTurnPlayer ? shownPosOf(shownTurnPlayer.id) : null

  const effectChips: EffectChip[] = []
  view.players.forEach((p) => {
    const base = { playerId: p.id, playerName: p.name }
    if (p.protected && (p.protectionTurnsLeft ?? 0) > 0) {
      effectChips.push({
        ...base, id: `prot-${p.id}`, kind: 'protection', title: tGame('effects.protection'),
        desc: tGame('effects.protectionDesc'), remaining: p.protectionTurnsLeft ?? 1,
      })
    }
    if (p.cursed > 0) {
      effectChips.push({
        ...base, id: `curse-${p.id}`, kind: 'curse', title: tGame('effects.curse'),
        desc: tGame('effects.curseDesc'), remaining: p.cursed,
      })
    }
    if (p.linkedTo && (p.linkedTurns ?? 0) > 0) {
      const linked = view.players.find((o) => o.id === p.linkedTo)
      effectChips.push({
        ...base, id: `link-${p.id}`, kind: 'chain', title: tGame('effects.chain'),
        desc: tGame('effects.chainDesc'), remaining: p.linkedTurns ?? 1, linkedName: linked?.name,
      })
    }
    if (p.skipNextTurn) {
      effectChips.push({
        ...base, id: `skip-${p.id}`, kind: 'skip', title: tGame('effects.skipTurn'),
        desc: tGame('effects.skipTurnDesc'), remaining: 1,
      })
    }
    if (p.anchored) {
      effectChips.push({
        ...base, id: `anchor-${p.id}`, kind: 'anchor', title: tGame('effects.anchor'),
        desc: tGame('effects.anchorDesc'), remaining: 1,
      })
    }
    if (p.mirrorDrinkTargetId && (p.mirrorDrinkTurns ?? 0) > 0) {
      const target = view.players.find((o) => o.id === p.mirrorDrinkTargetId)
      effectChips.push({
        ...base, id: `mirror-${p.id}`, kind: 'mirror', title: tGame('effects.mirror'),
        desc: target
          ? tGame('effects.mirrorDescOneWay', { a: p.name, b: target.name })
          : tGame('effects.mirrorDescShortOneWay'),
        remaining: p.mirrorDrinkTurns ?? 1, linkedName: target?.name,
      })
    }
  })

  /** Légende statique de tous les effets possibles (mêmes icônes/couleurs que les pastilles actives). */
  const legendEffects: { kind: PbEffectKind; title: string; desc: string }[] = [
    { kind: 'protection', title: tGame('effects.protection'), desc: tGame('effects.protectionDesc') },
    { kind: 'curse', title: tGame('effects.curse'), desc: tGame('effects.curseDesc') },
    { kind: 'chain', title: tGame('effects.chain'), desc: tGame('effects.chainDesc') },
    { kind: 'skip', title: tGame('effects.skipTurn'), desc: tGame('effects.skipTurnDesc') },
    { kind: 'anchor', title: tGame('effects.anchor'), desc: tGame('effects.anchorDesc') },
    { kind: 'mirror', title: tGame('effects.mirror'), desc: tGame('effects.mirrorDescShortOneWay') },
  ]

  const ranking = rankByShown(view.players, shownPosOf)
  const finalRanking = [...view.players].sort((a, b) => b.position - a.position)
  // Mêmes filets que le classement du jeu local : or, crème, cuivre, puis feutre.
  const rankBorder = (i: number) =>
    i === 0
      ? 'border-gold/50 bg-gold/10'
      : i === 1
        ? 'border-cream/30 bg-black/20'
        : i === 2
          ? 'border-[#D3A275]/40 bg-[#8C5F35]/20'
          : 'border-gold/20 bg-black/20'
  const rankBadge = (i: number) =>
    i < 3 ? (
      <MedalDot position={i + 1} className="h-6 w-6 shrink-0 text-xs" />
    ) : (
      <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md border border-gold/20 bg-black/25 px-1.5 text-xs font-bold tabular-nums text-cream/80">
        {i + 1}
      </span>
    )
  /** Rang du joueur dans la table : couleur de son pion, la même que sur la TV. */
  const pawnOf = (id: string, size: number, active = false, children?: ReactNode) => (
    <PbPawn
      icon={<PlayerAvatarGlyph value={iconOf(id)} />}
      colorIndex={Math.max(0, view.players.findIndex((p) => p.id === id))}
      size={size}
      active={active}
    >
      {children}
    </PbPawn>
  )

  const sendAction = async (
    action: 'roll' | 'resolve',
    choice?: ResolveChoice
  ): Promise<{ view?: { lastDice?: number | null } } | null> => {
    // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit la vue ;
    // le hook, lui, annonce les refus (pas ton tour, expulsion…).
    const res = await postAction({ action, expectedVersion: room.stateVersion, choice })
    return (res?.data ?? null) as { view?: { lastDice?: number | null } } | null
  }

  const handleRoll = () => runDiceAction(() => sendAction('roll'))
  // « Relancer » de la case Chance : un vrai lancer, avec le même dé à l'écran.
  const handleChanceReroll = () => runDiceAction(() => sendAction('resolve', { chanceChoice: 'reroll' }))

  const runDiceAction = (send: () => Promise<{ view?: { lastDice?: number | null } } | null>) => {
    if (busy || rolling || !user) return
    setRolling(true)
    rollFallbackRef.current = null
    const rollStartedAt = Date.now()
    const meIcon = <PlayerAvatarGlyph value={iconOf(user.id)} />
    const meName = view.players.find((p) => p.id === user.id)?.name ?? ''
    setDiceOverlay({ phase: 'rolling', playerName: meName, playerIcon: meIcon })

    const clear = () => {
      setDiceOverlay(null)
      setRolling(false)
      diceSkipRef.current = null
    }
    const showResult = (dice: number) => {
      // Le résultat est déjà tiré par le serveur : on l'affiche, on le laisse
      // lire un instant, puis le pion part (animation case par case).
      setDiceOverlay({ phase: 'result', value: dice, playerName: meName, playerIcon: meIcon })
      diceTimerRef.current = setTimeout(clear, 750)
      diceSkipRef.current = () => {
        if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
        clear()
      }
    }

    // Filet de sécurité : si la réponse HTTP se perd (connexions saturées),
    // le SSE/polling apportera l'état quand même — on récupère le dé depuis
    // la vue, ou on ferme l'overlay plutôt que de le laisser tourner à vide.
    let settled = false
    const fallback = setTimeout(() => {
      if (settled) return
      settled = true
      const dice = rollFallbackRef.current
      if (typeof dice === 'number') showResult(dice)
      else clear()
    }, 5000)

    void send().then((body) => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      const dice = body?.view?.lastDice
      if (typeof dice === 'number') {
        // Durée MINIMALE de roulement : un serveur très rapide ne doit pas
        // court-circuiter l'animation (le dé paraissait « instantané »).
        const wait = Math.max(0, 700 - (Date.now() - rollStartedAt))
        diceTimerRef.current = setTimeout(() => showResult(dice), wait)
      } else {
        clear()
      }
    })
  }

  // La fenêtre de décision s'ouvre une fois le pion arrivé sur sa case.
  const showChoice = isMyDecision && boardSettled && !rolling
  // Duel sur case partagée avant la case tirée, que le serveur garde cachée (comme en local).
  const duelStage = pending?.stage === 'duel'
  // Cible choisie à l'aveugle, comme en local : le serveur n'a rien dit de la case.
  const hiddenCase = Boolean(pending?.hidden) && !duelStage
  const pendingCase = pending && !pending.hidden ? (pending.case ?? view.lastCase ?? null) : null
  const pendingTitle = pending
    ? duelStage
      ? tGame('duel.title')
      : hiddenCase
      ? tGame('target.title')
      : pending.caseType === 'double-case' && pending.cases?.length
        ? `${caseLabel('double-case')} (${pending.cases.map((c) => caseLabel(c.type)).join(' + ')})`
        : pending.via
          ? `${caseLabel(pending.via)} → ${caseLabel(pending.caseType)}`
          : caseLabel(pending.caseType)
    : ''
  // Ce que fait la case, comme la fenêtre du jeu local ; la consigne du choix à l'aveugle sinon.
  const pendingDetail = (() => {
    if (!pending) return null
    if (duelStage) return tGame('duel.rules')
    if (hiddenCase) return tGame('target.hint')
    return pendingCase ? caseDescription(pendingCase, tPB, defiText) : null
  })()
  const actorCaseNumber = (active ? shownPosOf(active.id) : 0) + 1
  // Consigne de la fenêtre de cible, celle de la fenêtre dédiée du jeu local.
  const targetHint = (() => {
    if (!pending || hiddenCase) return tGame('target.hint')
    if (pending.caseType === 'vote') return tGame('dialogs.votePrompt', { count: pendingCase?.effect || 3 })
    if (pending.caseType === 'echange') return tGame('dialogs.exchangePrompt')
    if (pending.caseType === 'defi-chaine') return tGame('dialogs.chainPrompt', { count: pendingCase?.effect || 5 })
    return pendingDetail ?? tGame('target.hint')
  })()
  // Téléport : le 1er et le dernier, nommés comme en local (même départage que le moteur).
  const teleportLeader = view.players.reduce((m, p) => (p.position > m.position ? p : m), view.players[0])
  const teleportLast = view.players.reduce((m, p) => (p.position < m.position ? p : m), view.players[0])
  // Libellé du bouton d'une case sans choix : celui de la fenêtre locale (« Lancer la roue »…).
  const confirmLabel = (type: string) =>
    type === 'roue' || type === 'roue-defis'
      ? tGame('wheel.spin')
      : type === 'de-honte'
        ? tGame('dialogs.rollD6')
        : `${t('continueCase')} (${caseLabel(type)})`
  const randomTarget = (allowSelf: boolean) => {
    const pool = randomTargetPool(view.players, active?.id, allowSelf)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick) void sendAction('resolve', { targetId: pick })
  }
  const actorFromForSpectacle = (() => {
    const actorId = view.lastInteraction?.actorId
    if (!actorId) return undefined
    return (
      view.lastOutcome?.changes.find((c) => c.playerId === actorId)?.from ??
      view.players.find((p) => p.id === actorId)?.position
    )
  })()
  // Le duel joué avant la case : la phrase du jeu local (qui gagne, qui recule).
  const duelLine = (outcome: LastOutcome): string | null => {
    if (!outcome.duel) return null
    const msg = duelMessage(outcome.duel, nameOf(outcome.actorId), nameOf(outcome.duel.opponentId))
    return tPB(msg.key, msg.values)
  }
  const duelOpponents = duelStage ? view.players.filter((p) => pending?.opponents?.includes(p.id)) : []
  const noteLines = (outcome: LastOutcome) =>
    (outcome.notes ?? []).map((n: OutcomeNote) => {
      const msg = noteMessage(n, (id) => nameOf(id), outcome.actorId)
      return tPB(msg.key, msg.values)
    })
  // Le détail d'une case jouée : verdict du défi, choix Chance, notes du moteur.
  const outcomeExtras = (outcome: LastOutcome): string[] => {
    const lines: string[] = []
    const duel = duelLine(outcome)
    if (duel) lines.push(duel)
    if (outcome.succeeded === true) {
      lines.push(tGame('outcomes.challengeSuccess', { player: nameOf(outcome.targetId) }))
    }
    if (outcome.chanceChoice === 'reroll') lines.push(tGame('dialogs.chanceReroll'))
    if (outcome.chanceChoice === 'plus2') lines.push(tGame('dialogs.chanceAdvance'))
    return [...lines, ...noteLines(outcome)]
  }
  const outcomeTitle = (outcome: LastOutcome) =>
    outcome.effectiveCase
      ? `${caseLabel(outcome.caseType)} → ${caseLabel(outcome.effectiveCase.type)}`
      : outcome.cases?.length
        ? `${caseLabel(outcome.caseType)} (${outcome.cases.map((c) => caseLabel(c.type)).join(' + ')})`
        : caseLabel(outcome.caseType)
  const changeChips = (changes: LastOutcomeChange[], tone: 'card' | 'history') => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {changes.map((c) => {
        const p = view.players.find((pl) => pl.id === c.playerId)
        return (
          <span
            key={c.playerId}
            className="flex items-center gap-1.5 rounded-full border border-gold/20 bg-black/30 py-0.5 pl-0.5 pr-2 text-sm font-semibold text-cream"
          >
            {pawnOf(c.playerId, 18)}
            {p && (
              <OnlinePlayerName
                name={p.name}
                cosmetics={cosmetics.get(p.id)}
                className={tone === 'card' ? 'max-w-[7rem] truncate' : 'max-w-[6rem] truncate'}
              />
            )}
            {c.drinks > 0 && <span className="text-red-300">+{c.drinks} {drinkIcon(ambiance)}</span>}
            {c.to !== c.from && (
              <span className="text-sky-300">
                → {t('caseLabel')} {c.to + 1}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
  const outcomeBody = (outcome: LastOutcome, tone: 'card' | 'history', showNothing: boolean) => {
    const extras = outcomeExtras(outcome)
    return (
      <>
        {outcome.changes.length > 0 && changeChips(outcome.changes, tone)}
        {extras.map((line, i) => (
          <p key={i} className="mt-1.5 text-sm font-semibold text-cream/80">
            {line}
          </p>
        ))}
        {outcome.changes.length === 0 && extras.length === 0 && showNothing && (
          <p className="mt-1.5 text-sm font-semibold text-emerald-300">{t('outcomeNothing')}</p>
        )}
      </>
    )
  }
  const lastLanding = landingIndex(view.players, view.lastOutcome)

  // « À qui le tour » : le joueur au tour, ou celui qui doit décider (la cible
  // choisit pile ou face, le lanceur juge le défi) une fois le pion posé.
  const deciding = Boolean(pending) && boardSettled && !finished
  const bannerPlayer = deciding ? decider ?? shownTurnPlayer : shownTurnPlayer
  const bannerMine = !finished && (deciding ? isMyDecision : isMyTurn)
  // Pas de compte à rebours ici : le bandeau est une région vivante, un
  // chiffre qui change chaque seconde y serait relu en boucle (il reste sur la
  // carte de la case en attente).
  const bannerHint = deciding && pending
    ? isMyDecision
      ? pendingTitle
      : pending.stage === 'verdict'
        ? t('verdictWaiting', { name: nameOf(pending.playerId), target: nameOf(pending.targetId) })
        : undefined
    : undefined

  const canRoll = isMyTurn && !pending && !finished
  const canConfirm = showChoice && choice?.kind === 'confirm' && Boolean(pending)
  const actionStatus = canRoll || isMyDecision || finished
    ? undefined
    : t('waitingFor', { name: (deciding ? nameOf(deciderId) : active?.name) ?? '' })

  const askLeave = async () => {
    setShowMenu(false)
    const ok = await confirm({
      title: t('leaveConfirm.title'),
      description: t('leaveConfirm.description'),
      confirmLabel: t('leaveConfirm.confirm'),
      cancelLabel: t('leaveConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) void leaveRoom()
  }

  // Surcouches plein écran HORS de la scène (OnlineGameStage, z-20, est un
  // contexte d'empilement) : rendues dedans, le haut de la carte de fin et des
  // fenêtres de choix passait sous la barre du site.
  const portal = (node: ReactNode) => (typeof document === 'undefined' ? node : createPortal(node, document.body))

  return (
    <>
      {/* Spectacle des tirages (roue, pièce, dé de la honte, duel) — visible par tous */}
      {portal(
      <>
      <InteractionSpectacle
        interaction={view.lastInteraction}
        caseLabel={
          view.lastInteraction
            ? view.lastInteraction.kind === 'duel'
              ? tGame('duel.title')
              : caseLabel(view.lastInteraction.kind)
            : ''
        }
        actorName={
          view.lastInteraction
            ? view.players.find((p) => p.id === view.lastInteraction?.actorId)?.name ?? ''
            : ''
        }
        targetName={
          view.lastInteraction?.kind === 'pile-face'
            ? nameOf(view.lastInteraction.targetId)
            : view.lastInteraction?.kind === 'duel'
              ? nameOf(view.lastInteraction.opponentId)
              : ''
        }
        labels={{
          wheelSafe: t('spectacle.wheelSafe'),
          // gabarits avec {placeholders} interpolés par le composant → raw
          wheelDrinks: t.raw('spectacle.wheelDrinks') as string,
          wheelLegendSafe: t('spectacle.wheelLegendSafe'),
          wheelLegendDrink: t('spectacle.wheelLegendDrink'),
          pfWin: t('spectacle.pfWin'),
          pfLose: t.raw('spectacle.pfLose') as string,
          pile: t('spectacle.pile'),
          face: t('spectacle.face'),
          deHonteSafe: t('spectacle.deHonteSafe'),
          deHonteDrink: t('spectacle.deHonteDrink'),
          deHonteForward: t('spectacle.deHonteForward'),
          deHonteBack: t('spectacle.deHonteBack'),
          deHonteCannotBack: t('spectacle.deHonteCannotBack'),
          duelWinnerStays: tPB.raw('game.duel.winnerStays') as string,
          duelOpponentWins: tPB.raw('game.duel.opponentWins') as string,
          duelLoserProtected: tPB.raw('game.duel.loserProtected') as string,
          duelWinner: tPB('wheel.winner'),
          duelLoser: tPB('wheel.loser'),
        }}
        actorFromPosition={actorFromForSpectacle}
      />

      {/* Mise en scène du lancer de dé + flash de changement de tour */}
      <DiceOverlay
        state={diceOverlay}
        onSkip={() => diceSkipRef.current?.()}
        skipLabel={tGame('tapToSkip')}
      />
      <TurnOverlay
        activeKey={finished || !boardSettled ? null : active?.id ?? null}
        icon={active ? <PlayerAvatarGlyph value={iconOf(active.id)} /> : null}
        name={active?.name ?? ''}
        isSelf={isMyTurn}
        labelOf={`${tGame('turnOf')} ${active?.name ?? ''}`}
        labelSelf={tGame('yourTurn')}
        delayMs={1600}
      />
      </>
      )}

      {/* Flux de la partie : la scène (OnlineGameStage) défile, la barre d'action reste sous le pouce. */}
      <div className={cn('mx-auto flex w-full max-w-3xl flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:px-4', onlineActionBarPadding('tall'))}>
        <PhaseHeader
          round={
            <span className="inline-flex items-center gap-1.5">
              {t('turn', { count: view.turnCount })}
              <span aria-hidden>·</span>
              <PbDifficultyIcon difficulty={difficulty} className="h-4 w-4 text-gold" />
              {tDiff(difficulty)}
            </span>
          }
          phase={tGame('title')}
          right={
            <>
              <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
              <Button
                type="button"
                variant="ghost"
                size="gameIcon"
                onClick={() => setShowMenu(true)}
                aria-haspopup="dialog"
                aria-label={t('menu.title')}
                className={ICON_BUTTON}
              >
                <MoreHorizontal aria-hidden className="h-5 w-5" />
              </Button>
            </>
          }
        />

        {!finished && bannerPlayer && (
          <TurnBanner
            mine={bannerMine}
            name={bannerPlayer.name}
            avatar={pawnOf(bannerPlayer.id, 30)}
            hint={bannerHint}
          />
        )}

        {/* Joueur(s) parti(s) : en attente de leur retour avant remplacement par un bot */}
        {someoneLeft && (
          <div className="space-y-0.5 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-center">
            {view.players
              .filter((p) => !p.isBot && p.leftAt)
              .map((p) => (
                <p key={p.id} className="text-sm font-semibold text-cream">
                  <PhaseCountdown endsAt={(p.leftAt ?? 0) + ONLINE_REPLACE_GRACE_MS}>
                    {({ seconds }) => t('waitingReturn', { name: p.name, seconds })}
                  </PhaseCountdown>
                </p>
              ))}
          </div>
        )}

        {/* Coup refusé (pas ton tour, expulsion…) — 3 s */}
        {actionError && (
          <div role="alert" className="rounded-xl border border-suit-red/50 bg-suit-red/20 px-3 py-2 text-center text-sm font-semibold text-cream">
            {actionError}
          </div>
        )}

        {/* Avertissement AFK (60 dernières secondes avant expulsion) : message
            direct « joue ! » pour le joueur au tour, informatif pour les autres. */}
        {afkWatch && afkTarget && !afkTarget.isBot && !afkTarget.leftAt && (
          <div className="rounded-xl border border-suit-red/50 bg-suit-red/20 px-3 py-2 text-center">
            <p className="text-sm font-semibold text-cream">
              <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
                {({ seconds }) =>
                  afkTarget.id === user.id
                    ? t('afkWarningSelf', { seconds })
                    : t('afkWarning', { name: afkTarget.name, seconds })
                }
              </PhaseCountdown>
            </p>
          </div>
        )}

        {/* Plateau EN TÊTE, comme en local : le pion qui marche reste sous les yeux. */}
        <div className="pb-board">
          <div className="pb-board-grid grid grid-cols-6 gap-1.5 sm:gap-2.5">
            {Array.from({ length: BOARD_SIZE }).map((_, index) => {
              const onCase = view.players.filter((p) => shownPosOf(p.id) === index)
              const isStart = index === 0
              const isFinish = index === BOARD_SIZE - 1
              const isActiveCase = activeShownPos === index
              const isLeaderCase = index === leaderPos
              return (
                <div
                  key={index}
                  className={cn(
                    'relative flex aspect-square min-h-[2.75rem] items-center justify-center rounded-lg sm:min-h-[3.25rem] sm:rounded-xl',
                    isStart
                      ? 'pb-board-case pb-board-start'
                      : isFinish
                        ? 'pb-board-case pb-board-finish'
                        : 'pb-board-case',
                    isActiveCase && isLeaderCase
                      ? 'pb-board-highlight-both'
                      : isActiveCase
                        ? 'pb-board-highlight-active'
                        : isLeaderCase
                          ? 'pb-board-highlight-leader'
                          : ''
                  )}
                >
                  {/* Numéro de case : au-dessus des pions, sur sa pastille (petit-buveur-board.css). */}
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
                  {isFinish && onCase.length === 0 && (
                    <Trophy aria-hidden className="pb-board-finish-icon h-7 w-7 text-gold sm:h-9 sm:w-9" />
                  )}
                  {onCase.length > 0 && (
                    <div
                      className={cn(
                        'pb-board-players absolute inset-0 grid place-content-center place-items-center gap-0.5 p-1',
                        pbPawnColumns(onCase.length)
                      )}
                    >
                      {onCase.map((p) => {
                        const isPlayerActive = p.id === shownTurnPlayer?.id
                        return (
                          <motion.span
                            key={p.id}
                            layoutId={`token-${p.id}`}
                            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                            title={p.name}
                            className={cn(
                              'relative flex items-center justify-center',
                              isPlayerActive ? 'z-10' : 'z-0',
                              p.id === user.id && 'drop-shadow-[0_0_6px_rgba(217,164,65,0.8)]'
                            )}
                          >
                            {pawnOf(
                              p.id,
                              pbPawnSize(onCase.length),
                              isPlayerActive,
                              <FloatingDrinkBadge placement="above" deltas={drinkDeltas.filter((d) => d.playerId === p.id)} />
                            )}
                          </motion.span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Case en attente d'une décision — visible par toute la table (qui décide : bandeau du tour) */}
        {pending && boardSettled && !finished && (
          <div className="rounded-2xl border border-gold/30 bg-felt-deep/70 px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              {duelStage || hiddenCase ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/30">
                  {duelStage ? (
                    <Swords aria-hidden className="h-4 w-4 text-gold" />
                  ) : (
                    <Target aria-hidden className="h-4 w-4 text-gold" />
                  )}
                </span>
              ) : (
                <CaseToken caseType={pending.caseType} size={28} />
              )}
              <span className="text-base font-bold text-cream">{pendingTitle}</span>
              {pending.targetId && (
                <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-gold">
                  <Target aria-hidden className="h-4 w-4" /> {nameOf(pending.targetId)}
                </span>
              )}
            </div>
            {pendingDetail && <p className="mt-1.5 text-sm font-medium text-cream">{pendingDetail}</p>}
            {!pending.stage && pending.caseType === 'de-honte' && !pending.hidden && (
              <p className="mt-1 text-sm font-medium text-cream/80">{tGame('dialogs.shameDiceRules')}</p>
            )}
            {!isMyDecision && pending.stage === 'side' && typeof pending.deadlineAt === 'number' && (
              <p className="mt-1.5 text-sm font-medium tabular-nums text-cream/80">
                <PhaseCountdown endsAt={pending.deadlineAt}>
                  {({ seconds }) => t('sideWaiting', { name: nameOf(pending.targetId), seconds })}
                </PhaseCountdown>
              </p>
            )}
          </div>
        )}

        {/* Dernière case résolue — carte flip teintée par la famille de case,
            retournée quand le pion de l'acteur est posé sur la case du dé. */}
        {view.lastCase && !pending && board.caseRevealed && (() => {
          const outcome =
            view.lastOutcome && view.lastOutcome.caseType === view.lastCase.type ? view.lastOutcome : null
          // Consigne de la case jouée (celle rejouée par Répétition / Rewind), défi compris.
          const shownCase = outcome?.effectiveCase ?? view.lastCase
          const shownDescription = shownCase.type === 'normal' ? null : caseDescription(shownCase, tPB, defiText)
          return (
            <CaseRevealCard
              caseType={view.lastCase.type}
              label={outcome ? outcomeTitle(outcome) : caseLabel(view.lastCase.type)}
              revealKey={outcomeSignature(view) || `${view.turnCount}:${view.lastCase.type}:${view.lastDice ?? ''}`}
              headerExtra={
                <>
                  {outcome && lastLanding != null && (
                    <span className="text-sm font-semibold text-cream/80">
                      {t('caseLabel')} {lastLanding + 1}
                    </span>
                  )}
                  {view.lastDice != null && (
                    <span className="ml-auto flex items-center gap-1 text-sm text-cream/80">
                      <Dice6 className="h-4 w-4" aria-hidden /> {view.lastDice}
                    </span>
                  )}
                </>
              }
            >
              {/* Ce que fait la case (seuls les défis vérifiables sont tirés en ligne). */}
              {shownDescription && <p className="mt-1.5 text-sm font-medium text-cream">{shownDescription}</p>}
              {/* CE QUE la case a fait : gorgées prises, déplacements, protections —
                  lisible avant que le joueur suivant ne joue. */}
              {outcome &&
                outcomeBody(
                  outcome,
                  'card',
                  getCaseMeta(view.lastCase.type).family !== 'neutral' &&
                    getCaseMeta(view.lastCase.type).family !== 'bonus'
                )}
            </CaseRevealCard>
          )
        })()}

        {/* Effets actifs — une rangée de pastilles qui ouvre le détail et la légende */}
        {effectChips.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLegend(true)}
            aria-haspopup="dialog"
            className="flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-left transition-colors hover:bg-felt-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-gold" />
            <span className="sr-only">{tGame('effects.activeTitle')} :</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {effectChips.map((e) => (
                <span
                  key={e.id}
                  className={cn(
                    'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pl-1.5 pr-2 text-sm font-semibold text-cream',
                    PB_EFFECT_STYLE[e.kind].chip
                  )}
                >
                  {pawnOf(e.playerId, 18)}
                  <PbEffectIcon kind={e.kind} className="h-4 w-4" />
                  <span className="truncate">
                    {e.playerName}
                    {e.linkedName ? `${e.kind === 'chain' ? ' ↔ ' : ' → '}${e.linkedName}` : ''}
                  </span>
                  <span className="sr-only">
                    {e.title} · {tGame('effects.turnsLeft', { count: e.remaining })}
                  </span>
                  <span aria-hidden className="rounded-full bg-black/30 px-1.5 text-xs tabular-nums">
                    {e.remaining}
                  </span>
                </span>
              ))}
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
          </button>
        )}

        {/* Classement */}
        <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Trophy aria-hidden className="h-4 w-4 text-gold" />
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{tGame('ranking')}</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto p-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ranking.map((p, index) => {
              const isActive = shownTurnPlayer?.id === p.id
              return (
                <div
                  key={p.id}
                  className={cn(
                    'relative flex w-[9.5rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[10rem] sm:p-2.5',
                    isActive
                      ? 'border-gold/60 bg-gold/[0.15] shadow-[inset_0_0_0_1px_rgb(var(--gold-rgb)/0.35)]'
                      : rankBorder(index)
                  )}
                >
                  {rankBadge(index)}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      {pawnOf(p.id, 18)}
                      <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 truncate text-sm font-semibold text-cream" />
                    </div>
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-cream/80">
                      {t('caseLabel')} {shownPosOf(p.id) + 1}
                      <DrinkGlyph className="h-3.5 w-3.5" aria-hidden /> <PulsingCount value={drinksById[p.id] ?? p.drinks} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Barre d'action fixe — montée toute la partie (sa ligne d'état est une
          région vivante), jusqu'à l'écran de fin qui attend l'arrivée du pion. */}
      {!endRevealed && (
        <OnlineActionBar status={actionStatus} maxWidthClass="max-w-lg">
          {canRoll && (
            <Button
              type="button"
              variant="primary"
              size="gameLg"
              onClick={handleRoll}
              disabled={!boardSettled || busy || rolling}
              aria-busy={rolling || undefined}
              className="w-full touch-manipulation select-none gap-2"
            >
              <span className="truncate">{rolling ? tGame('rolling') : t('rollDice')}</span>
              <Dice6 aria-hidden className={cn('h-5 w-5 shrink-0', rolling && 'motion-safe:animate-spin')} />
            </Button>
          )}
          {/* Simple confirmation (roue, dé de la honte… : aucun choix à faire) */}
          {canConfirm && pending && (
            <Button
              type="button"
              variant="primary"
              size="gameLg"
              onClick={() => sendAction('resolve')}
              disabled={busy}
              aria-busy={busy || undefined}
              className="w-full gap-2"
            >
              <span className="truncate">{confirmLabel(pending.caseType)}</span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0" />
            </Button>
          )}
        </OnlineActionBar>
      )}

      {/* Écran de victoire — fidèle au mode local (confettis, trophée, stats, classement final).
          Feuille ancrée en bas au téléphone : un bandeau d'avis qui arrive tard
          la fait grandir vers le haut sans recentrer la carte. */}
      {portal(
      <AnimatePresence>
        {finished && endRevealed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={tGame('victory.winner')}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:items-center sm:p-4"
          >
            <EndConfetti rain pieces={200} />
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { scale: 0.85, y: 30 }}
              animate={reducedMotion ? { opacity: 1 } : { scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
              tabIndex={-1}
              ref={focusOnMount}
              className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-gold/20 bg-felt-deep text-cream shadow-2xl outline-none"
            >
              <OnlineEndScreen
                variant="sheet"
                className="px-5 pt-6"
                won={winner?.id === user?.id}
                rematchVotes={(view as { rematchVotes?: string[] }).rematchVotes ?? []}
                onRematch={voteRematch}
                onLeave={leaveRoom}
                header={
                  // Trophée : deux rebonds, pas de boucle (réduire les animations les coupe)
                  <div className="mb-4 flex flex-col items-center gap-3">
                    <motion.div
                      animate={reducedMotion ? undefined : { scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 1.5, repeat: 2, repeatDelay: 1.5 }}
                      className="flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/40 bg-gold/[0.15] text-gold"
                    >
                      <Trophy aria-hidden className="h-10 w-10" />
                    </motion.div>
                    <div className="text-center">
                      <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                        {tGame('victory.winner')}
                      </p>
                      <h2 className="mt-1 font-display text-2xl font-bold text-gold">
                        {winner ? (
                          <OnlinePlayerName name={winner.name} cosmetics={cosmetics.get(winner.id)} />
                        ) : (
                          '—'
                        )}
                      </h2>
                      <p className="mt-0.5 text-sm text-cream/70">{tGame('victory.wonGame')}</p>
                    </div>
                  </div>
                }
                ranking={
                  <>
                    {/* Stats */}
                    <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                      <div className="text-center">
                        <p className="font-display text-lg font-bold text-gold">{view.turnCount}</p>
                        <p className="text-xs text-cream/70">{tGame('victory.turns')}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-display text-lg font-bold text-gold">{view.players.length}</p>
                        <p className="text-xs text-cream/70">{tGame('victory.players')}</p>
                      </div>
                      <div className="text-center">
                        <p className="flex items-center justify-center gap-1 font-display text-sm font-bold text-gold">
                          <PbDifficultyIcon difficulty={difficulty} className="h-4 w-4" />
                          {tDiff(difficulty)}
                        </p>
                        <p className="mt-0.5 text-xs text-cream/70">{tGame('victory.difficulty')}</p>
                      </div>
                    </div>

                    {/* Classement final */}
                    <div className="mb-4 space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                      <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                        {tGame('finalRanking')}
                      </p>
                      {finalRanking.map((p, index) => (
                        <div
                          key={p.id}
                          className={cn(
                            'flex items-center justify-between rounded-xl px-3 py-2',
                            p.id === winner?.id ? 'border border-gold/60 bg-gold/[0.15]' : 'border border-gold/20 bg-black/20'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {rankBadge(index)}
                            <RankCrest role={cosmetics.get(p.id)?.role} />
                            {pawnOf(p.id, 22)}
                            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="truncate text-sm font-semibold text-cream" />
                          </div>
                          <div className="flex shrink-0 gap-3 text-xs text-cream/80">
                            <span>{p.drinks} {drinkIcon(ambiance)}</span>
                            <span>{t('caseLabel')} {p.position + 1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                }
                xp={
                  <XpGainBanner
                    won={winner?.id === user?.id}
                    playerIds={view.players.map((p) => p.id)}
                    className="mb-4"
                  />
                }
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Fenêtres de décision — feuille du bas sur mobile, centrées sur desktop */}
      {portal(
      <AnimatePresence>
        {showChoice && pending && choice?.kind === 'target' && (
          <ChoiceSheet
            key="target"
            ariaLabel={tGame('target.title')}
            caseLabel={hiddenCase ? tGame('caseLabel', { number: actorCaseNumber }) : pendingTitle}
            caseType={hiddenCase ? undefined : pending.caseType}
            title={tGame('target.title')}
            hint={targetHint}
            footer={
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => randomTarget(choice.allowSelf)}
                  className={SECONDARY_CHOICE}
                >
                  <Shuffle className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span className="truncate">{tGame('target.random')}</span>
                </button>
                {active && choice.allowSelf && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => sendAction('resolve', { targetId: active.id })}
                    className={SECONDARY_CHOICE}
                  >
                    <User className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {tGame('target.me')}{' '}
                      <OnlinePlayerName name={active.name} cosmetics={cosmetics.get(active.id)} className="truncate font-semibold" />
                    </span>
                  </button>
                )}
              </div>
            }
          >
            {/* Cibles (hors soi-même — voir « Moi » quand la case l'autorise) : une ligne de 56 px chacune */}
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              {view.players
                .filter((p) => p.id !== active?.id)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    onClick={() => sendAction('resolve', { targetId: p.id })}
                    className="flex h-14 w-full items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 text-left text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {pawnOf(p.id, 28)}
                    <OnlinePlayerName
                      name={p.name}
                      cosmetics={cosmetics.get(p.id)}
                      className="min-w-0 flex-1 truncate text-[15px] font-semibold"
                    />
                    <span className="shrink-0 rounded-full border border-gold/20 bg-black/25 px-2 py-0.5 text-xs font-medium text-cream/80">
                      {t('caseLabel')} {shownPosOf(p.id) + 1}
                    </span>
                  </button>
                ))}
            </div>
          </ChoiceSheet>
        )}

        {/* Duel sur case partagée : un adversaire de la case, ou passer (la case suit) */}
        {showChoice && pending && choice?.kind === 'duel' && (
          <ChoiceSheet
            key="duel"
            ariaLabel={tGame('duel.title')}
            caseLabel={tGame('duel.caseInfo', { number: actorCaseNumber, player: active?.name ?? '' })}
            title={tGame('duel.title')}
            icon={<Swords className="h-6 w-6 text-gold" aria-hidden />}
            hint={
              <>
                <span className="block">{tGame('duel.rules')}</span>
                <span className="mt-1 block font-semibold text-cream">{tGame('duel.pickOpponent')}</span>
              </>
            }
            footer={
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', {})}
                className={SECONDARY_CHOICE}
              >
                {tGame('duel.skip')}
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              {duelOpponents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => sendAction('resolve', { targetId: p.id })}
                  className="flex h-14 w-full items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 text-left text-cream transition-all hover:border-gold/60 hover:bg-gold/[0.15] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  {pawnOf(p.id, 28)}
                  <OnlinePlayerName
                    name={p.name}
                    cosmetics={cosmetics.get(p.id)}
                    className="min-w-0 flex-1 truncate text-[15px] font-semibold"
                  />
                  <Swords aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                </button>
              ))}
            </div>
          </ChoiceSheet>
        )}

        {/* Défi / Question : le joueur au tour arbitre */}
        {showChoice && pending && choice?.kind === 'verdict' && (
          <ChoiceSheet
            key="verdict"
            ariaLabel={tGame('challengeQuestion')}
            caseLabel={pendingTitle}
            caseType={pending.caseType}
            title={tGame('challengeQuestion')}
            icon={<Gavel className="h-6 w-6 text-gold" aria-hidden />}
            hint={
              <>
                <span className="flex items-center gap-1.5 font-semibold text-cream">
                  <Target aria-hidden className="h-4 w-4 text-gold" /> {nameOf(pending.targetId)}
                </span>
                {pendingDetail && <span className="mt-1 block">{pendingDetail}</span>}
              </>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { succeeded: true })}
                className={PRIMARY_CHOICE}
              >
                <Check aria-hidden className="h-5 w-5 shrink-0" />
                {tGame('challengeSuccess')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { succeeded: false })}
                className={DANGER_CHOICE}
              >
                <DrinkGlyph className="h-5 w-5 shrink-0" aria-hidden />
                {tGame('challengeDrink', { count: pendingCase?.effect ?? 0 })}
              </button>
            </div>
          </ChoiceSheet>
        )}

        {/* Pile ou face : la CIBLE choisit son côté */}
        {showChoice && pending && choice?.kind === 'side' && (
          <ChoiceSheet
            key="side"
            ariaLabel={tGame('dialogs.coinFlip')}
            caseLabel={pendingTitle}
            caseType={pending.caseType}
            title={tGame('dialogs.coinFlip')}
            icon={<Coins className="h-6 w-6 text-gold" aria-hidden />}
            hint={
              <>
                <span className="block">{t('sidePrompt', { actor: nameOf(pending.playerId) })}</span>
                <span className="mt-1 block font-semibold text-cream">
                  {tGame('dialogs.drinksToTake', { count: pendingCase?.effect || 2 })}
                </span>
                {typeof pending.deadlineAt === 'number' && (
                  <PhaseCountdown endsAt={pending.deadlineAt}>
                    {({ seconds }) => (
                      <span className="mt-1 block text-sm tabular-nums text-cream/80">
                        {t('secondsLeft', { seconds })}
                      </span>
                    )}
                  </PhaseCountdown>
                )}
              </>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { side: 'pile' })}
                className={PRIMARY_CHOICE}
              >
                {tPB('coinFlip.pile')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { side: 'face' })}
                className={PRIMARY_CHOICE}
              >
                {tPB('coinFlip.face')}
              </button>
            </div>
          </ChoiceSheet>
        )}

        {/* Chance : relancer le dé (lancer complet) ou avancer de 2 cases, sans cible */}
        {showChoice && pending && choice?.kind === 'chance' && (
          <ChoiceSheet
            key="chance"
            ariaLabel={tGame('dialogs.chance')}
            caseLabel={pendingTitle}
            caseType={pending.caseType}
            title={tGame('dialogs.chance')}
            icon={<Clover className="h-6 w-6 text-gold" aria-hidden />}
            hint={tGame('dialogs.chancePrompt')}
          >
            <div className="grid grid-cols-1 gap-2">
              <button type="button" disabled={busy} onClick={handleChanceReroll} className={PRIMARY_CHOICE}>
                {tGame('dialogs.chanceReroll')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { chanceChoice: 'plus2' })}
                className={SECONDARY_CHOICE}
              >
                {tGame('dialogs.chanceAdvance')}
              </button>
            </div>
          </ChoiceSheet>
        )}

        {showChoice && pending && choice?.kind === 'teleport' && (
          <ChoiceSheet
            key="teleport"
            ariaLabel={tGame('dialogs.teleport')}
            caseLabel={pendingTitle}
            caseType={pending.caseType}
            title={tGame('dialogs.teleportPrompt')}
            hint={pendingDetail ?? undefined}
          >
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { option: 'leader' })}
                className={PRIMARY_CHOICE}
              >
                {tGame('dialogs.teleportLeader', { name: teleportLeader?.name ?? '' })}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => sendAction('resolve', { option: 'last' })}
                className={SECONDARY_CHOICE}
              >
                {tGame('dialogs.teleportLast', { name: teleportLast?.name ?? '' })}
              </button>
            </div>
          </ChoiceSheet>
        )}
      </AnimatePresence>
      )}

      {/* Menu de la partie (⋯) : historique, effets, son, quitter (confirmé) */}
      <Dialog open={showMenu} onOpenChange={setShowMenu}>
        <DialogContent showCloseButton={false} onEscapeKeyDown={allowEscapeClose} className="sm:max-w-sm">
          <PbDialogClose label={tCommon('close')} />
          <DialogHeader>
            <DialogTitle className="flex min-h-[44px] items-center pr-12 font-display text-cream">{t('menu.title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="quiet"
              size="game"
              className="w-full justify-start gap-3"
              onClick={() => {
                setShowMenu(false)
                setShowHistory(true)
              }}
            >
              <History aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {t('history.title')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="game"
              className="w-full justify-start gap-3"
              onClick={() => {
                setShowMenu(false)
                setShowLegend(true)
              }}
            >
              <HelpCircle aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {t('effectsLegend')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="game"
              className="w-full justify-start gap-3"
              onClick={toggleMuted}
            >
              {muted ? (
                <VolumeX aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              ) : (
                <Volume2 aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              )}
              {muted ? tGame('soundOn') : tGame('soundOff')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="game"
              className="w-full justify-start gap-3 border-suit-red/50 text-red-300 hover:bg-suit-red/20"
              onClick={() => void askLeave()}
            >
              <LogOut aria-hidden className="h-5 w-5 shrink-0" />
              {t('menu.leave')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}

      {/* Effets en cours + légende des effets — informative, fermable (contrairement aux fenêtres de choix). */}
      <Dialog open={showLegend} onOpenChange={setShowLegend}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={allowEscapeClose}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        >
          <PbDialogClose label={tCommon('close')} />
          <DialogHeader>
            <DialogTitle className="flex min-h-[44px] items-center gap-2 pr-12 font-display text-cream">
              <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {effectChips.length > 0 ? tGame('effects.activeTitle') : t('effectsLegend')}
            </DialogTitle>
          </DialogHeader>
          {effectChips.length > 0 && (
            <div className="space-y-2">
              {effectChips.map((e) => (
                <div key={e.id} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5', PB_EFFECT_STYLE[e.kind].chip)}>
                  <PbEffectIcon kind={e.kind} className="mt-0.5 h-6 w-6" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <p className="font-display text-base font-bold text-cream">{e.title}</p>
                      <span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
                        {tGame('effects.turnsLeft', { count: e.remaining })}
                      </span>
                    </div>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-cream">
                      {pawnOf(e.playerId, 20)}
                      <span className="truncate">
                        {e.playerName}
                        {e.linkedName ? `${e.kind === 'chain' ? ' ↔ ' : ' → '}${e.linkedName}` : ''}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-cream/70">{e.desc}</p>
                  </div>
                </div>
              ))}
              <p className="pt-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('effectsLegend')}</p>
            </div>
          )}
          <div className="space-y-2">
            {legendEffects.map((e) => (
              <div key={e.kind} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', PB_EFFECT_STYLE[e.kind].chip)}>
                <PbEffectIcon kind={e.kind} className="h-6 w-6" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cream">{e.title}</p>
                  <p className="text-sm text-cream/70">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Historique des effets précédents — informatif, fermable */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={allowEscapeClose}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        >
          <PbDialogClose label={tCommon('close')} />
          <DialogHeader>
            <DialogTitle className="flex min-h-[44px] items-center gap-2 pr-12 font-display text-cream">
              <History aria-hidden className="h-5 w-5 shrink-0 text-gold" />
              {t('history.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(view.outcomeHistory ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-cream/70">{t('history.empty')}</p>
            ) : (
              [...(view.outcomeHistory ?? [])].reverse().map((entry, i) => {
                const actor = view.players.find((p) => p.id === entry.actorId)
                return (
                  <div
                    key={`${entry.turn}-${entry.caseType}-${i}`}
                    className="rounded-xl border border-gold/20 bg-black/20 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border border-gold/20 bg-black/25 px-1.5 py-0.5 text-xs font-bold tabular-nums text-cream/80">
                        {t('turn', { count: entry.turn })}
                      </span>
                      <CaseToken caseType={entry.caseType} size={24} />
                      <span className="text-sm font-semibold text-cream">
                        {outcomeTitle(entry)}
                      </span>
                      {entry.dice != null && (
                        <span className="flex items-center gap-0.5 text-xs text-cream/80">
                          <Dice6 aria-hidden className="h-3.5 w-3.5" /> {entry.dice}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5 text-sm text-cream/80">
                        {pawnOf(entry.actorId, 18)}
                        {actor && (
                          <OnlinePlayerName name={actor.name} cosmetics={cosmetics.get(actor.id)} className="max-w-[6rem] truncate" />
                        )}
                      </span>
                    </div>
                    {outcomeBody(entry, 'history', true)}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {portal(
        <AnimatePresence>
          {tutorial.open && <GameTutorialModal gameId="petit-buveur" onClose={tutorial.close} />}
        </AnimatePresence>
      )}
    </>
  )
}
