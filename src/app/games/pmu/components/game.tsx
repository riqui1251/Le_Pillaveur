"use client"

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Player as BasePlayer, getPlayerGameBoost } from '@/lib/players'
import { usePlayers } from '@/hooks/usePlayers'
import { GameShell } from '@/components/game/GameShell'
import { getColorFromClass, isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { X, CheckCircle2, Minus, Plus, GripVertical } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type GameMode = 'libre' | 'paris'
type Phase = 'mode-select' | 'setup' | 'betting' | 'racing' | 'payout' | 'results'

interface Horse {
  name: string
  emoji: string
  position: number
  colorFrom: string
  colorTo: string
  players: BasePlayer[]
}

// playerId → sip count
type Bets = Record<string, number>
// winnerId → targetPlayerId
type PayoutTargets = Record<string, string>

// ─── Données statiques ───────────────────────────────────────────────────────

const INITIAL_HORSES: Omit<Horse, 'position' | 'players'>[] = [
  { name: 'Tonnerre', emoji: '🔴', colorFrom: '#ef4444', colorTo: '#f97316' },
  { name: 'Éclair',   emoji: '🔵', colorFrom: '#3b82f6', colorTo: '#6366f1' },
  { name: 'Tempête',  emoji: '🟢', colorFrom: '#10b981', colorTo: '#14b8a6' },
  { name: 'Ouragan',  emoji: '🟡', colorFrom: '#f59e0b', colorTo: '#eab308' },
]

function makeHorses(): Horse[] {
  return INITIAL_HORSES.map(h => ({ ...h, position: 0, players: [] }))
}

// ─── Composants UI réutilisables ─────────────────────────────────────────────

function PlayerChip({
  player, selected, onClick, onRemove, size = 'md',
}: {
  player: BasePlayer; selected?: boolean; onClick?: () => void
  onRemove?: () => void; size?: 'sm' | 'md'
}) {
  const bg = getColorFromClass(player.preferences.color)
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-xl border transition-all',
        size === 'sm' ? 'px-2 py-1' : 'px-2.5 py-1.5',
        selected
          ? 'border-amber-400/70 bg-amber-400/20 shadow-[0_0_12px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/40'
          : 'border-white/10 bg-white/[0.06] hover:bg-white/10',
      )}
    >
      <Avatar className="h-6 w-6 shrink-0 border border-white/20" style={{ backgroundColor: bg }}>
        <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
          {player.preferences.icon || player.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className={cn('text-sm font-medium', isSpecialPlayer(player) ? getSpecialEffectClass(player) : 'text-white/90')}>
        {player.name}
      </span>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="ml-0.5 text-white/40 hover:text-white/90">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function Stepper({ value, onChange, min = 1, max = 20 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-lg font-bold tabular-nums text-white">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT SETUP — Drag & Drop
// ═══════════════════════════════════════════════════════════════════════════════

function SetupPhase({
  horses, allPlayers, mode, totalAssigned, nextLabel,
  assignToHorse, unassignPlayer, onBack, onNext,
}: {
  horses: Horse[]
  allPlayers: BasePlayer[]
  mode: GameMode
  totalAssigned: number
  nextLabel: string
  assignToHorse: (p: BasePlayer, idx: number) => void
  unassignPlayer: (p: BasePlayer) => void
  onBack: () => void
  onNext: () => void
}) {
  const [dragging, setDragging] = useState<BasePlayer | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredZone, setHoveredZone] = useState<'pool' | number | null>(null)
  const horseRefs = useRef<(HTMLDivElement | null)[]>([])
  const poolRef = useRef<HTMLDivElement | null>(null)

  const assignedIds = new Set(horses.flatMap(h => h.players.map(p => p.id)))
  const unassigned = allPlayers.filter(p => !assignedIds.has(p.id))

  const getZoneAt = (x: number, y: number): 'pool' | number | null => {
    for (let i = 0; i < horseRefs.current.length; i++) {
      const r = horseRefs.current[i]?.getBoundingClientRect()
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    const pr = poolRef.current?.getBoundingClientRect()
    if (pr && x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom) return 'pool'
    return null
  }

  const startDrag = (e: React.PointerEvent, player: BasePlayer) => {
    e.preventDefault()
    setDragging(player)
    setDragPos({ x: e.clientX, y: e.clientY })
  }

  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return
    setDragPos({ x: e.clientX, y: e.clientY })
    setHoveredZone(getZoneAt(e.clientX, e.clientY))
  }

  const onDrop = (e: React.PointerEvent) => {
    if (!dragging) return
    const zone = getZoneAt(e.clientX, e.clientY)
    if (typeof zone === 'number') assignToHorse(dragging, zone)
    else if (zone === 'pool') unassignPlayer(dragging)
    setDragging(null)
    setDragPos(null)
    setHoveredZone(null)
  }

  return (
    <GameShell
      title="Course PMU"
      onBack={onBack}
      maxWidth={600}
      actionBar={
        <Button
          onClick={onNext}
          disabled={totalAssigned === 0}
          className="w-full h-11 bg-gradient-to-r from-fuchsia-600 to-violet-700 font-semibold text-white hover:from-fuchsia-500 hover:to-violet-600 disabled:opacity-50"
        >
          {totalAssigned === 0 ? 'Glissez des joueurs sur les chevaux' : nextLabel}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Overlay de capture pendant le drag */}
        {dragging && dragPos && (
          <div
            className="fixed inset-0 z-50 cursor-grabbing touch-none"
            onPointerMove={onMove}
            onPointerUp={onDrop}
          >
            {/* Chip fantôme qui suit le doigt */}
            <div
              style={{ position: 'absolute', left: dragPos.x, top: dragPos.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}
              className="opacity-90 scale-110 drop-shadow-2xl"
            >
              <PlayerChip player={dragging} />
            </div>
          </div>
        )}

        {/* Zone non assignés */}
        <div
          ref={poolRef}
          className={cn(
            'min-h-[56px] rounded-2xl border p-3 transition-all duration-150',
            dragging
              ? hoveredZone === 'pool'
                ? 'border-white/35 bg-white/[0.07]'
                : 'border-dashed border-white/15 bg-white/[0.02]'
              : 'border-white/10 bg-white/[0.04]',
          )}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/35">Non assignés</p>
          {unassigned.length === 0 ? (
            <p className="text-center text-xs text-white/25 py-1">
              {dragging ? '← Glisser ici pour désassigner' : 'Tous les joueurs sont assignés ✓'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unassigned.map(p => (
                <div
                  key={p.id}
                  onPointerDown={e => startDrag(e, p)}
                  className={cn('cursor-grab active:cursor-grabbing touch-none select-none', dragging?.id === p.id && 'opacity-30')}
                >
                  <PlayerChip player={p} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grille des chevaux */}
        <div className="grid grid-cols-2 gap-3">
          {horses.map((horse, idx) => {
            const isHovered = dragging !== null && hoveredZone === idx
            return (
              <div
                key={idx}
                ref={el => { horseRefs.current[idx] = el }}
                className={cn(
                  'relative min-h-[100px] overflow-hidden rounded-2xl border p-3 transition-colors duration-150',
                  isHovered
                    ? 'border-white/40'
                    : dragging
                      ? 'border-dashed border-white/15'
                      : 'border-white/10',
                )}
              >
                {/* Fond coloré */}
                <div
                  className={cn('absolute inset-0 transition-opacity duration-150', isHovered ? 'opacity-20' : 'opacity-[0.08]')}
                  style={{ background: `linear-gradient(135deg, ${horse.colorFrom}, ${horse.colorTo})` }}
                />
                <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
                  style={{ background: `linear-gradient(to bottom, ${horse.colorFrom}, ${horse.colorTo})` }} />

                <div className="relative">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-lg">{horse.emoji}</span>
                    <span className="text-sm font-bold text-white">{horse.name}</span>
                    {isHovered && <span className="ml-auto text-xs text-white/60 animate-pulse">Lâcher ici</span>}
                  </div>
                  {horse.players.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {horse.players.map(p => (
                        <div
                          key={p.id}
                          onPointerDown={e => startDrag(e, p)}
                          className={cn('cursor-grab active:cursor-grabbing touch-none select-none', dragging?.id === p.id && 'opacity-30')}
                        >
                          <PlayerChip player={p} size="sm" onRemove={() => unassignPlayer(p)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/25">
                      {dragging ? 'Lâcher ici' : 'Aucun joueur'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </GameShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function Game({ players: initialPlayers, onGameEnd }: GameProps) {
  const [phase, setPhase] = useState<Phase>('mode-select')
  const [mode, setMode] = useState<GameMode>('paris')
  const [horses, setHorses] = useState<Horse[]>(makeHorses)
  const [winner, setWinner] = useState<Horse | null>(null)
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null)
  const [bets, setBets] = useState<Bets>({})
  const [payoutTargets, setPayoutTargets] = useState<PayoutTargets>({})
  const [distSips, setDistSips] = useState(0)

  const initialPlayersRef = useRef(initialPlayers)
  const speedFactorsRef = useRef<number[]>([])
  const accelerationRef = useRef<number[]>([])
  const { updatePlayerStats } = usePlayers()
  const FINISH = 100

  const allPlayers = initialPlayersRef.current

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Retourne l'index du cheval du joueur, ou -1 s'il n'est pas assigné
  const getHorseIndex = (p: BasePlayer) =>
    horses.findIndex(h => h.players.some(x => x.id === p.id))

  // Assigne un joueur au cheval idx (toujours, sans toggle)
  const assignToHorse = (player: BasePlayer, idx: number) => {
    setHorses(prev => {
      const cleaned = prev.map(h => ({ ...h, players: h.players.filter(x => x.id !== player.id) }))
      cleaned[idx].players.push(player)
      return cleaned
    })
  }

  // Retire un joueur de tous les chevaux
  const unassignPlayer = (player: BasePlayer) => {
    setHorses(prev => prev.map(h => ({ ...h, players: h.players.filter(x => x.id !== player.id) })))
  }

  // ── Course ───────────────────────────────────────────────────────────────

  const startRace = () => {
    if (intervalId) clearInterval(intervalId)
    setPhase('racing')

    // Durée cible du vainqueur : 15–35 secondes
    const targetWinnerMs = 15000 + Math.random() * 20000
    // Le vainqueur est le plus rapide des 4 chevaux.
    // E[max de 4 facteurs U(0.85, 1.15)] ≈ 1.09 → on en tient compte pour calibrer la base
    const baseTicks = (targetWinnerMs / 50) * 1.09
    const baseStep = (FINISH / baseTicks) * 2 // ×2 car Math.random() moyenne à 0.5

    // Vitesse et accélération initiales par cheval
    speedFactorsRef.current = horses.map(() => 0.85 + Math.random() * 0.30)
    accelerationRef.current = horses.map(() => 0)

    const id = setInterval(() => {
      // L'accélération dérive lentement (inertie) → crée de vrais épisodes d'accélération/freinage
      accelerationRef.current = accelerationRef.current.map(a => {
        const jerk = (Math.random() - 0.5) * 0.05
        return Math.max(-0.25, Math.min(0.25, a + jerk))
      })
      // La vitesse évolue selon l'accélération accumulée
      speedFactorsRef.current = speedFactorsRef.current.map((f, i) =>
        Math.max(0.3, Math.min(1.9, f + accelerationRef.current[i]))
      )

      setHorses(prev => {
        const updated = prev.map((h, i) => {
          const boost = h.players.length > 0
            ? Math.max(...h.players.map(p => getPlayerGameBoost(p, 'pmu')))
            : 0
          const step = Math.random() * baseStep * (speedFactorsRef.current[i] ?? 1) * (1 + boost / 800)
          return { ...h, position: h.position + step }
        })
        const w = updated.find(h => h.position >= FINISH)
        if (w) {
          clearInterval(id)
          setIntervalId(null)
          setWinner(w)
          w.players.forEach(p => updatePlayerStats(p.id, 'pmu', { gamesPlayed: 1, wins: 1 }))
          initialPlayersRef.current
            .filter(p => !w.players.some(x => x.id === p.id))
            .forEach(p => updatePlayerStats(p.id, 'pmu', { gamesPlayed: 1, wins: 0 }))

          if (mode === 'libre') {
            setDistSips(Math.floor(Math.random() * 7) + 2) // 2-8
            setPhase('results')
          } else if (mode === 'paris') {
            setPhase('payout')
          } else {
            setPhase('results')
          }
        }
        return updated
      })
    }, 50)
    setIntervalId(id)
  }

  const resetFull = () => {
    if (intervalId) clearInterval(intervalId)
    setIntervalId(null)
    setHorses(makeHorses())
    setPhase('mode-select')
    setWinner(null)
    setBets({})
    setPayoutTargets({})
    setDistSips(0)
  }

  const replayGame = () => {
    if (intervalId) clearInterval(intervalId)
    setIntervalId(null)
    setHorses(prev => prev.map(h => ({ ...h, position: 0 })))
    setWinner(null)
    setPayoutTargets({})
    setDistSips(0)
    if (mode === 'paris') {
      setPhase('betting')
    } else {
      setPhase('setup')
    }
  }

  useEffect(() => () => { if (intervalId) clearInterval(intervalId) }, [intervalId])

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — SÉLECTION DU MODE
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'mode-select') {
    const modes: { id: GameMode; emoji: string; title: string; desc: string; colorFrom: string; colorTo: string }[] = [
      {
        id: 'libre', emoji: '🎲', title: 'Libre',
        desc: "Le cheval gagnant fait distribuer un nombre de gorgées généré aléatoirement.",
        colorFrom: '#f59e0b', colorTo: '#f97316',
      },
      {
        id: 'paris', emoji: '🃏', title: 'Paris',
        desc: "Chaque joueur parie des gorgées. Il les boit avant la course et les double s'il gagne.",
        colorFrom: '#10b981', colorTo: '#14b8a6',
      },
    ]

    return (
      <GameShell title="Course PMU" onBack={onGameEnd} maxWidth={600}>
        <div className="space-y-4">
          <p className="text-center text-sm text-white/55">Choisissez votre mode de jeu</p>
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setPhase('setup') }}
              className="group relative w-full overflow-hidden rounded-2xl border border-white/10 p-5 text-left transition-all hover:border-white/25 hover:scale-[1.01] active:scale-[0.99]"
            >
              <div
                className="absolute inset-0 opacity-15 transition-opacity group-hover:opacity-25"
                style={{ background: `linear-gradient(135deg, ${m.colorFrom}, ${m.colorTo})` }}
              />
              <div
                className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
                style={{ background: `linear-gradient(to bottom, ${m.colorFrom}, ${m.colorTo})` }}
              />
              <div className="relative flex items-start gap-4">
                <span className="text-3xl">{m.emoji}</span>
                <div>
                  <p className="font-bold text-white">{m.title}</p>
                  <p className="mt-1 text-sm text-white/55">{m.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — ASSIGNATION DES JOUEURS AUX CHEVAUX
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'setup') {
    const totalAssigned = horses.reduce((s, h) => s + h.players.length, 0)
    const nextLabel = mode === 'paris' ? 'Passer aux paris →' : 'Démarrer la course 🏁'
    return (
      <SetupPhase
        horses={horses}
        allPlayers={allPlayers}
        mode={mode}
        totalAssigned={totalAssigned}
        nextLabel={nextLabel}
        assignToHorse={assignToHorse}
        unassignPlayer={unassignPlayer}
        onBack={() => setPhase('mode-select')}
        onNext={() => mode === 'paris' ? setPhase('betting') : startRace()}
      />
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — PARIS (mode paris uniquement)
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'betting') {
    const assignedPlayers = horses.flatMap(h => h.players)
    const getBet = (id: string) => bets[id] ?? 2

    return (
      <GameShell
        title="Paris 🃏"
        onBack={() => setPhase('setup')}
        maxWidth={600}
        actionBar={
          <Button
            onClick={startRace}
            className="w-full h-11 bg-gradient-to-r from-fuchsia-600 to-violet-700 font-semibold text-white hover:from-fuchsia-500 hover:to-violet-600"
          >
            Confirmer les paris et démarrer 🏁
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-200/80">
            🍺 Chaque joueur parie des gorgées qu&apos;il <strong>boit maintenant</strong>. S&apos;il gagne, il en distribue le <strong>double</strong> à la personne de son choix.
          </div>

          <div className="space-y-2">
            {assignedPlayers.map(player => {
              const horse = horses.find(h => h.players.some(x => x.id === player.id))!
              const bg = getColorFromClass(player.preferences.color)
              return (
                <div key={player.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <Avatar className="h-10 w-10 shrink-0 border border-white/20" style={{ backgroundColor: bg }}>
                    <AvatarFallback className="text-sm font-bold text-white" style={{ backgroundColor: bg }}>
                      {player.preferences.icon || player.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold', isSpecialPlayer(player) ? getSpecialEffectClass(player) : 'text-white')}>
                      {player.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: horse.colorFrom }} />
                      <p className="text-xs text-white/45">{horse.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Stepper value={getBet(player.id)} onChange={v => setBets(prev => ({ ...prev, [player.id]: v }))} />
                    <p className="text-[11px] text-white/40">
                      Boit {getBet(player.id)} → gagne {getBet(player.id) * 2}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — COURSE EN COURS
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'racing') {
    return (
      <GameShell title="Course PMU 🏁" onBack={onGameEnd} maxWidth={800}>
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0f1a0a] to-[#0a1208]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/30">Piste</span>
              <span className="text-xs font-semibold uppercase tracking-widest text-white/30">Arrivée 🏁</span>
            </div>
            <div className="space-y-2 p-3">
              {horses.map((horse, idx) => {
                const pct = Math.min(horse.position, FINISH)
                const trackPct = (pct / FINISH) * 100
                return (
                  <div key={idx} className="relative flex items-center gap-2">
                    <div className="w-20 shrink-0 text-right">
                      <span className="text-xs font-medium text-white/60">{horse.name}</span>
                      {horse.players.length > 0 && (
                        <p className="truncate text-[10px] text-white/35">
                          {horse.players.map(p => p.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="relative h-9 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
                      <div className="absolute inset-0 opacity-20"
                        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 21px)' }} />
                      <div className="absolute inset-y-0 left-0 rounded-xl transition-all"
                        style={{ width: `${trackPct}%`, background: `linear-gradient(90deg, ${horse.colorFrom}40, ${horse.colorTo}60)` }} />
                      <motion.div
                        className="absolute top-0 flex h-full items-center"
                        animate={{ left: `${Math.max(trackPct - 2, 0)}%` }}
                        transition={{ type: 'spring', damping: 18, stiffness: 120 }}
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-base shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${horse.colorFrom}, ${horse.colorTo})` }}>
                          🐎
                        </div>
                      </motion.div>
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/40">
                      {Math.round(pct)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {horses.filter(h => h.players.length > 0).map(horse => (
              <div key={horse.name} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: horse.colorFrom }} />
                <span className="text-xs font-medium text-white/70">{horse.name} :</span>
                {horse.players.map(p => (
                  <span key={p.id} className={cn('text-xs', isSpecialPlayer(p) ? getSpecialEffectClass(p) : 'text-white/90')}>
                    {p.name}
                    {mode === 'paris' && bets[p.id] ? ` (${bets[p.id]}🍺)` : ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — SÉLECTION DES CIBLES (mode paris)
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'payout' && winner) {
    const winningPlayers = winner.players
    const allTargets = allPlayers.filter(p => !winner.players.some(x => x.id === p.id))
    const allSelected = winningPlayers.every(p => payoutTargets[p.id])

    return (
      <GameShell
        title="Distribution des gorgées 🍺"
        onBack={onGameEnd}
        maxWidth={600}
        actionBar={
          <Button
            onClick={() => setPhase('results')}
            disabled={!allSelected}
            className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
          >
            Voir les résultats
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
              style={{ background: `linear-gradient(135deg, ${winner.colorFrom}, ${winner.colorTo})` }}>
              🏆
            </div>
            <p className="font-bold text-white">{winner.name} a gagné !</p>
            <p className="text-sm text-white/55">Chaque gagnant choisit à qui distribuer ses gorgées.</p>
          </div>

          {winningPlayers.length === 0 ? (
            <p className="text-center text-sm text-white/40">Aucun joueur sur ce cheval.</p>
          ) : winningPlayers.map(player => {
            const bet = bets[player.id] ?? 2
            const payout = bet * 2
            const bg = getColorFromClass(player.preferences.color)
            return (
              <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0 border border-white/20" style={{ backgroundColor: bg }}>
                    <AvatarFallback className="text-sm font-bold text-white" style={{ backgroundColor: bg }}>
                      {player.preferences.icon || player.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className={cn('font-semibold', isSpecialPlayer(player) ? getSpecialEffectClass(player) : 'text-white')}>
                      {player.name}
                    </p>
                    <p className="text-sm text-amber-300">distribue {payout} gorgées 🍺</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-white/45">À qui ?</p>
                  {allTargets.length === 0 ? (
                    <p className="text-xs text-white/30">Tous les joueurs sont gagnants.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTargets.map(target => {
                        const tbg = getColorFromClass(target.preferences.color)
                        const isChosen = payoutTargets[player.id] === target.id
                        return (
                          <button
                            key={target.id}
                            onClick={() => setPayoutTargets(prev => ({ ...prev, [player.id]: target.id }))}
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all',
                              isChosen
                                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                                : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white',
                            )}
                          >
                            <Avatar className="h-5 w-5" style={{ backgroundColor: tbg }}>
                              <AvatarFallback className="text-[9px] font-bold text-white" style={{ backgroundColor: tbg }}>
                                {target.preferences.icon || target.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {target.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — RÉSULTATS FINAUX
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'results' && winner) {
    return (
      <GameShell title="Course PMU" onBack={onGameEnd} maxWidth={600} center>
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/20 text-5xl shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${winner.colorFrom}, ${winner.colorTo})` }}>
            🏆
          </div>

          <div>
            <p className="text-lg text-white/60">Vainqueur</p>
            <h2 className="mt-1 text-4xl font-extrabold"
              style={{ backgroundImage: `linear-gradient(135deg, ${winner.colorFrom}, ${winner.colorTo})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {winner.name}
            </h2>
          </div>

          {/* Résumé selon le mode */}
          {mode === 'libre' && (
            <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-6 py-4">
              <p className="text-4xl font-extrabold text-amber-300">{distSips} 🍺</p>
              <p className="mt-2 text-sm text-white/60">
                {winner.players.length > 0
                  ? `${winner.players.map(p => p.name).join(', ')} ${winner.players.length === 1 ? 'distribue' : 'distribuent'} ${distSips} gorgées.`
                  : `L'équipe de ${winner.name} distribue ${distSips} gorgées.`}
              </p>
            </div>
          )}

          {mode === 'paris' && winner.players.length > 0 && (
            <div className="w-full space-y-2">
              {winner.players.map(p => {
                const bet = bets[p.id] ?? 2
                const target = allPlayers.find(x => x.id === payoutTargets[p.id])
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <PlayerChip player={p} />
                    <span className="text-white/40">→</span>
                    <span className="text-amber-300 font-semibold">{bet * 2} 🍺</span>
                    {target && (
                      <>
                        <span className="text-white/40">à</span>
                        <PlayerChip player={target} />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Classement */}
          <div className="w-full space-y-2">
            {[...horses].sort((a, b) => b.position - a.position).map((h, i) => (
              <div key={h.name} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
                <span className="w-5 text-center text-sm font-bold text-white/50">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: h.colorFrom }} />
                <span className="flex-1 text-sm font-medium text-white/80">{h.name}</span>
                <span className="text-xs text-white/40">{Math.round(Math.min(h.position, 100))}%</span>
              </div>
            ))}
          </div>

          <div className="flex w-full gap-3">
            <Button onClick={replayGame} className="flex-1 bg-gradient-to-r from-fuchsia-600 to-violet-700 font-semibold text-white hover:from-fuchsia-500 hover:to-violet-600">
              Rejouer
            </Button>
            <Button onClick={onGameEnd} variant="outline" className="flex-1 border-white/20 text-white hover:bg-white/10">
              Quitter
            </Button>
          </div>
        </div>
      </GameShell>
    )
  }

  return null
}
