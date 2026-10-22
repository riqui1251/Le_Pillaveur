"use client"

import { useTranslations } from 'next-intl'
import { Mic, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setVoiceDockOpen, useVoiceDockAnchor, useVoiceDockStatus } from './voice-dock-store'

/**
 * Bouton micro d'EN-TÊTE (44 px) : ouvre la feuille du vocal de la salle. À
 * poser dans un bandeau du haut (lobby, PhaseHeader) — tant qu'il est monté,
 * la bulle flottante du dock se range et ne chevauche plus le bas de l'écran.
 *
 * Ne rend rien tant que le dock n'a pas sa place ici (hors salle, jeu local,
 * dock pas encore chargé) : on peut le poser sans condition. Léger : il ne
 * tire que lucide et le pont `voice-dock-store`, pas WebRTC.
 */
export function VoiceDockButton({ className }: { className?: string }) {
  const t = useTranslations('voice')
  useVoiceDockAnchor()
  const { available, open, joined, micMuted, inVoice, speaking } = useVoiceDockStatus()
  if (!available) return null

  return (
    <button
      type="button"
      onClick={() => setVoiceDockOpen((current) => !current)}
      aria-label={joined && inVoice > 1 ? t('titleWithCount', { count: inVoice }) : t('title')}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
        joined
          ? 'border-emerald-400/60 bg-emerald-700/90 text-cream hover:bg-emerald-700'
          : 'border-gold/30 bg-felt-deep/70 text-gold hover:bg-gold/10',
        speaking && joined && 'ring-2 ring-emerald-300/80',
        className
      )}
    >
      {joined && micMuted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
      {joined && inVoice > 1 && (
        <span
          aria-hidden
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-felt-deep bg-emerald-400 px-1 text-[11px] font-bold tabular-nums text-felt-deep"
        >
          {inVoice}
        </span>
      )}
    </button>
  )
}
