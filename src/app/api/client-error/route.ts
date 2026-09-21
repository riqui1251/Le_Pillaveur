import { readApiJson, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, networkRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import {
  deviceFamilyFromUserAgent,
  parseClientErrorReport,
  recordClientError,
} from '@/lib/client-errors-server'

export const runtime = 'nodejs'

/**
 * POST /api/client-error — réception des plantages côté joueur.
 *
 * Route PUBLIQUE et ANONYME : elle est appelée par un écran d'erreur, donc
 * depuis un arbre React déjà cassé, parfois sans session (global-error vit
 * au-dessus de l'application). Elle n'exige rien, ne lit aucun cookie et ne
 * renvoie rien d'utile : 204 quand le rapport est pris, un statut nu sinon —
 * l'appelant (sendBeacon) n'écoute pas la réponse, et rien du serveur ne doit
 * ressortir par ce chemin.
 *
 * Cinq garde-fous, dans cet ordre, parce qu'elle est ouverte à tous :
 * 1. refus d'un envoi depuis un AUTRE site (`Sec-Fetch-Site: cross-site`) :
 *    nos écrans d'erreur appellent en même origine ; un sendBeacon posé sur
 *    une page tierce n'a rien à faire ici. Un script sans navigateur n'envoie
 *    pas l'en-tête, il tombe sur les quotas ;
 * 2. quota GLOBAL (120/min, toutes sources) : le quota par réseau ne borne
 *    rien contre des réseaux nombreux, et chaque rapport DISTINCT crée une
 *    ligne — sans plafond commun, un script noyait le panneau de Supervision
 *    (les 20 groupes les plus récents) et faisait grossir la table 30 jours ;
 *    le serveur ajoute son propre plafond de créations par 24 h ;
 * 3. quota par RÉSEAU (10/min, clé /64 en IPv6) — une tablée qui plante en
 *    boucle est déjà dédoublonnée en base, au-delà c'est un script ;
 * 4. corps borné à 4 Ko AVANT d'être matérialisé : un rapport conforme tient
 *    en quelques centaines d'octets ;
 * 5. validation stricte des champs (types, longueurs, chemin absolu) ; un
 *    rapport hors contrat est refusé, pas réparé.
 * RGPD : l'IP ne sert qu'à la clé de quota, en mémoire ; l'UA n'est lu que
 * pour sa famille (mobile / tablette / ordinateur).
 */

const CLIENT_ERROR_BODY_MAX_BYTES = 4 * 1024
const RATE_LIMIT_PER_WINDOW = 10
const GLOBAL_RATE_LIMIT_PER_WINDOW = 120
const RATE_WINDOW_MS = 60 * 1000

export const POST = withApiRoute('client-error POST', async (request: Request) => {
  // Refus nu, comme pour un corps hors contrat : personne ne lit la réponse.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 403 })
  }

  const global = checkRateLimit('client-error:global', GLOBAL_RATE_LIMIT_PER_WINDOW, RATE_WINDOW_MS)
  if (!global.ok) return rateLimitResponse(global.retryAfterSec)

  const quota = checkRateLimit(
    networkRateLimitKey(request, 'client-error'),
    RATE_LIMIT_PER_WINDOW,
    RATE_WINDOW_MS
  )
  if (!quota.ok) return rateLimitResponse(quota.retryAfterSec)

  const parsed = await readApiJson<unknown>(request, CLIENT_ERROR_BODY_MAX_BYTES)
  if (!parsed.ok) return parsed.response

  const report = parseClientErrorReport(parsed.body)
  // Hors contrat : refus nu, sans code ni détail — personne ne lit la réponse.
  if (!report) return new Response(null, { status: 400 })

  await recordClientError(report, deviceFamilyFromUserAgent(request.headers.get('user-agent')))
  return new Response(null, { status: 204 })
})
