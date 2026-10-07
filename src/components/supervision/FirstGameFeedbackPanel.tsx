'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, MessageSquare, RefreshCw, Star } from 'lucide-react'
import { EmptyState, ErrorState, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { BarList, type BarListRow } from '@/components/supervision/charts'
import { GameIconById } from '@/components/hub/GameIconById'
import { GAMES } from '@/lib/games'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import {
  STAR_COUNT,
  distributionRows,
  filledStars,
  isFirstGamePlayMode,
  parseFirstGameFeedbackSummary,
  type FirstGameFeedbackSummary,
} from '@/lib/supervision/first-game-ratings'
import { cn } from '@/lib/utils'

/**
 * « Avis après la 1re partie » : la note en un geste demandée à chaque
 * joueur à la fin de sa toute première partie (POST /api/feedback/first-game),
 * résumée par GET /api/admin/first-game-feedback.
 *
 * Pourquoi un panneau à part plutôt que la boîte des retours : la plupart de
 * ces avis n'ont PAS de commentaire — une note seule n'a rien à trier, et dix
 * « 4 étoiles » sans texte noieraient les vrais bugs. Ils sont donc exclus de
 * la boîte (FEEDBACK_INBOX_WHERE) et ne vivent qu'ici, agrégés ; ceux qui
 * portent un commentaire restent AUSSI dans la boîte, pour être lus et traités.
 *
 * Panneau AUTONOME, hors de la boucle de rafraîchissement de 15 s (F40),
 * comme les plantages côté joueur : il se charge à l'ouverture de l'onglet
 * (Radix démonte l'onglet fermé) et l'exploitant le recharge à la main. Une
 * moyenne qui bouge d'un avis par jour n'a pas à être relue toutes les 15 s.
 */

/** Libellé de bloc : petites capitales crème, comme les plaques de la Salle. */
const BLOCK_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-cream/70'

/**
 * Commentaires visibles avant le dépli. Le panneau est posé AU-DESSUS de la
 * boîte de tri : dix commentaires de 1 000 caractères repousseraient les
 * retours à traiter à plusieurs écrans de téléphone.
 */
const COMMENTS_PREVIEW = 3

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
 * Ligne « note · jeu · mode » d'un avis de 1re partie : partagée par la boîte
 * des retours (liste et détail) et par les commentaires du panneau. Que des
 * `span` : la ligne se pose aussi DANS le bouton d'une entrée de liste, où un
 * `div` n'a pas sa place.
 */
export function FirstGameFeedbackMeta({
  rating,
  gameId,
  playMode,
  size = 'sm',
  className,
}: {
  rating: number | null | undefined
  gameId: string | null | undefined
  playMode: string | null | undefined
  size?: 'sm' | 'lg'
  className?: string
}) {
  const t = useTranslations('supervision.feedback')
  const gameTitle = useGameTitle()
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {typeof rating === 'number' && <RatingStars rating={rating} size={size} />}
      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-cream/90">
        {gameId && (
          <span aria-hidden>
            <GameIconById id={gameId} className="h-4 w-4 shrink-0 text-gold" />
          </span>
        )}
        <span className="min-w-0 truncate">{gameId ? gameTitle(gameId) : t('unknownGame')}</span>
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

export function FirstGameFeedbackPanel() {
  const t = useTranslations('supervision.firstGameFeedback')
  const tStates = useTranslations('supervision.states')
  const format = useFormatter()
  const gameTitle = useGameTitle()
  const formatRating = useRatingFormatter()
  const [summary, setSummary] = useState<FirstGameFeedbackSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllComments, setShowAllComments] = useState(false)
  const commentsId = useId()

  const tRef = useRef(t)
  tRef.current = t
  // Requête en vol : un second clic sur « Actualiser » l'annule au lieu de
  // laisser deux réponses se doubler, et le démontage (onglet quitté) aussi.
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch('/api/admin/first-game-feedback', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      // Pas de `body.error` : adminErrorResponse le rédige en français quelle
      // que soit la langue. 403 = session expirée ou grade retiré pendant que
      // l'onglet restait ouvert.
      if (!res.ok) throw new Error(tRef.current(res.status === 403 ? 'forbidden' : 'loadError'))
      // Réponse d'un serveur antérieur à la route, ou page d'erreur du proxy :
      // une erreur, jamais un résumé vide qui ferait croire à zéro avis.
      const parsed = parseFirstGameFeedbackSummary(body)
      if (!parsed) throw new Error(tRef.current('loadError'))
      setSummary(parsed)
      setError(null)
    } catch (e) {
      if (controller.signal.aborted) return
      // TypeError = échec réseau de fetch (« Failed to fetch », en anglais
      // quelle que soit la langue) : le message traduit dit la même chose.
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('loadError'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load])

  // Langue de la Supervision et heure de Paris, comme le reste de la page.
  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load()}
      aria-busy={loading}
      // 44 px au doigt (téléphone), le gabarit compact des autres panneaux au-delà.
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-medium text-cream/80 transition-colors hover:bg-white/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 sm:h-8 sm:px-2.5"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'motion-safe:animate-spin')} aria-hidden />
      {t('refresh')}
    </button>
  )

  const comments = summary?.recentComments ?? []
  const visibleComments = showAllComments ? comments : comments.slice(0, COMMENTS_PREVIEW)

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
    <SectionCard icon={Star} title={t('title')} description={t('desc')} actions={refreshButton}>
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !summary ? (
        <SkeletonRows rows={3} />
      ) : summary.total === 0 ? (
        <EmptyState icon={Star} title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <div className="space-y-5">
          {/* Le chiffre qu'on vient chercher, en grand ; la période récente à côté. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-gold/30 bg-felt-deep/60 p-4">
              <p className={BLOCK_LABEL}>{t('averageLabel')}</p>
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
              <p className="mt-1.5 text-xs text-cream/70">{t('totalCount', { count: summary.total })}</p>
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
              <h3 className={cn(BLOCK_LABEL, 'mb-1')}>{t('byGameTitle')}</h3>
              <p className="mb-2 text-[11px] leading-snug text-cream/70">{t('byGameHint')}</p>
              {summary.byGame.length === 0 ? (
                <p className="py-3 text-sm text-cream/70">{t('byGameEmpty')}</p>
              ) : (
                <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/20">
                  {summary.byGame.map((game) => (
                    <li
                      key={game.gameId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-cream/90">
                        <span aria-hidden>
                          <GameIconById id={game.gameId} className="h-4 w-4 shrink-0 text-gold" />
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
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className={cn(BLOCK_LABEL, 'mb-2')}>{t('commentsTitle')}</h3>
            {comments.length === 0 ? (
              <EmptyState icon={MessageSquare} title={t('commentsEmpty')} />
            ) : (
              <ul id={commentsId} className="space-y-2">
                {visibleComments.map((comment) => (
                  <li key={comment.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <FirstGameFeedbackMeta
                        rating={comment.rating}
                        gameId={comment.gameId}
                        playMode={comment.playMode}
                      />
                      <time dateTime={comment.createdAt} className="shrink-0 text-xs text-cream/70">
                        {formatDate(comment.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-cream/90">{comment.comment}</p>
                  </li>
                ))}
              </ul>
            )}
            {comments.length > COMMENTS_PREVIEW && (
              <button
                type="button"
                aria-expanded={showAllComments}
                aria-controls={commentsId}
                onClick={() => setShowAllComments((open) => !open)}
                className="mt-2 inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-gold transition-colors hover:bg-cream/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                {showAllComments ? t('commentsCollapse') : t('commentsShowAll', { count: comments.length })}
              </button>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
