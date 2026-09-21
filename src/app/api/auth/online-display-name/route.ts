import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import {
  displayNameTakenMessage,
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

export const PATCH = withApiRoute('auth/online-display-name PATCH', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  await ensureServerModerationTermsLoaded()
  const requestLocale = await resolveRequestLocale({ userLocale: user.locale })
  const parsed = await readApiJson<{ onlineDisplayName?: unknown }>(request)
  if (!parsed.ok) return parsed.response
  const onlineDisplayName =
    typeof parsed.body.onlineDisplayName === 'string' ? parsed.body.onlineDisplayName.trim() : ''

  const errorCode = getDisplayNameValidationError(onlineDisplayName)
  if (errorCode) {
    if (errorCode === 'profanity') {
      await logRejectedNameOnServer(request, {
        attemptedName: onlineDisplayName,
        reason: errorCode,
        context: 'online_display_name_update',
        userId: user.id,
      })
    }
    // Refus de pseudo : `error` garde une phrase, DÉJÀ rendue dans la langue
    // de la requête et détaillant ce qui cloche. `code` porte la raison.
    return NextResponse.json(
      { error: displayNameValidationMessage(onlineDisplayName, requestLocale), code: errorCode },
      { status: 400 }
    )
  }

  if (await isDisplayNameTaken(onlineDisplayName, user.id)) {
    // Seule phrase française brute de cette route : remplacée par le message
    // déjà traduit du refus de pseudo à l'inscription, même situation.
    return NextResponse.json(
      { error: displayNameTakenMessage(requestLocale), code: 'display_name_taken' },
      { status: 409 }
    )
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: onlineDisplayName },
  })

  return NextResponse.json({ ok: true, onlineDisplayName })
})
