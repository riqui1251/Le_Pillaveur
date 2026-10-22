"use client"

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EspionLocationEntry } from '@/lib/espion/data'

/**
 * Grille de devinette de l'espion. Par défaut, un tap RAYE un lieu écarté
 * (et le dé-raye). En mode devinette (`guessing`), un tap SÉLECTIONNE le lieu
 * et l'essai — un seul par manche — part du bouton « Valider » de la barre du
 * bas, jamais de la grille : un doigt qui glisse sur le voisin ne coûte plus
 * la manche. Mode, sélection et ratures sont tenus par le parent (les ratures
 * sont remises à zéro à chaque manche et survivent à la fermeture du volet).
 */
export function LocationGuessGrid({
  locations,
  struck,
  onToggle,
  guessing,
  selectedId,
  onSelect,
  disabled,
}: {
  locations: readonly EspionLocationEntry[]
  struck: readonly string[]
  onToggle: (id: string) => void
  guessing: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  disabled: boolean
}) {
  const t = useTranslations('games.espion.game')

  return (
    <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <p className="text-center font-display text-base font-bold text-gold">{t('guessWhich')}</p>
      <p className={cn('text-center text-sm', guessing ? 'font-bold text-gold' : 'text-cream/80')}>
        {guessing ? t('guess.pickHint') : t('guess.strikeHint')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {locations.map((loc) => {
          const out = struck.includes(loc.id)
          const chosen = guessing && selectedId === loc.id
          // Rayé en mode devinette : on ne devine pas un lieu qu'on a écarté.
          const locked = guessing && out
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => (guessing ? onSelect(chosen ? null : loc.id) : onToggle(loc.id))}
              disabled={disabled || locked}
              aria-pressed={guessing ? chosen : out}
              className={cn(
                'flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-center text-sm font-semibold leading-tight transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                out
                  ? 'border-cream/20 bg-black/20 text-cream/70 line-through'
                  : 'border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_4px_10px_-6px_rgba(0,0,0,0.5)]',
                chosen
                  ? '-translate-y-0.5 border-suit-red ring-[3px] ring-red-400'
                  : guessing && !out && 'ring-1 ring-gold/60',
                locked && 'opacity-40',
                !locked && 'active:scale-95'
              )}
            >
              {chosen && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-suit-red text-cream" aria-hidden>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
              <span className="min-w-0 break-words">{loc.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
