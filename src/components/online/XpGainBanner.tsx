"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ChevronsUp, Star } from 'lucide-react'
import { XP_LOSS, XP_WIN, levelForXp, progressForXp } from '@/lib/online/cosmetics'

/**
 * Fin de partie : « +50 XP » (ou +20) et niveau atteint, avec mise en avant
 * du passage de niveau. L'XP est créditée par le serveur dans la MÊME
 * transaction que l'état final — au moment où cet écran s'affiche, le fetch
 * de progression renvoie déjà le nouveau total ; le gain et le niveau
 * précédent se déduisent des constantes partagées (aucune API dédiée).
 *
 * Mêmes règles que le serveur : une partie ne compte que si au moins DEUX
 * comptes y participaient (les bots de complément `bot-N` sont exclus) —
 * sinon rien n'est affiché.
 */

const FILLER_BOT_RE = /^bot-\d+$/

export function XpGainBanner({
  won,
  playerIds,
  className,
}: {
  /** Le joueur local a-t-il gagné (même définition que l'écran de victoire) ? */
  won: boolean
  /** Ids des joueurs de l'état FINAL (comptes + bots) — sert au filtre anti-abus. */
  playerIds: string[]
  className?: string
}) {
  const t = useTranslations('onlineXp')
  const [xp, setXp] = useState<number | null>(null)

  const counted = playerIds.filter((id) => !FILLER_BOT_RE.test(id)).length >= 2

  useEffect(() => {
    if (!counted) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/online/progression', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as { progression: { xp: number } }
        if (!cancelled) setXp(json.progression.xp)
      } catch {
        // réseau : pas de bannière plutôt qu'une fausse valeur
      }
    })()
    return () => {
      cancelled = true
    }
  }, [counted])

  if (!counted || xp === null) return null

  const gained = won ? XP_WIN : XP_LOSS
  const before = levelForXp(Math.max(0, xp - gained))
  const progress = progressForXp(xp)
  const leveledUp = progress.level > before

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className={className}
    >
      <div
        className={
          leveledUp
            ? 'rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-yellow-500/10 px-4 py-3'
            : 'rounded-2xl border border-white/10 bg-white/5 px-4 py-3'
        }
      >
        <div className="flex items-center justify-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="text-sm font-bold text-amber-200">{t('gained', { xp: gained })}</span>
          {leveledUp ? (
            <motion.span
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.6 }}
              className="flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-black text-amber-100"
            >
              <ChevronsUp className="h-3.5 w-3.5" />
              {t('levelUp', { level: progress.level })}
            </motion.span>
          ) : (
            <span className="text-xs text-white/50">{t('level', { level: progress.level })}</span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(100, Math.round((progress.current / Math.max(1, progress.required)) * 100))}%`,
            }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
          />
        </div>
        <p className="mt-1 text-center text-[10px] tabular-nums text-white/40">
          {t('progress', { current: progress.current, required: progress.required })}
        </p>
      </div>
    </motion.div>
  )
}
