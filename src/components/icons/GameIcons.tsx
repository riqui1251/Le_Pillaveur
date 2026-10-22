import type { CSSProperties, ReactNode } from 'react'

/*
 * Icônes des jeux, langage « jeton émaillé » : silhouettes pleines en
 * currentColor, détails découpés (evenodd) qui laissent voir le fond, traits
 * de 2 réservés aux éléments linéaires, et AU PLUS un accent par icône.
 *
 * L'accent lit `--icon-accent` (posé par GameIconById selon la surface) et
 * retombe sur currentColor : sans contexte, l'icône est monochrome — le rouge
 * en dur tombait à 2,1:1 sur le feutre. Aucune classe de couleur, aucune
 * opacité partielle, aucun <text> dans un SVG : GameIcons.test.ts y veille
 * (les classes internes battaient la teinte de la carte, et les opacités
 * /35 ne génèrent rien en Tailwind 3.3).
 */

export type IconProps = { className?: string; style?: CSSProperties }

const ACCENT = 'var(--icon-accent, currentColor)'

const LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function IconSvg({ className = 'h-6 w-6', style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

// Monsieur 3
export function DieThreeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M8.5 9H15.5A3 3 0 0 1 18.5 12V19A3 3 0 0 1 15.5 22H8.5A3 3 0 0 1 5.5 19V12A3 3 0 0 1 8.5 9ZM7 12.1a1.6 1.6 0 1 1 3.2 0a1.6 1.6 0 1 1 -3.2 0ZM10.4 15.5a1.6 1.6 0 1 1 3.2 0a1.6 1.6 0 1 1 -3.2 0ZM13.8 18.9a1.6 1.6 0 1 1 3.2 0a1.6 1.6 0 1 1 -3.2 0Z" />
      <path fill={ACCENT} d="M6.95 5.6H17.05A0.95 0.95 0 0 1 18 6.55V6.55A0.95 0.95 0 0 1 17.05 7.5H6.95A0.95 0.95 0 0 1 6 6.55V6.55A0.95 0.95 0 0 1 6.95 5.6ZM9.5 2H14.5A1 1 0 0 1 15.5 3V5.6A1 1 0 0 1 14.5 6.6H9.5A1 1 0 0 1 8.5 5.6V3A1 1 0 0 1 9.5 2Z" />
    </IconSvg>
  )
}

// Course PMU
export function HorseIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M14.4 2.2L12.7 6C10.1 6.8 7.1 9.3 4.7 12.1C3.4 13.6 3.5 15.8 5.1 16.4C6.3 16.9 7.7 17 8.9 16.6C10.1 16.2 11 15.6 11.6 15C12.6 17 13.2 19.2 13.4 21.6L21.3 19.6C21.6 13.6 20.2 8.6 16 4.6ZM10.6 10.2a1.2 1.2 0 1 1 2.4 0a1.2 1.2 0 1 1 -2.4 0Z" />
    </IconSvg>
  )
}

// Le Petit Buveur
export function BeerIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3.6 5.6a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 -5.2 0Z" />
      <path d="M6.2 7.2C7.3 7.2 7.6 8.6 8 11L9.3 18.2H3.1L4.4 11C4.8 8.6 5.1 7.2 6.2 7.2Z" />
      <path d="M3 17.8H9.4A1 1 0 0 1 10.4 18.8V20.5A1 1 0 0 1 9.4 21.5H3A1 1 0 0 1 2 20.5V18.8A1 1 0 0 1 3 17.8Z" />
      <path d="M13.7 9H17.3A1.2 1.2 0 0 1 18.5 10.2V20.3A1.2 1.2 0 0 1 17.3 21.5H13.7A1.2 1.2 0 0 1 12.5 20.3V10.2A1.2 1.2 0 0 1 13.7 9Z" />
      <path fillRule="evenodd" d="M19.4 11H19.6A2.4 2.4 0 0 1 22 13.4V16.1A2.4 2.4 0 0 1 19.6 18.5H19.4A2.4 2.4 0 0 1 17 16.1V13.4A2.4 2.4 0 0 1 19.4 11ZM19.4 12.6H19.6A0.9 0.9 0 0 1 20.5 13.5V16A0.9 0.9 0 0 1 19.6 16.9H19.4A0.9 0.9 0 0 1 18.5 16V13.5A0.9 0.9 0 0 1 19.4 12.6Z" />
      <path d="M12 8.3a1.9 1.9 0 1 1 3.8 0a1.9 1.9 0 1 1 -3.8 0ZM14.4 7.4a2.1 2.1 0 1 1 4.2 0a2.1 2.1 0 1 1 -4.2 0Z" />
    </IconSvg>
  )
}

