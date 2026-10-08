"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronsUp,
  Flame,
  Loader2,
  Palette,
  ShieldAlert,
  Sparkles,
  Star,
  Trophy,
  Users,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import { useSaveOnlinePreferences } from '@/hooks/useSaveOnlinePreferences'
import { OnlineCollection } from '@/components/online/OnlineCollection'
import {
  SOLO_BOTS_LEVEL_CAP,
  cosmeticKey,
  isDefaultOnlineLook,
  levelForXp,
  nextUnlockForXp,
  progressForXp,
  unlocksBetweenLevels,
  type LevelUnlocks,
} from '@/lib/online/cosmetics'
import { DEFAULT_ONLINE_PREFERENCES, type OnlinePreferences } from '@/lib/online-preferences'
import { nextWeekStreakBonus, streakThisWeek } from '@/lib/online/streak'
import type { XpGainDetail } from '@/lib/online/xp'

/**
 * Fin de partie : le gain d'XP, le niveau atteint, la série de la semaine et
 * les succès qui viennent de tomber — puis CE QU'ON EN FAIT.
 *
 * Le chiffre affiché vient du SERVEUR (`lastGain`), pas d'un recalcul local :
 * la version précédente déduisait « +50 » des constantes et ignorait le bonus
 * de série, si bien que la barre sautait de 60 à 100 en annonçant « +50 » et
 * qu'un passage de niveau dû au bonus n'était pas fêté. Ici on ne fait
 * qu'AFFICHER ce qui a été crédité.
 *
 * Faute de détail (redémarrage du serveur, partie hors périmètre), on montre
 * le niveau et la barre sans annoncer de chiffre — jamais un chiffre faux.
 *
 * La boucle de progression ne se voyait nulle part : 23 joueurs niveau 2+
 * n'avaient JAMAIS personnalisé leur profil, faute de savoir que les niveaux
 * débloquent icônes, effets de pseudo et cadres. L'écran de fin est le bon
 * moment (le joueur vient de gagner de l'XP) ; on y ajoute, sans surcharger —
 * UNE seule incitation sous l'XP, par ordre de priorité :
 *  1. passage de niveau : carte « Nouveau : … » + « Équiper maintenant » ;
 *  2. 1re partie : rien — la place revient à l'avis de 1re partie, que
 *     l'écran de fin pose juste en dessous. Guide, carte invité et avis
 *     empilés faisaient défiler trois appels à l'action (~650 px à 375 px)
 *     avant « Rejouer » ;
 *  3. look encore par défaut : une ligne discrète et un lien « Personnaliser
 *     mon profil » (cf. isDefaultOnlineLook) — pas une carte : elle revient
 *     à chaque fin de partie tant que le joueur garde la chope.
 * L'invité garde en plus UNE ligne (ce qu'il perdrait, et le lien pour
 * sauvegarder). Rien en aplat : le geste principal de l'écran reste
 * « Rejouer » (25 nouveaux sur 36 rejouent après une 1re partie à plusieurs
 * — rien ne doit lui voler la vedette).
 *
 * La collection s'ouvre SUR PLACE, jamais par une navigation : quitter
 * l'écran de fin coûte la revanche et la place à table.
 */

const FILLER_BOT_RE = /^bot-\d+$/

/**
 * Course entre l'écran de fin et la transaction qui crédite l'XP : l'écran
 * peut lire la progression AVANT l'écriture. Sans détail de gain à la
 * première lecture, on relit une fois, un peu plus tard.
 */
const GAIN_RETRY_DELAY_MS = 1500

/**
 * Au-dessus des écrans de fin en surcouche (Petit Buveur, Toucher-Coulé :
 * z-[110]) — voile compris, sinon l'écran de fin resterait visible, non
 * voilé, entre la modale et la page.
 */
const COLLECTION_LAYER = 'z-[120]'

/** Au-delà, les cadres gagnés d'un coup se comptent au lieu de se nommer (niveau 22 : dix Orbites). */
const MAX_NAMED_FRAMES = 2

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

