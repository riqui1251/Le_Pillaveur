"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ConfirmActionTone = "danger" | "primary"

export interface ConfirmActionOptions {
  title: string
  description?: ReactNode
  confirmLabel: string
  /** Par défaut : « Annuler » (common.cancel). */
  cancelLabel?: string
  /** `danger` (rouge carreau) pour ce qui efface ou élimine, `primary` (or) sinon. */
  tone?: ConfirmActionTone
}

export interface ConfirmActionDialogProps extends ConfirmActionOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Anneau de focus clavier visible sur l'or comme sur le feutre : celui du
 * Button (`ring-1` couleur `--ring`, l'or lui-même) disparaît sur un bouton or.
 */
const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep"

/**
 * Demande de confirmation d'un geste irréversible (recommencer, terminer pour
 * tous, quitter en pleine partie), habillée feutre et or.
 *
 * Les boutons passent par `buttonVariants` en className, pas par `<Button
 * asChild>` : le Slot de Radix concatène les classes sans tailwind-merge, et
 * le `h-9` des boutons de l'AlertDialog l'emporterait sur `h-12`.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onConfirm,
}: ConfirmActionDialogProps) {
  const t = useTranslations("common")
  // Ouvert sans Trigger (état contrôlé, hook), Radix rend le focus… au
  // Trigger absent : le clavier repartait du haut de la page. On note qui
  // avait le focus avant l'ouverture (le focus n'a pas encore bougé quand
  // onOpenAutoFocus est appelé) et on le lui rend à la fermeture.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          const active = document.activeElement
          returnFocusRef.current =
            active instanceof HTMLElement && active !== document.body ? active : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const target = returnFocusRef.current
          returnFocusRef.current = null
          if (target?.isConnected) target.focus({ preventScroll: true })
        }}
        className="w-[calc(100%-2rem)] max-w-sm gap-5 rounded-2xl border-gold/25 bg-felt-deep p-5 text-cream shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] sm:rounded-2xl"
      >
        <div className="space-y-2 text-center">
          <AlertDialogTitle className="font-display text-xl font-bold text-cream">
            {title}
          </AlertDialogTitle>
          {/* Toujours une description : sans elle, Radix avertit dans la
              console à chaque ouverture. Le titre la remplace, hors écran. */}
          <AlertDialogDescription
            className={description ? "text-sm leading-relaxed text-cream/80" : "sr-only"}
          >
            {description || title}
          </AlertDialogDescription>
        </div>
        {/* Empilés sur téléphone (confirmer en haut, annuler sous le pouce) :
            à 375 px, deux colonnes de 150 px ne tiennent pas « Continuer la
            partie » ni ses traductions. */}
        <div className="flex flex-col-reverse gap-2 sm:grid sm:grid-cols-2">
          <AlertDialogCancel
            className={cn(
              buttonVariants({ variant: "quiet", size: "game" }),
              FOCUS_RING,
              "mt-0 w-full whitespace-normal leading-tight hover:text-cream"
            )}
          >
            {cancelLabel ?? t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              buttonVariants({ variant: tone, size: "game" }),
              FOCUS_RING,
              "w-full whitespace-normal leading-tight"
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type PendingConfirm = (confirmed: boolean) => void

/**
 * Confirmation en une ligne depuis un gestionnaire :
 *
 *   const [confirmDialog, confirm] = useConfirmAction()
 *   if (!(await confirm({ title, confirmLabel }))) return
 *
 * `confirmDialog` se rend une fois dans le JSX du composant. Une nouvelle
 * demande pendant qu'une autre attend répond `false` à la première ; le
 * démontage aussi, pour qu'aucune promesse ne reste suspendue.
 */
export function useConfirmAction() {
  const [options, setOptions] = useState<ConfirmActionOptions | null>(null)
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<PendingConfirm | null>(null)

  const settle = useCallback((confirmed: boolean) => {
    const resolve = pendingRef.current
    pendingRef.current = null
    resolve?.(confirmed)
  }, [])

  useEffect(() => () => settle(false), [settle])

  const confirm = useCallback(
    (next: ConfirmActionOptions) =>
      new Promise<boolean>((resolve) => {
        settle(false)
        pendingRef.current = resolve
        setOptions(next)
        setOpen(true)
      }),
    [settle]
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) settle(false)
    },
    [settle]
  )

  // Le contenu reste monté après la fermeture : l'animation de sortie de
  // l'AlertDialog garde ainsi son texte au lieu de s'éteindre à vide.
  const dialog: ReactNode = options ? (
    <ConfirmActionDialog
      {...options}
      open={open}
      onOpenChange={handleOpenChange}
      onConfirm={() => settle(true)}
    />
  ) : null

  return [dialog, confirm] as const
}
