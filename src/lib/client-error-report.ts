/**
 * REMONTÉE DES PLANTAGES CÔTÉ JOUEUR — module navigateur, sans dépendance.
 *
 * Les trois écrans d'erreur React (ErrorBoundary, [locale]/error.tsx,
 * global-error.tsx) se contentaient d'un console.error dans le navigateur du
 * joueur : un plantage sur téléphone, en soirée, n'arrivait jamais au
 * serveur. Ce module en fait un rapport minimal et l'envoie à
 * POST /api/client-error, sans jamais gêner l'écran d'erreur lui-même :
 * fire-and-forget, aucune exception ne sort d'ici, aucune attente.
 *
 * Sans dépendance, VOLONTAIREMENT : il est appelé depuis global-error.tsx, qui
 * vit au-dessus de l'application (ni next-intl, ni routage), et depuis un
 * arbre React déjà cassé — tout import de plus serait un plantage de plus.
 * Les fonctions pures (filtrage, troncature, dédoublonnage) sont exportées et
 * testées ; seule `reportClientError` touche à `window`.
 *
 * RGPD : le rapport ne porte que le NOM de classe, le message tronqué, le
 * chemin SANS query ni hash (un ?join=CODE ou ?token= n'y passe jamais), la
 * langue et le sha de build. Ni pile, ni pseudo, ni identifiant de compte —
 * les segments de chemin qui ressemblent à un identifiant sont masqués, et le
 * code de table qui suit /invite ou /tv (le même secret que ?join=CODE) aussi.
 */

/** Où part le rapport ; même origine, jamais d'appel tiers. */
export const CLIENT_ERROR_ENDPOINT = '/api/client-error'

/**
 * Longueurs maximales de chaque champ — la SEULE définition du projet, reprise
 * par le serveur (src/lib/client-errors-server.ts) pour valider ce qu'il
 * reçoit : ce module-ci ne peut rien importer, c'est donc lui qui les porte.
 */
export const CLIENT_ERROR_FIELD_LIMITS = {
  name: 80,
  message: 300,
  digest: 64,
  path: 200,
  buildSha: 16,
  locale: 10,
} as const

/**
 * Anti-tempête : au plus 3 envois par chargement de page. Un écran d'erreur
 * qui se ré-affiche à chaque « Réessayer » ne doit pas mitrailler le serveur ;
 * et au-delà de trois, le premier rapport a déjà tout dit.
 */
export const MAX_REPORTS_PER_PAGE = 3

/**
 * Langues du site, recopiées de src/i18n/routing.ts (non importable ici : ce
 * module-là tire next-intl). Servent à reconnaître le segment de langue du
 * chemin ; une langue ajoutée là-bas s'ajoute ici.
 */
const KNOWN_LOCALES: ReadonlyArray<string> = ['fr', 'en', 'es', 'it']

/** Rapport tel qu'il part vers le serveur. */
export type ClientErrorReport = {
  name: string
  message: string
  digest?: string
  path: string
  locale: string
  buildSha?: string
}

/** Ce qu'on sait d'une erreur, quelle que soit sa forme (Error ou valeur brute). */
type ErrorShape = { name: string; message: string; stack: string }

/**
 * Lit une erreur sans supposer qu'elle est une `Error` : un `throw 'texte'` ou
 * un objet quelconque arrivent aussi dans les écrans d'erreur.
 */
function describeError(error: unknown): ErrorShape {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message ?? '', stack: error.stack ?? '' }
  }
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; stack?: unknown }
    return {
      name: typeof candidate.name === 'string' && candidate.name ? candidate.name : 'NonError',
      message: typeof candidate.message === 'string' ? candidate.message : '',
      stack: typeof candidate.stack === 'string' ? candidate.stack : '',
    }
  }
  return { name: 'NonError', message: String(error), stack: '' }
}

/**
 * Coupe une chaîne au plafond, sans retour à la ligne : un message d'erreur
 * multi-lignes ne garde que ce qui tient sur une ligne de tableau.
 */
export function truncateField(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) : flat
}

