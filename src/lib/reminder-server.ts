import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getBanState } from '@/lib/ban-server'
import { errorTrace } from '@/lib/error-trace'
import {
  appBaseUrl,
  isEmailSendingConfigured,
  sendFridayReminderEmail,
  sendReminderConfirmEmail,
  type FridayReminderLinks,
} from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import { parisDayOffset, parisDayStartUtc, parisDayString } from '@/lib/paris-time'
import { isWellFormedReminderToken } from '@/lib/reminder-token'
import { isUserRole } from '@/lib/roles'

/**
 * RAPPEL « ON REMET ÇA ? » DU VENDREDI — un e-mail par semaine au plus, sur
 * accord EXPLICITE (carte de fin de partie ou interrupteur de la page Compte).
 *
 * Le constat : les parties tombent le vendredi et le dimanche soir, et 2
 * joueurs sur 57 reviennent pour une deuxième soirée. Rien ne leur rappelle
 * que le site existe entre deux soirées ; le vendredi en fin d'après-midi est
 * le moment où la soirée se décide.
 *
 * ADRESSE PROUVÉE AVANT TOUT ENVOI RÉCURRENT. L'inscription par e-mail ne
 * vérifie pas l'adresse : sans preuve, n'importe qui pouvait inscrire celle
 * d'un tiers et lui faire envoyer un e-mail chaque vendredi (consentement
 * indémontrable, plaintes pour spam qui font bloquer le domaine d'envoi —
 * réinitialisations de mot de passe comprises). D'où :
 *  - adresse déjà prouvée (User.emailVerified posé, ou compte Google —
 *    Google ne délivre l'adresse que vérifiée, cf. google-auth-server) :
 *    l'accord est enregistré tout de suite ;
 *  - sinon, DOUBLE OPT-IN : l'accord envoie un e-mail de confirmation dont
 *    le lien mène à une page où l'on CONFIRME d'un bouton (un POST : les
 *    antivirus de messagerie qui ouvrent les liens ne confirment rien). Le
 *    clic pose l'accord ET User.emailVerified — l'adresse est désormais
 *    prouvée, les accords suivants seront immédiats.
 *
 * ENVOI CONFIGURÉ OU RIEN. Sans clé Resend (la production aujourd'hui),
 * l'état est 'unavailable' : la carte et l'interrupteur disparaissent au
 * lieu de promettre un e-mail qui ne partira jamais.
 *
 * Données : l'adresse que le compte a déjà, et trois colonnes sur User —
 * date de l'accord (null = aucun rappel), dernier e-mail du rappel envoyé
 * (rappel du vendredi OU e-mail de confirmation : au plus un e-mail lié au
 * rappel par semaine, confirmation renvoyable une fois par jour), jeton
 * aléatoire des liens (confirmation, désinscription). Elles disparaissent
 * avec le compte. L'e-mail ne porte AUCUNE donnée de partie.
 *
 * RGPD des journaux : volumes et noms de classes d'erreur seulement — jamais
 * une adresse, un pseudo ni un jeton.
 */

/** Pas de rappel à qui est passé sur le site dans les 12 dernières heures : il n'a pas oublié. */
export const REMINDER_QUIET_MS = 12 * 60 * 60 * 1000

/**
 * Plafond d'envois par tour. Resend limite à 2 requêtes par seconde par
 * défaut, et le tour n'a aucune raison de durer : 200 envois espacés de
 * 600 ms tiennent en deux minutes. Au-delà (succès imprévu), les suivants
 * attendent le vendredi d'après — mieux qu'un tour sans fin qui ferait
 * refuser le domaine d'envoi.
 */
export const REMINDER_MAX_SENDS_PER_RUN = 200

/** Lecture par lots : jamais toute la table User en mémoire. */
export const REMINDER_BATCH_SIZE = 50

/** Espacement entre deux envois (≈ 1,6 envoi par seconde, sous le plafond Resend). */
const SEND_PAUSE_MS = 600

/**
 * Échecs d'envoi CONSÉCUTIFS au-delà desquels le tour s'arrête : clé
 * révoquée, quota épuisé, domaine suspendu. Continuer ne ferait qu'empiler
 * des refus (et des marques de « déjà envoyé » à défaire).
 */
