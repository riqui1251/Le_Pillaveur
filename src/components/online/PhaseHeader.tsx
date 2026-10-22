"use client"

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { VoiceDockButton } from '@/components/voice/VoiceDockButton'
import { useVoiceDockStatus } from '@/components/voice/voice-dock-store'
import { PhaseCountdown } from './PhaseCountdown'

/** Monté seulement quand le dock vocal est là : hors salle, aucun texte à traduire. */
function HeaderVoiceButton() {
  const { available } = useVoiceDockStatus()
  return available ? <VoiceDockButton /> : null
}

/** Seuil d'urgence par défaut du chrono (ms) quand le jeu n'en donne pas. */
const DEFAULT_DANGER_MS = 10_000

export type PhaseHeaderProps = {
  /** Repère de manche, au-dessus de la phase : « Nuit 1 », « Manche 2/5 ». */
  round?: ReactNode
  /** Nom de la phase en cours — sur deux lignes au plus, jamais coupé en une. */
  phase: ReactNode
  /** Échéance serveur de la phase (epoch ms). Absente ou nulle : pas de chrono. */
  endsAt?: number | null
  /** Durée totale de la phase (ms) — sans elle, la barre reste vide (le chiffre, lui, tourne). */
  total?: number
  /** Sous ce reste (ms), le chrono passe en urgence (rouge, chiffre qui pulse). Défaut 10 s. */
  dangerMs?: number
  /** Couleur calme de la barre — défaut or. Une couleur d'identité du jeu reste permise. */
  timerColorClassName?: string
  /** Boutons icône à droite (règles, astuce, discussion…) : 44 px chacun (`Button size="gameIcon"` ou `.touch-target`). */
  right?: ReactNode
  /** Ligne d'état sous le chrono : « À toi : désigne un suspect », « En attente de 3 joueurs ». */
  status?: ReactNode
  className?: string
}

/**
 * BANDEAU DE PHASE des jeux en ligne — manche, phase, chrono chiffré, état.
 *
 * Treize jeux recopiaient chacun leur bandeau : la phase en 12 px majuscules
 * dans un coin, le temps en filet de 6 px sans chiffre. Ici la phase se lit
 * en titre d'or et le temps en « 0:23 » (PhaseCountdown `showDigits`), qui
 * vire au rouge sous `dangerMs`.
 */
export function PhaseHeader({
  round,
  phase,
  endsAt,
  total,
  dangerMs = DEFAULT_DANGER_MS,
  timerColorClassName = 'bg-gold',
  right,
  status,
  className,
}: PhaseHeaderProps) {
  return (
    <div className={cn('rounded-2xl border border-gold/20 bg-felt-deep/80 p-3 text-cream', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Des <div> : `round` et `phase` sont des ReactNode, un jeu peut y
              glisser un bloc (icône + texte) qu'un <p> rendrait invalide. */}
          {round != null && <div className="text-sm font-semibold text-cream/80">{round}</div>}
          <div className="line-clamp-2 break-words font-display text-base font-bold leading-snug text-gold">{phase}</div>
        </div>
        {/* Le bouton vocal vit ici, une seule fois pour tous les jeux : monté,
            il range la bulle flottante qui chevauchait la barre d'action. Il
            ne rend rien hors salle. */}
        <div className="flex shrink-0 items-center gap-1.5 empty:hidden">
          <HeaderVoiceButton />
          {right}
        </div>
      </div>
      {endsAt != null && (
        <PhaseCountdown
          variant="bar"
          showDigits
          endsAt={endsAt}
          total={total}
          dangerMs={dangerMs}
          colorClassName={timerColorClassName}
        />
      )}
      {status != null && <div className="mt-2 text-sm font-semibold text-cream/80">{status}</div>}
    </div>
  )
}
