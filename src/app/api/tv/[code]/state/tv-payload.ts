import type { TvRoomDto } from '@/lib/online-room'

/**
 * Forme d'un identifiant de compte : cuid Prisma (`c` + 24 caractères
 * alphanumériques minuscules). Les gardes autour du motif évitent de mordre au
 * milieu d'une chaîne plus longue (un jeton de 30 caractères ne doit pas voir
 * ses 25 premiers remplacés, ce qui produirait un texte à moitié réécrit).
 */
const ACCOUNT_ID_RE = /(?<![a-z0-9])c[a-z0-9]{24}(?![a-z0-9])/g

/**
 * Nettoyage de la charge utile envoyée à un écran TV.
 *
 * L'endpoint TV est PUBLIC (le code de table fait jeton, aucun compte requis) :
 * n'importe qui devant la télé — ou qui devine un code à six caractères — lit
 * ce JSON. Or il transportait les identifiants internes des comptes (`userId`,
 * `hostUserId`, `currentTurnUserId`, et les mêmes ids répétés dans l'état de
 * jeu), qui servent ailleurs de clé d'API (invitations, amis, signalements).
 * Un afficheur n'en a aucun besoin : il lui faut seulement pouvoir dire « ce
 * joueur-ci est le même que celui-là ».
 *
 * On remplace donc chaque identifiant par un ALIAS opaque, stable le temps de
 * la soirée, y compris À L'INTÉRIEUR de `gameStateJson`. Les corrélations dont
 * dépend le rendu (icône d'un joueur, joueur actif, gagnant) survivent
 * intactes, parce que l'alias ne dépend que de l'identifiant réel.
 *
 * Le masquage se fait en DEUX temps, et le second n'est pas une précaution
 * théorique : se contenter des membres encore présents laissait fuiter tout id
 * resté ailleurs dans l'état sérialisé — joueur parti en cours de partie, bot
 * remplacé par un humain (ou l'inverse), historique des plis, votes d'un
 * éliminé, salle citée par son propre id. Un balayage final remplace donc tout
 * identifiant résiduel par le même alias que s'il avait été membre.
 *
 * Sont aussi retirés : `settings` (réglages de table, dont les répartitions
 * d'équipes indexées par identifiant — rien de tout ça n'est affiché) et
 * `level`, jamais montré à l'écran.
 */
export function toTvDisplayPayload(
  room: TvRoomDto,
  alias: (realId: string) => string
): TvRoomDto {
  const mapping = new Map<string, string>()
  const aliasOf = (realId: string): string => {
    const known = mapping.get(realId)
    if (known) return known
    const next = alias(realId)
    mapping.set(realId, next)
    return next
  }

  const members = room.members.map((m) => ({
    ...m,
    userId: aliasOf(m.userId),
    // Le niveau n'apparaît nulle part sur l'écran TV : rien à en dire.
    level: 0,
  }))

  const hostUserId = room.hostUserId ? aliasOf(room.hostUserId) : room.hostUserId
  const currentTurnUserId = room.currentTurnUserId ? aliasOf(room.currentTurnUserId) : null

  let gameStateJson = room.gameStateJson
  if (gameStateJson) {
    // 1) Substitution littérale des ids connus : elle ne dépend d'aucune forme
    //    particulière et couvre les identifiants quelle que soit leur syntaxe.
    for (const [real, fake] of mapping) {
      gameStateJson = gameStateJson.split(real).join(fake)
    }
    // 2) Filet : tout ce qui RESSEMBLE encore à un identifiant de compte est
    //    aliasé à son tour. `aliasOf` mémorise, donc un même id absent des
    //    membres garde le même alias d'un champ à l'autre — et d'un appel à
    //    l'autre, puisque `alias` est déterministe pour une salle donnée.
    gameStateJson = gameStateJson.replace(ACCOUNT_ID_RE, (id) => aliasOf(id))
  }

  return {
    code: room.code,
    status: room.status,
    gameId: room.gameId,
    hostUserId,
    members,
    settings: {},
    stateVersion: room.stateVersion,
    currentTurnUserId,
    gameStateJson,
  }
}