/** Classes du bouton d'incitation : contour or, cible tactile ≥ 44 px. */
const GUIDE_BUTTON =
  'mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 text-sm font-bold text-gold transition-colors hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 aria-busy:opacity-60'

/**
 * Lien-bouton de la ligne « look par défaut » : un lien texte, pas un bouton
 * pleine largeur — mais la cible tactile garde ses 44 px de haut.
 */
const PROFILE_LINK =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-gold underline underline-offset-2 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 aria-busy:opacity-60'

export function XpGainBanner({
  playerIds,
  className,
}: {
  /**
   * Le joueur local a-t-il gagné ? Conservé pour les dix-huit écrans de fin
   * qui le passent, mais plus lu : c'est le serveur qui dit désormais ce qu'il
   * a crédité (victoire, défaite, participation, entraînement solo).
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
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const { user } = useAuth()
  // Store PARTAGÉ : la bannière monte après la partie, sa lecture est donc
  // postérieure à la fin — et elle ne s'affiche qu'avec des données FRAÎCHES
  // (`fresh` : une lecture RÉUSSIE depuis son montage). Pas `!loading` : une
  // lecture échouée termine le chargement en laissant l'instantané d'avant la
  // partie, dont le gain mémorisé colle à l'XP d'avant — la bannière
  // réannonçait alors le gain et les succès de la partie précédente.
  const { progression, lastGain: rawGain, loading, fresh, refresh } = useOnlineProgression()
  const { save, saving } = useSaveOnlinePreferences()
  const [collectionOpen, setCollectionOpen] = useState(false)
  // Issue du dernier enregistrement depuis la collection ouverte ici.
  const [lookStatus, setLookStatus] = useState<'saved' | 'failed' | null>(null)
  const savedRef = useRef<HTMLParagraphElement>(null)

  const currentGain = fresh && progression ? gainForCurrentXp(progression.xp, rawGain) : null

  // Une seule relecture si la première a échoué, ou ne porte pas le gain de
  // cette partie (cf. GAIN_RETRY_DELAY_MS). Le drapeau n'est posé qu'au
  // déclenchement : un rendu intermédiaire qui annule le minuteur ne consomme
  // pas l'essai. Si la relecture échoue aussi, la bannière ne montre rien —
  // jamais l'état d'avant la partie.
  const gainRetriedRef = useRef(false)
  const needsRetry = !loading && (!fresh || currentGain === null)
  useEffect(() => {
    if (!needsRetry || gainRetriedRef.current) return
    const timer = setTimeout(() => {
      gainRetriedRef.current = true
      void refresh()
    }, GAIN_RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [needsRetry, refresh])

  // Enregistré : la ligne de guidage (et son bouton, qui portait le focus
  // rendu par la collection à sa fermeture) cède la place au message. Sans
  // ce report, le focus retombait sur <body> — hors de la surcouche
  // aria-modal dans la variante « sheet » — et le clavier repartait du haut.
  // Seulement s'il est perdu : un joueur qui a déjà touché « Rejouer » le garde.
  useEffect(() => {
    if (lookStatus !== 'saved') return
    const active = document.activeElement
    if (active && active !== document.body) return
    savedRef.current?.focus({ preventScroll: true })
  }, [lookStatus])

  // Invité : le nombre de succès qu'il perdrait. Relu quand l'XP bouge (la
  // relecture ci-dessus peut arriver avec le succès « Première Tablée »).
  const isGuest = Boolean(user?.isGuest)
  const xpNow = fresh ? progression?.xp : undefined
  const [guestAchievements, setGuestAchievements] = useState<number | null>(null)
  useEffect(() => {
    if (!isGuest || xpNow === undefined) return
    let cancelled = false
    fetch('/api/achievements', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((list: unknown) => {
        if (!cancelled && Array.isArray(list)) setGuestAchievements(list.length)
      })
      .catch(() => {
        // réseau : la carte invité chiffre sans les succès
      })
    return () => {
      cancelled = true
    }
  }, [isGuest, xpNow])

  if (!fresh || !progression || !user) return null
  const { xp } = progression
  // Le gain n'est retenu que s'il colle à l'XP courante (cf. gainForCurrentXp).
  const lastGain = currentGain
  const counted = playerIds.filter((id) => !FILLER_BOT_RE.test(id)).length >= 2

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
            <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-300" />
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

  const isSolo = lastGain ? lastGain.reason === 'solo' : !counted
  const progress = progressForXp(xp)
  // Le passage de niveau se juge sur le total CRÉDITÉ (bonus de série compris).
  const leveledUp = lastGain ? lastGain.levelAfter > lastGain.levelBefore : false

  // ── Ce que le passage de niveau vient d'ouvrir, nommé ──
  const unlockLabels = (unlocks: LevelUnlocks): string[] => {
    const labels: string[] = []
    for (const id of unlocks.seriesIds) {
      if (tSeries.has(id)) labels.push(t('unlockSeries', { name: tSeries(id) }))
    }
    for (const id of unlocks.effectIds) {
      if (tEffects.has(id)) labels.push(t('unlockEffect', { name: tEffects(id) }))
    }
    if (unlocks.frameIds.length > MAX_NAMED_FRAMES) {
      labels.push(t('unlockFrames', { count: unlocks.frameIds.length }))
    } else {
      for (const id of unlocks.frameIds) {
        if (tFrames.has(id)) labels.push(t('unlockFrame', { name: tFrames(id) }))
      }
    }
    return labels
  }
  const newLabels =
    leveledUp && lastGain ? unlockLabels(unlocksBetweenLevels(lastGain.levelBefore, lastGain.levelAfter)) : []
  const newItems = newLabels.length > 0 ? format.list(newLabels, { type: 'conjunction' }) : null

  // ── Incitation à personnaliser : une seule, par priorité (voir l'en-tête) ──
  // 1re partie : la place revient à l'avis de 1re partie (OnlineEndScreen).
  const firstGame = lastGain?.achievements.includes('first_game') ?? false
  const guide: 'unlock' | 'profile' | null = newItems
    ? 'unlock'
    : !firstGame && isDefaultOnlineLook(user.onlinePreferences)
      ? 'profile'
      : null
  // Ce que le joueur a DÉJÀ sous la main (au niveau 1 : la série Apéro et les
  // effets Rouge et Bleu) — « tu as déjà de quoi » pousse plus qu'un « plus tard ».
  const ownedIcons = progression.unlockedKeys.filter((key) => key.startsWith(cosmeticKey('icon', ''))).length
  const ownedEffects = progression.unlockedKeys.filter((key) => key.startsWith(cosmeticKey('effect', ''))).length

  // Pas de `disabled` pendant l'enregistrement : la modale qui se ferme rend
  // le focus à ce bouton, et un bouton désactivé le perdrait (retour en haut
  // de page au clavier / lecteur d'écran). On ignore simplement le toucher.
  const openCollection = () => {
    if (saving) return
    setLookStatus(null)
    setCollectionOpen(true)
  }
  // La collection se ferme dès « Enregistrer » ; l'issue s'annonce ici. Le
  // PATCH ne publie aucun événement de salle : les autres ne verront le
  // nouveau look qu'à la prochaine partie — on le dit.
  const handleSave = (preferences: Partial<OnlinePreferences>) => {
    void save(preferences).then((ok) => setLookStatus(ok ? 'saved' : 'failed'))
  }

  const saveFailed =
    lookStatus === 'failed' ? (
      <p role="alert" className="mt-1.5 text-center text-xs font-semibold text-red-300">
        {t('lookSaveFailed')}
      </p>
    ) : null

  let guideCard: ReactNode = null
  if (lookStatus === 'saved') {
    guideCard = (
      <p
        ref={savedRef}
        tabIndex={-1}
        role="status"
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-center text-xs font-semibold text-emerald-100 outline-none"
      >
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        {t('lookSaved')}
      </p>
    )
  } else if (guide === 'unlock') {
    // Le moment fort : une vraie carte, avec son bouton.
    guideCard = (
      <div className="mt-2 rounded-2xl border border-gold/40 bg-felt-deep/80 px-4 py-3 text-center">
        <p className="flex items-center justify-center gap-2 font-display text-sm font-bold text-gold">
          <Sparkles aria-hidden className="h-4 w-4 shrink-0" />
          <span>{t('unlockedNew', { items: newItems ?? '' })}</span>
        </p>
        {saveFailed}
        <button
          type="button"
          onClick={openCollection}
          aria-busy={saving || undefined}
          className={GUIDE_BUTTON}
        >
          {saving ? (
            <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Palette aria-hidden className="h-4 w-4 shrink-0" />
          )}
          {t('equipNow')}
        </button>
      </div>
    )
  } else if (guide === 'profile') {
    // Rappel récurrent (chaque fin de partie, tant que le look reste celui de
    // l'inscription) : une ligne et un lien, sans cadre ni bouton plein.
    guideCard = (
      <div className="mt-2 px-1 text-center">
        <p className="flex items-start justify-center gap-1.5 text-left text-xs leading-snug text-cream/70">
          <Palette aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          <span>{t('profileLoop', { icons: ownedIcons, effects: ownedEffects })}</span>
        </p>
        {saveFailed}
        <button type="button" onClick={openCollection} aria-busy={saving || undefined} className={PROFILE_LINK}>
          {saving && <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin" />}
          {t('customizeProfile')}
        </button>
      </div>
    )
  }

  // Invité : la purge (90 jours d'inactivité) chiffrée juste sous la carte
  // d'XP — c'est le moment où le joueur voit ce qu'il perdrait (niveau, XP,
  // succès), donc le meilleur pour l'inciter à sauvegarder. UNE ligne et son
  // lien, qui mène droit à la carte de sauvegarde de la fiche : les
  // déblocages du niveau, eux, sont déjà nommés juste au-dessus.
  const achievementsAtRisk = Math.max(guestAchievements ?? 0, lastGain?.achievements.length ?? 0)
  const guestHeadline =
    achievementsAtRisk > 0
      ? t('guestRiskAchievements', { level: progress.level, xp, achievements: achievementsAtRisk })
      : t('guestRisk', { level: progress.level, xp })
  const guestCard = isGuest ? (
    <Link
      href="/compte?focus=sauvegarde"
      className="mt-2 flex min-h-[44px] items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left transition-colors hover:border-amber-400/50 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      <ShieldAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-300" />
      <span className="min-w-0 flex-1 text-[11px] leading-snug text-amber-100/90">
        {guestHeadline}{' '}
        <span className="font-bold text-amber-200 underline underline-offset-2">{t('guestSaveCta')}</span>
      </span>
    </Link>
  ) : null

  // Série HEBDOMADAIRE (src/lib/online/streak.ts) : visible DÈS la première
  // semaine (elle démarre à 1, mais rien ne l'annonçait avant la deuxième).
  // Sans détail de gain, on retombe sur la semaine de Paris en cours — même
  // lecture que le serveur, ancienne forme quotidienne comprise.
  const streakWeeks = lastGain ? lastGain.streakCount : streakThisWeek(progression)
  // « Série hebdo lancée ! » UNE fois : à la partie qui vient de créditer la
  // 1re semaine (bonus > 0). Les parties suivantes de la semaine, et la
  // lecture sans détail de gain, disent l'état sans le réannoncer.
  const streakStarted = Boolean(lastGain && lastGain.streakBonus > 0)
  const streakLabel =
    streakWeeks > 1
      ? t('streak', { weeks: streakWeeks })
      : streakWeeks === 1
        ? streakStarted
          ? t('streakStart')
          : t('streakOne')
        : null
  // Le rendez-vous de la semaine prochaine, dit UNE fois par semaine : à la
  // partie qui vient de créditer le bonus. Le rythme réel est la soirée du
  // vendredi ou du dimanche — une série hebdomadaire ne retient que si le
  // joueur sait qu'elle existe et ce qu'elle rapporte en revenant.
  const streakNext =
    lastGain && lastGain.streakBonus > 0 ? nextWeekStreakBonus(lastGain.streakCount) : null

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

  const mainCard = soloCapped ? (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center justify-center gap-2">
        <Users aria-hidden className="h-4 w-4 shrink-0 text-white/40" />
        <span className="text-xs text-white/60">{t('soloCapped')}</span>
      </div>
    </div>
  ) : (
    <div
      className={
        leveledUp
          ? 'rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 px-4 py-3'
          : 'rounded-2xl border border-white/10 bg-white/5 px-4 py-3'
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Star aria-hidden className="h-4 w-4 shrink-0 text-amber-300" />
        {lastGain && (
          <span className="text-sm font-bold text-amber-200">
            {isSolo ? t('soloGained', { xp: lastGain.total }) : t('gained', { xp: lastGain.total })}
          </span>
        )}
        {leveledUp ? (
          <motion.span
            initial={reduceMotion ? false : { scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.6 }}
            className="flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-black text-amber-100"
          >
            <ChevronsUp aria-hidden className="h-3.5 w-3.5" />
            {t('levelUp', { level: progress.level })}
          </motion.span>
        ) : (
          <span className="text-xs text-white/50">{t('level', { level: progress.level })}</span>
        )}
        {streakLabel && (
          <span className="flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-500/20 px-2.5 py-0.5 text-[11px] font-bold text-orange-200">
            <Flame aria-hidden className="h-3.5 w-3.5" />
            {streakLabel}
          </span>
        )}
      </div>
      {/* Le détail du total : « dont +30 XP de série » — le chiffre annoncé
          et la barre disent enfin la même chose. */}
      {lastGain && lastGain.streakBonus > 0 && (
        <p className="mt-1 text-center text-xs text-orange-200/70">
          {t('streakBonus', { xp: lastGain.streakBonus })}
        </p>
      )}
      {streakNext !== null && (
        <p className="mt-0.5 text-center text-xs text-orange-200/70">
          {t('streakNextWeek', { xp: streakNext })}
        </p>
      )}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={reduceMotion ? false : { width: 0 }}
          animate={{
            width: `${Math.min(100, Math.round((progress.current / Math.max(1, progress.required)) * 100))}%`,
          }}
          transition={reduceMotion ? { duration: 0 } : { delay: 0.7, duration: 0.6 }}
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
        />
      </div>
      <p className="mt-1 text-center text-xs tabular-nums text-white/40">
        {t('progress', { current: progress.current, required: progress.required })}
      </p>
      {nextLabel && next && (
        <p className="mt-0.5 text-center text-xs text-amber-200/60">
          {t('nextUnlock', { level: next.level, name: nextLabel })}
        </p>
      )}
      {isSolo && <p className="mt-1 text-center text-xs text-white/50">{t('soloHint')}</p>}
    </div>
  )

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className={className}
    >
      {mainCard}
      {achievementsCard}
      {guideCard}
      {guestCard}
      <OnlineCollection
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        displayName={user.onlineDisplayName ?? user.displayName}
        role={user.role}
        // Couleur forcée comme sur la fiche compte : le catalogue en ligne n'en a qu'une.
        preferences={{
          ...DEFAULT_ONLINE_PREFERENCES,
          ...user.onlinePreferences,
          color: DEFAULT_ONLINE_PREFERENCES.color,
        }}
        progression={progression}
        onSave={handleSave}
        contentClassName={COLLECTION_LAYER}
        overlayClassName={COLLECTION_LAYER}
      />
    </motion.div>
  )
}
