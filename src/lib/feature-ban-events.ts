/**
 * Lecture d'une action d'historique de ban de fonctionnalité
 * ('feature-ban:voice', 'feature-unban:chat'…, écrites par featureBanEventAction
 * dans feature-bans.ts). Module sans Prisma : la Supervision le lit aussi côté
 * client pour libeller l'historique d'une fiche.
 */

export type FeatureBanEvent = { kind: 'ban' | 'unban'; feature: 'voice' | 'chat' }

const FEATURE_BAN_EVENT_RE = /^feature-(ban|unban):(voice|chat)$/

export function parseFeatureBanEventAction(action: string): FeatureBanEvent | null {
  const match = FEATURE_BAN_EVENT_RE.exec(action)
  if (!match) return null
  return { kind: match[1] as FeatureBanEvent['kind'], feature: match[2] as FeatureBanEvent['feature'] }
}