/**
 * Erreurs qu'on NE remonte PAS :
 *  - les pannes réseau évidentes (`TypeError: Failed to fetch` Chrome,
 *    « Load failed » Safari, « NetworkError » Firefox) : la 4G qui tombe dans
 *    le métro n'est pas un bogue du site, et elle noierait tout le reste ;
 *  - ce qui vient d'une extension de navigateur (pile contenant
 *    chrome-extension:// et consorts) : pas notre code.
 */
export function isIgnorableClientError(error: unknown): boolean {
  const { name, message, stack } = describeError(error)
  if (name === 'TypeError' && /Failed to fetch|Load failed|NetworkError/i.test(message)) return true
  if (/\b(chrome|moz|safari|ms-browser)-extension:\/\//.test(stack)) return true
  return false
}

/**
 * Segments dont le SUIVANT est un code de table : /invite/CODE (page partagée,
 * même secret que ?join=CODE) et /tv/CODE (écran de cast). Recopiés des
 * routes src/app/[locale]/invite/[code] et tv/[code] ; une route à code
 * ajoutée là-bas s'ajoute ici.
 */
const CODE_PARENT_SEGMENTS: ReadonlyArray<string> = ['invite', 'tv']

/**
 * Chemin tel qu'il est stocké : SANS query ni hash, segments qui ressemblent à
 * un identifiant masqués, borné à 200 caractères.
 *  - la query porte des codes d'invitation (?join=CODE) et des jetons
 *    (?token=) : elle n'entre jamais ;
 *  - un segment de 20 caractères alphanumériques ou plus est un cuid (fiche
 *    compte /supervision/comptes/<id>, salle /online/rooms/<id>) : masqué en
 *    `:id`, ce qui regroupe au passage les plantages d'une même page ;
 *  - le code de table (4 à 8 caractères alphanumériques) qui suit /invite ou
 *    /tv est masqué en `:code` : c'est le secret qui ouvre la table, il ne
 *    vaut pas mieux dans le chemin que dans la query. Les slugs de jeux et
 *    les autres segments courts restent lisibles.
 */
export function normalizeClientErrorPath(pathname: string): string {
  const bare = pathname.split(/[?#]/, 1)[0] || '/'
  const segments = bare.split('/')
  const masked = segments
    .map((segment, index) => {
      if (/^[A-Za-z0-9]{20,}$/.test(segment)) return ':id'
      const parent = index > 0 ? segments[index - 1] : ''
      if (CODE_PARENT_SEGMENTS.includes(parent) && /^[A-Za-z0-9]{4,8}$/.test(segment)) return ':code'
      return segment
    })
    .join('/')
  const withSlash = masked.startsWith('/') ? masked : `/${masked}`
  return withSlash.slice(0, CLIENT_ERROR_FIELD_LIMITS.path)
}

/**
 * Langue du rapport : le segment de langue du chemin (localePrefix
 * « always » : /fr/jeux), sinon la langue du document (global-error.tsx pose
 * lang="fr" hors de tout segment), sinon le français, langue par défaut.
 */
export function localeFromPath(pathname: string, documentLang?: string): string {
  const first = pathname.split('/')[1] ?? ''
  if (KNOWN_LOCALES.includes(first)) return first
  const lang = (documentLang ?? '').trim().toLowerCase().slice(0, 2)
  return KNOWN_LOCALES.includes(lang) ? lang : 'fr'
}

/** Contexte de la page, injecté pour rester pur (et testable) : pas de `window` ici. */
export type ClientErrorContext = {
  pathname: string
  documentLang?: string
  digest?: string
  buildSha?: string
}

/**
 * Construit le rapport : tout est borné ICI, avant l'envoi — le serveur
 * revalide, mais un rapport qui tient dans ses limites part en un seul petit
 * paquet (sendBeacon a lui aussi un plafond, 64 Ko selon les navigateurs).
 */
export function buildClientErrorReport(error: unknown, context: ClientErrorContext): ClientErrorReport {
  const { name, message } = describeError(error)
  const limits = CLIENT_ERROR_FIELD_LIMITS
  const report: ClientErrorReport = {
    name: truncateField(name, limits.name) || 'Error',
    message: truncateField(message, limits.message),
    path: normalizeClientErrorPath(context.pathname),
    locale: localeFromPath(context.pathname, context.documentLang).slice(0, limits.locale),
  }
  const digest = context.digest ? truncateField(context.digest, limits.digest) : ''
  if (digest) report.digest = digest
  const buildSha = context.buildSha ? truncateField(context.buildSha, limits.buildSha) : ''
  if (buildSha) report.buildSha = buildSha
  return report
}

/** Deux rapports « identiques » pour l'anti-tempête : même nom, même message. */
export function reportFingerprint(report: Pick<ClientErrorReport, 'name' | 'message'>): string {
  return `${report.name}\n${report.message}`
}

/** Ce qu'un envoyeur reçoit : le rapport, déjà sérialisable. */
export type ClientErrorSender = (report: ClientErrorReport) => void

/**
 * Fabrique un rapporteur avec sa propre mémoire de page : compteur d'envois
 * et empreintes déjà envoyées. Renvoie `true` quand le rapport est parti.
 * Séparée de l'instance de module pour être testée sans `window`, et pour
 * que chaque test reparte d'une mémoire vierge.
 */
export function createClientErrorReporter(
  send: ClientErrorSender,
  maxReports: number = MAX_REPORTS_PER_PAGE
): (error: unknown, context: ClientErrorContext) => boolean {
  let sent = 0
  const seen = new Set<string>()
  return (error, context) => {
    if (sent >= maxReports) return false
    if (isIgnorableClientError(error)) return false
    const report = buildClientErrorReport(error, context)
    const fingerprint = reportFingerprint(report)
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    sent += 1
    try {
      send(report)
    } catch {
      // Un envoyeur qui lève ne doit jamais remonter jusqu'à l'écran d'erreur.
    }
    return true
  }
}

/**
 * Envoi réel : `sendBeacon` d'abord — il survit à la fermeture de l'onglet et
 * au rechargement que error.tsx déclenche sur un chunk périmé —, sinon
 * `fetch` en keepalive. Réponse ignorée dans les deux cas. `credentials:
 * 'omit'` : la route n'a que faire d'une session, inutile d'envoyer le cookie.
 */
function sendToServer(report: ClientErrorReport): void {
  const body = JSON.stringify(report)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const accepted = navigator.sendBeacon(
      CLIENT_ERROR_ENDPOINT,
      new Blob([body], { type: 'application/json' })
    )
    if (accepted) return
  }
  if (typeof fetch !== 'function') return
  void fetch(CLIENT_ERROR_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {})
}

/** Le rapporteur de la page : une mémoire par chargement, comme voulu. */
const pageReporter = createClientErrorReporter(sendToServer)

/**
 * Remonte un plantage attrapé par un écran d'erreur. À appeler EN PLUS du
 * console.error existant, jamais à la place : l'exploitant voit la ligne en
 * Supervision, le développeur garde sa console.
 *
 * `process.env.NEXT_PUBLIC_BUILD_SHA` : CONTRAT avec le chantier
 * « déploiement », qui le pose à la construction de l'image ; il peut être
 * absent (`undefined`), auquel cas le rapport part sans sha. L'expression doit
 * rester LITTÉRALE : Next ne substitue que cette forme dans le bundle client.
 * Conséquence assumée : le sha court est INLINÉ dans le JS servi à tous, il
 * n'est pas un secret — c'est ce qui permet de distinguer un bundle périmé
 * (ChunkLoadError après un déploiement) de la version en ligne.
 */
export function reportClientError(error: unknown, options: { digest?: string } = {}): void {
  if (typeof window === 'undefined') return
  try {
    pageReporter(error, {
      pathname: window.location.pathname,
      documentLang: document.documentElement.lang,
      digest: options.digest,
      buildSha: process.env.NEXT_PUBLIC_BUILD_SHA,
    })
  } catch {
    // Fire-and-forget : rien de ce module ne doit ajouter un plantage au plantage.
  }
}
