import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { closeOrphanGameSessions, listGameSessions } from '@/lib/online/game-sessions'
import { adminErrorResponse, parsePaging, requireRole } from '../_guard'

/**
 * Journal des parties LANCÉES, paginé — SÉPARÉ de la vue d'ensemble, qui est
 * rappelée toutes les 15 s (F40) : ce journal n'a rien d'urgent, il est chargé
 * à l'ouverture de l'onglet puis quand l'exploitant change de page (même parti
 * pris que les indicateurs de croissance).
 *
 * La réconciliation passe AVANT la lecture : une salle fermée ou purgée ne
 * prévient pas le journal (aucune clé étrangère, c'est voulu), donc c'est ici
 * qu'on cesse d'annoncer « en cours » des parties qui n'existent plus.
 */

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

export async function GET(request: Request) {
  try {
    await requireRole(canViewSupervisionAnalytics)

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePaging(searchParams, {
      defaultSize: DEFAULT_PAGE_SIZE,
      maxSize: MAX_PAGE_SIZE,
    })

    try {
      await closeOrphanGameSessions()
    } catch (e) {
      // Le ménage ne doit pas priver l'exploitant de son journal.
      console.error('[game-sessions] réconciliation échouée', e)
    }

    const { sessions, total } = await listGameSessions({ skip, take: pageSize })
    return NextResponse.json({ sessions, total, page, pageSize })
  } catch (error) {
    return adminErrorResponse(error, 'game-sessions GET')
  }
}