const MAX_CONSECUTIVE_FAILURES = 5

/** Validité du lien de confirmation : une semaine, puis il faut le redemander. */
export const REMINDER_CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Délai avant de RENVOYER l'e-mail de confirmation d'un même compte. Un jour :
 * qui ne l'a pas reçu le cherchera d'abord dans ses indésirables, et un
 * script ne peut pas faire de ce bouton un canon à e-mails vers une adresse
 * qui n'a rien demandé (une adresse = un compte, et un e-mail par jour au
 * plus, jamais confirmé, jamais récurrent).
 */
export const REMINDER_CONFIRM_RESEND_MS = 24 * 60 * 60 * 1000

/**
 * Plafond GLOBAL d'e-mails de confirmation par heure, en mémoire : des
 * comptes créés en série pour viser autant d'adresses ne doivent pas faire
 * partir des centaines d'e-mails non sollicités — c'est la réputation du
 * domaine d'envoi (et la réinitialisation des mots de passe) qui paierait.
 */
const CONFIRM_GLOBAL_LIMIT = 60
const CONFIRM_GLOBAL_WINDOW_MS = 60 * 60 * 1000

/** Jeton des liens (confirmation, désinscription) : 32 octets aléatoires, base64url (43 caractères). */
export function generateReminderToken(): string {
  return randomBytes(32).toString('base64url')
}

export { isWellFormedReminderToken }

/**
 * Début de la semaine en cours à Paris : lundi 00:00, en instant UTC. Un
 * rappel envoyé avant cette borne appartient à une semaine passée.
 *
 * Arithmétique sur le JOUR de Paris (paris-time), jamais sur des heures :
 * reculer de N × 24 h se tromperait d'une heure la semaine d'un changement
 * d'heure.
 */
export function parisWeekStartUtc(now: Date): Date {
  const [year, month, day] = parisDayString(now).split('-').map(Number)
  // Jour de la semaine de la date de Paris (0 = dimanche), lu à midi UTC.
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  return parisDayStartUtc(parisDayOffset(daysSinceMonday, now))
}

/** Ce que le tour lit d'un compte inscrit. */
export type ReminderCandidate = {
  id: string
  email: string | null
  locale: string
  role: string
  isGuest: boolean
  banType: string | null
  bannedUntil: Date | null
  banComment: string | null
  bannedAt: Date | null
  lastSeenAt: Date | null
  emailVerified: Date | null
  reminderOptInAt: Date | null
  reminderLastSentAt: Date | null
  reminderToken: string | null
}

/** Adresse plausible : de quoi ne pas confier une valeur vide ou absurde à Resend. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Le compte doit-il recevoir le rappel de CETTE semaine ? Pure, testée — et
 * rejouée sur chaque ligne lue, en plus du filtre de la requête : c'est elle
 * qui fait foi.
 *
 *  - accord donné (reminderOptInAt) : jamais d'e-mail sans ;
 *  - adresse PROUVÉE (emailVerified) : jamais d'envoi récurrent vers une
 *    adresse dont rien ne dit qu'elle est au joueur ;
 *  - adresse plausible, compte non invité (un invité n'a pas d'adresse) ;
 *  - non banni (ban temporaire échu compris comme levé, getBanState) ;
 *  - rôle connu : joueurs ET équipe (modérateurs, admins, fondateurs). Le
 *    rappel suit un accord personnel, pas une fonction — un membre de
 *    l'équipe qui l'a demandé le reçoit comme tout le monde ; un rôle
 *    inconnu (ligne corrompue, rôle retiré du code) est écarté par prudence ;
 *  - pas déjà servi cette semaine (dernier e-mail du rappel avant lundi
 *    00:00 Paris — l'e-mail de confirmation compte : un accord confirmé le
 *    mercredi n'attend pas un second e-mail le vendredi même) ;
 *  - pas vu sur le site depuis 12 h : qui vient de jouer n'a pas à être
 *    relancé le soir même.
 */
