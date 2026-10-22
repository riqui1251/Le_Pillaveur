"use client"

import { useId, useMemo, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Beer, Check, ChevronDown, Gift } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BANDS_1220,
  TOTAL_MAX,
  TOTAL_MIN,
  type Choices1220,
  type Parity1220,
} from "@/lib/game-1220"
import { cn } from "@/lib/utils"

/**
 * Réglage et rappel des paris, partagés par le jeu local et la version en
 * ligne : mêmes boutons, mêmes couleurs « fait boire » (rouge carreau) et
 * « donne à boire » (vert) dans les deux modes. En ligne, « boire » était
 * turquoise et « donner » or : l'habitué du local lisait mal ses paris.
 */

const PARITIES: readonly Parity1220[] = ["pair", "impair"]

const LABEL = "font-display text-xs font-semibold uppercase tracking-[0.2em]"

function choiceClass(selected: boolean) {
  return cn(
    "flex h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition-colors [touch-action:manipulation] disabled:cursor-not-allowed disabled:opacity-50",
    selected
      ? "border-gold/70 bg-gold/[0.15] text-cream"
      : "border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-cream"
  )
}

export interface BetsEditorProps {
  value: Choices1220
  onChange: (patch: Partial<Choices1220>) => void
  disabled?: boolean
}

export function BetsEditor({ value, onChange, disabled = false }: BetsEditorProps) {
  const t = useTranslations("games.1220")
  const id = useId()
  const numberOptions = useMemo(
    () => Array.from({ length: TOTAL_MAX - TOTAL_MIN + 1 }, (_, i) => TOTAL_MIN + i),
    []
  )
  const clash = value.drinkNumber === value.giveNumber

  return (
    <div className="space-y-4">
      <div className="space-y-2" role="group" aria-labelledby={`${id}-parity`}>
        <p id={`${id}-parity`} className={cn(LABEL, "text-gold")}>{t("parityLabel")}</p>
        <div className="grid grid-cols-2 gap-2">
          {PARITIES.map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              aria-pressed={value.parity === v}
              onClick={() => onChange({ parity: v })}
              className={choiceClass(value.parity === v)}
            >
              {value.parity === v && <Check className="h-4 w-4 text-gold" aria-hidden />}
              {t(v)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2" role="group" aria-labelledby={`${id}-band`}>
        <p id={`${id}-band`} className={cn(LABEL, "text-gold")}>{t("bandLabel")}</p>
        <div className="grid grid-cols-3 gap-2">
          {BANDS_1220.map((b) => (
            <button
              key={b}
              type="button"
              disabled={disabled}
              aria-pressed={value.band === b}
              onClick={() => onChange({ band: b })}
              className={choiceClass(value.band === b)}
            >
              {value.band === b && <Check className="h-4 w-4 shrink-0 text-gold" aria-hidden />}
              {t(`bands.${b}`)}
            </button>
          ))}
        </div>
      </div>

      {/* items-end : quand un intitulé passe sur deux lignes (« DONNE À
          BOIRE » à 375 px), les deux listes restent alignées. */}
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="space-y-2">
          <p id={`${id}-drink`} className={cn(LABEL, "flex items-center gap-1.5 text-red-300")}>
            <Beer className="h-4 w-4 shrink-0" aria-hidden />
            {t("drinkNumber")}
          </p>
          <Select
            value={String(value.drinkNumber)}
            onValueChange={(v) => onChange({ drinkNumber: Number(v) })}
            disabled={disabled}
          >
            <SelectTrigger
              aria-labelledby={`${id}-drink`}
              className="h-12 rounded-xl border-suit-red/50 bg-suit-red/20 text-base font-bold text-cream focus:ring-red-300/50"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numberOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p id={`${id}-give`} className={cn(LABEL, "flex items-center gap-1.5 text-emerald-300")}>
            <Gift className="h-4 w-4 shrink-0" aria-hidden />
            {t("giveNumber")}
          </p>
          <Select
            value={String(value.giveNumber)}
            onValueChange={(v) => onChange({ giveNumber: Number(v) })}
            disabled={disabled}
          >
            <SelectTrigger
              aria-labelledby={`${id}-give`}
              className="h-12 rounded-xl border-emerald-700/50 bg-emerald-700/20 text-base font-bold text-cream focus:ring-emerald-400/50"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numberOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {clash && (
        <p className="flex items-center gap-2 text-sm font-semibold text-red-300" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {t("clashWarning")}
        </p>
      )}
    </div>
  )
}

/** Rappel compact des quatre paris d'un joueur. */
export function BetChips({ choices }: { choices: Choices1220 }) {
  const t = useTranslations("games.1220")
  const chip = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-bold"
  return (
    <div className="flex flex-wrap gap-1">
      <span className={cn(chip, "border-gold/40 bg-gold/10 text-gold")}>{t(choices.parity)}</span>
      <span className={cn(chip, "border-gold/40 bg-gold/10 text-gold")}>{t(`bands.${choices.band}`)}</span>
      <span className={cn(chip, "border-suit-red/50 bg-suit-red/20 text-red-300")}>
        <Beer className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{`${t("drinkNumber")} `}</span>
        {choices.drinkNumber}
      </span>
      <span className={cn(chip, "border-emerald-700/50 bg-emerald-700/20 text-emerald-300")}>
        <Gift className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{`${t("giveNumber")} `}</span>
        {choices.giveNumber}
      </span>
    </div>
  )
}

export interface TableBetsRow {
  key: string
  avatar: ReactNode
  name: ReactNode
  choices: Choices1220
}

/**
 * « Paris de la table », repliable : il passait AVANT les résultats et les
 * repoussait sous la barre du bas à chaque lancer.
 */
export function TableBets({
  rows,
  open,
  onOpenChange,
}: {
  rows: readonly TableBetsRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("games.1220")
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className="group overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep/70"
    >
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
        <span>{t("tableBets")}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="grid grid-cols-2 gap-2 border-t border-gold/20 p-3 sm:grid-cols-3">
        {rows.map((row) => (
          <li key={row.key} className="min-w-0 space-y-1.5 rounded-xl border border-gold/20 bg-black/20 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden>
                {row.avatar}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cream">{row.name}</span>
            </div>
            <BetChips choices={row.choices} />
          </li>
        ))}
      </ul>
    </details>
  )
}
