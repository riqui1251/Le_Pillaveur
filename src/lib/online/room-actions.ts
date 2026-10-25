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
 * compte ne peut porter cet identifiant : `bot` fait jouer le bot au tour,
 * `advance` n'écoute que l'horloge serveur — exactement ce qu'ils font déjà
 * du tick d'un client arbitre. Seul le Loup-Garou le reconnaît
 * (LG_SERVICE_ACTOR_ID, égalité vérifiée par night-tick.test.ts) pour
 * réserver au minuteur les coups de bot de nuit : ne pas le renommer seul.
 */
export const SERVICE_ACTOR_ID = '__service__'

/**
 * Seules actions ouvertes au service. Il n'agit JAMAIS à la place d'un
 * humain : ni coup de joueur, ni remplacement (`replace-left`/`replace-afk`
 * restent des décisions de la table, horloge serveur à l'appui).
 */
const SERVICE_ACTIONS: ReadonlySet<unknown> = new Set(['bot', 'advance'])

/**
 * Ticks d'arbitre : décidés sur UNE version précise (le bot au tour, la phase
 * échue, le délai de grâce lu sur `updatedAt`), jamais rejoués sur un état
 * plus récent — un `bot` rejoué ferait jouer le bot SUIVANT sans son délai.
 */
const TICK_ACTIONS: ReadonlySet<unknown> = new Set(['bot', 'advance', 'replace-left', 'replace-afk'])

/**
 * Écritures tentées au plus pour une intention joueur envoyée SANS
 * `expectedVersion` (vote de Dilemmes, carte de Sans Filtre, dépôt du Petit
 * Bac au STOP, dessin du Téléphone, réponse du Crobard pendant un trait) : le
 * joueur agit sur l'état tel qu'il sera à l'arrivée, un compare-and-swap
 * perdu ne dit donc rien de son intention — une autre écriture est passée
 * entre la lecture et l'écriture. On relit et on rejoue le réducteur, qui
 * revalide tout (phase, tour, double dépôt). Le 409 restait muet côté client
 * (useGameAction) : le vote ou la carte se perdaient sans un mot.
 */
const PLAYER_ACTION_ATTEMPTS = 5

/**
 * Attente de base (ms) avant de relire : les perdants d'une même vague se
 * percutaient à nouveau sur la version suivante (même règle que le vote
 * « Rejouer », online-room-launch.ts). Le grain aléatoire les désynchronise.
 */
const PLAYER_ACTION_RETRY_BASE_MS = 8

/** Compare-and-swap perdu : une autre écriture est passée entre lecture et écriture. */
const CAS_LOST = Symbol('cas-lost')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
 *
 * Le tour est relu dans l'état (`stateActorId`), pas seulement dans la
 * colonne : celle d'une salle écrite par une version précédente du serveur
 * désigne encore un joueur en pleine révélation ou au bilan d'une manche,
 * phases désormais sans acteur — il y aurait été expulsé sans avoir la main.
 */
function afkCandidate(
  room: ActionRoom,
  stateActorId: string | null,
  requesterId: string
): { userId: string } | { error: string } {
  if (!room.currentTurnUserId || stateActorId !== room.currentTurnUserId) return { error: 'NO_ACTIVE_PLAYER' }
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
 * Une intention joueur sans `expectedVersion` qui perd le compare-and-swap
 * est rejouée sur la salle relue (PLAYER_ACTION_ATTEMPTS) ; avec une version
 * attendue, ou pour un tick, le 409 reste la réponse.
 */
export async function applyActionToRoom(
  loaded: LoadedActionRoom,
  actorUserId: string | null,
  body: Record<string, unknown>
): Promise<RoomActionResult> {
  const retryable =
    actorUserId !== null && typeof body.expectedVersion !== 'number' && !TICK_ACTIONS.has(body.action)
  let current = loaded
  for (let attempt = 1; ; attempt += 1) {
    const result = await applyActionOnce(current, actorUserId, body)
    if (result !== CAS_LOST) return result
    if (!retryable || attempt >= PLAYER_ACTION_ATTEMPTS) {
      return { status: 409, body: onlineErrorBody('version_conflict') }
    }
    await sleep(PLAYER_ACTION_RETRY_BASE_MS * attempt + Math.random() * PLAYER_ACTION_RETRY_BASE_MS)
    const reloaded = await loadActionRoom(loaded.roomId, actorUserId)
    if (!reloaded.ok) return reloaded.result
    // Une autre partie a pris la place (relance vers un autre jeu) : le corps
    // a été lu et borné pour l'ancien, il ne s'applique pas au nouveau.
    if (reloaded.loaded.room.gameId !== loaded.room.gameId) {
      return { status: 409, body: onlineErrorBody('version_conflict') }
    }
    current = reloaded.loaded
  }
}

async function applyActionOnce(
  loaded: LoadedActionRoom,
  actorUserId: string | null,
  body: Record<string, unknown>
): Promise<RoomActionResult | typeof CAS_LOST> {
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
    const candidate = afkCandidate(room, adapter.currentActorId(state), actorId)
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
  // seule écrit — l'autre reçoit un 409 inoffensif, ou est rejouée sur l'état
  // relu (intention joueur, voir applyActionToRoom). Garantit aussi que la
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
  if (updated.count === 0) return CAS_LOST
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
