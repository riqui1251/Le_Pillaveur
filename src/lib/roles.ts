export const USER_ROLES = ['user', 'moderator', 'admin', 'superadmin', 'fondateur'] as const
export type UserRole = (typeof USER_ROLES)[number]

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
  fondateur: 4,
}

const NON_ASSIGNABLE_ROLES: UserRole[] = ['fondateur']

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
}

export function normalizeRole(role: string): UserRole {
  if (
    role === 'fondateur' ||
    role === 'superadmin' ||
    role === 'admin' ||
    role === 'moderator'
  ) {
    return role
  }
  return 'user'
}

export function roleRank(role: string): number {
  return ROLE_RANK[normalizeRole(role)]
}

/** Hiérarchie : joueur < modérateur < admin < super admin < fondateur */
export function isStrictlyHigher(actorRole: string, targetRole: string): boolean {
  return roleRank(actorRole) > roleRank(targetRole)
}

export function canAccessSupervision(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.moderator
}

/** Cadre d'icône joueur : modérateur et grades supérieurs uniquement. */
export function canCustomizePlayerFrame(role: string | undefined | null): boolean {
  if (!role) return false
  return roleRank(role) > ROLE_RANK.user
}

/** Vue d'ensemble, pays, stats visiteurs et jeux : admin et grades supérieurs. */
export function canViewSupervisionAnalytics(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.admin
}

/** Liste des bannissements : admin et au-dessus. */
export function canViewSupervisionBans(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.admin
}

export function canManageUsers(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.admin
}

export function canAssignRoles(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.admin
}

export function canBanUsers(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.moderator
}

/** Réglages globaux du site (ex. activer/désactiver le vocal) : super admin+. */
export function canManageSiteSettings(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.superadmin
}

/**
 * Bannir un joueur d'une fonctionnalité (vocal / chat écrit) : modérateur+,
 * et uniquement un grade strictement inférieur (même règle que les bans compte).
 */
export function canBanFeatureTarget(actorRole: string, targetRole: string): boolean {
  return canBanUsers(actorRole) && isStrictlyHigher(actorRole, targetRole)
}

/** Ban temporaire : grade strictement supérieur à la cible. */
export function canTemporaryBanTarget(actorRole: string, targetRole: string): boolean {
  return canBanUsers(actorRole) && isStrictlyHigher(actorRole, targetRole)
}

/** Ban permanent : admin ou au-dessus, grade strictement supérieur. */
export function canPermanentBan(actorRole: string): boolean {
  return roleRank(actorRole) >= ROLE_RANK.admin
}

export function canPermanentBanTarget(actorRole: string, targetRole: string): boolean {
  return canPermanentBan(actorRole) && isStrictlyHigher(actorRole, targetRole)
}

/** @deprecated Préférer canTemporaryBanTarget ou canPermanentBanTarget */
export function canBanTarget(actorRole: string, targetRole: string): boolean {
  return canTemporaryBanTarget(actorRole, targetRole)
}

export function canAssignRole(actorRole: string, newRole: string): boolean {
  if (!canAssignRoles(actorRole) || !isUserRole(newRole)) return false
  if (NON_ASSIGNABLE_ROLES.includes(newRole)) return false
  if (newRole === 'superadmin' && roleRank(actorRole) < ROLE_RANK.fondateur) return false
  return roleRank(newRole) < roleRank(actorRole)
}

/** Modifier un autre compte : uniquement si grade strictement supérieur (pas un pair). */
export function canModifyTarget(actorRole: string, targetRole: string): boolean {
  return isStrictlyHigher(actorRole, targetRole)
}

/** Suppression définitive d'un compte : super admin et fondateur. */
export function canDeleteAccount(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.superadmin
}

export function canDeleteTarget(actorRole: string, targetRole: string): boolean {
  return canDeleteAccount(actorRole) && isStrictlyHigher(actorRole, targetRole)
}

/** Activité détaillée (connexion, temps, jeux) : tout grade staff (modérateur+). */
export function canViewAccountActivity(role: string): boolean {
  return roleRank(role) >= ROLE_RANK.moderator
}

/** Retours joueurs (bugs, suggestions) : fondateur uniquement. */
export function canViewUserFeedback(role: string): boolean {
  return normalizeRole(role) === 'fondateur'
}

export function assignableRoles(actorRole: string): UserRole[] {
  if (!canAssignRoles(actorRole)) return []
  return USER_ROLES.filter((r) => {
    if (NON_ASSIGNABLE_ROLES.includes(r)) return false
    if (r === 'superadmin' && roleRank(actorRole) < ROLE_RANK.fondateur) return false
    return roleRank(r) < roleRank(actorRole)
  })
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  fondateur:
    'Grade suprême : contrôle total sur tous les comptes (y compris suppression des super administrateurs). Non attribuable via l\'interface.',
  superadmin:
    'Gestion complète sauf les fondateurs : supervision, rôles (jusqu\'à admin), bannissements et suppression définitive des grades inférieurs.',
  admin:
    'Gestion des joueurs et modérateurs : supervision, stats, rôles (jusqu\'à modérateur) et bannissements des grades inférieurs.',
  moderator:
    'Supervision en lecture, historiques et activité des joueurs (connexion, temps, jeux), bannissement temporaire des joueurs uniquement.',
  user:
    'Joueur standard : jeux locaux, compte personnel et synchronisation cloud de ses joueurs.',
}

export function roleLabel(role: string): string {
  switch (normalizeRole(role)) {
    case 'fondateur':
      return 'Fondateur'
    case 'superadmin':
      return 'Super administrateur'
    case 'admin':
      return 'Administrateur'
    case 'moderator':
      return 'Modérateur'
    default:
      return 'Joueur'
  }
}

export type CrestTier = 'mod' | 'admin' | 'superadmin' | 'fondateur'

/**
 * Écusson de rang à afficher devant le pseudo en ligne (lobby, jeux, TV) —
 * automatique et non désactivable, séparé des cadres du catalogue (voir
 * src/lib/online/cosmetics.ts). `null` pour un joueur sans grade staff.
 */
export function crestTierForRole(role: string): CrestTier | null {
  switch (normalizeRole(role)) {
    case 'fondateur':
      return 'fondateur'
    case 'superadmin':
      return 'superadmin'
    case 'admin':
      return 'admin'
    case 'moderator':
      return 'mod'
    default:
      return null
  }
}