// Hi-Lo
export function HiLoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M4.3 3.5H11.2A1.8 1.8 0 0 1 13 5.3V18.7A1.8 1.8 0 0 1 11.2 20.5H4.3A1.8 1.8 0 0 1 2.5 18.7V5.3A1.8 1.8 0 0 1 4.3 3.5ZM7.75 8.4L10.4 12L7.75 15.6L5.1 12Z" />
      <path fill={ACCENT} d="M18.05 3.89Q18.5 3 18.95 3.89L21.55 9.11Q22 10 21 10L16 10Q15 10 15.45 9.11Z" />
      <path d="M15.45 14.89Q15 14 16 14L21 14Q22 14 21.55 14.89L18.95 20.11Q18.5 21 18.05 20.11Z" />
    </IconSvg>
  )
}

// Purple
export function PurpleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7.4 3.8C4.55 5.87 2.8 7.85 2.8 10.06C2.8 11.9 4.09 13 5.47 13C6.02 13 6.6 12.86 6.6 12.4L5.56 15.3L9.24 15.3L8.2 12.4C8.2 12.86 8.78 13 9.33 13C10.71 13 12 11.9 12 10.06C12 7.85 10.25 5.87 7.4 3.8Z" />
      <path fill={ACCENT} d="M17.1 21.05C14.09 18.87 12.25 16.78 12.25 14.45C12.25 12.51 13.61 11.35 15.06 11.35C16.13 11.35 16.81 11.93 17.1 12.71C17.39 11.93 18.07 11.35 19.14 11.35C20.59 11.35 21.95 12.51 21.95 14.45C21.95 16.78 20.11 18.87 17.1 21.05Z" />
    </IconSvg>
  )
}

// Pyramide
export function PyramidIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3.2" y="16.4" width="4.6" height="5.6" rx="1" />
      <rect x="9.7" y="16.4" width="4.6" height="5.6" rx="1" />
      <rect x="16.2" y="16.4" width="4.6" height="5.6" rx="1" />
      <rect x="6.45" y="9.2" width="4.6" height="5.6" rx="1" />
      <rect x="12.95" y="9.2" width="4.6" height="5.6" rx="1" />
      <rect fill={ACCENT} x="9.7" y="2" width="4.6" height="5.6" rx="1" />
    </IconSvg>
  )
}

// Plinko
export function PlinkoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fill={ACCENT} d="M9.8 4.4a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1 -4.4 0Z" />
      <path d="M2.55 9.6a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM7.95 9.6a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM13.35 9.6a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM18.75 9.6a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM5.25 13.95a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM10.65 13.95a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0ZM16.05 13.95a1.35 1.35 0 1 1 2.7 0a1.35 1.35 0 1 1 -2.7 0Z" />
      <path {...LINE} d="M3 21H21M3 17.85V21M7.5 17.85V21M12 17.85V21M16.5 17.85V21M21 17.85V21" />
    </IconSvg>
  )
}

