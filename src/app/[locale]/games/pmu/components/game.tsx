"use client"

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Flag, LogOut, Minus, Plus, RotateCcw, Tv, UserMinus } from 'lucide-react'
import { Player as BasePlayer } from '@/lib/players'
import { usePlayers } from '@/hooks/usePlayers'
import { useCastRoom } from '@/hooks/useCastRoom'
import type { PmuCastState } from '@/lib/cast-types'
import { GameShell } from '@/components/game/GameShell'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MedalDot } from '@/components/online/MedalDot'
import { firstMissingPick, needsPayout, payoutTargets, rankHorses } from './race'

// ─── Types ───────────────────────────────────────────────────────────────────

type GameMode = 'libre' | 'paris'
type Phase = 'mode-select' | 'setup' | 'betting' | 'racing' | 'payout' | 'results'
type PmuT = ReturnType<typeof useTranslations<'games.pmu'>>

interface Horse {
  key: 'tonnerre' | 'eclair' | 'tempete' | 'ouragan'
  /** Numéro de casaque : distingue les chevaux sans compter sur la seule couleur. */
  number: number
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

const HORSE_DEFS: Omit<Horse, 'position' | 'players' | 'name'>[] = [
  { key: 'tonnerre', number: 1, emoji: '🔴', colorFrom: '#ef4444', colorTo: '#f97316' },
  { key: 'eclair',   number: 2, emoji: '🔵', colorFrom: '#3b82f6', colorTo: '#6366f1' },
  { key: 'tempete',  number: 3, emoji: '🟢', colorFrom: '#10b981', colorTo: '#14b8a6' },
  { key: 'ouragan',  number: 4, emoji: '🟡', colorFrom: '#f59e0b', colorTo: '#eab308' },
]

const DEFAULT_BET = 2

// Damier crème/encre de la ligne d'arrivée (cases de 3 px sur 6 px de large).
const CHECKER = 'repeating-conic-gradient(#F3EAD3 0% 25%, #24201A 0% 50%)'

function makeHorses(t: (key: string) => string): Horse[] {
  return HORSE_DEFS.map(h => ({ ...h, name: t(`horses.${h.key}`), position: 0, players: [] }))
}

// ─── Composants UI réutilisables ─────────────────────────────────────────────

const BADGE = {
  sm: { box: 'h-7 w-7 text-sm', ring: 3 },
  md: { box: 'h-8 w-8 text-base', ring: 4 },
  lg: { box: 'h-14 w-14 text-2xl', ring: 5 },
  xl: { box: 'h-20 w-20 text-4xl', ring: 7 },
} as const

/**
 * Casaque numérotée : anneau à la couleur du cheval, centre crème, numéro à
 * l'encre (13,5:1). Les quatre pastilles portaient le même 🐎 : seule la
 * couleur les distinguait.
 */
function HorseBadge({ horse, size = 'md' }: { horse: Pick<Horse, 'number' | 'colorFrom'>; size?: keyof typeof BADGE }) {
  const { box, ring } = BADGE[size]
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-cream font-display font-bold leading-none tabular-nums text-[#24201A]',
        box,
      )}
      style={{ boxShadow: `inset 0 0 0 ${ring}px ${horse.colorFrom}, 0 2px 6px -2px rgba(0,0,0,0.6)` }}
    >
      {horse.number}
    </span>
  )
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep'

function PlayerChip({ player, selected, onClick }: { player: BasePlayer; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'pointer-events-auto flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-semibold text-cream transition-colors',
        FOCUS_RING,
        selected ? 'border-gold bg-gold/[0.15] ring-2 ring-gold' : 'border-gold/20 bg-black/25 hover:bg-black/40',
      )}
    >
      <PlayerIcon player={player} size="sm" />
      <span className="min-w-0 truncate">
        <PlayerName player={player} />
      </span>
    </button>
  )
}

const STEP_BUTTON = cn(
  'flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-black/25 text-gold transition-colors hover:bg-gold/10 active:bg-gold/20 disabled:opacity-40',
  FOCUS_RING,
)

