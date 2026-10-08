"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  Check,
  Gamepad2,
  Smile,
  Sparkles,
  ShieldCheck,
  Users,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { refreshOnlineProgression, useOnlineProgression } from '@/hooks/useOnlineProgression'
import { getSafeStorage } from '@/lib/storage'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import { PIONEER_FRAME_ID, PIONEER_FRAME_KEY, levelForXp } from '@/lib/online/cosmetics'
import {
  LEVEL2_ICON_SERIES_ID,
  LEVEL3_EFFECT_ID,
  isPioneerWindowOpen,
  pioneerRewardState,
  type FirstStepId,
  type FirstStepsResponse,
  type PioneerRewardDto,
  type PioneerRewardState,
} from '@/lib/online/first-steps'
import type { PlayerIconFrame } from '@/lib/players'
import { OnlinePlayerIcon, type MemberCosmetics } from './OnlinePlayerTag'
import { cn } from '@/lib/utils'

/**
 * Carte « Premiers pas » de la page Compte : ce que le nouveau venu gagne à
 * revenir, en six gestes au plus (voir src/lib/online/first-steps.ts pour le
 * pourquoi et la détection, faite côté serveur par GET /api/online/first-steps).
 *
 * Chaque étape à faire porte SON geste : jouer mène aux jeux, l'icône et
 * l'effet ouvrent la Collection, la sauvegarde amène la carte de
 * pérennisation à l'écran. Seule la PREMIÈRE étape à faire a le bouton plein
 * — on montre par où commencer, pas six appels qui crient en même temps.
 *
 * Elle disparaît quand tout est fait, ou sur « Masquer » (mémorisé dans ce
 * navigateur). Rien sans compte.
 *
 * Récompense (cadre Pionnier, voir PIONEER_DEADLINE) : tant que la date
 * limite n'est pas passée, la carte la montre portée par le joueur — son
 * icône dans le cadre, pas une vignette générique : on voit ce qu'on gagne.
 * Une fois accordée (par la route, au moment où la liste se boucle), la
 * carte reste le temps de l'annoncer, avec « L'équiper » qui ouvre la
 * Collection ; elle s'efface quand le cadre est équipé, ou sur « Masquer »
 * (clé distincte : avoir masqué la LISTE ne dit pas qu'on refuse d'apprendre
 * qu'on a gagné). Date passée sans l'avoir : plus un mot de la récompense.
 */

/** Même famille que les autres clés de l'appareil (`lp-local-bridge-dismissed`…). */
const DISMISSED_KEY = 'lp-first-steps-dismissed'
const REWARD_DISMISSED_KEY = 'lp-first-steps-reward-dismissed'

/**
 * Lecture tolérante de la réponse : la récompense mal formée (ou absente,
 * serveur d'avant la récompense — le déploiement n'est pas atomique entre
 * un onglet ouvert et le serveur) est ignorée, la liste reste.
 */
function parseFirstSteps(json: unknown): FirstStepsResponse | null {
  const body = json as Partial<FirstStepsResponse> | null
  if (!body || !Array.isArray(body.steps)) return null
  const reward = body.reward as Partial<PioneerRewardDto> | undefined
  const validReward =
    reward && typeof reward.granted === 'boolean' && typeof reward.deadline === 'string'
      ? (reward as PioneerRewardDto)
      : undefined
  return { ...(body as FirstStepsResponse), reward: validReward }
}

const STEP_ICONS: Record<FirstStepId, LucideIcon> = {
  play: Gamepad2,
  icon: Smile,
  effect: Sparkles,
  save: ShieldCheck,
  friends: Users,
  level3: Trophy,
}

/**
 * Amène un élément à l'écran et y pose le focus (lien profond, étape
 * « Sauvegarder »). Défilement doux, sauf si le système demande moins de
 * mouvement : le `scroll-behavior: auto` de globals.css ne couvre pas un
 * scrollIntoView qui réclame explicitement « smooth ».
 */
export function revealElement(element: HTMLElement | null) {
  if (!element) return
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  element.focus({ preventScroll: true })
}

