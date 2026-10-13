"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Player } from "@/lib/players"
import { PlayerName } from "@/components/ui/PlayerName"
import {
  type Band1220,
  type Choices1220,
  type Parity1220,
  evaluatePlayerRoll1220,
  formatSips,
  TOTAL_MAX,
  TOTAL_MIN,
} from "@/lib/game-1220"
import { PlayerIcon } from "@/components/ui/PlayerIcon"
import { isSpecialPlayer, getSpecialEffectClass } from "@/lib/playerUtils"
import { cn } from "@/lib/utils"
import { RotateCcw, ArrowLeft } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { GameFixedActionBar, gameActionBarPadding } from "@/components/game/GameFixedActionBar"
import { ResumeGamePrompt } from "@/components/game/ResumeGamePrompt"
import { isSameLocalTable, useResumableLocalGame } from "@/lib/game-session"
import { usePlayers } from "@/hooks/usePlayers"

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "setup" | "play"
export type Player1220Config = Choices1220 & { playerId: string; name: string }

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

// ── Constantes ────────────────────────────────────────────────────────────────

const BAND_KEYS: Band1220[] = ["2-10", "11-20", "21-30"]

function defaultChoices(): Choices1220 {
  return { parity: "pair", band: "11-20", drinkNumber: 7, giveNumber: 13 }
}

// Reprise de partie : paris, dés et historique sont du JSON pur. Le 12-20 se
// joue longtemps sur les mêmes paris — les reperdre à cause d'un onglet rechargé
// obligeait toute la table à refaire sa mise.
const SAVE_ID = "1220"
const SAVE_VERSION = 1

type Save1220 = {
  playerIds: string[]
  phase: Phase
  draft: Record<string, Choices1220>
  configs: Player1220Config[] | null
  d12: number
  d20: number
  history: { d12: number; d20: number; results: { playerId: string; name: string; text: string[] }[] }[]
}

// ── Sous-composants : dés polygonaux SVG ──────────────────────────────────────

/** D12 — pentagone (face de dodécaèdre) */
function DieD12({ value, rolling }: { value: number; rolling: boolean }) {
  // Pentagone centré dans 100×100
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
    return `${50 + 44 * Math.cos(a)},${50 + 44 * Math.sin(a)}`
  }).join(" ")

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">D12</span>
      <motion.div
        animate={rolling
          ? { rotate: [0, 72, 144, 216, 288, 360], scale: [1, 1.1, 0.95, 1.08, 0.97, 1] }
          : {}}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        className="relative h-24 w-24"
        style={{ filter: rolling ? "drop-shadow(0 0 12px rgb(var(--gold-rgb) / 0.6))" : "drop-shadow(0 8px 14px rgba(0,0,0,0.45))" }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="d12-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(var(--cream-rgb))" />
              <stop offset="100%" stopColor="#E6D9B8" />
            </linearGradient>
          </defs>
          <polygon points={pts} fill="url(#d12-grad)" stroke="rgb(var(--gold-rgb))" strokeWidth="2.5" />
          {/* Facette intérieure */}
          <polygon
            points={Array.from({ length: 5 }, (_, i) => {
              const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
              return `${50 + 30 * Math.cos(a)},${50 + 30 * Math.sin(a)}`
            }).join(" ")}
            fill="none"
            stroke="rgb(36 32 26 / 0.15)"
            strokeWidth="1"
          />
          <text
            x="50" y="50"
            dominantBaseline="central"
            textAnchor="middle"
            fontSize="26"
            fontWeight="900"
            fontFamily="inherit"
            fill="#24201A"
          >
            {value}
          </text>
        </svg>
      </motion.div>
    </div>
  )
}

