import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { mcTeamCounts } from '@/lib/mots-codes/server-adapter'
import { tabouHasTwoHumansPerTeam } from '@/lib/online-tabou'
import type { OnlineErrorCode, OnlineErrorParams } from '@/lib/online-errors'

export type LaunchRosterRefusal = { code: OnlineErrorCode; params?: OnlineErrorParams }

/**
 * Bornes d'effectif d'un lancement, partagées par POST /launch (avant le
 * briefing) et /briefing-ack (après, quand un joueur a pu partir entre-temps) :
 * les deux routes ne doivent jamais diverger. `null` : l'effectif passe.
 *
 * `afterBriefing` : le minimum d'un jeu à bots de complément n'est plus refusé
 * ici. Plusieurs lanceurs (Chiffre Piégé, Dilemmes, À Vue de Nez, 12-20)
 * complètent seuls jusqu'au minimum : un joueur resté seul après un départ
 * joue avec un bot au lieu de retomber au lobby. Ceux qui lèvent sont
 * rattrapés par le retour au lobby de /briefing-ack.
 */
export function launchRosterRefusal(
  room: { gameId: string | null; settingsJson: string | null },
  memberUserIds: string[],
  opts: { afterBriefing?: boolean } = {}
): LaunchRosterRefusal | null {
  const settings = parseRoomSettings(room.settingsJson)

  // Toucher-Coulé : capacité dépendante du format d'équipes (bots de complément).
  if (room.gameId === 'toucher-coule') {
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    if (memberUserIds.length > capacity) return { code: 'max_players', params: { count: capacity } }
  } else {
    // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
    // Le minimum s'applique au TOTAL humains + bots choisis par l'hôte.
    const adapter = getGameAdapter(room.gameId)
    const min = adapter?.minPlayers ?? 2
    const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
    const total = memberUserIds.length + bots
    const launcherDecides = opts.afterBriefing === true && adapter?.botsFillable === true
    if (!launcherDecides && total < min) return { code: 'min_players', params: { count: min } }
    if (memberUserIds.length > max || total > max) return { code: 'max_players', params: { count: max } }
  }

  // Mots Codés : 2 joueurs minimum PAR ÉQUIPE après répartition automatique.
  if (room.gameId === 'mots-codes') {
    const choices: Record<string, 'gold' | 'red'> = {}
    for (const [userId, team] of Object.entries(settings.mcTeams ?? {})) {
      choices[userId] = team === 'A' ? 'gold' : 'red'
    }
    const counts = mcTeamCounts(memberUserIds, choices)
    if (counts.gold < 2 || counts.red < 2) return { code: 'team_min_players' }
  }

  // Tabou Vocal : 2 joueurs HUMAINS minimum par équipe — un bot ne décrit
  // rien, ses manches tourneraient à vide (règle et raison dans online-tabou).
  if (room.gameId === 'tabou' && !tabouHasTwoHumansPerTeam(memberUserIds, room.settingsJson)) {
    return { code: 'team_min_players' }
  }

  return null
}
