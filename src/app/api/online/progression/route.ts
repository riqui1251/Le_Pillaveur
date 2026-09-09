import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildProgression } from '@/lib/online/progression-server'
import { recallXpGain } from '@/lib/online/xp'
import { onlineErrorBody } from '@/lib/online-errors'

/**
 * Progression du compte connecté : XP, niveau, cosmétiques débloqués.
 *
 * `lastGain` = détail de la DERNIÈRE partie créditée (gain de base, bonus de
 * série, total, niveau avant/après, succès débloqués). C'est le serveur qui
 * crédite, c'est donc lui qui dit ce qu'il a crédité : la bannière de fin de
 * partie ne fait plus que l'afficher. `null` = rien de récent à annoncer.
 *
 * ATTENTION : ce détail est celui du dernier gain du JOUEUR (mémoire d'une
 * demi-heure), il n'est rattaché à AUCUNE partie précise. L'appelant doit donc
 * le confronter à `progression.xp` avant de l'afficher — c'est ce que fait
 * `gainForCurrentXp` dans XpGainBanner — sinon un écran de fin rouvert
 * annoncerait le gain d'une autre partie.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })

  const progression = await buildProgression(user)
  return NextResponse.json({ progression, lastGain: recallXpGain(user.id) })
}
