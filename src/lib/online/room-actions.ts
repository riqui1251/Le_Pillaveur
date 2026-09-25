import { prisma } from '@/lib/prisma'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { kickMember } from '@/lib/online-room'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { getGameAdapter, type GameAdapter } from '@/lib/online/game-adapters'
import { recordMatchResults } from '@/lib/online/match-results'
import { onlineErrorBody, resolveOnlineErrorCode } from '@/lib/online-errors'
import { armRoomTickerForState } from '@/lib/online/room-ticker'

/**
 * CŒUR « appliquer une action à une salle » — SERVEUR-AUTORITAIRE, générique
 * à tous les jeux du registre (src/lib/online/game-adapters.ts).
 *
 * Deux appelants :
 *  - la route POST /api/online/rooms/[roomId]/action, pour l'intention d'un
 *    joueur ou le tick de service qu'envoie un client arbitre ;
 *  - le minuteur de service (room-ticker.ts), quand aucun client n'a envoyé
 *    ce tick à temps (téléphones verrouillés, table devant la seule TV).
 * Le résultat est une réponse HTTP toute prête (statut + corps) : la route la
 * renvoie telle quelle, le minuteur n'en lit que le statut et le code.
 *
 * Ticks communs : `bot` (un coup de bot), `replace-left` (joueur parti depuis
 * 3 min → bot), `replace-afk` (joueur au tour inactif 3 min → expulsé + bot),
 * `advance` (échéance de phase). Voir src/lib/online/replacement.ts.
 */

/** Réponse d'une action : statut HTTP et corps JSON, identiques pour la route. */
export type RoomActionResult = { status: number; body: Record<string, unknown> }

/**
 * Acteur passé aux moteurs pour un tick de SERVICE (acteur `null`). Aucun
 * compte ne peut porter cet identifiant, et les moteurs ne s'en servent pas :
 * `bot` fait jouer le bot au tour, `advance` n'écoute que l'horloge serveur —
 * exactement ce qu'ils font déjà du tick d'un client arbitre.
 */
export const SERVICE_ACTOR_ID = '__service__'

/**
 * Seules actions ouvertes au service. Il n'agit JAMAIS à la place d'un
 * humain : ni coup de joueur, ni remplacement (`replace-left`/`replace-afk`
 * restent des décisions de la table, horloge serveur à l'appui).
 */
const SERVICE_ACTIONS: ReadonlySet<unknown> = new Set(['bot', 'advance'])

type ActionRoom = {
  id: string
  hostUserId: string
  currentTurnUserId: string | null
  updatedAt: Date
  stateVersion: number
  status: string
  gameId: string | null
  gameStateJson: string | null
  /** `lastSeenAt` : la route action en tire la présence du joueur (le coup vaut présence). */
  members: { userId: string; lastSeenAt: Date }[]
}

/** Salle lue et vérifiée, prête à recevoir l'action. */
export type LoadedActionRoom = { roomId: string; room: ActionRoom; adapter: GameAdapter }

/**
 * Valide une demande de remplacement AFK avec l'horloge SERVEUR :
 * le joueur au tour n'a rien joué depuis le délai de grâce
 * (`updatedAt` de la salle = dernière écriture d'état).
 */
function afkCandidate(room: ActionRoom, requesterId: string): { userId: string } | { error: string } {
  if (!room.currentTurnUserId) return { error: 'NO_ACTIVE_PLAYER' }
  if (room.currentTurnUserId === requesterId) return { error: 'CANNOT_AFK_SELF' }
  const elapsed = Date.now() - room.updatedAt.getTime()
  if (elapsed < ONLINE_REPLACE_GRACE_MS) return { error: 'NOT_AFK_YET' }
  return { userId: room.currentTurnUserId }
}

/**
 * Première moitié : lit la salle et vérifie qu'elle accepte une action de cet
 * acteur. Séparée de la seconde pour la route, qui lit le corps de la requête
 * ENTRE les deux (son plafond de taille dépend du jeu de la salle).
 * `actorUserId` null = tick de service : pas de contrôle d'appartenance.
 */
