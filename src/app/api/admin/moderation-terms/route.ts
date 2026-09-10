import { NextResponse } from 'next/server'
import { canManageUsers } from '@/lib/roles'
import { adminErrorResponse, requireRole } from '../_guard'
import { prisma } from '@/lib/prisma'
import { isAppLocale } from '@/lib/locale-utils'
import { PROFANITY_BY_LOCALE } from '@/lib/name-moderation/terms'
import {
  ensureServerModerationTermsLoaded,
  getFileExtraTermsCount,
  listDbModerationTerms,
  refreshDbExtraTermsCache,
} from '@/lib/name-moderation/extra-terms-server'
import { normalizeTermForMatching } from '@/lib/name-moderation/terms'

export async function GET() {
  try {
    await requireRole(canManageUsers)

    await ensureServerModerationTermsLoaded()
    const dbTerms = await listDbModerationTerms()

    return NextResponse.json({
      baseCounts: {
        fr: PROFANITY_BY_LOCALE.fr.length,
        en: PROFANITY_BY_LOCALE.en.length,
        es: PROFANITY_BY_LOCALE.es.length,
        it: PROFANITY_BY_LOCALE.it.length,
      },
      fileExtraCount: getFileExtraTermsCount(),
      dbExtraCount: dbTerms.length,
      dbTerms,
    })
  } catch (error) {
    return adminErrorResponse(error, 'moderation-terms GET')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(canManageUsers)

    const body = await request.json()
    const term = typeof body.term === 'string' ? body.term.trim() : ''
    const locale =
      typeof body.locale === 'string' && isAppLocale(body.locale) ? body.locale : null
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null

    if (!term || term.length > 64) {
      return NextResponse.json({ error: 'Terme invalide' }, { status: 400 })
    }

    const normalized = normalizeTermForMatching(term)
    if (normalized.length < 2) {
      return NextResponse.json({ error: 'Terme trop court' }, { status: 400 })
    }

    const created = await prisma.moderationTerm.create({
      data: {
        term,
        locale,
        note,
        addedById: actor.id,
      },
    })

    await refreshDbExtraTermsCache()

    return NextResponse.json({ term: created }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'moderation-terms POST')
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(canManageUsers)

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    await prisma.moderationTerm.delete({ where: { id } })
    await refreshDbExtraTermsCache()

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'moderation-terms DELETE')
  }
}
