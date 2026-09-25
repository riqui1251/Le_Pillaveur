import type { RetentionLastRun } from '@/lib/retention-sweep'

/**
 * Délai sans passage du ménage au-delà duquel la ligne passe en alerte. Le
 * balayage n'a pas de cron : il ne tourne qu'avec du trafic (ping), au plus
 * toutes les 6 h. Au-delà d'une journée, les durées de conservation annoncées
 * ne sont plus garanties.
 */
export const RETENTION_RUN_STALE_MS = 24 * 60 * 60 * 1000

export type RetentionRunStatus = {
  total: number
  stale: boolean
  failed: string[]
  blocks: string[]
  errored: boolean
  alert: boolean
}

/**
 * Lecture de la trace du dernier ménage : total et motifs d'alerte. Le total
 * additionne des natures différentes (lignes supprimées, lignes vidées ou
 * anonymisées, comptes invités supprimés avec leur contenu) : son libellé reste
 * donc neutre (« éléments »), le détail donne le volume de chaque bloc.
 * Une date illisible compte comme un passage trop ancien, jamais comme un
 * passage récent. Module PUR : `now` est passé par l'appelant.
 */
export function retentionRunStatus(run: RetentionLastRun, now: number): RetentionRunStatus {
  const total = Object.values(run.counts).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
  const at = new Date(run.at).getTime()
  const stale = !Number.isFinite(at) || now - at > RETENTION_RUN_STALE_MS
  const failed = run.failed ?? []
  // Blocs du détail : ceux qui ont purgé, puis ceux qui ont échoué sans volume.
  const blocks = [...Object.keys(run.counts), ...failed.filter((name) => !(name in run.counts))]
  return {
    total,
    stale,
    failed,
    blocks,
    errored: !run.ok,
    alert: !run.ok || failed.length > 0 || stale,
  }
}
