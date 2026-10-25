"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion'
import {
  Anchor,
  Bomb,
  Check,
  Crosshair,
  Dices,
  Eraser,
  Hourglass,
  Loader2,
  LogOut,
  MoveHorizontal,
  MoveVertical,
  Skull,
  TriangleAlert,
  Trophy,
  Waves,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { EndConfetti } from './EndConfetti'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { TurnBanner } from '@/components/game/TurnBanner'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  TC_MODES,
  TC_PLACEMENT_MS,
  TC_REJOIN_GRACE_MS,
  otherTeam,
  type TCClientView,
  type TeamId,
} from '@/lib/toucher-coule/engine'
import { tcBombCells, tcBombFits, tcCellPx, tcColumnLetter, tcCoord, tcShipCells } from '@/lib/toucher-coule/board'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * Écran de jeu Toucher-Coulé EN LIGNE (serveur-autoritaire).
 *
 * La vue reçue est déjà filtrée par le serveur : les navires ennemis non
 * touchés n'arrivent jamais au client. Mobile-first : une seule grille à la
 * fois, cases d'au moins 30 px (la grille défile de côté en 12×12 et 14×14),
 * coordonnées « C4 » en marge, et un tir en deux temps : viser, puis
 * « Tirer en C4 » dans la barre du bas.
 */

function parseView(json: string | null | undefined): TCClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as TCClientView
    return Array.isArray(v.players) && v.shotsAt ? v : null
  } catch {
    return null
  }
}

const TEAM_LABEL: Record<TeamId, string> = { A: 'A', B: 'B' }

/**
 * L'avertissement AFK (« joue ! ») s'affiche pendant les 60 dernières secondes
 * avant l'expulsion (elle-même à 3 min d'inactivité, validée côté serveur).
 */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

/** Durée d'un message de tap refusé dans la barre du bas. */
const NOTICE_MS = 3000
/** Durée du flash rouge sur les cases d'un placement ou d'une bombe refusés. */
const REJECT_FLASH_MS = 900

/** Géométrie de la grille : colonne des numéros, ligne des lettres, écart entre cases. */
const BOARD_LABEL_PX = 16
const BOARD_HEADER_PX = 18
const BOARD_GAP_PX = 2

// Le rendu serveur ne mesure rien ; côté client, la grille prend sa taille
// AVANT la première peinture (pas d'image où elle saute de 30 px à 38 px).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function teamAccent(team: TeamId): string {
  return team === 'A' ? 'text-sky-300' : 'text-rose-300'
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // vibration non supportée — silencieux
  }
}

type ShotState = 'hit' | 'miss' | undefined

/** Fond d'une case selon ce qu'elle a reçu : eau, raté, touché, coulé. */
function shotTone(shot: ShotState, sunk: boolean, ship = false): string {
  if (sunk) return 'bg-red-950 ring-1 ring-inset ring-red-400/60'
  if (shot === 'hit') return 'bg-red-600'
  if (ship) return 'bg-sky-500/80'
  if (shot === 'miss') return 'bg-black/30'
  return 'bg-sky-900/60'
}

/**
 * Marque d'une case, doublée d'une forme (pas seulement d'une couleur) :
 * croix pour touché, crâne pour coulé, point pour raté. Les emojis de 11 px
 * (💥/💀) se confondaient à bout de bras.
 */
function ShotMark({ shot, sunk }: { shot: ShotState; sunk: boolean }) {
  if (sunk) return <Skull aria-hidden className="h-4 w-4 text-red-200" />
  if (shot === 'hit') return <X aria-hidden strokeWidth={3} className="h-4 w-4 text-cream" />
  if (shot === 'miss') return <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cream/70" />
  return null
}

/** Pastille de légende : même fond et même marque que la case qu'elle explique. */
function LegendSwatch({ tone, children }: { tone: string; children?: ReactNode }) {
  return (
    <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]', tone)}>
      {children}
    </span>
  )
}

/**
 * Grille carrée avec ses repères (lettres en haut, numéros à gauche).
 *
 * La taille des cases est CALCULÉE sur la largeur mesurée, en pixels : le
 * ratio 1:1 par case se déformait sur certains mobiles quand la hauteur de
 * ligne dérivait. Sous 30 px par case, la grille garde 30 px et défile de
 * côté, numéros de ligne collés à gauche.
 */