// 1220
export function Dice1220Icon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M15.42 2.45Q16.2 2 16.98 2.45L20.44 4.45Q21.22 4.9 21.22 5.8L21.22 9.8Q21.22 10.7 20.44 11.15L16.98 13.15Q16.2 13.6 15.42 13.15L11.96 11.15Q11.18 10.7 11.18 9.8L11.18 5.8Q11.18 4.9 11.96 4.45ZM15.85 5.21Q16.2 4.6 16.55 5.21L18.62 8.79Q18.97 9.4 18.27 9.4L14.13 9.4Q13.43 9.4 13.78 8.79Z" />
      <path fill={ACCENT} fillRule="evenodd" d="M7.27 11.13Q8 10.6 8.73 11.13L12.69 14.01Q13.42 14.54 13.14 15.39L11.63 20.06Q11.35 20.91 10.45 20.91L5.55 20.91Q4.65 20.91 4.37 20.06L2.86 15.39Q2.58 14.54 3.31 14.01ZM8.28 18.99Q8 19.2 7.72 18.99L5.53 17.4Q5.24 17.2 5.35 16.86L6.19 14.29Q6.3 13.95 6.65 13.95L9.35 13.95Q9.7 13.95 9.81 14.29L10.65 16.86Q10.76 17.2 10.47 17.4Z" />
    </IconSvg>
  )
}

// Touché-Coulé
export function ShipIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M2.47 12.48Q2 11.6 3 11.6L21 11.6Q22 11.6 21.53 12.48L19.57 16.14Q19 17.2 17.8 17.2L6.2 17.2Q5 17.2 4.43 16.14ZM6.7 14.3a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0ZM10.1 14.3a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0ZM13.5 14.3a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0Z" />
      <path d="M7.5 8.2H14.5A1 1 0 0 1 15.5 9.2V11.2A1 1 0 0 1 14.5 12.2H7.5A1 1 0 0 1 6.5 11.2V9.2A1 1 0 0 1 7.5 8.2ZM9.5 5.2H12.5A1 1 0 0 1 13.5 6.2V8.2A1 1 0 0 1 12.5 9.2H9.5A1 1 0 0 1 8.5 8.2V6.2A1 1 0 0 1 9.5 5.2ZM11 2H11A0.75 0.75 0 0 1 11.75 2.75V5.25A0.75 0.75 0 0 1 11 6H11A0.75 0.75 0 0 1 10.25 5.25V2.75A0.75 0.75 0 0 1 11 2ZM18 9.2H19.2A1 1 0 0 1 20.2 10.2V11.2A1 1 0 0 1 19.2 12.2H18A1 1 0 0 1 17 11.2V10.2A1 1 0 0 1 18 9.2Z" />
      <path {...LINE} d="M18.6 10.2L21 8.8" />
      <path {...LINE} d="M3 20.3q1.5 -1 3 0t3 0t3 0t3 0t3 0t3 0" />
    </IconSvg>
  )
}

// Le Menteur
export function LiarDiceIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M18.55 3.43L20.35 5.58Q20.86 6.19 20.35 6.81L15.06 13.28A3.9 2.5 50 0 1 10.05 7.3L17.34 3.21Q18.03 2.82 18.55 3.43ZM13.97 11.98A2.2 0.9 50 1 1 11.14 8.61A2.2 0.9 50 1 1 13.97 11.98Z" />
      <path fillRule="evenodd" d="M3.5 14.4H8.1A1.5 1.5 0 0 1 9.6 15.9V20.5A1.5 1.5 0 0 1 8.1 22H3.5A1.5 1.5 0 0 1 2 20.5V15.9A1.5 1.5 0 0 1 3.5 14.4ZM3.55 16.85a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0ZM6.25 19.55a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0Z" />
      <path fillRule="evenodd" d="M12.7 15.6H16.1A1.5 1.5 0 0 1 17.6 17.1V20.5A1.5 1.5 0 0 1 16.1 22H12.7A1.5 1.5 0 0 1 11.2 20.5V17.1A1.5 1.5 0 0 1 12.7 15.6ZM13.5 18.8a0.9 0.9 0 1 1 1.8 0a0.9 0.9 0 1 1 -1.8 0Z" />
    </IconSvg>
  )
}

