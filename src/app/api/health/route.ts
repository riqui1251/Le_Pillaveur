import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Sonde publique interrogée par scripts/prod-deploy.sh après le redémarrage du
// conteneur. Tant qu'elle répondait `{ ok: true }` en dur, un conteneur démarré
// sans volume de base (ou sur un prod.db illisible) se déclarait « en bonne
// santé » et le déploiement passait pour réussi : elle doit donc toucher la
// base pour avoir la moindre valeur.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    // Un `SELECT 1` ne prouvait rien non plus : SQLite recrée un fichier vide
    // quand le volume est perdu, et un schéma jamais migré y répondrait tout
    // aussi bien. On interroge donc une vraie table du schéma, la plus
    // centrale (User) : sa disparition = volume perdu ou migrations non
    // appliquées, et le déploiement doit échouer.
    // `take: 1` borne le comptage à une ligne (COUNT sur une sous-requête
    // LIMIT 1) : la route est publique et appelée en boucle, elle ne doit
    // jamais parcourir toute la table.
    await prisma.user.count({ take: 1 })
    return NextResponse.json({ ok: true, service: 'le-pillaveur', db: 'up' })
  } catch (error) {
    // Route publique : le détail (chemin du fichier, message Prisma) part dans
    // les logs du conteneur, jamais dans la réponse.
    console.error('[health] base injoignable:', error)
    return NextResponse.json({ ok: false, service: 'le-pillaveur', db: 'down' }, { status: 503 })
  }
}
