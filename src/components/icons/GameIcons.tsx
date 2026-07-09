import React from 'react'

type IconProps = { className?: string }

export function PlinkoIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3" className="text-slate-400" stroke="currentColor"/>
      {/* pins */}
      <circle cx="7" cy="9" r=".8" className="fill-current text-slate-400" />
      <circle cx="12" cy="9" r=".8" className="fill-current text-slate-400" />
      <circle cx="17" cy="9" r=".8" className="fill-current text-slate-400" />
      <circle cx="9.5" cy="12" r=".8" className="fill-current text-slate-400" />
      <circle cx="14.5" cy="12" r=".8" className="fill-current text-slate-400" />
      {/* ball */}
      <circle cx="12" cy="6" r="1.6" className="fill-current text-fuchsia-500" />
    </svg>
  )
}

// PMU: tête de cheval stylisée
export function HorseIcon({ className = 'w-6 h-6' }: IconProps) {
  // Silhouette de tête de cheval (profil) simple et lisible
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      {/* Silhouette principale */}
      <path
        d="M16.5 4.2c-.9.2-1.8.7-2.5 1.3-.4.3-.7.7-1 1.1l-.8 1c-.2.2-.4.3-.7.3H9.7c-.3 0-.5.1-.7.3L7.8 9.1c-.2.2-.2.5 0 .7l1 .9c.2.2.2.5 0 .7l-1.7 1.6c-.9.8-.6 2.3.6 2.7.2.1.5.1.7.1h2.6c.2 0 .4.1.6.2l1.3 1.1c.6.5 1.3.8 2.1.8h.7c1.8 0 3.4-1.1 4.1-2.7l.2-.6-1.7-2.9 1.1-1c.4-.4.5-1 .2-1.5l-1.5-2.1c-.4-.6-1.1-.9-1.8-.8l-1 .1.8-1.4c.2-.3 0-.8-.4-1-.2-.1-.4-.1-.6 0Z"
        fill="currentColor"
      />
      {/* Oeil */}
      <circle cx="15.6" cy="9.1" r="0.5" fill="#0a0a0a" />
      {/* Naseau */}
      <circle cx="12.2" cy="13.4" r="0.35" fill="#161616" />
      {/* Légère crinière */}
      <path d="M9.2 8.3c.6-.6 1.4-1.1 2.3-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function FlagIcon({ className = 'w-6 h-6' }: IconProps) {
  // Drapeau simple sur mât, pour fallback si besoin
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="5" y1="4" x2="5" y2="20" />
      <path d="M6 5h8c.8 0 1.5.7 1.5 1.5V7c0 .8.7 1.5 1.5 1.5H20v7h-3c-.8 0-1.5.7-1.5 1.5v.5c0 .8-.7 1.5-1.5 1.5H6V5Z" fill="currentColor" />
    </svg>
  )
}

export function RaceFlagIcon({ className = 'w-6 h-6' }: IconProps) {
  // Drapeau à damier (course) sur mât
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Mât */}
      <line x1="4" y1="3" x2="4" y2="21" />
      {/* Pavillon (damier) */}
      <g fill="currentColor" stroke="none">
        {/* Ligne 1 */}
        <rect x="6" y="5" width="2.2" height="2.2" />
        <rect x="10.4" y="5" width="2.2" height="2.2" />
        <rect x="14.8" y="5" width="2.2" height="2.2" />
        {/* Ligne 2 */}
        <rect x="8.2" y="7.4" width="2.2" height="2.2" />
        <rect x="12.6" y="7.4" width="2.2" height="2.2" />
        <rect x="17" y="7.4" width="2.2" height="2.2" />
        {/* Ligne 3 */}
        <rect x="6" y="9.8" width="2.2" height="2.2" />
        <rect x="10.4" y="9.8" width="2.2" height="2.2" />
        <rect x="14.8" y="9.8" width="2.2" height="2.2" />
        {/* Ligne 4 */}
        <rect x="8.2" y="12.2" width="2.2" height="2.2" />
        <rect x="12.6" y="12.2" width="2.2" height="2.2" />
        <rect x="17" y="12.2" width="2.2" height="2.2" />
      </g>
    </svg>
  )
}

