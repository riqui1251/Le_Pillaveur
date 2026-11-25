import { prisma } from '@/lib/prisma'
import { parisDayOffset, parisDayString } from '@/lib/paris-time'
import {
  ACQUISITION_DAILY_ROW_CAP,
  ACQUISITION_OVERFLOW,
  isAcquisitionChannel,
  type Acquisition,
  type AcquisitionChannel,
} from '@/lib/acquisition'

/** Violation d'unicité Prisma (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

type AcquisitionKey = Acquisition & { day: string }

/** Ligne de repli d'un canal pour le jour : sentinelles, utm vides. */
export function overflowKey(day: string, channel: AcquisitionChannel): AcquisitionKey {
  return {
    day,
    channel,
    host: ACQUISITION_OVERFLOW,
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    landingPath: ACQUISITION_OVERFLOW,
  }
}

/**
 * +1 arrivée au compteur du jour de Paris pour cette provenance. Aucun
 * identifiant : la ligne ne dit que « tant d'arrivées par tel canal sur telle
 * page ce jour-là ».
 *
 * Combinaison déjà présente : incrémentée, plafond atteint ou non. Nouvelle :
 * créée tant que le jour compte moins de ACQUISITION_DAILY_ROW_CAP lignes,
 * sinon comptée dans la ligne de repli de son canal (le canal reste juste, le
 * détail est perdu). Des créations simultanées peuvent dépasser le plafond de
 * quelques lignes : il borne la table, il n'a pas à être exact.
 *
 * Création par upsert, comme GameDrinkDaily : deux premières arrivées
 * simultanées se disputent la ligne, la perdante lève P2002 et repasse UNE
 * fois — c'est alors l'incrément qui s'applique.
 */
export async function recordAcquisition(acquisition: Acquisition, now: Date = new Date()): Promise<void> {
  const day = parisDayString(now)
  const key: AcquisitionKey = {
    day,
    channel: acquisition.channel,
    host: acquisition.host,
    utmSource: acquisition.utmSource,
    utmMedium: acquisition.utmMedium,
    utmCampaign: acquisition.utmCampaign,
    landingPath: acquisition.landingPath,
  }
  const existing = await prisma.acquisitionDaily.updateMany({ where: key, data: { visits: { increment: 1 } } })
  if (existing.count > 0) return

  const rows = await prisma.acquisitionDaily.count({ where: { day } })
  const target = rows >= ACQUISITION_DAILY_ROW_CAP ? overflowKey(day, acquisition.channel) : key
  const write = () =>
    prisma.acquisitionDaily.upsert({
      where: { day_channel_host_utmSource_utmMedium_utmCampaign_landingPath: target },
      create: { ...target, visits: 1 },
      update: { visits: { increment: 1 } },
    })
  try {
    await write()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    await write()
  }
}

/** Rangées par liste de la vue Provenance : au-delà, la queue n'apprend plus rien. */
export const ACQUISITION_TOP = 15

export type AcquisitionStats = {
  /** Premier jour de Paris lu (fenêtre). */
  from: string
  /** Premier jour mesuré, toutes périodes confondues ; null tant que la table est vide. */
  since: string | null
  total: number
  /** Arrivées comptées dans les lignes de repli (plafond du jour atteint), déjà incluses dans `total`. */
  overflow: number
  channels: Array<{ channel: AcquisitionChannel; visits: number }>
  landings: Array<{ path: string; visits: number }>
  campaigns: Array<{ source: string; medium: string; campaign: string; visits: number }>
  /**
   * Hôtes des canaux 'autre' (site inconnu) et 'app' (paquet Android). Les
   * lignes de repli y figurent sous ACQUISITION_OVERFLOW, comme dans `landings`.
   */
  hosts: Array<{ channel: 'autre' | 'app'; host: string; visits: number }>
}

const visitsOf = (row: { _sum: { visits: number | null } }) => row._sum.visits ?? 0

/** Provenance des `days` derniers jours de Paris, aujourd'hui compris. */
export async function getAcquisitionStats(days: number, now: Date = new Date()): Promise<AcquisitionStats> {
  const from = parisDayOffset(days - 1, now)
  const where = { day: { gte: from } }
  const top = { _sum: { visits: 'desc' as const } }

  const [channels, landings, campaigns, hosts, first, overflow] = await Promise.all([
    prisma.acquisitionDaily.groupBy({ by: ['channel'], where, _sum: { visits: true }, orderBy: top }),
    prisma.acquisitionDaily.groupBy({
      by: ['landingPath'],
      where: { ...where, landingPath: { not: '' } },
      _sum: { visits: true },
      orderBy: top,
      take: ACQUISITION_TOP,
    }),
    prisma.acquisitionDaily.groupBy({
      by: ['utmSource', 'utmMedium', 'utmCampaign'],
      where: { ...where, OR: [{ utmSource: { not: '' } }, { utmMedium: { not: '' } }, { utmCampaign: { not: '' } }] },
      _sum: { visits: true },
      orderBy: top,
      take: ACQUISITION_TOP,
    }),
    prisma.acquisitionDaily.groupBy({
      by: ['channel', 'host'],
      where: { ...where, channel: { in: ['autre', 'app'] }, host: { not: '' } },
      _sum: { visits: true },
      orderBy: top,
      take: ACQUISITION_TOP,
    }),
    prisma.acquisitionDaily.aggregate({ _min: { day: true } }),
    prisma.acquisitionDaily.aggregate({
      where: { ...where, landingPath: ACQUISITION_OVERFLOW },
      _sum: { visits: true },
    }),
  ])

  const channelRows = channels
    .filter((row) => isAcquisitionChannel(row.channel))
    .map((row) => ({ channel: row.channel as AcquisitionChannel, visits: visitsOf(row) }))

  return {
    from,
    since: first._min.day ?? null,
    total: channelRows.reduce((sum, row) => sum + row.visits, 0),
    overflow: overflow._sum.visits ?? 0,
    channels: channelRows,
    landings: landings.map((row) => ({ path: row.landingPath, visits: visitsOf(row) })),
    campaigns: campaigns.map((row) => ({
      source: row.utmSource,
      medium: row.utmMedium,
      campaign: row.utmCampaign,
      visits: visitsOf(row),
    })),
    hosts: hosts.map((row) => ({
      channel: row.channel === 'app' ? ('app' as const) : ('autre' as const),
      host: row.host,
      visits: visitsOf(row),
    })),
  }
}
