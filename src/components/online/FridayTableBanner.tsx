"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarClock, DoorOpen, Users, X } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GameIconById } from '@/components/hub/GameIconById'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import {
  FRIDAY_TABLE,
  FRIDAY_TABLE_DISMISS_KEY,
  fridayTableStatus,
  fridayTableWeekKey,
  type FridayTableResponse,
  type FridayTableSeat,
} from '@/lib/friday-table'
import { GAMES } from '@/lib/games'
import { getSafeStorage } from '@/lib/storage'
import { resolveOnlineErrorCode } from '@/lib/online-errors'
import { validateAccountDisplayName, nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import { readLocalAmbianceMode } from '@/lib/ambiance-mode'

/**
 * Horloge du bandeau : il passe de la ligne discrète au bandeau « ouvert » (et
 * retour) sans rechargement. Recalcul pur, sans réseau : 30 s suffisent — une
 * soirée de 3 h ne se joue pas à la seconde.
 */
const CLOCK_MS = 30_000
/** Sondage de la table PENDANT la soirée seulement (hors soirée : aucune requête). */
const POLL_MS = 30_000

const GAME = GAMES.find((g) => g.id === FRIDAY_TABLE.gameId)
const GAME_PATH = GAME?.path ?? `/games/${FRIDAY_TABLE.gameId}`

/** Écran TV : ni barre de nav ni bandeau — même règle que Navbar et AgeGate. */
/**
 * Heure d'horloge à la typographie de la langue. Intl rend « 21:00 » en
 * français, alors que l'usage (et tout le reste du site : « vers 17 h ») est
 * « 21 h », « 21 h 30 » ; les autres langues gardent le format d'Intl.
 */
const NBSP = String.fromCharCode(0xa0)

function clockFormat(locale: string): { format: (date: Date) => string } {
  const intl = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
  if (!locale.startsWith('fr')) return intl
  const parts = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return {
    format: (date) => {
      const p = parts.formatToParts(date)
      const hour = Number(p.find((x) => x.type === 'hour')?.value ?? '0')
      const minute = p.find((x) => x.type === 'minute')?.value ?? '00'
      // Espace insécable : « 21 h » ne se coupe jamais en fin de ligne.
      return minute === '00' ? `${hour}${NBSP}h` : `${hour}${NBSP}h${NBSP}${minute}`
    },
  }
}

function isTvPath(pathname: string): boolean {
  return pathname === '/tv' || pathname.startsWith('/tv/')
}

/** Format court du code : six caractères alphanumériques, comme ?join= l'exige (JoinDeepLink). */
function isTableCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code)
}

/**
 * /api/auth/guest répond 200 avec le compte DÉJÀ connecté quand une session
 * valide existait (voir TryBotsGate) : rien n'a été créé.
 */
function isExistingAccountResponse(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as { alreadySignedIn?: unknown }).alreadySignedIn === true)
}

/** Point de pulsation « en direct » — figé sous prefers-reduced-motion. */
function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-suit-red/60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-suit-red" />
    </span>
  )
}

