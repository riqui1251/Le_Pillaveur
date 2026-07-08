import { prisma } from '@/lib/prisma'
import {
  progressForXp,
  unlockedCosmeticKeys,
  type UnlockContext,
} from '@/lib/online/cosmetics'

/**
 * Progression d'un compte (serveur) : XP + niveau + cosmétiques débloqués.
 * Charge les grants manuels en base — à utiliser dans les routes API.
 */

export type ProgressionDto = {
  xp: number
  level: number
  /** XP acquise dans le niveau courant. */
  current: number
  /** XP du niveau courant au suivant. */
  required: number
  /** Clés `kind:id` débloquées (niveau + grants + rôle). */
  unlockedKeys: string[]
  /** Clés accordées MANUELLEMENT (sous-ensemble de unlockedKeys). */
  grantedKeys: string[]
}

export async function loadGrantedKeys(userId: string): Promise<Set<string>> {
  const grants = await prisma.cosmeticGrant.findMany({
    where: { userId },
    select: { cosmeticKey: true },
  })
  return new Set(grants.map((g) => g.cosmeticKey))
}

export async function buildProgression(user: {
  id: string
  role: string
  onlineXp: number
}): Promise<ProgressionDto> {
  const grantedKeys = await loadGrantedKeys(user.id)
  const ctx: UnlockContext = { xp: user.onlineXp, role: user.role, grantedKeys }
  const progress = progressForXp(user.onlineXp)
  return {
    xp: user.onlineXp,
    level: progress.level,
    current: progress.current,
    required: progress.required,
    unlockedKeys: [...unlockedCosmeticKeys(ctx)].sort(),
    grantedKeys: [...grantedKeys].sort(),
  }
}
