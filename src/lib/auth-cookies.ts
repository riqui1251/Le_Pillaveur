export const SESSION_COOKIE = 'lp_session'
export const VISITOR_COOKIE = 'lp_vid'
export const LOCAL_PLAY_COOKIE = 'lp_local_play'
export const AGE_VERIFIED_COOKIE = 'lp_age_verified'

/** Durée du cookie de vérification d'âge : 1 an */
export const AGE_VERIFIED_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Choix de l'utilisateur sur les statistiques de visite. Le cookie lp_vid et
 * le suivi individuel (SitePresence, IpSeenLog visiteur, DailyVisitor, visites
 * du compte) exigent le consentement (art. 82 loi I&L) : notre mesure
 * d'audience n'entre pas dans l'exemption CNIL car elle n'est pas anonyme (IP
 * par visiteur et visites par compte consultables en Supervision). 1 an, comme
 * l'âge, pour ne re-poser la question qu'une fois par an (max CNIL : 13 mois).
 */
export const ANALYTICS_CONSENT_COOKIE = 'lp_analytics_consent'
export const ANALYTICS_CONSENT_MAX_AGE = AGE_VERIFIED_MAX_AGE

/**
 * Valeurs VERSIONNÉES du choix. '2' = accord donné sous le libellé qui dit
 * ce qui est réellement collecté (identifiant de navigateur, IP, pays,
 * appareil, durée des visites, rattachement au compte). '0' = refus.
 *
 * L'ancienne valeur '1' a été donnée sous un libellé faux (« statistiques
 * anonymes », « servent uniquement à compter les visites ») : elle ne vaut
 * PLUS accord, et le bandeau se repose à ces navigateurs. Toute nouvelle
 * version du libellé qui élargit la collecte doit passer à '3'.
 */
export const ANALYTICS_CONSENT_GRANTED = '2'
export const ANALYTICS_CONSENT_REFUSED = '0'
/**
 * Ancien accord, ni accord ni refus. Reconnu pour une seule chose : effacer ce
 * que ce navigateur a laissé sous lui (route du ping), puis retirer lp_vid.
 */
export const ANALYTICS_CONSENT_LEGACY = '1'

/**
 * Jour de Paris de la mise en production du consentement de version 2 (lot 6) :
 * début des visites de compte, et jour où les mesures d'audience repartent de
 * zéro (bandeau reposé à tous). À recaler si le déploiement glisse, comme
 * HONEST_PRESENCE_SINCE (src/lib/heartbeat.ts).
 */
export const ANALYTICS_CONSENT_V2_SINCE = '2026-09-13'

/** Accord valable : seulement la version courante ('2'), jamais '1'. */
export function isAnalyticsConsentGranted(value: string | null | undefined): boolean {
  return value === ANALYTICS_CONSENT_GRANTED
}

/**
 * Identifiant de navigateur (lp_vid) de la requête, SEULEMENT si l'accord de
 * la version courante l'accompagne ; sinon null. Un navigateur resté à '1'
 * (ou dont le choix a expiré) garde parfois son cookie d'un an : ce traceur
 * ne doit plus être lu ni rattaché à rien (art. 82 loi I&L). Pur : le magasin
 * de cookies de next/headers est passé par l'appelant.
 */
export function readConsentedVisitorId(cookieStore: {
  get(name: string): { value: string } | undefined
}): string | null {
  if (!isAnalyticsConsentGranted(cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value)) return null
  return cookieStore.get(VISITOR_COOKIE)?.value || null
}

/**
 * Le navigateur a répondu à la question ACTUELLE (accord '2' ou refus '0').
 * Faux pour l'absence de cookie, pour l'ancienne valeur '1' et pour toute
 * valeur inconnue : le bandeau doit alors être proposé.
 */
export function hasAnsweredAnalyticsConsent(value: string | null | undefined): boolean {
  return value === ANALYTICS_CONSENT_GRANTED || value === ANALYTICS_CONSENT_REFUSED
}
