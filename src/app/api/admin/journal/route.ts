import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getJournalPage } from '@/lib/supervision-overview-server'
import { FORBIDDEN, parsePaging, requireRole } from '../_guard'

/**
 * Journal de l'équipe, paginé (Modération › Journal) — SÉPARÉ de la vue
 * d'ensemble, rappelée toutes les 15 s (F40) : elle n'en sert que les
 * dernières entrées pour la Salle, ce journal-ci remonte tout l'historique,
 * page par page, à la demande.
 *
 * Garde : celle de la vue Journal (admin et plus). Non connecté ou grade
 * insuffisant : le même 403, comme le reste de /api/admin.
 */

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 50

export const GET = withApiRoute('admin/journal GET', async (request: Request) => {
  try {
    await requireRole(canViewSupervisionAnalytics)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }

  const { page, pageSize, skip } = parsePaging(new URL(request.url).searchParams, {
    defaultSize: DEFAULT_PAGE_SIZE,
    maxSize: MAX_PAGE_SIZE,
  })
  const { entries, total } = await getJournalPage({ skip, take: pageSize })
  return NextResponse.json({ entries, total, page, pageSize })
})