export function isReminderRecipient(
  candidate: ReminderCandidate,
  context: { now: Date; weekStart: Date }
): boolean {
  if (!candidate.reminderOptInAt) return false
  if (!candidate.emailVerified) return false
  if (candidate.isGuest) return false
  if (!candidate.email || !EMAIL_RE.test(candidate.email.trim())) return false
  if (!isUserRole(candidate.role)) return false
  if (getBanState(candidate).banned) return false
  if (candidate.reminderLastSentAt && candidate.reminderLastSentAt >= context.weekStart) return false
  if (candidate.lastSeenAt && context.now.getTime() - candidate.lastSeenAt.getTime() < REMINDER_QUIET_MS) {
    return false
  }
  return true
}

/** Le filtre ci-dessus appliqué à une liste — pure, testée. */
export function selectReminderRecipients(
  candidates: readonly ReminderCandidate[],
  now: Date
): ReminderCandidate[] {
  const weekStart = parisWeekStartUtc(now)
  return candidates.filter((candidate) => isReminderRecipient(candidate, { now, weekStart }))
}

const LOCALES = new Set(['fr', 'en', 'es', 'it'])

function linkLocale(locale: string | null | undefined): string {
  return locale && LOCALES.has(locale) ? locale : 'fr'
}

/**
 * Liens de l'e-mail, dans la langue du compte (les pages sont toujours
 * préfixées : localePrefix 'always'). Pure, testée.
 *
 * Deux liens de désinscription, deux usages :
 *  - `unsubscribe` (corps de l'e-mail) : une PAGE qui demande de confirmer
 *    d'un bouton (POST). Un simple GET ne coupe rien — les passerelles de
 *    messagerie qui ouvrent chaque lien à la réception (Safe Links de
 *    Microsoft Defender, Mimecast, Proofpoint) désinscrivaient le joueur
 *    avant même qu'il ouvre l'e-mail, sans que personne le sache ;
 *  - `unsubscribeOneClick` (en-tête List-Unsubscribe) : la route qui ne
 *    désinscrit qu'en POST « List-Unsubscribe=One-Click » (RFC 8058, le
 *    bouton de Gmail ou Yahoo) ; un GET n'y écrit rien.
 * La langue voyage dans le lien : la page ne la déduit JAMAIS du jeton, sans
 * quoi deux jetons (connu, inconnu) mèneraient à deux pages différentes.
 */
export function buildReminderLinks(baseUrl: string, locale: string, token: string): FridayReminderLinks {
  const base = baseUrl.replace(/\/+$/, '')
  const lang = linkLocale(locale)
  const encoded = encodeURIComponent(token)
  return {
    games: `${base}/${lang}/jeux`,
    account: `${base}/${lang}/compte?focus=rappel`,
    unsubscribe: `${base}/${lang}/compte/rappel?token=${encoded}`,
    unsubscribeOneClick: `${base}/api/reminder/unsubscribe?token=${encoded}&lang=${lang}`,
  }
}

