"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Beer, ChevronDown, Gift, Zap } from "lucide-react"
import { bandOf } from "@/lib/game-1220"
import { cn } from "@/lib/utils"

/**
 * Verdict d'un lancer, partagé par le jeu local et la version en ligne.
 *
 * Chaque joueur avait une liste de deux à quatre phrases en 12 px, toutes de
 * la même couleur, sous la ligne de flottaison dès quatre joueurs : on ne
 * voyait ni qui boit ni combien. Ici, une ligne de 48 px par joueur, avec
 * « Boit 1 » sur rouge carreau et « Donne 2 » en vert ; les raisons se
 * déplient au toucher.
 */

/** Résultat d'un joueur pour un lancer (forme du moteur en ligne, reprise en local). */
export interface Verdict1220 {
  drinkSips: number
  giveEffective: number
  /** 'band' | 'parity' | 'giveNum' */
  giveReasons: readonly string[]
  partialHit: boolean
  partialNumbers: readonly number[]
}

export const DRINK_CHIP =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-suit-red px-2 py-1 font-display text-sm font-bold text-cream"
export const GIVE_CHIP =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-700/40 bg-emerald-700/30 px-2 py-1 font-display text-sm font-bold text-emerald-300"

/** Les raisons se déduisent de la somme : le chiffre tiré, sa plage, sa parité. */
function useReasonLines(verdict: Verdict1220, total: number) {
  const t = useTranslations("games.1220")
  const lines: { key: string; tone: "drink" | "give" | "partial"; text: string }[] = []
  if (verdict.drinkSips > 0) {
    lines.push({ key: "drink", tone: "drink", text: t("reasons.drink", { number: total }) })
  }
  for (const id of verdict.giveReasons) {
    if (id === "band") {
      const band = bandOf(total)
      if (band) lines.push({ key: id, tone: "give", text: t("reasons.band", { band: t(`bands.${band}`) }) })
    } else if (id === "parity") {
      lines.push({ key: id, tone: "give", text: t("reasons.parity", { parity: total % 2 === 0 ? t("pair") : t("impair") }) })
    } else if (id === "giveNum") {
      lines.push({ key: id, tone: "give", text: t("reasons.giveNum", { number: total }) })
    }
  }
  if (verdict.partialHit) {
    const numbers = verdict.partialNumbers.join(", ")
    lines.push({
      key: "partial",
      tone: "partial",
      text: verdict.giveReasons.length > 0
        ? t("reasons.partialHalf", { numbers })
        : t("reasons.partialNothing", { numbers }),
    })
  }
  return lines
}

const LINE_TONE = {
  drink: { icon: Beer, className: "text-red-300" },
  give: { icon: Gift, className: "text-emerald-300" },
  partial: { icon: Zap, className: "text-gold" },
} as const

export interface VerdictRowProps {
  avatar: ReactNode
  name: ReactNode
  verdict: Verdict1220
  total: number
}

export function VerdictRow({ avatar, name, verdict, total }: VerdictRowProps) {
  const t = useTranslations("games.1220")
  const lines = useReasonLines(verdict, total)
  const drinks = verdict.drinkSips > 0
  const gives = verdict.giveEffective > 0
  const halved = verdict.partialHit && gives
  // Rien à expliquer (aucun pari touché) : une ligne simple, sans dépliant.
  const expandable = lines.length > 0

  // Jetons et chevron restent groupés : sous un nom long, ils passent
  // ensemble à la ligne, calés à droite.
  const summary = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-xl leading-none" aria-hidden>
        {avatar}
      </span>
      <span className="min-w-[6rem] flex-1 truncate text-base font-semibold text-cream">{name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {drinks && (
          <span className={DRINK_CHIP}>
            <Beer className="h-4 w-4" aria-hidden />
            {t("verdict.drink", { count: verdict.drinkSips })}
          </span>
        )}
        {gives && (
          <span className={GIVE_CHIP}>
            {halved ? <Zap className="h-4 w-4" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
            {t("verdict.give", { count: verdict.giveEffective })}
          </span>
        )}
        {!drinks && !gives && (
          <span className="px-2 font-display text-base font-bold text-cream/60">
            <span aria-hidden>—</span>
            <span className="sr-only">{t("verdict.nothing")}</span>
          </span>
        )}
        {expandable && (
          <ChevronDown className="h-4 w-4 shrink-0 text-cream/70 transition-transform group-open:rotate-180" aria-hidden />
        )}
      </span>
    </>
  )

  const rowClass = cn(
    "rounded-xl border",
    drinks || gives ? "border-gold/40 bg-black/25" : "border-gold/20 bg-black/20"
  )

  if (!expandable) {
    return <li className={cn(rowClass, "flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2")}>{summary}</li>
  }

  return (
    <li className={rowClass}>
      <details className="group">
        <summary className="flex min-h-[48px] cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
          {summary}
        </summary>
        <ul className="space-y-1.5 border-t border-gold/20 px-3 pb-3 pt-2">
          {lines.map(({ key, tone, text }) => {
            const { icon: Icon, className } = LINE_TONE[tone]
            return (
              <li key={key} className={cn("flex items-start gap-2 text-sm", className)}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{text}</span>
              </li>
            )
          })}
        </ul>
      </details>
    </li>
  )
}

/** Panneau « Résultats » : la ligne du lancer, puis un VerdictRow par joueur. */
export function VerdictPanel({ d12, d20, children }: { d12: number; d20: number; children: ReactNode }) {
  const t = useTranslations("games.1220")
  return (
    <section className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t("results")}</h2>
        <span className="font-display text-sm font-bold tabular-nums text-gold">
          {d12} + {d20} = {d12 + d20}
        </span>
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

/** Lancers précédents (le dernier est déjà affiché par les dés). */
export function RollHistory({ rolls }: { rolls: readonly { d12: number; d20: number }[] }) {
  const t = useTranslations("games.1220")
  if (rolls.length === 0) return null
  return (
    <details className="group overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep/70">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
        <span>{t("history", { count: rolls.length })}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="max-h-[14rem] overflow-y-auto border-t border-gold/20 px-4 pb-3 pt-2">
        {rolls.map((h, idx) => (
          <li key={idx} className="flex items-center gap-3 border-b border-gold/10 py-1.5 last:border-0">
            <span className="w-6 font-mono text-xs text-cream/70">{rolls.length - idx}.</span>
            <span className="rounded border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-xs font-bold text-gold">{h.d12}</span>
            <span className="text-xs text-cream/60" aria-hidden>+</span>
            <span className="rounded border border-cream/30 bg-black/20 px-2 py-0.5 font-mono text-xs font-bold text-cream">{h.d20}</span>
            <span className="text-xs text-cream/60" aria-hidden>=</span>
            <span className="font-display text-sm font-bold text-gold">{h.d12 + h.d20}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}
