"use client"

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { tvColor } from '@/components/tv/tv-shared'

/**
 * Pion du plateau — partagé local + en ligne, cousin du pion TV (TvPbPawn).
 *
 * Un emoji nu de 12 à 20 px ne se distinguait pas d'un autre (158 icônes
 * tirées au hasard : doublons, 🎱 ou 🦇 noirs sur le feutre). Le pion est un
 * jeton : centre crème (l'emoji le plus sombre y reste lisible), anneau à la
 * couleur du joueur — la MÊME que sur la TV (palette TV, rang du joueur dans
 * la table) — et, pour le joueur au tour, un second anneau or.
 *
 * Tailles en px (style en ligne) : la police de l'emoji suit le diamètre,
 * quel que soit le nombre de pions sur la case.
 */
export function PbPawn({
  icon,
  colorIndex,
  size,
  active = false,
  className,
  children,
}: {
  /** Emoji ou glyphe du joueur (PlayerAvatarGlyph), à défaut son initiale. */
  icon: ReactNode
  /** Rang du joueur dans la table : choisit la couleur de son anneau. */
  colorIndex: number
  /** Diamètre en px, anneau non compris. */
  size: number
  /** Joueur au tour : anneau or autour de l'anneau de couleur. */
  active?: boolean
  className?: string
  /** Superposé au pion (badge « +N » qui s'envole, par exemple). */
  children?: ReactNode
}) {
  const color = tvColor(colorIndex)
  const ring = size >= 24 ? 3 : 2
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full bg-cream font-bold leading-none text-[#24201A]',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, Math.round(size * 0.6)),
        boxShadow: active
          ? `0 0 0 ${ring}px ${color}, 0 0 0 ${ring + 1}px rgb(var(--felt-deep-rgb)), 0 0 0 ${ring + 3}px rgb(var(--gold-rgb))`
          : `0 0 0 ${ring}px ${color}, 0 1px 3px ${ring}px rgba(0, 0, 0, 0.35)`,
      }}
    >
      <span aria-hidden className="select-none">
        {icon}
      </span>
      {children}
    </span>
  )
}

/**
 * Diamètre d'un pion selon le nombre de pions sur la case (environ 42 px
 * utiles au téléphone) : seul, il se voit de loin ; jusqu'à quatre, une
 * grille 2 × 2 ; jusqu'à neuf (case de départ), une grille 3 × 3 ; au-delà
 * (le jeu local accepte de grandes tablées), 4 colonnes. L'anneau est une
 * ombre (hors mise en page) : les anneaux voisins se touchent sans que la
 * grille déborde de la case. À 9 px dès cinq pions, celui de la case de
 * départ n'était plus qu'un point.
 */
export function pbPawnSize(onCase: number): number {
  if (onCase <= 1) return 28
  if (onCase <= 4) return 18
  if (onCase <= 9) return 12
  return 8
}

/** Colonnes de la grille des pions d'une case (voir pbPawnSize). */
export function pbPawnColumns(onCase: number): string {
  if (onCase <= 1) return 'grid-cols-1'
  if (onCase <= 4) return 'grid-cols-2'
  if (onCase <= 9) return 'grid-cols-3'
  return 'grid-cols-4'
}
