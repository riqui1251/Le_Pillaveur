import { cookies } from 'next/headers'
import { readConsentedVisitorId } from '@/lib/auth-cookies'
import {
  recordNameModerationAttempt,
  type NameModerationAttemptContext,
} from '@/lib/name-moderation-attempts-server'
import type { NameModerationReason } from '@/lib/name-moderation'

export async function logRejectedNameOnServer(
  request: Request,
  input: {
    attemptedName: string
    reason: NameModerationReason
    context: NameModerationAttemptContext
    userId?: string | null
  }
) {
  // lp_vid seulement sous l'accord courant : un cookie hérité de l'ancien
  // '1' n'est plus un identifiant qu'on a le droit de lire.
  const visitorId = readConsentedVisitorId(await cookies())

  return recordNameModerationAttempt({
    attemptedName: input.attemptedName,
    reason: input.reason,
    context: input.context,
    userId: input.userId ?? null,
    visitorId,
    userAgent: request.headers.get('user-agent'),
  })
}
