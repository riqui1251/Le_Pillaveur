import { cookies } from 'next/headers'
import { VISITOR_COOKIE } from '@/lib/auth-server'
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
  const cookieStore = await cookies()
  const visitorId = cookieStore.get(VISITOR_COOKIE)?.value ?? null

  return recordNameModerationAttempt({
    attemptedName: input.attemptedName,
    reason: input.reason,
    context: input.context,
    userId: input.userId ?? null,
    visitorId,
    userAgent: request.headers.get('user-agent'),
  })
}
