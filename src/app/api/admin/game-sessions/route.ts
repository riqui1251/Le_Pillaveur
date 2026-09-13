import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { closeOrphanGameSessions, listGameSessions } from '@/lib/online/game-sessions'
import { cleanupStaleActiveRooms } from '@/lib/online-room'
import { adminErrorResponse, parsePaging, requireRole } from '../_guard'

/**
 * Journal des parties LANCÉES, paginé — SÉPARÉ de la vue d'ensemble, qui est
 * rappelée toutes les 15 s (F40) : ce journal n'a rien d'urgent, il est chargé
 * à l'ouverture de l'onglet puis quand l'exploitant change de page (même parti
 * pris que les indicateurs de croissance).
 *
 * La réconciliation passe AVANT la lecture : une salle fermée ou purgée ne
 * prévient pas le journal (aucune clé étrangère, c'est voulu), donc c'est ici
 * qu'on cesse d'annoncer « en cours » des parties qui n'existent plus — avec
 * une date de fin qui ne dépend pas de l'heure de lecture.
 *
 * `?userId=` : seulement les parties où ce compte a un siège (lien « voir dans
 * le journal » de la fiche compte). Même garde : consulter le journal par
 * compte est réservé aux admins et plus.
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
    // Paramètre vide = pas de filtre ; un identifiant inconnu donne une page vide.
    const userId = searchParams.get('userId')?.trim() || undefined

    try {
      // Purge des salles de jeu abandonnées d'abord : sans elle, une partie
      // quittée par onglet fermé reste « en cours » jusqu'au plafond de 12 h
      // si le journal est lu avant la Vue d'ensemble (ordre de chargement).
      await cleanupStaleActiveRooms()
      await closeOrphanGameSessions()
    } catch (e) {
      // Le ménage ne doit pas priver l'exploitant de son journal.
      console.error('[game-sessions] réconciliation échouée', e)
    }

    const { sessions, total } = await listGameSessions({ skip, take: pageSize, userId })
    return NextResponse.json({ sessions, total, page, pageSize })
  } catch (error) {
    return adminErrorResponse(error, 'game-sessions GET')
  }
}