export function FirstStepsCard({
  refreshKey,
  onCustomize,
  onSave,
  focusOnReady = false,
}: {
  /**
   * Change quand ce que la carte mesure a pu changer (préférences
   * enregistrées, XP, sauvegarde du compte) : la liste est redemandée.
   * Null : pas encore prêt (progression en route) — la carte attend au lieu
   * de demander une liste aussitôt périmée.
   */
  refreshKey?: string | null
  /** Ouvre la Collection (étapes icône et effet). */
  onCustomize: () => void
  /** Amène la carte de sauvegarde du compte invité à l'écran. */
  onSave: () => void
  /**
   * Lien profond `/compte?focus=premiers-pas` : défiler jusqu'à la carte et
   * y poser le focus dès qu'elle s'affiche — même masquée auparavant, puisque
   * le joueur vient de la demander.
   */
  focusOnReady?: boolean
}) {
  const t = useTranslations('account.firstSteps')
  const tEffects = useTranslations('players.effects')
  const tSeries = useTranslations('onlineCollection.seriesNames')
  const tFrames = useTranslations('players.frames')
  const format = useFormatter()
  const { user } = useAuth()
  // Seule l'identité du compte déclenche la requête : l'objet `user` change
  // de référence à chaque rafraîchissement de session (voir refreshKey).
  const userId = user?.id
  const titleId = useId()
  const cardRef = useRef<HTMLElement>(null)
  // Abonné au store PARTAGÉ de la progression (la fiche compte l'est déjà :
  // même requête, aucune de plus) — pour savoir si la Collection voit le
  // cadre Pionnier qu'on s'apprête à faire équiper.
  const { progression } = useOnlineProgression()

  const [data, setData] = useState<FirstStepsResponse | null>(null)
  // Fenêtre de la récompense, jugée à l'arrivée de la réponse (pas au rendu :
  // l'horloge n'a rien à faire dans un rendu pur).
  const [rewardOpen, setRewardOpen] = useState(false)
  // Masquée par défaut : le premier rendu ne connaît pas encore le
  // localStorage — l'afficher puis la retirer ferait sauter la page.
  const [dismissed, setDismissed] = useState(true)
  const [rewardDismissed, setRewardDismissed] = useState(true)
  const [forced, setForced] = useState(false)
  // La carte a montré « L'équiper » pendant cette visite (voir justEquipped).
  const [sawUnlocked, setSawUnlocked] = useState(false)

  useEffect(() => {
    try {
      const storage = getSafeStorage()
      setDismissed(storage?.getItem(DISMISSED_KEY) === '1')
      setRewardDismissed(storage?.getItem(REWARD_DISMISSED_KEY) === '1')
    } catch {
      // stockage indisponible : la carte s'affiche, « Masquer » ne durera que la visite
      setDismissed(false)
      setRewardDismissed(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setData(null)
      return
    }
    if (refreshKey === null) return
    let cancelled = false
    fetch('/api/online/first-steps', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        const parsed = parseFirstSteps(json)
        if (cancelled || !parsed) return
        setData(parsed)
        setRewardOpen(parsed.reward ? isPioneerWindowOpen(Date.now(), parsed.reward.deadline) : false)
      })
      .catch(() => {
        // réseau : on garde la dernière liste connue
      })
    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  const reward = data?.reward
  const granted = reward?.granted === true
  // `string` : PlayerIconFrame (catalogue local) ne connaît pas le cadre.
  const equipped = (user?.onlinePreferences?.iconFrame as string | null | undefined) === PIONEER_FRAME_ID
  const stepsLeft = data !== null && data.completed < data.total

  // Cadre équipé PENDANT cette visite : la carte le confirme au lieu de
  // disparaître sous les doigts du joueur ; à la visite suivante, plus rien.
  // Dérivé au rendu (et non posé par un effet) : sinon la carte disparaissait
  // le temps d'une image entre « équipé » et « confirmé ».
  useEffect(() => {
    if (granted && !equipped) setSawUnlocked(true)
  }, [granted, equipped])
  const justEquipped = sawUnlocked && granted && equipped

  // La route vient de poser la ligne CosmeticGrant, mais la progression déjà
  // chargée par la fiche compte la précède : « L'équiper » ouvrirait une
  // Collection sans le cadre. Une relecture, une seule, et seulement si elle
  // manque vraiment (un octroi plus ancien y est déjà).
  const syncedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || !granted || !progression) return
    if (progression.unlockedKeys.includes(PIONEER_FRAME_KEY)) return
    if (syncedForRef.current === userId) return
    syncedForRef.current = userId
    void refreshOnlineProgression(userId)
  }, [userId, granted, progression])

  const rewardState = pioneerRewardState({
    reward,
    stepsLeft,
    windowOpen: rewardOpen,
    equipped,
    justEquipped,
  })

  // Liste à finir : règle d'avant. Liste finie : la carte ne reste que pour
  // annoncer le cadre gagné, sous sa propre clé « Masquer ».
  const visible =
    data !== null &&
    (stepsLeft
      ? !dismissed || forced
      : (rewardState === 'unlocked' || rewardState === 'equipped') && (!rewardDismissed || forced))

  // Demande de focus en attente : elle survit au chargement de la liste.
  const focusPendingRef = useRef(false)
  useEffect(() => {
    if (!focusOnReady) return
    focusPendingRef.current = true
    setForced(true)
  }, [focusOnReady])
  useEffect(() => {
    if (!visible || !focusPendingRef.current) return
    focusPendingRef.current = false
    // Image suivante : la carte vient d'entrer dans la mise en page.
    window.requestAnimationFrame(() => revealElement(cardRef.current))
  }, [visible, focusOnReady])

  // Étape faite pendant que son bouton portait le focus (Collection fermée
  // sur « Enregistrer » : Radix rend le focus au bouton « Choisir », puis la
  // liste rechargée le retire) : le focus retombait sur <body> et le clavier
  // repartait du haut de page. On le reporte sur la prochaine étape à faire,
  // sinon sur la carte — seulement s'il a bien été perdu.
  const actionRefs = useRef(new Map<FirstStepId, HTMLElement>())
  const lastActionRef = useRef<FirstStepId | null>(null)
  useEffect(() => {
    const stepId = lastActionRef.current
    if (!data || !stepId || !data.steps.some((step) => step.id === stepId && step.done)) return
    lastActionRef.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    const next = data.steps.find((step) => !step.done)
    const target = (next ? actionRefs.current.get(next.id) : undefined) ?? cardRef.current
    // Image suivante : le rendu qui retire le bouton fait vient de passer.
    window.requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }, [data])

  // Même chute de focus pour « L'équiper », retiré une fois le cadre équipé :
  // la carte (qui confirme) le reprend.
  useEffect(() => {
    if (!justEquipped) return
    const active = document.activeElement
    if (active && active !== document.body) return
    window.requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }))
  }, [justEquipped])

  const dismiss = () => {
    setForced(false)
    // Liste finie : « Masquer » ne vise que l'annonce du cadre.
    const key = stepsLeft ? DISMISSED_KEY : REWARD_DISMISSED_KEY
    if (stepsLeft) setDismissed(true)
    else setRewardDismissed(true)
    try {
      getSafeStorage()?.setItem(key, '1')
    } catch {
      // rien à mémoriser
    }
  }

  if (!user || !visible || !data) return null

  const level = levelForXp(data.xp)
  const firstTodo = data.steps.find((step) => !step.done)?.id
  const percent = Math.round((data.completed / Math.max(1, data.total)) * 100)

  // Les déblocages cités sont DÉRIVÉS du catalogue (first-steps.ts) ; s'ils
  // venaient à manquer, l'étape reste sans aide plutôt que de promettre faux
  // (first-steps.test.ts le signalerait d'abord).
  const hintOf = (id: FirstStepId): string | null => {
    switch (id) {
      case 'icon':
        // Les 23 joueurs de niveau 2+ jamais personnalisés : leur dire que la
        // série est DÉJÀ à eux, pas qu'elle « arrive ».
        return LEVEL2_ICON_SERIES_ID
          ? t(level >= 2 ? 'steps.icon.hintUnlocked' : 'steps.icon.hint', {
              series: tSeries(LEVEL2_ICON_SERIES_ID),
            })
          : null
      case 'level3':
        return LEVEL3_EFFECT_ID
          ? t('steps.level3.hint', { xp: data.xpToLevel3, effect: tEffects(LEVEL3_EFFECT_ID) })
          : null
      default:
        return t(`steps.${id}.hint`)
    }
  }

  const actionOf = (id: FirstStepId): ReactNode => {
    const className = cn(
      'flex min-h-[44px] shrink-0 items-center justify-center rounded-xl px-3 text-xs font-bold transition-colors',
      id === firstTodo
        ? 'bg-amber-500 text-black hover:bg-amber-400'
        : 'border border-gold/30 text-gold hover:bg-gold/10'
    )
    const label = t(`steps.${id}.action`)
    const ref = (el: HTMLElement | null) => {
      if (el) actionRefs.current.set(id, el)
      else actionRefs.current.delete(id)
    }
    const act = (run: () => void) => () => {
      lastActionRef.current = id
      run()
    }
    switch (id) {
      case 'icon':
      case 'effect':
        return (
          <button ref={ref} type="button" onClick={act(onCustomize)} className={className}>
            {label}
          </button>
        )
      case 'save':
        return (
          <button ref={ref} type="button" onClick={act(onSave)} className={className}>
            {label}
          </button>
        )
      default:
        // play, friends (une table se partage depuis son salon), level3 : par
        // /online, qui passe le compte en mode EN LIGNE puis ouvre /jeux. Les
        // comptes e-mail et Google naissent en mode local : /jeux tout court
        // leur ouvrait le hub en passe-et-joue, où une partie ne rapporte pas
        // d'XP — l'étape ne se cochait jamais.
        return (
          <Link ref={ref} href="/online" className={className}>
            {label}
          </Link>
        )
    }
  }

  // Le joueur tel qu'il serait, cadre Pionnier compris : son icône, son
  // niveau, son grade — la récompense se voit portée, pas en catalogue.
  const pioneerLook: MemberCosmetics = {
    preferences: {
      color: 'bg-amber-500',
      ...user.onlinePreferences,
      iconFrame: PIONEER_FRAME_ID as PlayerIconFrame,
    },
    level,
    role: user.role,
  }
  const frameName = tFrames(PIONEER_FRAME_ID)

  const rewardBlock = (state: PioneerRewardState) => {
    // Le mois de la date limite, à l'heure de Paris : la veille de minuit le
    // 1er avril tombe le 31 mars où que soit le joueur.
    const month =
      state === 'promise' && reward
        ? format.dateTime(new Date(Date.parse(reward.deadline) - 1), {
            month: 'long',
            year: 'numeric',
            timeZone: PARIS_TIME_ZONE,
          })
        : ''
    return (
      <div
        className={cn(
          'mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5',
          state === 'promise' ? 'border-gold/20 bg-gold/[0.06]' : 'border-gold/40 bg-gold/10'
        )}
      >
        {/* pt : l'étoile du cadre dépasse au-dessus de l'icône. */}
        <span className="flex shrink-0 items-center justify-center px-1 pt-2">
          <OnlinePlayerIcon cosmetics={pioneerLook} className="h-9 w-9 text-lg" />
        </span>
        <div className="min-w-0 flex-1">
          {state === 'promise' ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{t('reward.label')}</p>
              <p className="mt-0.5 text-xs text-white/70">{t('reward.promise', { month, frame: frameName })}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-cream">
                {t(state === 'unlocked' ? 'reward.unlockedTitle' : 'reward.equippedTitle', { frame: frameName })}
              </p>
              <p className="mt-0.5 text-xs text-white/60">
                {t(state === 'unlocked' ? 'reward.unlockedHint' : 'reward.equippedHint')}
              </p>
            </>
          )}
        </div>
        {state === 'unlocked' && (
          <button
            type="button"
            onClick={onCustomize}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center justify-center rounded-xl px-3 text-xs font-bold transition-colors',
              // Liste encore à finir (cadre accordé à la main, étape défaite) :
              // le bouton plein reste celui de la prochaine étape.
              stepsLeft
                ? 'border border-gold/30 text-gold hover:bg-gold/10'
                : 'bg-amber-500 text-black hover:bg-amber-400'
            )}
          >
            {t('reward.equip')}
          </button>
        )}
      </div>
    )
  }

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="scroll-mt-20 rounded-2xl border border-gold/20 bg-felt-deep/60 p-4 outline-none"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg font-bold text-gold">
            {t('title')}
          </h2>
          <p className="mt-1 text-xs text-white/60">{stepsLeft ? t('intro') : t('reward.allDone')}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={stepsLeft ? t('dismissLabel') : t('reward.dismissLabel')}
          className="-mr-2 -mt-2 flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t('dismiss')}
        </button>
      </div>

      {/* Gagné : l'annonce passe avant la liste. Promis : après — « finis
          ceci, gagne cela » se lit dans cet ordre. */}
      {(rewardState === 'unlocked' || rewardState === 'equipped') && rewardBlock(rewardState)}

      {stepsLeft && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-labelledby={titleId}
              aria-valuemin={0}
              aria-valuemax={data.total}
              aria-valuenow={data.completed}
              aria-valuetext={t('progressLabel', { completed: data.completed, total: data.total })}
              className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span aria-hidden className="shrink-0 text-xs font-bold tabular-nums text-gold">
              {data.completed}/{data.total}
            </span>
          </div>

          <ol className="mt-3 space-y-2">
            {data.steps.map((step) => {
              const Icon = STEP_ICONS[step.id]
              const hint = step.done ? null : hintOf(step.id)
              return (
                <li
                  key={step.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                    step.done ? 'border-white/5 bg-white/[0.02]' : 'border-white/10 bg-white/[0.04]'
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                      step.done
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-gold/30 bg-gold/10 text-gold'
                    )}
                  >
                    {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        step.done ? 'text-white/40 line-through decoration-white/30' : 'text-white'
                      )}
                    >
                      {t(`steps.${step.id}.title`)}
                      <span className="sr-only">
                        {' '}({step.done ? t('done') : t('todo')})
                      </span>
                    </p>
                    {hint && <p className="mt-0.5 text-xs text-white/60">{hint}</p>}
                  </div>
                  {!step.done && actionOf(step.id)}
                </li>
              )
            })}
          </ol>

          {rewardState === 'promise' && rewardBlock('promise')}
        </>
      )}
    </section>
  )
}