function TcBoard({
  size,
  label,
  active = false,
  scrollHint,
  renderCell,
  onPointerLeave,
}: {
  size: number
  label: string
  /** C'est à ce téléphone d'y viser : liseré or. */
  active?: boolean
  scrollHint: string
  renderCell: (cell: number, coord: string) => ReactNode
  onPointerLeave?: () => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useIsoLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { cellPx, overflows } = tcCellPx(width, size, BOARD_GAP_PX, BOARD_LABEL_PX)
  const indexes = Array.from({ length: size }, (_, i) => i)

  return (
    <div
      className={cn(
        'rounded-2xl border bg-felt-deep p-1.5 transition-colors',
        active ? 'border-gold/60 ring-1 ring-gold/40' : 'border-gold/20'
      )}
    >
      <div ref={scrollerRef} role="group" aria-label={label} className="overflow-x-auto overscroll-x-contain">
        <div
          className="mx-auto grid w-max"
          style={{
            gap: BOARD_GAP_PX,
            gridTemplateColumns: `${BOARD_LABEL_PX}px repeat(${size}, ${cellPx}px)`,
            gridTemplateRows: `${BOARD_HEADER_PX}px repeat(${size}, ${cellPx}px)`,
          }}
          onPointerLeave={onPointerLeave}
        >
          <span aria-hidden className="sticky left-0 z-10 bg-felt-deep" />
          {indexes.map((col) => (
            <span
              key={`c${col}`}
              aria-hidden
              className="flex items-end justify-center text-xs font-semibold leading-none text-cream/70"
            >
              {tcColumnLetter(col)}
            </span>
          ))}
          {indexes.map((row) => (
            <Fragment key={`r${row}`}>
              <span
                aria-hidden
                className="sticky left-0 z-10 flex items-center justify-center bg-felt-deep text-xs font-semibold tabular-nums leading-none text-cream/70"
              >
                {row + 1}
              </span>
              {indexes.map((col) => {
                const cell = row * size + col
                return <Fragment key={cell}>{renderCell(cell, tcCoord(cell, size))}</Fragment>
              })}
            </Fragment>
          ))}
        </div>
      </div>
      {overflows && (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-cream/70">
          <MoveHorizontal aria-hidden className="h-4 w-4 shrink-0" />
          {scrollHint}
        </p>
      )}
    </div>
  )
}

type Notice = { text: string; tone: 'error' | 'info' }

export function ToucherCouleOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.toucher-coule.game')
  const tc = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  const boardControls = useAnimationControls()
  const [confirmDialog, confirm] = useConfirmAction()
  const victoryTitleId = useId()
  const victoryCardRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // Placement local (avant validation serveur).
  const [placedShips, setPlacedShips] = useState<number[][]>([])
  const [selectedShip, setSelectedShip] = useState(0)
  const [horizontal, setHorizontal] = useState(true)
  // Aperçu du bateau sous la souris (ordinateur) : au doigt, pas de survol.
  const [hoverCell, setHoverCell] = useState<number | null>(null)
  // Bombe (power-up) armée : le prochain tir touche un carré 2×2 au lieu d'une case.
  const [bombArmed, setBombArmed] = useState(false)
  // Tir en deux temps : la case visée, puis « Tirer en C4 » dans la barre.
  const [aim, setAim] = useState<number | null>(null)
  // Cases du tir en route vers le serveur : elles pulsent jusqu'à la réponse.
  const [pendingCells, setPendingCells] = useState<number[]>([])
  // Verrou synchrone des intentions (placer, tirer) : deux touchers dans la
  // même image passeraient tous deux l'état React, et le nouvel essai sur
  // conflit laisse un creux où `busy` retombe.
  const intentLockRef = useRef(false)

  // Tap refusé (bord, chevauchement, case déjà jouée…) : dit dans la barre du
  // bas et montré en rouge sur la grille — le tap ne tombe plus dans le vide.
  const [notice, setNotice] = useState<Notice | null>(null)
  const [rejectCells, setRejectCells] = useState<number[]>([])
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
      if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current)
    }
  }, [])
  const showNotice = useCallback((text: string, tone: Notice['tone'] = 'error') => {
    setNotice({ text, tone })
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])
  const refuse = useCallback(
    (cells: number[], text: string) => {
      showNotice(text)
      setRejectCells(cells)
      if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current)
      rejectTimerRef.current = setTimeout(() => setRejectCells([]), REJECT_FLASH_MS)
      vibrate(40)
      if (!reduceMotion) void boardControls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.32 } })
    },
    [boardControls, reduceMotion, showNotice]
  )

  const inGame = room?.gameId === 'toucher-coule' && room.status === 'playing'
  const tutorial = useGameTutorial('toucher-coule', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  // Nettoie le placement local dès que la bataille démarre (prêt pour un éventuel rematch).
  const phase = view?.phase
  // Le choix revient au plus grand bateau : sinon la revanche démarrait sur
  // le dernier posé de la partie d'avant.
  useEffect(() => {
    if (phase === 'placement') return
    setPlacedShips([])
    setSelectedShip(0)
    setHoverCell(null)
  }, [phase])

  // Ticks « arbitre » (avec secours par rang, cf. useBotReferee) :
  // - tour d'un bot → demande au serveur de jouer UN tir (rythme visible) ;
  // - joueur parti depuis plus de 3 min → demande son remplacement par un bot.
  // La garde expectedVersion rend les ticks concurrents inoffensifs.
  const battleActor =
    view?.phase === 'battle'
      ? view.players.find((p) => p.id === view.turnOrder[view.currentTurnIndex])
      : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: battleActor?.isBot
      ? { body: { action: 'bot' }, delayMs: botTickDelayMs(battleActor.name) }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
    graceMs: TC_REJOIN_GRACE_MS,
  })

  // ÉCHÉANCE DU PLACEMENT : phase simultanée, sans joueur « au tour » à
  // expulser. Le tick « advance », arbitré par rang, place au hasard les
  // navires des retardataires. Réarmé après l'échéance (retryMs), comme la
  // mise en place du 1220 : seul ce tick fait bouger la phase.
  const placementEndsAt = view?.phase === 'placement' ? (view.phaseEndsAt ?? null) : null
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase === 'placement'),
    advance:
      placementEndsAt !== null && view?.phaseKey
        ? { phaseKey: view.phaseKey, dueAt: placementEndsAt, retryMs: 5000 }
        : null,
  })

  // Toute écriture d'état (tir, tour qui passe, départ) remet la visée à zéro :
  // une cible gardée d'un tour à l'autre partirait sur une grille qui a bougé.
  const stateVersion = room?.stateVersion ?? -1
  useEffect(() => {
    setBombArmed(false)
    setAim(null)
  }, [stateVersion])

  // Tick AFK : si le joueur au tour (humain, présent, pas moi) ne tire pas
  // pendant 3 min, n'importe quel autre client demande son remplacement —
  // le serveur revalide avec SA propre horloge avant d'expulser.
  const afkTarget = battleActor
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

  const finishedNow = view?.phase === 'finished'
  // L'écran de fin prend le focus : le lecteur d'écran y entre, et le clavier
  // ne reste pas sur une case de la grille cachée sous le voile. Le plateau
  // passe inerte : sans ça, Tab sortait de la carte vers les 196 cases.
  useEffect(() => {
    if (!finishedNow) return
    victoryCardRef.current?.focus({ preventScroll: true })
    const board = mainRef.current
    board?.setAttribute('inert', '')
    return () => board?.removeAttribute('inert')
  }, [finishedNow])

  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'

  if (!inGame) {
    return <GameOnlineLobby gameId="toucher-coule" />
  }

  if (!view || !user) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-gold" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const myTeam: TeamId = view.viewerTeam ?? me?.team ?? 'A'
  const enemy = otherTeam(myTeam)
  const size = view.gridSize
  const config = TC_MODES[view.mode]
  const activeId = view.phase === 'battle' ? view.turnOrder[view.currentTurnIndex] : null
  const activePlayer = view.players.find((p) => p.id === activeId)
  const isMyTurn = activeId === user.id
  const finished = view.phase === 'finished'
  const winner = view.winner
  const coordOf = (cell: number) => tcCoord(cell, size)

  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '—'
  /** Icône du joueur : portrait du persona pour les bots, icône personnalisée du compte pour les humains. */
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? null

  // Intentions du joueur SANS verrou de version : le moteur revalide déjà la
  // phase, le tour et la case. Le verrou faisait perdre en silence (409 muet)
  // un « Valider mes bateaux » envoyé pendant que d'autres validaient aussi.
  // Reste le vrai conflit d'écriture simultanée : un seul nouvel essai, que le
  // moteur revalide sur l'état frais, puis un message s'il échoue encore.
  const sendIntent = async (body: Record<string, unknown>) => {
    if (intentLockRef.current) return null
    intentLockRef.current = true
    try {
      const first = await postAction(body)
      if (first?.status !== 409) return first
      const second = await postAction(body)
      if (second?.status === 409) showNotice(t('actionRaced'))
      return second
    } finally {
      intentLockRef.current = false
    }
  }

  // ── Aides placement ─────────────────────────────────────────────────────────
  const teammateCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team === myTeam) for (const c of ship.cells) teammateCells.add(c)
  }
  const myLocalCells = new Set(placedShips.flat())
  const sizes = config.shipSizesPerPlayer
  const placedCount = sizes.filter((_, i) => Boolean(placedShips[i])).length
  const allShipsPlaced = placedCount === sizes.length
  const isBlocked = (cells: number[]) => cells.some((c) => teammateCells.has(c) || myLocalCells.has(c))
  // Placements simultanés : un coéquipier vient de valider un bateau là où j'ai
  // posé le mien. Le serveur refuserait « Valider » ; on le montre avant.
  const clashSet = new Set([...myLocalCells].filter((c) => teammateCells.has(c)))

  const tryPlaceShip = (origin: number) => {
    const shipSize = sizes[selectedShip]
    if (shipSize === undefined || placedShips[selectedShip]) {
      showNotice(t('allShipsPlaced'), 'info')
      return
    }
    const cells = tcShipCells(origin, shipSize, size, horizontal)
    if (isBlocked(cells)) {
      refuse(cells, t('shipOverlap'))
      return
    }
    const next = [...placedShips]
    next[selectedShip] = cells
    setPlacedShips(next)
    const nextFree = sizes.findIndex((_, i) => !next[i])
    if (nextFree >= 0) setSelectedShip(nextFree)
  }

  const removeShipAt = (cell: number) => {
    const idx = placedShips.findIndex((ship) => ship?.includes(cell))
    if (idx < 0) return false
    const next = [...placedShips]
    delete next[idx]
    setPlacedShips(next)
    setSelectedShip(idx)
    showNotice(t('shipLifted'), 'info')
    return true
  }

  const randomizePlacement = () => {
    const taken = new Set(teammateCells)
    const result: number[][] = []
    for (const shipSize of sizes) {
      let placed: number[] | null = null
      for (let attempt = 0; attempt < 300 && !placed; attempt += 1) {
        const horiz = Math.random() < 0.5
        const row = Math.floor(Math.random() * (horiz ? size : size - shipSize + 1))
        const col = Math.floor(Math.random() * (horiz ? size - shipSize + 1 : size))
        const cells: number[] = []
        for (let i = 0; i < shipSize; i += 1) {
          cells.push(horiz ? row * size + col + i : (row + i) * size + col)
        }
        if (cells.every((c) => !taken.has(c))) placed = cells
      }
      if (!placed) return
      for (const c of placed) taken.add(c)
      result.push(placed)
    }
    setPlacedShips(result)
  }

  const confirmPlacement = () => {
    if (!allShipsPlaced || busy || clashSet.size > 0) return
    void sendIntent({ action: 'place', ships: sizes.map((_, i) => placedShips[i]) })
  }

  // Fantôme du bateau sous la souris : or s'il tient, rouge s'il chevauche.
  const ghostCells =
    hoverCell !== null && !allShipsPlaced && !myLocalCells.has(hoverCell) && sizes[selectedShip] !== undefined
      ? tcShipCells(hoverCell, sizes[selectedShip], size, horizontal)
      : []
  const ghostSet = new Set(ghostCells)
  const ghostFits = ghostCells.length > 0 && !isBlocked(ghostCells)
  const rejectSet = new Set(rejectCells)

  // ── Aides bataille ──────────────────────────────────────────────────────────
  const enemyShots = view.shotsAt[enemy] ?? {}
  const myShots = view.shotsAt[myTeam] ?? {}
  const enemySunkCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team === enemy && ship.sunk) for (const c of ship.cells) enemySunkCells.add(c)
  }
  const mySunkCells = new Set<number>()
  const myShipCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team !== myTeam) continue
    for (const c of ship.cells) {
      myShipCells.add(c)
      if (ship.sunk) mySunkCells.add(c)
    }
  }

  const canAim = isMyTurn && !finished && !busy
  const canBomb = Boolean(me?.hasBomb) && isMyTurn && !finished
  const aimCells = aim === null ? [] : bombArmed ? tcBombCells(aim, size) : [aim]
  const aimSet = new Set(aimCells)
  const pendingSet = new Set(pendingCells)
  const firing = pendingCells.length > 0

  const aimAt = (cell: number) => {
    if (!canAim) return
    if (bombArmed) {
      if (!tcBombFits(cell, size, enemyShots)) {
        refuse(tcBombCells(cell, size), t('bombNoFit'))
        return
      }
    } else if (enemyShots[cell] !== undefined) {
      showNotice(t('tapAlreadyShot'))
      vibrate(40)
      return
    }
    setAim(cell)
  }

  const toggleBomb = () => {
    const next = !bombArmed
    setBombArmed(next)
    // La case visée reste visée si le carré 2×2 y tient ; sinon on revise.
    if (next && aim !== null && !tcBombFits(aim, size, enemyShots)) setAim(null)
  }

  const fireAtAim = async () => {
    if (aim === null || !canAim || intentLockRef.current) return
    const cell = aim
    const bomb = bombArmed
    if (bomb ? !tcBombFits(cell, size, enemyShots) : enemyShots[cell] !== undefined) return
    setPendingCells(bomb ? tcBombCells(cell, size) : [cell])
    const res = await sendIntent(bomb ? { action: 'fire', cell, bomb: true } : { action: 'fire', cell })
    setPendingCells([])
    // Échec : la cible reste visée, le joueur peut retirer sans tout refaire.
    if (res?.ok) {
      setAim(null)
      setBombArmed(false)
    }
  }

  const lastShot = view.lastShot
  const lastShotCells = new Set<number>(
    lastShot ? (lastShot.bombResults ? lastShot.bombResults.map((r) => r.cell) : [lastShot.cell]) : []
  )
  const feedMessage = lastShot
    ? lastShot.bombResults
      ? t('feedBomb', {
          hits: lastShot.bombResults.filter((r) => r.result !== 'miss').length,
          total: lastShot.bombResults.length,
        })
      : lastShot.result === 'miss'
        ? t(isSoft ? 'feedMissSoft' : 'feedMiss', { shooter: nameOf(lastShot.shooterId) })
        : lastShot.result === 'hit'
          ? t(isSoft ? 'feedHitSoft' : 'feedHit', { owner: nameOf(lastShot.shipOwnerId) })
          : t(isSoft ? 'feedSunkSoft' : 'feedSunk', { owner: nameOf(lastShot.shipOwnerId) })
    : null

  const placementPhase = view.phase === 'placement'
  const placingNow = placementPhase && Boolean(me) && !me?.placed
  const showFeed = !placementPhase && Boolean(feedMessage)
  // Change à chaque tir, et seulement là : un départ ou un retour de joueur
  // (qui font aussi monter la version) ne rejoue pas le dernier tir.
  const shotSerial = view.players.reduce((n, p) => n + p.shotsFired, 0)
  // Un seul board à la fois (lisibilité mobile) : la grille ennemie quand mon
  // équipe tire, ma flotte quand l'équipe adverse tire ou pendant l'attente.
  const showEnemyBoard = !placementPhase && (finished || activePlayer?.team === myTeam)

  // Barre du bas : seulement quand CE téléphone a un geste à faire (poser ses
  // bateaux, tirer). Montée toute la durée de ce geste, pour que sa ligne
  // d'état soit annoncée quand elle change.
  const barMode: 'placement' | 'fire' | null = placingNow
    ? 'placement'
    : view.phase === 'battle' && isMyTurn
      ? 'fire'
      : null

  const teamPlayers = (team: TeamId) => view.players.filter((p) => p.team === team)
  const activeIcon = activePlayer ? iconOf(activePlayer) : null

  const askLeave = async () => {
    const ok = await confirm({
      title: t('leaveConfirm.title'),
      description: t('leaveConfirm.description', { minutes: Math.round(TC_REJOIN_GRACE_MS / 60_000) }),
      confirmLabel: t('leaveConfirm.confirm'),
      cancelLabel: t('leaveConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) void leaveRoom()
  }

  const feedTone = !lastShot
    ? ''
    : lastShot.bombResults
      ? 'border-rose-400/50 bg-rose-500/20 text-rose-100'
      : lastShot.result === 'miss'
        ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
        : lastShot.result === 'hit'
          ? 'border-gold/50 bg-gold/20 text-cream'
          : 'border-red-400/50 bg-red-500/20 text-red-100'

  const noticeLine = notice ? (
    <span className={cn('font-semibold', notice.tone === 'error' ? 'text-red-300' : 'text-cream')}>{notice.text}</span>
  ) : actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : null

  const barStatus =
    noticeLine ??
    (barMode === 'placement'
      ? clashSet.size > 0
        ? <span className="font-semibold text-red-300">{t('shipClash')}</span>
        : t('shipsPlacedCount', { placed: placedCount, total: sizes.length })
      : barMode === 'fire'
        ? aim !== null
          ? bombArmed
            ? t('bombZone', { from: coordOf(aim), to: coordOf(aimCells[aimCells.length - 1] ?? aim) })
            : t('aimTarget', { cell: coordOf(aim) })
          : bombArmed
            ? t('bombHint')
            : t('aimPrompt')
        : undefined)

  const legend = (fleet: boolean) => (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-cream/80">
      {fleet && (
        <span className="flex items-center gap-1.5">
          <LegendSwatch tone="bg-sky-500/80" />
          {t('legendShip')}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <LegendSwatch tone="bg-red-600">
          <X strokeWidth={3} className="h-3.5 w-3.5 text-cream" />
        </LegendSwatch>
        {t('legendHit')}
      </span>
      <span className="flex items-center gap-1.5">
        <LegendSwatch tone="bg-black/30">
          <span className="h-1.5 w-1.5 rounded-full bg-cream/70" />
        </LegendSwatch>
        {t('legendMiss')}
      </span>
      <span className="flex items-center gap-1.5">
        <LegendSwatch tone="bg-red-950 ring-1 ring-inset ring-red-400/60">
          <Skull className="h-3.5 w-3.5 text-red-200" />
        </LegendSwatch>
        {t('legendSunk')}
      </span>
    </div>
  )

  const boardTitle = (icon: ReactNode, title: string, team: TeamId) => (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="flex items-center gap-1.5 font-display text-base font-bold text-gold">
        {icon}
        {title}
      </p>
      <span className={cn('shrink-0 text-sm font-bold', teamAccent(team))}>
        {t('team', { team: TEAM_LABEL[team] })}
      </span>
    </div>
  )

  return (
    <>
    {confirmDialog}
    <div
      ref={mainRef}
      className={cn(
        'mx-auto flex w-full max-w-lg flex-col gap-3 px-3 pt-3 text-cream',
        barMode ? onlineActionBarPadding('tall') : 'pb-8'
      )}
    >
      <PhaseHeader
        round={t('boardInfo', { mode: view.mode, size })}
        phase={placementPhase ? (placingNow ? t('phasePlacement') : t('waitingPlacement')) : t('phaseBattle')}
        endsAt={placementEndsAt}
        total={TC_PLACEMENT_MS}
        status={
          placementPhase
            ? t('placedCount', { placed: view.players.filter((p) => p.placed).length, total: view.players.length })
            : undefined
        }
        right={
          <>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
            {!finished && (
              <Button
                type="button"
                variant="quiet"
                size="gameIcon"
                onClick={() => void askLeave()}
                aria-label={t('leave')}
              >
                <LogOut aria-hidden className="h-5 w-5" />
              </Button>
            )}
          </>
        }
      />

      {/* Refus du serveur hors de la barre (le tour a filé entre-temps) : sans
          barre montée, c'est le seul endroit où il peut se dire. */}
      {!barMode && (notice?.tone === 'error' || actionError) && (
        <p
          role="alert"
          className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200"
        >
          {notice?.tone === 'error' ? notice.text : actionError}
        </p>
      )}

      {view.phase === 'battle' && (
        <TurnBanner
          mine={isMyTurn}
          name={activePlayer?.name}
          // Sans icône (compte sans avatar), pas de pastille : une case vide de
          // 36 px décalait le « Au tour de … ».
          avatar={activeIcon ? <PlayerAvatarGlyph value={activeIcon} /> : undefined}
          hint={
            isMyTurn
              ? t('hitReplay')
              : activePlayer?.team === myTeam
                ? t('turnHintMate')
                : t('turnHintEnemy')
          }
          alertOnMine
        />
      )}

      {/* Joueur(s) parti(s) : en attente de leur retour avant remplacement par un bot */}
      {someoneLeft && (
        <div className="space-y-0.5 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center">
          {view.players
            .filter((p) => !p.isBot && p.leftAt)
            .map((p) => (
              <p key={p.id} className="text-sm font-semibold text-cream">
                <PhaseCountdown endsAt={(p.leftAt ?? 0) + TC_REJOIN_GRACE_MS}>
                  {({ seconds }) => t('waitingReturn', { name: p.name, seconds })}
                </PhaseCountdown>
              </p>
            ))}
        </div>
      )}

      {/* Avertissement AFK (60 dernières secondes avant expulsion) : message
          direct « joue ! » pour le joueur au tour, informatif pour les autres. */}
      {afkWatch && afkTarget && !afkTarget.isBot && !afkTarget.leftAt && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
          {afkTarget.id === user.id && <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />}
          <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) =>
              afkTarget.id === user.id
                ? t('afkWarningSelf', { seconds })
                : t('afkWarning', { name: afkTarget.name, seconds })
            }
          </PhaseCountdown>
        </div>
      )}

      {/* Dernier tir — la région reste montée (hors écran tant qu'elle est
          vide) pour que chaque nouveau tir soit annoncé. */}
      <div aria-live="polite" aria-atomic="true" className={showFeed ? undefined : 'sr-only'}>
        <AnimatePresence mode="wait" initial={false}>
          {showFeed && (
            <motion.p
              key={shotSerial}
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('rounded-2xl border px-4 py-2 text-center text-sm font-semibold', feedTone)}
            >
              {feedMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── PHASE PLACEMENT ── */}
      {placingNow && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-cream/80">
            {t('placementHint')}
            {placementEndsAt !== null && <> {t('placementDeadlineHint')}</>}
          </p>

          {/* Bateaux à poser */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {sizes.map((shipSize, i) => {
              const isPlaced = Boolean(placedShips[i])
              const isSelected = selectedShip === i && !isPlaced
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !isPlaced && setSelectedShip(i)}
                  disabled={isPlaced}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors',
                    isPlaced
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                      : isSelected
                        ? 'border-gold bg-gold/20 text-cream ring-2 ring-gold'
                        : 'border-gold/30 bg-felt-deep/60 text-cream/90 hover:bg-gold/10'
                  )}
                >
                  <span aria-hidden className="flex gap-0.5">
                    {Array.from({ length: shipSize }).map((_, j) => (
                      <span
                        key={j}
                        className={cn(
                          'h-3.5 w-3.5 rounded-[3px]',
                          isPlaced ? 'bg-emerald-400/60' : isSelected ? 'bg-gold' : 'bg-sky-400/70'
                        )}
                      />
                    ))}
                  </span>
                  {isPlaced && <Check aria-hidden className="h-4 w-4 shrink-0" />}
                  {t('shipLabel', { size: shipSize })}
                  {isPlaced && <span className="sr-only">{t('shipPlacedSr')}</span>}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="quiet"
              size="game"
              onClick={() => setHorizontal((h) => !h)}
              aria-label={t('orientationAria', { orientation: horizontal ? t('horizontal') : t('vertical') })}
              className="min-w-0 whitespace-normal px-2 leading-tight"
            >
              {horizontal ? (
                <MoveHorizontal aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              ) : (
                <MoveVertical aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              )}
              {horizontal ? t('horizontal') : t('vertical')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="game"
              onClick={randomizePlacement}
              className="min-w-0 whitespace-normal px-2 leading-tight"
            >
              <Dices aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              {t('random')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="game"
              onClick={() => {
                setPlacedShips([])
                setSelectedShip(0)
              }}
              disabled={placedCount === 0}
              className="min-w-0 whitespace-normal px-2 leading-tight"
            >
              <Eraser aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
              {t('clear')}
            </Button>
          </div>

          {boardTitle(<Waves aria-hidden className="h-4 w-4" />, t('yourFleet'), myTeam)}
          <motion.div animate={boardControls}>
            <TcBoard
              size={size}
              label={t('yourFleet')}
              active
              scrollHint={t('boardScrollHint')}
              onPointerLeave={() => setHoverCell(null)}
              renderCell={(cell, coord) => {
                const mine = myLocalCells.has(cell)
                const mate = teammateCells.has(cell)
                const ghost = ghostSet.has(cell)
                const rejected = rejectSet.has(cell)
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (removeShipAt(cell)) return
                      tryPlaceShip(cell)
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType === 'mouse') setHoverCell(cell)
                    }}
                    aria-label={mine ? `${coord}, ${t('legendMine')}` : mate ? `${coord}, ${t('legendMate')}` : coord}
                    className={cn(
                      'game-grid-cell rounded-[4px] transition-colors',
                      rejected || clashSet.has(cell)
                        ? 'bg-red-500/50 ring-2 ring-inset ring-red-300'
                        : mine
                          ? 'bg-sky-400'
                          : mate
                            ? 'bg-sky-700 ring-1 ring-inset ring-sky-200/50'
                            : ghost
                              ? ghostFits
                                ? 'bg-gold/40 ring-1 ring-inset ring-gold'
                                : 'bg-red-500/50'
                              : 'bg-sky-900/60 hover:bg-sky-700/60'
                    )}
                  />
                )
              }}
            />
          </motion.div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-cream/80">
            <span className="flex items-center gap-1.5">
              <LegendSwatch tone="bg-sky-400" />
              {t('legendMine')}
            </span>
            {teammateCells.size > 0 && (
              <span className="flex items-center gap-1.5">
                <LegendSwatch tone="bg-sky-700 ring-1 ring-inset ring-sky-200/50" />
                {t('legendMate')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── PHASE BATAILLE (+ attente de placement une fois validé) ── */}
      {!placingNow && (
        <div className="flex flex-col gap-3">
          {showEnemyBoard ? (
            <>
              {boardTitle(<Crosshair aria-hidden className="h-4 w-4" />, t('enemyWaters'), enemy)}
              <motion.div animate={boardControls}>
                <TcBoard
                  size={size}
                  label={t('enemyWaters')}
                  active={isMyTurn && !finished}
                  scrollHint={t('boardScrollHint')}
                  renderCell={(cell, coord) => {
                    const shot = enemyShots[cell]
                    const sunk = enemySunkCells.has(cell)
                    const aimed = aimSet.has(cell)
                    const pending = pendingSet.has(cell)
                    const rejected = rejectSet.has(cell)
                    const state = sunk ? t('legendSunk') : shot === 'hit' ? t('legendHit') : shot === 'miss' ? t('legendMiss') : null
                    return (
                      <button
                        type="button"
                        disabled={!canAim}
                        aria-pressed={canAim ? cell === aim : undefined}
                        aria-label={state ? `${coord}, ${state}` : coord}
                        onClick={() => aimAt(cell)}
                        className={cn(
                          'game-grid-cell relative flex items-center justify-center rounded-[4px] transition-colors',
                          rejected
                            ? 'bg-red-500/50 ring-2 ring-inset ring-red-300'
                            : aimed
                              ? 'bg-gold/40 ring-[3px] ring-inset ring-gold'
                              : cn(
                                  shotTone(shot, sunk),
                                  canAim && shot === undefined && 'hover:bg-sky-700',
                                  lastShotCells.has(cell) && lastShot?.targetTeam === enemy && 'ring-2 ring-inset ring-gold/80'
                                ),
                          pending && 'motion-safe:animate-pulse'
                        )}
                      >
                        {pending ? (
                          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-cream" />
                        ) : aimed ? (
                          cell === aim ? (
                            bombArmed ? (
                              <Bomb aria-hidden className="h-4 w-4 text-cream" />
                            ) : (
                              <Crosshair aria-hidden className="h-4 w-4 text-cream" />
                            )
                          ) : null
                        ) : (
                          <ShotMark shot={shot} sunk={sunk} />
                        )}
                      </button>
                    )
                  }}
                />
              </motion.div>
              {legend(false)}
            </>
          ) : (
            <>
              {boardTitle(<Waves aria-hidden className="h-4 w-4" />, t('yourFleet'), myTeam)}
              <TcBoard
                size={size}
                label={t('yourFleet')}
                scrollHint={t('boardScrollHint')}
                renderCell={(cell, coord) => {
                  const isShip = myShipCells.has(cell)
                  const shot = myShots[cell]
                  const sunk = mySunkCells.has(cell)
                  const state = sunk
                    ? t('legendSunk')
                    : shot === 'hit'
                      ? t('legendHit')
                      : isShip
                        ? t('legendShip')
                        : shot === 'miss'
                          ? t('legendMiss')
                          : null
                  // Seules les cases qui portent quelque chose sont lues : 196
                  // cases d'eau vide noieraient le lecteur d'écran.
                  return (
                    <div
                      {...(state ? { role: 'img', 'aria-label': `${coord}, ${state}` } : { 'aria-hidden': true })}
                      className={cn(
                        'game-grid-cell flex items-center justify-center rounded-[4px]',
                        shotTone(shot, sunk, isShip),
                        lastShotCells.has(cell) && lastShot?.targetTeam === myTeam && 'ring-2 ring-inset ring-gold/80'
                      )}
                    >
                      <ShotMark shot={shot} sunk={sunk} />
                    </div>
                  )
                }}
              />
              {legend(true)}
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((team) => (
              <section
                key={team}
                aria-label={t('team', { team: TEAM_LABEL[team] })}
                className={cn(
                  'min-w-0 rounded-2xl border bg-felt-deep/70 p-2.5',
                  team === 'A' ? 'border-sky-400/40' : 'border-rose-400/40'
                )}
              >
                <p className={cn('mb-1.5 flex flex-wrap items-center justify-between gap-1 text-sm font-bold', teamAccent(team))}>
                  <span>{t('team', { team: TEAM_LABEL[team] })}</span>
                  {team === myTeam && (
                    <span className="rounded-full bg-cream/10 px-2 py-0.5 text-xs font-semibold text-cream">
                      {t('yourTeam')}
                    </span>
                  )}
                </p>
                <ul className="space-y-1">
                  {teamPlayers(team).map((p) => {
                    const shooting = p.id === activeId
                    return (
                      <li
                        key={p.id}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm',
                          shooting ? 'bg-gold/20 text-cream ring-1 ring-gold/60' : 'text-cream/90',
                          p.leftAt && 'opacity-60'
                        )}
                      >
                        {shooting && <Crosshair aria-hidden className="h-3.5 w-3.5 shrink-0 text-gold" />}
                        <span className="min-w-0 flex-1 truncate">
                          <PlayerAvatarGlyph value={iconOf(p)} />
                          {iconOf(p) ? ' ' : ''}
                          <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                          {p.id === user.id && <span className="text-cream/70"> {t('you')}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-cream/80">
                          {/* Attente du placement : on voit QUI place encore,
                              pas seulement « 2/4 joueurs prêts ». */}
                          {placementPhase &&
                            (p.placed ? (
                              <>
                                <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" />
                                <span className="sr-only">{t('playerReadySr')}</span>
                              </>
                            ) : (
                              <>
                                <Hourglass aria-hidden className="h-3.5 w-3.5 text-cream/70" />
                                <span className="sr-only">{t('playerPlacingSr')}</span>
                              </>
                            ))}
                          {p.leftAt ? (
                            <>
                              <LogOut aria-hidden className="h-3.5 w-3.5" />
                              <span className="sr-only">{t('playerLeftSr')}</span>
                            </>
                          ) : null}
                          {p.hasBomb && (
                            <>
                              <Bomb aria-hidden className="h-3.5 w-3.5 text-gold" />
                              <span className="sr-only">{t('bombButton')}</span>
                            </>
                          )}
                          {!isSoft && <span>{p.drinks}🍺</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>

    {barMode && !finished && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {barMode === 'placement' ? (
          <Button
            type="button"
            variant="primary"
            size="gameLg"
            className="w-full"
            onClick={confirmPlacement}
            disabled={!allShipsPlaced || busy || clashSet.size > 0}
          >
            {busy ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Anchor aria-hidden className="mr-2 h-5 w-5" />
            )}
            {t('confirmPlacement')}
          </Button>
        ) : (
          <div className="flex gap-2">
            {canBomb && (
              <Button
                type="button"
                variant="quiet"
                size="gameLg"
                aria-pressed={bombArmed}
                onClick={toggleBomb}
                disabled={firing}
                className={cn('shrink-0 px-4', bombArmed && 'border-gold bg-gold/20 text-gold hover:bg-gold/20')}
              >
                <Bomb aria-hidden className="mr-2 h-5 w-5" />
                {t('bombButton')}
                {bombArmed && <Check aria-hidden className="ml-1.5 h-4 w-4" />}
              </Button>
            )}
            {/* Pendant l'envoi, le bouton reste à pleine lumière (« Tir en
                cours… » lisible) : le verrou est dans fireAtAim, pas dans
                l'opacité. */}
            <Button
              type="button"
              variant="danger"
              size="gameLg"
              className="min-w-0 flex-1 whitespace-normal leading-tight"
              disabled={aim === null && !firing}
              aria-disabled={busy || undefined}
              aria-busy={firing || undefined}
              onClick={() => void fireAtAim()}
            >
              {firing ? (
                <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />
              ) : bombArmed ? (
                <Bomb aria-hidden className="mr-2 h-5 w-5 shrink-0" />
              ) : (
                <Crosshair aria-hidden className="mr-2 h-5 w-5 shrink-0" />
              )}
              {firing
                ? t('firing')
                : aim === null
                  ? t('pickCell')
                  : bombArmed
                    ? t('bombAt', { cell: coordOf(aim) })
                    : t('fireAt', { cell: coordOf(aim) })}
            </Button>
          </div>
        )}
      </OnlineActionBar>
    )}

    {/* Écran de victoire — en PORTAIL : rendu dans la scène (z-20), il restait
        sous la barre du site quel que soit son z-index. Ancré en bas sur
        téléphone : un bandeau d'avis tardif fait grandir la carte vers le haut
        sans déplacer « Rejouer ». */}
    {typeof document !== 'undefined' &&
      createPortal(
        <AnimatePresence>
          {finished && winner && (
            <motion.div
              key="tc-victory"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] text-cream sm:items-center sm:p-4"
            >
              {myTeam === winner && <EndConfetti rain pieces={200} />}
              {/* Colonne flex, pas grille : le dock « Rejouer » (sticky) ne colle
                  qu'au bas d'un conteneur qui défile en bloc ou en flex. */}
              <motion.div
                ref={victoryCardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={victoryTitleId}
                tabIndex={-1}
                initial={reduceMotion ? false : { scale: 0.92, y: 24 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
                className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-gold/30 bg-felt-deep shadow-2xl outline-none"
              >
                <OnlineEndScreen
                  variant="sheet"
                  className="shrink-0 px-5 pt-6"
                  won={me?.team === winner}
                  rematchVotes={view.rematchVotes ?? []}
                  onRematch={voteRematch}
                  onLeave={leaveRoom}
                  header={
                    <div className="mb-4 flex flex-col items-center gap-3 text-center">
                      <motion.div
                        animate={reduceMotion ? undefined : { scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                        transition={{ duration: 1.5, repeat: 1, repeatDelay: 1 }}
                        className="flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/40 bg-gold/[0.15]"
                      >
                        <Trophy aria-hidden className="h-10 w-10 text-gold" />
                      </motion.div>
                      <h2 id={victoryTitleId} className="font-display text-2xl font-bold text-gold">
                        {t('victoryTitle', { team: TEAM_LABEL[winner] })}
                      </h2>
                      {!isSoft && (
                        <p className="text-sm text-cream/80">
                          {t('defeatDrinks', { team: TEAM_LABEL[otherTeam(winner)] })}
                        </p>
                      )}
                    </div>
                  }
                  ranking={
                    <>
                      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums text-gold">{view.turnCount}</p>
                          <p className="text-xs text-cream/70">{t('statTurns')}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums text-gold">
                            {me && me.shotsFired > 0 ? `${Math.round((me.shotsHit / me.shotsFired) * 100)}%` : '—'}
                          </p>
                          <p className="text-xs text-cream/70">{t('statAccuracy')}</p>
                        </div>
                      </div>

                      <div className="mb-4 space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">
                          {t('finalBoard')}
                        </p>
                        {[...view.players]
                          .sort((a, b) =>
                            isSoft
                              ? (a.team === winner ? 0 : 1) - (b.team === winner ? 0 : 1) || a.name.localeCompare(b.name)
                              : b.drinks - a.drinks
                          )
                          .map((p) => (
                            <div
                              key={p.id}
                              className={cn(
                                'flex items-center justify-between gap-2 rounded-xl px-3 py-2',
                                p.team === winner ? 'border border-gold/30 bg-gold/10' : 'bg-black/20'
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <RankCrest role={cosmetics.get(p.id)?.role} />
                                <span className={cn('shrink-0 text-sm font-bold', teamAccent(p.team))}>
                                  {TEAM_LABEL[p.team]}
                                </span>
                                <span className="truncate text-sm font-semibold text-cream">
                                  <PlayerAvatarGlyph value={iconOf(p)} />
                                  {iconOf(p) ? ' ' : ''}
                                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                                </span>
                                {p.team === winner && <Trophy aria-hidden className="inline h-4 w-4 shrink-0 text-gold" />}
                              </div>
                              {!isSoft && <span className="shrink-0 text-sm text-cream/80">{p.drinks}🍺</span>}
                            </div>
                          ))}
                      </div>
                    </>
                  }
                  xp={
                    <XpGainBanner
                      won={me?.team === winner}
                      playerIds={view.players.map((p) => p.id)}
                      className="mb-4"
                    />
                  }
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    {/* Même raison que l'écran de fin : dans la scène, la modale d'aide
        (fixed z-50) passait sous la barre du site. */}
    {typeof document !== 'undefined' &&
      createPortal(
        <AnimatePresence>
          {tutorial.open && <GameTutorialModal gameId="toucher-coule" onClose={tutorial.close} />}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
