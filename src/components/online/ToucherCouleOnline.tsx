"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Anchor, ArrowLeft, Crosshair, Home, RefreshCw, Trophy, Waves } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TC_MODES, TC_REJOIN_GRACE_MS, otherTeam, type TCClientView, type TeamId } from '@/lib/toucher-coule/engine'

/**
 * Écran de jeu Toucher-Coulé EN LIGNE (serveur-autoritaire).
 *
 * La vue reçue est déjà filtrée par le serveur : les navires ennemis non
 * touchés n'arrivent jamais au client. Mobile-first : grilles fluides
 * (colonnes dynamiques selon le mode), gros boutons tactiles.
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

function teamAccent(team: TeamId): string {
  return team === 'A' ? 'text-sky-300' : 'text-rose-300'
}

export function ToucherCouleOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.toucher-coule.game')
  const [busy, setBusy] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  // Placement local (avant validation serveur).
  const [placedShips, setPlacedShips] = useState<number[][]>([])
  const [selectedShip, setSelectedShip] = useState(0)
  const [horizontal, setHorizontal] = useState(true)

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'toucher-coule' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  // Nettoie le placement local dès que la bataille démarre (prêt pour un éventuel rematch).
  const phase = view?.phase
  useEffect(() => {
    if (phase !== 'placement') setPlacedShips([])
  }, [phase])

  // Ticks « arbitre » (le premier humain PRÉSENT de la partie) :
  // - tour d'un bot → demande au serveur de jouer UN tir (rythme visible) ;
  // - joueur parti depuis plus de 3 min → demande son remplacement par un bot.
  // La garde expectedVersion rend les ticks concurrents inoffensifs.
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (action: 'bot' | 'replace-left') => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    if (view.phase === 'battle') {
      const active = view.players.find((p) => p.id === view.turnOrder[view.currentTurnIndex])
      if (active?.isBot) botTimer = setTimeout(() => send('bot'), 1100)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= TC_REJOIN_GRACE_MS
        )
        if (expired) send('replace-left')
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  // Horloge locale pour le compte à rebours « bot dans Xs » (active si un joueur est parti).
  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!someoneLeft) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [someoneLeft])

  if (!inGame) {
    return <GameOnlineLobby gameId="toucher-coule" />
  }

  if (!view || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
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
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length

  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '—'
  /** Icône du joueur : 🤖 pour les bots, icône personnalisée du compte pour les humains. */
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? null

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
      // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit la vue.
    } finally {
      setBusy(false)
    }
  }

  // ── Aides placement ─────────────────────────────────────────────────────────
  const teammateCells = new Set<number>()
  for (const ship of view.ships) {
    if (ship.team === myTeam) for (const c of ship.cells) teammateCells.add(c)
  }
  const myLocalCells = new Set(placedShips.flat())
  const sizes = config.shipSizesPerPlayer
  const remainingShips = sizes.map((s, i) => ({ size: s, index: i })).filter((s) => !placedShips[s.index])

  const tryPlaceShip = (origin: number) => {
    const shipSize = sizes[selectedShip]
    if (shipSize === undefined || placedShips[selectedShip]) return
    const row = Math.floor(origin / size)
    const col = origin % size
    if (horizontal && col + shipSize > size) return
    if (!horizontal && row + shipSize > size) return
    const cells: number[] = []
    for (let i = 0; i < shipSize; i += 1) {
      cells.push(horizontal ? origin + i : origin + i * size)
    }
    if (cells.some((c) => teammateCells.has(c) || myLocalCells.has(c))) return
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

  const allShipsPlaced = sizes.every((_, i) => Boolean(placedShips[i]))
  const confirmPlacement = () => {
    if (!allShipsPlaced) return
    void sendAction({ action: 'place', ships: sizes.map((_, i) => placedShips[i]) })
  }

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

  const fire = (cell: number) => {
    if (!isMyTurn || busy || finished) return
    if (enemyShots[cell] !== undefined) return
    void sendAction({ action: 'fire', cell })
  }

  const lastShot = view.lastShot
  const feedMessage = lastShot
    ? lastShot.result === 'miss'
      ? t('feedMiss', { shooter: nameOf(lastShot.shooterId) })
      : lastShot.result === 'hit'
        ? t('feedHit', { owner: nameOf(lastShot.shipOwnerId) })
        : t('feedSunk', { owner: nameOf(lastShot.shipOwnerId) })
    : null

  // Carré garanti : ratio 1:1 sur le CONTENEUR + lignes en 1fr (l'aspect-ratio
  // par cellule se déforme sur certains mobiles quand la hauteur de ligne dérive).
  const gridStyle = {
    gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
    aspectRatio: '1 / 1',
  }
  const placementPhase = view.phase === 'placement'
  // Un seul board à la fois (lisibilité mobile) : la grille ennemie quand mon
  // équipe tire, ma flotte quand l'équipe adverse tire ou pendant l'attente.
  const showEnemyBoard = !placementPhase && (finished || activePlayer?.team === myTeam)

  const teamPlayers = (team: TeamId) => view.players.filter((p) => p.team === team)

  return (
    <div className="relative min-h-full bg-gray-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-sky-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 -left-40 h-80 w-80 rounded-full bg-cyan-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-lg px-3 py-4 pb-10 sm:px-4">
        {/* En-tête */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => leaveRoom()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={t('leave')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold sm:text-lg">
            🚢 {t('title')}
          </h1>
          <span className="shrink-0 rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
            {view.mode} · {size}×{size}
          </span>
        </div>

        {/* Bandeau de tour / phase */}
        {!finished && (
          <div
            className={cn(
              'mb-3 rounded-2xl border px-4 py-3 text-center backdrop-blur-md',
              placementPhase
                ? 'border-white/10 bg-white/5'
                : isMyTurn
                  ? 'border-emerald-400/40 bg-emerald-500/15'
                  : 'border-white/10 bg-white/5'
            )}
          >
            {placementPhase ? (
              <p className="text-sm font-semibold text-white/80">
                {me && !me.placed ? t('placementTitle') : t('waitingPlacement')}
                <span className="ml-2 text-xs font-normal text-white/40">
                  {t('placedCount', {
                    placed: view.players.filter((p) => p.placed).length,
                    total: view.players.length,
                  })}
                </span>
              </p>
            ) : (
              <>
                <p className={cn('text-base font-bold', isMyTurn ? 'text-emerald-300' : 'text-white/85')}>
                  {isMyTurn ? t('yourTurn') : t('turnOf', { name: activePlayer?.name ?? '—' })}
                  {activePlayer && !isMyTurn && (
                    <span className={cn('ml-1.5 text-xs font-semibold', teamAccent(activePlayer.team))}>
                      ({t('team', { team: TEAM_LABEL[activePlayer.team] })})
                    </span>
                  )}
                </p>
                {isMyTurn && <p className="mt-0.5 text-[11px] text-emerald-200/60">{t('hitReplay')}</p>}
              </>
            )}
          </div>
        )}

        {/* Joueur(s) parti(s) : en attente de leur retour avant remplacement par un bot */}
        {someoneLeft && (
          <div className="mb-3 space-y-0.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center">
            {view.players
              .filter((p) => !p.isBot && p.leftAt)
              .map((p) => {
                const remaining = Math.max(
                  0,
                  Math.ceil(((p.leftAt ?? 0) + TC_REJOIN_GRACE_MS - clock) / 1000)
                )
                return (
                  <p key={p.id} className="text-xs font-semibold text-amber-100">
                    {t('waitingReturn', { name: p.name, seconds: remaining })}
                  </p>
                )
              })}
          </div>
        )}

        {/* Flash dernier tir */}
        <AnimatePresence mode="wait">
          {!placementPhase && feedMessage && (
            <motion.div
              key={view.version}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'mb-3 rounded-xl border px-3 py-2 text-center text-xs font-semibold sm:text-sm',
                lastShot?.result === 'miss'
                  ? 'border-sky-400/30 bg-sky-500/10 text-sky-100'
                  : lastShot?.result === 'hit'
                    ? 'border-amber-400/35 bg-amber-500/15 text-amber-100'
                    : 'border-red-400/40 bg-red-500/15 text-red-100'
              )}
            >
              {feedMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PHASE PLACEMENT ── */}
        {placementPhase && me && !me.placed && (
          <div className="space-y-3">
            <p className="text-center text-xs text-white/50">{t('placementHint')}</p>

            {/* Sélecteur de bateaux + orientation */}
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
                    className={cn(
                      'flex items-center gap-1 rounded-xl border px-2.5 py-2 transition-all',
                      isPlaced
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300/60'
                        : isSelected
                          ? 'border-sky-400/60 bg-sky-500/20 text-white shadow-lg shadow-sky-500/20'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                    )}
                  >
                    {Array.from({ length: shipSize }).map((_, j) => (
                      <span
                        key={j}
                        className={cn(
                          'h-3.5 w-3.5 rounded-[3px]',
                          isPlaced ? 'bg-emerald-400/50' : isSelected ? 'bg-sky-300' : 'bg-white/30'
                        )}
                      />
                    ))}
                    <span className="ml-1 text-[10px]">{t('shipLabel', { size: shipSize })}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-center gap-2">
              <Button
                type="button"
                onClick={() => setHorizontal((h) => !h)}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                {horizontal ? t('horizontal') : t('vertical')}
              </Button>
              <Button
                type="button"
                onClick={randomizePlacement}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                {t('random')}
              </Button>
              <Button
                type="button"
                onClick={() => setPlacedShips([])}
                disabled={placedShips.filter(Boolean).length === 0}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/10 disabled:opacity-40"
              >
                {t('clear')}
              </Button>
            </div>

            {/* Grille de placement */}
            <div className="rounded-2xl border border-sky-500/20 bg-sky-950/40 p-2">
              <div className="grid gap-[2px]" style={gridStyle}>
                {Array.from({ length: size * size }).map((_, cell) => {
                  const mine = myLocalCells.has(cell)
                  const mate = teammateCells.has(cell)
                  return (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => {
                        if (removeShipAt(cell)) return
                        tryPlaceShip(cell)
                      }}
                      className={cn(
                        'game-grid-cell rounded-[3px] transition-colors',
                        mine
                          ? 'bg-sky-400'
                          : mate
                            ? 'bg-sky-700/70'
                            : 'bg-white/[0.06] hover:bg-sky-500/30'
                      )}
                      aria-label={`${cell}`}
                    />
                  )
                })}
              </div>
            </div>

            <Button
              onClick={confirmPlacement}
              disabled={!allShipsPlaced || busy}
              className="w-full rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 py-5 text-base font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:from-sky-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Anchor className="mr-2 h-4 w-4" />
              {t('confirmPlacement')}
              {remainingShips.length > 0 && ` (${sizes.length - remainingShips.length}/${sizes.length})`}
            </Button>
          </div>
        )}

        {/* ── PHASE BATAILLE (+ attente de placement une fois validé) ── */}
        {(!placementPhase || (me && me.placed)) && (
          <div className="space-y-4">
            {/* Grille ennemie — affichée quand mon équipe est au tir */}
            {showEnemyBoard && (
              <div>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-rose-300/80">
                    <Crosshair className="h-3.5 w-3.5" />
                    {t('enemyWaters')}
                  </p>
                  <span className={cn('text-[11px] font-bold', teamAccent(enemy))}>
                    {t('team', { team: TEAM_LABEL[enemy] })}
                  </span>
                </div>
                <div
                  className={cn(
                    'rounded-2xl border p-2 transition-colors',
                    isMyTurn && !finished
                      ? 'border-emerald-400/40 bg-emerald-950/30 shadow-[0_0_24px_rgba(52,211,153,0.1)]'
                      : 'border-white/10 bg-gray-900/50'
                  )}
                >
                  <div className="grid gap-[2px]" style={gridStyle}>
                    {Array.from({ length: size * size }).map((_, cell) => {
                      const shot = enemyShots[cell]
                      const sunk = enemySunkCells.has(cell)
                      return (
                        <button
                          key={cell}
                          type="button"
                          disabled={!isMyTurn || busy || finished || shot !== undefined}
                          onClick={() => fire(cell)}
                          className={cn(
                            'game-grid-cell flex items-center justify-center rounded-[3px] text-[9px] leading-none transition-colors sm:text-[11px]',
                            sunk
                              ? 'bg-red-800'
                              : shot === 'hit'
                                ? 'bg-red-500/90'
                                : shot === 'miss'
                                  ? 'bg-sky-900/70'
                                  : cn('bg-white/[0.07]', isMyTurn && !finished && 'hover:bg-emerald-400/40 active:bg-emerald-400/60')
                          )}
                        >
                          {sunk ? '💀' : shot === 'hit' ? '💥' : shot === 'miss' ? '·' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Ma flotte — affichée pendant le placement et quand l'ennemi tire */}
            {!showEnemyBoard && (
            <div>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-sky-300/80">
                  <Waves className="h-3.5 w-3.5" />
                  {t('yourFleet')}
                </p>
                <span className={cn('text-[11px] font-bold', teamAccent(myTeam))}>
                  {t('team', { team: TEAM_LABEL[myTeam] })}
                </span>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-950/40 p-2">
                <div className="grid gap-[2px]" style={gridStyle}>
                  {Array.from({ length: size * size }).map((_, cell) => {
                    const isShip = myShipCells.has(cell)
                    const shot = myShots[cell]
                    const sunk = mySunkCells.has(cell)
                    return (
                      <div
                        key={cell}
                        className={cn(
                          'game-grid-cell flex items-center justify-center rounded-[3px] text-[9px] leading-none sm:text-[11px]',
                          sunk
                            ? 'bg-red-800'
                            : isShip && shot === 'hit'
                              ? 'bg-red-500/90'
                              : isShip
                                ? 'bg-sky-500/80'
                                : shot === 'miss'
                                  ? 'bg-white/15'
                                  : 'bg-white/[0.06]'
                        )}
                      >
                        {sunk ? '💀' : shot === 'hit' && isShip ? '💥' : shot === 'miss' ? '·' : ''}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            )}

            {/* Légende + équipes/gorgées */}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-white/45">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[2px] bg-sky-500/80" /> {t('legendShip')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[2px] bg-red-500/90" /> {t('legendHit')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[2px] bg-sky-900" /> {t('legendMiss')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[2px] bg-red-800" /> {t('legendSunk')}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((team) => (
                <div
                  key={team}
                  className={cn(
                    'rounded-xl border p-2.5',
                    team === 'A' ? 'border-sky-400/25 bg-sky-500/10' : 'border-rose-400/25 bg-rose-500/10'
                  )}
                >
                  <p className={cn('mb-1.5 text-[11px] font-bold', teamAccent(team))}>
                    {t('team', { team: TEAM_LABEL[team] })}
                    {team === myTeam && ' ⭐'}
                  </p>
                  <ul className="space-y-1">
                    {teamPlayers(team).map((p) => (
                      <li
                        key={p.id}
                        className={cn(
                          'flex items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
                          p.id === activeId ? 'bg-emerald-500/15 text-emerald-200' : 'text-white/70'
                        )}
                      >
                        <span className="truncate">
                          {iconOf(p) ? `${iconOf(p)} ` : ''}
                          {p.name}
                          {p.id === user.id && ' (vous)'}
                        </span>
                        <span className="shrink-0 text-white/45">{p.drinks}🍺</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Écran de victoire */}
      <AnimatePresence>
        {finished && winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('victoryTitle', { team: TEAM_LABEL[winner] })}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            {windowSize.width > 0 && windowSize.height > 0 && myTeam === winner && (
              <ReactConfetti
                width={windowSize.width}
                height={windowSize.height}
                recycle
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
              <div
                className={cn(
                  'p-6',
                  winner === 'A'
                    ? 'bg-gradient-to-br from-sky-600/20 via-transparent to-cyan-600/10'
                    : 'bg-gradient-to-br from-rose-600/20 via-transparent to-red-600/10'
                )}
              >
                <div className="mb-4 flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    className={cn(
                      'flex h-20 w-20 items-center justify-center rounded-2xl text-4xl shadow-xl',
                      winner === 'A'
                        ? 'bg-gradient-to-br from-sky-400 to-cyan-500 shadow-sky-500/40'
                        : 'bg-gradient-to-br from-rose-400 to-red-500 shadow-rose-500/40'
                    )}
                  >
                    <Trophy className="h-10 w-10 text-white" />
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white">
                      {t('victoryTitle', { team: TEAM_LABEL[winner] })}
                    </h2>
                    <p className="mt-1 text-sm text-white/50">
                      {t('defeatDrinks', { team: TEAM_LABEL[otherTeam(winner)] })}
                    </p>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-sky-300">{view.turnCount}</p>
                    <p className="text-[10px] text-white/40">{t('statTurns')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-sky-300">
                      {me && me.shotsFired > 0 ? `${Math.round((me.shotsHit / me.shotsFired) * 100)}%` : '—'}
                    </p>
                    <p className="text-[10px] text-white/40">{t('statAccuracy')}</p>
                  </div>
                </div>

                <div className="mb-5 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    {t('finalBoard')}
                  </p>
                  {[...view.players]
                    .sort((a, b) => b.drinks - a.drinks)
                    .map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          'flex items-center justify-between rounded-xl px-3 py-2',
                          p.team === winner ? 'border border-white/10 bg-white/5' : 'bg-white/5 opacity-80'
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={cn('shrink-0 text-[10px] font-bold', teamAccent(p.team))}>
                            {TEAM_LABEL[p.team]}
                          </span>
                          <span className="truncate text-sm font-semibold text-white">
                            {iconOf(p) ? `${iconOf(p)} ` : ''}
                            {p.name}
                          </span>
                          {p.team === winner && <span aria-hidden>🏆</span>}
                        </div>
                        <span className="shrink-0 text-xs text-white/50">{p.drinks}🍺</span>
                      </div>
                    ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  <Button
                    onClick={() => voteRematch()}
                    disabled={iVotedRematch}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 py-3.5 font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:from-sky-500 hover:to-cyan-400 disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {iVotedRematch
                      ? t('rematchWaiting', { count: rematchVotes.length, total: humanCount })
                      : t('replay')}
                  </Button>
                  <button
                    onClick={() => leaveRoom()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Home className="h-4 w-4" /> {t('backToMenu')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