export async function loadActionRoom(
  roomId: string,
  actorUserId: string | null
): Promise<{ ok: true; loaded: LoadedActionRoom } | { ok: false; result: RoomActionResult }> {
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { select: { userId: true, lastSeenAt: true } } },
  })

  if (!room || room.status !== 'playing') {
    return { ok: false, result: { status: 400, body: onlineErrorBody('game_not_active') } }
  }
  const adapter = getGameAdapter(room.gameId)
  if (!adapter) {
    return { ok: false, result: { status: 400, body: onlineErrorBody('unsupported_game') } }
  }
  if (actorUserId !== null && !room.members.some((m) => m.userId === actorUserId)) {
    // La partie tourne (statut vérifié ci-dessus) mais on n'est plus membre :
    // c'est le remplacement pour inactivité qui nous a sorti de la salle.
    // « Accès refusé » laissait le joueur croire à un bug.
    return { ok: false, result: { status: 403, body: onlineErrorBody('replaced_by_bot') } }
  }
  return { ok: true, loaded: { roomId, room, adapter } }
}

/**
 * Seconde moitié : applique l'action à la salle chargée — version attendue,
 * moteur, compare-and-swap, expulsion AFK, fin de partie, diffusion.
 */
export async function applyActionToRoom(
  loaded: LoadedActionRoom,
  actorUserId: string | null,
  body: Record<string, unknown>
): Promise<RoomActionResult> {
  const { roomId, room, adapter } = loaded

  if (actorUserId === null && !SERVICE_ACTIONS.has(body.action)) {
    return { status: 400, body: onlineErrorBody('invalid_action') }
  }
  const actorId = actorUserId ?? SERVICE_ACTOR_ID

  // Concurrence optimiste : évite les actions basées sur un état périmé.
  const expectedVersion =
    typeof body.expectedVersion === 'number' ? body.expectedVersion : room.stateVersion
  if (expectedVersion !== room.stateVersion) {
    return {
      status: 409,
      body: { ...onlineErrorBody('version_conflict'), stateVersion: room.stateVersion },
    }
  }

  const state = adapter.parse(room.gameStateJson)
  if (!state) {
    return { status: 400, body: onlineErrorBody('invalid_state') }
  }

  let next: unknown
  let kickedUserId: string | null = null

  if (body.action === 'replace-afk') {
    const candidate = afkCandidate(room, actorId)
    if ('error' in candidate) {
      const code = resolveOnlineErrorCode(candidate.error) ?? 'action_failed'
      return { status: 409, body: onlineErrorBody(code) }
    }
    const converted = adapter.convertToBot(state, candidate.userId)
    if (!converted) {
      return { status: 409, body: onlineErrorBody('nothing_to_replace') }
    }
    next = converted
    kickedUserId = candidate.userId
  } else {
    const result = adapter.applyAction(state, actorId, body)
    if (!result.ok) {
      // Statut < 400 = issue NORMALE du jeu, pas un refus (GUESS_WRONG /
      // GUESS_CLOSE au Crobard) : le client lit ce code brut pour son propre
      // retour visuel — on n'y touche pas.
      if (result.status < 400) {
        return { status: result.status, body: { error: result.error } }
      }
      // Refus : on sort un CODE stable, jamais le texte du moteur. Les codes
      // sans traduction dédiée retombent sur le générique traduit.
      const code = resolveOnlineErrorCode(result.error) ?? 'action_failed'
      return { status: result.status, body: onlineErrorBody(code) }
    }
    next = result.state
  }

  const nextVersion = room.stateVersion + 1
  const finished = adapter.isFinished(next)
  const wasFinished = adapter.isFinished(state)
  // Calculé une fois : écrit en base ET renvoyé au client, à l'identique.
  const currentTurnUserId = finished ? null : adapter.currentActorId(next)

  // Compare-and-swap sur stateVersion : si deux actions concurrentes ont lu
  // la même version (ex. ticks « advance » d'un client et du serveur), une
  // seule écrit — l'autre reçoit un 409 inoffensif. Garantit aussi que la
  // transition vers `finished` (et donc l'enregistrement du classement) ne se
  // produit qu'UNE fois.
  const updated = await prisma.onlineRoom.updateMany({
    where: { id: roomId, stateVersion: room.stateVersion },
    data: {
      gameStateJson: adapter.serialize(next),
      stateVersion: nextVersion,
      currentTurnUserId,
    },
  })
  if (updated.count === 0) {
    return { status: 409, body: onlineErrorBody('version_conflict') }
  }
  // Minuteur de service réarmé DANS LA FOULÉE de l'écriture, avant tout autre
  // `await` : deux écritures successives réarment ainsi dans l'ordre de leurs
  // versions. Partie finie → le minuteur est coupé.
  armRoomTickerForState(roomId, { gameId: room.gameId, state: next, stateVersion: nextVersion })

  // Remplacé par un bot en pleine partie : son prochain 403 dira pourquoi
  // (online/departures.ts, via kickMember).
  if (kickedUserId) await kickMember(roomId, room.hostUserId, kickedUserId, 'replaced_by_bot')

  // Partie qui VIENT de se terminer → résultats du classement en ligne.
  // Le jeu est recopié dans une constante : le narrowing d'une propriété ne
  // traverse pas le callback de la transaction.
  const finishedGameId = room.gameId
  if (finished && !wasFinished && finishedGameId) {
    try {
      // TOUT ou RIEN : l'enregistrement écrit le journal, les lignes de
      // classement, les séries, l'XP et les succès. Hors transaction, un échec
      // au milieu laissait un joueur classé sans son XP, ou une série avancée
      // sans partie enregistrée — un écart que rien ne rattrape ensuite.
      // recordMatchResults n'utilise QUE le client reçu (lui et tout ce qu'il
      // appelle : closeGameSession, checkMatchAchievements, awardAchievement) :
      // un `prisma.` global dans ce callback INTERBLOQUERAIT la route, la
      // connexion unique du pool étant déjà prise par la transaction.
      //
      // `maxWait` EXPLICITE, et pas seulement `timeout` : maxWait borne
      // l'attente d'une connexion libre pour DÉMARRER la transaction, et il
      // vaut 2 s par défaut. Avec connection_limit=1 (src/lib/prisma.ts), la
      // fin de partie doit attendre que l'unique connexion se libère — deux
      // tables qui finissent à la même minute dépassaient 2 s et récoltaient un
      // P2028, avalé par le catch ci-dessous : classement, XP, séries, succès
      // et clôture de la session perdus en silence. Les deux bornes restent
      // sous socket_timeout=15 s, pour qu'une requête pendue échoue franchement.
      await prisma.$transaction(
        (tx) => recordMatchResults(tx, { roomId, gameId: finishedGameId, state: next }),
        { maxWait: 10_000, timeout: 10_000 }
      )
    } catch (e) {
      // Le classement ne doit jamais casser la fin de partie côté joueurs.
      // RGPD : seul le NOM de la classe d'erreur part dans les journaux du
      // conteneur — un message Prisma recopie la ligne fautive, donc un pseudo.
      console.error('[match-results] enregistrement échoué', e instanceof Error ? e.name : typeof e)
    }
  }

  publishRoomChanged(roomId, {
    type: finished ? 'finished' : 'changed',
    stateVersion: nextVersion,
  })

  // La réponse porte tout ce que GET /state renverrait (version, vue, tour) :
  // le client l'applique telle quelle et l'écho SSE de son propre coup ne
  // déclenche plus de GET (serverViewFromActionResponse, useGameAction.ts).
  // Un POST par coup, zéro GET. Le service n'a pas de vue : personne ne lit
  // sa réponse, chaque client relit la sienne sur l'écho SSE.
  return {
    status: 200,
    body: {
      ok: true,
      stateVersion: nextVersion,
      ...(actorUserId !== null ? adapter.actionResponse(next, actorUserId) : {}),
      currentTurnUserId,
    },
  }
}

/**
 * Lecture + application d'un seul tenant — ce qu'utilise le minuteur de
 * service (`actorUserId` null). La route, elle, enchaîne les deux moitiés
 * pour lire le corps de la requête entre les deux.
 */
export async function applyRoomAction(
  roomId: string,
  actorUserId: string | null,
  body: Record<string, unknown>
): Promise<RoomActionResult> {
  const checked = await loadActionRoom(roomId, actorUserId)
  if (!checked.ok) return checked.result
  return applyActionToRoom(checked.loaded, actorUserId, body)
}
