import { withApiRoute } from '@/lib/api-route'
import { checkRateLimit, networkRateLimitKey, readJsonBodyLimited } from '@/lib/rate-limit'
import { parseLocalDrinksReport, parseLocalGameReport, recordLocalGameEvent } from '@/lib/local-games-server'
import { recordGameDrinks } from '@/lib/game-drinks-server'

export const runtime = 'nodejs'

/**
 * POST /api/analytics/local-game — une partie LOCALE lancée ou terminée, ou
 * le relevé de ses gorgées. Deux corps (src/lib/local-game-beacon.ts) :
 * - `{ gameId, event: 'start' | 'end' }` → LocalGameDaily (lancements, fins) ;
 * - `{ gameId, event: 'drinks', drinks, plays }` → GameDrinkDaily, mode
 *   'local' (« Quel jeu fait le plus boire ? », tous joueurs confondus) :
 *   `plays` participations (entier de 1 à 15) et leurs `drinks` gorgées
 *   BUES (entier de 0 à 20 par participation), ou une correction arrivée
 *   après sa partie (`plays` à 0, `drinks` de 1 à 300) ; totaux de la table
 *   cumulés par le téléphone (local-drink-tally.ts), jamais en ambiance
 *   « Sans alcool ».
 *
 * Route PUBLIQUE et ANONYME : les jeux locaux se jouent sans compte. Elle ne
 * lit aucun cookie, n'écrit ni compte, ni visiteur, ni IP — seulement des
 * compteurs par jour et par jeu. Rien de personnel n'étant collecté, la
 * mesure ne dépend pas de l'accord aux statistiques.
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
 * 2. quota par RÉSEAU (60/h, clé /64 en IPv6), commun aux trois événements :
 *    une tablée qui enchaîne les revanches toute la soirée envoie quelques
 *    dizaines d'événements par heure (le téléphone regroupe ses relevés de
 *    gorgées : un par jeu après deux minutes de calme, au plus toutes les
 *    dix minutes, ou au départ d'une partie neuve) ; au-delà, c'est un
 *    script. Compté AVANT le quota global,
 *    pour qu'un seul réseau refusé n'use pas le plafond commun ;
 * 3. corps borné à 512 octets AVANT d'être matérialisé, puis validation
 *    stricte (jeu LOCAL du catalogue, événement connu, bornes du relevé) —
 *    AVANT le quota global : un corps vide ou hors contrat ne coûte rien à
 *    envoyer, il ne doit user que le quota de SON réseau, jamais le plafond
 *    commun dont vivent les vraies tablées ;
 * 4. quota GLOBAL (1200/h), compté sur les seuls envois VALIDES, juste avant
 *    l'écriture : contre des réseaux nombreux (un /48 IPv6 fournit 65 536
 *    clés /64). Les tables ne grossissent pas (lignes bornées), mais chaque
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

  const drinks = parseLocalDrinksReport(parsed.body)
  const report = parseLocalGameReport(parsed.body)
  if (!drinks && !report) return new Response(null, { status: 400 })

  const global = checkRateLimit('local-game:global', GLOBAL_LIMIT_PER_WINDOW, RATE_WINDOW_MS)
  if (!global.ok) return tooMany(global.retryAfterSec)

  if (drinks) {
    await recordGameDrinks({ gameId: drinks.gameId, mode: 'local', drinks: drinks.drinks, plays: drinks.plays })
  } else if (report) {
    await recordLocalGameEvent(report)
  }
  return new Response(null, { status: 204 })
})
