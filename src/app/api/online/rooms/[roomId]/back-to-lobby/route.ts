import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, touchMemberPresence } from '@/lib/online-room'
import { REMATCH_PRESENCE_MS, resetRoomToWaitingLobby } from '@/lib/online-room-launch'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Tours de compare-and-swap avant d'abandonner. Un vote « Rejouer » écrit
 * dans l'état terminé (sa version bouge) : le retour à la table relit et
 * retente. Trois tours suffisent — au-delà, la table est en train de relancer.
 */
const BACK_TO_LOBBY_ATTEMPTS = 3

type BackToLobbyRoom = {
  id: string
  status: string
  gameId: string | null
  hostUserId: string
  gameStateJson: string | null
  stateVersion: number
  members: { userId: string; lastSeenAt: Date }[]
}

function readRoom(roomId: string): Promise<BackToLobbyRoom | null> {
  return prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      status: true,
      gameId: true,
      hostUserId: true,
      gameStateJson: true,
      stateVersion: true,
      members: { select: { userId: true, lastSeenAt: true } },
    },
  })
}

/**
 * Partie TERMINÉE selon son moteur. La version sentinelle de la relance
 * (négative, processRematchVote) n'en est pas une : l'état terminé y est
 * remis un instant en base pendant que la nouvelle partie se distribue.
 */
function isFinishedGame(room: BackToLobbyRoom): boolean {
  if (room.status !== 'playing' || room.stateVersion <= 0) return false
  const adapter = getGameAdapter(room.gameId)
  if (!adapter) return false
  const state = adapter.parse(room.gameStateJson)
  return state !== null && state !== undefined && adapter.isFinished(state)
}

/**
 * Qui ramène la table : l'hôte ; ou, s'il n'est plus là (trace plus vieille
 * que REMATCH_PRESENCE_MS, la fenêtre du vote « Rejouer »), n'importe quel
 * membre — le demandeur est présent par sa requête même. Sans ce relais, une
 * tablée dont l'hôte est parti se coucher n'avait plus que « Rejouer » (même
 * jeu) ou « Quitter » (nouvelle table, nouveau code à repartager).
 */
function mayBringBack(room: BackToLobbyRoom, userId: string, now: number): boolean {
  if (room.hostUserId === userId) return true
  const host = room.members.find((m) => m.userId === room.hostUserId)
  return !host || host.lastSeenAt.getTime() < now - REMATCH_PRESENCE_MS
}

/**
 * Fin de partie → retour à la table d'attente : même salle, même code, mêmes
 * joueurs (tous « pas prêts »), réglages intacts. C'est de là que l'hôte
 * relance, change de jeu ou attend le retardataire — sans recréer de table.
 *
 * Réponses : 200 `{ room }` (y compris si la table était DÉJÀ revenue : deux
 * présents qui cliquent ensemble obtiennent le même résultat) ;
 * `game_not_finished` (409) si la partie tourne encore, se briefe ou relance ;
 * `not_host` (403) pour un membre quand l'hôte est là ; `forbidden` (403) hors
 * de la table ; `room_not_found` (404) ; `conflict` (409) si la course
 * d'écriture est perdue trois fois.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params

  for (let attempt = 0; attempt < BACK_TO_LOBBY_ATTEMPTS; attempt++) {
    const room = await readRoom(roomId)
    if (!room) {
      return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
    }
    if (!room.members.some((m) => m.userId === user.id)) {
      return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
    }
    if (room.status === 'waiting') {
      // Déjà revenue (un autre présent a cliqué, ou la course d'à côté) : le
      // but est atteint, même réponse que le geste réussi.
      const dto = await buildRoomDto(roomId, user.id)
      return NextResponse.json({ room: dto })
    }
    if (!isFinishedGame(room)) {
      return NextResponse.json(onlineErrorBody('game_not_finished'), { status: 409 })
    }
    if (!mayBringBack(room, user.id, Date.now())) {
      return NextResponse.json(onlineErrorBody('not_host'), { status: 403 })
    }

    // Le geste vaut présence (même règle que le vote « Rejouer ») : la table
    // qui revient en attente ne doit pas tenir le demandeur pour absent.
    await touchMemberPresence(roomId, user.id)

    // Réclamation atomique sur la version lue : un vote « Rejouer » ou une
    // relance entre la lecture et cette écriture la fait échouer, et on
    // relit. La MÊME écriture efface la partie terminée — un vote concurrent
    // qui relirait la salle n'y trouve plus rien à relancer.
    // resetRoomToWaitingLobby refait ensuite ces champs (sans effet), remet
    // tout le monde « pas prêt » et remet la présence de chacun à maintenant :
    // l'onglet caché à la fin de la partie garde son siège le temps du délai
    // de grâce du lobby, au lieu d'être purgé au premier sondage.
    const claimed = await prisma.onlineRoom.updateMany({
      where: { id: roomId, status: 'playing', stateVersion: room.stateVersion },
      data: { status: 'waiting', gameStateJson: null, stateVersion: 0, currentTurnUserId: null },
    })
    if (claimed.count === 0) continue

    await resetRoomToWaitingLobby(roomId)
    // La table réapparaît au guichet (si publique) et quitte les parties en
    // cours ; resetRoomToWaitingLobby invalide déjà, mais c'est à l'appelant
    // de ne pas en dépendre.
    invalidateLobbiesCache()
    // `lobby` : chaque écran de fin relit la salle complète et retombe sur le
    // lobby du jeu (statut 'waiting').
    publishRoomChanged(roomId, { type: 'lobby' })

    const dto = await buildRoomDto(roomId, user.id)
    return NextResponse.json({ room: dto })
  }

  return NextResponse.json(onlineErrorBody('conflict'), { status: 409 })
}
