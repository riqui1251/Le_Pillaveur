"use client"

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import {
  initFirstGameDeviceFlag,
  markFirstGameDeviceVeteran,
  markFirstGameFeedbackAsked,
  noteFirstGameFeedbackShown,
  shouldAskFirstGameFeedback,
  type FirstGamePlayMode,
} from '@/lib/first-game-device'
import { cn } from '@/lib/utils'

/**
 * « Alors, cette première partie ? » — l'avis demandé À CHAUD, sur l'écran de
 * fin de la toute première partie (10 avis en 4 mois par le seul formulaire
 * du menu : personne ne va le chercher). Cf. src/lib/first-game-device.ts.
 *
 * Une CARTE dans le flux de l'écran de fin, jamais une modale : la revanche ne
 * doit pas attendre la réponse, et les Dialog Radix des écrans de fin locaux
 * bloquent les clics extérieurs — une seconde surcouche y serait un piège.
 * Compacte (titre, cinq visages, « Non merci ») : le commentaire ne s'ouvre
 * qu'une fois la note choisie, pour ne pas repousser « Rejouer » d'emblée.
 *
 * La décision d'afficher est prise UNE fois, après le montage (le stockage de
 * l'appareil n'existe pas au rendu serveur : le lire plus tôt ferait diverger
 * l'hydratation). En ligne, elle attend en plus le verdict du serveur ; en
 * local avec un compte connecté, celui du compte (GET /api/feedback/first-game).
 *
 * Arrivée TARDIVE (verdict du serveur venu à la relecture, 1,5 s après
 * l'écran) : la carte se pose SOUS la barre d'actions (`lateSlot`), jamais
 * au-dessus — insérée au-dessus au moment où le pouce vise « Rejouer », elle
 * décalait toute la barre et le toucher tombait sur un visage (note choisie
 * par erreur) ou sur « Non merci » (demande close pour de bon).
 */

/** Visages de 1 à 5 : se lisent sans texte, à toutes les tables (quatre langues). */
const RATING_FACES = ['😣', '🙁', '😐', '🙂', '😍'] as const

/** Même plafond que la route (le serveur tronque de toute façon). */
const MAX_COMMENT = 1000

/**
 * Au-delà de ce délai après l'apparition de l'écran de fin, la carte est
 * « tardive » : la première lecture de la progression arrive bien avant ; la
 * relecture de la bannière d'XP (1,5 s) toujours après.
 */
const LATE_DECISION_MS = 1200

type Status = 'idle' | 'sending' | 'sent' | 'already' | 'dismissed'
type SendError = 'network' | 'tooMany' | null
type PostOutcome = 'ok' | 'already' | 'tooMany' | 'network'

export type FirstGameFeedbackCardProps = {
  mode: FirstGamePlayMode
  /** Identifiant du jeu (src/lib/games.ts) — l'avis est rangé par jeu côté admin. */
  gameId: string
  /**
   * En ligne : repère de fraîcheur noté par l'écran de fin à son premier rendu
   * (onlineProgressionMark). La carte, montée en différé, réutilise alors la
   * lecture de progression que la bannière d'XP a lancée pour le même écran.
   */
  progressionSince?: number
  /** Instant (Date.now()) où l'écran de fin est apparu — mesure du retard. */
  shownAt?: number
  /**
   * Emplacement SOUS la barre d'actions, où se pose une carte tardive. Absent
   * (barre fixe du Quiz : la carte n'y décale rien), elle reste en place.
   */
  lateSlot?: HTMLElement | null
  /** Ajustements propres à l'écran hôte (marges, largeur), en place seulement. */
  className?: string
}

type FirstGameFeedbackBody =
  | { action: 'rate'; rating: number; comment?: string; gameId: string; playMode: FirstGamePlayMode; pageUrl?: string }
  | { action: 'dismiss'; gameId?: string; playMode: FirstGamePlayMode }

