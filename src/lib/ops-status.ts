import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  OPS_JOB_IDS,
  type OpsJobId,
  type OpsJobRecord,
  type OpsJobState,
  type OpsJobView,
} from '@/lib/ops-status-types'

/**
 * FICHIERS D'ÉTAT DES TÂCHES ROOT DU VPS — lecture côté application.
 * SERVEUR SEULEMENT (node:fs) : jamais importé par un composant client.
 *
 * Les sauvegardes, la copie off-site, la veille disque et la sonde externe
 * tournent sur l'HÔTE, sous root, hors de portée du conteneur. Jusqu'ici leur
 * seul témoin était un ping healthchecks.io : on savait qu'une tâche avait
 * crié, jamais ce qu'elle avait fait. Chacune écrit désormais une ligne JSON
 * dans /var/lib/le-pillaveur-status/<job>.json (voir src/lib/ops-status-types.ts),
 * dossier monté EN LECTURE SEULE dans le conteneur : l'application lit, elle
 * ne peut rien réécrire — un bug ici ne peut pas maquiller une sauvegarde
 * ratée en sauvegarde réussie sur le disque.
 *
 * Ces fichiers viennent de scripts shell : on les traite comme une entrée
 * EXTERNE. Taille bornée, validation stricte, et aucune exception ne remonte —
 * un fichier cassé doit donner « état inconnu » dans le panneau, pas une page
 * d'erreur à l'instant précis où l'on cherche à comprendre une panne.
 */

/** Chemin du montage dans le conteneur (`-v …:/app/ops-status:ro`). */
export const OPS_STATUS_DEFAULT_DIR = '/app/ops-status'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Âge maximal d'un passage avant « en retard », par tâche. Chaque seuil est la
 * cadence de la tâche plus une marge qui absorbe le changement d'heure, une
 * sauvegarde un peu longue ou un redémarrage du VPS — mais pas un jour sauté.
 */
export const OPS_JOB_MAX_AGE_MS: Readonly<Record<OpsJobId, number>> = {
  // Toutes les 5 min : trois tours manqués d'affilée, ce n'est plus un hoquet.
  probe: 15 * MINUTE_MS,
  // Chaque nuit à 03:00 : 24 h + 2 h de marge.
  'backup-daily': 26 * HOUR_MS,
  // 18 h → 02 h puis 04 h : le plus long trou normal va de 04 h à 18 h (14 h),
  // plus 2 h de marge. Un seuil plus court crierait tous les après-midi.
  'backup-hourly': 16 * HOUR_MS,
  // Chaque nuit à 03:15, derrière la sauvegarde quotidienne.
  offsite: 26 * HOUR_MS,
  // Chaque matin à 07:00.
  disk: 26 * HOUR_MS,
}

/**
 * Taille maximale lue d'un fichier d'état. Une ligne réelle fait ~200 octets :
 * 4 Ko laissent vingt fois la place, et un fichier plus gros n'est plus une
 * ligne d'état (script devenu fou, mauvais fichier monté) — il est refusé
 * sans être lu en entier.
 */
export const OPS_STATUS_MAX_BYTES = 4096

/** Longueur maximale du `detail` rendu (le panneau l'affiche tel quel). */
export const OPS_DETAIL_MAX_LENGTH = 200

/**
 * Tolérance sur une date dans le futur. Hôte et conteneur partagent la même
 * horloge, mais NTP peut la recaler de quelques secondes : 5 min absorbent ça.
 * Au-delà, la date est fausse (horloge du VPS déréglée à l'écriture, fichier
 * forgé) et un passage « dans le futur » resterait vert indéfiniment — le
 * fichier est donc traité comme invalide.
 */
export const OPS_FUTURE_TOLERANCE_MS = 5 * MINUTE_MS

