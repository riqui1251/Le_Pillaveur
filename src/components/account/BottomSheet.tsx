"use client"

import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * Feuille du bas commune à la connexion et à « Mon compte » ouvertes depuis la
 * barre : même gabarit que la feuille « Réglages de la soirée » du hub
 * (src/components/hub/PartyBar.tsx), pour qu'une feuille du site se reconnaisse
 * d'un écran à l'autre. Au-delà de 640 px, elle se pose au centre.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  const tCommon = useTranslations('common')
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-3xl border-x border-t border-gold/30 bg-felt-deep px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-cream shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.9)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border-b sm:pt-4',
            className
          )}
        >
          <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-cream/30 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">{eyebrow}</p>}
              <DialogPrimitive.Title className="font-display text-2xl font-bold leading-tight text-cream">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-cream/70">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={tCommon('close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