/** Issue de l'envoi — jamais d'exception : l'écran de fin ne doit pas casser. */
async function postFirstGameFeedback(body: FirstGameFeedbackBody): Promise<PostOutcome> {
  try {
    const res = await fetch('/api/feedback/first-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // « Retour au menu » juste après l'envoi ne doit pas l'annuler.
      keepalive: true,
      body: JSON.stringify(body),
    })
    if (res.ok) {
      // `already` : ce compte avait déjà noté (autre appareil, autre onglet) —
      // rien n'a été écrit, on ne remercie pas comme si on lisait celui-ci.
      const json = (await res.json().catch(() => null)) as { already?: unknown } | null
      return json?.already === true ? 'already' : 'ok'
    }
    return res.status === 429 ? 'tooMany' : 'network'
  } catch {
    return 'network'
  }
}

/** Le compte connecté débute-t-il ? 'unknown' sur panne : on ne demande pas, sans rien retenir. */
async function fetchLocalAccountEligibility(): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const res = await fetch('/api/feedback/first-game', { credentials: 'include' })
    if (!res.ok) return 'unknown'
    const json = (await res.json().catch(() => null)) as { eligible?: unknown } | null
    if (typeof json?.eligible !== 'boolean') return 'unknown'
    return json.eligible ? 'yes' : 'no'
  } catch {
    return 'unknown'
  }
}

export function FirstGameFeedbackCard(props: FirstGameFeedbackCardProps) {
  // Deux portes distinctes : en local, aucune lecture de progression (un
  // joueur connecté qui joue sur le téléphone de la table n'en a pas besoin).
  if (props.mode === 'online') return <OnlineGate {...props} />
  return <LocalGate {...props} />
}

/**
 * En local, l'appareil décide pour un visiteur anonyme. Avec un compte
 * connecté, le compte doit AUSSI débuter : un habitué qui ouvre le site sur
 * un téléphone neuf (coquille Android, autre navigateur, stockage purgé) est
 * « nouveau » pour l'appareil avant même de se connecter — on lui demandait
 * sa « première partie », et sa note faussait le résumé des nouveaux. La
 * requête ne part que si l'appareil n'a pas déjà tranché ; un « non » du
 * serveur passe l'appareil en 'veteran' (plus de requête aux parties suivantes).
 */
function LocalGate(props: FirstGameFeedbackCardProps) {
  const { user, loading } = useAuth()
  const userId = user?.id ?? null
  const [verdict, setVerdict] = useState<{ ready: boolean; eligible?: boolean }>({ ready: false })

  useEffect(() => {
    if (loading) return
    if (!userId) {
      setVerdict({ ready: true })
      return
    }
    if (!shouldAskFirstGameFeedback({ device: initFirstGameDeviceFlag(), mode: 'local' })) {
      setVerdict({ ready: true, eligible: false })
      return
    }
    let cancelled = false
    void fetchLocalAccountEligibility().then((answer) => {
      if (cancelled) return
      if (answer === 'no') markFirstGameDeviceVeteran()
      setVerdict({ ready: true, eligible: answer === 'yes' })
    })
    return () => {
      cancelled = true
    }
  }, [loading, userId])

  return <FirstGameFeedbackPrompt {...props} ready={verdict.ready} serverEligible={verdict.eligible} />
}

/**
 * En ligne, d'abord l'appareil : déjà sollicité (réponse, « Non merci », deux
 * affichages), il n'y a rien à demander au serveur — pas d'abonné à la
 * progression, donc pas de requête de plus sur chaque écran de fin à venir.
 * Sans compte, rien non plus (une salle en ligne en exige un, invités compris).
 */
function OnlineGate(props: FirstGameFeedbackCardProps) {
  const { user } = useAuth()
  const [deviceOpen, setDeviceOpen] = useState(false)

  useEffect(() => {
    const device = initFirstGameDeviceFlag()
    setDeviceOpen(shouldAskFirstGameFeedback({ device, mode: 'online', serverEligible: true }))
  }, [])

  return user && deviceOpen ? <OnlineEligibility {...props} /> : null
}