function Stepper({
  value, onChange, lessLabel, moreLabel, min = 1, max = 20,
}: {
  value: number; onChange: (v: number) => void; lessLabel: string; moreLabel: string; min?: number; max?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={lessLabel} className={STEP_BUTTON}>
        <Minus aria-hidden className="h-5 w-5" />
      </button>
      <output aria-live="polite" className="w-8 text-center font-display text-2xl font-bold tabular-nums text-gold">
        {value}
      </output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={moreLabel} className={STEP_BUTTON}>
        <Plus aria-hidden className="h-5 w-5" />
      </button>
    </div>
  )
}

const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-[0.18em] text-gold'

// ─── Props ───────────────────────────────────────────────────────────────────

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT SETUP — Toucher un joueur, puis un cheval
// ═══════════════════════════════════════════════════════════════════════════════

function SetupPhase({
  horses, allPlayers, totalAssigned, next, t, headerRight, castInfo,
  assignToHorse, unassignPlayer, onBack, onNext,
}: {
  horses: Horse[]
  allPlayers: BasePlayer[]
  totalAssigned: number
  next: ReactNode
  t: PmuT
  headerRight: ReactNode
  castInfo: ReactNode
  assignToHorse: (p: BasePlayer, idx: number) => void
  unassignPlayer: (p: BasePlayer) => void
  onBack: () => void
  onNext: () => void
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<BasePlayer | null>(null)

  const assignedIds = new Set(horses.flatMap(h => h.players.map(p => p.id)))
  const unassigned = allPlayers.filter(p => !assignedIds.has(p.id))
  const selectedHorse = selectedPlayer
    ? horses.find(h => h.players.some(p => p.id === selectedPlayer.id)) ?? null
    : null

  const toggleSelect = (player: BasePlayer) => {
    setSelectedPlayer(prev => (prev?.id === player.id ? null : player))
  }

  const assignSelected = (horseIdx: number) => {
    if (!selectedPlayer) return
    assignToHorse(selectedPlayer, horseIdx)
    setSelectedPlayer(null)
  }

  const unassignSelected = () => {
    if (!selectedPlayer) return
    unassignPlayer(selectedPlayer)
    setSelectedPlayer(null)
  }

  return (
    <GameShell
      title={t('title')}
      onBack={onBack}
      maxWidth={600}
      headerRight={headerRight}
      actionBar={
        <Button variant="primary" size="gameLg" className="w-full" onClick={onNext} disabled={totalAssigned === 0}>
          {totalAssigned === 0 ? t('setup.needOne') : next}
        </Button>
      }
    >
      {castInfo}
      <div className="space-y-4 text-cream">
        <p role="status" aria-live="polite" className="text-center text-sm text-cream/80">
          {selectedPlayer
            ? t('setup.selectedHint', { name: selectedPlayer.name })
            : t('setup.defaultHint')}
        </p>

        {/* Joueurs sans cheval — et, pour un joueur déjà monté, le geste qui le fait descendre */}
        <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h2 className={SECTION_TITLE}>{t('setup.unassigned')}</h2>
          {selectedPlayer && selectedHorse && (
            <button
              type="button"
              onClick={unassignSelected}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold/60 px-3 text-sm font-semibold text-gold transition-colors hover:bg-gold/10',
                FOCUS_RING,
              )}
            >
              <UserMinus aria-hidden className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                {t('setup.removeFromHorse', { name: selectedPlayer.name, horse: selectedHorse.name })}
              </span>
            </button>
          )}
          {unassigned.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {unassigned.map(p => (
                <PlayerChip key={p.id} player={p} selected={selectedPlayer?.id === p.id} onClick={() => toggleSelect(p)} />
              ))}
            </div>
          ) : (
            !selectedPlayer && (
              <p className="flex items-center justify-center gap-1.5 py-2 text-sm text-cream/80">
                <Check aria-hidden className="h-4 w-4 text-emerald-300" />
                {t('setup.allAssigned')}
              </p>
            )
          )}
        </section>

        {/* Grille des chevaux : toute la carte est la cible, les joueurs posés dessus restent touchables */}
        <div className="grid grid-cols-2 gap-3">
          {horses.map((horse, idx) => {
            const isTarget = selectedPlayer !== null && selectedHorse?.key !== horse.key
            return (
              <div
                key={horse.key}
                className={cn(
                  'relative flex min-h-[120px] flex-col gap-2 overflow-hidden rounded-2xl border bg-felt-deep/70 p-3',
                  isTarget ? 'border-dashed border-gold/60' : 'border-gold/20',
                )}
              >
                <div
                  aria-hidden
                  className={cn('pointer-events-none absolute inset-0 transition-opacity duration-150', isTarget ? 'opacity-20' : 'opacity-10')}
                  style={{ background: `linear-gradient(135deg, ${horse.colorFrom}, ${horse.colorTo})` }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-1"
                  style={{ background: `linear-gradient(to bottom, ${horse.colorFrom}, ${horse.colorTo})` }}
                />
                <button
                  type="button"
                  disabled={!isTarget}
                  onClick={() => assignSelected(idx)}
                  aria-label={isTarget && selectedPlayer
                    ? t('setup.assignTo', { name: selectedPlayer.name, horse: horse.name })
                    : horse.name}
                  className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold disabled:cursor-default"
                />

                <div className="pointer-events-none relative flex items-center gap-2">
                  <HorseBadge horse={horse} />
                  <span className="min-w-0 truncate font-display text-base font-bold text-cream">{horse.name}</span>
                </div>
                {horse.players.length > 0 && (
                  <div className="pointer-events-none relative flex flex-wrap gap-1.5">
                    {horse.players.map(p => (
                      <PlayerChip key={p.id} player={p} selected={selectedPlayer?.id === p.id} onClick={() => toggleSelect(p)} />
                    ))}
                  </div>
                )}
                {isTarget ? (
                  <p className="pointer-events-none relative mt-auto text-xs font-semibold text-gold">{t('setup.tapToAssign')}</p>
                ) : horse.players.length === 0 ? (
                  <p className="pointer-events-none relative mt-auto text-xs text-cream/70">{t('setup.noPlayer')}</p>
                ) : null}
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
  const t = useTranslations('games.pmu')
  const locale = useLocale()
  const reduceMotion = useReducedMotion()
  const initialHorses = useMemo(() => makeHorses((key) => t(key as 'horses.tonnerre')), [t])
  const [phase, setPhase] = useState<Phase>('mode-select')
  const [mode, setMode] = useState<GameMode>('paris')
  const [horses, setHorses] = useState<Horse[]>(initialHorses)
  const [winner, setWinner] = useState<Horse | null>(null)
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null)
  const [bets, setBets] = useState<Bets>({})
  const [payoutTargetsById, setPayoutTargets] = useState<PayoutTargets>({})
  const [distSips, setDistSips] = useState(0)
  const [confirmDialog, confirm] = useConfirmAction()

  const initialPlayersRef = useRef(initialPlayers)
  const speedFactorsRef = useRef<number[]>([])
  const accelerationRef = useRef<number[]>([])
  const payoutCardsRef = useRef<Record<string, HTMLElement | null>>({})
  const { updatePlayerStats } = usePlayers()
  const FINISH = 100

  const allPlayers = initialPlayersRef.current
  const betOf = (id: string) => bets[id] ?? DEFAULT_BET
  // Intl.ListFormat manque avant Safari 14.1 : sans repli, l'écran de fin plantait sur un vieil iPhone.
  const listNames = (names: string[]) =>
    typeof Intl.ListFormat === 'function'
      ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
      : names.join(', ')

  // ── Cast sur TV ────────────────────────────────────────────────────────────
  const tTv = useTranslations('tv')
  const { code: castCode, active: castActive, start: startCast, push: pushCast, pushFrame: pushCastFrame, stop: stopCast } = useCastRoom('pmu')

  const raceSeqRef = useRef(0)

  const buildCastState = useCallback((): PmuCastState => {
    const castPhase: PmuCastState['phase'] =
      phase === 'racing' ? 'racing' : phase === 'payout' || phase === 'results' ? 'finished' : 'waiting'
    const stage: PmuCastState['stage'] =
      phase === 'betting' || phase === 'payout' || phase === 'results' ? phase : phase === 'racing' ? undefined : 'setup'
    const castBetOf = (id: string) => bets[id] ?? DEFAULT_BET
    return {
      castKind: 'pmu',
      phase: castPhase,
      finish: FINISH,
      horses: horses.map((h) => ({
        key: h.key,
        name: h.name,
        emoji: h.emoji,
        colorFrom: h.colorFrom,
        colorTo: h.colorTo,
        players: h.players.map((p) => p.name),
        position: Math.min(h.position, FINISH),
        ...(mode === 'paris' && stage !== 'setup' ? { bets: h.players.map((p) => castBetOf(p.id)) } : {}),
      })),
      winnerKey: winner?.key ?? null,
      // Pendant le choix du mode, celui de la course précédente n'est plus le bon : la TV attend sans titre.
      mode: phase === 'mode-select' ? undefined : mode,
      stage,
      race: raceSeqRef.current,
      distSips: mode === 'libre' && phase === 'results' ? distSips : null,
      payouts:
        mode === 'paris' && winner && castPhase === 'finished'
          ? winner.players.map((p) => ({
              name: p.name,
              sips: castBetOf(p.id) * 2,
              target: allPlayers.find((x) => x.id === payoutTargetsById[p.id])?.name ?? null,
            }))
          : [],
      ...(mode === 'paris' && winner && castPhase === 'finished'
        ? { noTargets: payoutTargets(allPlayers, winner.players).length === 0 }
        : {}),
    }
  }, [phase, horses, winner, mode, bets, distSips, payoutTargetsById, allPlayers, FINISH])

  const buildRef = useRef(buildCastState)
  buildRef.current = buildCastState

  const toggleCast = () => {
    if (castActive) void stopCast()
    else void startCast(JSON.stringify(buildCastState()))
  }

  // Pousse le plateau/état sur les transitions STABLES (phase, vainqueur, parieurs)
  // — surtout pas à chaque tick de course (les positions passent par les trames).
  const horsePlayersSig = horses.map((h) => `${h.key}:${h.players.map((p) => p.id).join(',')}`).join('|')
  const betsSig = JSON.stringify(bets)
  const targetsSig = JSON.stringify(payoutTargetsById)
  useEffect(() => {
    if (castActive) pushCast(JSON.stringify(buildRef.current()))
  }, [castActive, phase, winner, horsePlayersSig, mode, betsSig, targetsSig, distSips, pushCast])

  // Diffuse les positions des chevaux pendant la course (~12/s).
  const lastFrameRef = useRef(0)
  useEffect(() => {
    if (!castActive || phase !== 'racing') return
    const now = Date.now()
    if (now - lastFrameRef.current < 80) return
    lastFrameRef.current = now
    const positions: Record<string, number> = {}
    horses.forEach((h) => {
      positions[h.key] = Math.min(h.position, FINISH)
    })
    pushCastFrame(JSON.stringify({ positions, race: raceSeqRef.current }))
  }, [castActive, phase, horses, pushCastFrame, FINISH])

  // Le bouton TV vit dans l'en-tête à chaque écran : on peut lancer la diffusion
  // avant le départ, plus seulement au milieu de la course.
  const castButton = (
    <Button
      variant="ghost"
      size="gameIcon"
      onClick={toggleCast}
      aria-pressed={castActive}
      aria-label={tTv('castToTv')}
      className={cn(
        'border',
        castActive
          ? 'border-gold/60 bg-gold/[0.15] text-gold hover:bg-gold/20 hover:text-gold'
          : 'border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold',
      )}
    >
      <Tv aria-hidden className="h-5 w-5" />
    </Button>
  )

  const castInfo = castActive && castCode ? (
    <p className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-center text-xs text-gold">
      <Tv aria-hidden className="h-4 w-4 shrink-0" />
      {tTv('castHint')}
      <span className="font-mono text-sm font-black tracking-widest text-cream">{castCode}</span>
    </p>
  ) : null

  // Quitter en pleine course ou pendant la distribution perd la course : on demande d'abord.
  const askQuit = async () => {
    const ok = await confirm({
      title: t('quitRace.title'),
      description: t('quitRace.description'),
      confirmLabel: t('quitRace.confirm'),
      tone: 'danger',
    })
    if (ok) onGameEnd()
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

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
    raceSeqRef.current += 1
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
          const step = Math.random() * baseStep * (speedFactorsRef.current[i] ?? 1)
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
          } else if (needsPayout(initialPlayersRef.current, w.players)) {
            setPhase('payout')
          } else {
            // Personne à qui donner, ou personne pour donner : l'écran de
            // distribution n'aurait rien à choisir (et restait bloqué).
            setPhase('results')
          }
        }
        return updated
      })
    }, 50)
    setIntervalId(id)
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

  let screen: ReactNode = null

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — SÉLECTION DU MODE
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'mode-select') {
    const modes: GameMode[] = ['libre', 'paris']

    screen = (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={600} headerRight={castButton}>
        {castInfo}
        <div className="space-y-4 text-cream">
          <p className="text-center text-sm text-cream/80">{t('chooseMode')}</p>
          {modes.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setPhase('setup') }}
              className={cn(
                'w-full rounded-2xl border border-gold/20 bg-felt-deep/70 p-4 text-left transition-all hover:border-gold/50 motion-safe:hover:scale-[1.01] motion-safe:active:scale-[0.99]',
                FOCUS_RING,
              )}
            >
              <p className="font-display text-lg font-bold text-cream">{t(`modes.${m}.title`)}</p>
              <p className="mt-1 text-sm text-cream/80">{t(`modes.${m}.desc`)}</p>
            </button>
          ))}
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — ASSIGNATION DES JOUEURS AUX CHEVAUX
  // ══════════════════════════════════════════════════════════════════════════

  else if (phase === 'setup') {
    const totalAssigned = horses.reduce((s, h) => s + h.players.length, 0)
    const next = mode === 'paris'
      ? <>{t('setup.nextBets')}<ArrowRight aria-hidden className="ml-2 h-5 w-5" /></>
      : <><Flag aria-hidden className="mr-2 h-5 w-5" />{t('setup.nextRace')}</>
    screen = (
      <SetupPhase
        horses={horses}
        allPlayers={allPlayers}
        totalAssigned={totalAssigned}
        next={next}
        t={t}
        headerRight={castButton}
        castInfo={castInfo}
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

  else if (phase === 'betting') {
    const riders = horses.flatMap(h => h.players.map(player => ({ player, horse: h })))

    screen = (
      <GameShell
        title={t('titleBetting')}
        onBack={() => setPhase('setup')}
        maxWidth={600}
        headerRight={castButton}
        actionBar={
          <Button variant="primary" size="gameLg" className="w-full" onClick={startRace}>
            <Flag aria-hidden className="mr-2 h-5 w-5" />
            {t('betting.confirm')}
          </Button>
        }
      >
        {castInfo}
        <div className="space-y-4 text-cream">
          <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
            {t('betting.info')}
          </p>

          <ul className="space-y-2">
            {riders.map(({ player, horse }) => {
              const bet = betOf(player.id)
              return (
                <li key={player.id} className="flex items-center gap-2 rounded-2xl border border-gold/20 bg-black/20 p-3">
                  <PlayerIcon player={player} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-cream">
                      <PlayerName player={player} />
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-cream/80">
                      <HorseBadge horse={horse} size="sm" />
                      <span className="min-w-0 truncate">{horse.name}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <Stepper
                      value={bet}
                      onChange={v => setBets(prev => ({ ...prev, [player.id]: v }))}
                      lessLabel={t('betting.less', { name: player.name })}
                      moreLabel={t('betting.more', { name: player.name })}
                    />
                    <p className="text-xs tabular-nums text-cream/80">
                      {t('betting.drinkWin', { bet, payout: bet * 2 })}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — COURSE EN COURS
  // ══════════════════════════════════════════════════════════════════════════

  else if (phase === 'racing') {
    const started = horses.some(h => h.position > 0)
    const liveRank = new Map(rankHorses(horses, null).map((h, i) => [h.key, i + 1]))

    screen = (
      <GameShell title={t('titleRacing')} onBack={() => void askQuit()} maxWidth={800} headerRight={castButton}>
        {castInfo}
        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3 text-cream">
          <p className={cn('mb-1 flex items-center justify-end gap-1.5', SECTION_TITLE)}>
            {t('race.finish')}
            <Flag aria-hidden className="h-3.5 w-3.5" />
          </p>
          <div className="space-y-3">
            {horses.map(horse => {
              const trackPct = (Math.min(horse.position, FINISH) / FINISH) * 100
              const rank = started ? liveRank.get(horse.key) ?? null : null
              const riders = horse.players
                .map(p => (mode === 'paris' ? `${p.name} ${betOf(p.id)}🍺` : p.name))
                .join(', ')
              return (
                <div key={horse.key}>
                  <div className="mb-1 flex min-h-[28px] items-center gap-2">
                    <HorseBadge horse={horse} size="sm" />
                    <span className="shrink-0 font-display text-sm font-bold text-cream">{horse.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-cream/80">{riders}</span>
                    {rank !== null && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                          rank === 1 ? 'bg-amber-500 text-[#24201A]' : 'border border-cream/20 text-cream/80',
                        )}
                      >
                        {t('race.rank', { rank })}
                      </span>
                    )}
                  </div>
                  <div className="relative h-11 overflow-hidden rounded-xl border border-gold/20 bg-black/30">
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgb(var(--gold-rgb) / 0.12) 20px, rgb(var(--gold-rgb) / 0.12) 21px)' }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 rounded-xl transition-all"
                      style={{ width: `${trackPct}%`, background: `linear-gradient(90deg, ${horse.colorFrom}40, ${horse.colorTo}60)` }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-y-0 right-0 w-1.5"
                      style={{ backgroundImage: CHECKER, backgroundSize: '6px 6px' }}
                    />
                    {/* Rail raccourci de la largeur de la casaque : à 100 %, elle touche
                        l'arrivée sans jamais passer sous le bord de la piste. */}
                    <div className="absolute inset-y-0 left-1 right-9">
                      <motion.div
                        className="absolute inset-y-0 flex items-center"
                        initial={false}
                        animate={{ left: `${trackPct}%` }}
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 18, stiffness: 120 }}
                      >
                        <HorseBadge horse={horse} />
                      </motion.div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — SÉLECTION DES CIBLES (mode paris)
  // ══════════════════════════════════════════════════════════════════════════

  else if (phase === 'payout' && winner) {
    const winningPlayers = winner.players
    const targets = payoutTargets(allPlayers, winningPlayers)
    const missing = firstMissingPick(winningPlayers, payoutTargetsById)

    // Le bouton du bas nomme le gagnant qui n'a pas encore choisi et mène à sa carte.
    const goToMissing = () => {
      if (!missing) return
      const card = payoutCardsRef.current[missing.id]
      if (!card) return
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
      card.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    }

    screen = (
      <GameShell
        title={t('titlePayout')}
        onBack={() => void askQuit()}
        maxWidth={600}
        headerRight={castButton}
        actionBar={
          missing ? (
            <Button variant="quiet" size="gameLg" className="w-full" onClick={goToMissing}>
              <span className="min-w-0 truncate">{t('payout.pickFor', { name: missing.name })}</span>
            </Button>
          ) : (
            <Button variant="primary" size="gameLg" className="w-full" onClick={() => setPhase('results')}>
              {t('results.seeResults')}
              <ArrowRight aria-hidden className="ml-2 h-5 w-5" />
            </Button>
          )
        }
      >
        {/* Monté avec l'écran : le premier gagnant à choisir sert de point de
            départ, sans flash ; ensuite, le téléphone passe au gagnant suivant. */}
        <PassPhoneOverlay
          playerKey={missing?.id ?? null}
          name={missing?.name ?? ''}
          avatar={missing ? <PlayerIcon player={missing} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        />
        {castInfo}
        <div className="space-y-4 text-cream">
          <div className="flex flex-col items-center gap-2 text-center">
            <HorseBadge horse={winner} size="lg" />
            <p className="font-display text-2xl font-bold text-gold">{t('results.winner', { name: winner.name })}</p>
            <p className="text-sm text-cream/80">{t('results.pickTarget')}</p>
          </div>

          {winningPlayers.map(player => {
            const payout = betOf(player.id) * 2
            return (
              <section
                key={player.id}
                ref={el => { payoutCardsRef.current[player.id] = el }}
                className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4"
              >
                <div className="flex items-center gap-3">
                  <PlayerIcon player={player} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-cream">
                      <PlayerName player={player} />
                    </p>
                    <p className="font-display text-sm font-bold text-gold">{t('payout.toGive', { count: payout })} 🍺</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm text-cream/80">{t('results.toWhom')}</p>
                  <div role="group" aria-label={t('payout.pickFor', { name: player.name })} className="flex flex-wrap gap-2">
                    {targets.map(target => {
                      const isChosen = payoutTargetsById[player.id] === target.id
                      return (
                        <button
                          key={target.id}
                          type="button"
                          aria-pressed={isChosen}
                          onClick={() => setPayoutTargets(prev => ({ ...prev, [player.id]: target.id }))}
                          className={cn(
                            'flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border px-3 text-left text-sm transition-colors',
                            FOCUS_RING,
                            isChosen
                              ? 'border-gold bg-gold/[0.15] font-semibold text-cream ring-1 ring-gold'
                              : 'border-gold/20 bg-black/20 text-cream/80 hover:bg-black/30 hover:text-cream',
                          )}
                        >
                          <PlayerIcon player={target} size="sm" />
                          <span className="min-w-0 flex-1 truncate">
                            <PlayerName player={target} />
                          </span>
                          {isChosen && <Check aria-hidden className="h-4 w-4 shrink-0 text-gold" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </GameShell>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — RÉSULTATS FINAUX
  // ══════════════════════════════════════════════════════════════════════════

  else if (phase === 'results' && winner) {
    const riders = winner.players
    const nobodyToGiveTo = payoutTargets(allPlayers, riders).length === 0
    const ranked = rankHorses(horses, winner.key)

    let verdict: ReactNode = null
    if (mode === 'libre') {
      verdict = (
        <>
          <p className="font-display text-4xl font-bold tabular-nums text-gold">{distSips} 🍺</p>
          <p className="mt-2 text-base text-cream">
            {riders.length > 0
              ? t('results.libreVerdict', { names: listNames(riders.map(p => p.name)), riders: riders.length, count: distSips })
              : t('results.libreWin', { name: winner.name, count: distSips })}
          </p>
        </>
      )
    } else if (riders.length === 0) {
      verdict = <p className="text-base text-cream">{t('results.noRider')}</p>
    } else if (nobodyToGiveTo) {
      verdict = <p className="text-base font-semibold text-cream">{t('results.allWinners')}</p>
    } else {
      verdict = (
        <ul className="space-y-2 text-left">
          {riders.map(p => {
            const target = allPlayers.find(x => x.id === payoutTargetsById[p.id])
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gold/20 bg-black/20 px-3 py-3">
                <PlayerIcon player={p} size="md" />
                <p className="min-w-0 flex-1 text-base text-cream/80">
                  {t.rich('results.distribute', {
                    name: p.name,
                    target: target?.name ?? '?',
                    count: betOf(p.id) * 2,
                    strong: chunks => <strong className="font-bold text-cream">{chunks}</strong>,
                    sips: chunks => <span className="font-bold text-gold">{chunks}</span>,
                  })}
                </p>
              </li>
            )
          })}
        </ul>
      )
    }

    screen = (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={600} headerRight={castButton}>
        {castInfo}
        <div className="flex flex-col items-center gap-5 py-2 text-center text-cream">
          <HorseBadge horse={winner} size="xl" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('results.winner', { name: winner.name })}</h2>

          <div className="w-full rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-4">{verdict}</div>

          {/* Classement */}
          <section className="w-full text-left">
            <h3 className={cn('mb-2', SECTION_TITLE)}>{tTv('standings')}</h3>
            <ol className="space-y-2">
              {ranked.map((h, i) => (
                <li
                  key={h.key}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                    h.key === winner.key ? 'border-gold/60 bg-gold/10' : 'border-gold/20 bg-black/20',
                  )}
                >
                  <span className="flex w-6 shrink-0 items-center justify-center text-sm font-bold text-cream/80">
                    {i < 3 ? <MedalDot position={i + 1} /> : `${i + 1}.`}
                  </span>
                  <HorseBadge horse={h} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold text-cream">{h.name}</p>
                    {h.players.length > 0 && (
                      <p className="truncate text-xs text-cream/80">{h.players.map(p => p.name).join(', ')}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-cream/80">{Math.round(Math.min(h.position, FINISH))}%</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <EndActionDock voiceGutter={false} feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="pmu" />}>
          <Button variant="primary" size="gameLg" className="w-full" onClick={replayGame}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {t('results.replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
            <LogOut aria-hidden className="mr-2 h-4 w-4" />
            {t('results.quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  return (
    <>
      {confirmDialog}
      {screen}
    </>
  )
}
