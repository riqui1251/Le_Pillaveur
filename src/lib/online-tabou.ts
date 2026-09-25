import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildTabouPlayers, buildTabouState, serializeTabouState } from '@/lib/tabou/server-adapter'
import { currentTabouActorId, type TabouTeam } from '@/lib/tabou/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Règle de table du Tabou Vocal : 2 joueurs HUMAINS minimum par équipe. Le
 * moteur accepte une équipe complétée par des bots, mais un bot ne décrit
 * rien : ses manches tourneraient à vide et son équipe ne devinerait jamais.
 * La répartition est celle que fera le lancement (buildTabouPlayers : choix
 * du lobby honorés, le reste équilibré) — on n'y compte que les humains.
 * Tenue au lancement (route launch) ET à la relance « Rejouer »
 * (processRematchVote), qui ne passe pas par la route.
 */
export function tabouHasTwoHumansPerTeam(memberUserIds: string[], settingsJson: string | null): boolean {
  const settings = parseRoomSettings(settingsJson)
  const teamChoices = (settings.tabouTeams ?? {}) as Record<string, TabouTeam>
  const seated = buildTabouPlayers(
    memberUserIds.map((userId) => ({ userId, displayName: '' })),
    teamChoices
  )
  const humans = (team: TabouTeam) => seated.filter((p) => !p.isBot && p.team === team).length
  return humans('A') >= 2 && humans('B') >= 2
}

/**
 * Lance (ou relance) une partie de Tabou Vocal — SERVEUR-AUTORITAIRE. Les
 * mots sont tirés dans la LANGUE de la salle ; les équipes sont celles
 * choisies au lobby (réutilise le sélecteur d'équipes de Toucher-Coulé).
 *
 * Aucun bot demandé : le Tabou n'est plus botsFillable (un bot ne décrit
 * rien), et settings.botsCount — qu'un PUT /settings accepte pour tout jeu —
 * ajouterait sinon des bots au-delà des 2 humains par équipe exigés au
 * lancement. Lancement et relance « Rejouer » vérifient la règle AVANT
 * d'arriver ici (tabouHasTwoHumansPerTeam) ; buildTabouPlayers ne comble donc
 * une équipe tombée sous 2 qu'en filet de sécurité, contrainte du moteur.
 */
export async function launchTabouRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const teamChoices = (settings.tabouTeams ?? {}) as Record<string, TabouTeam>
  const members = room.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName }))

  const state = buildTabouState(members, teamChoices, settings.lang, 0, undefined, settings.tabouTargetScore)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeTabouState(state),
      stateVersion: 1,
      currentTurnUserId: currentTabouActorId(state),
    },
  })
}