/** Lien de l'e-mail de confirmation : la page qui confirme d'un bouton. Pure, testée. */
export function buildReminderConfirmLink(baseUrl: string, locale: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/${linkLocale(locale)}/compte/rappel/confirmer?token=${encodeURIComponent(token)}`
}

/**
 * Page de désinscription, dans la langue du LIEN (jamais celle du compte).
 * `token` : la page qui demande de confirmer ; sans : la page « c'est noté ».
 */
export function unsubscribeLandingPath(lang: string | null, token?: string | null): string {
  const path = `/${linkLocale(lang)}/compte/rappel`
  return token && isWellFormedReminderToken(token) ? `${path}?token=${encodeURIComponent(token)}` : path
}

/** Issue d'une confirmation, telle que la page l'affiche. */
export type ReminderConfirmOutcome = 'active' | 'invalid'

/** Page de confirmation de l'accord (langue du lien) : le formulaire, ou son issue. */
export function confirmLandingPath(
  lang: string | null,
  target: { token: string } | { outcome: ReminderConfirmOutcome }
): string {
  const path = `/${linkLocale(lang)}/compte/rappel/confirmer`
  if ('token' in target) {
    return isWellFormedReminderToken(target.token) ? `${path}?token=${encodeURIComponent(target.token)}` : path
  }
  return `${path}?etat=${target.outcome === 'active' ? 'actif' : 'invalide'}`
}

// ---------------------------------------------------------------------------
// Accord et retrait (routes /api/me/reminder, /api/reminder/*)
// ---------------------------------------------------------------------------

/**
 * État du rappel pour la page Compte et la carte de fin de partie :
 * - 'unavailable' : envoi d'e-mails non configuré sur ce serveur, invité ou
 *   compte sans adresse — rien à proposer, rien à afficher ;
 * - 'on' / 'off' : accord donné ou non ;
 * - 'pending' : e-mail de confirmation envoyé, lien encore valable, pas
 *   encore confirmé.
 */
export type ReminderStatus = 'on' | 'off' | 'pending' | 'unavailable'

/** Ce que l'accord lit d'un compte. */
export type ReminderAccount = {
  email: string | null
  isGuest: boolean
  passwordHash: string
  emailVerified: Date | null
  reminderOptInAt: Date | null
  reminderLastSentAt: Date | null
  reminderToken: string | null
}

const ACCOUNT_SELECT = {
  email: true,
  isGuest: true,
  passwordHash: true,
  emailVerified: true,
  reminderOptInAt: true,
  reminderLastSentAt: true,
  reminderToken: true,
} as const

/**
 * L'adresse du compte est-elle PROUVÉE ? Pure, testée.
 *  - emailVerified posé (confirmation d'un e-mail, connexion Google) ;
 *  - ou compte Google : sans mot de passe, il n'a pu naître que d'une
 *    connexion (ou d'une sauvegarde d'invité) Google, qui ne délivre
 *    l'adresse que vérifiée — même partition que account-kind-server
 *    (« google » = non invité, adresse, passwordHash vide). Couvre les
 *    comptes Google d'avant l'écriture d'emailVerified.
 * Un compte e-mail + mot de passe, lui, n'a rien prouvé : l'inscription ne
 * vérifie pas l'adresse.
 */
export function isAddressProven(account: Pick<ReminderAccount, 'email' | 'isGuest' | 'passwordHash' | 'emailVerified'>): boolean {
  if (account.isGuest || !account.email) return false
  return Boolean(account.emailVerified) || account.passwordHash === ''
}

/**
 * Confirmation en attente : adresse non prouvée, pas d'accord, et un e-mail
 * de confirmation parti il y a moins d'une semaine (le dernier e-mail du
 * rappel, pour un compte qui n'a jamais été inscrit, ne peut être que
 * celui-là). Pure, testée.
 */
export function isConfirmationPending(account: ReminderAccount, now: Date): boolean {
  if (account.reminderOptInAt || account.emailVerified || !account.reminderToken) return false
  if (!account.reminderLastSentAt) return false
  return now.getTime() - account.reminderLastSentAt.getTime() < REMINDER_CONFIRM_TTL_MS
}

/** État d'un compte — pure, testée. `configured` : l'envoi d'e-mails est possible ici. */
export function reminderStatusOf(
  account: ReminderAccount | null,
  context: { now: Date; configured: boolean }
): ReminderStatus {
  if (!context.configured) return 'unavailable'
  if (!account || account.isGuest || !account.email) return 'unavailable'
  if (account.reminderOptInAt) return 'on'
  return isConfirmationPending(account, context.now) ? 'pending' : 'off'
}

type StatusOptions = { now?: Date; isConfigured?: () => boolean }

export async function getReminderStatus(userId: string, options: StatusOptions = {}): Promise<ReminderStatus> {
  const configured = (options.isConfigured ?? isEmailSendingConfigured)()
  if (!configured) return 'unavailable'
  const account = await prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT })
  return reminderStatusOf(account, { now: options.now ?? new Date(), configured })
}

/** Issue d'une demande d'accord. */
export type ReminderOptInResult =
  | { status: ReminderStatus }
  /** Plafond global d'e-mails de confirmation atteint : réessayer plus tard. */
  | { status: 'off'; retryAfterSec: number }

type OptInOptions = StatusOptions & {
  /** Remplaçable pour les tests ; par défaut, Resend. */
  sendConfirm?: typeof sendReminderConfirmEmail
  locale?: string
}

/**
 * Demande d'accord (bouton de la carte, interrupteur du compte).
 *
 * - envoi non configuré, invité, compte sans adresse : 'unavailable' ;
 * - déjà inscrit : 'on', rien n'est réécrit (la date de l'accord est la
 *   preuve du consentement, le jeton est celui des liens déjà envoyés) ;
 * - adresse prouvée : l'accord est posé tout de suite → 'on' (et
 *   emailVerified, pour un compte Google qui ne l'avait pas encore) ;
 * - sinon : e-mail de confirmation → 'pending'. Déjà en attente depuis
 *   moins d'un jour : rien de renvoyé, 'pending'. L'envoi est d'abord
 *   RÉSERVÉ (reminderLastSentAt posé par une écriture conditionnelle) : deux
 *   touchers simultanés n'envoient qu'un e-mail ; un envoi raté rend la
 *   réservation et LÈVE (la route répond 502).
 */
export async function optInReminder(userId: string, options: OptInOptions = {}): Promise<ReminderOptInResult> {
  const configured = (options.isConfigured ?? isEmailSendingConfigured)()
  if (!configured) return { status: 'unavailable' }
  const now = options.now ?? new Date()

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...ACCOUNT_SELECT, locale: true },
  })
  if (!account || account.isGuest || !account.email) return { status: 'unavailable' }
  if (account.reminderOptInAt && account.reminderToken) return { status: 'on' }

  const token = account.reminderToken ?? generateReminderToken()

  if (account.reminderOptInAt || isAddressProven(account)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        reminderOptInAt: account.reminderOptInAt ?? now,
        reminderToken: token,
        ...(account.emailVerified ? {} : { emailVerified: now }),
      },
    })
    return { status: 'on' }
  }

  // Double opt-in. Encore en attente et envoyé il y a moins d'un jour : rien de plus.
  if (
    isConfirmationPending(account, now) &&
    account.reminderLastSentAt &&
    now.getTime() - account.reminderLastSentAt.getTime() < REMINDER_CONFIRM_RESEND_MS
  ) {
    return { status: 'pending' }
  }

  const global = checkRateLimit('reminder-confirm:global', CONFIRM_GLOBAL_LIMIT, CONFIRM_GLOBAL_WINDOW_MS)
  if (!global.ok) return { status: 'off', retryAfterSec: global.retryAfterSec }

  const resendBefore = new Date(now.getTime() - REMINDER_CONFIRM_RESEND_MS)
  const claim = await prisma.user.updateMany({
    where: {
      id: userId,
      reminderOptInAt: null,
      emailVerified: null,
      OR: [{ reminderLastSentAt: null }, { reminderLastSentAt: { lt: resendBefore } }],
    },
    data: {
      reminderLastSentAt: now,
      ...(account.reminderToken ? {} : { reminderToken: token }),
    },
  })
  // Un autre toucher (autre onglet) vient de réserver l'envoi : il part déjà.
  if (claim.count === 0) return { status: 'pending' }

  const send = options.sendConfirm ?? sendReminderConfirmEmail
  const locale = options.locale ?? account.locale
  try {
    await send({
      to: account.email.trim(),
      locale,
      confirmUrl: buildReminderConfirmLink(appBaseUrl(), locale, token),
    })
  } catch (error) {
    console.error('[reminder] e-mail de confirmation en échec', errorTrace(error))
    // Réservation rendue : rien n'est parti, le joueur peut réessayer.
    await prisma.user
      .updateMany({
        where: { id: userId, reminderLastSentAt: now },
        data: { reminderLastSentAt: account.reminderLastSentAt },
      })
      .catch((restoreError: unknown) => {
        console.error('[reminder] réservation non rendue', errorTrace(restoreError))
      })
    throw error
  }
  return { status: 'pending' }
}

/**
 * Confirmation par le lien de l'e-mail (bouton de la page, en POST) : pose
 * l'accord ET la preuve de l'adresse, d'une seule écriture conditionnelle —
 * jeton du compte, rien encore de prouvé ni d'accordé, e-mail de
 * confirmation parti il y a moins d'une semaine. Un second clic (déjà
 * actif) est un succès ; tout le reste (jeton inconnu, expiré, mal formé)
 * mène à la même page « lien expiré ».
 */
export async function confirmReminderByToken(token: string, now: Date = new Date()): Promise<ReminderConfirmOutcome> {
  if (!isWellFormedReminderToken(token)) return 'invalid'
  const confirmed = await prisma.user.updateMany({
    where: {
      reminderToken: token,
      isGuest: false,
      email: { not: null },
      reminderOptInAt: null,
      emailVerified: null,
      reminderLastSentAt: { gte: new Date(now.getTime() - REMINDER_CONFIRM_TTL_MS) },
    },
    data: { reminderOptInAt: now, emailVerified: now },
  })
  if (confirmed.count > 0) return 'active'
  const already = await prisma.user.findUnique({
    where: { reminderToken: token },
    select: { reminderOptInAt: true },
  })
  return already?.reminderOptInAt ? 'active' : 'invalid'
}

/**
 * Retire l'accord : plus aucun envoi, la date d'accord repasse à null.
 *
 * Le JETON est gardé, à dessein : il est le lien de désinscription de chaque
 * e-mail déjà reçu. Le changer ou l'effacer rendrait ces liens muets si le
 * joueur se réinscrit un jour — il cliquerait « ne plus recevoir » sur un
 * ancien e-mail sans effet. Seul, il ne dit rien (aléatoire) ; il ne peut
 * réactiver un accord qu'avant toute preuve d'adresse, par le bouton de la
 * page de confirmation — jamais sur une adresse déjà prouvée. Il part avec
 * le compte. updateMany : un compte supprimé entre-temps n'est pas une erreur.
 */
export async function optOutReminder(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, reminderOptInAt: { not: null } },
    data: { reminderOptInAt: null },
  })
}

/**
 * Désinscription par jeton, sans connexion (bouton de la page, ou bouton
 * « Se désabonner » de la messagerie). Ne dit RIEN de ce qu'elle a trouvé
 * (pas de valeur de retour) : la route répond la même chose pour un jeton
 * connu, inconnu ou déjà désinscrit.
 */
export async function unsubscribeReminderByToken(token: string): Promise<void> {
  if (!isWellFormedReminderToken(token)) return
  await prisma.user.updateMany({
    where: { reminderToken: token, reminderOptInAt: { not: null } },
    data: { reminderOptInAt: null },
  })
}

// ---------------------------------------------------------------------------
// Tour du vendredi (planificateur, tâche « reminder-friday »)
// ---------------------------------------------------------------------------

export type FridayReminderReport =
  | { status: 'skipped'; reason: 'email_not_configured' }
  | { status: 'done'; sent: number; failed: number; capped: boolean; aborted: boolean }

type RunOptions = {
  now?: Date
  maxSends?: number
  batchSize?: number
  pauseMs?: number
  /** Remplaçable pour les tests ; par défaut, Resend. */
  send?: typeof sendFridayReminderEmail
  /** Remplaçable pour les tests ; par défaut, la vraie configuration. */
  isConfigured?: () => boolean
}

const CANDIDATE_SELECT = {
  id: true,
  email: true,
  locale: true,
  role: true,
  isGuest: true,
  banType: true,
  bannedUntil: true,
  banComment: true,
  bannedAt: true,
  lastSeenAt: true,
  emailVerified: true,
  reminderOptInAt: true,
  reminderLastSentAt: true,
  reminderToken: true,
} as const

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Le tour du vendredi 17 h (Paris).
 *
 * Sans clé d'envoi (la production aujourd'hui) : sort tout de suite en
 * 'skipped', une ligne de journal, aucune lecture en base. Les écrans ne
 * proposent alors aucun accord (état 'unavailable').
 *
 * Sinon, lots de REMINDER_BATCH_SIZE comptes lus par curseur d'identifiant
 * (un échec d'envoi ne fait pas relire la même ligne en boucle), filtrés par
 * la requête PUIS par isReminderRecipient. Chaque envoi est d'abord RÉSERVÉ
 * (reminderLastSentAt posé par une écriture conditionnelle) : deux tours
 * simultanés — relance manuelle, deux conteneurs un jour — ne peuvent pas
 * servir deux fois le même compte. Un envoi raté rend la réservation (date
 * précédente reposée) ; au plus un e-mail par compte et par semaine, jamais
 * deux.
 */
export async function runFridayReminders(options: RunOptions = {}): Promise<FridayReminderReport> {
  const isConfigured = options.isConfigured ?? isEmailSendingConfigured
  if (!isConfigured()) {
    // eslint-disable-next-line no-console -- journal d'exploitation du tour, comme scheduler.ts
    console.log("[reminder] rappel du vendredi : envoi d'e-mails non configuré (RESEND_API_KEY absente), tour sauté")
    return { status: 'skipped', reason: 'email_not_configured' }
  }

  const now = options.now ?? new Date()
  const maxSends = options.maxSends ?? REMINDER_MAX_SENDS_PER_RUN
  const batchSize = options.batchSize ?? REMINDER_BATCH_SIZE
  const pauseMs = options.pauseMs ?? SEND_PAUSE_MS
  const send = options.send ?? sendFridayReminderEmail
  const weekStart = parisWeekStartUtc(now)
  const quietSince = new Date(now.getTime() - REMINDER_QUIET_MS)
  const baseUrl = appBaseUrl()

  let sent = 0
  let failed = 0
  let consecutiveFailures = 0
  let capped = false
  let aborted = false
  let cursor: string | null = null
  // Fin du tour décidée au milieu d'un lot (plafond, échecs en série).
  let stop = false

  while (!stop) {
    const batch: ReminderCandidate[] = await prisma.user.findMany({
      where: {
        reminderOptInAt: { not: null },
        emailVerified: { not: null },
        isGuest: false,
        email: { not: null },
        AND: [
          { OR: [{ reminderLastSentAt: null }, { reminderLastSentAt: { lt: weekStart } }] },
          { OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: quietSince } }] },
        ],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: CANDIDATE_SELECT,
      orderBy: { id: 'asc' },
      take: batchSize,
    })
    if (batch.length === 0) {
      stop = true
      break
    }
    cursor = batch[batch.length - 1].id

    for (const candidate of batch) {
      if (!isReminderRecipient(candidate, { now, weekStart })) continue
      if (sent >= maxSends) {
        capped = true
        stop = true
        break
      }

      // Réservation : seule l'écriture qui trouve encore la ligne « non
      // servie cette semaine » gagne le droit d'envoyer.
      const claim = await prisma.user.updateMany({
        where: {
          id: candidate.id,
          reminderOptInAt: { not: null },
          OR: [{ reminderLastSentAt: null }, { reminderLastSentAt: { lt: weekStart } }],
        },
        data: {
          reminderLastSentAt: now,
          // Accord antérieur à la création systématique du jeton : il naît ici.
          ...(candidate.reminderToken ? {} : { reminderToken: generateReminderToken() }),
        },
      })
      if (claim.count === 0) continue

      let token = candidate.reminderToken
      if (!token) {
        const fresh = await prisma.user.findUnique({
          where: { id: candidate.id },
          select: { reminderToken: true },
        })
        token = fresh?.reminderToken ?? null
      }
      if (!token) continue

      try {
        await send({
          to: candidate.email!.trim(),
          locale: candidate.locale,
          links: buildReminderLinks(baseUrl, candidate.locale, token),
        })
        sent += 1
        consecutiveFailures = 0
      } catch (error) {
        failed += 1
        consecutiveFailures += 1
        console.error('[reminder] rappel du vendredi : envoi en échec', errorTrace(error))
        // Réservation rendue : le compte n'a rien reçu cette semaine.
        await prisma.user
          .updateMany({
            where: { id: candidate.id, reminderLastSentAt: now },
            data: { reminderLastSentAt: candidate.reminderLastSentAt },
          })
          .catch((restoreError: unknown) => {
            console.error('[reminder] réservation non rendue', errorTrace(restoreError))
          })
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          aborted = true
          stop = true
          break
        }
      }
      if (pauseMs > 0) await pause(pauseMs)
    }

    if (batch.length < batchSize) stop = true
  }

  // eslint-disable-next-line no-console -- bilan du tour dans le journal du conteneur, comme scheduler.ts
  console.log(
    `[reminder] rappel du vendredi : ${sent} envoyé(s), ${failed} échec(s)` +
      (capped ? `, plafond de ${maxSends} atteint` : '') +
      (aborted ? `, tour interrompu après ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs` : '')
  )
  return { status: 'done', sent, failed, capped, aborted }
}
