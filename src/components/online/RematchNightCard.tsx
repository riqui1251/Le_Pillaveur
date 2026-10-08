"use client"

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useTranslations } from 'next-intl'
import { BellRing, Check, Loader2, MailCheck, UserPlus } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import { useFridayReminder } from '@/hooks/useFridayReminder'
import {
  REMATCH_REMINDER_DECLINE_KEY,
  isReminderDeclineActive,
  parseTableFriendRequestsResult,
  rematchNightView,
  type RematchNightView,
  type TableFriendRequestsResult,
} from '@/lib/rematch-night'
import { getSafeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'

/**
 * « ON REMET ÇA ? » — carte de l'écran de fin en ligne, à une table où
 * d'autres HUMAINS ont joué (contre des bots, personne à retrouver).
 *
 * 2 joueurs sur 57 reviennent pour une deuxième soirée, alors qu'une partie à
 * plusieurs fait rejouer le soir même : le lien se perd ENTRE deux soirées.
 * Deux gestes, rien de plus :
 *  1. « Ajouter la tablée en amis » — une demande à chaque autre humain de
 *     la table (POST /api/friends/table : le serveur relit les membres réels
 *     de la salle, auto-accepte une demande croisée) ;
 *  2. « Me rappeler vendredi » — l'accord EXPLICITE au rappel par e-mail du
 *     vendredi (POST /api/me/reminder) : « activé » pour une adresse déjà
 *     prouvée, sinon « e-mail envoyé, confirme-le » (double opt-in). Avec
 *     un « Non merci » discret qui fait taire la question douze semaines
 *     (localStorage) — sans lui, elle revenait à chaque fin de partie.
 *     Invité, compte sans adresse, envoi non configuré : aucune ligne de
 *     rappel (la sauvegarde de l'invité est déjà proposée sous l'XP).
 *
 * Sobriété de l'écran de fin (le geste principal reste « Rejouer ») :
 *  - l'avis de 1re partie passe d'abord — quand le serveur le juge dû, cette
 *    carte ne s'affiche pas du tout ;
 *  - rien à faire (tablée déjà amie, rappel déjà accepté) : pas de carte ;
 *  - décision prise UNE fois ;
 *  - l'écran de fin la pose SOUS ses actions (au-dessus seulement quand la
 *    barre est fixe, Quiz) : elle revient à chaque fin de partie à plusieurs,
 *    elle ne doit ni repousser « Rejouer » sous le pli ni décaler la barre
 *    sous le pouce en arrivant après ses trois lectures.
 * Logique pure : src/lib/rematch-night.ts.
 */

type FriendsStatus = 'idle' | 'sending' | 'done' | 'error' | 'tooMany'

export type RematchNightCardProps = {
  /** Salle de la partie : le serveur en relit les membres. */
  roomId: string
  /** Repère de fraîcheur de la progression noté par l'écran de fin (onlineProgressionMark). */
  progressionSince: number
  className?: string
}

/** Combien de membres le bouton toucherait ; null sur panne (traité comme 0). */
async function fetchAddable(roomId: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/friends/table?roomId=${encodeURIComponent(roomId)}`, {
      credentials: 'include',
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { addable?: unknown } | null
    return typeof json?.addable === 'number' ? json.addable : null
  } catch {
    return null
  }
}

/** Bouton de la carte : contour or, cible ≥ 44 px, libellé sur deux lignes au besoin. */
const CARD_BUTTON =
  'inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-normal rounded-xl border border-gold/50 bg-gold/10 px-3 py-1.5 text-sm font-bold leading-tight text-gold transition-colors [touch-action:manipulation] hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-60 motion-reduce:transition-none'

/** Lien texte (compte) : discret, mais la cible tactile garde ses 44 px de haut. */
const CARD_LINK =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold text-gold underline underline-offset-2 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

/** Ligne d'état (fait, activé) : reçoit le focus quand le bouton qu'elle remplace disparaît. */
const STATUS_LINE =
  'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-white/5 px-3 text-sm font-semibold text-cream outline-none'

/** « Non merci » : plus discret que le geste principal, cible tactile de 44 px quand même. */
const DECLINE_LINK =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-xs font-semibold text-cream/60 underline underline-offset-2 transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-60'

/** Refus du rappel encore valable sur cet appareil ? Stockage indisponible : non. */
function readReminderDecline(): boolean {
  try {
    return isReminderDeclineActive(getSafeStorage()?.getItem(REMATCH_REMINDER_DECLINE_KEY), Date.now())
  } catch {
    return false
  }
}

export function RematchNightCard({
  roomId,
  progressionSince,
  className,
}: RematchNightCardProps) {
  const t = useTranslations('rematchNight')
  const titleId = useId()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const isGuest = Boolean(user?.isGuest)
  const hasEmail = Boolean(user?.email) && !isGuest

  const reminder = useFridayReminder({ enabled: hasEmail })
  // Même lecture que la bannière d'XP (repère de l'écran de fin) : aucune
  // requête de plus quand elle est montée.
  const { firstGameFeedback, loading: progressionLoading } = useOnlineProgression({
    since: progressionSince,
  })

  const [addable, setAddable] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchAddable(roomId).then((count) => {
      if (!cancelled) setAddable(count)
    })
    return () => {
      cancelled = true
    }
  }, [roomId, userId])

  const [view, setView] = useState<RematchNightView | null>(null)
  const decidedRef = useRef(false)

  // Décision UNIQUE, une fois les trois lectures arrivées : un écran de fin
  // qui se re-rend (votes de revanche, sondage de la salle) ne doit ni faire
  // clignoter la carte ni la faire disparaître après un geste (rappel
  // accepté, tablée ajoutée : la carte reste pour dire que c'est fait).
  useEffect(() => {
    if (decidedRef.current || !userId) return
    if (addable === undefined || progressionLoading || reminder.state === 'loading') return
    decidedRef.current = true
    // L'avis de 1re partie a la priorité : une seule carte sous l'XP.
    if (firstGameFeedback) return
    const next = rematchNightView({
      addable: addable ?? 0,
      reminder: reminder.state,
      isGuest,
      hasEmail,
      declined: readReminderDecline(),
    })
    if (!next) return
    setView(next)
  }, [userId, addable, progressionLoading, reminder.state, firstGameFeedback, isGuest, hasEmail])

  // ── « Ajouter la tablée en amis » ──────────────────────────────────────
  const [friendsStatus, setFriendsStatus] = useState<FriendsStatus>('idle')
  // Demandes ENVOYÉES et demandes reçues ACCEPTÉES, gardées à part : une
  // demande croisée acceptée fait un ami tout de suite, l'annoncer comme
  // « demande envoyée » faisait attendre une réponse déjà donnée.
  const [friendsResult, setFriendsResult] = useState<TableFriendRequestsResult>({ requested: 0, accepted: 0 })
  // Verrou synchrone (deux touchers dans la même image), gardé fermé après
  // succès : la tablée n'est ajoutée qu'une fois par écran.
  const friendsLockRef = useRef(false)
  const friendsDoneRef = useRef<HTMLDivElement>(null)

  const addTable = useCallback(async () => {
    if (friendsLockRef.current) return
    friendsLockRef.current = true
    setFriendsStatus('sending')
    try {
      const res = await fetch('/api/friends/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      })
      if (res.status === 429) {
        friendsLockRef.current = false
        setFriendsStatus('tooMany')
        return
      }
      const result = res.ok ? parseTableFriendRequestsResult(await res.json().catch(() => null)) : null
      if (!result) {
        friendsLockRef.current = false
        setFriendsStatus('error')
        return
      }
      setFriendsResult(result)
      setFriendsStatus('done')
    } catch {
      friendsLockRef.current = false
      setFriendsStatus('error')
    }
  }, [roomId])

  // Le bouton disparaît avec la réponse : le focus passe à la ligne d'état.
  useEffect(() => {
    if (friendsStatus === 'done') friendsDoneRef.current?.focus({ preventScroll: true })
  }, [friendsStatus])

  // ── « Me rappeler vendredi » ───────────────────────────────────────────
  // Ligne d'état qui remplace le bouton après un geste (activé, e-mail de
  // confirmation envoyé, « non merci ») : elle reçoit le focus.
  const reminderStatusRef = useRef<HTMLParagraphElement>(null)
  const [reminderGesture, setReminderGesture] = useState<'idle' | 'answered' | 'declined'>('idle')
  const enableReminder = async () => {
    if (await reminder.setReminder(true)) setReminderGesture('answered')
  }
  const declineReminder = () => {
    try {
      getSafeStorage()?.setItem(REMATCH_REMINDER_DECLINE_KEY, String(Date.now()))
    } catch {
      // stockage indisponible : refus valable pour cet écran seulement
    }
    setReminderGesture('declined')
  }
  useEffect(() => {
    if (reminderGesture !== 'idle') reminderStatusRef.current?.focus({ preventScroll: true })
  }, [reminderGesture])

  if (!view) return null

  const showFriendsButton = view.friends && friendsStatus !== 'done'
  const reminderLine = view.reminder !== 'none'
  const reminderOn = reminderLine && reminder.state === 'on'
  const reminderPending = reminderLine && reminder.state === 'pending'
  const declined = reminderGesture === 'declined'
  const showReminderButton = view.reminder === 'offer' && reminder.state === 'off' && !declined
  const sideBySide = showFriendsButton && showReminderButton
  const sendingFriends = friendsStatus === 'sending'
  const { requested, accepted } = friendsResult

  const friendsBlock = !view.friends ? null : friendsStatus === 'done' ? (
    <div ref={friendsDoneRef} tabIndex={-1} role="status" className={STATUS_LINE}>
      <Check aria-hidden className="h-4 w-4 shrink-0 text-gold" />
      <span className="flex flex-col py-1">
        {requested > 0 && <span>{t('friendsSent', { count: requested })}</span>}
        {accepted > 0 && <span>{t('friendsAccepted', { count: accepted })}</span>}
        {requested === 0 && accepted === 0 && <span>{t('friendsNothing')}</span>}
      </span>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => void addTable()}
      disabled={sendingFriends}
      aria-busy={sendingFriends || undefined}
      className={CARD_BUTTON}
    >
      {sendingFriends ? (
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <UserPlus aria-hidden className="h-4 w-4 shrink-0" />
      )}
      {t('addTable')}
    </button>
  )

  let reminderBlock: ReactElement | null = null
  if (reminderOn) {
    reminderBlock = (
      <div className="flex flex-wrap items-center justify-center gap-x-1">
        <p ref={reminderStatusRef} tabIndex={-1} role="status" className={cn(STATUS_LINE, 'bg-transparent px-1')}>
          <Check aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          {t('reminderOn')}
        </p>
        <Link href="/compte?focus=rappel" className={CARD_LINK}>
          {t('reminderManage')}
        </Link>
      </div>
    )
  } else if (reminderPending) {
    // Double opt-in : rien n'est accordé avant le clic dans l'e-mail.
    reminderBlock = (
      <p ref={reminderStatusRef} tabIndex={-1} role="status" className={cn(STATUS_LINE, 'py-1.5 leading-snug')}>
        <MailCheck aria-hidden className="h-4 w-4 shrink-0 text-gold" />
        {t('reminderPending')}
      </p>
    )
  } else if (declined) {
    reminderBlock = (
      <p ref={reminderStatusRef} tabIndex={-1} role="status" className={STATUS_LINE}>
        {t('declined')}
      </p>
    )
  } else if (showReminderButton) {
    reminderBlock = (
      <button
        type="button"
        onClick={() => void enableReminder()}
        disabled={reminder.pending}
        aria-busy={reminder.pending || undefined}
        aria-describedby={`${titleId}-hint`}
        className={CARD_BUTTON}
      >
        {reminder.pending ? (
          <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <BellRing aria-hidden className="h-4 w-4 shrink-0" />
        )}
        {t('remindMe')}
      </button>
    )
  }

  const error =
    friendsStatus === 'tooMany'
      ? t('tooMany')
      : friendsStatus === 'error'
        ? t('friendsError')
        : reminder.failed
          ? t('reminderError')
          : null

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'w-full rounded-2xl border border-gold/30 bg-felt-deep/90 p-3 text-center text-cream shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)] motion-safe:animate-in motion-safe:fade-in',
        className
      )}
    >
      <h3 id={titleId} className="font-display text-base font-bold leading-tight text-gold">
        {t('title')}
      </h3>
      <div className={cn('mt-2.5 grid gap-2', sideBySide && 'grid-cols-2')}>
        {friendsBlock}
        {reminderBlock}
      </div>
      {/* L'accord doit être ÉCLAIRÉ : ce qu'on accepte, à quelle fréquence,
          à quelle heure (de Paris) et comment l'arrêter — sous le bouton,
          avant le geste. Et le refus doit être aussi simple que l'accord. */}
      {showReminderButton && (
        <>
          <p id={`${titleId}-hint`} className="mt-1.5 text-[11px] leading-snug text-cream/60">
            {t('reminderHint')}
          </p>
          <button type="button" onClick={declineReminder} disabled={reminder.pending} className={DECLINE_LINK}>
            {t('decline')}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-suit-red/20 px-3 py-1.5 text-xs text-red-100">
          {error}
        </p>
      )}
    </section>
  )
}
