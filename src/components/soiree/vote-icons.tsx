/**
 * Les icônes du vote de satisfaction du Mode Soirée, dessinées pour le feutre
 * (maquette validée le 23/11/2026) : des VERRES quand la soirée est avec
 * alcool, du verre renversé au « tchin », des JETONS de casino en Sans alcool,
 * du rouge à l'or. SVG en ligne : rien à télécharger, hors ligne compris.
 * Toujours décoratives : le bouton qui les porte dit la note (aria-label).
 */

export type VoteIconSet = 'verres' | 'jetons'

const CREAM = '#F3EAD3'
const INK = '#24201A'
const AMBER = '#E0B65C'
const AMBER_LIGHT = '#F1D27A'
const SPARKLE = '#FFF6DC'
const RED = '#B3382E'

// ─── Jetons ──────────────────────────────────────────────────────────────────

const CHIPS = [
  { base: '#B3382E', edge: '#7A231C', inner: '#8A2A22', spots: CREAM, dashOpacity: 0.55 },
  { base: '#C8862C', edge: '#7C521A', inner: '#9A6620', spots: CREAM, dashOpacity: 0.55 },
  { base: '#274B8F', edge: '#14294F', inner: '#1B3769', spots: CREAM, dashOpacity: 0.55 },
  { base: CREAM, edge: '#C9B68A', inner: '#E6D7B1', spots: '#2E7D5B', dashOpacity: 0.6 },
  { base: '#D9A441', edge: '#9C7128', inner: '#B8862F', spots: SPARKLE, dashOpacity: 0.6 },
] as const

const SPOT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const

const FACE_LINE = { fill: 'none', strokeWidth: 2.4, strokeLinecap: 'round' } as const

function chipFace(rating: number) {
  switch (rating) {
    case 1:
      return (
        <>
          <g {...FACE_LINE} stroke={CREAM}>
            <path d="M23.5 24.5 L28.5 26.6" />
            <path d="M40.5 24.5 L35.5 26.6" />
            <path d="M25 41.5 Q32 34.5 39 41.5" />
          </g>
          <circle cx="26.5" cy="31" r="2" fill={CREAM} />
          <circle cx="37.5" cy="31" r="2" fill={CREAM} />
        </>
      )
    case 2:
      return (
        <g {...FACE_LINE} stroke={CREAM}>
          <path d="M23.5 30 L29 30" />
          <path d="M35 30 L40.5 30" />
          <path d="M25 39.5 Q28.5 37 32 39.5 Q35.5 42 39 39.5" />
        </g>
      )
    case 3:
      return (
        <>
          <circle cx="26.5" cy="29.5" r="2.1" fill={CREAM} />
          <circle cx="37.5" cy="29.5" r="2.1" fill={CREAM} />
          <path d="M26 39 L38 39" {...FACE_LINE} stroke={CREAM} />
        </>
      )
    case 4:
      return (
        <>
          <circle cx="26.5" cy="29" r="2.1" fill={INK} />
          <circle cx="37.5" cy="29" r="2.1" fill={INK} />
          <path d="M25 36.5 Q32 43.5 39 36.5" {...FACE_LINE} stroke={INK} />
        </>
      )
    default:
      return (
        <>
          <g {...FACE_LINE} stroke={INK}>
            <path d="M23 31 Q26 26.8 29 31" />
            <path d="M35 31 Q38 26.8 41 31" />
          </g>
          <path d="M24.5 35.5 L39.5 35.5 Q39 44 32 44 Q25 44 24.5 35.5 Z" fill={INK} />
          <path d="M28.6 41.9 Q32 39.6 35.4 41.9 Q34.4 43.9 32 43.9 Q29.6 43.9 28.6 41.9 Z" fill={RED} />
          <path d="M52.5 3.5 L54.1 8.9 L59.5 10.5 L54.1 12.1 L52.5 17.5 L50.9 12.1 L45.5 10.5 L50.9 8.9 Z" fill={SPARKLE} />
          <path d="M9 48.5 L10 51.5 L13 52.5 L10 53.5 L9 56.5 L8 53.5 L5 52.5 L8 51.5 Z" fill={SPARKLE} />
        </>
      )
  }
}

function Chip({ rating }: { rating: number }) {
  const chip = CHIPS[rating - 1]
  return (
    <>
      <circle cx="32" cy="32" r="29" fill={chip.base} />
      <g fill={chip.spots}>
        {SPOT_ANGLES.map((angle) => (
          <rect
            key={angle}
            x="29.5"
            y="3.5"
            width="5"
            height="8"
            rx="1.5"
            transform={angle ? `rotate(${angle} 32 32)` : undefined}
          />
        ))}
      </g>
      <circle cx="32" cy="32" r="29" fill="none" stroke={chip.edge} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="19.5" fill={chip.inner} />
      <circle
        cx="32"
        cy="32"
        r="19.5"
        fill="none"
        stroke={chip.spots}
        strokeWidth="1.2"
        strokeDasharray="2.4 2.6"
        opacity={chip.dashOpacity}
      />
      {chipFace(rating)}
    </>
  )
}

