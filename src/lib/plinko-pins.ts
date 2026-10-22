/**
 * Définitions PARTAGÉES des pins spéciaux Plinko (type + couleur + pictogramme).
 * Extrait du jeu pour être réutilisé par le rendu TV (cast) sans dupliquer.
 */

import { createElement, type ReactNode } from 'react'
import {
  ArrowDownUp,
  ArrowLeftRight,
  Ban,
  Beer,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  CirclePlus,
  Copy,
  Gem,
  Palette,
  Shuffle,
  Snail,
  Sparkles,
  Split,
  type LucideIcon,
} from 'lucide-react'

export type SpecialPinType =
  | 'multiplier'
  | 'addBall'
  | 'addSip'
  | 'subtractSip'
  | 'cancellation'
  | 'colorSwap'
  | 'mystery'
  | 'shake'
  | 'roundDrinks'
  | 'jackpot'
  | 'teleportation'
  | 'gravityFlip'
  | 'slowMotion'
  | 'split'
  | 'scoreSwap'
  | 'doubleEffect'
  | 'magnetLeft'
  | 'magnetRight'

/**
 * Famille d'effet, portée par la couleur du pion (comme les familles de cases
 * du Petit Buveur) : 18 teintes Tailwind ne se distinguaient pas à bout de
 * bras et ne disaient rien de l'effet. Le pictogramme reste l'identifiant
 * exact du pion ; la couleur ne fait que ranger.
 * - sips : touche les gorgées de la balle (or, glyphe encre 7,2:1)
 * - path : touche la trajectoire (bleu jeton, glyphe crème 7,0:1)
 * - balls : touche les balles elles-mêmes (crème, glyphe encre 13,5:1)
 * - table : touche toute la table (rouge carreau, glyphe crème 5,0:1)
 */
export type SpecialPinFamily = 'sips' | 'path' | 'balls' | 'table'

export const SPECIAL_PIN_FAMILIES: readonly SpecialPinFamily[] = ['sips', 'path', 'balls', 'table']

export const SPECIAL_PIN_FAMILY_STYLE: Record<SpecialPinFamily, { border: string; bg: string; fg: string }> = {
  sips: { border: 'border-amber-800', bg: 'bg-gold', fg: 'text-[#24201A]' },
  // Bleu jeton et rouge carreau ressortent à peine du feutre (1,8 et 2,5:1) : le filet crème les détache.
  path: { border: 'border-cream/70', bg: 'bg-chip-blue', fg: 'text-cream' },
  balls: { border: 'border-amber-600', bg: 'bg-cream', fg: 'text-[#24201A]' },
  table: { border: 'border-cream/70', bg: 'bg-suit-red', fg: 'text-cream' },
}

/**
 * Pictogramme dimensionné à 1em et coloré pour sa famille : il suit la taille
 * de texte du conteneur (pion du téléphone, pion de la TV) et y impose sa
 * couleur, quelle que soit celle du parent.
 */
function iconGlyph(Icon: LucideIcon, fg: string): ReactNode {
  return createElement(Icon, { 'aria-hidden': true, strokeWidth: 2.75, className: `h-[1em] w-[1em] shrink-0 ${fg}` })
}

function textGlyph(text: string, fg: string): ReactNode {
  return createElement('span', { 'aria-hidden': true, className: `font-black leading-none tracking-tight ${fg}` }, text)
}

type PinDefinition = { family: SpecialPinFamily } & ({ icon: LucideIcon } | { text: string })

const PIN_DEFINITIONS: Record<SpecialPinType, PinDefinition> = {
  multiplier: { family: 'sips', text: '×2' },
  addSip: { family: 'sips', text: '+1' },
  subtractSip: { family: 'sips', text: '−1' },
  jackpot: { family: 'sips', icon: Gem },
  doubleEffect: { family: 'sips', icon: Copy },
  cancellation: { family: 'sips', icon: Ban },
  magnetLeft: { family: 'path', icon: ChevronsLeft },
  magnetRight: { family: 'path', icon: ChevronsRight },
  gravityFlip: { family: 'path', icon: ArrowDownUp },
  teleportation: { family: 'path', icon: Sparkles },
  slowMotion: { family: 'path', icon: Snail },
  addBall: { family: 'balls', icon: CirclePlus },
  split: { family: 'balls', icon: Split },
  colorSwap: { family: 'balls', icon: Palette },
  scoreSwap: { family: 'balls', icon: ArrowLeftRight },
  roundDrinks: { family: 'table', icon: Beer },
  mystery: { family: 'table', icon: CircleHelp },
  shake: { family: 'table', icon: Shuffle },
}

export interface SpecialPinStyle {
  family: SpecialPinFamily
  border: string
  bg: string
  /** Couleur du glyphe et de tout texte posé sur le fond du pion. */
  fg: string
  /** Pictogramme (icône lucide ou « +1 », « −1 », « ×2 ») à 1em, déjà coloré : le poser dans un conteneur qui fixe sa taille de texte. */
  glyph: ReactNode
  /** Le texte du glyphe quand c'en est un, pour ne pas le répéter à côté d'un libellé identique. */
  text?: string
}

/**
 * Couleurs ET pictogramme de chaque pin spécial. Le pictogramme est
 * l'identifiant PRIMAIRE : la couleur seule ne distingue que la famille (et
 * reste inaccessible aux daltoniens). magnetLeft / magnetRight partagent la
 * même famille : c'est le sens des chevrons qui les distingue.
 */
export const SPECIAL_PIN_COLORS: Record<SpecialPinType, SpecialPinStyle> = Object.fromEntries(
  (Object.entries(PIN_DEFINITIONS) as [SpecialPinType, PinDefinition][]).map(([type, def]) => {
    const style = SPECIAL_PIN_FAMILY_STYLE[def.family]
    const glyph = 'icon' in def ? iconGlyph(def.icon, style.fg) : textGlyph(def.text, style.fg)
    return [type, { family: def.family, ...style, glyph, ...('text' in def ? { text: def.text } : {}) }]
  }),
) as Record<SpecialPinType, SpecialPinStyle>
