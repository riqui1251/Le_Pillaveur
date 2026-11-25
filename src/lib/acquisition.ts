/**
 * Provenance des visites — module PUR, partagé par le client (ce qu'il lit et
 * envoie avec la 1re vue d'une session) et le serveur (assainissement, canal).
 *
 * Le client n'envoie que quatre choses : le nom d'hôte du référent s'il est
 * extérieur au site, le chemin d'arrivée sans query, et trois paramètres utm.
 * Jamais une URL complète ni une query brute : un lien partagé peut porter un
 * jeton (réinitialisation, invitation) ou un pseudo.
 */

export const ACQUISITION_CHANNELS = [
  'google',
  'bing',
  'duckduckgo',
  'qwant',
  'ecosia',
  'yahoo',
  'chatgpt',
  'perplexity',
  'x',
  'facebook',
  'instagram',
  'tiktok',
  'snapchat',
  'reddit',
  'discord',
  'youtube',
  'app',
  'direct',
  'autre',
] as const
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number]

export const ACQUISITION_HOST_MAX = 100
export const ACQUISITION_UTM_MAX = 60
export const ACQUISITION_PATH_MAX = 100

/**
 * Sentinelle des lignes de repli (plafond du jour atteint, acquisition-server)
 * dans `host` et `landingPath`. Impossible à forger : ni sanitizeHost, ni le
 * gabarit des paquets Android, ni sanitizeLandingPath ne la laissent passer.
 */
export const ACQUISITION_OVERFLOW = '*'

/**
 * Combinaisons distinctes d'un même jour au-delà desquelles une NOUVELLE
 * combinaison n'est plus créée telle quelle mais comptée dans la ligne de
 * repli de son canal : la route ping est publique, un client qui forge des
 * utm ou des chemins au hasard ne doit pas faire grossir la table sans fin.
 * Des dizaines de fois le trafic réel d'une journée.
 */
export const ACQUISITION_DAILY_ROW_CAP = 2000

/** Préfixe d'un référent d'application Android (Gmail, appli Google…). */
const ANDROID_APP_PREFIX = 'android-app://'

/** Corps `acq` tel que le client l'envoie, avant tout contrôle serveur. */
export type AcquisitionPayload = {
  /** Hôte du référent extérieur, `android-app://<paquet>`, ou vide. */
  ref: string
  path: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
}

/** Provenance validée, prête à compter. */
export type Acquisition = {
  channel: AcquisitionChannel
  /** Hôte pour 'autre', paquet pour 'app' ; vide pour les canaux nommés. */
  host: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  landingPath: string
}

const stripWww = (host: string) => host.replace(/^www\./, '')

/**
 * Ce que le client envoie, lu dans le document : `referrer` et `siteHost`
 * (location.hostname) décident si l'origine est extérieure ; un référent du
 * site lui-même (www ou non) vaut une arrivée directe.
 */
export function readAcquisition(input: {
  referrer: string
  siteHost: string
  pathname: string
  search: string
}): AcquisitionPayload {
  const params = new URLSearchParams(input.search)
  const param = (name: string) => (params.get(name) ?? '').slice(0, ACQUISITION_UTM_MAX * 2)
  return {
    ref: externalReferrer(input.referrer, input.siteHost),
    path: input.pathname.slice(0, ACQUISITION_PATH_MAX * 2),
    utmSource: param('utm_source'),
    utmMedium: param('utm_medium'),
    utmCampaign: param('utm_campaign'),
  }
}

