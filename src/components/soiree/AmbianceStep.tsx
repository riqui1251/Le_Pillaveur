"use client"

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SOIREE_LENGTHS, SOIREE_LENGTH_ROUNDS, SOIREE_VIBES, type SoireeLength, type SoireeVibe } from '@/lib/soiree/program'
import { SoireeCta, StepHeader } from './soiree-ui'

export type AmbianceChoice = { vibe: SoireeVibe; soft: boolean; length: SoireeLength | 'carte' }

/** Chaque ambiance a sa teinte : bande en tête de carte et halo quand elle est choisie. */
const VIBE_CARD: Record<SoireeVibe, { rank: string; suit: string; red: boolean; from: string; to: string }> = {
  apero: { rank: '7', suit: '♣', red: false, from: '#14B8A6', to: '#2E7D5B' },
  monte: { rank: 'Q', suit: '♥', red: true, from: '#D9A441', to: '#B3382E' },
  grosse: { rank: 'A', suit: '♠', red: false, from: '#B3382E', to: '#6B3FA0' },
}

const LENGTH_OPTIONS = [...SOIREE_LENGTHS, 'carte'] as const

/** L'ambiance choisit les jeux et leur ordre ; Sans alcool bascule aussi le site (useAmbianceMode). */
export function AmbianceStep({
  value,
  onChange,
  onDone,
}: {
  value: AmbianceChoice
  onChange: (next: AmbianceChoice) => void
  onDone: () => void
}) {
  const t = useTranslations('soiree.ambiance')

  return (
    <>
      <StepHeader eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />

      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label={t('vibeLabel')}>
        {SOIREE_VIBES.map((vibe) => {
          const card = VIBE_CARD[vibe]
          const active = value.vibe === vibe
          return (
            <button
              key={vibe}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, vibe })}
              className={cn(
                'relative flex aspect-[5/7] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-[#D8CCAE] bg-cream px-1.5 pb-2 pt-6 text-center text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)] transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                active && '-translate-y-2 -rotate-1'
              )}
              style={active ? { boxShadow: `0 0 0 3px ${card.from}, 0 18px 34px -10px ${card.to}` } : undefined}
            >
              <span aria-hidden className={cn('absolute inset-x-0 top-0 transition-all duration-300', active ? 'h-2' : 'h-1')} style={{ background: `linear-gradient(90deg, ${card.from}, ${card.to})` }} />
              <span aria-hidden className={cn('absolute left-1.5 top-3 text-center font-display text-sm font-bold leading-none', card.red ? 'text-suit-red' : 'text-[#24201A]')}>
                {card.rank}
                <br />
                {card.suit}
              </span>
              <span aria-hidden className={cn('font-display text-3xl leading-none', card.red ? 'text-suit-red' : 'text-[#24201A]')}>
                {card.suit}
              </span>
              <span className="font-display text-sm font-bold leading-tight">{t(`vibes.${vibe}.name`)}</span>
              <span className="text-[11px] leading-snug text-[#5E5444]">{t(`vibes.${vibe}.pitch`)}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-pressed={value.soft}
        onClick={() => onChange({ ...value, soft: !value.soft })}
        className="flex w-full items-center gap-3 rounded-2xl border border-gold/20 bg-felt-deep/50 p-4 text-left transition hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-cream">{t('soft.title')}</span>
          <span className="block text-sm text-cream/70">{t('soft.text')}</span>
        </span>
        <span aria-hidden className={cn('relative h-7 w-12 shrink-0 rounded-full transition', value.soft ? 'bg-amber-500' : 'bg-cream/20')}>
          <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-cream transition', value.soft ? 'left-6' : 'left-1')} />
        </span>
      </button>

      <div className="space-y-2">
        <h2 className="font-display text-xl font-bold text-cream">{t('lengthTitle')}</h2>
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-gold/20 bg-felt-deep/50 p-1.5 sm:grid-cols-4" role="group" aria-label={t('lengthTitle')}>
          {LENGTH_OPTIONS.map((length) => {
            const active = value.length === length
            return (
              <button
                key={length}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, length })}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  active ? 'bg-cream text-[#24201A]' : 'text-cream hover:bg-gold/10'
                )}
              >
                <span className="block text-sm font-bold">{t(`lengths.${length}`)}</span>
                <span className={cn('block text-xs', active ? 'text-[#5E5444]' : 'text-cream/60')}>
                  {length === 'carte' ? t('carteHint') : t('rounds', { count: SOIREE_LENGTH_ROUNDS[length] })}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <SoireeCta>
        <Button variant="primary" size="gameLg" className="w-full" onClick={onDone}>
          {value.length === 'carte' ? t('pick') : t('compose')}
        </Button>
      </SoireeCta>
    </>
  )
}
