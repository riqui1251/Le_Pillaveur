import { levelForXp } from '@/lib/online/cosmetics'

/**
 * Détail du gain d'XP d'une partie qui vient de se terminer.
 *
 * POURQUOI ce module : la bannière de fin recalculait son « +50 XP » de son
 * côté, à partir des seules constantes, en IGNORANT le bonus de série. La
 * barre d'XP sautait donc de 60 à 100 pendant que l'écran annonçait « +50 »,
 * et un passage de niveau dû au bonus n'était jamais fêté (le « niveau
 * gagné » se calculait sur un total faux). Une seule source de vérité : celui
 * qui CRÉDITE (recordMatchResults) calcule aussi le détail, le mémorise, et
 * /api/online/progression le rend tel quel — le client se contente d'afficher.
 *
 * La mémoire est VOLATILE (en mémoire de processus, TTL court) : le détail
 * n'est utile que pendant les quelques secondes de l'écran de fin, ça ne
 * justifie pas une colonne en base. Si le détail manque (redémarrage du
 * serveur), la bannière retombe sur un affichage sans chiffre plutôt que sur
 * un chiffre faux.
 */

/** D'où vient le gain de base — sert au libellé côté client. */
export type XpGainReason = 'win' | 'loss' | 'participation' | 'solo'

export type XpGainDetail = {
  reason: XpGainReason
  /** Gain de base (victoire / défaite / participation / entraînement solo). */
  base: number
  /** Bonus de série quotidienne (0 si la série était déjà créditée aujourd'hui). */
  streakBonus: number
  /** base + streakBonus — LE chiffre à afficher. */
  total: number
  /** Série en jours APRÈS cette partie (0 = aucune série créditée). */
  streakCount: number
  xpBefore: number
  xpAfter: number
  levelBefore: number
  levelAfter: number
  /** Types de succès débloqués PAR cette partie (cf. achievements.ts). */
  achievements: string[]
}

/** Assemble le détail : le total et les niveaux se déduisent, jamais l'inverse. */
export function buildXpGainDetail(args: {
  reason: XpGainReason
  xpBefore: number
  base: number
  streakBonus: number
  streakCount: number
  achievements?: string[]
}): XpGainDetail {
  const xpBefore = Math.max(0, args.xpBefore)
  const base = Math.max(0, args.base)
  const streakBonus = Math.max(0, args.streakBonus)
  const total = base + streakBonus
  const xpAfter = xpBefore + total
  return {
    reason: args.reason,
    base,
    streakBonus,
    total,
    streakCount: Math.max(0, args.streakCount),
    xpBefore,
    xpAfter,
    // Le passage de niveau se juge sur le total CRÉDITÉ, bonus de série compris.
    levelBefore: levelForXp(xpBefore),
    levelAfter: levelForXp(xpAfter),
    achievements: args.achievements ?? [],
  }
}

/** Durée de vie du détail mémorisé — l'écran de fin s'affiche dans la foulée. */
export const XP_GAIN_TTL_MS = 30 * 60 * 1000

type Entry = { detail: XpGainDetail; at: number }

const lastGains = new Map<string, Entry>()

/** Purge paresseuse : appelée à chaque écriture, aucun timer à entretenir. */
function prune(now: number): void {
  for (const [userId, entry] of lastGains) {
    if (now - entry.at > XP_GAIN_TTL_MS) lastGains.delete(userId)
  }
}

/** Mémorise le gain de la dernière partie d'un joueur (écrase le précédent). */
export function rememberXpGain(userId: string, detail: XpGainDetail, now = Date.now()): void {
  prune(now)
  lastGains.set(userId, { detail, at: now })
}

/** Relit le gain mémorisé (null s'il a expiré ou n'a jamais existé). */
export function recallXpGain(userId: string, now = Date.now()): XpGainDetail | null {
  const entry = lastGains.get(userId)
  if (!entry) return null
  if (now - entry.at > XP_GAIN_TTL_MS) {
    lastGains.delete(userId)
    return null
  }
  return entry.detail
}

/**
 * Mémoire des succès DÉJÀ annoncés à un joueur. Sans elle, le rattrapage des
 * succès hors partie (première table, premier pote) les re-annoncerait à
 * chaque fin de partie de la soirée. Volatile comme le reste : au pire, un
 * redémarrage du serveur provoque une annonce en double, jamais un silence.
 */
export const ANNOUNCED_TTL_MS = 24 * 60 * 60 * 1000

const announced = new Map<string, { types: Set<string>; at: number }>()

/** Retourne les succès encore JAMAIS annoncés, et les marque comme annoncés. */
export function takeUnannouncedAchievements(
  userId: string,
  types: string[],
  now = Date.now()
): string[] {
  for (const [key, entry] of announced) {
    if (now - entry.at > ANNOUNCED_TTL_MS) announced.delete(key)
  }
  const entry = announced.get(userId)
  const seen = entry && now - entry.at <= ANNOUNCED_TTL_MS ? entry.types : new Set<string>()
  const fresh = types.filter((t) => !seen.has(t))
  for (const t of types) seen.add(t)
  announced.set(userId, { types: seen, at: now })
  return fresh
}

/** Oublie tout — réservé aux tests. */
export function clearXpGains(): void {
  lastGains.clear()
  announced.clear()
}