// L'Imposteur
export function MaskIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M12 7.6C14.5 5.5 19.5 5.2 21.5 7C22.3 9.5 21 13.5 17.5 14.3C15.5 14.7 13.8 13.6 12 12.3C10.2 13.6 8.5 14.7 6.5 14.3C3 13.5 1.7 9.5 2.5 7C4.5 5.2 9.5 5.5 12 7.6ZM5.6 10Q8 7.7 10.4 9.7Q8 12 5.6 10ZM18.4 10Q16 7.7 13.6 9.7Q16 12 18.4 10Z" />
      <path {...LINE} d="M18.6 14.4L20.9 21" />
    </IconSvg>
  )
}

// Quiz
export function QuizBoltIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fill={ACCENT} d="M7.2 13.4C7.2 10 9.4 7.8 12 7.8C14.6 7.8 16.8 10 16.8 13.4Z" />
      <path d="M5.12 15.76Q5.4 14.9 6.3 14.9L17.7 14.9Q18.6 14.9 18.88 15.76L20.52 20.74Q20.8 21.6 19.9 21.6L4.1 21.6Q3.2 21.6 3.48 20.74Z" />
      <path {...LINE} d="M12 3V4.6M5.4 5L6.6 6.2M18.6 5L17.4 6.2" />
    </IconSvg>
  )
}

// Loup-Garou
export function WolfIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M11.61 9.1Q12 9.2 12.39 9.1L14.81 8.5Q15.2 8.4 15.42 8.07L18.9 2.95Q19.4 2.2 19.52 3.09L20.25 8.6Q20.3 9 20.45 9.37L21.65 12.23Q21.8 12.6 21.43 12.75L19.77 13.45Q19.4 13.6 19.48 13.99L19.82 15.61Q19.9 16 19.54 16.16L15.36 18.04Q15 18.2 14.74 18.51L12.26 21.49Q12 21.8 11.74 21.49L9.26 18.51Q9 18.2 8.64 18.04L4.46 16.16Q4.1 16 4.18 15.61L4.52 13.99Q4.6 13.6 4.23 13.45L2.57 12.75Q2.2 12.6 2.35 12.23L3.55 9.37Q3.7 9 3.75 8.6L4.48 3.09Q4.6 2.2 5.1 2.95L8.58 8.07Q8.8 8.4 9.19 8.5ZM13.35 12.82Q13.2 12.8 13.33 12.73L16.87 10.87Q17 10.8 16.97 10.95L16.53 13.15Q16.5 13.3 16.35 13.28ZM7.65 13.28Q7.5 13.3 7.47 13.15L7.03 10.95Q7 10.8 7.13 10.87L10.67 12.73Q10.8 12.8 10.65 12.82ZM11.85 16.44Q12 16.3 12.15 16.44L13.15 17.36Q13.3 17.5 13.15 17.64L12.15 18.56Q12 18.7 11.85 18.56L10.85 17.64Q10.7 17.5 10.85 17.36Z" />
      <path fill={ACCENT} d="M14.44 5.55A2.5 2.5 0 1 1 11.88 2.5A2 2 0 0 0 14.44 5.55Z" />
    </IconSvg>
  )
}

// Le Grand Bluff
export function BluffCardsIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3.88 4.81Q3.7 3.52 4.99 3.34L11.72 2.39Q13.01 2.21 13.19 3.5L13.31 4.37Q13.38 4.86 12.89 4.79L11.45 4.59Q9.52 4.32 9.24 6.25L7.85 16.19Q7.78 16.68 7.28 16.75L6.69 16.83Q5.59 16.99 5.44 15.89Z" />
      <path fillRule="evenodd" d="M10.61 7.3Q10.79 6.01 12.08 6.19L18.81 7.14Q20.1 7.32 19.92 8.61L18.39 19.5Q18.21 20.79 16.92 20.61L10.19 19.66Q8.9 19.48 9.08 18.19ZM13.03 9.16A2.75 2.75 0 1 1 15.33 13.97L15.19 14.96L13.41 14.71L13.78 12.09L14.67 12.21A0.95 0.95 0 1 0 14.19 10.54ZM13 17.31a0.95 0.95 0 1 1 1.9 0a0.95 0.95 0 1 1 -1.9 0Z" />
    </IconSvg>
  )
}

