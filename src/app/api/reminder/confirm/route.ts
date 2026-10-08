import { NextResponse } from 'next/server'
import { confirmLandingPath, confirmReminderByToken } from '@/lib/reminder-server'
import { checkRateLimit, networkRateLimitKey, readTextBodyLimited } from '@/lib/rate-limit'
import { withApiRoute } from '@/lib/api-route'

export const dynamic = 'force-dynamic'

/**
 * CONFIRMATION de l'accord au rappel du vendredi (double opt-in,
 * src/lib/reminder-server.ts), SANS CONNEXION : le joueur peut ouvrir
 * l'e-mail sur un autre appareil que celui où il joue.
 *
 * - POST d'un formulaire (champs `token`, `lang`) : le bouton « Activer le
 *   rappel » de la page /<lang>/compte/rappel/confirmer, où mène le lien de
 *   l'e-mail. Pose l'accord et la preuve de l'adresse, puis redirige (303)
 *   vers la même page, état « activé » ou « lien expiré » ;
 * - GET : ne confirme RIEN — un antivirus de messagerie qui ouvre le lien ne
 *   doit pas donner l'accord à la place du joueur. Redirige vers la page au
 *   bouton.
 *
 * Seul le détenteur du jeton (donc de la boîte aux lettres) apprend l'issue ;
 * un jeton de 256 bits ne se devine pas. Quota par RÉSEAU, comme la
 * désinscription. Ni cache ni référent : l'URL et le corps portent le jeton.
 */
const CONFIRM_LIMIT = 30
const WINDOW_MS = 60_000
const BODY_MAX_BYTES = 2048

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

function rateLimited(request: Request): Response | null {
  const rate = checkRateLimit(networkRateLimitKey(request, 'reminder-confirm'), CONFIRM_LIMIT, WINDOW_MS)
  if (rate.ok) return null
  return NextResponse.json(
    { error: 'rate_limited', code: 'rate_limited', retryAfterSec: rate.retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
  )
}

/** Redirection RELATIVE (RFC 9110) : derrière le proxy du VPS, `request.url` porte l'hôte interne. */
function seeOther(location: string): Response {
  return new NextResponse(null, { status: 303, headers: { Location: location, ...NO_STORE_HEADERS } })
}

export const GET = withApiRoute('reminder/confirm GET', async (request: Request) => {
  const limited = rateLimited(request)
  if (limited) return limited
  const params = new URL(request.url).searchParams
  return seeOther(confirmLandingPath(params.get('lang'), { token: params.get('token') ?? '' }))
})

export const POST = withApiRoute('reminder/confirm POST', async (request: Request) => {
  const limited = rateLimited(request)
  if (limited) return limited
  const body = await readTextBodyLimited(request, BODY_MAX_BYTES)
  const form = new URLSearchParams(body.ok ? body.text : '')
  const outcome = await confirmReminderByToken(form.get('token') ?? '')
  return seeOther(confirmLandingPath(form.get('lang'), { outcome }))
})
