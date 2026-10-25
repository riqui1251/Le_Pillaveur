import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  VISITOR_COOKIE,
  createVisitorId,
  getCurrentSession,
  renewSessionIfStale,
  sessionCookieOptions,
  visitorCookieOptions,
} from '@/lib/auth-server'
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_LEGACY,
  isAnalyticsConsentGranted,
} from '@/lib/auth-cookies'
import {
  eraseVisitorTracking,
  recordAccountPresence,
  recordVisitorPing,
  syncVisitorLocalPlayers,
} from '@/lib/analytics-server'
import {
  PING_NETWORK_LIMIT_PER_MINUTE,
  PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR,
  PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR,
  isVisitorId,
  parsePingBody,
  planPing,
} from '@/lib/analytics-ping'
import { recordAccountBeat } from '@/lib/account-visits-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { recordIpSeen } from '@/lib/ip-history-server'
import { prisma } from '@/lib/prisma'
import { runRetentionSweep } from '@/lib/retention-sweep'
import { checkRateLimit, networkRateLimitKey, readJsonBodyLimited } from '@/lib/rate-limit'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'

export const runtime = 'nodejs'

/**
 * Plafond du corps du ping. La route est PUBLIQUE — aucune session exigée —
 * et c'est la plus appelée du site : un `request.json()` à cru y
 * matérialisait en mémoire n'importe quel corps, de n'importe qui. Le bornage
 * des pseudos (MAX_VISITOR_LOCAL_PLAYER_NAMES, visitor-local-players.ts)
 * arrive APRÈS le parse, donc trop tard. Avec connection_limit=1
 * (src/lib/prisma.ts), un pic mémoire sur ce chemin pénalise tout le
 * processus, pas seulement l'appelant.
 *
 * 8 Ko : le corps se réduit à `{ view, beat, active, inGame, localPlayers,
 * localPlayerNames[] }`, la liste étant elle-même bornée à quelques pseudos.
 * Même plafond que les routes auth (API_BODY_MAX_BYTES).
 */
const PING_BODY_MAX_BYTES = 8 * 1024

/**
 * Corps JSON, ou null s'il est absent, invalide, trop gros ou d'un autre type.
 * Contrat inchangé pour l'appelant : `parsePingBody(null)` rend déjà un corps
 * vide, un ping hors gabarit n'écrit donc simplement rien.
 */
async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  const parsed = await readJsonBodyLimited<unknown>(request, PING_BODY_MAX_BYTES)
  return parsed.ok ? parsed.body : null /* corps vide, invalide ou trop gros */
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Une présence de plus peut-elle naître (voir PING_NEW_PRESENCE_*) ? Quota du
 * réseau d'abord : un réseau déjà refusé n'use pas le plafond commun.
 */
function admitNewPresence(request: Request): boolean {
  const network = checkRateLimit(
    networkRateLimitKey(request, 'analytics-ping:new-presence'),
    PING_NEW_PRESENCE_NETWORK_LIMIT_PER_HOUR,
    HOUR_MS
  )
  if (!network.ok) return false
  return checkRateLimit(
    'analytics-ping:new-presence:global',
    PING_NEW_PRESENCE_GLOBAL_CAP_PER_HOUR,
    HOUR_MS
  ).ok
}

async function presenceExists(visitorId: string): Promise<boolean> {
  const row = await prisma.sitePresence.findUnique({
    where: { visitorId },
    select: { visitorId: true },
  })
  return row !== null
}

