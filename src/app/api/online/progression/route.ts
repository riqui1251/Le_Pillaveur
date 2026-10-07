import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildProgression } from '@/lib/online/progression-server'
import { isFirstGameFeedbackDue } from '@/lib/first-game-feedback-server'
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
 *
 * `firstGameFeedback` = la carte d'avis de 1re partie est due (succès
 * `first_game` de moins de 24 h, jamais notée ni refusée, compte récent :
 * src/lib/first-game-feedback.ts). Servi ici parce que c'est la requête que
 * l'écran de fin fait DÉJÀ : pas d'aller-retour de plus pour la carte.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })

  const [progression, firstGameFeedback] = await Promise.all([
    buildProgression(user),
    // Accessoire : une panne de cette lecture ne doit pas priver le joueur de
    // sa progression — la carte ne sort simplement pas.
    isFirstGameFeedbackDue(user.id).catch((error) => {
      console.error('progression firstGameFeedback error:', error)
      return false
    }),
  ])
  return NextResponse.json({ progression, lastGain: recallXpGain(user.id), firstGameFeedback })
}
