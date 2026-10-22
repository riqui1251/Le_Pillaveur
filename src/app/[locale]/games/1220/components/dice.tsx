"use client"

import { useId } from "react"
import { useTranslations } from "next-intl"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * Les deux dés du 1220 et leur somme, partagés par le jeu local et la version
 * en ligne : la table qui passe d'un mode à l'autre retrouve les mêmes dés.
 */

const DIE_BOX = "relative h-20 w-20 sm:h-24 sm:w-24"

function polygon(sides: number, radius: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2
    return `${50 + radius * Math.cos(a)},${50 + radius * Math.sin(a)}`
  }).join(" ")
}

/** Id de dégradé propre à chaque dé monté, sans les « : » de useId, que
 *  `url(#…)` ne sait pas toujours relire. */
function useGradientId() {
  return `die-grad-${useId().replace(/:/g, "")}`
}

function dieShadow(rolling: boolean) {
  return rolling
    ? "drop-shadow(0 0 12px rgb(var(--gold-rgb) / 0.6))"
    : "drop-shadow(0 8px 14px rgba(0,0,0,0.45))"
}

/** D12 : pentagone (face de dodécaèdre), liseré or. */
function DieD12({ value, rolling, still }: { value: number | null; rolling: boolean; still: boolean }) {
  const gradientId = useGradientId()
  return (
    <motion.div
      animate={rolling && !still
        ? { rotate: [0, 72, 144, 216, 288, 360], scale: [1, 1.1, 0.95, 1.08, 0.97, 1] }
        : {}}
      transition={{ duration: 0.7, ease: "easeInOut" }}
      className={DIE_BOX}
      style={{ filter: dieShadow(rolling) }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--cream-rgb))" />
            <stop offset="100%" stopColor="#E6D9B8" />
          </linearGradient>
        </defs>
        <polygon points={polygon(5, 44)} fill={`url(#${gradientId})`} stroke="rgb(var(--gold-rgb))" strokeWidth="2.5" />
        <polygon points={polygon(5, 30)} fill="none" stroke="rgb(36 32 26 / 0.15)" strokeWidth="1" />
        <text x="50" y="50" dominantBaseline="central" textAnchor="middle" fontSize="26" fontWeight="900" fontFamily="inherit" fill="#24201A">
          {value ?? "?"}
        </text>
      </svg>
    </motion.div>
  )
}

/** D20 : triangle (face d'icosaèdre), liseré crème. */
function DieD20({ value, rolling, still }: { value: number | null; rolling: boolean; still: boolean }) {
  const gradientId = useGradientId()
  return (
    <motion.div
      animate={rolling && !still
        ? { rotate: [0, -120, -240, -360], scale: [1, 1.12, 0.94, 1.06, 0.98, 1] }
        : {}}
      transition={{ duration: 0.7, ease: "easeInOut" }}
      className={DIE_BOX}
      style={{ filter: dieShadow(rolling) }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--cream-rgb))" />
            <stop offset="100%" stopColor="#E6D9B8" />
          </linearGradient>
        </defs>
        <polygon points={polygon(3, 46)} fill={`url(#${gradientId})`} stroke="#D8CCAE" strokeWidth="2.5" />
        {Array.from({ length: 3 }, (_, i) => {
          const a1 = (Math.PI * 2 * i) / 3 - Math.PI / 2
          const a2 = (Math.PI * 2 * ((i + 1) % 3)) / 3 - Math.PI / 2
          const mx = (100 + 46 * Math.cos(a1) + 46 * Math.cos(a2)) / 2
          const my = (100 + 46 * Math.sin(a1) + 46 * Math.sin(a2)) / 2
          return <line key={i} x1="50" y1="50" x2={mx} y2={my} stroke="rgb(36 32 26 / 0.15)" strokeWidth="1" />
        })}
        <text x="50" y="54" dominantBaseline="central" textAnchor="middle" fontSize={value !== null && value >= 10 ? "22" : "26"} fontWeight="900" fontFamily="inherit" fill="#24201A">
          {value ?? "?"}
        </text>
      </svg>
    </motion.div>
  )
}

export interface DiceBoardProps {
  /** null avant le premier lancer : faces « ? », somme « – ». */
  d12: number | null
  d20: number | null
  rolling: boolean
  /** Phrase lue par le lecteur d'écran après chaque lancer (absente avant le premier). */
  announce?: string
  className?: string
}

/** D12 + somme + D20 : la somme reste masquée tant que les dés roulent. */
export function DiceBoard({ d12, d20, rolling, announce, className }: DiceBoardProps) {
  const t = useTranslations("games.1220")
  const still = Boolean(useReducedMotion())
  const total = d12 !== null && d20 !== null ? d12 + d20 : null
  return (
    <div className={cn("rounded-2xl border border-gold/20 bg-felt-deep/70 p-4", className)}>
      <div className="flex items-end justify-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">D12</span>
          <DieD12 value={d12} rolling={rolling} still={still} />
        </div>

        <div className="flex flex-col items-center gap-1 pb-3">
          <span className="text-xl text-gold/60" aria-hidden>+</span>
          <div className="min-w-[4.5rem] rounded-xl border border-gold/30 bg-black/20 px-3 py-2 text-center">
            <p className="font-display text-xs uppercase tracking-[0.2em] text-gold">{t("sum")}</p>
            <motion.p
              key={rolling ? "rolling" : total ?? "none"}
              initial={still ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-display text-3xl font-black tabular-nums text-gold"
            >
              {rolling ? "?" : total ?? "–"}
            </motion.p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-cream/80">D20</span>
          <DieD20 value={d20} rolling={rolling} still={still} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {rolling ? "" : announce ?? ""}
      </p>
    </div>
  )
}
