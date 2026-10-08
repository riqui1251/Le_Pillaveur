import { NextResponse } from 'next/server'
import { unsubscribeLandingPath, unsubscribeReminderByToken } from '@/lib/reminder-server'
import { checkRateLimit, networkRateLimitKey, readTextBodyLimited } from '@/lib/rate-limit'
import { withApiRoute } from '@/lib/api-route'

export const dynamic = 'force-dynamic'

/**
 * DÉSINSCRIPTION du rappel du vendredi, SANS CONNEXION : chaque e-mail porte
 * le jeton aléatoire du compte (User.reminderToken).
 *
 * Seul un POST désinscrit. Les passerelles de messagerie qui analysent les
 * liens à la réception (Safe Links de Microsoft Defender, Mimecast,
 * Proofpoint) font un GET sur chaque URL de l'e-mail ET de ses en-têtes : un
 * GET qui désinscrivait coupait le rappel avant même que le joueur ouvre
 * l'e-mail, sans que personne le sache. La RFC 8058 le prévoit justement :
 * le désabonnement en un clic passe par un POST.
 *
 * - POST « List-Unsubscribe=One-Click » (?token= dans l'URL) : le bouton
 *   « Se désabonner » de la messagerie elle-même (en-tête
 *   List-Unsubscribe-Post) — aucune page, juste 200 ;
 * - POST d'un formulaire (champs `token`, `lang`) : le bouton de la page
 *   /<lang>/compte/rappel, où mène le lien du corps de l'e-mail — puis
 *   redirection (303) vers la même page, état « c'est noté » ;
 * - GET ?token=…&lang=… : ne coupe RIEN. Redirige vers la page qui demande
 *   de confirmer d'un bouton — c'est ce que trouve une passerelle qui suit
 *   l'URL de l'en-tête, et elle ne clique pas.
 *
 * Ne révèle RIEN : jeton connu, inconnu, mal formé ou déjà désinscrit, la
 * réponse est la même (même redirection, même page, même corps). La langue
 * de la page vient du lien, jamais du compte trouvé. Ni cache ni référent :
 * l'URL porte le jeton.
 *
 * Quota par RÉSEAU (le visiteur n'a pas de compte ici) : le jeton fait 256
 * bits, le deviner est hors de portée, mais rien ne justifie de laisser
 * marteler la table User.
 */
const UNSUBSCRIBE_LIMIT = 30
const WINDOW_MS = 60_000
/** Un formulaire de deux champs ou « List-Unsubscribe=One-Click » : quelques centaines d'octets. */
const BODY_MAX_BYTES = 2048

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

function readQuery(request: Request): { token: string; lang: string | null } {
  const params = new URL(request.url).searchParams
  return { token: params.get('token') ?? '', lang: params.get('lang') }
}

function rateLimited(request: Request): Response | null {
  const rate = checkRateLimit(networkRateLimitKey(request, 'reminder-unsubscribe'), UNSUBSCRIBE_LIMIT, WINDOW_MS)
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

export const GET = withApiRoute('reminder/unsubscribe GET', async (request: Request) => {
  const limited = rateLimited(request)
  if (limited) return limited
  const { token, lang } = readQuery(request)
  return seeOther(unsubscribeLandingPath(lang, token))
})

export const POST = withApiRoute('reminder/unsubscribe POST', async (request: Request) => {
  const limited = rateLimited(request)
  if (limited) return limited
  const query = readQuery(request)
  const body = await readTextBodyLimited(request, BODY_MAX_BYTES)
  const text = body.ok ? body.text : ''

  // RFC 8058 : « List-Unsubscribe=One-Click », en urlencoded ou en
  // multipart selon la messagerie — le jeton est dans l'URL de l'en-tête.
  if (text.includes('One-Click')) {
    await unsubscribeReminderByToken(query.token)
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
  }

  // Formulaire de la page : jeton et langue en champs cachés (le jeton
  // n'apparaît ainsi ni dans les journaux du proxy ni dans l'historique).
  const form = new URLSearchParams(text)
  await unsubscribeReminderByToken(form.get('token') ?? query.token)
  return seeOther(unsubscribeLandingPath(form.get('lang') ?? query.lang))
})
