import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getAccountActivity } from '@/lib/account-activity-server'
import { closeOrphanGameSessions } from '@/lib/online/game-sessions'
import { cleanupStaleActiveRooms } from '@/lib/online-room'
import { adminErrorResponse, requireRole } from '../../../_guard'

/**
 * Activité EN LIGNE d'un compte pour sa fiche : parties, séances, durées de
 * table, jeux, réseaux IP et navigateurs liés. Réservée aux admins et plus
 * (canViewSupervisionAnalytics), comme le journal des parties dont elle est
 * tirée : l'identité et la modération du compte restent servies à tout le
 * staff par /api/admin/users/[userId]. Un modérateur reçoit 403 et la fiche
 * masque simplement ces blocs.
 *
 * Chargée à l'ouverture de la fiche et sur « Actualiser », jamais en boucle.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireRole(canViewSupervisionAnalytics)
    const { userId } = await params

    // Même ménage que le journal avant lecture : une partie dont la salle a
    // disparu cesse d'être annoncée « en cours ». La purge des salles de jeu
    // abandonnées passe d'abord : la fiche s'ouvre souvent par un lien gardé,
    // sans la Vue d'ensemble (seule à purger en boucle), et la réconciliation
    // laisse ouverte une salle encore « en jeu » de moins de 12 h — une partie
    // quittée par onglet fermé restait « En cours » tout ce temps.
    try {
      await cleanupStaleActiveRooms()
      await closeOrphanGameSessions()
    } catch (e) {
      // Le ménage ne doit pas priver l'exploitant de la fiche.
      console.error('[account-activity] réconciliation échouée', e)
    }

    const activity = await getAccountActivity(userId)
    if (!activity) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }
    return NextResponse.json(activity)
  } catch (error) {
    return adminErrorResponse(error, 'user activity GET')
  }
}