export const POST = withApiRoute('analytics ping POST', async (request: Request) => {
  // Avant toute lecture et toute écriture : chaque ping coûte des écritures
  // SQLite sur une connexion unique.
  const quota = checkRateLimit(
    networkRateLimitKey(request, 'analytics-ping'),
    PING_NETWORK_LIMIT_PER_MINUTE,
    MINUTE_MS
  )
  if (!quota.ok) return apiError('rate_limited', 429, { retryAfterSec: quota.retryAfterSec })

  try {
    const cookieStore = await cookies()
    const rawVisitorId = cookieStore.get(VISITOR_COOKIE)?.value
    // Hors du format de createVisitorId : valeur forgée, tenue pour absente.
    let visitorId = isVisitorId(rawVisitorId) ? rawVisitorId : undefined
    // Accord donné sous le libellé actuel seulement ('2') : l'ancien '1'
    // (« statistiques anonymes ») ne vaut plus accord et le bandeau se repose.
    const consentValue = cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value
    const hasConsent = isAnalyticsConsentGranted(consentValue)

    // lp_vid sans accord valable : identifiant de suivi qui ne sert plus à rien,
    // retiré dans la réponse et plus jamais lu ici.
    const dropVisitorCookie = !hasConsent && Boolean(rawVisitorId)
    if (dropVisitorCookie && visitorId && consentValue === ANALYTICS_CONSENT_LEGACY) {
      // Navigateur resté à l'ancien '1' : on efface ce qu'il a laissé sous cet
      // accord, y compris ce que l'ancien conteneur a pu réécrire APRÈS la
      // migration de nettoyage pendant le déploiement. Présence liée à un
      // compte comprise : sans lp_vid, plus aucun refus ne pourrait la
      // désigner. Jours de visite gardés, comme la migration. Une seule fois :
      // la réponse retire le cookie. Un échec ne prive pas le compte du
      // renouvellement de sa session.
      try {
        await eraseVisitorTracking(visitorId, { dailyVisitors: false })
      } catch (error) {
        console.error("analytics ping: effacement des données de l'ancien accord impossible:", error)
      }
    }
    if (dropVisitorCookie) visitorId = undefined

    const { country, ip } = resolveGeoFromRequest(request)
    const device = deviceKindFromHeader(request)
    const session = await getCurrentSession()
    const currentUser = session?.user ?? null

    // Ménage RGPD au passage (throttlé), désormais en FILET : le chemin
    // nominal est le planificateur (src/lib/scheduler.ts), qui balaie chaque
    // nuit à 4 h 30 heure de Paris. Sans `force`, cet appel ne repasse qu'au
    // plus une fois toutes les 6 h — il ne sert que si le planificateur ne
    // s'est pas posé (ancien conteneur, runtime sans instrumentation).
    void runRetentionSweep()

    // Corps lu AVANT tout branchement sur le consentement : c'est lui qui dit
    // s'il s'agit d'une vue, d'un battement ou d'une synchro de pseudos, donc
    // ce qui peut être écrit. Toute la décision est dans planPing (pur, testé) ;
    // cette route ne fait qu'exécuter la liste, dans son ordre.
    const body = parsePingBody(await readJsonBody(request))
    const writes = planPing({
      view: body.view,
      beat: body.beat,
      syncLocalPlayers: body.syncLocalPlayers,
      hasConsent,
      hasSession: currentUser !== null,
      accountRole: currentUser?.role ?? null,
      hasVisitorId: Boolean(visitorId),
    })

    // Dernière activité du compte (intérêt légitime) : battement seulement,
    // avec ou sans consentement.
    if (currentUser && writes.includes('account')) {
      await recordAccountPresence(currentUser.id, { country, ip, device })
    }

    // Visite du compte (durées par visite) : consentement et rôle 'user'
    // seulement, décidés par planPing. Ne lève jamais : une mesure d'usage ne
    // prive pas le compte du renouvellement de sa session plus bas.
    if (currentUser && writes.includes('account-visit')) {
      await recordAccountBeat(currentUser.id, {
        active: body.active,
        inGame: body.inGame,
        device,
      })
    }

    // Suivi du navigateur : planPing ne le prévoit qu'avec consentement
    // (art. 82 loi I&L). Une présence qui NAÎT — cookie neuf, ou lp_vid que
    // la base ne connaît pas (un script en forge un par requête) — passe par
    // admitNewPresence ; refusée, rien n'est écrit pour le navigateur.
    const wantsPresence = writes.includes('visitor-beat') || writes.includes('visitor-view')
    let createdVisitorId: string | null = null
    if (writes.includes('visitor-cookie')) {
      if (admitNewPresence(request)) {
        createdVisitorId = createVisitorId()
        visitorId = createdVisitorId
      }
    } else if (
      visitorId &&
      wantsPresence &&
      !(await presenceExists(visitorId)) &&
      !admitNewPresence(request)
    ) {
      visitorId = undefined
    }
    // Vrai seulement si la présence du navigateur porte la liste reçue : le
    // client ne tient la synchro pour faite qu'à cette condition, et la
    // renvoie sinon (première visite : aucune présence avant le premier
    // signal consenti).
    let localPlayersSynced = false
    if (visitorId) {
      if (wantsPresence) {
        await recordVisitorPing(visitorId, {
          country,
          ip,
          userId: currentUser?.id ?? null,
          device,
        })
      }
      // Battement sans session : historique IP du navigateur (`visitor:<vid>`).
      if (writes.includes('visitor-ip')) await recordIpSeen(null, visitorId, ip, country)
      if (writes.includes('local-players')) {
        localPlayersSynced = await syncVisitorLocalPlayers(visitorId, body.localPlayerNames)
      }
    }

    const response = NextResponse.json({ ok: true, localPlayersSynced })
    if (createdVisitorId) response.cookies.set(visitorCookieOptions(createdVisitorId))
    if (dropVisitorCookie) response.cookies.delete(VISITOR_COOKIE)

    // Session glissante (au plus une écriture par jour), avec ou sans
    // consentement — le cookie de session est strictement nécessaire. Un
    // battement seulement : une vue, une synchro de pseudos ou le corps d'un
    // ancien onglet ne sont pas un usage et ne la prolongent pas (chaque
    // chargement complet la prolonge déjà, via GET /api/auth/me). En dernier,
    // pour qu'une erreur des écritures précédentes (→ 500 sans cookie) ne
    // laisse jamais une base prolongée derrière un cookie qui expire quand même.
    if (session && body.beat) {
      const days = await renewSessionIfStale(session)
      if (days) response.cookies.set(sessionCookieOptions(session.token, days))
    }
    return response
  } catch (error) {
    console.error('analytics ping error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
})
