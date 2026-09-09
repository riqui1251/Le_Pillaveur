"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ChevronsUp, Flame, ShieldAlert, Star, Trophy, Users } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  SOLO_BOTS_LEVEL_CAP,
  levelForXp,
  nextUnlockForXp,
  progressForXp,
} from '@/lib/online/cosmetics'
import type { XpGainDetail } from '@/lib/online/xp'

/**
 * Fin de partie : le gain d'XP, le niveau atteint, la série du jour et les
 * succès qui viennent de tomber.
 *
 * Le chiffre affiché vient du SERVEUR (`lastGain`), pas d'un recalcul local :
 * la version précédente déduisait « +50 » des constantes et ignorait le bonus
 * de série, si bien que la barre sautait de 60 à 100 en annonçant « +50 » et
 * qu'un passage de niveau dû au bonus n'était pas fêté. Ici on ne fait
 * qu'AFFICHER ce qui a été crédité.
 *
 * Faute de détail (redémarrage du serveur, partie hors périmètre), on montre
 * le niveau et la barre sans annoncer de chiffre — jamais un chiffre faux.
 */

const FILLER_BOT_RE = /^bot-\d+$/

/**
 * Le détail mémorisé par le serveur est le DERNIER gain du JOUEUR (une
 * demi-heure de mémoire), pas celui de la partie qu'on est en train de
 * peindre : rouvrir un écran de fin, ou enchaîner deux parties, affichait le
 * gain d'une AUTRE partie par-dessus l'XP courante.
 *
 * Seul verdict fiable côté client : le détail dit à quel total il a mené
 * (`xpAfter`). S'il ne tombe pas sur l'XP que le compte affiche à l'instant,
 * il décrit un autre état que celui-ci — on n'annonce alors NI chiffre, NI
 * niveau gagné, NI succès (la barre et le niveau, eux, restent justes).
 * Mieux vaut une bannière sobre qu'un chiffre faux.
 */
export function gainForCurrentXp(
  xp: number,
  lastGain: XpGainDetail | null | undefined
): XpGainDetail | null {
  if (!lastGain) return null
  return lastGain.xpAfter === xp ? lastGain : null
}

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
  lastGain: XpGainDetail | null
}

export function XpGainBanner({
  playerIds,
  className,
}: {
  /**
   * Le joueur local a-t-il gagné ? Conservé pour les quinze écrans de fin qui
   * le passent, mais plus lu : c'est le serveur qui dit désormais ce qu'il a
   * crédité (victoire, défaite, participation, entraînement solo).
   */
  won?: boolean
  /** Ids des joueurs de l'état FINAL (comptes + bots) — sert au filtre anti-abus. */
  playerIds: string[]
  className?: string
}) {
  const t = useTranslations('onlineXp')
  const tAchievements = useTranslations('achievements')
  const tSeries = useTranslations('onlineCollection.seriesNames')
  const tFrames = useTranslations('players.frames')
  const tEffects = useTranslations('players.effects')
  const { user } = useAuth()
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
          lastGain?: XpGainDetail | null
        }
        if (!cancelled) {
          setInfo({
            xp: json.progression.xp,
            streakCount: json.progression.streakCount ?? 0,
            streakLastDay: json.progression.streakLastDay ?? null,
            lastGain: json.lastGain ?? null,
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
  // Le gain n'est retenu que s'il colle à l'XP courante (cf. gainForCurrentXp).
  const lastGain = gainForCurrentXp(xp, info.lastGain)

  // Invité : rappel de la purge (90 jours d'inactivité) juste sous la carte d'XP —
  // c'est le moment où le joueur voit ce qu'il perdrait (pseudo, XP), donc le
  // meilleur pour l'inciter à sauvegarder son compte depuis la page Compte.
  const guestCard = user?.isGuest ? (
    <Link
      href="/compte"
      className="mt-2 block rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
    >
      <span className="flex items-center justify-center gap-2 text-[11px] leading-snug text-amber-100/85">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        {t('guestKeep')}
      </span>
      <span className="mt-1 block text-center text-[11px] font-bold text-amber-200 underline underline-offset-2">
        {t('guestKeepCta')}
      </span>
    </Link>
  ) : null

  // Succès débloqués par CETTE partie : sans cette ligne, « Première Tablée »
  // ou « Premier Pote » tombaient sans que personne ne le sache.
  const unlockedTypes = (lastGain?.achievements ?? []).filter((type) =>
    tAchievements.has(`items.${type}.title`)
  )
  const achievementsCard =
    unlockedTypes.length > 0 ? (
      <div className="mt-2 space-y-1.5">
        {unlockedTypes.map((type) => (
          <div
            key={type}
            className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2"
          >
            <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="text-[11px] font-bold text-amber-100">
              {t('achievementUnlocked', { name: tAchievements(`items.${type}.title`) })}
            </span>
          </div>
        ))}
      </div>
    ) : null

  // Solo contre bots au plafond : plus d'XP — un rappel honnête plutôt que
  // le silence (et la raison d'inviter un pote). Le serveur tranche quand il
  // a parlé ; sinon on retombe sur les mêmes règles côté client.
  const soloCapped = lastGain
    ? lastGain.reason === 'solo' && lastGain.total === 0
    : !counted && levelForXp(xp) >= SOLO_BOTS_LEVEL_CAP
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
        {achievementsCard}
        {guestCard}
      </motion.div>
    )
  }

  const isSolo = lastGain ? lastGain.reason === 'solo' : !counted
  const progress = progressForXp(xp)
  // Le passage de niveau se juge sur le total CRÉDITÉ (bonus de série compris).
  const leveledUp = lastGain ? lastGain.levelAfter > lastGain.levelBefore : false

  // Série du jour : visible DÈS le premier jour (elle démarre au premier, mais
  // rien ne l'annonçait avant deux jours).
  const streakDays = lastGain
    ? lastGain.streakCount
    : info.streakLastDay === todayParis()
      ? info.streakCount
      : 0
  const streakLabel =
    streakDays > 1 ? t('streak', { days: streakDays }) : streakDays === 1 ? t('streakStart') : null

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
          {lastGain && (
            <span className="text-sm font-bold text-amber-200">
              {isSolo
                ? t('soloGained', { xp: lastGain.total })
                : t('gained', { xp: lastGain.total })}
            </span>
          )}
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
          {streakLabel && (
            <span className="flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-200">
              <Flame className="h-3.5 w-3.5" />
              {streakLabel}
            </span>
          )}
        </div>
        {/* Le détail du total : « dont +30 XP de série » — le chiffre annoncé
            et la barre disent enfin la même chose. */}
        {lastGain && lastGain.streakBonus > 0 && (
          <p className="mt-1 text-center text-[10px] text-orange-200/70">
            {t('streakBonus', { xp: lastGain.streakBonus })}
          </p>
        )}
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
        {isSolo && <p className="mt-1 text-center text-[10px] text-white/45">{t('soloHint')}</p>}
      </div>
      {achievementsCard}
      {guestCard}
    </motion.div>
  )
}
