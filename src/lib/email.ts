import { Resend } from 'resend'
import { createTranslator } from 'next-intl'
import { SITE_URL as PUBLIC_SITE_URL } from '@/lib/site'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY manquant')
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

/**
 * Adresse publique des liens d'e-mail. En production, le repli est l'adresse
 * du site (SITE_URL de site.ts) et non localhost : le serveur n'a jamais eu de
 * variable SITE_URL, et un lien « réinitialiser » ou « se désinscrire » vers
 * localhost serait mort chez le joueur. localhost reste le repli du dev.
 */
function getAppUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === 'production' ? PUBLIC_SITE_URL : 'http://localhost:3000')
  )
}

/**
 * Expéditeur : le domaine lepillaveur.fr est vérifié chez Resend (DKIM + SPF
 * sur send.lepillaveur.fr). L'adresse de test onboarding@resend.dev ne livre
 * qu'au propriétaire du compte Resend : elle ne sert plus que hors production.
 */
function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM ??
    (process.env.NODE_ENV === 'production'
      ? 'Le Pillaveur <noreply@lepillaveur.fr>'
      : 'Le Pillaveur <onboarding@resend.dev>')
  )
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${getAppUrl()}/compte/reinitialiser?token=${encodeURIComponent(token)}`

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="color: #d97706;">Le Pillaveur</h1>
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Réinitialiser mon mot de passe
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      <p style="color: #999; font-size: 12px; word-break: break-all;">${resetUrl}</p>
    </div>
  `

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: 'Réinitialisation de votre mot de passe — Le Pillaveur',
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error('Envoi email échoué')
  }
}

// ---------------------------------------------------------------------------
// Rappel « On remet ça ? » du vendredi (src/lib/reminder-server.ts)
// ---------------------------------------------------------------------------

/**
 * L'envoi d'e-mails est-il configuré sur ce serveur ? La production tourne
 * aujourd'hui SANS clé Resend : le rappel du vendredi doit alors sauter son
 * tour proprement (journal clair, aucune exception) au lieu d'échouer deux
 * cents fois de suite dans getResend().
 */
export function isEmailSendingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

/** Les liens du rappel, construits par reminder-server (buildReminderLinks). */
export type FridayReminderLinks = {
  /** Catalogue des jeux, dans la langue du compte. */
  games: string
  /** Page Compte, où l'interrupteur coupe aussi le rappel. */
  account: string
  /**
   * Lien du CORPS : la page qui demande de confirmer la désinscription d'un
   * bouton (POST), sans connexion. Un GET n'y coupe rien : les passerelles
   * de messagerie ouvrent chaque lien à la réception.
   */
  unsubscribe: string
  /** En-tête List-Unsubscribe : ne désinscrit qu'en POST One-Click (RFC 8058). */
  unsubscribeOneClick: string
}

export type FridayReminderContent = { subject: string; html: string; text: string }

type EmailLocale = 'fr' | 'en' | 'es' | 'it'

type EmailTranslate = (key: string) => string

/**
 * Catalogue de la langue, chargé à la demande : la route « mot de passe
 * oublié » importe aussi ce module, elle n'a pas à embarquer les quatre
 * catalogues pour un rappel qu'elle n'envoie jamais.
 */
async function loadMessages(locale: EmailLocale): Promise<Record<string, unknown>> {
  switch (locale) {
    case 'en':
      return (await import('../../messages/en.json')).default
    case 'es':
      return (await import('../../messages/es.json')).default
    case 'it':
      return (await import('../../messages/it.json')).default
    default:
      return (await import('../../messages/fr.json')).default
  }
}

function emailLocale(locale: string): EmailLocale {
  return locale === 'en' || locale === 'es' || locale === 'it' ? locale : 'fr'
}

/**
 * Traducteur d'un namespace des e-mails du rappel (`reminder.email`,
 * `reminder.confirmEmail`), dans la langue du compte, avec repli sur le
 * français clé par clé : un e-mail ne doit jamais partir avec un chemin de
 * clé brut dans le sujet. Aucun console.error en cas de clé manquante
 * (onError muet) : le planificateur n'a pas à remplir les journaux deux cents
 * fois pour la même clé.
 */
async function reminderTranslator(
  locale: string,
  namespace: 'reminder.email' | 'reminder.confirmEmail' = 'reminder.email'
): Promise<EmailTranslate> {
  const lang = emailLocale(locale)
  const build = (messages: Record<string, unknown>, tag: EmailLocale, fallback?: EmailTranslate) =>
    createTranslator({
      locale: tag,
      // Catalogue lu comme un dictionnaire : les clés du rappel sont ajoutées
      // aux messages par un autre chantier, le typage strict des JSON les
      // refuserait tant qu'elles n'y sont pas.
      messages: messages as Record<string, never>,
      namespace: namespace as never,
      onError: () => {},
      getMessageFallback: ({ key }) => (fallback ? fallback(key) : key),
    }) as unknown as EmailTranslate
  const french = build(await loadMessages('fr'), 'fr')
  return lang === 'fr' ? french : build(await loadMessages(lang), lang, french)
}