export function BeerIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="7" width="9" height="12" rx="2" className="fill-current text-amber-400/60" />
      <rect x="15" y="9" width="3" height="8" rx="1.5" className="fill-current text-slate-300/50" />
      <path d="M7 7c0-1.7 1.3-3 3-3h2c1.7 0 3 1.3 3 3" className="stroke-current" />
    </svg>
  )
}

export function HiLoIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="4" width="8" height="12" rx="2" className="text-slate-300/20" fill="currentColor" />
      <rect x="11" y="8" width="8" height="12" rx="2" className="text-slate-300/30" fill="currentColor" />
      <path d="M9 9l2-2 2 2" className="stroke-emerald-400" />
      <path d="M15 15l-2 2-2-2" className="stroke-rose-400" />
    </svg>
  )
}

export function PurpleIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="4" width="8" height="12" rx="2" className="text-purple-300/30" fill="currentColor" />
      <rect x="11" y="8" width="8" height="12" rx="2" className="text-purple-400/40" fill="currentColor" />
      <path d="M9 9l2-2 2 2" className="stroke-purple-400" />
      <path d="M15 15l-2 2-2-2" className="stroke-violet-400" />
    </svg>
  )
}

export function PyramidIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 19h18M6 16h12M9 13h6M11 10h2" className="stroke-current" />
      <path d="M12 5l7 14H5L12 5z" className="text-amber-400/20" fill="currentColor" />
    </svg>
  )
}

export function DieThreeIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="3" className="text-slate-300/20" fill="currentColor" />
      <circle cx="9" cy="9" r="1.2" className="fill-current" />
      <circle cx="12" cy="12" r="1.2" className="fill-current" />
      <circle cx="15" cy="15" r="1.2" className="fill-current" />
    </svg>
  )
}

export function BalloonIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="9" rx="5" ry="6" className="text-rose-400/70" fill="currentColor" />
      <path d="M12 15c0 2 2 2 0 3-1 .5-1.5 1-2 2" className="stroke-current" />
    </svg>
  )
}

export function TargetIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" className="text-slate-300/20" fill="currentColor" />
      <circle cx="12" cy="12" r="4" className="fill-current" />
      <circle cx="12" cy="12" r="1.5" className="text-white" fill="currentColor" />
    </svg>
  )
}

export function CrosshairIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="6" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="1.5" className="fill-current" />
    </svg>
  )
}

export function WheelIcon({ className = 'w-6 h-6' }: IconProps) {
  // Roue segmentée stylisée avec pointeur
  return (
    <svg viewBox="0 0 24 24" className={className}>
      {/* Disque */}
      <circle cx="12" cy="12" r="9" className="text-slate-300/20" fill="currentColor" />
      {/* Segments (marquages) */}
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="M5.4 5.4l2.1 2.1" />
        <path d="M16.5 16.5l2.1 2.1" />
        <path d="M18.6 5.4l-2.1 2.1" />
        <path d="M7.5 16.5l-2.1 2.1" />
      </g>
      {/* Moyeu */}
      <circle cx="12" cy="12" r="1.6" className="fill-current" />
      {/* Pointeur */}
      <path d="M12 1.8l1.6 2.8H10.4L12 1.8Z" className="fill-current" />
    </svg>
  )
}

export function MapIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" className="fill-current text-emerald-500/20" />
      <path d="M9 4v13" className="stroke-current text-emerald-400" />
      <path d="M15 7v13" className="stroke-current text-emerald-400" />
      <circle cx="9" cy="10" r="1" className="fill-current text-emerald-600" />
      <circle cx="15" cy="13" r="1" className="fill-current text-emerald-600" />
      <circle cx="12" cy="16" r="1" className="fill-current text-emerald-600" />
    </svg>
  )
}

