import { PLAYER_EFFECTS, PLAYER_FRAMES } from '@/lib/players'
import { roleRank } from '@/lib/roles'
import { PLAYER_ICON_SERIES } from '@/lib/online/player-icon-defs'

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
 *  - les 4 cadres de RÔLE et le cadre `staff` sont réservés au grade
 *    correspondant, hors catalogue de niveaux (voir ROLE_FRAME_MIN_RANK) ;
 *  - le système visuel EN LIGNE (icônes/effets/cadres/écusson) est
 *    entièrement séparé du local : catalogue et CSS (online-cosmetics.css)
 *    dédiés, aucune donnée ni classe partagée avec players.ts / le CSS local.
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

export type CosmeticKind = 'effect' | 'frame' | 'icon'
export type CosmeticRarity = 'commun' | 'rare' | 'epique' | 'legendaire'

export type Cosmetic = {
  id: string
  kind: CosmeticKind
  /** Niveau requis pour le débloquer (hors grant / rôle). */
  unlockLevel: number
}

/** Rareté DÉRIVÉE du niveau requis — un seul axe de vérité, pas de doublon à maintenir. */
export function effectRarity(unlockLevel: number): CosmeticRarity {
  if (unlockLevel >= 20) return 'legendaire'
  if (unlockLevel >= 12) return 'epique'
  if (unlockLevel >= 5) return 'rare'
  return 'commun'
}

/**
 * Séries d'icônes EN LIGNE — collections thématiques exclusives, débloquées
 * en bloc à un niveau donné. Totalement indépendantes de PLAYER_ICONS
 * (grille libre du local) : un joueur online ne peut équiper qu'une icône
 * d'une série qu'il a débloquée. Les ids et le rendu SVG viennent de
 * player-icon-defs.ts (source unique) ; ce module n'en dérive que ce dont
 * la progression a besoin (id + niveau de déblocage).
 */
export type IconSeries = {
  id: string
  icons: readonly string[]
  unlockLevel: number
}

export const ICON_SERIES: IconSeries[] = PLAYER_ICON_SERIES.map((series) => ({
  id: series.id,
  unlockLevel: series.unlockLevel,
  icons: series.icons.map((icon) => icon.id),
}))

/** Icône par défaut : toujours débloquée (série Apéro, niveau 1). */
export const DEFAULT_ONLINE_ICON = 'chope'

/**
 * Catalogue : chaque effet de pseudo et cadre d'icône existant, associé à un
 * niveau. Les ids d'effet DOIVENT rester alignés sur PLAYER_EFFECTS
 * (vérifié par test) ; les 7 cadres de niveau sur PLAYER_FRAMES. Les icônes
 * sont dérivées d'ICON_SERIES. Le cadre `staff` et les 4 cadres de rôle
 * n'apparaissent pas ici : réservés au grade (voir ROLE_FRAME_MIN_RANK).
 */
export const COSMETICS: Cosmetic[] = [
  // Effets de pseudo (animation du nom) — 4 raretés dérivées du niveau.
  { id: 'red', kind: 'effect', unlockLevel: 1 },
  { id: 'blue', kind: 'effect', unlockLevel: 1 },
  { id: 'emerald', kind: 'effect', unlockLevel: 3 },
  { id: 'ocean', kind: 'effect', unlockLevel: 4 },
  { id: 'ice', kind: 'effect', unlockLevel: 5 },
  { id: 'fire', kind: 'effect', unlockLevel: 6 },
  { id: 'purple', kind: 'effect', unlockLevel: 7 },
  { id: 'sunset', kind: 'effect', unlockLevel: 8 },
  { id: 'lightning', kind: 'effect', unlockLevel: 9 },
  { id: 'neon', kind: 'effect', unlockLevel: 10 },
  { id: 'gold', kind: 'effect', unlockLevel: 12 },
  { id: 'galaxy', kind: 'effect', unlockLevel: 16 },
  { id: 'matrix', kind: 'effect', unlockLevel: 18 },
  { id: 'rainbow', kind: 'effect', unlockLevel: 20 },
  { id: 'cyber', kind: 'effect', unlockLevel: 24 },
  { id: 'toast', kind: 'effect', unlockLevel: 30 },
  // Cadres d'icône (niveau)
  { id: 'silver', kind: 'frame', unlockLevel: 5 },
  { id: 'gold', kind: 'frame', unlockLevel: 10 },
  { id: 'ember', kind: 'frame', unlockLevel: 15 },
  { id: 'neon', kind: 'frame', unlockLevel: 20 },
  { id: 'royal', kind: 'frame', unlockLevel: 25 },
  { id: 'diamond', kind: 'frame', unlockLevel: 30 },
  { id: 'crown', kind: 'frame', unlockLevel: 40 },
  // Cadres VIP — hors progression, jamais débloqués par le niveau : accordés
  // à la main par un Fondateur uniquement (voir VIP_FRAME_IDS + CSS
  // .on-frame-vip-* dans online-cosmetics.css).
  { id: 'vip-jeton', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-constellation', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-ruban', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-cle', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-trefle', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-halo', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-carte', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-ambre', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-oeil', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-flamme', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-marqueterie', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-ganse', kind: 'frame', unlockLevel: 999 },
  { id: 'vip-aura', kind: 'frame', unlockLevel: 999 },
  // Icônes (dérivées des séries)
  ...ICON_SERIES.flatMap((series) =>
    series.icons.map((icon) => ({ id: icon, kind: 'icon' as const, unlockLevel: series.unlockLevel }))
  ),
]

/** Clé unique d'un cosmétique (les ids se recoupent entre effets/cadres/icônes). */
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

/**
 * Cadres de RÔLE — réservés au grade, jamais au niveau. Rang minimum requis
 * (mêmes valeurs que ROLE_RANK dans src/lib/roles.ts : user 0, moderator 1,
 * admin 2, superadmin 3, fondateur 4). `eagle` (superadmin) est déjà couvert
 * par la règle générale ci-dessous — gardé explicite pour la lisibilité.
 */
export const ROLE_FRAME_MIN_RANK: Record<string, number> = {
  sentinel: 1,
  blade: 2,
  eagle: 3,
  prestige: 4,
}

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
  if (kind === 'frame' && id in ROLE_FRAME_MIN_RANK) {
    return roleRank(ctx.role) >= ROLE_FRAME_MIN_RANK[id]
  }
  const cosmetic = findCosmetic(kind, id)
  if (!cosmetic) return false
  if (ctx.grantedKeys.has(cosmeticKey(kind, id))) return true
  return levelForXp(ctx.xp) >= cosmetic.unlockLevel
}

