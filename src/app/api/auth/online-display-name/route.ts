import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import {
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  await ensureServerModerationTermsLoaded()
  const requestLocale = await resolveRequestLocale({ userLocale: user.locale })
  const body = await request.json().catch(() => ({}))
  const onlineDisplayName = typeof body.onlineDisplayName === 'string' ? body.onlineDisplayName.trim() : ''

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
    return NextResponse.json(
      { error: displayNameValidationMessage(onlineDisplayName, requestLocale), code: errorCode },
      { status: 400 }
    )
  }

  if (await isDisplayNameTaken(onlineDisplayName, user.id)) {
    return NextResponse.json(
      { error: 'Ce pseudo online est déjà pris', code: 'display_name_taken' },
      { status: 409 }
    )
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: onlineDisplayName },
  })

  return NextResponse.json({ ok: true, onlineDisplayName })
}
