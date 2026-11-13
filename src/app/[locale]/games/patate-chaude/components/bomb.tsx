"use client"

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * La bombe et le souffle du BOUM, dessinés en jetons de couleur (crème, or, rouge carreau) :
 * rien en hexadécimal, l'ambiance Soft garde le même dessin sur son feutre bleu nuit.
 * L'étincelle crépite en CSS (fixe si l'appareil demande moins d'animations).
 */

type BombArtProps = {
  /** Mèche allumée : l'étincelle brille au bout du cordon. */
  lit: boolean
  className?: string
}

export const BombArt = forwardRef<HTMLDivElement, BombArtProps>(function BombArt({ lit, className }, ref) {
  const shineId = `pc-shine-${useId().replace(/:/g, '')}`
  return (
    <div ref={ref} aria-hidden className={cn('relative', className)}>
      <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id={shineId} cx="36%" cy="32%" r="68%">
            <stop offset="0%" style={{ stopColor: 'rgb(var(--cream-rgb))', stopOpacity: 0.5 }} />
            <stop offset="38%" style={{ stopColor: 'rgb(var(--cream-rgb))', stopOpacity: 0.1 }} />
            <stop offset="100%" style={{ stopColor: 'rgb(var(--cream-rgb))', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <ellipse cx="56" cy="113" rx="34" ry="5" className="fill-black/40" />
        <path
          d="M80 32C86 22 92 16 103 13"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className={lit ? 'stroke-cream/70' : 'stroke-cream/40'}
        />
        <rect x="66" y="27" width="20" height="15" rx="3" transform="rotate(38 76 34.5)" className="fill-cream/50" />
        <circle cx="56" cy="70" r="40" className="fill-black" />
        <circle cx="56" cy="70" r="40" fill={`url(#${shineId})`} />
        <circle cx="56" cy="70" r="39" fill="none" strokeWidth={1.5} className="stroke-cream/20" />
      </svg>
      {lit && <span className="pc-spark absolute left-[86%] top-[11%] h-[22%] w-[22%] rounded-full" />}
      <style jsx global>{`
        .pc-spark {
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgb(var(--cream-rgb)) 0 18%,
            rgb(var(--gold-rgb)) 42%,
            rgb(var(--gold-rgb) / 0) 70%
          );
        }
        @media (prefers-reduced-motion: no-preference) {
          .pc-spark {
            animation: pc-flick 0.16s steps(2) infinite alternate;
          }
        }
        @keyframes pc-flick {
          from {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          to {
            transform: translate(-50%, -50%) scale(1.35);
            opacity: 0.75;
          }
        }
      `}</style>
    </div>
  )
})

/** Rayons du souffle, derrière le « BOUM ! » de la carte rouge. */
export function BoomBurst({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute left-1/2 top-[40%] h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full', className)}
      style={{
        background: 'repeating-conic-gradient(rgb(var(--cream-rgb) / 0.16) 0 7deg, transparent 7deg 20deg)',
        WebkitMaskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
        maskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
      }}
    />
  )
}
