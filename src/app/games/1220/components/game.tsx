"use client"

import { useCallback, useMemo, useState } from "react"
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "setup" | "play"
export type Player1220Config = Choices1220 & { playerId: string; name: string }

interface GameProps {
  players: Player[]
  onGameEnd: () => void
}

// ── Constantes ────────────────────────────────────────────────────────────────

const BANDS: { value: Band1220; label: string }[] = [
  { value: "2-10",  label: "2 – 10"  },
  { value: "11-20", label: "11 – 20" },
  { value: "21-30", label: "21 – 30" },
]

const numberOptions = Array.from(
  { length: TOTAL_MAX - TOTAL_MIN + 1 },
  (_, i) => TOTAL_MIN + i
)

function defaultChoices(): Choices1220 {
  return { parity: "pair", band: "11-20", drinkNumber: 7, giveNumber: 13 }
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
      <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">D12</span>
      <motion.div
        animate={rolling
          ? { rotate: [0, 72, 144, 216, 288, 360], scale: [1, 1.1, 0.95, 1.08, 0.97, 1] }
          : {}}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        className="relative h-24 w-24"
        style={{ filter: rolling ? "drop-shadow(0 0 12px rgba(245,158,11,0.6))" : "drop-shadow(0 0 8px rgba(245,158,11,0.25))" }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="d12-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(251,191,36,0.18)" />
              <stop offset="100%" stopColor="rgba(217,119,6,0.08)" />
            </linearGradient>
          </defs>
          <polygon points={pts} fill="url(#d12-grad)" stroke="rgba(245,158,11,0.55)" strokeWidth="2" />
          {/* Facette intérieure */}
          <polygon
            points={Array.from({ length: 5 }, (_, i) => {
              const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
              return `${50 + 30 * Math.cos(a)},${50 + 30 * Math.sin(a)}`
            }).join(" ")}
            fill="none"
            stroke="rgba(245,158,11,0.15)"
            strokeWidth="1"
          />
          <text
            x="50" y="50"
            dominantBaseline="central"
            textAnchor="middle"
            fontSize="26"
            fontWeight="900"
            fontFamily="inherit"
            fill="rgb(253,230,138)"
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
      <span className="text-[11px] font-semibold uppercase tracking-widest text-teal-400/70">D20</span>
      <motion.div
        animate={rolling
          ? { rotate: [0, -120, -240, -360], scale: [1, 1.12, 0.94, 1.06, 0.98, 1] }
          : {}}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        className="relative h-24 w-24"
        style={{ filter: rolling ? "drop-shadow(0 0 12px rgba(20,184,166,0.6))" : "drop-shadow(0 0 8px rgba(20,184,166,0.25))" }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="d20-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(20,184,166,0.18)" />
              <stop offset="100%" stopColor="rgba(13,148,136,0.06)" />
            </linearGradient>
          </defs>
          <polygon points={pts} fill="url(#d20-grad)" stroke="rgba(20,184,166,0.55)" strokeWidth="2" />
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
                stroke="rgba(20,184,166,0.15)"
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
            fill="rgb(153,246,228)"
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
        if (r.drinkSips > 0) lines.push(`🍺 Boit — somme = ${cfg.drinkNumber}.`)
        if (r.giveRawCount > 0) {
          for (const gr of r.giveReasons) lines.push(`🎁 Donne à boire : ${gr.label}.`)
          if (r.partialHit) {
            lines.push(`⚡ Chiffre sur un dé (${r.partialNumbers.join(", ")}) sans somme → ${formatSips(r.giveEffective)} gorgée(s) (÷2).`)
          } else {
            lines.push(`Total : ${formatSips(r.giveEffective)} gorgée(s) à distribuer.`)
          }
        } else if (r.partialHit) {
          lines.push(`⚡ Chiffre(s) sur un dé (${r.partialNumbers.join(", ")}) mais pas en somme — rien à distribuer.`)
        }
        if (lines.length === 0) lines.push("Rien pour toi ce lancer.")
        return { playerId: cfg.playerId, name: cfg.name, text: lines }
      })

      setHistory(h => [{ d12: a, d20: b, results }, ...h].slice(0, 15))
      setRolling(false)
    }, 650)
  }

  const resetSetup = () => {
    setPhase("setup")
    setHistory([])
    setConfigs(null)
    setD12(6)
    setD20(10)
  }

  const getPlayerObj = (id: string) => players.find(p => p.id === id)

  // ── PHASE SETUP ────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#07060b] text-white">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[#07060b]" />
          <div className="absolute -top-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-teal-600/10 blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-indigo-600/10 blur-[100px]" />
        </div>

        {/* Header */}
        <div className="fixed top-0 inset-x-0 z-30 border-b border-white/[0.06] bg-[#07060b]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <h1 className="font-black tracking-tight text-lg bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-300 to-indigo-400">
              🎲 1220 — Paris
            </h1>
            <button onClick={onGameEnd} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70" aria-label="Retour aux jeux">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={cn("mx-auto max-w-xl px-4 pt-6 space-y-4 sm:pt-8", gameActionBarPadding())}>
          {/* Info */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/55 leading-relaxed">
            Chaque joueur choisit sa <strong className="text-white/80">parité</strong>, sa <strong className="text-white/80">plage</strong>, son <strong className="text-teal-400">chiffre fait boire</strong> et son <strong className="text-amber-400">chiffre donne à boire</strong>.
            Les deux chiffres doivent être différents.
          </div>

          {/* Config par joueur */}
          {players.map(p => {
            const c = draft[p.id] ?? defaultChoices()
            const clash = c.drinkNumber === c.giveNumber
            return (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <PlayerIcon player={p} size="md" className="h-10 w-10 text-xl" />
                  <PlayerName player={p} className={cn("font-bold text-base text-white", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                </div>

                {/* Parité */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Parité de la somme</p>
                  <div className="flex gap-2">
                    {(["pair", "impair"] as Parity1220[]).map(v => (
                      <button
                        key={v}
                        onClick={() => updateDraft(p.id, { parity: v })}
                        className={cn(
                          "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all",
                          c.parity === v
                            ? "border-teal-500/50 bg-teal-500/15 text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.15)]"
                            : "border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
                        )}
                      >
                        {v === "pair" ? "Pair" : "Impair"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plage */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Plage de la somme</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BANDS.map(b => (
                      <button
                        key={b.value}
                        onClick={() => updateDraft(p.id, { band: b.value })}
                        className={cn(
                          "rounded-xl border py-2.5 text-sm font-semibold transition-all",
                          c.band === b.value
                            ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                            : "border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chiffres */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-400/70">Fait boire</p>
                    <Select
                      value={String(c.drinkNumber)}
                      onValueChange={v => updateDraft(p.id, { drinkNumber: Number(v) })}
                    >
                      <SelectTrigger className="border-teal-500/30 bg-teal-500/10 text-teal-200 focus:ring-teal-500/30">
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
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">Donne à boire</p>
                    <Select
                      value={String(c.giveNumber)}
                      onValueChange={v => updateDraft(p.id, { giveNumber: Number(v) })}
                    >
                      <SelectTrigger className="border-amber-500/30 bg-amber-500/10 text-amber-200 focus:ring-amber-500/30">
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
                  <p className="text-xs text-amber-400 font-medium">⚠️ Les deux chiffres doivent être différents.</p>
                )}
              </div>
            )
          })}
        </div>

        <GameFixedActionBar>
          <button
            onClick={startPlay}
            disabled={!setupValid}
            className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-600 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(20,184,166,0.3)] transition [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 hover:from-teal-500 hover:to-indigo-500"
          >
            Valider les paris — Lancer la partie →
          </button>
        </GameFixedActionBar>
      </div>
    )
  }

  // ── PHASE PLAY ─────────────────────────────────────────────────────────────

  const total = d12 + d20
  const lastRoll = history[0]

  return (
    <div className="min-h-screen bg-[#07060b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07060b]" />
        <div className="absolute -top-32 right-0 h-[28rem] w-[28rem] rounded-full bg-teal-600/8 blur-[120px]" />
        <div className="absolute -bottom-32 left-0 h-[26rem] w-[26rem] rounded-full bg-amber-600/8 blur-[110px]" />
      </div>

      {/* Header */}
      <div className="fixed top-0 inset-x-0 z-30 border-b border-white/[0.06] bg-[#07060b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="font-black tracking-tight text-lg bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-300 to-indigo-400">
            🎲 1220
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={resetSetup} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-teal-300/60 transition hover:bg-white/10 hover:text-teal-300" aria-label="Reconfigurer les paris">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={onGameEnd} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70" aria-label="Retour aux jeux">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={cn("mx-auto max-w-xl px-4 pt-6 space-y-4 sm:pt-8", gameActionBarPadding())}>

        {/* Zone des dés */}
        <div
          className="rounded-2xl border border-white/10 p-6"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(20,184,166,0.06) 0%, #07060b 65%)" }}
        >
          <div className="flex items-center justify-center gap-6 mb-5">
            <DieD12 value={d12} rolling={rolling} />

            <div className="flex flex-col items-center gap-1">
              <span className="text-white/20 text-xl">+</span>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                <p className="text-[10px] uppercase tracking-widest text-white/35 mb-0.5">Somme</p>
                <motion.p
                  key={total}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-3xl font-black text-white tabular-nums"
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
                <div key={cfg.playerId} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {p ? <PlayerIcon player={p} size="sm" className="h-4 w-4 text-[10px]" /> : <div className="h-4 w-4 shrink-0" />}
                    <span className="text-xs font-semibold text-white/70 truncate">{cfg.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-white/45">{cfg.parity}</span>
                    <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-white/45">{cfg.band}</span>
                    <span className="rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-teal-400">🍺{cfg.drinkNumber}</span>
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">🎁{cfg.giveNumber}</span>
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
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Résultats</p>
                <span className="text-xs text-white/30">
                  {lastRoll.d12} + {lastRoll.d20} = {lastRoll.d12 + lastRoll.d20}
                </span>
              </div>
              <div className="space-y-2">
                {lastRoll.results.map(r => {
                  const p = getPlayerObj(r.playerId)
                  const allGood = r.text.length === 1 && r.text[0].startsWith("Rien")
                  return (
                    <div
                      key={r.playerId}
                      className={cn(
                        "rounded-xl border px-3 py-2.5",
                        allGood ? "border-white/[0.06] bg-white/[0.02]" : "border-teal-500/20 bg-teal-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {p ? <PlayerIcon player={p} size="sm" className="h-5 w-5 text-xs" /> : <div className="h-5 w-5 shrink-0" />}
                        {p ? (
                          <PlayerName player={p} className={cn("text-sm font-semibold text-white/90", isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                        ) : (
                          <span className="text-sm font-semibold text-white/90">{r.name}</span>
                        )}
                      </div>
                      <ul className="space-y-0.5 pl-7">
                        {r.text.map((line, i) => (
                          <li key={i} className={cn("text-xs", allGood ? "text-white/35" : "text-white/70")}>{line}</li>
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
            <details>
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/60 transition">
                <span>Historique ({history.length - 1} lancers précédents)</span>
              </summary>
              <div className="border-t border-white/[0.06] px-4 pb-3 pt-2 max-h-48 overflow-y-auto">
                {history.slice(1).map((h, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-xs font-mono text-white/50">{history.length - 1 - idx}.</span>
                    <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono text-amber-300">{h.d12}</span>
                    <span className="text-white/20 text-xs">+</span>
                    <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono text-teal-300">{h.d20}</span>
                    <span className="text-white/20 text-xs">=</span>
                    <span className="text-sm font-bold text-white/70">{h.d12 + h.d20}</span>
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
          aria-label={rolling ? "Lancer en cours" : "Lancer les dés"}
          className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-indigo-600 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(20,184,166,0.3)] [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 transition-transform hover:from-teal-500 hover:to-indigo-500"
        >
          {rolling ? "🎲 Lancement…" : "🎲 Lancer les dés"}
        </button>
      </GameFixedActionBar>
    </div>
  )
}
