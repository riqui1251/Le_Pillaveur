import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { diskProbeDirs, isDiskCritical, measureDiskHealth } from '@/lib/disk-health'

// Sonde publique interrogée par scripts/prod-deploy.sh après le redémarrage du
// conteneur, par le HEALTHCHECK du Dockerfile toutes les 30 s, et par la sonde
// externe (docs/ops/ALERTES.md) sur le mot-clé `"ok":true`. Tant qu'elle
// répondait `{ ok: true }` en dur, un conteneur démarré sans volume de base
// (ou sur un prod.db illisible) se déclarait « en bonne santé » et le
// déploiement passait pour réussi : elle doit donc toucher la base pour avoir
// la moindre valeur.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SERVICE = 'le-pillaveur'

export async function GET() {
  // Disque mesuré AVANT la base et hors de son try/catch : measureDiskHealth
  // ne lève jamais (il rend null quand `fs.statfs` manque), et la mesure vaut
  // aussi quand la base est déjà tombée — souvent pour la même raison. La
  // réponse se limite à un pourcentage : ni chemin, ni sha de build, ni
  // taille, la route est publique.
  const disk = await measureDiskHealth(diskProbeDirs(process.env.DATABASE_URL, process.cwd()))
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
    if (disk !== null && isDiskCritical(disk.freePct)) {
      // `ok: false` bien que la base réponde : la sonde externe n'a que ce
      // champ pour alerter, et un disque plein casse les écritures et la
      // sauvegarde de la nuit avant que la base ne cesse de répondre en
      // lecture.
      console.error(`[health] disque presque plein : ${disk.freePct} % libre`)
      return NextResponse.json({ ok: false, service: SERVICE, db: 'up', disk }, { status: 503 })
    }
    return NextResponse.json({ ok: true, service: SERVICE, db: 'up', disk })
  } catch (error) {
    // Route publique : le détail (chemin du fichier, message Prisma) part dans
    // les logs du conteneur, jamais dans la réponse.
    console.error('[health] base injoignable:', error)
    return NextResponse.json({ ok: false, service: SERVICE, db: 'down', disk }, { status: 503 })
  }
}