/**
 * Puis le serveur : il dit si ce compte débute (`firstGameFeedback`). On
 * attend des données FRAÎCHES (`fresh` : une lecture RÉUSSIE postérieure au
 * repère de l'écran de fin, `progressionSince`, sinon au montage de
 * l'abonné) : jamais l'instantané d'avant la partie (fiche ou lobby ouverts
 * avant que le succès first_game ne tombe, ou lecture de fin échouée qui
 * laisse cet instantané en place), et pas de requête en double de celle de
 * la bannière d'XP — sans quoi chaque fin de partie de chaque habitué payait
 * une lecture de plus, l'appareil n'étant jamais « sollicité » pour un compte
 * que le serveur écarte.
 */
function OnlineEligibility({ progressionSince, ...props }: FirstGameFeedbackCardProps) {
  const { firstGameFeedback, fresh } = useOnlineProgression({ since: progressionSince })
  return <FirstGameFeedbackPrompt {...props} ready={fresh} serverEligible={firstGameFeedback} />
}

function FirstGameFeedbackPrompt({
  mode,
  gameId,
  className,
  shownAt,
  lateSlot,
  ready,
  serverEligible,
}: FirstGameFeedbackCardProps & { ready: boolean; serverEligible?: boolean }) {
  const t = useTranslations('feedback.firstGame')
  const titleId = useId()
  const commentId = useId()

  const [visible, setVisible] = useState(false)
  const [late, setLate] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<SendError>(null)
  const decidedRef = useRef(false)
  // Verrou synchrone : deux touchers dans la même image passent tous deux
  // avant le rendu qui désactive les boutons (cf. useGuardedAction de
  // l'écran de fin en ligne) — sans lui, deux envois.
  const lockRef = useRef(false)
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])
  const doneRef = useRef<HTMLParagraphElement>(null)

  // Décision unique : un écran de fin qui se re-rend (votes de revanche,
  // sondage de la salle) ne doit ni recompter l'affichage ni faire clignoter
  // la carte. Le verrou en ref tient aussi au double effet du mode strict.
  // Seul un « non » du SERVEUR en ligne reste révisable : la lecture a pu
  // partir avant la transaction qui crédite la partie (et pose first_game) —
  // la relecture de la bannière d'XP (1,5 s plus tard) peut alors encore
  // dire « oui ». Ce « oui » tardif se pose sous les actions (voir l'en-tête).
  useEffect(() => {
    if (!ready || decidedRef.current) return
    if (mode === 'online' && !serverEligible) return
    decidedRef.current = true
    const device = initFirstGameDeviceFlag()
    if (!shouldAskFirstGameFeedback({ device, mode, serverEligible })) return
    noteFirstGameFeedbackShown()
    setLate(shownAt !== undefined && Date.now() - shownAt > LATE_DECISION_MS)
    setVisible(true)
  }, [ready, mode, serverEligible, shownAt])

  const finished = status === 'sent' || status === 'already' || status === 'dismissed'

  // Les boutons disparaissent avec la réponse : le focus passe au message,
  // sinon il retombait sur la page (ou au début de la modale de fin).
  useEffect(() => {
    if (finished) doneRef.current?.focus({ preventScroll: true })
  }, [finished])

  const send = useCallback(async () => {
    if (rating === null || lockRef.current) return
    lockRef.current = true
    setStatus('sending')
    setError(null)
    const trimmed = comment.trim().slice(0, MAX_COMMENT)
    const outcome = await postFirstGameFeedback({
      action: 'rate',
      rating,
      ...(trimmed ? { comment: trimmed } : {}),
      gameId,
      playMode: mode,
      pageUrl: window.location.pathname,
    })
    if (outcome === 'ok' || outcome === 'already') {
      markFirstGameFeedbackAsked()
      setStatus(outcome === 'ok' ? 'sent' : 'already')
    } else {
      // Pas de blocage : le joueur peut réessayer, ou simplement rejouer.
      lockRef.current = false
      setError(outcome)
      setStatus('idle')
    }
  }, [comment, gameId, mode, rating])

  const dismiss = () => {
    if (lockRef.current) return
    lockRef.current = true
    markFirstGameFeedbackAsked()
    setStatus('dismissed')
    // Sans attendre : la réponse ne change rien pour le joueur (le serveur
    // note seulement qu'on a posé la question à ce compte).
    void postFirstGameFeedback({ action: 'dismiss', gameId, playMode: mode })
  }

  // Groupe de boutons radio au clavier : les flèches déplacent ET choisissent,
  // une seule tabulation pour entrer dans le groupe (comme des radios natifs).
  const onRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (delta === 0) return
    event.preventDefault()
    const next = (index + delta + RATING_FACES.length) % RATING_FACES.length
    setRating(next + 1)
    radioRefs.current[next]?.focus()
  }

  if (!visible) return null

  // Sous les actions, la carte prend la mise en page de son emplacement ; en
  // place, celle que lui donne l'écran hôte.
  const portaled = late && Boolean(lateSlot)
  const panel = cn(
    'w-full rounded-2xl border border-gold/30 bg-felt-deep/90 p-3 text-center text-cream shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)] motion-safe:animate-in motion-safe:fade-in',
    !portaled && className
  )
  const place = (node: ReactElement) => (portaled && lateSlot ? createPortal(node, lateSlot) : node)

  if (finished) {
    return place(
      <div className={panel}>
        <p
          ref={doneRef}
          tabIndex={-1}
          role="status"
          className="flex items-center justify-center gap-2 text-sm font-semibold text-cream outline-none"
        >
          {status !== 'dismissed' && <Check aria-hidden className="h-4 w-4 shrink-0 text-gold" />}
          {status === 'sent' ? t('thanks') : status === 'already' ? t('already') : t('dismissed')}
        </p>
      </div>
    )
  }

  const sending = status === 'sending'

  return place(
    <section aria-labelledby={titleId} className={panel}>
      <h3 id={titleId} className="font-display text-base font-bold leading-tight text-gold">
        {t('title')}
      </h3>
      <p className="mt-0.5 text-xs leading-snug text-cream/70">{t('subtitle')}</p>

      <div role="radiogroup" aria-labelledby={titleId} className="mt-2.5 flex justify-center gap-1.5">
        {RATING_FACES.map((face, index) => {
          const value = index + 1
          const checked = rating === value
          return (
            <button
              key={value}
              ref={(el) => {
                radioRefs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={t('rate', { rating: value })}
              // Une seule entrée au clavier : la note choisie, sinon la première.
              tabIndex={checked || (rating === null && index === 0) ? 0 : -1}
              disabled={sending}
              onClick={() => setRating(value)}
              onKeyDown={(event) => onRadioKeyDown(event, index)}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl border text-2xl leading-none transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:transition-none',
                checked
                  ? 'border-gold/60 bg-gold/20 motion-safe:scale-110'
                  : cn('border-white/10 bg-white/5 hover:bg-white/10', rating !== null && 'opacity-60')
              )}
            >
              <span aria-hidden>{face}</span>
            </button>
          )
        })}
      </div>

      {rating !== null && (
        <div className="mt-2.5 text-left">
          <label htmlFor={commentId} className="mb-1 block text-xs font-medium text-cream/80">
            {t('commentLabel')}
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t('commentPlaceholder')}
            maxLength={MAX_COMMENT}
            rows={2}
            disabled={sending}
            // 16 px sous sm : iOS zoome sur tout champ plus petit au focus.
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-base text-cream placeholder:text-cream/40 focus:outline-none focus:ring-1 focus:ring-gold/50 sm:text-sm"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-suit-red/20 px-3 py-1.5 text-xs text-red-100">
          {error === 'tooMany' ? t('tooMany') : t('error')}
        </p>
      )}

      <div className="mt-2 flex items-center justify-center gap-2">
        {rating !== null && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            aria-busy={sending || undefined}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gold/90 px-5 text-sm font-bold text-primary-foreground transition-colors [touch-action:manipulation] hover:bg-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Send aria-hidden className="h-4 w-4 shrink-0" />
            )}
            {sending ? t('sending') : t('send')}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          disabled={sending}
          className="min-h-[44px] rounded-xl px-3 text-xs font-medium text-cream/60 underline-offset-2 transition-colors [touch-action:manipulation] hover:text-cream hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-60"
        >
          {t('dismiss')}
        </button>
      </div>
    </section>
  )
}