/**
 * LA TABLE OUVERTE DU VENDREDI — voir src/lib/friday-table.ts pour le
 * pourquoi (le nouveau venu seul a besoin de monde, et le monde est éparpillé
 * en tables privées).
 *
 * Deux visages :
 * - hors soirée, UNE ligne discrète qui donne le rendez-vous, à l'heure du
 *   visiteur (l'heure de Paris ne veut rien dire à Montréal) ;
 * - pendant la soirée, un bandeau visible : « Rejoindre » la table publique
 *   la plus peuplée, ou « Ouvrir la table » quand il n'y en a pas — table
 *   PUBLIQUE d'Imposteur créée par la même route que le lobby du jeu
 *   (useOnlineRoom.createRoom), et, sans compte, par le chemin invité de
 *   TryBotsGate (pseudo → /api/auth/guest → table), publique au lieu de
 *   privée et sans bots : le but est d'attendre des humains.
 *
 * « Rejoindre », avec une session : le bandeau rejoint LUI-MÊME
 * (useOnlineRoom.joinRoom, après bascule en ligne d'un joueur local) et dit
 * l'échec dans son propre `role=alert` — la table sondée il y a 30 s a pu
 * démarrer entre-temps. Passer par /jeux?join= depuis /jeux confiait le
 * geste à JoinDeepLink, déjà monté : l'erreur s'affichait hors écran (voire
 * nulle part en mode local) et une seconde table ne partait plus. Sans
 * session, le lien ?join= reste le chemin : JoinGate sait accueillir un
 * visiteur sans compte.
 *
 * Sans prop : il décide seul s'il a quelque chose à dire. Rien au rendu
 * serveur ni avant le montage (l'heure est celle du navigateur — le hub est
 * pré-rendu au build), rien sur /tv, rien la semaine où le visiteur l'a
 * masqué (localStorage, clé de semaine de la soirée visée).
 */
