import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { kickMember } from '@/lib/online-room'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { recordMatchResults } from '@/lib/online/match-results'
import { onlineErrorBody, resolveOnlineErrorCode } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Une intention de jeu ordinaire tient en quelques champs (un identifiant, un
 * index, un mot) : 8 Ko est déjà très large.
 */
const MAX_ACTION_BODY_BYTES = 8 * 1024

/**
 * Sauf pour les jeux de dessin, où l'action PORTE le dessin. Un client honnête
 * envoie chaque trait simplifié et arrondi à 3 décimales (lib/crobard/
 * simplify.ts) : ~6 octets par nombre, séparateur compris, et un trait humain
 * tient en quelques dizaines de points. Au pire, sur le plafond du moteur
 * (CANVAS_MAX_POINTS_PER_STROKE = 300 points = 600 nombres ≈ 3,6 Ko par trait) :
 *  - Crobard : une action = UN trait, donc ~3,6 Ko ;
 *  - Téléphone Dessiné : l'action `submit` porte le dessin ENTIER, accumulé
 *    pendant TELEPHONE_DRAW_MS = 80 s — CANVAS_MAX_STROKES = 400 traits pleins
 *    feraient ~1,4 Mo en théorie, mais 400 hachures de 300 points en 80 s,
 *    ça n'existe pas : un dessin humain simplifié pèse quelques kilo-octets.
 * D'où 512 Ko : de la marge au-dessus d'un dessin humainement possible, et
 * surtout un plafond AVANT le parse — sanitizeStroke ne tronque qu'APRÈS :
 * sans lui, un corps de plusieurs mégaoctets (coordonnées brutes à 17
 * caractères, traits sans fin) était d'abord matérialisé en mémoire.
 */
const MAX_DRAWING_ACTION_BODY_BYTES = 512 * 1024
const DRAWING_GAMES = new Set(['crobard', 'telephone-dessine'])

type RoomRow = {
  id: string
  hostUserId: string
  currentTurnUserId: string | null
  updatedAt: Date
  stateVersion: number
}

/**
 * Valide une demande de remplacement AFK avec l'horloge SERVEUR :
 * le joueur au tour n'a rien joué depuis le délai de grâce
 * (`updatedAt` de la salle = dernière écriture d'état).
 */
function afkCandidate(room: RoomRow, requesterId: string): { userId: string } | { error: string } {
  if (!room.currentTurnUserId) return { error: 'NO_ACTIVE_PLAYER' }
  if (room.currentTurnUserId === requesterId) return { error: 'CANNOT_AFK_SELF' }
  const elapsed = Date.now() - room.updatedAt.getTime()
  if (elapsed < ONLINE_REPLACE_GRACE_MS) return { error: 'NOT_AFK_YET' }
  return { userId: room.currentTurnUserId }
}

