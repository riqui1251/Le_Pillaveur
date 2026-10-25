import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { mcTeamCounts } from '@/lib/mots-codes/server-adapter'
import { tabouHasTwoHumansPerTeam } from '@/lib/online-tabou'

/** Refus d'effectif : le code que traduisent les clients, et la borne en jeu. */
export type LaunchRosterRefusal = {
  code: 'min_players' | 'max_players' | 'team_min_players'
  count?: number
}

/**
 * Bornes d'effectif d'un lancement, tenues à DEUX moments : quand l'hôte lance
 * (POST /launch, avant le briefing) et quand le briefing se termine
 * (briefing-start.ts). Entre les deux, un joueur peut quitter la table pendant
 * le tuto : contrôlée au seul lancement, la partie partait avec trop peu de
 * monde — le moteur levait, et la salle restait « playing » sans état.
 *
 * Ce qui est compté : les membres humains, plus les bots que l'hôte a choisis
 * pour un jeu qui se complète (botsFillable). Toucher-Coulé garde sa capacité
 * par format d'équipes ; Mots Codés exige 2 joueurs par équipe et le Tabou
 * Vocal 2 HUMAINS par équipe, après la répartition que fera le lancement.
 */
export function checkLaunchRoster(
  room: { gameId: string | null; settingsJson: string | null },
  memberUserIds: string[]
): LaunchRosterRefusal | null {
  const settings = parseRoomSettings(room.settingsJson)

  if (room.gameId === 'toucher-coule') {
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    if (memberUserIds.length > capacity) return { code: 'max_players', count: capacity }
  } else {
    // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
    const adapter = getGameAdapter(room.gameId)
    const min = adapter?.minPlayers ?? 2
    const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
    const total = memberUserIds.length + bots
    if (total < min) return { code: 'min_players', count: min }
    if (memberUserIds.length > max || total > max) return { code: 'max_players', count: max }
  }

  if (room.gameId === 'mots-codes') {
    const choices: Record<string, 'gold' | 'red'> = {}
    for (const [userId, team] of Object.entries(settings.mcTeams ?? {})) {
      choices[userId] = team === 'A' ? 'gold' : 'red'
    }
    const counts = mcTeamCounts(memberUserIds, choices)
    if (counts.gold < 2 || counts.red < 2) return { code: 'team_min_players' }
  }

  if (room.gameId === 'tabou' && !tabouHasTwoHumansPerTeam(memberUserIds, room.settingsJson)) {
    return { code: 'team_min_players' }
  }

  return null
}