// ─── Verres ──────────────────────────────────────────────────────────────────

const GLASS_LINE = { stroke: CREAM, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Un peu plus grand que la case : le verre seul est fin, il disparaissait en petit. */
const GROW = 'translate(32 32) scale(1.1) translate(-32 -32)'

function UprightGlass() {
  return (
    <g {...GLASS_LINE}>
      <path d="M20 10 L44 10 C44 24 39.5 33.5 32 35 C24.5 33.5 20 24 20 10 Z" fill={CREAM} fillOpacity={0.1} />
      <path d="M32 35 L32 51" fill="none" />
      <path d="M23.5 53 L40.5 53" fill="none" />
    </g>
  )
}

/** Verre de la trinquée, dessiné autour du centre de son buvant, plein. */
function ToastGlass({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M-10.8 4 L10.8 4 C10.6 15 6.3 22.6 0 23.6 C-6.3 22.6 -10.6 15 -10.8 4 Z" fill={AMBER} />
      <g stroke={CREAM} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-12 0 L12 0 C12 14 7.5 23.5 0 25 C-7.5 23.5 -12 14 -12 0 Z" fill={CREAM} fillOpacity={0.1} />
        <path d="M0 25 L0 39" fill="none" />
        <path d="M-8 41 L8 41" fill="none" />
      </g>
    </g>
  )
}

function glass(rating: number) {
  switch (rating) {
    case 1:
      return (
        <g transform={GROW}>
          <ellipse cx="14" cy="53" rx="11.5" ry="3.2" fill={AMBER} />
          <ellipse cx="12.5" cy="52.4" rx="5.5" ry="1.1" fill={AMBER_LIGHT} opacity={0.85} />
          <circle cx="6.5" cy="46" r="1.6" fill={AMBER} />
          <circle cx="4" cy="41.5" r="1" fill={AMBER} />
          <g transform="translate(0 5) rotate(-90 32 32)" {...GLASS_LINE}>
            <path d="M20 12 L44 12 C44 26 39.5 35.5 32 37 C24.5 35.5 20 26 20 12 Z" fill={CREAM} fillOpacity={0.1} />
            <path d="M32 37 L32 50" fill="none" />
            <path d="M24 51.5 L40 51.5" fill="none" />
          </g>
        </g>
      )
    case 2:
      return (
        <g transform={GROW}>
          <UprightGlass />
          <ellipse cx="32" cy="31.4" rx="2.8" ry="1.2" fill={AMBER} />
        </g>
      )
    case 3:
      return (
        <g transform={GROW}>
          <path d="M21.6 22 L42.4 22 C41.5 28.6 37.9 32.6 32 33.4 C26.1 32.6 22.5 28.6 21.6 22 Z" fill={AMBER} />
          <path d="M22.6 22 L41.4 22" fill="none" stroke={AMBER_LIGHT} strokeWidth="1.4" strokeLinecap="round" />
          <UprightGlass />
        </g>
      )
    case 4:
      return (
        <g transform={GROW}>
          <path d="M21.3 14 L42.7 14 C42.5 25 38.2 32.6 32 33.6 C25.8 32.6 21.5 25 21.3 14 Z" fill={AMBER} />
          <path d="M22.2 14 L41.8 14" fill="none" stroke={AMBER_LIGHT} strokeWidth="1.8" strokeLinecap="round" />
          <g fill={SPARKLE}>
            <circle cx="28" cy="24.5" r="1.2" />
            <circle cx="35.5" cy="20" r="1.1" />
            <circle cx="31.5" cy="28.5" r="0.9" />
            <circle cx="38" cy="26" r="0.8" />
          </g>
          <UprightGlass />
        </g>
      )
    default:
      return (
        <>
          <g stroke={AMBER_LIGHT} strokeWidth="2" strokeLinecap="round" fill="none">
            <path d="M32 4.5 L32 9.5" />
            <path d="M24.5 6.5 L27.4 10.6" />
            <path d="M39.5 6.5 L36.6 10.6" />
          </g>
          <circle cx="27.5" cy="13" r="1.1" fill={AMBER} />
          <circle cx="36.8" cy="12.6" r="1" fill={AMBER} />
          <ToastGlass transform="translate(22.8 14) rotate(18) scale(0.8)" />
          <ToastGlass transform="translate(41.2 14) rotate(-18) scale(0.8)" />
        </>
      )
  }
}

/** Note 1 (pas du tout) à 5 (génial), bornée ; décorative (aria-hidden). */
export function VoteIcon({ set, rating, className }: { set: VoteIconSet; rating: number; className?: string }) {
  const level = Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : 3
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      {set === 'jetons' ? <Chip rating={level} /> : glass(level)}
    </svg>
  )
}
