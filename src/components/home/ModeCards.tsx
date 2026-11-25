"use client"

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { SOIREE_PLAYERS, type HomePick } from './home-choice'

const DISPLAY_FONT = 'var(--font-display), Georgia, serif'

function SoireeArt() {
  return (
    <svg viewBox="0 0 120 92" aria-hidden className="h-auto w-[min(118px,82%)]">
      <circle cx="60" cy="46" r="34" fill="none" stroke="#6B6455" strokeWidth="1.6" strokeDasharray="3 5" opacity=".55" />
      <g fill="none" stroke="#6B6455" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".75">
        <path d="M84 17v5h-5" />
        <path d="M36 75v-5h5" />
      </g>
      <rect x="48" y="26" width="24" height="40" rx="5" fill="#24201A" />
      <rect x="51.5" y="31" width="17" height="27" rx="2" fill="#D9A441" />
      <path
        d="M60 37.5c2.2 2.6 3.7 4 3.7 5.9a2.3 2.3 0 0 1-3.3 2l1.2 2.7h-3.2l1.2-2.7a2.3 2.3 0 0 1-3.3-2c0-1.9 1.5-3.3 3.7-5.9Z"
        fill="#24201A"
      />
      <g stroke="#F3EAD3" strokeWidth="1.6" strokeDasharray="2.2 2.2">
        <circle cx="60" cy="12" r="8" fill="#B3382E" />
        <circle cx="26" cy="46" r="8" fill="#274B8F" />
        <circle cx="94" cy="46" r="8" fill="#2E7D5B" />
        <circle cx="60" cy="80" r="8" fill="#6B3FA0" />
      </g>
    </svg>
  )
}

function LibreArt() {
  return (
    <svg viewBox="0 0 120 92" aria-hidden className="h-auto w-[min(118px,82%)]">
      <g transform="rotate(-16 60 84)">
        <rect x="43" y="16" width="34" height="48" rx="4" fill="#F7F0DE" stroke="#B9AD8E" strokeWidth="1.4" />
        <text x="60" y="47" textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize="20" fontWeight="800" fill="#B3382E">♦</text>
      </g>
      <g transform="rotate(16 60 84)">
        <rect x="43" y="16" width="34" height="48" rx="4" fill="#F7F0DE" stroke="#B9AD8E" strokeWidth="1.4" />
        <text x="60" y="47" textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize="20" fontWeight="800" fill="#24201A">♣</text>
      </g>
      <rect x="43" y="12" width="34" height="48" rx="4" fill="#fff" stroke="#D9A441" strokeWidth="2" />
      <text x="60" y="44" textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize="22" fontWeight="800" fill="#24201A">♠</text>
      <circle cx="90" cy="70" r="13" fill="#24201A" />
      <g fill="none" stroke="#E7C97D" strokeWidth="1.7">
        <circle cx="90" cy="70" r="7.5" />
        <path d="M82.5 70h15M90 62.5c2.3 2.2 3.3 4.7 3.3 7.5s-1 5.3-3.3 7.5c-2.3-2.2-3.3-4.7-3.3-7.5s1-5.3 3.3-7.5Z" />
      </g>
      <rect x="17" y="58" width="15" height="25" rx="3.5" fill="#24201A" />
      <rect x="19.5" y="61.5" width="10" height="16" rx="1.2" fill="#D9A441" />
    </svg>
  )
}

function Corner({ suit, red, className }: { suit: string; red: boolean; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute flex select-none flex-col items-center font-display text-[17px] font-extrabold leading-none',
        red ? 'text-suit-red' : 'text-[#24201A]',
        className
      )}
    >
      A<span className="mt-px text-[15px]">{suit}</span>
    </span>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#24201A]/[0.08] px-2 py-0.5 text-[11.5px] font-extrabold tracking-[0.02em] text-[#4A443A]">
      {children}
    </span>
  )
}

