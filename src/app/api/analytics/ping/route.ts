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
import { parsePingBody, planPing } from '@/lib/analytics-ping'
import { recordAccountBeat } from '@/lib/account-visits-server'
import { recordIpSeen } from '@/lib/ip-history-server'
import { runRetentionSweep } from '@/lib/retention-sweep'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'

export const runtime = 'nodejs'

/** Corps JSON, ou null s'il est absent, invalide ou d'un autre type. */
async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await request.json()
  } catch {
    return null /* corps vide ou invalide */
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    // Accord donné sous le libellé actuel seulement ('2') : l'ancien '1'
    // (« statistiques anonymes ») ne vaut plus accord et le bandeau se repose.
    const consentValue = cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value
    const hasConsent = isAnalyticsConsentGranted(consentValue)

    // lp_vid sans accord valable : identifiant de suivi qui ne sert plus à rien,
    // retiré dans la réponse et plus jamais lu ici.
    const dropVisitorCookie = !hasConsent && Boolean(visitorId)
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

    // Ménage RGPD au passage (throttlé) : purge des données au-delà des
    // durées annoncées dans la politique de confidentialité.
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
    // (art. 82 loi I&L).
    const createdVisitorId = writes.includes('visitor-cookie') ? createVisitorId() : null
    if (createdVisitorId) visitorId = createdVisitorId
    // Vrai seulement si la présence du navigateur porte la liste reçue : le
    // client ne tient la synchro pour faite qu'à cette condition, et la
    // renvoie sinon (première visite : aucune présence avant le premier
    // signal consenti).
    let localPlayersSynced = false
    if (visitorId) {
      if (writes.includes('visitor-beat') || writes.includes('visitor-view')) {
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
}
