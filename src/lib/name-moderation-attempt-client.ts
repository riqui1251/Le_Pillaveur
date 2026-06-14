import type {
  NameModerationAttemptContext,
} from '@/lib/name-moderation-attempts-server'
import type { NameModerationReason } from '@/lib/name-moderation'

export async function reportRejectedName(input: {
  attemptedName: string
  reason: NameModerationReason
  context: NameModerationAttemptContext
}): Promise<{ showWarning?: boolean; profanityAttemptCount?: number } | null> {
  try {
    const res = await fetch('/api/name-moderation/attempt', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function reportProfanityIfNeeded(
  attemptedName: string,
  reason: NameModerationReason | null | undefined,
  context: NameModerationAttemptContext
): Promise<{ showWarning?: boolean; profanityAttemptCount?: number } | null> {
  if (reason !== 'profanity') return null
  return reportRejectedName({ attemptedName, reason, context })
}
