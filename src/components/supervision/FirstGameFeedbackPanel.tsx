'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, RefreshCw, Star, Users, Wine } from 'lucide-react'
import { EmptyState, ErrorState, Pager, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { BarList, type BarListRow } from '@/components/supervision/charts'
import { GameIconById } from '@/components/hub/GameIconById'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link } from '@/i18n/navigation'
import { GAMES } from '@/lib/games'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import {
  STAR_COUNT,
  distributionRows,
  filledStars,
  isFirstGamePlayMode,
  parseFirstGameFeedbackSummary,
  parseFirstGameReviewsPage,
  type FirstGameFeedbackSummary,
  type FirstGameReviewAuthor,
  type FirstGameReviewsPage,
} from '@/lib/supervision/first-game-ratings'
import { cn } from '@/lib/utils'

/**
 * « Avis après la 1re partie » : la note en un geste demandée à chaque
 * joueur à la fin de sa toute première partie (POST /api/feedback/first-game),
 * résumée par GET /api/admin/first-game-feedback, puis listée avis par avis,
 * auteur compris, par GET /api/admin/first-game-feedback/reviews.
 *
 * Pourquoi un panneau à part plutôt que la boîte des retours : la plupart de
 * ces avis n'ont PAS de commentaire — une note seule n'a rien à trier, et dix
 * « 4 étoiles » sans texte noieraient les vrais bugs. Ils sont donc exclus de
 * la boîte (FEEDBACK_INBOX_WHERE) et ne vivent qu'ici ; ceux qui portent un
 * commentaire restent AUSSI dans la boîte, pour être lus et traités.
 *
 * Panneau AUTONOME, hors de la boucle de rafraîchissement de 15 s (F40),
 * comme les plantages côté joueur : il se charge à l'ouverture de l'onglet
 * (Radix démonte l'onglet fermé) et l'exploitant le recharge à la main. Une
 * moyenne qui bouge d'un avis par jour n'a pas à être relue toutes les 15 s.
 */

/**
 * `soiree` : les votes du Mode Soirée (POST /api/feedback/soiree), au même
 * format. La note de la soirée entière fait le chiffre principal, la moyenne
 * par jeu vient des votes d'entracte, et « Qui a noté quoi » liste les deux.
 * Seuls les libellés propres changent (supervision.soireeFeedback) ; le reste
 * reprend ceux de l'avis de 1re partie.
 */
export type RatedFeedbackKind = 'firstGame' | 'soiree'

/** Résumé de chaque panneau ; sa liste d'avis un par un est servie par `<résumé>/reviews`. */
const SUMMARY_ENDPOINT: Record<RatedFeedbackKind, string> = {
  firstGame: '/api/admin/first-game-feedback',
  soiree: '/api/admin/soiree-feedback',
}

/** Libellé de bloc : petites capitales crème, comme les plaques de la Salle. */
const BLOCK_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-cream/70'

/**
 * Avis par page dans « Qui a noté quoi ». Le panneau est posé AU-DESSUS de
 * la boîte de tri : une page plus longue repousserait les retours à traiter
 * de plusieurs écrans de téléphone.
 */
const REVIEWS_PAGE_SIZE = 10

/**
 * Choix du filtre qui ne sont pas un jeu : tout, ou les votes de la soirée
 * entière (sans jeu). Radix Select refuse la chaîne vide, et l'astérisque
 * n'entre dans aucun identifiant de jeu.
 */
const ALL_SUBJECTS = '*'
const NIGHT_SUBJECT = '*night'

/**
 * Titre traduit d'un jeu ; repli sur le catalogue puis sur l'identifiant —
 * même règle que la fiche compte (titres « avec alcool » : la Supervision
 * nomme les jeux, elle ne suit pas l'ambiance de l'appareil).
 */
function useGameTitle() {
  const t = useTranslations('games.catalog')
  return (gameId: string): string => {
    const key = `${gameId}.title`
    return t.has(key) ? t(key) : (GAMES.find((g) => g.id === gameId)?.title ?? gameId)
  }
}