/** Échappement HTML des textes et des liens insérés dans le gabarit. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Contenu du rappel : sujet, HTML, texte brut. AUCUNE donnée de partie (ni
 * jeu joué, ni partenaire, ni score) et aucun pseudo : rien qu'un relais
 * d'une boîte aux lettres partagée ne doive pas lire. Exporté pour les tests.
 */
export async function renderFridayReminderEmail(
  locale: string,
  links: FridayReminderLinks
): Promise<FridayReminderContent> {
  const t = await reminderTranslator(locale)
  const games = escapeHtml(links.games)
  const account = escapeHtml(links.account)
  const unsubscribe = escapeHtml(links.unsubscribe)

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="color: #d97706;">Le Pillaveur</h1>
      <p style="font-size: 18px; font-weight: bold;">${escapeHtml(t('title'))}</p>
      <p>${escapeHtml(t('body'))}</p>
      <p>
        <a href="${games}" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ${escapeHtml(t('cta'))}
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">${escapeHtml(t('why'))}</p>
      <p style="color: #666; font-size: 13px;">
        <a href="${unsubscribe}" style="color: #666;">${escapeHtml(t('unsubscribe'))}</a>
        · <a href="${account}" style="color: #666;">${escapeHtml(t('manage'))}</a>
      </p>
    </div>
  `

  // Chaque lien sur sa propre ligne, sous son libellé : aucun séparateur à
  // écrire en dur (« : » prend une espace insécable en français, aucune en
  // anglais).
  const text = [
    t('title'),
    '',
    t('body'),
    '',
    t('cta'),
    links.games,
    '',
    t('why'),
    '',
    t('unsubscribe'),
    links.unsubscribe,
    '',
    t('manage'),
    links.account,
  ].join('\n')

  return { subject: t('subject'), html, text }
}

/**
 * Envoie UN rappel. Lève en cas d'échec (clé absente, refus de Resend) :
 * c'est l'appelant (runFridayReminders) qui compte les échecs et décide de
 * s'arrêter. L'adresse n'est jamais journalisée.
 *
 * En-têtes List-Unsubscribe (RFC 2369) et List-Unsubscribe-Post (RFC 8058) :
 * Gmail et Yahoo affichent alors leur propre bouton « Se désabonner », qui
 * appelle la route en POST sans ouvrir de page — et exigent ces en-têtes
 * des expéditeurs d'e-mails récurrents.
 */
export async function sendFridayReminderEmail(params: {
  to: string
  locale: string
  links: FridayReminderLinks
}): Promise<void> {
  const content = await renderFridayReminderEmail(params.locale, params.links)
  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    headers: {
      'List-Unsubscribe': `<${params.links.unsubscribeOneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) {
    // Nom de l'erreur Resend seulement : son message peut recopier l'adresse.
    console.error('[email] rappel du vendredi refusé par Resend :', error.name)
    throw new Error('Envoi email échoué')
  }
}

/**
 * E-mail de CONFIRMATION du rappel (double opt-in, reminder-server) : un seul
 * lien, vers la page qui confirme d'un bouton. Il dit ce qu'on a demandé, en
 * quels termes, et qu'il suffit de l'ignorer pour que rien ne parte —
 * l'adresse a pu être saisie par quelqu'un d'autre. Ni pseudo ni donnée de
 * partie. Exporté pour les tests.
 */
export async function renderReminderConfirmEmail(
  locale: string,
  confirmUrl: string
): Promise<FridayReminderContent> {
  const t = await reminderTranslator(locale, 'reminder.confirmEmail')
  const link = escapeHtml(confirmUrl)

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="color: #d97706;">Le Pillaveur</h1>
      <p style="font-size: 18px; font-weight: bold;">${escapeHtml(t('title'))}</p>
      <p>${escapeHtml(t('body'))}</p>
      <p>
        <a href="${link}" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ${escapeHtml(t('cta'))}
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">${escapeHtml(t('expiry'))}</p>
      <p style="color: #666; font-size: 13px;">${escapeHtml(t('ignore'))}</p>
      <p style="color: #999; font-size: 12px; word-break: break-all;">${link}</p>
    </div>
  `

  const text = [t('title'), '', t('body'), '', t('cta'), confirmUrl, '', t('expiry'), '', t('ignore')].join('\n')

  return { subject: t('subject'), html, text }
}

/**
 * Envoie l'e-mail de confirmation. Lève en cas d'échec : l'appelant
 * (optInReminder) rend sa réservation et la route répond 503. Pas d'en-tête
 * List-Unsubscribe : ce n'est pas un envoi récurrent — un seul e-mail, à
 * ignorer pour que rien ne suive. L'adresse n'est jamais journalisée.
 */
export async function sendReminderConfirmEmail(params: {
  to: string
  locale: string
  confirmUrl: string
}): Promise<void> {
  const content = await renderReminderConfirmEmail(params.locale, params.confirmUrl)
  const resend = getResend()
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: params.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  })
  if (error) {
    console.error('[email] confirmation du rappel refusée par Resend :', error.name)
    throw new Error('Envoi email échoué')
  }
}

/** URL publique du site (liens des e-mails). */
export function appBaseUrl(): string {
  return getAppUrl().replace(/\/+$/, '')
}
