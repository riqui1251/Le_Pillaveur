"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { motion, useMotionValue, animate } from 'framer-motion'

type BasePlayer = { id: string; name: string }

type Segment = {
  id: string
  label: string
  value: number // 0 = SAFE, 1..12 = gorgées
}

type RiskLevel = 'faible' | 'moyen' | 'eleve'

type GameProps = {
  players: BasePlayer[]
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, delta: Record<string, number>) => void
  riskLevel: RiskLevel
  segmentCount: number
}

type RoundResult = { playerId: string; playerName: string; choiceLabel: string }

export default function Game({ players, onGameEnd, updatePlayerStats, riskLevel, segmentCount }: GameProps) {
  const t = useTranslations('games.roue-des-gorgees')
  const tCommon = useTranslations('common')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [rounds, setRounds] = useState<RoundResult[]>([])
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const rotation = useMotionValue(0)
  const lastTickRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])

  const currentPlayer = players[currentIndex]

  // Segments à taille égale
  const anglePerSegment = useMemo(() => 360 / Math.max(segments.length, 1), [segments.length])

  // const colors = useMemo(() => {
  //   const base = ['#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#06b6d4', '#ef4444', '#10b981']
  //   return Array.from({ length: segments.length }).map((_, i) => base[i % base.length])
  // }, [segments.length])

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
      try { await audioCtxRef.current.resume() } catch {}
    }
  }

  const playTick = () => {
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

  // Couleur basée sur la valeur (0 = SAFE → vert; 1..12 → jaune→orange→rouge)
  const colorForValue = (v: number): string => {
    if (v === 0) return '#10b981' // SAFE vert
    const ratio = Math.max(0, Math.min(1, v / 12))
    const hue = 60 - 60 * ratio // 60 (jaune) → 0 (rouge)
    const saturation = 85
    const lightness = 55 - 10 * ratio // plus élevé = plus sombre
    return `hsl(${hue}deg ${saturation}% ${lightness}%)`
  }

  const generateSegments = useCallback((_risk: RiskLevel, count: number): Segment[] => {
    const n = Math.max(15, count)
    const arr: Segment[] = []
    for (let i = 0; i < n; i++) {
      const isSafe = (i + 1) % 3 === 0
      const value = isSafe ? 0 : 1 + Math.floor(Math.random() * 12)
      arr.push({
        id: `seg-${i}-${value}-${Math.random().toString(36).slice(2,6)}`,
        label: value === 0 ? tCommon('safe') : t('segmentSips', { count: value }),
        value,
      })
    }
    return arr
  }, [t, tCommon])

  useEffect(() => {
    setSegments(generateSegments(riskLevel, segmentCount))
  }, [riskLevel, segmentCount, generateSegments])

  const spinWheel = async () => {
    if (spinning || segments.length === 0) return
    setSpinning(true)

    // Sélection pondérée selon la taille angulaire
  // Choix uniforme d'un segment et offset interne
  const randomIndex = Math.floor(Math.random() * segments.length)
  const segStart = randomIndex * anglePerSegment
  const segAngle = anglePerSegment
    // 4 à 10 tours obligatoires
    const extraSpins = 4 + Math.floor(Math.random() * 7) // 4-10 tours
    // Durée autour de 5s en moyenne (4s à 6s)
    const duration = 4 + Math.random() * 2
    // Zone d'arrêt aléatoire À L'INTÉRIEUR du segment cible
    const offsetWithinSegment = Math.random() * segAngle
    // Pointer à 12h; on amène un angle dans [start, end)
    const targetAngle = 360 * extraSpins - (segStart + offsetWithinSegment)
    // Léger overshoot réaliste
    const overshootAngle = segAngle * (0.12 + Math.random() * 0.18)
    const accelAngle = targetAngle * 0.25

    // Prépare audio et ticks
    await ensureAudioCtx()
    rotation.set(0)
    lastTickRef.current = 0

    animate(rotation, [0, accelAngle, targetAngle + overshootAngle, targetAngle], {
      duration,
      times: [0, 0.25, 0.9, 1],
      ease: ['easeIn', [0.16, 1, 0.3, 1], 'easeOut'],
      onUpdate: (v) => {
        // Tic sur passage de séparateur
        const mod = ((v % 360) + 360) % 360
        const tickIndex = Math.floor(mod / anglePerSegment)
        if (tickIndex !== lastTickRef.current) { lastTickRef.current = tickIndex; playTick() }
      }
    })

    // Attente basée sur la durée (compatibilité versions framer-motion)
    await new Promise(resolve => setTimeout(resolve, Math.ceil(duration * 1000) + 80))

    const result = segments[randomIndex]
    setRounds(prev => ([...prev, { playerId: currentPlayer.id, playerName: currentPlayer.name, choiceLabel: result.label }]))
    updatePlayerStats(currentPlayer.id, 'roue-des-gorgees', { gamesPlayed: 1 })

    const nextIndex = (currentIndex + 1) % players.length
    setCurrentIndex(nextIndex)
    setSpinning(false)
  }

  const allPlayersPlayed = rounds.length >= players.length && players.every(p => rounds.some(r => r.playerId === p.id))

  useEffect(() => {
    if (allPlayersPlayed) {
      // On peut afficher un résumé puis le bouton de fin
    }
  }, [allPlayersPlayed])

  const restartRound = () => {
    setRounds([])
    setCurrentIndex(0)
    setSpinning(false)
    rotation.set(0)
    lastTickRef.current = 0
  }

  const actionBar = allPlayersPlayed ? (
    <div className="flex w-full gap-2">
      <Button onClick={onGameEnd} variant="outline" className="flex-1">
        {t('finish')}
      </Button>
      <Button onClick={restartRound} className="flex-1">
        {t('restartRound')}
      </Button>
    </div>
  ) : (
    <Button
      disabled={spinning || segments.length === 0}
      onClick={spinWheel}
      className="w-full py-4 text-base font-bold"
    >
      {spinning ? t('spinning') : t('spin')}
    </Button>
  )

  return (
    <GameShell title={t('title')} onBack={onGameEnd} actionBar={actionBar} fill maxWidth={800}>
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-sm text-slate-300">{t('wheelInfo', { risk: riskLevel, count: segments.length })}</div>
        <div className="text-xs text-slate-400">{t('wheelHint')}</div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-300">{t('turnOf')}</div>
          <div className="font-semibold">{currentPlayer?.name || '—'}</div>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="relative w-64 h-64 md:w-96 md:h-96 xl:w-[28rem] xl:h-[28rem]">
            {/* Flèche fixe (pointeur résultat) */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 drop-shadow">
              <svg width="28" height="28" viewBox="0 0 28 28">
                <polygon points="14,0 24,16 4,16" fill="#f43f5e" />
                <rect x="12.5" y="16" width="3" height="8" rx="1.5" fill="#f43f5e" />
              </svg>
            </div>

            {/* Roue animée */}
            <motion.div
              className="absolute inset-0 rounded-full ring-2 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-visible"
              style={{ originX: 0.5, originY: 0.5, rotate: rotation }}
              ref={wheelRef}
            >
              <svg viewBox="0 0 200 200" width="100%" height="100%">
                {/* Fond */}
                <circle cx="100" cy="100" r="98" fill="#0f172a" />
                {/* Segments */}
                {segments.map((seg, i) => {
                  const start = -90 + i * anglePerSegment
                  const end = start + anglePerSegment
                  const path = arcPath(100, 100, 95, start, end)
                  return (
                    <g key={seg.id}>
                      <path d={path} fill={colorForValue(seg.value)} opacity={0.95} />
                      {/* séparateur */}
                      <path d={`M 100 100 L ${polar(100,100,95,start).x} ${polar(100,100,95,start).y}`} stroke="#0f172a" strokeWidth={1.2} />
                    </g>
                  )
                })}
                {/* Moyeu */}
                <circle cx="100" cy="100" r="10" fill="#ffffff" />
                <circle cx="100" cy="100" r="4" fill="#0f172a" />
              </svg>
            </motion.div>
          </div>
        </div>
      </Card>

      {/* Légende des couleurs (couleur → label) */}
      {segments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">{t('legend')}</h3>
            <ul className="space-y-2 text-sm">
              {Object.entries(segments.reduce<Record<string, { color: string; count: number }>>((acc, s) => {
                const key = s.label
                const color = colorForValue(s.value)
                if (!acc[key]) acc[key] = { color, count: 0 }
                acc[key].count += 1
                return acc
              }, {})).map(([label, info]) => (
                <li key={label} className="flex items-center gap-3">
                  <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: info.color }} />
                  <span className="text-slate-200">{label}{info.count > 1 ? ` ×${info.count}` : ''}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Résumé de la manche quand tout le monde a joué */}
      {allPlayersPlayed && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">{t('summary')}</h3>
          <ul className="text-sm space-y-1">
            {rounds.map((r, idx) => (
              <li key={idx}>
                <span className="font-medium">{r.playerName}</span> → {r.choiceLabel}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
    </GameShell>
  )
}


