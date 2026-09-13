import { NextResponse, after } from 'next/server'
import { cookies } from 'next/headers'
import {
  AGE_VERIFIED_COOKIE,
  AGE_VERIFIED_MAX_AGE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_MAX_AGE,
  ANALYTICS_CONSENT_REFUSED,
  VISITOR_COOKIE,
  isAnalyticsConsentGranted,
} from '@/lib/auth-cookies'
import { getCurrentUser } from '@/lib/auth-server'
import { eraseVisitorTracking } from '@/lib/analytics-server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * Délai du second passage d'effacement. Un battement parti d'un autre onglet
 * avec l'ancien cookie juste avant le clic a lu le consentement AVANT ses
 * écritures : s'il écrit après le premier passage, il recrée présence, jour de
 * visite ou visite du compte, que plus rien ne désignerait (lp_vid retiré).
 * Quelques secondes couvrent largement une requête de ping. Revers accepté :
 * un nouvel accord donné dans ces secondes perd le début de sa visite.
 */
const ERASE_RETRY_DELAY_MS = 5_000

/** Ce qu'un refus doit effacer, capturé AVANT de retirer les cookies. */
type ErasureTargets = {
  /** lp_vid de la requête : données du navigateur. */
  visitorId: string | null
  /** Compte connecté, seulement pour un vrai RETRAIT (accord '2' en vigueur sur ce navigateur). */
  userId: string | null
}

/**
 * Retrait (ou refus) du consentement : on efface ce qui ne reposait que sur
 * lui, sans attendre les purges à 6 et 13 mois (art. 7(3) et 17(1)(b)).
 * - Données du NAVIGATEUR (lp_vid) : présence (IP, pays, appareil, pseudos
 *   locaux, dernier compte vu), historique IP `visitor:<vid>`, jours de visite.
 * - Visites du COMPTE connecté, si ce navigateur avait accepté : le choix est
 *   porté par le navigateur mais les visites par le compte, sans trace de
 *   l'appareil émetteur ; un retrait les efface donc toutes (lecture la plus
 *   protectrice).
 * Chaque bloc a son propre try/catch : un effacement raté est journalisé mais
 * n'empêche jamais d'enregistrer le choix, ni l'autre effacement.
 */
async function eraseConsentBasedData({ visitorId, userId }: ErasureTargets): Promise<void> {
  if (visitorId) {
    try {
      await eraseVisitorTracking(visitorId, { dailyVisitors: true })
    } catch (error) {
      console.error('accept-age: effacement des données du navigateur impossible:', error)
    }
  }

  if (userId) {
    try {
      await prisma.accountVisit.deleteMany({ where: { userId } })
    } catch (error) {
      console.error('accept-age: effacement des visites du compte impossible:', error)
    }
  }
}

export async function POST(request: Request) {
  let analytics = false
  // Version du libellé que le client a AFFICHÉ. Seul un accord qui la porte
  // vaut '2' : un onglet chargé avant le changement de libellé (ancien
  // JavaScript, « statistiques anonymes ») envoie { analytics: true } sans
  // version, et cet accord-là ne vaut rien.
  let consentVersion: unknown = null
  // Choix donné depuis le BANDEAU statistiques (rouvert par le pied de page,
  // y compris sur une page de lecture avant tout portail) : il ne certifie
  // pas l'âge, seul le portail 18+ le fait.
  let consentOnly = false
  try {
    const body = await request.json()
    analytics = body?.analytics === true
    consentVersion = body?.consentVersion
    consentOnly = body?.consentOnly === true
  } catch {
    // Corps vide (ancien client) : refus par défaut, le consentement ne se présume pas.
  }

  const granted = analytics && consentVersion === ANALYTICS_CONSENT_GRANTED
  // Accord sans version (ancien JavaScript) : ni accord ni refus. Aucun cookie
  // de choix n'est posé et rien n'est effacé ; le bandeau actuel reposera la
  // question au prochain chargement.
  const refused = !analytics

  if (refused) {
    // AVANT de retirer le cookie : c'est lui qui désigne les lignes du navigateur.
    const cookieStore = await cookies()
    // Visites du compte : seulement si CE navigateur avait accepté ('2') — un
    // vrai retrait. Refuser sur un nouvel appareil (case du portail laissée
    // décochée) ou au bandeau reposé à un navigateur resté à '1' n'est le
    // retrait d'aucun accord : les visites enregistrées ailleurs, sous un
    // accord toujours valable, restent.
    let userId: string | null = null
    if (isAnalyticsConsentGranted(cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value)) {
      try {
        userId = (await getCurrentUser())?.id ?? null
      } catch (error) {
        console.error('accept-age: lecture du compte connecté impossible:', error)
      }
    }
    const targets: ErasureTargets = {
      visitorId: cookieStore.get(VISITOR_COOKIE)?.value || null,
      userId,
    }
    await eraseConsentBasedData(targets)
    // Second passage après la réponse : rattrape l'écriture d'un battement
    // concurrent (voir ERASE_RETRY_DELAY_MS). Mêmes cibles, déjà capturées.
    if (targets.visitorId || targets.userId) {
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, ERASE_RETRY_DELAY_MS))
        await eraseConsentBasedData(targets)
      })
    }
  }

  const response = NextResponse.json({ ok: true })
  if (!consentOnly) {
    response.cookies.set(AGE_VERIFIED_COOKIE, '1', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AGE_VERIFIED_MAX_AGE,
    })
  }
  // Valeur versionnée : '2' marque un accord donné sous le libellé actuel.
  if (granted || refused) {
    response.cookies.set(
      ANALYTICS_CONSENT_COOKIE,
      granted ? ANALYTICS_CONSENT_GRANTED : ANALYTICS_CONSENT_REFUSED,
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ANALYTICS_CONSENT_MAX_AGE,
      }
    )
  }
  if (refused) {
    // Refus : on retire aussi l'identifiant visiteur déjà posé, sinon le
    // suivi continuerait avec un cookie hérité d'avant le choix.
    response.cookies.delete(VISITOR_COOKIE)
  }
  return response
}
