"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ChevronsUp, Flame, Star, Users } from 'lucide-react'
import {
  SOLO_BOTS_LEVEL_CAP,
  XP_LOSS,
  XP_SOLO_BOTS,
  XP_WIN,
  levelForXp,
  nextUnlockForXp,
  progressForXp,
} from '@/lib/online/cosmetics'

/**
 * Fin de partie : « +50 XP » (ou +20) et niveau atteint, avec mise en avant
 * du passage de niveau, de la série quotidienne et du prochain déblocage.
 * L'XP est créditée par le serveur dans la MÊME transaction que l'état final —
 * au moment où cet écran s'affiche, le fetch de progression renvoie déjà le
 * nouveau total ; le gain et le niveau précédent se déduisent des constantes
 * partagées (aucune API dédiée).
 *
 * Mêmes règles que le serveur : partie à DEUX comptes et plus → XP pleine ;
 * un seul compte (solo contre bots) → XP d'entraînement réduite jusqu'au
 * niveau SOLO_BOTS_LEVEL_CAP, puis un simple rappel « invite un pote ».
 */

const FILLER_BOT_RE = /^bot-\d+$/

/** Date du jour à Paris ('YYYY-MM-DD') — même convention que le serveur. */
function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type ProgressionInfo = {
  xp: number
  streakCount: number
  streakLastDay: string | null
}

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
  const tSeries = useTranslations('onlineCollection.seriesNames')
  const tFrames = useTranslations('players.frames')
  const tEffects = useTranslations('players.effects')
  const [info, setInfo] = useState<ProgressionInfo | null>(null)

  const counted = playerIds.filter((id) => !FILLER_BOT_RE.test(id)).length >= 2

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/online/progression', { credentials: 'include' })
        if (!res.ok) return
        const json = (await res.json()) as {
          progression: { xp: number; streakCount?: number; streakLastDay?: string | null }
        }
        if (!cancelled) {
          setInfo({
            xp: json.progression.xp,
            streakCount: json.progression.streakCount ?? 0,
            streakLastDay: json.progression.streakLastDay ?? null,
          })
        }
      } catch {
        // réseau : pas de bannière plutôt qu'une fausse valeur
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (info === null) return null
  const { xp } = info

  // Solo contre bots au plafond : plus d'XP — un rappel honnête plutôt que
  // le silence (et la raison d'inviter un pote).
  const soloCapped = !counted && levelForXp(xp) >= SOLO_BOTS_LEVEL_CAP
  if (soloCapped) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className={className}
      >
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-white/40" />
            <span className="text-xs text-white/60">{t('soloCapped')}</span>
          </div>
        </div>
      </motion.div>
    )
  }

  const gained = counted ? (won ? XP_WIN : XP_LOSS) : XP_SOLO_BOTS
  const before = levelForXp(Math.max(0, xp - gained))
  const progress = progressForXp(xp)
  const leveledUp = progress.level > before

  // Série du jour : affichée dès 2 jours consécutifs (créditée aujourd'hui).
  const streakActive = info.streakCount > 1 && info.streakLastDay === todayParis()

  // Prochain déblocage : une série d'icônes en priorité, sinon cadre/effet.
  const next = nextUnlockForXp(xp)
  let nextLabel: string | null = null
  if (next) {
    if (next.seriesIds.length > 0 && tSeries.has(next.seriesIds[0])) {
      nextLabel = tSeries(next.seriesIds[0])
    } else if (next.frameIds.length > 0 && tFrames.has(next.frameIds[0])) {
      nextLabel = tFrames(next.frameIds[0])
    } else if (next.effectIds.length > 0 && tEffects.has(next.effectIds[0])) {
      nextLabel = tEffects(next.effectIds[0])
    }
  }

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
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="text-sm font-bold text-amber-200">
            {counted ? t('gained', { xp: gained }) : t('soloGained', { xp: gained })}
          </span>
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
          {streakActive && (
            <span className="flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-200">
              <Flame className="h-3.5 w-3.5" />
              {t('streak', { days: info.streakCount })}
            </span>
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
        {nextLabel && next && (
          <p className="mt-0.5 text-center text-[10px] text-amber-200/60">
            {t('nextUnlock', { level: next.level, name: nextLabel })}
          </p>
        )}
        {!counted && (
          <p className="mt-1 text-center text-[10px] text-white/45">{t('soloHint')}</p>
        )}
      </div>
    </motion.div>
  )
}
