import { withApiRoute } from '@/lib/api-route'
import { checkRateLimit, networkRateLimitKey, readJsonBodyLimited } from '@/lib/rate-limit'
import { parseLocalGameReport, recordLocalGameEvent } from '@/lib/local-games-server'

export const runtime = 'nodejs'

/**
 * POST /api/analytics/local-game — une partie LOCALE lancée ou terminée.
 * Corps : `{ gameId, event: 'start' | 'end' }` (src/lib/local-game-beacon.ts).
 *
 * Route PUBLIQUE et ANONYME : les jeux locaux se jouent sans compte. Elle ne
 * lit aucun cookie, n'écrit ni compte, ni visiteur, ni IP — seulement deux
 * compteurs par jour et par jeu (LocalGameDaily). Rien de personnel n'étant
 * collecté, la mesure ne dépend pas de l'accord aux statistiques.
 *
 * Réponses NUES : 204 quand le compteur est pris, un statut sans corps pour
 * un refus (une panne de base passe par l'enveloppe commune : 500 générique,
 * sans détail). L'appelant (sendBeacon) n'écoute pas, et un échec ne doit
 * jamais devenir une erreur à l'écran du joueur.
 *
 * Garde-fous, dans cet ordre, parce qu'elle est ouverte à tous :
 * 1. refus d'un envoi depuis un AUTRE site (`Sec-Fetch-Site: cross-site`) :
 *    une page tierce pourrait sinon gonfler les compteurs depuis le
 *    navigateur de ses visiteurs ;
 * 2. quota par RÉSEAU (60/h, clé /64 en IPv6) : une tablée qui enchaîne les
 *    revanches toute la soirée envoie quelques dizaines d'événements par
 *    heure ; au-delà, c'est un script. Compté AVANT le quota global, pour
 *    qu'un seul réseau refusé n'use pas le plafond commun ;
 * 3. corps borné à 512 octets AVANT d'être matérialisé, puis validation
 *    stricte (jeu LOCAL du catalogue, événement connu) — AVANT le quota
 *    global : un corps vide ou hors contrat ne coûte rien à envoyer, il ne
 *    doit user que le quota de SON réseau, jamais le plafond commun dont
 *    vivent les vraies tablées ;
 * 4. quota GLOBAL (1200/h), compté sur les seuls envois VALIDES, juste avant
 *    l'écriture : contre des réseaux nombreux (un /48 IPv6 fournit 65 536
 *    clés /64). La table ne grossit pas (lignes bornées), mais chaque
 *    requête est une écriture SQLite sur une connexion unique. Taillé à des
 *    dizaines de fois le pic actuel : au-delà, les compteurs sous-estiment
 *    — à relever si le site grandit. Des corps valides en rafale peuvent
 *    encore fausser les compteurs : c'est la limite d'une mesure anonyme,
 *    sans compte ni appareil à qui l'attacher.
 */

const LOCAL_GAME_BODY_MAX_BYTES = 512
const NETWORK_LIMIT_PER_WINDOW = 60
const GLOBAL_LIMIT_PER_WINDOW = 1200
const RATE_WINDOW_MS = 60 * 60 * 1000

/** 429 sans corps : personne ne lit la réponse, le délai reste dans l'en-tête. */
function tooMany(retryAfterSec: number): Response {
  return new Response(null, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
}

export const POST = withApiRoute('local-game POST', async (request: Request) => {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 403 })
  }

  const quota = checkRateLimit(
    networkRateLimitKey(request, 'local-game'),
    NETWORK_LIMIT_PER_WINDOW,
    RATE_WINDOW_MS
  )
  if (!quota.ok) return tooMany(quota.retryAfterSec)

  const parsed = await readJsonBodyLimited<unknown>(request, LOCAL_GAME_BODY_MAX_BYTES)
  if (!parsed.ok) return new Response(null, { status: parsed.reason === 'too_large' ? 413 : 400 })

  const report = parseLocalGameReport(parsed.body)
  if (!report) return new Response(null, { status: 400 })

  const global = checkRateLimit('local-game:global', GLOBAL_LIMIT_PER_WINDOW, RATE_WINDOW_MS)
  if (!global.ok) return tooMany(global.retryAfterSec)

  await recordLocalGameEvent(report)
  return new Response(null, { status: 204 })
})