/** snake_case du contrat : le panneau en fait une clé de traduction. */
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/**
 * Sortie de `date -Is` (2026-09-26T03:00:01+02:00), ou `toISOString()` pour
 * les tests. Exigée AVANT Date.parse : V8 accepte aussi des formats libres
 * (« Sat Sep 26 2026 ») qu'aucun script du contrat n'écrit, et qu'on ne veut
 * pas voir interprétés de travers.
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

/** Nom de mesure : identifiant court (sizeBytes, httpCode…), jamais `__proto__`. */
const METRIC_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/

/** Nombre de mesures gardées par ligne : le contrat en porte deux au plus. */
const MAX_METRICS = 16

/**
 * Chemin absolu de l'hôte ou du conteneur (/etc/…, /var/…, /opt/…), en début
 * de texte ou après une séparation. Une URL (https://site/api/health) n'est
 * pas visée : son premier « / » suit un nom d'hôte, pas une séparation.
 */
const ABSOLUTE_PATH_PATTERN =
  /(^|[\s(=:,'"])\/(?:etc|var|opt|usr|root|home|srv|tmp|run|mnt|proc|sys|app|data)\/[^\s,;)'"]*/g

/**
 * Réduit chaque chemin absolu à son dernier segment (le nom du fichier). Les
 * scripts n'en écrivent plus, mais un message d'erreur recopié peut en porter
 * un (curl 77 cite son fichier de certificats sous /etc/ssl) : la réponse de
 * l'API promet des noms de fichiers, pas l'arborescence du serveur — ni
 * l'emplacement des fichiers de secrets. Le nom seul suffit au diagnostic ;
 * docs/ops/ALERTES.md dit où vit chaque journal.
 */
function stripAbsolutePaths(text: string): string {
  return text.replace(ABSOLUTE_PATH_PATTERN, (whole: string, lead: string) => {
    const segments = whole.slice(lead.length).split('/').filter(Boolean)
    return lead + (segments[segments.length - 1] ?? '')
  })
}

/**
 * Nettoie le complément technique : ASCII imprimable seulement (le contrat le
 * promet ; un retour à la ligne ou un caractère de contrôle viendrait d'un
 * message d'erreur recopié tel quel par un script), sans chemin absolu, puis
 * tronqué.
 */
function cleanDetail(detail: string): string {
  return stripAbsolutePaths(detail.replace(/[\t\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '?'))
    .trim()
    .slice(0, OPS_DETAIL_MAX_LENGTH)
}

/**
 * Mesures : un objet est exigé (le contrat l'écrit toujours, vide au besoin),
 * mais une entrée qui n'est pas un nombre fini est ÉCARTÉE plutôt que de faire
 * tomber toute la ligne — l'état de la tâche ne dépend pas de ses mesures.
 * Null si ce n'est pas un objet.
 */
function parseMetrics(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const metrics: Record<string, number> = {}
  let kept = 0
  for (const [key, value] of Object.entries(raw)) {
    if (kept >= MAX_METRICS) break
    if (!METRIC_KEY_PATTERN.test(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    metrics[key] = value
    kept += 1
  }
  return metrics
}

/**
 * Valide une ligne d'état contre le contrat, STRICTEMENT : version, tâche
 * attendue (un backup-daily.json qui dirait « probe » est un fichier mal
 * copié, pas une sonde), `ok` booléen ou null, code en snake_case, date ISO
 * valide et pas dans le futur, `detail` chaîne. Null au moindre écart — le
 * panneau affiche alors « inconnu » plutôt qu'une information douteuse.
 *
 * La ligne rendue est RECONSTRUITE champ par champ : une clé en trop écrite
 * par un script (un jour, un `user` ou une IP de débogage) ne traverse jamais
 * jusqu'à la réponse de l'API. La date est normalisée en ISO UTC. Pure.
 */
export function parseOpsRecord(
  raw: unknown,
  expectedJob: OpsJobId,
  now: Date = new Date()
): OpsJobRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const line = raw as Record<string, unknown>

  if (line.v !== 1) return null
  if (line.job !== expectedJob) return null

  const ok = line.ok === true || line.ok === false ? line.ok : line.ok === null ? null : undefined
  if (ok === undefined) return null

  const { code, at, detail } = line
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null
  if (typeof at !== 'string' || !ISO_DATE_PATTERN.test(at)) return null
  const atMs = Date.parse(at)
  if (!Number.isFinite(atMs)) return null
  if (atMs - now.getTime() > OPS_FUTURE_TOLERANCE_MS) return null
  if (typeof detail !== 'string') return null

  const metrics = parseMetrics(line.metrics)
  if (metrics === null) return null

  return {
    v: 1,
    job: expectedJob,
    ok,
    code,
    at: new Date(atMs).toISOString(),
    detail: cleanDetail(detail),
    metrics,
  }
}

/**
 * État d'une tâche d'après sa dernière ligne. Pure.
 *
 * L'échec passe AVANT le retard : une sauvegarde qui a échoué puis cessé de
 * tourner n'a ni sauvegarde récente NI dernier essai réussi — la rétrograder en
 * simple « retard » masquerait la seule information qui fait agir. La date
 * reste affichée par le panneau, qui dit depuis quand.
 * Le retard passe avant l'abstention : une copie off-site « non configurée »
 * qui ne s'est plus manifestée depuis deux jours, c'est le cron qui ne tourne
 * plus, et c'est ça qu'il faut voir.
 */
export function opsJobState(record: OpsJobRecord | null, job: OpsJobId, now: Date): OpsJobState {
  if (!record) return 'unknown'
  if (record.ok === false) return 'failed'
  const atMs = Date.parse(record.at)
  if (!Number.isFinite(atMs)) return 'unknown'
  if (now.getTime() - atMs > OPS_JOB_MAX_AGE_MS[job]) return 'late'
  return record.ok === null ? 'skipped' : 'ok'
}

/** Le dossier monté existe-t-il ? Faux au lieu de lever, quelle que soit la cause. */
async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Lit et décode UN fichier d'état, taille bornée ; `undefined` pour tout ce
 * qui n'est pas un petit fichier ordinaire contenant du JSON (absent,
 * illisible, trop gros, dossier, JSON cassé). Ne lève jamais.
 *
 * `stat` avant `open` : ouvrir une FIFO bloquerait jusqu'à ce qu'un écrivain
 * se présente — la requête pendrait. Et une seule lecture de MAX + 1 octets :
 * même si le fichier grossit entre les deux appels, on n'en lit jamais plus.
 */
async function readBoundedJson(file: string): Promise<unknown> {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > OPS_STATUS_MAX_BYTES) return undefined
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(OPS_STATUS_MAX_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > OPS_STATUS_MAX_BYTES) return undefined
      return JSON.parse(buffer.toString('utf8', 0, bytesRead))
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}

/**
 * État de toutes les tâches du VPS, dans l'ordre d'affichage du contrat.
 * NE LÈVE JAMAIS : dossier absent (conteneur lancé sans le volume), fichier
 * absent, illisible ou invalide donnent une vue `unknown` sans ligne.
 *
 * Le dossier est lu à CHAQUE appel (process.env compris) : l'opérateur peut
 * monter le volume et relancer le conteneur sans que rien ne reste en cache.
 * Rien n'est journalisé ici : le panneau peut interroger la route à chaque
 * rafraîchissement, et un fichier manquant se voit déjà à l'écran — le même
 * avertissement toutes les minutes dans `docker logs` n'apprendrait rien.
 */
export async function readOpsStatus(
  dir: string = process.env.OPS_STATUS_DIR || OPS_STATUS_DEFAULT_DIR,
  now: Date = new Date()
): Promise<{ jobs: OpsJobView[]; statusDirFound: boolean }> {
  const statusDirFound = await isDirectory(dir)
  const jobs = await Promise.all(
    OPS_JOB_IDS.map(async (job): Promise<OpsJobView> => {
      const record = statusDirFound
        ? parseOpsRecord(await readBoundedJson(path.join(dir, `${job}.json`)), job, now)
        : null
      return { job, state: opsJobState(record, job, now), record, maxAgeMs: OPS_JOB_MAX_AGE_MS[job] }
    })
  )
  return { jobs, statusDirFound }
}
