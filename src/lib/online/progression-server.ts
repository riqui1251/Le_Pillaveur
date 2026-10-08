import { prisma } from '@/lib/prisma'
import {
  progressForXp,
  unlockedCosmeticKeys,
  type UnlockContext,
} from '@/lib/online/cosmetics'
import { readWeeklyStreak } from '@/lib/online/streak'

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
  /**
   * Série HEBDOMADAIRE : semaines consécutives et dernière semaine créditée
   * (Paris, clé ISO 'YYYY-Www'). Le champ garde le nom de la colonne
   * (`streakLastDay`) pour ne pas casser le contrat avec un onglet ouvert
   * pendant le déploiement ; la valeur, elle, est TOUJOURS une semaine :
   * l'ancienne forme quotidienne est convertie ici (readWeeklyStreak).
   */
  streakCount: number
  streakLastDay: string | null
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
  const [grantedKeys, streak] = await Promise.all([
    loadGrantedKeys(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { streakCount: true, streakLastDay: true },
    }),
  ])
  const ctx: UnlockContext = { xp: user.onlineXp, role: user.role, grantedKeys }
  const progress = progressForXp(user.onlineXp)
  const weekly = readWeeklyStreak({
    streakCount: streak?.streakCount ?? 0,
    streakLastDay: streak?.streakLastDay ?? null,
  })
  return {
    xp: user.onlineXp,
    level: progress.level,
    current: progress.current,
    required: progress.required,
    unlockedKeys: [...unlockedCosmeticKeys(ctx)].sort(),
    grantedKeys: [...grantedKeys].sort(),
    streakCount: weekly.count,
    streakLastDay: weekly.week,
  }
}