// L'Espion
export function SpyGlassIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6.9 9.6L8.3 4.4C8.5 3.6 9.3 3.2 10.1 3.5L12 4.2L13.9 3.5C14.7 3.2 15.5 3.6 15.7 4.4L17.1 9.6Z" />
      <path d="M3.1 9.4H20.9A1.1 1.1 0 0 1 22 10.5V10.5A1.1 1.1 0 0 1 20.9 11.6H3.1A1.1 1.1 0 0 1 2 10.5V10.5A1.1 1.1 0 0 1 3.1 9.4Z" />
      <path d="M4.1 16.9a3.3 3.3 0 1 1 6.6 0a3.3 3.3 0 1 1 -6.6 0ZM13.3 16.9a3.3 3.3 0 1 1 6.6 0a3.3 3.3 0 1 1 -6.6 0Z" />
      <path {...LINE} d="M10.9 16.4Q12 15.4 13.1 16.4" />
    </IconSvg>
  )
}

// Tabou
export function TabooIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M6 3H18A4 4 0 0 1 22 7V13.5A4 4 0 0 1 18 17.5H10.6L5.4 21.6L6.3 17.5H6A4 4 0 0 1 2 13.5V7A4 4 0 0 1 6 3ZM6.8 10.25a5.2 5.2 0 1 1 10.4 0a5.2 5.2 0 1 1 -10.4 0ZM10.32 7.3A3.4 3.4 0 0 1 14.95 11.93ZM13.68 13.2A3.4 3.4 0 0 1 9.05 8.57Z" />
    </IconSvg>
  )
}

// Crobard
export function CrayonIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M18.23 2.83Q19.1 2 19.95 2.85L21.15 4.05Q22 4.9 21.17 5.77L14.88 12.31Q14.6 12.6 14.32 12.32L11.68 9.68Q11.4 9.4 11.69 9.12Z" />
      <path fill={ACCENT} d="M10.3 10.6L13.4 13.7C13 16.4 10.6 17.6 7.6 17.4C8.4 16.2 8.2 14.8 8.5 13.6C8.8 12.3 9.4 11.3 10.3 10.6Z" />
      <path {...LINE} d="M3 20.6C5.5 18.6 8 21.6 11 20.2S16.5 18 20.6 20" />
    </IconSvg>
  )
}

// Sans Filtre
export function UncensoredIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M3 10C8.5 11.4 15.5 11.4 21 10C21 17.2 17.2 21.6 12 21.6C6.8 21.6 3 17.2 3 10ZM5.4 12.7C9.7 13.9 14.3 13.9 18.6 12.7L18.1 14.6C14.2 15.7 9.8 15.7 5.9 14.6ZM9.8 19.9C9.8 18.3 10.8 17.3 12 17.3C13.2 17.3 14.2 18.3 14.2 19.9Z" />
      <path {...LINE} d="M4.6 3.4L8.4 5.4L4.6 7.4M19.4 3.4L15.6 5.4L19.4 7.4" />
    </IconSvg>
  )
}

// Mots Codés
export function CodeKeyIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M3 2.8h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM4.65 4.45h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5ZM14.2 2.8h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM15.85 4.45h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5ZM3 9.6h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM4.65 11.25h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5ZM3 16.4h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM4.65 18.05h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5ZM14.2 16.4h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM15.85 18.05h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5Z" />
      <path fill={ACCENT} fillRule="evenodd" d="M14.2 9.6h6.8a1 1 0 0 1 1 1v2.8a1 1 0 0 1 -1 1h-6.8a1 1 0 0 1 -1 -1v-2.8a1 1 0 0 1 1 -1ZM15.85 11.25h3.5a.75 .75 0 0 1 0 1.5h-3.5a.75 .75 0 0 1 0 -1.5Z" />
    </IconSvg>
  )
}

