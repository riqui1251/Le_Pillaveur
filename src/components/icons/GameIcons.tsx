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



/* ─── Identité « Cartes sur Table » : icônes des jeux online ─────────────
   Un seul langage : stroke 1.75, currentColor, pas de couleur codée en dur
   (la teinte vient du contexte : encre sur carte crème, crème sur feutre). */

// Loup-Garou : tête de loup stylisée (oreilles + museau)
export function WolfIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4l3.2 3.4h7.6L19 4l1 6.2c0 5-3.4 9.3-8 9.3s-8-4.3-8-9.3z" />
      <circle cx="9.2" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M12 14.6l-1.3 1.6h2.6z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Toucher-Coulé : navire + périscope de visée
export function ShipIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 15h18l-2.5 4h-13z" />
      <path d="M7 15v-3h10v3" />
      <path d="M11 12V6h4l-1.5 2.5L15 11" />
      <path d="M2.5 19.5c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0 2 .8 3 0 2-.8 3 0" strokeWidth="1.2" opacity=".6" />
    </svg>
  )
}

// Le Menteur : gobelet renversé + dés cachés
export function LiarDiceIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10l1.5 10h-13z" />
      <path d="M4 17.5h16" />
      <rect x="8.5" y="17.5" width="3" height="3" rx="0.6" />
      <rect x="13" y="17.5" width="3" height="3" rx="0.6" />
      <circle cx="12" cy="9" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

// L'Imposteur : masque de théâtre
export function MaskIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5c2.7 1 5.3 1.5 8 1.5S17.3 6 20 5v6.5c0 4.6-3.4 8.5-8 8.5s-8-3.9-8-8.5z" />
      <path d="M8 11c.6-.7 1.7-.7 2.3 0M13.7 11c.6-.7 1.7-.7 2.3 0" />
      <path d="M9 15.5c1.9 1.4 4.1 1.4 6 0" />
    </svg>
  )
}

// Qui est l'Espion ? : loupe sur silhouette
export function SpyGlassIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3L21 21" />
      <circle cx="10.5" cy="9" r="2" />
      <path d="M7 13.8c.8-1.3 2-2 3.5-2s2.7.7 3.5 2" />
    </svg>
  )
}

// Quiz : éclair de buzzer dans une bulle
export function QuizBoltIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a8 8 0 0 1 8 8c0 4.4-3.6 8-8 8h-7l2-3.2A8 8 0 0 1 12 3z" />
      <path d="M12.8 7.5L10 12h2.6l-1.4 4 4.2-5.5h-2.8z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Le Grand Bluff : deux cartes en éventail, point d'interrogation
export function BluffCardsIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9.5" y="3.5" width="10" height="14" rx="1.8" transform="rotate(9 14.5 10.5)" />
      <rect x="4" y="5" width="10" height="14" rx="1.8" transform="rotate(-7 9 12)" />
      <path d="M8 10.2c0-1.1.9-1.9 2-1.9s2 .7 2 1.7c0 1.4-2 1.5-2 3" transform="rotate(-7 9 12)" />
      <circle cx="10" cy="15.6" r="0.5" fill="currentColor" stroke="none" transform="rotate(-7 9 12)" />
    </svg>
  )
}

// Tabou Vocal : bulle de parole barrée
export function TabooIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v9H9l-4 4v-4z" />
      <path d="M8.5 8.5l7 4M15.5 8.5l-7 4" />
    </svg>
  )
}

// Crobard : crayon qui trace
export function CrayonIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 4.5l4 4L8 20l-5 1 1-5z" />
      <path d="M13.5 6.5l4 4" />
      <path d="M13 21c2-.8 4.5-.8 7-.2" strokeWidth="1.2" opacity=".6" />
    </svg>
  )
}

// Téléphone Dessiné : combiné + trait de dessin
export function PhoneSketchIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4.5C4.2 4.5 3.5 5.2 3.5 6c0 8 6.5 14.5 14.5 14.5.8 0 1.5-.7 1.5-1.5v-2.6c0-.7-.4-1.2-1-1.4l-3-1c-.6-.2-1.2 0-1.6.5l-.9 1.2a11.6 11.6 0 0 1-5.2-5.2l1.2-.9c.5-.4.7-1 .5-1.6l-1-3c-.2-.6-.7-1-1.4-1z" />
      <path d="M14 4c2.2.4 4 1.4 5.2 3.2" strokeWidth="1.2" opacity=".6" />
      <path d="M14.5 7.2c1.2.3 2 1 2.6 2" strokeWidth="1.2" opacity=".6" />
    </svg>
  )
}

// Sans Filtre : bulle de parole + astérisque de censure
export function UncensoredIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11.2c0 3.7-3.6 6.8-8 6.8-.9 0-1.8-.1-2.6-.4L5 19.5l1-3.1C4.7 15.1 4 13.2 4 11.2 4 7.5 7.6 4.5 12 4.5s8 3 8 6.7z" />
      <path d="M12 8.6v4.4" strokeWidth="1.4" />
      <path d="M10.1 9.7l3.8 2.2" strokeWidth="1.4" />
      <path d="M13.9 9.7l-3.8 2.2" strokeWidth="1.4" />
    </svg>
  )
}

// Mots Codés : clé ancienne (le mot qui ouvre les autres)
export function CodeKeyIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="9" r="3.5" />
      <path d="M10.6 11.6 19 20" />
      <path d="M15.5 16.5l2.4-2.4" />
      <path d="M12.8 13.8l2-2" strokeWidth="1.2" opacity=".6" />
    </svg>
  )
}

// Dilemmes : balance à deux plateaux (le choix impossible)
export function DilemmaScaleIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v15" />
      <path d="M5 7h14" />
      <path d="M9 19h6" />
      <path d="M5 7l-2.4 5a2.6 2.6 0 0 0 4.8 0z" />
      <path d="M19 7l-2.4 5a2.6 2.6 0 0 0 4.8 0z" />
    </svg>
  )
}

// Petit Bac : feuille lignée + grande lettre (la copie du bac)
export function AbcSheetIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 7.5h7" />
      <path d="M8.5 10.5h7" />
      <path d="M9.5 17.5l2.5-6.5 2.5 6.5" />
      <path d="M10.4 15.4h3.2" />
    </svg>
  )
}

// Fallback générique : carte au dos orné
export function GenericGameIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M12 8.5c1.6 1.9 2.6 2.9 2.6 4.2a1.7 1.7 0 0 1-2.6 1.4 1.7 1.7 0 0 1-2.6-1.4c0-1.3 1-2.3 2.6-4.2z" fill="currentColor" stroke="none" />
    </svg>
  )
}