export function GooseIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Corps de l'oie */}
      <ellipse cx="12" cy="14" rx="6" ry="4" className="fill-current text-blue-500/20" />
      {/* Cou */}
      <path d="M12 10c0-2 2-3 4-3s4 1 4 3" className="stroke-current text-blue-400" />
      {/* Tête */}
      <circle cx="16" cy="8" r="2" className="fill-current text-blue-300" />
      {/* Bec */}
      <path d="M18 8l2 1" className="stroke-current text-orange-400" strokeWidth="2" />
      {/* Aile */}
      <path d="M8 12c-1 1-2 2-1 3s2 1 3 0" className="stroke-current text-blue-400" />
      {/* Patte */}
      <path d="M10 18l1 2M14 18l-1 2" className="stroke-current text-orange-400" />
    </svg>
  )
}

export function HangmanIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Potence - poteau vertical */}
      <path d="M6 3v16" className="stroke-current" strokeWidth="2" />
      {/* Potence - barre horizontale */}
      <path d="M6 3h8" className="stroke-current" strokeWidth="2" />
      {/* Potence - corde */}
      <path d="M14 3v3" className="stroke-current" strokeWidth="1.5" />
      {/* Tête */}
      <circle cx="14" cy="8" r="1.5" className="stroke-current" fill="none" />
      {/* Corps */}
      <path d="M14 9.5v5" className="stroke-current" strokeWidth="1.5" />
      {/* Bras gauche */}
      <path d="M14 11l-2 2" className="stroke-current" strokeWidth="1.5" />
      {/* Bras droit */}
      <path d="M14 11l2 2" className="stroke-current" strokeWidth="1.5" />
      {/* Jambe gauche */}
      <path d="M14 14.5l-2 2.5" className="stroke-current" strokeWidth="1.5" />
      {/* Jambe droite */}
      <path d="M14 14.5l2 2.5" className="stroke-current" strokeWidth="1.5" />
      {/* Base de la potence */}
      <path d="M4 19h4" className="stroke-current" strokeWidth="2" />
    </svg>
  )
}

/** Deux dés : faces 12 et 20 pour le jeu 1220 */
export function Dice1220Icon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="5" width="9" height="9" rx="1.5" className="fill-amber-500/35" />
      <text x="7.5" y="11.8" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700">
        12
      </text>
      <rect x="12" y="10" width="9" height="9" rx="1.5" className="fill-violet-500/35" />
      <text x="16.5" y="16.8" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700">
        20
      </text>
    </svg>
  )
}

export function TrialMotoIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Moto simplifiée vue de côté */}
      {/* Corps principale */}
      <ellipse cx="12" cy="14" rx="8" ry="3" className="text-red-400/30" fill="currentColor" />
      {/* Roue avant */}
      <circle cx="6" cy="17" r="2.5" className="stroke-current" fill="none" />
      {/* Roue arrière */}
      <circle cx="18" cy="17" r="2.5" className="stroke-current" fill="none" />
      {/* Guidon */}
      <path d="M5 10l-2 1M19 10l2 1" className="stroke-current" strokeWidth="2" />
      {/* Pot d'échappement - flammes */}
      <path d="M22 17c.5 1 1.5 0 2-1" className="stroke-current text-orange-500" strokeWidth="1.5" />
      {/* Casque (cercle autour de la tête) */}
      <circle cx="12" cy="9" r="3" className="stroke-current text-blue-300" fill="none" />
      {/* Pare-brise */}
      <path d="M10 9c.5-1 1.5 0 2 1.5 0-.5 1-.5 1.5 0" className="stroke-current text-gray-300" strokeWidth="1.5" />
      {/* Vitesse - lignes de mouvement */}
      <path d="M4 14l1-2M3 15l1-1.5" className="stroke-current text-orange-400" strokeWidth="1" strokeOpacity="0.6" />
    </svg>
  )
}