/** Toutes les clés `kind:id` débloquées (catalogue + rôle éventuel). */
export function unlockedCosmeticKeys(ctx: UnlockContext): Set<string> {
  const keys = new Set<string>()
  for (const c of COSMETICS) {
    if (isCosmeticUnlocked(ctx, c.kind, c.id)) keys.add(cosmeticKey(c.kind, c.id))
  }
  if (isCosmeticUnlocked(ctx, 'frame', STAFF_FRAME_ID)) {
    keys.add(cosmeticKey('frame', STAFF_FRAME_ID))
  }
  for (const id of Object.keys(ROLE_FRAME_MIN_RANK)) {
    if (isCosmeticUnlocked(ctx, 'frame', id)) keys.add(cosmeticKey('frame', id))
  }
  return keys
}

/** Garde-fous d'alignement avec players.ts (utilisés par les tests). */
export const KNOWN_EFFECT_IDS = PLAYER_EFFECTS.filter((e) => e.id !== null).map((e) => e.id as string)
export const KNOWN_FRAME_IDS = PLAYER_FRAMES.filter((f) => f.id !== null).map((f) => f.id as string)

/**
 * Sources de validation STRUCTURELLE pour les préférences en ligne (« est-ce
 * un id de cosmétique online reconnu ? », indépendant du niveau/rôle du
 * joueur — voir isCosmeticUnlocked pour le gating). Utilisées par
 * sanitizeOnlinePreferences, découplées de PLAYER_EFFECTS/FRAMES/ICONS
 * (catalogue local) pour respecter la séparation stricte local/online.
 */
export const ONLINE_EFFECT_IDS = COSMETICS.filter((c) => c.kind === 'effect').map((c) => c.id)
export const ONLINE_ICON_IDS = COSMETICS.filter((c) => c.kind === 'icon').map((c) => c.id)
export const ONLINE_FRAME_IDS = [
  ...COSMETICS.filter((c) => c.kind === 'frame').map((c) => c.id),
  STAFF_FRAME_ID,
  ...Object.keys(ROLE_FRAME_MIN_RANK),
]

/** Niveau à partir duquel un cadre n'est plus accessible que par grant Fondateur. */
export const GRANT_ONLY_FRAME_LEVEL = 900

/** Ids des cadres VIP (grant-only) — pour l'affichage dédié en Collection. */
export const VIP_FRAME_IDS = COSMETICS.filter(
  (c) => c.kind === 'frame' && c.unlockLevel >= GRANT_ONLY_FRAME_LEVEL
).map((c) => c.id)

/**
 * Libellés FR des cadres VIP — pas de traduction 4 langues ici : ce n'est
 * consommé que par le dialogue d'octroi en Supervision (staff, FR).
 * L'équivalent joueur (`players.frames.vip-*`) est traduit dans messages/*.json.
 */
export const VIP_FRAME_LABELS: Record<string, string> = {
  'vip-jeton': 'Jeton VIP',
  'vip-constellation': 'Constellation',
  'vip-ruban': "Ruban d'Honneur",
  'vip-cle': 'Clé Maîtresse',
  'vip-trefle': 'Trèfle Doré',
  'vip-halo': 'Halo Nocturne',
  'vip-carte': 'Carte Maîtresse',
  'vip-ambre': 'Anneau Ambré',
  'vip-oeil': 'Œil de la Maison',
  'vip-flamme': 'Flamme Éternelle',
  'vip-marqueterie': 'Marqueterie',
  'vip-ganse': 'Double Ganse',
  'vip-aura': 'Aura Pourpre',
}
