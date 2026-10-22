"use client"

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Beer, Globe, Leaf, Smartphone, UserRound, Users, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PlayModeToggle } from '@/components/auth/PlayModeToggle'
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { SelectedPlayersPanel } from '@/components/hub/SelectedPlayersBar'
import { Button } from '@/components/ui/button'
import { getStoredPlayers } from '@/lib/players'

type Segment = { id: string; Icon: ComponentType<{ className?: string }>; label: string }

/** Ids des joueurs enregistrés sur l'appareil, relus au montage et quand un autre onglet les change. */
function useKnownPlayerIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    const read = () => setIds(new Set(getStoredPlayers().map((p) => p.id)))
    read()
    window.addEventListener('storage', read)
    return () => window.removeEventListener('storage', read)
  }, [])
  return ids
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-gold/20 py-4 first:border-t-0">
      <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * « Barre de soirée » du hub : les trois réglages qu'on choisit UNE fois par
 * soirée — mode (un téléphone / en ligne), ambiance, joueurs — tenus sur une
 * seule ligne de 56 px. Avant, deux bascules dorées identiques et la liste
 * des joueurs prenaient tout le premier écran : la première carte de jeu
 * tombait vers 850-950 px à 375×667, sous la ligne de flottaison.
 *
 * Chaque segment ouvre la même feuille du bas (Radix Dialog), qui porte les
 * bascules d'origine, leur explication et la gestion des joueurs. Tant que
 * l'auth n'a pas répondu, la barre garde sa hauteur, vide : rien ne saute à
 * l'arrivée de la session.
 */
export function PartyBar() {
  const t = useTranslations('hub.partyBar')
  const tAmbiance = useTranslations('hub.ambianceMode')
  const tPlayMode = useTranslations('hub.playMode')
  const tOnline = useTranslations('hub.jeuxOnline')
  const tCommon = useTranslations('common')
  const { user, loading } = useAuth()
  const { mode: ambiance } = useAmbianceMode()
  const { selectedIds } = useSelectedPlayers()
  const knownIds = useKnownPlayerIds()
  const [open, setOpen] = useState(false)

  const isOnline = user?.playMode === 'online'
  const soft = ambiance === 'soft'
  const accountName = user ? (isOnline ? (user.onlineDisplayName ?? user.displayName) : user.displayName) : null
  // Une sélection peut garder l'id d'un joueur supprimé depuis : seuls ceux
  // que l'appareil connaît encore comptent.
  const playerCount = knownIds ? selectedIds.filter((id) => knownIds.has(id)).length : 0

  const segments: Segment[] = [
    { id: 'mode', Icon: isOnline ? Globe : Smartphone, label: t(isOnline ? 'mode.online' : 'mode.local') },
    { id: 'ambiance', Icon: soft ? Leaf : Beer, label: tAmbiance(soft ? 'soft' : 'alcool') },
    isOnline
      ? { id: 'account', Icon: UserRound, label: accountName || tOnline('connectedAs') }
      : { id: 'players', Icon: Users, label: t('players', { count: playerCount }) },
  ]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div
        role="group"
        aria-label={t('title')}
        aria-busy={loading || undefined}
        className="flex h-14 items-stretch divide-x divide-gold/20 overflow-hidden rounded-2xl border border-gold/30 bg-felt-deep/90 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.9)]"
      >
        {loading
          ? segments.map((segment) => (
              <span key={segment.id} className="flex flex-1 items-center justify-center">
                <span className="h-3 w-16 rounded bg-cream/10 motion-safe:animate-pulse" />
              </span>
            ))
          : segments.map(({ id, Icon, label }) => (
              <DialogPrimitive.Trigger asChild key={id}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[13px] font-semibold text-cream transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 active:bg-gold/20"
                >
                  <Icon className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              </DialogPrimitive.Trigger>
            ))}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-x border-t border-gold/30 bg-felt-deep px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-cream shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.9)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
        >
          <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-cream/30" />
          <div className="flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="font-display text-lg font-bold text-gold">{t('title')}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={tCommon('close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <SheetSection title={tPlayMode('label')}>
            <PlayModeToggle className="max-w-none" />
            {/* La bascule n'avait aucune explication, contrairement à celle
                de l'ambiance : « Local » ne disait pas « un seul téléphone ». */}
            <p className="px-2 text-xs leading-snug text-cream/70">
              {t(isOnline ? 'modeHint.online' : 'modeHint.local')}
            </p>
          </SheetSection>

          <SheetSection title={tAmbiance('label')}>
            <AmbianceModeToggle />
          </SheetSection>

          {isOnline ? (
            accountName && (
              <SheetSection title={tOnline('connectedAs')}>
                <p className="flex items-center gap-2 text-sm font-semibold text-cream">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
                  {accountName}
                </p>
              </SheetSection>
            )
          ) : (
            <SheetSection title={tCommon('players')}>
              <SelectedPlayersPanel />
            </SheetSection>
          )}

          <DialogPrimitive.Close asChild>
            <Button variant="quiet" size="game" className="mt-1 w-full">
              {tCommon('close')}
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