export function FridayTableBanner() {
  const t = useTranslations('fridayTable')
  const tTry = useTranslations('tryBots')
  const tCommon = useTranslations('common')
  const tErr = useTranslations('onlineLobby.errors')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { user, refresh, setPlayMode } = useAuth()
  const { room, createRoom, joinRoom, error: roomError } = useOnlineRoom()

  const [now, setNow] = useState<Date | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [table, setTable] = useState<FridayTableSeat | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Échec de createRoom / joinRoom : leur message (déjà traduit) vit dans
  // l'état du salon, mis à jour APRÈS l'appel — on le lit au rendu, pas dans
  // la closure.
  const [roomFailed, setRoomFailed] = useState(false)
  const [guestOpen, setGuestOpen] = useState(false)
  const [pseudo, setPseudo] = useState('')
  // « Masquer ce rendez-vous » démonte le bandeau sous le focus : une ligne
  // d'état invisible le reçoit (comme FirstStepsCard), sinon le clavier et le
  // lecteur d'écran retombaient en haut de page.
  const [justDismissed, setJustDismissed] = useState(false)
  const dismissedRef = useRef<HTMLParagraphElement>(null)
  const mountedRef = useRef(true)

  // Montage : l'heure et le masquage se lisent dans le navigateur seulement.
  useEffect(() => {
    mountedRef.current = true
    setNow(new Date())
    try {
      setDismissedKey(getSafeStorage()?.getItem(FRIDAY_TABLE_DISMISS_KEY) ?? null)
    } catch {
      // stockage indisponible : le bandeau reste affiché
    }
    const id = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(id)
    }
  }, [])

  const status = now ? fridayTableStatus(now) : null
  const live = status?.live === true
  const weekKey = status ? fridayTableWeekKey(status) : null
  const hidden = !status || isTvPath(pathname) || dismissedKey === weekKey

  useEffect(() => {
    if (justDismissed) dismissedRef.current?.focus({ preventScroll: true })
  }, [justDismissed])

  /**
   * Lit la table du moment. `fresh` contourne le cache navigateur (5 s) :
   * c'est la revérification faite juste avant d'ouvrir une table, pour
   * s'asseoir à celle qu'un autre vient d'ouvrir plutôt que d'en doubler.
   * Un échec réseau garde l'état connu : le bandeau ne doit jamais casser.
   */
  const fetchTable = useCallback(
    async (fresh = false): Promise<FridayTableSeat | null> => {
      try {
        const res = await fetch(`/api/online/friday-table?lang=${encodeURIComponent(locale)}`, {
          cache: fresh ? 'no-store' : 'default',
        })
        if (!res.ok) throw new Error(`friday-table ${res.status}`)
        const data = (await res.json()) as Partial<FridayTableResponse> | null
        const next = data?.table && isTableCode(data.table.code) ? data.table : null
        if (mountedRef.current) {
          setTable(next)
          setChecked(true)
        }
        return next
      } catch {
        // Réponse illisible ou réseau coupé : on garde la table connue, mais
        // le bouton se libère — « Ouvrir » revérifie de toute façon.
        if (mountedRef.current) setChecked(true)
        return null
      }
    },
    [locale]
  )

  // Sondage léger, PENDANT la soirée seulement, et jamais onglet caché : la
  // liste se rafraîchit au retour sur l'onglet.
  useEffect(() => {
    if (!live || hidden) return
    const poll = () => {
      if (document.visibilityState === 'hidden') return
      void fetchTable()
    }
    poll()
    const id = window.setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [live, hidden, fetchTable])

  if (justDismissed && hidden) {
    return (
      <p ref={dismissedRef} tabIndex={-1} role="status" className="sr-only">
        {t('dismissed')}
      </p>
    )
  }
  if (!status || hidden || !weekKey) return null

  const dismiss = () => {
    try {
      getSafeStorage()?.setItem(FRIDAY_TABLE_DISMISS_KEY, weekKey)
    } catch {
      // stockage indisponible : masqué pour cette visite seulement
    }
    setJustDismissed(true)
    setDismissedKey(weekKey)
  }

  const dismissButton = (
    <button
      type="button"
      onClick={dismiss}
      aria-label={t('dismiss')}
      title={t('dismiss')}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  )

  // Heures dans le FUSEAU DU VISITEUR (Intl sans timeZone) : le rendez-vous
  // est fixé à Paris, mais chacun le lit à sa montre.
  const startsAt = new Date(status.startsAt)
  const timeFormat = clockFormat(locale)

  if (!live) {
    const dayFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    // Le jour même (à la montre du visiteur), « aujourd'hui » plutôt que le
    // nom du jour ; et jamais « ce soir » : à Montréal, 21 h à Paris tombe à 15 h.
    const today = now !== null && dayFormat.format(now) === dayFormat.format(startsAt)
    const time = timeFormat.format(startsAt)
    const text = today
      ? t('nextToday', { time })
      : t('next', { day: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(startsAt), time })
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-gold/20 py-0.5 pl-3 pr-0.5">
        <CalendarClock className="h-4 w-4 shrink-0 text-gold/70" aria-hidden />
        <p className="min-w-0 flex-1 py-2 text-xs leading-snug text-white/60">{text}</p>
        {dismissButton}
      </div>
    )
  }

  // Déjà assis à une table publique d'Imposteur (celle qu'il vient d'ouvrir,
  // revenu au hub) : on le renvoie à SA table, surtout pas vers une autre —
  // ouvrir ou rejoindre une salle quitte la précédente.
  const seatedHere =
    room !== null && room.gameId === FRIDAY_TABLE.gameId && room.visibility === 'public'

  /**
   * S'asseoir à la table `code`, session ouverte. Un joueur en mode local
   * passe d'abord en ligne (la page du jeu n'affiche le lobby qu'en ligne).
   * Échec (table lancée ou pleine entre deux sondages, réseau) : l'erreur
   * s'affiche ICI et la table du moment est relue — le bouton propose alors
   * la suivante, ou l'ouverture. Rend vrai si l'on part vers la table.
   */
  const joinTable = async (code: string): Promise<boolean> => {
    if (user && user.playMode !== 'online') {
      if (await setPlayMode('online')) {
        setError(tTry('error'))
        return false
      }
    }
    const joined = await joinRoom({ code })
    if (!joined) {
      setRoomFailed(true)
      void fetchTable(true)
      return false
    }
    const joinedGame = GAMES.find((g) => g.id === joined.gameId)
    router.push(joinedGame?.path ?? GAME_PATH)
    return true
  }

  /** « Rejoindre la table » avec une session : la jonction se fait ici. */
  const joinCurrentTable = async (code: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setRoomFailed(false)
    try {
      await joinTable(code)
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  /** Nouvelle table publique : revérifie d'abord, puis passe par le chemin de la session. */
  const openTable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setRoomFailed(false)
    try {
      const fresh = await fetchTable(true)
      if (fresh && user) {
        // Quelqu'un vient de l'ouvrir : on s'y assoit plutôt que d'en doubler.
        await joinTable(fresh.code)
        return
      }
      if (fresh) {
        router.push(`/jeux?join=${fresh.code}`)
        return
      }
      if (!user) {
        // Pas de session : pseudo d'invité d'abord. La déclaration 18+ se
        // fait AVANT le formulaire (sinon /api/auth/guest refuse, 403) —
        // immédiate si le cookie existe déjà.
        if (await requestAgeVerification()) setGuestOpen(true)
        return
      }
      if (user.playMode !== 'online') {
        // Un joueur en mode local ouvre une table EN LIGNE : la page du jeu
        // n'affiche le lobby qu'en mode en ligne.
        if (await setPlayMode('online')) {
          setError(tTry('error'))
          return
        }
      }
      const created = await createRoom(FRIDAY_TABLE.gameId, { visibility: 'public' })
      if (!created) {
        setRoomFailed(true)
        return
      }
      router.push(GAME_PATH)
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  /**
   * Les routes répondent par des CODES : traduits ici, comme TryBotsGate. Les
   * deux codes à trou ({count}) ne peuvent pas sortir de ces routes.
   */
  const showApiError = (raw: unknown) => {
    const code = resolveOnlineErrorCode(typeof raw === 'string' ? raw : undefined)
    setError(code && code !== 'min_players' && code !== 'max_players' ? tErr(code) : tTry('error'))
  }

  /** Chemin invité : compte invité → (revérification) → table publique → lobby, en navigation DOCUMENT. */
  const openAsGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    const trimmed = pseudo.trim()
    const validation = validateAccountDisplayName(trimmed)
    if (!validation.ok) {
      void reportProfanityIfNeeded(trimmed, validation.reason, 'guest')
      setError(tCommon(`nameValidation.${nameValidationI18nKey(validation.reason)}`))
      return
    }
    setBusy(true)
    let leaving = false
    try {
      const guestRes = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Ambiance de l'appareil : dans l'app, un invité sans choix naît
        // « Sans alcool » (politique Google Play) ; le compte prime ensuite.
        body: JSON.stringify({ displayName: trimmed, locale, ambianceMode: readLocalAmbianceMode() }),
      })
      const guestData = await guestRes.json().catch(() => null)
      if (guestRes.status === 403 && guestData?.code === 'age_gate_required') {
        // Cookie d'âge disparu entre-temps : la porte 18+ se rouvre, le
        // pseudo reste, un nouveau clic relance — rien ne se crée à l'insu
        // du visiteur.
        void requestAgeVerification()
        return
      }
      if (guestData?.code === 'rate_limited') {
        const seconds = typeof guestData.retryAfterSec === 'number' ? guestData.retryAfterSec : 60
        setError(tTry('rateLimited', { seconds }))
        return
      }
      if (!guestRes.ok) {
        showApiError(guestData?.error)
        return
      }
      if (isExistingAccountResponse(guestData)) {
        // Session déjà valide (la page la croyait absente) : rien de créé.
        // Le bandeau la retrouve et repasse par le chemin du compte au
        // prochain clic — jamais de table ouverte d'office.
        await refresh()
        setGuestOpen(false)
        return
      }
      // Pendant la saisie du pseudo, quelqu'un a pu ouvrir la table.
      const fresh = await fetchTable(true)
      if (fresh) {
        leaving = true
        window.location.assign(`/${locale}/jeux?join=${fresh.code}`)
        return
      }
      const roomRes = await fetch('/api/online/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameId: FRIDAY_TABLE.gameId, visibility: 'public' }),
      })
      const roomData = await roomRes.json().catch(() => null)
      if (!roomRes.ok || !roomData?.room?.id) {
        showApiError(roomData?.error)
        return
      }
      // Navigation DOCUMENT : routeur vierge et session fraîche visible du
      // middleware (même raison que TryBotsGate et AuthForm).
      leaving = true
      window.location.assign(`/${locale}${GAME_PATH}`)
    } catch {
      setError(tTry('error'))
    } finally {
      if (!leaving && mountedRef.current) setBusy(false)
    }
  }

  const ctaClass =
    'h-12 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-base font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-orange-500 disabled:opacity-50'

  const shownError = error ?? (roomFailed ? (roomError ?? tTry('error')) : null)

  let subtitle: string
  if (seatedHere) subtitle = t('live.seated')
  else if (table) subtitle = t('live.waiting', { count: table.players })
  else if (checked) subtitle = t('live.empty')
  else subtitle = tCommon('loading')

  return (
    <section
      aria-label={t('label')}
      className="mb-4 rounded-2xl border border-gold/30 bg-felt-deep/70 p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
          <GameIconById id={FRIDAY_TABLE.gameId} className="h-5 w-5 text-gold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold/80">
            <LivePulse />
            <span className="truncate">{t('live.kicker', { time: timeFormat.format(new Date(status.endsAt)) })}</span>
          </p>
          <h2 className="mt-0.5 font-display text-lg font-bold leading-tight text-cream">{t('live.title')}</h2>
          {/* aria-live : le nombre de joueurs qui attendent change au fil des sondages. */}
          <p className="mt-1 flex items-start gap-1.5 text-sm leading-snug text-white/60" aria-live="polite">
            {table && !seatedHere && <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" aria-hidden />}
            <span>{subtitle}</span>
          </p>
        </div>
        {dismissButton}
      </div>

      <div className="mt-3">
        {seatedHere ? (
          <Button asChild className={ctaClass}>
            <Link href={GAME_PATH}>{t('backToTable')}</Link>
          </Button>
        ) : table && user ? (
          <Button
            type="button"
            onClick={() => void joinCurrentTable(table.code)}
            disabled={busy}
            aria-busy={busy || undefined}
            className={ctaClass}
          >
            <Users className="mr-2 h-4 w-4" aria-hidden />
            {busy ? t('joining') : t('join')}
          </Button>
        ) : table ? (
          <Button asChild className={ctaClass}>
            <Link href={`/jeux?join=${table.code}`}>
              <Users className="mr-2 h-4 w-4" aria-hidden />
              {t('join')}
            </Link>
          </Button>
        ) : guestOpen && !user ? (
          <form onSubmit={openAsGuest} className="space-y-2.5">
            <Input
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder={tTry('pseudoPlaceholder')}
              aria-label={tTry('pseudoPlaceholder')}
              maxLength={30}
              required
              autoFocus
              className="h-12 border-white/10 bg-white/[0.05] text-center text-white"
            />
            <Button type="submit" disabled={busy || pseudo.trim().length === 0} className={ctaClass}>
              <DoorOpen className="mr-2 h-4 w-4" aria-hidden />
              {busy ? t('opening') : t('open')}
            </Button>
            <p className="text-center text-xs leading-snug text-white/40">{tTry('guestHintDevice')}</p>
            <button
              type="button"
              onClick={() => {
                setGuestOpen(false)
                setError(null)
              }}
              disabled={busy}
              className="min-h-[44px] w-full text-center text-xs text-white/40 underline underline-offset-2 transition-colors hover:text-white/70"
            >
              {tCommon('cancel')}
            </button>
          </form>
        ) : (
          <Button type="button" onClick={() => void openTable()} disabled={busy || !checked} className={ctaClass}>
            <DoorOpen className="mr-2 h-4 w-4" aria-hidden />
            {busy ? t('opening') : t('open')}
          </Button>
        )}
      </div>

      {shownError && (
        <p role="alert" className="mt-2 rounded-lg bg-red-500/[0.15] px-3 py-2 text-sm text-red-300">
          {shownError}
        </p>
      )}
    </section>
  )
}
