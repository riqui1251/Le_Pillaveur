import { getGameById } from '@/lib/games'

/**
 * AVIS DE 1RE PARTIE — logique pure, sans base ni requête : l'éligibilité
 * (lue par GET /api/online/progression) et la validation du corps de
 * POST /api/feedback/first-game. Rien de serveur ici : la carte côté client
 * peut importer les bornes (note, longueur du commentaire) sans tirer Prisma.
 *
 * Pourquoi demander à la fin de la 1re partie : 10 avis en 4 mois avec le
 * seul bouton « Signaler », et presque personne ne revient une 2e soirée — le
 * premier contact est le seul moment où l'on peut encore entendre ceux qui ne
 * reviendront pas.
 */

/** Fenêtre après le succès `first_game` pendant laquelle la carte peut sortir. */
export const FIRST_GAME_FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Âge maximal du compte AU MOMENT du succès `first_game`. Le module des succès
 * date du 31/08/2026 : un ancien compte qui n'avait jamais terminé de partie
 * en ligne reçoit `first_game` des mois après sa création — ce n'est plus un
 * premier contact, on ne lui demande rien.
 */
export const FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const FIRST_GAME_RATING_MIN = 1
export const FIRST_GAME_RATING_MAX = 5

/** Commentaire TRONQUÉ au-delà (pas refusé) : un avis long reste un avis. */
export const FIRST_GAME_COMMENT_MAX = 1000

/** Plafond de pageUrl stocké, comme le POST /api/feedback générique. */
const PAGE_URL_MAX = 500

export const FIRST_GAME_FEEDBACK_PLAY_MODES = ['online', 'local'] as const
export type FirstGameFeedbackPlayMode = (typeof FIRST_GAME_FEEDBACK_PLAY_MODES)[number]

/**
 * La carte d'avis est-elle due à ce compte ? Vrai SEULEMENT si :
 *  - elle n'a jamais été notée ni refusée (`askedAt` null) ;
 *  - le succès `first_game` existe et date d'au plus 24 h (une date à venir —
 *    horloge recalée — compte comme récente : mieux vaut demander que rater) ;
 *  - le compte avait au plus 30 jours à ce moment-là (voir la constante).
 * Écrit en conjonction de conditions positives : une date invalide (NaN) rend
 * chaque comparaison fausse, donc « pas éligible » — jamais l'inverse.
 */
export function isFirstGameFeedbackEligible({
  askedAt,
  firstGameUnlockedAt,
  createdAt,
  now,
}: {
  askedAt: Date | null
  firstGameUnlockedAt: Date | null
  createdAt: Date
  now: Date
}): boolean {
  if (askedAt !== null || firstGameUnlockedAt === null) return false
  const sinceUnlockMs = now.getTime() - firstGameUnlockedAt.getTime()
  const accountAgeAtUnlockMs = firstGameUnlockedAt.getTime() - createdAt.getTime()
  return (
    sinceUnlockMs <= FIRST_GAME_FEEDBACK_WINDOW_MS &&
    accountAgeAtUnlockMs <= FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS
  )
}

/**
 * Même question pour une partie LOCALE jouée avec un compte connecté
 * (GET /api/feedback/first-game). L'appareil ne suffit pas : un habitué qui
 * ouvre le site sur un téléphone neuf (coquille Android, autre navigateur,
 * stockage purgé) y est « nouveau » avant même de se connecter, et sa note
 * fausserait le résumé construit pour mesurer les nouveaux. Pas de succès
 * `first_game` en local (il ne tombe qu'en ligne) : on retient donc ce que le
 * compte dit de lui — jamais sollicité, et créé il y a 30 jours au plus.
 */
export function isLocalFirstGameFeedbackEligible({
  askedAt,
  createdAt,
  now,
}: {
  askedAt: Date | null
  createdAt: Date
  now: Date
}): boolean {
  if (askedAt !== null) return false
  return now.getTime() - createdAt.getTime() <= FIRST_GAME_FEEDBACK_MAX_ACCOUNT_AGE_MS
}

/** Corps ACCEPTÉ par POST /api/feedback/first-game : vérifié, borné, nettoyé. */
export type FirstGameFeedbackInput =
  | {
      action: 'rate'
      rating: number
      /** '' sans commentaire : la colonne `message` est NOT NULL. */
      comment: string
      gameId: string
      playMode: FirstGameFeedbackPlayMode
      pageUrl: string | null
    }
  | {
      action: 'dismiss'
      playMode: FirstGameFeedbackPlayMode
    }

function isPlayMode(value: unknown): value is FirstGameFeedbackPlayMode {
  return (
    typeof value === 'string' &&
    (FIRST_GAME_FEEDBACK_PLAY_MODES as readonly string[]).includes(value)
  )
}

/**
 * Adresse de la page SANS query ni hash : un `?token=` ou un `#code` n'a rien
 * à faire dans une table que lisent les modérateurs, et le chemin suffit à
 * savoir d'où vient l'avis. Une valeur non textuelle ou vide est ignorée
 * (métadonnée, pas une raison de refuser l'avis).
 */
export function sanitizeFeedbackPageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cut = value.split(/[?#]/, 1)[0].trim().slice(0, PAGE_URL_MAX)
  return cut || null
}

/**
 * Validation du corps reçu. Renvoie null au moindre écart sur ce qui sera
 * STOCKÉ ou agrégé (action, note entière 1..5, jeu connu de GAMES, mode) :
 * une note fausse ou un jeu inventé fausserait le résumé par jeu.
 *
 * 'dismiss' n'exige que le mode : son `gameId` n'est jamais écrit, il est
 * donc ignoré quel qu'il soit — refuser un « Plus tard » pour un identifiant
 * de jeu inattendu laisserait la carte revenir à chaque partie.
 */
export function parseFirstGameFeedback(body: unknown): FirstGameFeedbackInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  if (!isPlayMode(raw.playMode)) return null

  if (raw.action === 'dismiss') return { action: 'dismiss', playMode: raw.playMode }
  if (raw.action !== 'rate') return null

  const rating = raw.rating
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < FIRST_GAME_RATING_MIN ||
    rating > FIRST_GAME_RATING_MAX
  ) {
    return null
  }

  if (typeof raw.gameId !== 'string' || !getGameById(raw.gameId)) return null

  let comment = ''
  if (raw.comment !== undefined && raw.comment !== null) {
    if (typeof raw.comment !== 'string') return null
    comment = raw.comment.trim().slice(0, FIRST_GAME_COMMENT_MAX).trim()
  }

  return {
    action: 'rate',
    rating,
    comment,
    gameId: raw.gameId,
    playMode: raw.playMode,
    pageUrl: sanitizeFeedbackPageUrl(raw.pageUrl),
  }
}