function externalReferrer(referrer: string, siteHost: string): string {
  if (!referrer) return ''
  const app = /^android-app:\/\/([^/?#]+)/i.exec(referrer)
  if (app) return `${ANDROID_APP_PREFIX}${app[1].toLowerCase()}`.slice(0, ACQUISITION_HOST_MAX * 2)
  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  const host = stripWww(url.hostname.toLowerCase())
  return host === stripWww(siteHost.toLowerCase()) ? '' : host.slice(0, ACQUISITION_HOST_MAX * 2)
}

/** Nom d'hôte DNS : étiquettes [a-z0-9-] séparées par des points, au moins deux. */
const HOST_RE = /^(?=.{1,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
/** Paquet Android : com.google.android.gm. */
const PACKAGE_RE = /^(?=.{1,100}$)[a-z0-9_]+(?:\.[a-z0-9_]+)+$/
const UTM_RE = /^[a-z0-9_.-]{1,60}$/
const PATH_RE = /^\/[a-z0-9/_.-]*$/

/**
 * Segments dynamiques qui ne disent rien de la provenance et pourraient
 * nommer quelqu'un (code d'invitation lié à un compte, salle, fiche) : masqués.
 */
const DYNAMIC_SEGMENTS: ReadonlyArray<[RegExp, string]> = [
  [/^(\/[a-z]{2})?\/invite\/[^/]+/, '$1/invite/:code'],
  [/^(\/[a-z]{2})?\/tv\/(?!apercu-dev(?:\/|$))[^/]+/, '$1/tv/:code'],
  [/^(\/[a-z]{2})?\/supervision\/comptes\/[^/]+/, '$1/supervision/comptes/:id'],
]

/** Hôte du référent : minuscules, sans « www. », DNS strict ; null s'il est invalide. */
export function sanitizeHost(value: string): string | null {
  const host = stripWww(value.trim().toLowerCase())
  return HOST_RE.test(host) ? host : null
}

/**
 * Valeur utm : minuscules, accents retirés, espaces et « + » en « _ », puis
 * [a-z0-9_.-] sur 60 caractères au plus. Tout autre contenu est vidé.
 */
export function sanitizeUtm(value: unknown): string {
  if (typeof value !== 'string') return ''
  const cleaned = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s+]+/g, '_')
  return UTM_RE.test(cleaned) ? cleaned : ''
}

/**
 * Chemin d'arrivée : commence par « / », [a-z0-9/_.-] seulement (les slugs
 * du site), 100 caractères au plus, sans « / » final ; segments dynamiques
 * masqués. Tout autre chemin (encodé, trop long, query) est vidé.
 */
export function sanitizeLandingPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  let path = value.trim().toLowerCase()
  if (path.length > ACQUISITION_PATH_MAX || !PATH_RE.test(path)) return ''
  if (path.includes('//') || path.split('/').some((segment) => segment === '..')) return ''
  for (const [pattern, replacement] of DYNAMIC_SEGMENTS) path = path.replace(pattern, replacement)
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

const isDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)
const GOOGLE_RE = /(?:^|\.)google\.[a-z]{2,3}(?:\.[a-z]{2})?$/
const YAHOO_RE = /(?:^|\.)yahoo\.[a-z]{2,3}(?:\.[a-z]{2})?$/

const NAMED_DOMAINS: ReadonlyArray<[AcquisitionChannel, readonly string[]]> = [
  ['bing', ['bing.com']],
  ['duckduckgo', ['duckduckgo.com']],
  ['qwant', ['qwant.com']],
  ['ecosia', ['ecosia.org']],
  ['chatgpt', ['chatgpt.com', 'chat.openai.com']],
  ['perplexity', ['perplexity.ai']],
  ['x', ['t.co', 'x.com', 'twitter.com']],
  ['facebook', ['facebook.com']],
  ['instagram', ['instagram.com']],
  ['tiktok', ['tiktok.com']],
  ['snapchat', ['snapchat.com']],
  ['reddit', ['reddit.com']],
  ['discord', ['discord.com', 'discord.gg', 'discordapp.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
]

/**
 * Canal d'un hôte DÉJÀ assaini (sanitizeHost) : vide = direct. Un hôte
 * inconnu tombe dans 'autre', le seul canal qui garde l'hôte, pour découvrir
 * les sources qu'on ne nomme pas encore.
 */
export function classifyReferrerHost(host: string): { channel: AcquisitionChannel; host: string } {
  if (host === '') return { channel: 'direct', host: '' }
  if (GOOGLE_RE.test(host)) return { channel: 'google', host: '' }
  if (YAHOO_RE.test(host)) return { channel: 'yahoo', host: '' }
  for (const [channel, domains] of NAMED_DOMAINS) {
    if (domains.some((domain) => isDomain(host, domain))) return { channel, host: '' }
  }
  return { channel: 'autre', host }
}

/**
 * Lecture STRICTE du champ `acq` d'une vue. null = rien à compter : champ
 * absent ou d'un autre type, référent illisible (ni hôte DNS, ni paquet
 * Android). Un utm ou un chemin hors gabarit est seulement vidé : la visite
 * garde son canal.
 */
export function parseAcquisition(raw: unknown): Acquisition | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  if (typeof body.ref !== 'string' || body.ref.length > ACQUISITION_HOST_MAX * 2) return null

  const ref = body.ref.trim().toLowerCase()
  let origin: { channel: AcquisitionChannel; host: string }
  if (ref.startsWith(ANDROID_APP_PREFIX)) {
    const pkg = ref.slice(ANDROID_APP_PREFIX.length)
    if (!PACKAGE_RE.test(pkg)) return null
    origin = { channel: 'app', host: pkg }
  } else if (ref === '') {
    origin = classifyReferrerHost('')
  } else {
    const host = sanitizeHost(ref)
    if (host === null) return null
    origin = classifyReferrerHost(host)
  }

  return {
    ...origin,
    utmSource: sanitizeUtm(body.utmSource),
    utmMedium: sanitizeUtm(body.utmMedium),
    utmCampaign: sanitizeUtm(body.utmCampaign),
    landingPath: sanitizeLandingPath(body.path),
  }
}

export function isAcquisitionChannel(value: unknown): value is AcquisitionChannel {
  return (ACQUISITION_CHANNELS as readonly unknown[]).includes(value)
}
