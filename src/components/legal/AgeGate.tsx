"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AGE_VERIFIED_COOKIE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_GRANTED,
  hasAnsweredAnalyticsConsent,
  isAnalyticsConsentGranted,
} from '@/lib/auth-cookies'
import { resetLocalPlayersSync } from '@/lib/visit-ping-client'

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${name}=`))
}

/** Valeur brute d'un cookie lisible en JS (pas lp_vid, httpOnly), ou null. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const entry = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix))
  return entry === undefined ? null : entry.slice(prefix.length)
}

/**
 * Portail d'entrée en deux niveaux, volontairement discret :
 *  - 'gate' (première visite, pas de cookie 18+) : petite carte bloquante —
 *    le clic sur « J'ai 18 ans ou plus — Entrer » vaut certification, la
 *    case statistiques reste optionnelle et décochée (opt-in RGPD) ;
 *  - 'cookies-only' (âge déjà validé, pas de réponse à la question ACTUELLE :
 *    cookie absent, ou ancien accord '1' donné sous le libellé « anonymes ») :
 *    simple bandeau bas de page Accepter/Refuser, au même niveau visuel (pas
 *    de dark pattern), le site reste utilisable.
 * Les pages /legal/* sont exemptées : les CGU et la politique de
 * confidentialité doivent être lisibles AVANT d'accepter.
 */
type GateMode = 'gate' | 'cookies-only'

/**
 * Routes SANS AUCUNE surcouche (ni portail 18+, ni bandeau cookies) : l'écran
 * TV. C'est un afficheur PASSIF, souvent sans clavier ni souris — une modale
 * bloquante y est un cul-de-sac. Et il n'y a rien à certifier : la TV
 * n'affiche que ce que lui pousse le téléphone qui a lancé la diffusion, et
 * c'est CE téléphone qui a franchi le portail (et posé le cookie analytics).
 */
export function isOverlayFreeRoute(pathname: string): boolean {
  return pathname === '/tv' || pathname.startsWith('/tv/')
}

const AGE_GATE_REQUEST_EVENT = 'lp:age-gate-request'
const AGE_GATE_RESULT_EVENT = 'lp:age-gate-result'

function announceAgeGateResult(verified: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(AGE_GATE_RESULT_EVENT, { detail: verified }))
}

/**
 * Déclaration 18+ exigée AVANT une action (création d'un compte invité) sur
 * une page où le portail ne s'affiche pas de lui-même : les pages de LECTURE
 * (landing, règles, légal). Le portail s'ouvre alors sur place, sans quitter
 * la page. Résout `true` si l'âge est (ou vient d'être) certifié, `false` si
 * le visiteur renonce (bouton Annuler, navigation vers une autre page).
 *
 * Ne relance JAMAIS l'action d'elle-même : c'est à l'appelant de la proposer
 * de nouveau (un appelant démonté entre-temps ne doit rien créer).
 */
export function requestAgeVerification(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (hasCookie(AGE_VERIFIED_COOKIE)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const onResult = (event: Event) => {
      window.removeEventListener(AGE_GATE_RESULT_EVENT, onResult)
      resolve((event as CustomEvent<boolean>).detail === true)
    }
    window.addEventListener(AGE_GATE_RESULT_EVENT, onResult)
    window.dispatchEvent(new Event(AGE_GATE_REQUEST_EVENT))
  })
}

const ANALYTICS_CONSENT_REQUEST_EVENT = 'lp:analytics-consent-request'

/**
 * Rouvre le bandeau des statistiques de visite, MÊME si un choix existe : le
 * retrait doit être aussi simple que l'accord (art. 7(3)), sans passer par
 * l'effacement des cookies, qui déconnecte et efface la déclaration d'âge.
 * Le bandeau s'affiche partout (pages légales comprises, puisqu'on le demande)
 * sauf sur l'écran TV, et ne certifie jamais l'âge.
 */
export function openAnalyticsConsent(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_REQUEST_EVENT))
}

/**
 * Bouton « Statistiques de visite » pour les composants SERVEUR (pied de la
 * landing) : le libellé est traduit côté serveur et passé en enfant.
 */
export function AnalyticsConsentButton({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <button type="button" onClick={() => openAnalyticsConsent()} className={className}>
      {children}
    </button>
  )
}

/** Éléments réellement atteignables au clavier à l'intérieur d'un conteneur. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AgeGate() {
  const t = useTranslations('legal.ageGate')
  const tNav = useTranslations('nav.legal')
  const tCommon = useTranslations('common')
  const pathname = usePathname()
  const [mode, setMode] = useState<GateMode | null>(null)
  const [analyticsChecked, setAnalyticsChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  // Page sur laquelle le portail a été DEMANDÉ (requestAgeVerification) : il
  // s'y affiche même si c'est une page de lecture.
  const [requestedOn, setRequestedOn] = useState<string | null>(null)
  // Bandeau statistiques rouvert à la demande (openAnalyticsConsent), avec le
  // choix en vigueur à ce moment-là pour le rappeler (null : pas de réponse
  // à la question actuelle).
  const [consentRequested, setConsentRequested] = useState(false)
  const [currentChoice, setCurrentChoice] = useState<'granted' | 'refused' | null>(null)

  useEffect(() => {
    if (!hasCookie(AGE_VERIFIED_COOKIE)) setMode('gate')
    else if (!hasAnsweredAnalyticsConsent(readCookie(ANALYTICS_CONSENT_COOKIE))) setMode('cookies-only')
    else setMode(null)
  }, [])

  // Portail affiché : la case reprend un accord déjà donné sous le libellé
  // actuel (bandeau accepté sur une page de lecture, cookie d'âge perdu). Sans
  // ça, « Entrer » case décochée transformait cet accord en refus — et le
  // refus efface les données. Jamais cochée d'office sans accord explicite.
  useEffect(() => {
    if (mode !== 'gate') return
    setAnalyticsChecked(isAnalyticsConsentGranted(readCookie(ANALYTICS_CONSENT_COOKIE)))
  }, [mode])

  useEffect(() => {
    const onRequest = () => {
      const value = readCookie(ANALYTICS_CONSENT_COOKIE)
      setCurrentChoice(
        !hasAnsweredAnalyticsConsent(value)
          ? null
          : isAnalyticsConsentGranted(value)
            ? 'granted'
            : 'refused'
      )
      setConsentRequested(true)
    }
    window.addEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onRequest)
    return () => window.removeEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onRequest)
  }, [])

  // Bandeau rouvert depuis un menu (tiroir fermé dans le même geste) : le
  // focus y est posé, sinon il se perdait au clavier. Pas sur « Accepter » :
  // on ne pousse vers aucun des deux choix.
  useEffect(() => {
    if (consentRequested) bannerRef.current?.focus()
  }, [consentRequested])

  useEffect(() => {
    const onRequest = () => {
      // Âge certifié entre-temps (autre onglet) ou route sans surcouche : on
      // répond tout de suite.
      if (hasCookie(AGE_VERIFIED_COOKIE)) {
        announceAgeGateResult(true)
        return
      }
      if (isOverlayFreeRoute(pathname)) {
        announceAgeGateResult(false)
        return
      }
      setMode('gate')
      setRequestedOn(pathname)
    }
    window.addEventListener(AGE_GATE_REQUEST_EVENT, onRequest)
    return () => window.removeEventListener(AGE_GATE_REQUEST_EVENT, onRequest)
  }, [pathname])

  // Navigation hors de la page demandeuse (lien CGU du portail, retour…) : la
  // demande tombe — le composant qui l'a faite n'est plus là — et le portail
  // reprend sa règle ordinaire (masqué sur les pages de lecture).
  useEffect(() => {
    if (requestedOn === null || requestedOn === pathname) return
    setRequestedOn(null)
    announceAgeGateResult(false)
  }, [pathname, requestedOn])

  const cancelRequest = useCallback(() => {
    setRequestedOn(null)
    announceAgeGateResult(false)
  }, [])

  /**
   * Le portail 18+ est une modale BLOQUANTE : au clavier, il faut donc y
   * entrer et ne pas pouvoir en sortir. Sans ça, le focus restait sur la page
   * masquée derrière — une tabulation promenait l'utilisateur dans une
   * navigation qu'il ne voyait plus, et un lecteur d'écran annonçait le
   * contenu du site alors que le portail n'était pas franchi.
   *
   * Trois gestes : on pose le focus sur la carte au montage (elle est
   * `tabIndex={-1}`, donc focusable par programme sans entrer dans l'ordre de
   * tabulation), on piège Tab / Maj+Tab en boucle sur ses éléments, et on
   * rend le focus à l'élément d'origine à la fermeture.
   *
   * Pas d'échappatoire par Échap : la certification d'âge n'est pas
   * annulable, contrairement à une modale ordinaire.
   */
  useEffect(() => {
    if (mode !== 'gate') return
    const dialog = dialogRef.current
    if (!dialog) return

    const previous = document.activeElement as HTMLElement | null
    dialog.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      // Tout ce que contient la carte est visible (le sélecteur écarte déjà
      // les éléments désactivés) : pas de filtrage supplémentaire à faire.
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) {
        // Tout est désactivé (envoi en cours) : on garde le focus sur la carte.
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (active && !dialog.contains(active)) {
        // Le focus s'est échappé (clic dans la page derrière) : on le ramène.
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus?.()
    }
    // `pathname` compte : le portail n'est PAS rendu sur les pages de lecture
    // alors que `mode` y vaut déjà 'gate'. Sans cette dépendance, arriver sur
    // le hub depuis la landing laissait la carte sans focus ni piège.
    // `requestedOn` aussi : sur une page de lecture, c'est la demande qui le
    // fait apparaître, sans que `mode` change.
  }, [mode, pathname, requestedOn])

  /**
   * `consentOnly` : choix donné depuis le BANDEAU. Il n'enregistre que les
   * statistiques — le bandeau peut être rouvert sur une page de lecture par
   * un visiteur qui n'a jamais franchi le portail, et ne vaut pas déclaration
   * d'âge. Le portail reste alors dû (masqué sur les pages de lecture).
   *
   * `consentVersion` : version du libellé AFFICHÉ ici. Le serveur n'écrit
   * l'accord '2' que s'il la reçoit, jamais pour un onglet resté sur un
   * ancien libellé.
   */
  const submit = useCallback(async (analytics: boolean, consentOnly: boolean) => {
    setLoading(true)
    try {
      const res = await fetch('/api/legal/accept-age', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics, consentOnly, consentVersion: ANALYTICS_CONSENT_GRANTED }),
      })
      if (res.ok) {
        // Un refus (ici ou dans un autre onglet) efface la présence du
        // navigateur et ses pseudos locaux : la synchro déjà confirmée dans ce
        // document ne vaut plus, la liste repartira au prochain battement.
        resetLocalPlayersSync()
        setConsentRequested(false)
        if (consentOnly) {
          setAnalyticsChecked(analytics)
          setMode(hasCookie(AGE_VERIFIED_COOKIE) ? null : 'gate')
        } else {
          setMode(null)
          setRequestedOn(null)
          announceAgeGateResult(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Le portail bloquant ne s'affiche PAS sur les pages de LECTURE (landing,
  // règles, légal) : un visiteur SEO peut lire librement, la certification
  // 18+ arrive au moment de JOUER (hub, pages jeux). Le bandeau cookies
  // discret, lui, reste possible partout. Exception : une action qui l'exige
  // l'a demandé sur cette page (« Essayer avec des bots ») — il s'affiche
  // alors, annulable puisque rien n'oblige à jouer pour lire.
  const readingPage =
    pathname === '/' || pathname.startsWith('/legal') || pathname.startsWith('/regles')
  const requestedHere = requestedOn === pathname
  if (isOverlayFreeRoute(pathname)) return null
  const showGate = mode === 'gate' && (!readingPage || requestedHere)
  // Bandeau proposé de lui-même (hors pages légales, lisibles avant de
  // choisir), ou rouvert à la demande : alors partout, y compris sur la
  // politique qu'il cite. Le portail, qui porte déjà la case, passe devant.
  const bannerPrompted = mode === 'cookies-only' && !pathname.startsWith('/legal')
  const showBanner = !showGate && (consentRequested || bannerPrompted)
  // Fermer sans choisir n'est offert qu'au bandeau ROUVERT : proposé de
  // lui-même, il attend une réponse (il reviendrait au chargement suivant).
  const canDismissBanner = consentRequested && !bannerPrompted

  if (showBanner) {
    return (
      <div
        ref={bannerRef}
        role="region"
        aria-label={tNav('analytics')}
        tabIndex={-1}
        className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-gold/25 bg-felt-deep/95 p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        {canDismissBanner && (
          <button
            type="button"
            onClick={() => setConsentRequested(false)}
            disabled={loading}
            aria-label={tCommon('close')}
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {/* Contraste : /70 sur le feutre profond passait sous le seuil AA en
            12px — remonté à /85 (le texte porte l'information légale). Le
            détail (durées, droits, retrait) est dans la politique liée. */}
        <p className={`text-xs leading-relaxed text-white/85 ${canDismissBanner ? 'pr-7' : ''}`}>
          {t('cookiesBanner')}{' '}
          <Link
            href="/legal/confidentialite"
            className="text-amber-300 underline underline-offset-2 hover:text-amber-200"
          >
            {t('privacyLink')}
          </Link>
        </p>
        {consentRequested && currentChoice && (
          <p className="mt-1.5 text-[11px] font-semibold text-cream/90">
            {currentChoice === 'granted' ? t('currentChoiceGranted') : t('currentChoiceRefused')}
          </p>
        )}
        {/* Accepter et Refuser strictement au même niveau visuel (même
            style, même taille) : refuser doit être aussi simple qu'accepter. */}
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => void submit(true, true)}
            disabled={loading}
            variant="outline"
            className="h-8 flex-1 border-white/30 bg-white/[0.06] text-xs font-semibold text-cream hover:bg-white/15 hover:text-cream"
          >
            {t('accept')}
          </Button>
          <Button
            onClick={() => void submit(false, true)}
            disabled={loading}
            variant="outline"
            className="h-8 flex-1 border-white/30 bg-white/[0.06] text-xs font-semibold text-cream hover:bg-white/15 hover:text-cream"
          >
            {t('refuse')}
          </Button>
        </div>
      </div>
    )
  }

  if (!showGate) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      {/* `role="dialog"` est un rôle INTERACTIF : posé tel quel sur une simple
          div, il annonçait une boîte de dialogue que le clavier ne pouvait
          jamais atteindre. `tabIndex={-1}` en fait une cible de focus par
          programme (sans l'ajouter à l'ordre de tabulation), ce qui donne au
          piège à focus ci-dessus un point d'entrée légitime. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        tabIndex={-1}
        className="my-auto w-full max-w-sm rounded-2xl border border-gold/30 bg-felt-deep p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        <h2 id="age-gate-title" className="text-center font-display text-lg font-bold text-cream">
          {t('title')}
        </h2>
        {/* Contrastes remontés (/55 → /80, /75 → crème) : c'est l'avertissement
            sanitaire, il doit se lire du premier coup en 12px. */}
        <p className="mt-2 text-center text-xs leading-relaxed text-white/80">
          <strong className="text-cream">{t('healthWarning')}</strong> {t('moderation')}
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <Checkbox
            checked={analyticsChecked}
            onCheckedChange={(v) => setAnalyticsChecked(v === true)}
            className="border-white/40 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
          />
          <span className="text-xs text-white/85">{t('analyticsLabel')}</span>
        </label>

        <Button
          onClick={() => void submit(analyticsChecked, false)}
          disabled={loading}
          className="mt-4 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400"
        >
          {loading ? t('validating') : t('enterAdult')}
        </Button>

        {/* Portail DEMANDÉ sur une page de lecture : on peut y renoncer et
            continuer à lire (ailleurs, la certification n'est pas annulable). */}
        {readingPage && requestedHere && (
          <Button
            type="button"
            variant="ghost"
            onClick={cancelRequest}
            disabled={loading}
            className="mt-2 h-auto min-h-11 w-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            {tCommon('cancel')}
          </Button>
        )}

        {/* Mentions légales : 11px à /40 était illisible sur le feutre — /70
            (et liens en ambre plein) sans changer la hiérarchie visuelle. */}
        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/70">
          {t('termsPrefix')}{' '}
          <Link href="/legal/cgu" className="text-amber-300 underline underline-offset-2 hover:text-amber-200">
            {tNav('cgu')}
          </Link>{' '}
          {t('termsAnd')}
          {t('termsAnd').endsWith("'") ? '' : ' '}
          <Link href="/legal/confidentialite" className="text-amber-300 underline underline-offset-2 hover:text-amber-200">
            {tNav('confidentialite')}
          </Link>
          {t('termsSuffix')} {t('minorWarning')}
        </p>
      </div>
    </div>
  )
}
