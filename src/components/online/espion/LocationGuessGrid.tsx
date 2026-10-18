"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { EspionLocationEntry } from '@/lib/espion/data'

/**
 * Grille de devinette de l'espion. Par défaut, un tap RAYE un lieu écarté
 * (et le dé-raye) ; « Je devine le lieu » passe en mode devinette, où un tap
 * envoie l'essai — un seul par manche. Les ratures sont tenues par le parent,
 * remises à zéro à chaque manche, et survivent à la fermeture du volet.
 */
export function LocationGuessGrid({
  locations,
  struck,
  onToggle,
  onGuess,
  onCancel,
  disabled,
}: {
  locations: readonly EspionLocationEntry[]
  struck: readonly string[]
  onToggle: (id: string) => void
  onGuess: (id: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  const t = useTranslations('games.espion.game')
  const [guessing, setGuessing] = useState(false)

  return (
    <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
      <p className="text-center text-xs font-semibold text-white/60">{t('guessWhich')}</p>
      <p className={cn('text-center text-[11px]', guessing ? 'font-bold text-gold' : 'text-white/40')}>
        {guessing ? t('guess.pickHint') : t('guess.strikeHint')}
      </p>
      <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
        {locations.map((loc) => {
          const out = struck.includes(loc.id)
          return (
            <button
              key={loc.id}
              onClick={() => (guessing ? onGuess(loc.id) : onToggle(loc.id))}
              disabled={disabled || (guessing && out)}
              aria-pressed={!guessing ? out : undefined}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                out
                  ? 'border-white/10 bg-white/5 text-white/30 line-through'
                  : 'border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_4px_10px_-6px_rgba(0,0,0,0.5)]',
                guessing && !out && 'ring-1 ring-gold/60'
              )}
            >
              {loc.name}
            </button>
          )
        })}
      </div>
      <button
        onClick={() => setGuessing((g) => !g)}
        className={cn(
          'w-full rounded-xl py-2.5 text-sm font-bold',
          guessing ? 'border border-white/[0.15] bg-white/5 text-white/70' : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white'
        )}
      >
        {guessing ? t('guess.toStrike') : t('guess.toGuess')}
      </button>
      <button onClick={onCancel} className="w-full text-center text-[11px] font-semibold text-white/40">
        {t('cancel')}
      </button>
    </div>
  )
}
