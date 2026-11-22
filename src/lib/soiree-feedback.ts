import { getGameById } from '@/lib/games'
import { FIRST_GAME_RATING_MAX, FIRST_GAME_RATING_MIN, sanitizeFeedbackPageUrl } from '@/lib/first-game-feedback'

/**
 * VOTES DU MODE SOIRÉE — logique pure, sans base ni requête : la validation
 * du corps de POST /api/feedback/soiree et l'identifiant de chaque vote. Rien
 * de serveur ici : l'écran de vote importe les bornes.
 *
 * Deux questions, un vote pour la table (un seul téléphone), note de 1 à 5 en
 * icônes (src/components/soiree/vote-icons.tsx) :
 * - à chaque entracte, « Ce jeu vous a plu ? » pour la manche jouée ;
 * - sur l'addition, « La soirée vous a plu ? », avec un commentaire facultatif.
 */

/** Commentaire TRONQUÉ au-delà (pas refusé), comme l'avis de 1re partie. */
export const SOIREE_VOTE_COMMENT_MAX = 1000

/**
 * Index de manche accepté : le programme se rallonge à l'entracte (douze
 * manches à venir au plus, après celles déjà jouées) ; au-delà, ce n'est plus
 * une soirée.
 */
const SOIREE_VOTE_MAX_ROUND = 100

/** Forme de newSoireeId (src/lib/soiree/storage.ts) : instant et tirage en base 36. */
const SOIREE_ID_PATTERN = /^[a-z0-9]{1,16}-[a-z0-9]{1,12}$/

/** Ce que l'écran envoie, avant la note : la manche votée ou la soirée entière. */
export type SoireeVoteTarget =
  | { scope: 'round'; soireeId: string; round: number; gameId: string }
  | { scope: 'soiree'; soireeId: string }

/** Corps ACCEPTÉ par POST /api/feedback/soiree : vérifié, borné, nettoyé. */
export type SoireeVoteInput =
  | { scope: 'round'; soireeId: string; round: number; gameId: string; rating: number; pageUrl: string | null }
  | { scope: 'soiree'; soireeId: string; rating: number; comment: string; pageUrl: string | null }

function isRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= FIRST_GAME_RATING_MIN &&
    value <= FIRST_GAME_RATING_MAX
  )
}

/**
 * Validation du corps reçu : null au moindre écart sur ce qui sera stocké ou
 * agrégé (portée, soirée, note entière 1..5, manche, jeu connu) — un jeu
 * inventé ou une note hors échelle fausserait le résumé de la Supervision.
 * Le commentaire n'existe que pour la soirée entière : une manche n'en porte
 * jamais (ignoré s'il arrive).
 */
export function parseSoireeVote(body: unknown): SoireeVoteInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  if (typeof raw.soireeId !== 'string' || !SOIREE_ID_PATTERN.test(raw.soireeId)) return null
  if (!isRating(raw.rating)) return null
  const pageUrl = sanitizeFeedbackPageUrl(raw.pageUrl)

  if (raw.scope === 'round') {
    const round = raw.round
    if (typeof round !== 'number' || !Number.isInteger(round) || round < 0 || round >= SOIREE_VOTE_MAX_ROUND) return null
    if (typeof raw.gameId !== 'string' || !getGameById(raw.gameId)) return null
    return { scope: 'round', soireeId: raw.soireeId, round, gameId: raw.gameId, rating: raw.rating, pageUrl }
  }

  if (raw.scope !== 'soiree') return null
  let comment = ''
  if (raw.comment !== undefined && raw.comment !== null) {
    if (typeof raw.comment !== 'string') return null
    comment = raw.comment.trim().slice(0, SOIREE_VOTE_COMMENT_MAX).trim()
  }
  return { scope: 'soiree', soireeId: raw.soireeId, rating: raw.rating, comment, pageUrl }
}

/**
 * Identifiant DÉTERMINISTE d'un vote : un vote par manche et un par soirée,
 * tenus en base par la clé primaire — un second envoi (double toucher, onglet
 * rouvert, réseau qui rejoue) bute dessus au lieu d'écrire une seconde ligne.
 * L'identifiant de soirée est tiré au hasard sur l'appareil : rien de
 * personnel, aucun caractère à échapper dans /api/admin/feedback/[id].
 */
export function soireeVoteId(target: Pick<SoireeVoteInput, 'soireeId'> & ({ scope: 'round'; round: number } | { scope: 'soiree' })): string {
  return `soiree-${target.soireeId}-${target.scope === 'round' ? `m${target.round}` : 'fin'}`
}
