/**
 * Lecture, côté Supervision, du résumé des avis de 1re partie
 * (GET /api/admin/first-game-feedback) et des notes en étoiles.
 *
 * Module PUR, sans React ni Prisma : le panneau et la boîte des retours
 * l'importent côté navigateur, et la route qui produit le résumé vit dans un
 * module serveur qu'on ne veut pas tirer dans le paquet client.
 */

/** Ordre d'affichage de la répartition : 5 étoiles en haut, comme partout ailleurs. */
export const FIRST_GAME_RATINGS_DESC = [5, 4, 3, 2, 1] as const
export type FirstGameRating = (typeof FIRST_GAME_RATINGS_DESC)[number]

export const STAR_COUNT = 5

export type FirstGamePlayMode = 'online' | 'local'

export type FirstGameByGame = { gameId: string; count: number; average: number }

export type FirstGameComment = {
  id: string
  rating: number
  gameId: string | null
  playMode: string | null
  comment: string
  createdAt: string
}

export type FirstGameFeedbackSummary = {
  total: number
  average: number | null
  last30d: { count: number; average: number | null }
  distribution: Record<`${FirstGameRating}`, number>
  byGame: FirstGameByGame[]
  recentComments: FirstGameComment[]
}

export function isFirstGamePlayMode(value: unknown): value is FirstGamePlayMode {
  return value === 'online' || value === 'local'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Effectif exploitable : un compte négatif, NaN ou absent vaut 0 (jamais un trou dans la répartition). */
function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Moyenne exploitable : bornée à l'échelle 1..5, null si absente ou illisible. */
function averageOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(STAR_COUNT, Math.max(0, value))
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Jeux classés par VOLUME d'avis, puis par moyenne, puis par identifiant
 * (ordre stable d'un rechargement à l'autre). Pas par moyenne d'abord : un
 * jeu noté 5 par un seul joueur passerait devant un jeu à 4,2 sur trente
 * avis — l'exploitant lirait un classement que les chiffres ne soutiennent pas.
 */
export function sortByGameVolume(rows: FirstGameByGame[]): FirstGameByGame[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || b.average - a.average || a.gameId.localeCompare(b.gameId)
  )
}

/**
 * Valide la réponse de la route et la remet d'aplomb. null = réponse
 * inexploitable (serveur antérieur à la route, page d'erreur du proxy) : le
 * panneau affiche alors son erreur plutôt qu'un 0 qui mentirait.
 * Une rangée ou un commentaire mal formé est écarté seul, sans faire tomber
 * le reste du résumé.
 */
export function parseFirstGameFeedbackSummary(body: unknown): FirstGameFeedbackSummary | null {
  if (!isRecord(body) || !isRecord(body.summary)) return null
  const raw = body.summary
  if (typeof raw.total !== 'number' || !Number.isFinite(raw.total)) return null

  const rawLast30d = isRecord(raw.last30d) ? raw.last30d : {}
  const rawDistribution = isRecord(raw.distribution) ? raw.distribution : {}

  const distribution = {
    '1': countOf(rawDistribution['1']),
    '2': countOf(rawDistribution['2']),
    '3': countOf(rawDistribution['3']),
    '4': countOf(rawDistribution['4']),
    '5': countOf(rawDistribution['5']),
  }

  const byGame: FirstGameByGame[] = []
  for (const row of Array.isArray(raw.byGame) ? raw.byGame : []) {
    if (!isRecord(row) || typeof row.gameId !== 'string' || row.gameId === '') continue
    const count = countOf(row.count)
    const average = averageOf(row.average)
    if (count === 0 || average === null) continue
    byGame.push({ gameId: row.gameId, count, average })
  }

  const recentComments: FirstGameComment[] = []
  for (const row of Array.isArray(raw.recentComments) ? raw.recentComments : []) {
    if (!isRecord(row) || typeof row.id !== 'string' || typeof row.comment !== 'string') continue
    if (typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) continue
    const rating = averageOf(row.rating)
    // Commentaire vide : la route ne devrait pas en renvoyer (avis sans
    // commentaire = note seule) ; s'il en vient un, il n'a rien à lire.
    if (rating === null || row.comment.trim() === '') continue
    recentComments.push({
      id: row.id,
      rating,
      gameId: nullableString(row.gameId),
      playMode: nullableString(row.playMode),
      comment: row.comment,
      createdAt: row.createdAt,
    })
  }

  return {
    total: countOf(raw.total),
    average: averageOf(raw.average),
    last30d: { count: countOf(rawLast30d.count), average: averageOf(rawLast30d.average) },
    distribution,
    byGame: sortByGameVolume(byGame),
    recentComments,
  }
}

/** Répartition dans l'ordre d'affichage (5 → 1), chaque note avec son effectif. */
export function distributionRows(
  distribution: FirstGameFeedbackSummary['distribution']
): Array<{ rating: FirstGameRating; count: number }> {
  return FIRST_GAME_RATINGS_DESC.map((rating) => ({ rating, count: distribution[`${rating}`] }))
}

/**
 * Étoiles PLEINES pour une note ou une moyenne : arrondi à l'étoile la plus
 * proche (4,3 → 4 ; 4,5 → 5), borné à 0..5. Les étoiles ne sont qu'un repère
 * visuel : la valeur exacte est écrite à côté et dans l'aria-label.
 */
export function filledStars(rating: number | null | undefined): number {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return 0
  return Math.min(STAR_COUNT, Math.max(0, Math.round(rating)))
}
