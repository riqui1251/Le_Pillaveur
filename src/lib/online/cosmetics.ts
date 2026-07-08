import { PLAYER_EFFECTS, PLAYER_FRAMES } from '@/lib/players'
import { roleRank } from '@/lib/roles'

/**
 * Progression EN LIGNE : XP, niveaux et cosmétiques débloquables.
 *
 * Module PARTAGÉ client/serveur — aucune dépendance au registre des jeux ni
 * à Prisma. Les règles d'attribution d'XP vivent ici pour être testables.
 *
 * Règles :
 *  - l'XP n'est gagnée que sur les parties en ligne COMPTABILISÉES (mêmes
 *    filtres anti-abus que le classement : ≥ 2 comptes humains, bots exclus) ;
 *  - victoire = 50 XP, défaite = 20 XP (jouer rapporte toujours) ;
 *  - le niveau est DÉRIVÉ de l'XP (jamais stocké) — pas de désynchronisation ;
 *  - un cosmétique est débloqué par niveau, par grant manuel (fondateur) ou
 *    d'office à partir du grade super administrateur ;
 *  - le cadre `staff` reste réservé au staff (modérateur et au-dessus).
 */

export const XP_WIN = 50
export const XP_LOSS = 20

/** XP TOTALE requise pour atteindre `level` (niveau 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return 50 * (level - 1) * level
}

/** Niveau atteint avec `xp` d'XP cumulée. */
export function levelForXp(xp: number): number {
  if (xp <= 0) return 1
  // Inverse de 50·(n-1)·n = xp → n = (1 + sqrt(1 + xp/12.5)) / 2
  const n = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2)
  return Math.max(1, n)
}

/** Avancement dans le niveau courant (pour la barre d'XP). */
export function progressForXp(xp: number): {
  level: number
  /** XP acquise DANS le niveau courant. */
  current: number
  /** XP nécessaire pour passer au niveau suivant (depuis le début du niveau). */
  required: number
} {
  const level = levelForXp(xp)
  const floor = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, current: xp - floor, required: next - floor }
}

export type CosmeticKind = 'effect' | 'frame'

export type Cosmetic = {
  id: string
  kind: CosmeticKind
  /** Niveau requis pour le débloquer (hors grant / staff). */
  unlockLevel: number
}

/**
 * Catalogue : chaque effet de pseudo et cadre d'icône existant, associé à un
 * niveau. Les ids DOIVENT rester alignés sur PLAYER_EFFECTS / PLAYER_FRAMES
 * (vérifié par test). Le cadre `staff` n'apparaît pas ici : réservé au rôle.
 */
export const COSMETICS: Cosmetic[] = [
  // Effets de pseudo (animation du nom)
  { id: 'red', kind: 'effect', unlockLevel: 1 },
  { id: 'blue', kind: 'effect', unlockLevel: 1 },
  { id: 'ice', kind: 'effect', unlockLevel: 2 },
  { id: 'fire', kind: 'effect', unlockLevel: 3 },
  { id: 'emerald', kind: 'effect', unlockLevel: 4 },
  { id: 'ocean', kind: 'effect', unlockLevel: 5 },
  { id: 'purple', kind: 'effect', unlockLevel: 6 },
  { id: 'sunset', kind: 'effect', unlockLevel: 7 },
  { id: 'lightning', kind: 'effect', unlockLevel: 8 },
  { id: 'neon', kind: 'effect', unlockLevel: 10 },
  { id: 'gold', kind: 'effect', unlockLevel: 12 },
  { id: 'rainbow', kind: 'effect', unlockLevel: 14 },
  { id: 'galaxy', kind: 'effect', unlockLevel: 16 },
  { id: 'matrix', kind: 'effect', unlockLevel: 18 },
  { id: 'cyber', kind: 'effect', unlockLevel: 20 },
  // Cadres d'icône
  { id: 'silver', kind: 'frame', unlockLevel: 5 },
  { id: 'gold', kind: 'frame', unlockLevel: 10 },
  { id: 'ember', kind: 'frame', unlockLevel: 15 },
  { id: 'neon', kind: 'frame', unlockLevel: 20 },
  { id: 'royal', kind: 'frame', unlockLevel: 25 },
  { id: 'diamond', kind: 'frame', unlockLevel: 30 },
  { id: 'crown', kind: 'frame', unlockLevel: 40 },
]

/** Clé unique d'un cosmétique (les ids se recoupent entre effets et cadres). */
export function cosmeticKey(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`
}

export function findCosmetic(kind: CosmeticKind, id: string): Cosmetic | null {
  return COSMETICS.find((c) => c.kind === kind && c.id === id) ?? null
}

/** Ids des effets/cadres SANS niveau requis (toujours équipables). */
export const FREE_EFFECT_IDS = COSMETICS.filter(
  (c) => c.kind === 'effect' && c.unlockLevel <= 1
).map((c) => c.id)

const SUPERADMIN_RANK = 3
const STAFF_FRAME_ID = 'staff'

export type UnlockContext = {
  xp: number
  role: string
  /** Clés `kind:id` accordées manuellement (table CosmeticGrant). */
  grantedKeys: ReadonlySet<string>
}

/** Un cosmétique du catalogue est-il débloqué pour ce joueur ? */
export function isCosmeticUnlocked(ctx: UnlockContext, kind: CosmeticKind, id: string): boolean {
  if (roleRank(ctx.role) >= SUPERADMIN_RANK) return true
  if (kind === 'frame' && id === STAFF_FRAME_ID) {
    // Réservé au staff, hors catalogue de niveaux.
    return roleRank(ctx.role) > 0
  }
  const cosmetic = findCosmetic(kind, id)
  if (!cosmetic) return false
  if (ctx.grantedKeys.has(cosmeticKey(kind, id))) return true
  return levelForXp(ctx.xp) >= cosmetic.unlockLevel
}

/** Toutes les clés `kind:id` débloquées (catalogue + staff éventuel). */
export function unlockedCosmeticKeys(ctx: UnlockContext): Set<string> {
  const keys = new Set<string>()
  for (const c of COSMETICS) {
    if (isCosmeticUnlocked(ctx, c.kind, c.id)) keys.add(cosmeticKey(c.kind, c.id))
  }
  if (isCosmeticUnlocked(ctx, 'frame', STAFF_FRAME_ID)) {
    keys.add(cosmeticKey('frame', STAFF_FRAME_ID))
  }
  return keys
}

/** Garde-fous d'alignement avec players.ts (utilisés par les tests). */
export const KNOWN_EFFECT_IDS = PLAYER_EFFECTS.filter((e) => e.id !== null).map((e) => e.id as string)
export const KNOWN_FRAME_IDS = PLAYER_FRAMES.filter((f) => f.id !== null).map((f) => f.id as string)