// Dilemmes
export function DilemmaScaleIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M3.19 5.86Q2.4 5.25 3.19 4.64L5.21 3.11Q6 2.5 7 2.5L18.6 2.5Q19.6 2.5 19.6 3.5L19.6 7Q19.6 8 18.6 8L7 8Q6 8 5.21 7.39Z" />
      <path fill={ACCENT} d="M4.4 10.5Q4.4 9.5 5.4 9.5L17 9.5Q18 9.5 18.79 10.11L20.81 11.64Q21.6 12.25 20.81 12.86L18.79 14.39Q18 15 17 15L5.4 15Q4.4 15 4.4 14Z" />
      <path d="M11.8 16.5H12.2A0.8 0.8 0 0 1 13 17.3V21.2A0.8 0.8 0 0 1 12.2 22H11.8A0.8 0.8 0 0 1 11 21.2V17.3A0.8 0.8 0 0 1 11.8 16.5Z" />
    </IconSvg>
  )
}

// Petit Bac
export function AbcSheetIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M4 14a8 8 0 1 1 16 0a8 8 0 1 1 -16 0ZM7.7 18.6L10.9 9L13.1 9L16.3 18.6L14.4 18.6L13.8 16.8L10.2 16.8L9.6 18.6ZM12 11.39L13.27 15.2L10.73 15.2Z" />
      <path fill={ACCENT} d="M10.4 2H13.6A1 1 0 0 1 14.6 3V3.2A1 1 0 0 1 13.6 4.2H10.4A1 1 0 0 1 9.4 3.2V3A1 1 0 0 1 10.4 2Z" />
      <path transform="rotate(41 17.77 7.36)" d="M17.57 5.86H17.97A0.9 0.9 0 0 1 18.87 6.76V7.96A0.9 0.9 0 0 1 17.97 8.86H17.57A0.9 0.9 0 0 1 16.67 7.96V6.76A0.9 0.9 0 0 1 17.57 5.86Z" />
    </IconSvg>
  )
}

// Président
export function CrownCardIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M3.53 7.39Q3.4 6.2 4.16 7.13L7.42 11.13Q7.8 11.6 8.08 11.07L11.44 4.66Q12 3.6 12.56 4.66L15.92 11.07Q16.2 11.6 16.58 11.13L19.84 7.13Q20.6 6.2 20.47 7.39L19.49 16.2Q19.4 17 18.6 17L5.4 17Q4.6 17 4.51 16.2ZM12 10.4L13.5 12.7L12 15L10.5 12.7Z" />
      <path d="M5.8 18.5H18.2A1.2 1.2 0 0 1 19.4 19.7V20.3A1.2 1.2 0 0 1 18.2 21.5H5.8A1.2 1.2 0 0 1 4.6 20.3V19.7A1.2 1.2 0 0 1 5.8 18.5Z" />
      <path d="M2.2 5.75a1.4 1.4 0 1 1 2.8 0a1.4 1.4 0 1 1 -2.8 0ZM10.6 3.4a1.4 1.4 0 1 1 2.8 0a1.4 1.4 0 1 1 -2.8 0ZM19 5.75a1.4 1.4 0 1 1 2.8 0a1.4 1.4 0 1 1 -2.8 0Z" />
    </IconSvg>
  )
}

// Téléphone Dessiné
export function PhoneSketchIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2.6 8.6C2.6 5.4 6.8 3.4 12 3.4C17.2 3.4 21.4 5.4 21.4 8.6V9.6C21.4 10.4 20.8 11 20 11H16.6C15.8 11 15.2 10.4 15.2 9.6V8.4C13.2 7.9 10.8 7.9 8.8 8.4V9.6C8.8 10.4 8.2 11 7.4 11H4C3.2 11 2.6 10.4 2.6 9.6Z" />
      <path {...LINE} d="M5.6 10.4V12.6C5.6 16.6 7.2 19.8 10 19.8C12.6 19.8 12.6 16.2 15.2 16.2C17.8 16.2 17.6 20 20.6 20" />
    </IconSvg>
  )
}

