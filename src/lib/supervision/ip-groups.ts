import { groupIpsByNetwork, type IpNetworkGroup } from '@/lib/ip-network'

/** Entrée d'historique d'IP telle que la Supervision la reçoit. */
export type SupervisionIpEntry = {
  ip: string
  country: string | null
  lastSeenAt: string
  firstSeenAt?: string
}

/**
 * Historique regroupé par réseau (/64 en IPv6, adresse entière en IPv4) : les
 * adresses temporaires d'une même box ne passent plus pour autant de lieux.
 * UN historique à la fois (compte OU navigateur), jamais les deux mêlés.
 *
 * Une entrée de repli (dernière IP seule) n'a pas de première vue : on lui
 * prête sa dernière vue, pour que le regroupement ait toujours deux dates.
 */
export function networkGroupsOf<T extends SupervisionIpEntry>(
  ips: T[]
): IpNetworkGroup<T & { firstSeenAt: string }>[] {
  return groupIpsByNetwork(ips.map((entry) => ({ ...entry, firstSeenAt: entry.firstSeenAt ?? entry.lastSeenAt })))
}