function ModeCard({
  pressed,
  dimmed,
  tilt,
  suit,
  red,
  art,
  title,
  subtitle,
  tags,
  onPress,
}: {
  pressed: boolean
  dimmed: boolean
  tilt: string
  suit: string
  red: boolean
  art: React.ReactNode
  title: string
  subtitle: string
  tags: React.ReactNode
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      // Courbe en style et non `ease-[cubic-bezier(…)]` : Tailwind 3.3 juge cette
      // classe ambiguë et ne la génère pas, la carte retombait sur `ease` par défaut.
      style={{ transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)' }}
      className={cn(
        'relative flex aspect-[5/7] w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-[14px] border border-[#D8CCAE] bg-cream px-2.5 pb-[26px] pt-[30px] text-center text-[#24201A]',
        'shadow-[0_14px_28px_-14px_rgba(0,0,0,0.75)] transition-[transform,box-shadow,opacity,filter] duration-300',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream',
        pressed ? cn('-translate-y-2.5 shadow-[0_20px_34px_-12px_rgba(0,0,0,0.8)] ring-[3px] ring-gold', tilt) : 'hover:-translate-y-1',
        dimmed && 'opacity-[0.82] saturate-[.75] hover:opacity-95'
      )}
    >
      <Corner suit={suit} red={red} className="left-[9px] top-2" />
      <Corner suit={suit} red={red} className="bottom-2 right-[9px] rotate-180" />
      <span
        aria-hidden
        style={{ transitionTimingFunction: 'cubic-bezier(0.3,1.6,0.5,1)' }}
        className={cn(
          'absolute -right-2 -top-2.5 grid h-[30px] w-[30px] place-items-center rounded-full bg-gold text-[#24201A] shadow-[0_4px_10px_rgba(0,0,0,0.45)] transition-transform duration-300',
          pressed ? 'scale-100' : 'scale-0'
        )}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
      {art}
      <span className="font-display text-[clamp(18px,5vw,23px)] font-extrabold leading-[1.1]">{title}</span>
      <span className="text-[13.5px] font-semibold leading-tight text-[#4A443A]">{subtitle}</span>
      <span className="mt-0.5 flex flex-wrap justify-center gap-1">{tags}</span>
    </button>
  )
}

/**
 * Les deux portes de l'accueil, en cartes à jouer. Le décalage de distribution
 * vit sur une enveloppe : l'animation garde sa dernière image (`both`) et
 * écraserait sinon le soulèvement de la carte choisie.
 */
export function ModeCards({
  pick,
  onPick,
  gameCount,
}: {
  pick: HomePick | null
  onPick: (pick: HomePick) => void
  gameCount: number
}) {
  const t = useTranslations('soiree.home')
  const tGame = useTranslations('nav.pages.game')
  const tPlay = useTranslations('hub.playMode')
  const tCommon = useTranslations('common')

  return (
    <div role="group" aria-label={t('modes.label')} className="grid grid-cols-2 gap-3.5 pt-1.5">
      <div className="soiree-deal min-w-0">
        <ModeCard
          pressed={pick === 'soiree'}
          dimmed={pick === 'libre'}
          tilt="rotate-[-2deg]"
          suit="♥"
          red
          art={<SoireeArt />}
          title={t('eyebrow')}
          subtitle={tGame('local')}
          tags={
            <>
              <Tag>{tPlay('local')}</Tag>
              <Tag>{t('modes.range', { min: SOIREE_PLAYERS.min, max: SOIREE_PLAYERS.max })}</Tag>
            </>
          }
          onPress={() => onPick('soiree')}
        />
      </div>
      <div className="soiree-deal min-w-0" style={{ animationDelay: '0.12s' }}>
        <ModeCard
          pressed={pick === 'libre'}
          dimmed={pick === 'soiree'}
          tilt="rotate-[2deg]"
          suit="♠"
          red={false}
          art={<LibreArt />}
          title={t('modes.libre.title')}
          subtitle={t('modes.libre.subtitle')}
          tags={
            <>
              <Tag>{tCommon('gameCount', { count: gameCount })}</Tag>
              <Tag>{t('modes.libre.allAges')}</Tag>
            </>
          }
          onPress={() => onPick('libre')}
        />
      </div>
    </div>
  )
}
