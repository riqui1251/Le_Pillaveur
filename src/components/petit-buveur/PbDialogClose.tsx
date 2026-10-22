"use client"

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'

/**
 * Croix de fermeture de 44 px des fenêtres informatives du Petit Buveur
 * (effets en cours, légende, historique, menu). Celle du DialogContent par
 * défaut est une icône de 16 px à 70 % : trop petite pour un pouce. À poser
 * avec `showCloseButton={false}` et un `onEscapeKeyDown` qui ne bloque pas
 * Échap (le DialogContent le bloque sans sa propre croix), et un titre en
 * `pr-12` pour ne pas passer dessous.
 */
export function PbDialogClose({ label }: { label: string }) {
  return (
    <DialogClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="gameIcon"
        aria-label={label}
        className="absolute right-2 top-2 border border-gold/20 bg-black/20 text-cream/80 hover:bg-black/30 hover:text-gold sm:right-3 sm:top-3"
      >
        <X aria-hidden className="h-5 w-5" />
      </Button>
    </DialogClose>
  )
}

/** Échap ferme quand même la fenêtre (le DialogContent sans croix l'empêche). */
export const allowEscapeClose = () => {}
