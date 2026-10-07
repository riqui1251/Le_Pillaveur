import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { FIRST_GAME_FEEDBACK_TYPE } from '@/lib/feedback'
import { parseFirstGameFeedback } from '@/lib/first-game-feedback'
import { firstGameFeedbackId, isLocalFirstGameFeedbackDue } from '@/lib/first-game-feedback-server'
import { getClientIpFromRequest } from '@/lib/geo-server'
import {
  checkRateLimit,
  networkRateLimitKey,
  rateLimitKey,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Avis de 1re partie : la note (1..5) qu'un joueur laisse à la fin de sa
 * première partie, ou son refus (« Non merci »). Ouverte aux anonymes : les
 * jeux LOCAUX se jouent sans compte, c'est alors l'appareil qui retient que
 * la question a été posée (src/lib/first-game-device.ts).
 *
 * Compte connecté (invités compris) : `firstFeedbackAskedAt` est posé pour
 * les deux actions — c'est lui qui éteint `firstGameFeedback` dans
 * GET /api/online/progression. Une seule note par compte, garantie par la
 * clé primaire (firstGameFeedbackId) : un second envoi (deux appareils, une
 * carte rouverte, deux requêtes simultanées) répond `already` sans écrire.
 *
 * Minimisation : l'e-mail du compte n'est PAS recopié (contactEmail null) —
 * une note n'appelle pas de réponse, et l'avis reste rattaché au compte.
 */

/**
 * Quota PROPRE, distinct de celui de /api/feedback : un joueur qui note sa
 * 1re partie ne doit pas perdre un de ses 3 signalements de l'heure, et
 * inversement. 3 par heure couvrent un « Non merci » suivi d'une note.
 */
const FIRST_GAME_FEEDBACK_LIMIT = 3
const FIRST_GAME_FEEDBACK_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_SCOPE = 'feedback-first-game'

/**
 * Anonyme ET IP inconnue : compteur commun plus large, comme pour
 * /api/feedback — impossible de distinguer les émetteurs, on garde un plafond
 * sans bloquer tout le monde au 3e avis.
 */
const FIRST_GAME_FEEDBACK_UNIDENTIFIED_LIMIT = 20

/**
 * NOTES anonymes (jeux locaux) : plafond par RÉSEAU et par jour, en plus du
 * quota horaire. Rien ne dédoublonne un anonyme : 3 par heure laissaient une
 * seule IP poster 72 notes par jour et dicter la moyenne, la tendance sur
 * 30 jours et le classement par jeu d'un site qui reçoit 10 avis en 4 mois.
 * Deux par réseau (/64 en IPv6, pour qu'un script ne tourne pas sur ses
 * adresses) laissent noter deux appareils neufs d'un même foyer. Le refus
 * (« Non merci ») n'écrit rien pour un anonyme : il n'y est pas soumis.
 */
const ANONYMOUS_RATING_LIMIT = 2
const ANONYMOUS_RATING_UNIDENTIFIED_LIMIT = 20
const ANONYMOUS_RATING_WINDOW_MS = 24 * 60 * 60 * 1000
const ANONYMOUS_RATING_SCOPE = 'feedback-first-game-anonymous-rate'

/** Une note, un commentaire de 1000 caractères et des métadonnées : 8 Ko suffisent. */
const MAX_FIRST_GAME_FEEDBACK_BODY_BYTES = 8 * 1024

const invalid = () => NextResponse.json({ error: 'invalid' }, { status: 400 })

/** Violation d'unicité Prisma : l'avis de ce compte existe déjà. */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

/**
 * En LOCAL avec un compte connecté, la carte demande d'abord si ce compte
 * débute (jamais sollicité, créé il y a 30 jours au plus). L'appareil seul
 * ne le sait pas : un habitué qui ouvre le site sur un téléphone neuf y est
 * « nouveau » avant même de se connecter. Une lecture par clé primaire, et
 * seulement sur un appareil encore neuf, en fin de partie locale.
 */
export const GET = withApiRoute('feedback/first-game GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)
  return NextResponse.json({ eligible: await isLocalFirstGameFeedbackDue(user.id) })
})

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    const ip = getClientIpFromRequest(request)
    const quota = user
      ? { key: userRateLimitKey(RATE_LIMIT_SCOPE, user.id), limit: FIRST_GAME_FEEDBACK_LIMIT }
      : ip
        ? { key: rateLimitKey(request, RATE_LIMIT_SCOPE), limit: FIRST_GAME_FEEDBACK_LIMIT }
        : { key: `${RATE_LIMIT_SCOPE}:unidentified`, limit: FIRST_GAME_FEEDBACK_UNIDENTIFIED_LIMIT }

    const rate = checkRateLimit(quota.key, quota.limit, FIRST_GAME_FEEDBACK_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    // Trop gros ou illisible : même 400 qu'un corps invalide — la carte
    // n'envoie jamais plus de quelques centaines d'octets.
    const parsed = await readJsonBodyLimited(request, MAX_FIRST_GAME_FEEDBACK_BODY_BYTES)
    if (!parsed.ok) return invalid()
    const input = parseFirstGameFeedback(parsed.body)
    if (!input) return invalid()

    if (!user && input.action === 'rate') {
      // Une salle en ligne exige un compte (invités compris) : une note « en
      // ligne » sans compte ne vient pas de la carte.
      if (input.playMode === 'online') return invalid()
      const anonymous = checkRateLimit(
        ip ? networkRateLimitKey(request, ANONYMOUS_RATING_SCOPE) : `${ANONYMOUS_RATING_SCOPE}:unidentified`,
        ip ? ANONYMOUS_RATING_LIMIT : ANONYMOUS_RATING_UNIDENTIFIED_LIMIT,
        ANONYMOUS_RATING_WINDOW_MS
      )
      if (!anonymous.ok) return rateLimitResponse(anonymous.retryAfterSec)
    }

    if (user) {
      // updateMany + `null` dans le where : idempotent, la PREMIÈRE date
      // reste — ni lecture préalable, ni écrasement par un second envoi.
      await prisma.user.updateMany({
        where: { id: user.id, firstFeedbackAskedAt: null },
        data: { firstFeedbackAskedAt: new Date() },
      })
    }

    // Refus : rien d'autre à retenir. Anonyme, rien du tout — l'appareil
    // s'en souvient seul.
    if (input.action === 'dismiss') return NextResponse.json({ ok: true })

    try {
      await prisma.userFeedback.create({
        data: {
          // Compte : clé déterministe (unicité tenue par la base). Anonyme :
          // cuid par défaut — l'appareil seul borne la répétition.
          ...(user ? { id: firstGameFeedbackId(user.id) } : {}),
          type: FIRST_GAME_FEEDBACK_TYPE,
          message: input.comment,
          rating: input.rating,
          gameId: input.gameId,
          playMode: input.playMode,
          userId: user?.id ?? null,
          contactEmail: null,
          pageUrl: input.pageUrl,
          userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
        },
      })
    } catch (error) {
      if (user && isUniqueViolation(error)) return NextResponse.json({ ok: true, already: true })
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('first-game feedback POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
