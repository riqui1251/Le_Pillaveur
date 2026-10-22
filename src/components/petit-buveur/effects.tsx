import { Anchor, Flame, FlipHorizontal2, Ghost, Link2, Shield, SkipForward, Skull, Sprout, Star, type LucideIcon } from 'lucide-react'
import type { PetitBuveurCastEffectKind } from '@/lib/cast-types'
import { cn } from '@/lib/utils'

/**
 * Effets en cours et difficulté — icônes partagées local + en ligne.
 *
 * Les emojis servaient d'icônes d'interface (🛡️ 👻 🔗 ⏭️ ⚓ 🪞, 🌱 🌟 🔥 💀) :
 * dessin variable d'un téléphone à l'autre, 💀 noir sur le feutre, rien de
 * l'or ni de la crème du thème. Icônes lucide en currentColor à la place,
 * avec la même teinte de famille que les pastilles.
 */

export type PbEffectKind = PetitBuveurCastEffectKind

export const PB_EFFECT_ICON: Record<PbEffectKind, LucideIcon> = {
  protection: Shield,
  curse: Ghost,
  chain: Link2,
  skip: SkipForward,
  anchor: Anchor,
  mirror: FlipHorizontal2,
}

/** Pastille (bordure + fond) et couleur d'icône de chaque effet, lisibles sur le feutre. */
export const PB_EFFECT_STYLE: Record<PbEffectKind, { chip: string; icon: string }> = {
  protection: { chip: 'border-chip-blue/60 bg-chip-blue/30', icon: 'text-sky-200' },
  curse: { chip: 'border-suit-red/50 bg-suit-red/[0.15]', icon: 'text-red-300' },
  chain: { chip: 'border-gold/50 bg-gold/[0.12]', icon: 'text-gold' },
  skip: { chip: 'border-gold/20 bg-black/20', icon: 'text-cream/80' },
  anchor: { chip: 'border-chip-blue/60 bg-chip-blue/30', icon: 'text-sky-200' },
  mirror: { chip: 'border-suit-red/50 bg-suit-red/[0.15]', icon: 'text-red-300' },
}

const KIND_BY_PREFIX: Record<string, PbEffectKind> = {
  prot: 'protection',
  curse: 'curse',
  link: 'chain',
  skip: 'skip',
  anchor: 'anchor',
  mirror: 'mirror',
}

/** Effet d'une ligne « prot-<id> », « link-<id> »… (identifiants des listes d'effets). */
export function pbEffectKindOf(id: string): PbEffectKind | null {
  return KIND_BY_PREFIX[id.split('-')[0]] ?? null
}

export function PbEffectIcon({ kind, className }: { kind: PbEffectKind; className?: string }) {
  const Icon = PB_EFFECT_ICON[kind]
  return <Icon aria-hidden className={cn('shrink-0', PB_EFFECT_STYLE[kind].icon, className)} />
}

const DIFFICULTY_ICON: Record<string, LucideIcon> = {
  facile: Sprout,
  normal: Star,
  difficile: Flame,
  extreme: Skull,
}

/** Icône de la difficulté (couleur héritée du texte voisin). */
export function PbDifficultyIcon({ difficulty, className }: { difficulty: string; className?: string }) {
  const Icon = DIFFICULTY_ICON[difficulty] ?? Star
  return <Icon aria-hidden className={cn('shrink-0', className)} />
}