/**
 * Action de jeu SERVEUR-AUTORITAIRE — GÉNÉRIQUE à tous les jeux du registre
 * (`src/lib/online/game-adapters.ts`).
 *
 * Le client n'envoie qu'une intention : le serveur détient l'état, valide le
 * tour via le moteur du jeu, applique le réducteur, persiste et diffuse en
 * SSE. Ticks communs : `bot` (un coup de bot), `replace-left` (joueur parti
 * depuis 3 min → bot), `replace-afk` (joueur au tour inactif 3 min → expulsé
 * + bot). Voir src/lib/online/replacement.ts.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { select: { userId: true } } },
  })

  if (!room || room.status !== 'playing') {
    return NextResponse.json(onlineErrorBody('game_not_active'), { status: 400 })
  }
  const adapter = getGameAdapter(room.gameId)
  if (!adapter) {
    return NextResponse.json(onlineErrorBody('unsupported_game'), { status: 400 })
  }
  if (!room.members.some((m) => m.userId === user.id)) {
    // La partie tourne (statut vérifié ci-dessus) mais on n'est plus membre :
    // c'est le remplacement pour inactivité qui nous a sorti de la salle.
    // « Accès refusé » laissait le joueur croire à un bug.
    return NextResponse.json(onlineErrorBody('replaced_by_bot'), { status: 403 })
  }

  // Le plafond dépend du jeu de la salle, connue avant d'avoir lu le corps :
  // seul un jeu de dessin a le droit d'envoyer plus que quelques champs.
  // Refus de corps trop gros : `payload_too_large`, le code générique que
  // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
  // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
  // parler de « signal » à qui crée une table n'a aucun sens.
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
    request,
    DRAWING_GAMES.has(room.gameId ?? '')
      ? MAX_DRAWING_ACTION_BODY_BYTES
      : MAX_ACTION_BODY_BYTES
  )
  if (!parsed.ok && parsed.reason === 'too_large') {
    return NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
  }
  // Corps absent ou illisible : comme avant, on continue avec un objet vide —
  // plusieurs ticks (`advance`, `bot`) n'envoient rien du tout, et le moteur
  // refusera lui-même une intention qui n'a pas de sens.
  const body = (parsed.ok ? parsed.body : null) ?? {}

  // Concurrence optimiste : évite les actions basées sur un état périmé.
  const expectedVersion =
    typeof body.expectedVersion === 'number' ? body.expectedVersion : room.stateVersion
  if (expectedVersion !== room.stateVersion) {
    return NextResponse.json(
      { ...onlineErrorBody('version_conflict'), stateVersion: room.stateVersion },
      { status: 409 }
    )
  }

  const state = adapter.parse(room.gameStateJson)
  if (!state) {
    return NextResponse.json(onlineErrorBody('invalid_state'), { status: 400 })
  }

  let next: unknown
  let kickedUserId: string | null = null

  if (body.action === 'replace-afk') {
    const candidate = afkCandidate(room, user.id)
    if ('error' in candidate) {
      const code = resolveOnlineErrorCode(candidate.error) ?? 'action_failed'
      return NextResponse.json(onlineErrorBody(code), { status: 409 })
    }
    const converted = adapter.convertToBot(state, candidate.userId)
    if (!converted) {
      return NextResponse.json(onlineErrorBody('nothing_to_replace'), { status: 409 })
    }
    next = converted
    kickedUserId = candidate.userId
  } else {
    const result = adapter.applyAction(state, user.id, body)
    if (!result.ok) {
      // Statut < 400 = issue NORMALE du jeu, pas un refus (GUESS_WRONG /
      // GUESS_CLOSE au Crobard) : le client lit ce code brut pour son propre
      // retour visuel — on n'y touche pas.
      if (result.status < 400) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      // Refus : on sort un CODE stable, jamais le texte du moteur. Les codes
      // sans traduction dédiée retombent sur le générique traduit.
      const code = resolveOnlineErrorCode(result.error) ?? 'action_failed'
      return NextResponse.json(onlineErrorBody(code), { status: result.status })
    }
    next = result.state
  }

  const nextVersion = room.stateVersion + 1
  const finished = adapter.isFinished(next)
  const wasFinished = adapter.isFinished(state)
  // Calculé une fois : écrit en base ET renvoyé au client, à l'identique.
  const currentTurnUserId = finished ? null : adapter.currentActorId(next)

  // Compare-and-swap sur stateVersion : si deux actions concurrentes ont lu
  // la même version (ex. ticks « advance » envoyés par tous les clients),
  // une seule écrit — l'autre reçoit un 409 inoffensif. Garantit aussi que
  // la transition vers `finished` (et donc l'enregistrement du classement)
  // ne se produit qu'UNE fois.
  const updated = await prisma.onlineRoom.updateMany({
    where: { id: roomId, stateVersion: room.stateVersion },
    data: {
      gameStateJson: adapter.serialize(next),
      stateVersion: nextVersion,
      currentTurnUserId,
    },
  })
  if (updated.count === 0) {
    return NextResponse.json(onlineErrorBody('version_conflict'), { status: 409 })
  }
  if (kickedUserId) await kickMember(roomId, room.hostUserId, kickedUserId)

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
  // Un POST par coup, zéro GET.
  return NextResponse.json({
    ok: true,
    stateVersion: nextVersion,
    ...adapter.actionResponse(next, user.id),
    currentTurnUserId,
  })
}