/** D20 — triangle (face d'icosaèdre) */
function DieD20({ value, rolling }: { value: number; rolling: boolean }) {
  // Triangle équilatéral centré dans 100×100
  const pts = Array.from({ length: 3 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 3 - Math.PI / 2
    return `${50 + 46 * Math.cos(a)},${50 + 46 * Math.sin(a)}`
  }).join(" ")

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-cream/70">D20</span>
      <motion.div
        animate={rolling
          ? { rotate: [0, -120, -240, -360], scale: [1, 1.12, 0.94, 1.06, 0.98, 1] }
          : {}}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        className="relative h-24 w-24"
        style={{ filter: rolling ? "drop-shadow(0 0 12px rgb(var(--gold-rgb) / 0.6))" : "drop-shadow(0 8px 14px rgba(0,0,0,0.45))" }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="d20-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(var(--cream-rgb))" />
              <stop offset="100%" stopColor="#E6D9B8" />
            </linearGradient>
          </defs>
          <polygon points={pts} fill="url(#d20-grad)" stroke="#D8CCAE" strokeWidth="2.5" />
          {/* Lignes internes stylisées */}
          {Array.from({ length: 3 }, (_, i) => {
            const a1 = (Math.PI * 2 * i) / 3 - Math.PI / 2
            const a2 = (Math.PI * 2 * ((i + 1) % 3)) / 3 - Math.PI / 2
            const mx = (50 + 46 * Math.cos(a1) + 50 + 46 * Math.cos(a2)) / 2
            const my = (50 + 46 * Math.sin(a1) + 50 + 46 * Math.sin(a2)) / 2
            return (
              <line
                key={i}
                x1="50" y1="50"
                x2={mx} y2={my}
                stroke="rgb(36 32 26 / 0.15)"
                strokeWidth="1"
              />
            )
          })}
          <text
            x="50" y="54"
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={value >= 10 ? "22" : "26"}
            fontWeight="900"
            fontFamily="inherit"
            fill="#24201A"
          >
            {value}
          </text>
        </svg>
      </motion.div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game1220({ players, onGameEnd }: GameProps) {
  const t = useTranslations('games.1220')
  const numberOptions = useMemo(
    () => Array.from({ length: TOTAL_MAX - TOTAL_MIN + 1 }, (_, i) => TOTAL_MIN + i),
    []
  )
  const [phase, setPhase] = useState<Phase>("setup")
  const [draft, setDraft] = useState<Record<string, Choices1220>>(() => {
    const init: Record<string, Choices1220> = {}
    for (const p of players) init[p.id] = defaultChoices()
    return init
  })
  const [configs, setConfigs]   = useState<Player1220Config[] | null>(null)
  const [d12,     setD12]       = useState(6)
  const [d20,     setD20]       = useState(10)
  const [rolling, setRolling]   = useState(false)
  const [history, setHistory]   = useState<
    { d12: number; d20: number; results: { playerId: string; name: string; text: string[] }[] }[]
  >([])

  const session = useResumableLocalGame<Save1220>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { updatePlayerStats } = usePlayers()

  // Sauvegarde continue : dès que la table a misé, la partie survit à un retour
  // involontaire.
  useEffect(() => {
    // Rien à reprendre tant que la table n'a pas validé ses paris : on ne
    // proposerait qu'un écran de réglages vierge.
    if (!session.ready || session.pending || phase !== "play") return
    session.save({
      playerIds: players.map(p => p.id),
      phase,
      draft,
      configs,
      d12,
      d20,
      history,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ready, session.pending, phase, draft, configs, d12, d20, history])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Table différente : les paris enregistrés ne veulent plus rien dire.
    if (!isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    setDraft(saved.draft)
    setConfigs(saved.configs)
    setD12(saved.d12)
    setD20(saved.d20)
    setHistory(saved.history)
    setRolling(false)
    setPhase(saved.phase)
  }

  /** Une partie ne doit être créditée qu'une fois : `finishGame` est câblé sur
   *  les deux boutons retour et la navigation peut le rejouer avant que l'écran
   *  ne soit démonté. */
  const gameCountedRef = useRef(false)

  /** Fin de partie : le retour au menu clôt la partie, on la compte une fois. */
  const finishGame = () => {
    if (phase === "play" && !gameCountedRef.current) {
      gameCountedRef.current = true
      players.forEach(p => {
        try {
          updatePlayerStats(p.id, '1220', { gamesPlayed: 1 })
        } catch (error) {
          console.error('Erreur lors du comptage de la partie:', error)
        }
      })
    }
    session.clear()
    onGameEnd()
  }

  const updateDraft = useCallback((id: string, patch: Partial<Choices1220>) => {
    setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  }, [])

  const setupValid = useMemo(() => players.every(p => {
    const c = draft[p.id]
    if (!c) return false
    return (
      c.drinkNumber !== c.giveNumber &&
      c.drinkNumber >= TOTAL_MIN && c.drinkNumber <= TOTAL_MAX &&
      c.giveNumber  >= TOTAL_MIN && c.giveNumber  <= TOTAL_MAX
    )
  }), [players, draft])

  const startPlay = () => {
    if (!setupValid) return
    setConfigs(players.map(p => ({ playerId: p.id, name: p.name, ...draft[p.id] })))
    setPhase("play")
  }

  const roll = () => {
    if (rolling || !configs) return
    setRolling(true)
    setTimeout(() => {
      const a = Math.floor(Math.random() * 12) + 1
      const b = Math.floor(Math.random() * 20) + 1
      setD12(a)
      setD20(b)

      const results = configs.map(cfg => {
        const r = evaluatePlayerRoll1220(a, b, cfg)
        const lines: string[] = []
        if (r.drinkSips > 0) lines.push(t('outcomes.drink', { number: cfg.drinkNumber }))
        if (r.giveRawCount > 0) {
          for (const gr of r.giveReasons) lines.push(t('outcomes.give', { label: gr.label }))
          if (r.partialHit) {
            lines.push(t('outcomes.partialGive', { numbers: r.partialNumbers.join(", "), count: formatSips(r.giveEffective) }))
          } else {
            lines.push(t('outcomes.totalGive', { count: formatSips(r.giveEffective) }))
          }
        } else if (r.partialHit) {
          lines.push(t('outcomes.partialNothing', { numbers: r.partialNumbers.join(", ") }))
        }
        if (lines.length === 0) lines.push(t('outcomes.nothing'))
        return { playerId: cfg.playerId, name: cfg.name, text: lines }
      })

      setHistory(h => [{ d12: a, d20: b, results }, ...h].slice(0, 15))
      setRolling(false)
    }, 650)
  }

  const resetSetup = () => {
    session.clear()
    // Nouveaux paris = nouvelle partie : elle a le droit d'être comptée.
    gameCountedRef.current = false
    setPhase("setup")
    setHistory([])
    setConfigs(null)
    setD12(6)
    setD20(10)
  }

  const getPlayerObj = (id: string) => players.find(p => p.id === id)

  // ── REPRISE PROPOSÉE ───────────────────────────────────────────────────────

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  // ── PHASE SETUP ────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="relative text-cream">
        {/* Header */}
        <div className="fixed top-0 inset-x-0 z-30 border-b border-gold/20 bg-felt-deep/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <h1 className="font-display text-lg font-bold text-gold">
              {t('titleBets')}
            </h1>
            <button onClick={finishGame} className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold" aria-label={t('backToGames')}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn("mx-auto max-w-xl px-4 pt-6 space-y-4 sm:pt-8", gameActionBarPadding())}>
          {/* Info */}
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-3 text-sm leading-relaxed text-cream/70">
            {t('setupInfo')}
          </div>

          {/* Config par joueur */}
          {players.map(p => {
            const c = draft[p.id] ?? defaultChoices()
            const clash = c.drinkNumber === c.giveNumber
            return (
              <div key={p.id} className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <PlayerIcon player={p} size="md" className="h-10 w-10 text-xl" />
                  <PlayerName player={p} className={cn("font-display font-bold text-base text-cream", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                </div>

                {/* Parité */}
                <div className="space-y-2">
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('parityLabel')}</p>
                  <div className="flex gap-2">
                    {(["pair", "impair"] as Parity1220[]).map(v => (
                      <button
                        key={v}
                        onClick={() => updateDraft(p.id, { parity: v })}
                        className={cn(
                          "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all",
                          c.parity === v
                            ? "border-gold/60 bg-gold/[0.15] text-cream"
                            : "border-gold/20 bg-black/20 text-cream/60 hover:bg-black/30 hover:text-cream"
                        )}
                      >
                        {v === "pair" ? t('pair') : t('impair')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('bandLabel')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BAND_KEYS.map(b => (
                      <button
                        key={b}
                        onClick={() => updateDraft(p.id, { band: b })}
                        className={cn(
                          "rounded-xl border py-2.5 text-sm font-semibold transition-all",
                          c.band === b
                            ? "border-gold/60 bg-gold/[0.15] text-cream"
                            : "border-gold/20 bg-black/20 text-cream/60 hover:bg-black/30 hover:text-cream"
                        )}
                      >
                        {t(`bands.${b}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300">{t('drinkNumber')}</p>
                    <Select
                      value={String(c.drinkNumber)}
                      onValueChange={v => updateDraft(p.id, { drinkNumber: Number(v) })}
                    >
                      <SelectTrigger className="border-suit-red/30 bg-suit-red/[0.15] text-cream focus:ring-suit-red/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {numberOptions.map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">{t('giveNumber')}</p>
                    <Select
                      value={String(c.giveNumber)}
                      onValueChange={v => updateDraft(p.id, { giveNumber: Number(v) })}
                    >
                      <SelectTrigger className="border-emerald-700/40 bg-emerald-700/20 text-cream focus:ring-emerald-400/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {numberOptions.map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {clash && (
                  <p className="text-xs font-medium text-red-300">{t('clashWarning')}</p>
                )}
              </div>
            )
          })}
        </div>

        <GameFixedActionBar>
          <button
            onClick={startPlay}
            disabled={!setupValid}
            className="w-full rounded-2xl bg-amber-500 py-4 text-base font-bold text-black shadow-none transition [touch-action:manipulation] hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('validateBets')}
          </button>
        </GameFixedActionBar>
      </div>
    )
  }

  // ── PHASE PLAY ─────────────────────────────────────────────────────────────

  const total = d12 + d20
  const lastRoll = history[0]

  return (
    <div className="relative text-cream">
      {/* Header */}
      <div className="fixed top-0 inset-x-0 z-30 border-b border-gold/20 bg-felt-deep/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="font-display text-lg font-bold text-gold">
            {t('title')}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={resetSetup} className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold" aria-label={t('reconfigure')}>
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={finishGame} className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold" aria-label={t('backToGames')}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={cn("mx-auto max-w-xl px-4 pt-6 space-y-4 sm:pt-8", gameActionBarPadding())}>

        {/* Zone des dés */}
        <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-6">
          <div className="flex items-center justify-center gap-6 mb-5">
            <DieD12 value={d12} rolling={rolling} />

            <div className="flex flex-col items-center gap-1">
              <span className="text-gold/40 text-xl">+</span>
              <div className="rounded-xl border border-gold/30 bg-black/20 px-4 py-2 text-center">
                <p className="font-display text-[10px] uppercase tracking-[0.2em] text-gold/75 mb-0.5">{t('sum')}</p>
                <motion.p
                  key={total}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="font-display text-3xl font-black text-gold tabular-nums"
                >
                  {total}
                </motion.p>
              </div>
            </div>

            <DieD20 value={d20} rolling={rolling} />
          </div>

          {/* Récap paris des joueurs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {configs?.map(cfg => {
              const p = getPlayerObj(cfg.playerId)
              return (
                <div key={cfg.playerId} className="rounded-xl border border-gold/20 bg-black/20 px-2.5 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {p ? <PlayerIcon player={p} size="sm" className="h-4 w-4 text-[10px]" /> : <div className="h-4 w-4 shrink-0" />}
                    <span className="text-xs font-semibold text-cream/80 truncate">{cfg.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-gold">{cfg.parity}</span>
                    <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-gold">{cfg.band}</span>
                    <span className="rounded border border-suit-red/30 bg-suit-red/20 px-1.5 py-0.5 font-bold text-red-300">🍺{cfg.drinkNumber}</span>
                    <span className="rounded border border-emerald-700/40 bg-emerald-700/30 px-1.5 py-0.5 font-bold text-emerald-300">🎁{cfg.giveNumber}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Résultats du dernier lancer */}
        <AnimatePresence mode="wait">
          {lastRoll && (
            <motion.div
              key={`${lastRoll.d12}-${lastRoll.d20}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('results')}</p>
                <span className="font-display text-sm text-gold">
                  {lastRoll.d12} + {lastRoll.d20} = {lastRoll.d12 + lastRoll.d20}
                </span>
              </div>
              <div className="space-y-2">
                {lastRoll.results.map(r => {
                  const p = getPlayerObj(r.playerId)
                  const allGood = r.text.length === 1 && r.text[0] === t('outcomes.nothing')
                  return (
                    <div
                      key={r.playerId}
                      className={cn(
                        "rounded-xl border px-3 py-2.5",
                        allGood ? "border-gold/20 bg-black/20" : "border-gold/60 bg-gold/[0.15]"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {p ? <PlayerIcon player={p} size="sm" className="h-5 w-5 text-xs" /> : <div className="h-5 w-5 shrink-0" />}
                        {p ? (
                          <PlayerName player={p} className={cn("text-sm font-semibold text-cream", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                        ) : (
                          <span className="text-sm font-semibold text-cream">{r.name}</span>
                        )}
                      </div>
                      <ul className="space-y-0.5 pl-7">
                        {r.text.map((line, i) => (
                          <li key={i} className={cn("text-xs", allGood ? "text-cream/50" : "text-cream/80")}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Historique */}
        {history.length > 1 && (
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 overflow-hidden">
            <details>
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 hover:text-gold transition">
                <span>{t('history', { count: history.length - 1 })}</span>
              </summary>
              <div className="border-t border-gold/20 px-4 pb-3 pt-2 max-h-48 overflow-y-auto">
                {history.slice(1).map((h, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-gold/10 last:border-0">
                    <span className="text-xs font-mono text-cream/50">{history.length - 1 - idx}.</span>
                    <span className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-mono text-gold">{h.d12}</span>
                    <span className="text-cream/40 text-xs">+</span>
                    <span className="rounded border border-cream/20 bg-black/20 px-2 py-0.5 text-[11px] font-mono text-cream/80">{h.d20}</span>
                    <span className="text-cream/40 text-xs">=</span>
                    <span className="font-display text-sm font-bold text-gold">{h.d12 + h.d20}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>

      <GameFixedActionBar>
        <button
          onClick={roll}
          disabled={rolling}
          aria-label={rolling ? t('rollAriaRolling') : t('rollAria')}
          className="w-full rounded-2xl bg-amber-500 py-4 text-base font-bold text-black shadow-none [touch-action:manipulation] hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 transition-transform"
        >
          {rolling ? t('rolling') : t('rollDice')}
        </button>
      </GameFixedActionBar>
    </div>
  )
}
