import { NextResponse } from 'next/server'
import { canViewOpsStatus } from '@/lib/roles'
import { collectOpsLive } from '@/lib/ops-live'
import { readOpsStatus } from '@/lib/ops-status'
import type { OpsStatusResponse } from '@/lib/ops-status-types'
import { adminErrorResponse, requireRole } from '../_guard'

// Lit des fichiers (node:fs) et process.memoryUsage : Node obligatoire. Et
// jamais mise en cache par Next — un état de surveillance figé au build ou à
// la première requête dirait « tout va bien » pour toujours.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pas de cache, ni chez le navigateur ni chez un intermédiaire : la réponse
 * est propre au fondateur connecté et n'a de valeur qu'à l'instant présent.
 * Posé aussi sur le refus : un 403 mis en cache survivrait à la connexion.
 */
const NO_STORE = 'no-store'

/**
 * Onglet « Surveillance » de la Supervision : tâches root du VPS (fichiers
 * d'état, src/lib/ops-status.ts) et état en direct du conteneur
 * (src/lib/ops-live.ts), en une réponse.
 *
 * Garde : FONDATEURS seulement (canViewOpsStatus), vérifiée AVANT toute
 * lecture — un autre grade ne déclenche ni accès disque ni requête en base.
 * Les deux collectes ne lèvent jamais : un 500 ici ne peut venir que de
 * l'authentification elle-même.
 *
 * RGPD : la réponse ne contient que des nombres, des dates, des codes, des
 * noms de tâches et de fichiers — rien du compte qui la demande, et aucun
 * chemin du serveur (les scripts n'en écrivent pas, et ops-status.ts réduit
 * tout chemin absolu d'un détail à son nom de fichier). Les URL de ping
 * healthchecks.io (secrets) ne sont jamais lues par l'application : elles
 * vivent dans /etc/le-pillaveur sur l'hôte, pas dans le dossier monté.
 */
export async function GET() {
  try {
    await requireRole(canViewOpsStatus)
    const [live, { jobs, statusDirFound }] = await Promise.all([collectOpsLive(), readOpsStatus()])
    const body: OpsStatusResponse = {
      generatedAt: new Date().toISOString(),
      live,
      jobs,
      statusDirFound,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': NO_STORE } })
  } catch (error) {
    const response = adminErrorResponse(error, 'ops-status GET')
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