// Jeu (générique)
export function GenericGameIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M2.5 12a9.5 9.5 0 1 1 19 0a9.5 9.5 0 1 1 -19 0ZM10.9 4.05L13.1 4.05L13.1 6.15L10.9 6.15ZM16.84 5.6L18.4 7.16L16.91 8.64L15.36 7.09ZM19.95 10.9L19.95 13.1L17.85 13.1L17.85 10.9ZM18.4 16.84L16.84 18.4L15.36 16.91L16.91 15.36ZM13.1 19.95L10.9 19.95L10.9 17.85L13.1 17.85ZM7.16 18.4L5.6 16.84L7.09 15.36L8.64 16.91ZM4.05 13.1L4.05 10.9L6.15 10.9L6.15 13.1ZM5.6 7.16L7.16 5.6L8.64 7.09L7.09 8.64ZM12 8.4C10.14 9.75 9 11.04 9 12.48C9 13.68 9.84 14.4 10.74 14.4C11.1 14.4 11.2 14.31 11.2 14.01L10.62 15.9L13.38 15.9L12.8 14.01C12.8 14.31 12.9 14.4 13.26 14.4C14.16 14.4 15 13.68 15 12.48C15 11.04 13.86 9.75 12 8.4Z" />
    </IconSvg>
  )
}

/** Ancien nom de l'icône de la Course PMU (un drapeau à damier). */
export const RaceFlagIcon = HorseIcon

/* Jeux retirés du catalogue (hidden) : redessinés dans le même langage pour
   l'historique et la supervision, qui peuvent encore les citer. */

// Roue des gorgées
export function WheelIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M4 13.8a8 8 0 1 1 16 0a8 8 0 1 1 -16 0ZM6 13.8a6 6 0 1 1 12 0a6 6 0 1 1 -12 0Z" />
      <path {...LINE} d="M12 7.8V19.8M6 13.8H18" />
      <path d="M9.6 13.8a2.4 2.4 0 1 1 4.8 0a2.4 2.4 0 1 1 -4.8 0Z" />
      <path fill={ACCENT} d="M9.9 1.8H14.1L12 4.2Z" />
    </IconSvg>
  )
}

// Ballon surprise
export function BalloonIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6 9a6 7 0 1 1 12 0a6 7 0 1 1 -12 0Z" />
      <path d="M10.6 17.4L12 15.2L13.4 17.4Z" />
      <path {...LINE} d="M12 17.4c-1.6 1.1 1.4 2 0 3.6" />
    </IconSvg>
  )
}

// Petits points
export function CrosshairIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M5 12a7 7 0 1 1 14 0a7 7 0 1 1 -14 0ZM7 12a5 5 0 1 1 10 0a5 5 0 1 1 -10 0Z" />
      <path {...LINE} d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21" />
      <path fill={ACCENT} d="M10.2 12a1.8 1.8 0 1 1 3.6 0a1.8 1.8 0 1 1 -3.6 0Z" />
    </IconSvg>
  )
}

// Pendu
export function HangmanIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path {...LINE} d="M3 21H9.5M6.5 21V3H15V5.4M15 9.8V15M12.6 13L15 11.6L17.4 13M13 18.6L15 15L17 18.6" />
      <path d="M12.8 7.6a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1 -4.4 0Z" />
    </IconSvg>
  )
}

// Trial poursuite
export function TrialMotoIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path fillRule="evenodd" d="M2 17.5a3.5 3.5 0 1 1 7 0a3.5 3.5 0 1 1 -7 0ZM3.8 17.5a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1 -3.4 0ZM15 17.5a3.5 3.5 0 1 1 7 0a3.5 3.5 0 1 1 -7 0ZM16.8 17.5a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1 -3.4 0Z" />
      <path {...LINE} d="M7.4 14.6L10 11H14.4L16.6 14.6M14.4 11L15.6 7.4H18" />
      <path fill={ACCENT} d="M8 6a2 2 0 1 1 4 0a2 2 0 1 1 -4 0Z" />
    </IconSvg>
  )
}
