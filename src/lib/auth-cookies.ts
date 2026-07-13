export const SESSION_COOKIE = 'lp_session'
export const VISITOR_COOKIE = 'lp_vid'
export const LOCAL_PLAY_COOKIE = 'lp_local_play'
export const AGE_VERIFIED_COOKIE = 'lp_age_verified'

/** Durée du cookie de vérification d'âge : 1 an */
export const AGE_VERIFIED_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Choix de l'utilisateur sur les statistiques de visite ('1' accepté / '0'
 * refusé). Le cookie lp_vid et le suivi individuel (SitePresence, IpSeenLog
 * visiteur, pseudos locaux) exigent le consentement (art. 82 loi I&L) : notre
 * mesure d'audience n'entre pas dans l'exemption CNIL car elle n'est pas
 * anonyme (IP par visiteur consultables en Supervision). 1 an, comme l'âge,
 * pour ne re-poser la question qu'une fois par an (max CNIL : 13 mois).
 */
export const ANALYTICS_CONSENT_COOKIE = 'lp_analytics_consent'
export const ANALYTICS_CONSENT_MAX_AGE = AGE_VERIFIED_MAX_AGE