/** Moyenne à une décimale, à la manière de la langue (« 4,3 » / « 4.3 »). */
function useRatingFormatter() {
  const format = useFormatter()
  return (value: number) => format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Note en étoiles : ★ pleines en or, ☆ vides en crème estompé — la FORME
 * change aussi, la couleur n'est jamais le seul canal. Une moyenne s'arrondit
 * à l'étoile la plus proche ; la valeur exacte est dans l'aria-label
 * (« Note : 4,3 sur 5 »), lu à la place des cinq glyphes.
 * `decorative` : la note est déjà écrite juste à côté, les étoiles ne sont
 * alors qu'un repère et le lecteur d'écran ne la lit pas deux fois.
 */
export function RatingStars({
  rating,
  size = 'sm',
  decorative = false,
  className,
}: {
  rating: number
  size?: 'sm' | 'lg'
  decorative?: boolean
  className?: string
}) {
  const t = useTranslations('supervision.feedback')
  const format = useFormatter()
  const filled = filledStars(rating)
  const label = t('ratingLabel', { rating: format.number(rating, { maximumFractionDigits: 1 }) })
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex shrink-0 items-center leading-none tracking-[0.08em]',
        size === 'lg' ? 'text-2xl' : 'text-sm',
        className
      )}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <span key={i} aria-hidden className={i < filled ? 'text-gold' : 'text-cream/40'}>
          {i < filled ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

/**
 * Ligne « note · jeu · mode » d'un avis noté : partagée par la boîte des
 * retours (liste et détail) et par la liste des avis du panneau. Que des
 * `span` : la ligne se pose aussi DANS le bouton d'une entrée de liste, où un
 * `div` n'a pas sa place. `showValue` écrit la note en chiffres à côté des
 * étoiles (« 4/5 ») : cinq glyphes se comptent mal d'un coup d'œil.
 */
export function FirstGameFeedbackMeta({
  rating,
  gameId,
  playMode,
  noGameLabel,
  size = 'sm',
  showValue = false,
  className,
}: {
  rating: number | null | undefined
  gameId: string | null | undefined
  playMode: string | null | undefined
  /** Ce que la note juge quand elle ne porte sur aucun jeu (la soirée entière) ; « jeu inconnu » sinon. */
  noGameLabel?: string
  size?: 'sm' | 'lg'
  showValue?: boolean
  className?: string
}) {
  const t = useTranslations('supervision.feedback')
  const gameTitle = useGameTitle()
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {typeof rating === 'number' &&
        (showValue ? (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <RatingStars rating={rating} size={size} />
            {/* Valeur lue une fois, par l'aria-label des étoiles. */}
            <span aria-hidden className="text-sm font-semibold tabular-nums text-cream">
              {t('ratingValue', { rating })}
            </span>
          </span>
        ) : (
          <RatingStars rating={rating} size={size} />
        ))}
      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-cream/90">
        {gameId && (
          <span aria-hidden>
            <GameIconById id={gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
          </span>
        )}
        <span className="min-w-0 truncate">{gameId ? gameTitle(gameId) : (noGameLabel ?? t('unknownGame'))}</span>
      </span>
      {/* Mode inconnu (valeur hors contrat) : rien plutôt qu'un identifiant brut. */}
      {isFirstGamePlayMode(playMode) && (
        <span className="inline-flex shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-1.5 py-px text-[11px] font-medium text-cream/80">
          {t(`playMode.${playMode}`)}
        </span>
      )}
    </span>
  )
}

/**
 * Auteur d'un avis : le pseudo du compte, lien vers sa fiche (seul l'id
 * voyage dans l'URL) ; sinon ce qu'on sait de son absence, en italique.
 */
function ReviewAuthor({ author, anonymousLabel }: { author: FirstGameReviewAuthor; anonymousLabel: string }) {
  const t = useTranslations('supervision.firstGameFeedback')
  const tSupervision = useTranslations('supervision')
  if (author.kind !== 'account') {
    return (
      <span className="min-w-0 text-sm italic text-cream/70">
        {author.kind === 'deleted' ? t('authorDeleted') : anonymousLabel}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={`/supervision/comptes/${encodeURIComponent(author.userId)}`}
        title={tSupervision('accounts.openFileOf', { name: author.name })}
        className="min-w-0 break-words text-sm font-semibold text-cream underline decoration-cream/30 underline-offset-2 transition-colors hover:decoration-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        {author.name}
      </Link>
      {author.isGuest && (
        <span className="inline-flex shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-1.5 py-px text-[11px] font-medium text-cream/80">
          {t('authorGuest')}
        </span>
      )}
    </span>
  )
}

/**
 * « Qui a noté quoi » : chaque avis avec son auteur, sa note, son jeu et son
 * commentaire, le plus récent d'abord, une page à la fois. `subject` : tout
 * (ALL_SUBJECTS), la soirée entière (NIGHT_SUBJECT) ou l'identifiant d'un jeu.
 * Monté sous une clé égale au filtre : en changer repart d'une page 1 vierge.
 * `refreshToken` change quand l'exploitant clique « Actualiser » : la page en
 * cours se relit.
 */
function RatedReviewsList({
  kind,
  subject,
  refreshToken,
}: {
  kind: RatedFeedbackKind
  subject: string
  refreshToken: number
}) {
  const t = useTranslations('supervision.firstGameFeedback')
  const tSoiree = useTranslations('supervision.soireeFeedback')
  const tFeedback = useTranslations('supervision.feedback')
  const tk = kind === 'soiree' ? tSoiree : t
  const tStates = useTranslations('supervision.states')
  const format = useFormatter()
  const gameTitle = useGameTitle()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FirstGameReviewsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const endpoint = `${SUMMARY_ENDPOINT[kind]}/reviews`

  const tRef = useRef({ t, tk })
  tRef.current = { t, tk }
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (target: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(target), pageSize: String(REVIEWS_PAGE_SIZE) })
        if (subject === NIGHT_SUBJECT) params.set('scope', 'night')
        else if (subject !== ALL_SUBJECTS) params.set('gameId', subject)
        const res = await fetch(`${endpoint}?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(res.status === 403 ? tRef.current.t('forbidden') : tRef.current.tk('reviewsLoadError'))
        }
        const parsed = parseFirstGameReviewsPage(body)
        if (!parsed) throw new Error(tRef.current.tk('reviewsLoadError'))
        // Page vidée entre deux lectures (compte invité purgé, par exemple) :
        // on retombe sur la dernière page qui existe, pas sur « aucun avis ».
        const lastPage = Math.max(1, Math.ceil(parsed.total / REVIEWS_PAGE_SIZE))
        if (target > lastPage) {
          setPage(lastPage)
          return
        }
        setData(parsed)
        setError(null)
      } catch (e) {
        if (controller.signal.aborted) return
        setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current.tk('reviewsLoadError'))
      } finally {
        if (abortRef.current === controller) setLoading(false)
      }
    },
    [endpoint, subject]
  )

  useEffect(() => {
    void load(page)
    return () => {
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load, page, refreshToken])

  if (error) {
    return <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load(page)} />
  }
  if (!data) return <SkeletonRows rows={3} />

  const total = data.total
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE))
  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })
  const countLabel =
    subject === ALL_SUBJECTS
      ? tk('reviewsCount', { count: total })
      : subject === NIGHT_SUBJECT
        ? tSoiree('reviewsCountNight', { count: total })
        : tk('reviewsCountFor', { count: total, game: gameTitle(subject) })

  return (
    <div className="space-y-2">
      <p aria-live="polite" className="text-xs text-cream/70">
        {countLabel}
      </p>
      {data.reviews.length === 0 ? (
        <EmptyState icon={Users} title={tk('reviewsEmpty')} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {data.reviews.map((review) => (
            <li key={review.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <ReviewAuthor author={review.author} anonymousLabel={tk('authorAnonymous')} />
                <time dateTime={review.createdAt} className="shrink-0 text-xs text-cream/70">
                  {formatDate(review.createdAt)}
                </time>
              </div>
              <FirstGameFeedbackMeta
                rating={review.rating}
                gameId={review.gameId}
                // Une soirée se joue toujours en local : le mode n'apprendrait rien.
                playMode={kind === 'soiree' ? null : review.playMode}
                noGameLabel={kind === 'soiree' ? tFeedback('soireeSubject') : undefined}
                showValue
                className="mt-1.5"
              />
              {review.comment.trim() !== '' && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-cream/90">{review.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={page}
        pageSize={REVIEWS_PAGE_SIZE}
        total={total}
        onPage={setPage}
        busy={loading}
        summary={tStates('pageSummary', { page, pages, total })}
        previousLabel={tStates('previousPage')}
        nextLabel={tStates('nextPage')}
      />
    </div>
  )
}

export function FirstGameFeedbackPanel({ kind = 'firstGame' }: { kind?: RatedFeedbackKind }) {
  const t = useTranslations('supervision.firstGameFeedback')
  const tSoiree = useTranslations('supervision.soireeFeedback')
  // Libellés propres au résumé affiché ; les autres sont communs.
  const tk = kind === 'soiree' ? tSoiree : t
  const tStates = useTranslations('supervision.states')
  const gameTitle = useGameTitle()
  const formatRating = useRatingFormatter()
  const [summary, setSummary] = useState<FirstGameFeedbackSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(ALL_SUBJECTS)
  const [refreshToken, setRefreshToken] = useState(0)
  const filterLabelId = useId()
  const filterTriggerId = useId()
  const reviewsHeadingRef = useRef<HTMLHeadingElement>(null)
  const endpoint = SUMMARY_ENDPOINT[kind]
  const Icon = kind === 'soiree' ? Wine : Star

  const tRef = useRef({ t, tk })
  tRef.current = { t, tk }
  // Requête en vol : un second clic sur « Actualiser » l'annule au lieu de
  // laisser deux réponses se doubler, et le démontage (onglet quitté) aussi.
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      // Pas de `body.error` : la route le rédige en français ou en code, quelle
      // que soit la langue. 403 = session expirée ou grade retiré pendant que
      // l'onglet restait ouvert.
      if (!res.ok) throw new Error(res.status === 403 ? tRef.current.t('forbidden') : tRef.current.tk('loadError'))
      // Réponse d'un serveur antérieur à la route, ou page d'erreur du proxy :
      // une erreur, jamais un résumé vide qui ferait croire à zéro avis.
      const parsed = parseFirstGameFeedbackSummary(body)
      if (!parsed) throw new Error(tRef.current.tk('loadError'))
      setSummary(parsed)
      setError(null)
    } catch (e) {
      if (controller.signal.aborted) return
      // TypeError = échec réseau de fetch (« Failed to fetch », en anglais
      // quelle que soit la langue) : le message traduit dit la même chose.
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current.tk('loadError'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    void load()
    return () => {
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load])

  const refresh = () => {
    void load()
    setRefreshToken((n) => n + 1)
  }

  // Côté soirée, `total` ne compte que les votes de la soirée entière : ceux
  // d'entracte sont dans `byGame`. L'avis de 1re partie porte toujours sur une
  // partie, et son `total` les compte tous.
  const nightCount = kind === 'soiree' ? (summary?.total ?? 0) : 0
  const allCount =
    kind === 'soiree'
      ? nightCount + (summary?.byGame.reduce((sum, game) => sum + game.count, 0) ?? 0)
      : (summary?.total ?? 0)

  // Choix qui n'a plus d'avis après « Actualiser » : retour à tout, plutôt
  // qu'une liste vide sous un choix absent du menu.
  const subjectListed =
    subject === ALL_SUBJECTS ||
    (subject === NIGHT_SUBJECT ? nightCount > 0 : Boolean(summary?.byGame.some((game) => game.gameId === subject)))
  const activeSubject = subjectListed ? subject : ALL_SUBJECTS

  /**
   * Un jeu touché dans « Moyenne par jeu » filtre la liste des avis (un second
   * toucher la rend à tous les avis). Au téléphone la liste est plus bas : on
   * l'amène en vue, sans bouger la page si son titre est déjà à l'écran.
   */
  const showGameReviews = (gameId: string) => {
    const next = activeSubject === gameId ? ALL_SUBJECTS : gameId
    setSubject(next)
    const heading = reviewsHeadingRef.current
    if (next === ALL_SUBJECTS || !heading) return
    const top = heading.getBoundingClientRect().top
    if (top >= 0 && top <= window.innerHeight * 0.6) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    heading.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      aria-busy={loading}
      // 44 px au doigt (téléphone), le gabarit compact des autres panneaux au-delà.
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 sm:h-8 sm:px-2.5"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'motion-safe:animate-spin')} aria-hidden />
      {t('refresh')}
    </button>
  )

  const distribution: BarListRow[] = summary
    ? distributionRows(summary.distribution).map(({ rating, count }) => ({
        key: String(rating),
        label: (
          <>
            <span aria-hidden className="mr-1 text-gold">
              ★
            </span>
            {t('stars', { count: rating })}
          </>
        ),
        value: count,
      }))
    : []

  return (
    <SectionCard icon={Icon} title={tk('title')} description={tk('desc')} actions={refreshButton}>
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !summary ? (
        <SkeletonRows rows={3} />
      ) : summary.total === 0 && summary.byGame.length === 0 ? (
        <EmptyState icon={Icon} title={tk('empty')} hint={tk('emptyHint')} />
      ) : (
        <div className="space-y-5">
          {/* Le chiffre qu'on vient chercher, en grand ; la période récente à côté. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-gold/30 bg-felt-deep/60 p-4">
              <p className={BLOCK_LABEL}>{tk('averageLabel')}</p>
              {summary.average !== null ? (
                <>
                  {/* Valeur lue une fois, par l'aria-label des étoiles. */}
                  <p aria-hidden className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-bold tabular-nums text-gold">
                      {formatRating(summary.average)}
                    </span>
                    <span className="text-sm text-cream/70">{t('outOf')}</span>
                  </p>
                  <RatingStars rating={summary.average} size="lg" className="mt-1.5" />
                </>
              ) : (
                <p className="mt-1 font-display text-5xl font-bold text-gold">—</p>
              )}
              <p className="mt-1.5 text-xs text-cream/70">{tk('totalCount', { count: summary.total })}</p>
            </div>

            <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className={BLOCK_LABEL}>{t('last30dLabel')}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-cream">
                {t('last30dCount', { count: summary.last30d.count })}
              </p>
              {summary.last30d.average !== null ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream/80">
                  <RatingStars rating={summary.last30d.average} decorative />
                  <span>{t('last30dAverage', { average: formatRating(summary.last30d.average) })}</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-cream/70">{t('last30dNoAverage')}</p>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className={cn(BLOCK_LABEL, 'mb-2')}>{t('distributionTitle')}</h3>
              <BarList
                ariaLabel={t('distributionAria', { count: summary.total })}
                rows={distribution}
                showShare
                categoryLabel={t('colRating')}
                primaryLabel={t('colCount')}
                shareLabel={t('colShare')}
              />
            </div>

            <div className="min-w-0">
              <h3 className={cn(BLOCK_LABEL, 'mb-1')}>{tk('byGameTitle')}</h3>
              <p className="mb-2 text-[11px] leading-snug text-cream/70">{tk('byGameHint')}</p>
              {summary.byGame.length === 0 ? (
                <p className="py-3 text-sm text-cream/70">{tk('byGameEmpty')}</p>
              ) : (
                <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  {summary.byGame.map((game) => {
                    const selected = activeSubject === game.gameId
                    return (
                      <li key={game.gameId}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => showGameReviews(game.gameId)}
                          className={cn(
                            'flex min-h-[44px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50',
                            selected && 'bg-gold/10'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex min-w-0 items-center gap-1.5 text-sm',
                              selected ? 'font-semibold text-gold' : 'text-cream/90'
                            )}
                          >
                            <span aria-hidden>
                              <GameIconById id={game.gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
                            </span>
                            <span className="min-w-0 truncate">{gameTitle(game.gameId)}</span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-2 text-sm tabular-nums">
                            <RatingStars rating={game.average} />
                            <span aria-hidden className="font-semibold text-cream">
                              {formatRating(game.average)}
                            </span>
                            <span className="text-xs text-cream/70">{t('ratingCount', { count: game.count })}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h3 ref={reviewsHeadingRef} className={cn(BLOCK_LABEL, 'scroll-mt-24')}>
                  {t('reviewsTitle')}
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-cream/70">{tk('reviewsHint')}</p>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span id={filterLabelId} className="shrink-0 text-xs text-cream/70">
                  {tk('reviewsFilterLabel')}
                </span>
                <Select value={activeSubject} onValueChange={setSubject}>
                  {/* Nom = libellé + choix en cours (« Jeu Loup-Garou (3) ») :
                      le bouton de Radix n'expose pas sa valeur autrement. */}
                  <SelectTrigger
                    id={filterTriggerId}
                    aria-labelledby={`${filterLabelId} ${filterTriggerId}`}
                    className="h-11 w-auto min-w-[11rem] max-w-full gap-2 border-white/15 bg-white/[0.06] text-cream sm:h-8"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SUBJECTS}>{tk('reviewsAll', { count: allCount })}</SelectItem>
                    {nightCount > 0 && (
                      <SelectItem value={NIGHT_SUBJECT}>{tSoiree('reviewsNight', { count: nightCount })}</SelectItem>
                    )}
                    {summary.byGame.map((game) => (
                      <SelectItem key={game.gameId} value={game.gameId}>
                        {t('reviewsGameOption', { game: gameTitle(game.gameId), count: game.count })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <RatedReviewsList key={activeSubject} kind={kind} subject={activeSubject} refreshToken={refreshToken} />
          </div>
        </div>
      )}
    </SectionCard>
  )
}
