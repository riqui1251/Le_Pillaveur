import { prisma } from '@/lib/prisma'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { launchPetitBuveurRoom } from '@/lib/online-petit-buveur'
import { launchPurpleRoom } from '@/lib/online-purple'
import { launch1220Room } from '@/lib/online-1220'
import { launchToucherCouleRoom } from '@/lib/online-toucher-coule'
import { launchMenteurRoom } from '@/lib/online-menteur'
import { launchImposteurRoom } from '@/lib/online-imposteur'
import { launchQuizRoom } from '@/lib/online-quiz'
import { launchLoupGarouRoom } from '@/lib/online-loup-garou'
import { launchBluffRoom } from '@/lib/online-bluff'
import { launchEspionRoom } from '@/lib/online-espion'
import { launchTabouRoom } from '@/lib/online-tabou'
import { launchCrobardRoom } from '@/lib/online-crobard'
import { launchTelephoneDessineRoom } from '@/lib/online-telephone-dessine'
import { launchSansFiltreRoom } from '@/lib/online-sans-filtre'
import { launchMotsCodesRoom } from '@/lib/online-mots-codes'
import { launchDilemmesRoom } from '@/lib/online-dilemmes'
import { launchPetitBacRoom } from '@/lib/online-petit-bac'
import { launchPresidentRoom } from '@/lib/online-president'
import { isOnlineGameFinished, parseOnlineGameState } from '@/lib/online-game-state'
import { recordGameSessionStart } from '@/lib/online/game-sessions'
import { armRoomTicker, cancelRoomTicker } from '@/lib/online/room-ticker'
import { recordDeparture } from '@/lib/online/departures'

export type RoomWithMembers = {
  id: string
  gameId: string | null
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

export async function resetRoomToWaitingLobby(roomId: string) {
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'waiting',
      gameStateJson: null,
      stateVersion: 0,
      currentTurnUserId: null,
    },
  })
  // Présence remise à maintenant : la table d'attente purge qui n'a pas été
  // vu depuis 2 min (purgeAbsentLobbyMembers), or en partie `lastSeenAt`
  // n'avance qu'avec les coups joués — l'onglet caché au moment du retour
  // aurait perdu son siège sur-le-champ, au premier sondage. Chacun reçoit
  // donc le délai de grâce entier du lobby, pas une trace d'avant la partie.
  await prisma.onlineRoomMember.updateMany({
    where: { roomId },
    data: { isReady: false, lastSeenAt: new Date() },
  })
  // Plus de partie : le minuteur de service n'a plus rien à surveiller.
  cancelRoomTicker(roomId)
  // La table repasse 'waiting' : elle réapparaît dans `lobbies` du guichet,
  // quel que soit l'appelant.
  invalidateLobbiesCache()
}

/**
 * Horodate « partie jouée » pour chaque membre humain de la salle — alimente
 * la rangée « Rejouer » de /jeux. Fire-and-forget : l'historique ne doit
 * jamais empêcher un lancement.
 */
async function recordGameHistory(room: RoomWithMembers) {
  const gameId = room.gameId
  if (!gameId) return
  try {
    const now = new Date()
    await Promise.all(
      room.members.map((m) =>
        prisma.onlineGameHistory.upsert({
          where: { userId_gameId: { userId: m.userId, gameId } },
          create: { userId: m.userId, gameId, lastPlayedAt: now },
          update: { lastPlayedAt: now, playCount: { increment: 1 } },
        })
      )
    )
  } catch (error) {
    console.error('recordGameHistory failed:', error)
  }
}

/** Lance (ou relance) une partie avec état initial synchronisé selon le jeu */
export async function launchOnlineRoom(roomId: string, room: RoomWithMembers) {
  await recordGameHistory(room)
  switch (room.gameId ?? '') {
    case 'petit-buveur':
      await launchPetitBuveurRoom(roomId, room)
      break
    case 'purple':
      await launchPurpleRoom(roomId, room)
      break
    case '1220':
      await launch1220Room(roomId, room)
      break
    case 'toucher-coule':
      await launchToucherCouleRoom(roomId, room)
      break
    case 'menteur':
      await launchMenteurRoom(roomId, room)
      break
    case 'imposteur':
      await launchImposteurRoom(roomId, room)
      break
    case 'quiz':
      await launchQuizRoom(roomId, room)
      break
    case 'loup-garou':
      await launchLoupGarouRoom(roomId, room)
      break
    case 'bluff':
      await launchBluffRoom(roomId, room)
      break
    case 'espion':
      await launchEspionRoom(roomId, room)
      break
    case 'tabou':
      await launchTabouRoom(roomId, room)
      break
    case 'crobard':
      await launchCrobardRoom(roomId, room)
      break
    case 'telephone-dessine':
      await launchTelephoneDessineRoom(roomId, room)
      break
    case 'sans-filtre':
      await launchSansFiltreRoom(roomId, room)
      break
    case 'mots-codes':
      await launchMotsCodesRoom(roomId, room)
      break
    case 'dilemmes':
      await launchDilemmesRoom(roomId, room)
      break
    case 'petit-bac':
      await launchPetitBacRoom(roomId, room)
      break
    case 'president':
      await launchPresidentRoom(roomId, room)
      break
    default: {
      // Aucun lanceur pour ce jeu : la salle part « playing » sans état, et
      // c'est POST /action qui fera foi. Les quatre jeux client-autoritaires
      // (hi-lo, monsieur-3, pmu, plinko) tombaient ici depuis le retrait de
      // leurs lanceurs — ils ne sont plus `onlineReady`, donc POST /rooms
      // refuse de leur ouvrir une table ; seule une salle héritée en base
      // pourrait encore passer par là.
      const memberUserIds = room.members.map((m) => m.userId)
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: {
          status: 'playing',
          stateVersion: 1,
          currentTurnUserId: memberUserIds[0] ?? null,
        },
      })
    }
  }
  // Journal des parties (Supervision), APRÈS le lancement : c'est lui qui
  // écrit l'état, et donc les bots — ils ne sont pas membres de la salle.
  // Même règle que l'historique ci-dessus : ne lève jamais.
  await recordGameSessionStart(roomId)
  // Premier tick de service de la partie (bot qui ouvre, compte à rebours
  // d'entrée) : le serveur le tiendra si aucun téléphone ne l'envoie. Couvre
  // briefing-ack et rematch, les deux chemins qui passent ici. Ne lève jamais.
  await armRoomTicker(roomId)
  // Alimente `recentLaunches` du guichet — couvre d'un coup briefing-ack et
  // rematch, les deux chemins qui passent ici.
  invalidateLobbiesCache()
}

/**
 * Nombre de tours de compare-and-swap avant d'abandonner : chaque tour ne
 * laisse passer QU'UN vote, donc sur une table de 8 à 10 joueurs qui cliquent
 * « Rejouer » ensemble, 3 tours renvoyaient une erreur à des votes pourtant
 * légitimes. Au-delà de 10 on préfère quand même l'erreur explicite à une
 * boucle qui s'éternise.
 */
const REMATCH_VOTE_ATTEMPTS = 10

/**
 * Attente de base (ms) entre deux tours : sans elle les votes perdants
 * relisent la base dans la foulée et se percutent à nouveau sur la même
 * version. Le facteur croissant et le grain aléatoire les désynchronisent.
 */
const REMATCH_RETRY_BASE_MS = 12

/**
 * Version sentinelle posée par la réclamation de relance. Aucune partie ne la
 * produit (0 = lobby, ≥ 1 = partie), donc un vote concurrent qui la relit sait
 * que la relance lui a échappé et s'arrête — au lieu de redistribuer les
 * cartes une seconde fois.
 */
const REMATCH_CLAIMED_VERSION = -1

/**
 * Fenêtre de présence (ms) du vote « Rejouer » : un membre dont la dernière
 * trace (`lastSeenAt`) remonte à plus de 90 s est tenu pour ABSENT — il ne
 * compte ni dans le quorum ni par son vote, et la relance le retire de la
 * table. Avant cette règle, le vote de CHAQUE membre en base était exigé : un
 * joueur qui avait fermé l'onglet sans quitter bloquait la relance pour de
 * bon, sans délai ni majorité — et personne à la table ne pouvait la
 * débloquer.
 *
 * Pourquoi 90 s et pas moins : `lastSeenAt` n'est écrit qu'au plus toutes les
 * 30 s (PRESENCE_WRITE_INTERVAL_MS, online-room.ts) par le sondage de
 * GET /rooms/[roomId], lui-même cadencé à 15 s sur l'écran de fin flux SSE
 * vivant (25 s en lobby) : la trace d'un joueur BIEN LÀ peut donc accuser
 * jusqu'à ~55 s de retard. 90 s laisse un sondage entier de marge sans faire
 * poireauter la tablée. Un onglet caché suspend son sondage (pollEnabledRef,
 * useOnlineRoom.ts) : un téléphone dans la poche depuis plus de 90 s passe
 * absent, c'est voulu — la table ne l'attend pas, il retombe sur un 403 au
 * retour (cf. dropAbsentMembers).
 */
export const REMATCH_PRESENCE_MS = 90 * 1000

/**
 * Salle telle que la route rematch la lit : RoomWithMembers plus la partie
 * terminée et, sur chaque membre, sa présence — c'est elle qui fait le quorum.
 */
export type RematchRoom = Omit<RoomWithMembers, 'members'> & {
  gameStateJson: string | null
  stateVersion: number
  members: (RoomWithMembers['members'][number] & { lastSeenAt: Date })[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retire de la table les membres absents au moment de la relance, pour que
 * la nouvelle partie ne les attende jamais : les moteurs distribuent à
 * `members`, un fantôme y aurait un tour qui ne vient pas. Rend la salle à
 * relancer — effectif réduit aux présents, hôte transmis au plus ancien
 * d'entre eux si l'hôte était absent (même règle que le départ volontaire,
 * DELETE /rooms/[roomId]) — pour que le lancement lise le même effectif que
 * la base.
 *
 * Ce que devient le retiré : son prochain sondage de GET /rooms/[roomId]
 * répond 403, et le client affiche « tu n'es plus à cette table »
 * (handleRoomGone, useOnlineRoom.ts). /rooms/rejoinable ne lui offre pas de
 * retour : il ne figure pas dans la nouvelle partie, donc aucun `leftAt` à
 * reprendre — il repasse par le guichet, et ne peut rentrer que si la table
 * revient en lobby.
 */
async function dropAbsentMembers(
  roomId: string,
  room: RematchRoom,
  presentMembers: RematchRoom['members'],
  absentUserIds: string[]
): Promise<RematchRoom> {
  if (absentUserIds.length === 0) return room
  await prisma.onlineRoomMember.deleteMany({
    where: { roomId, userId: { in: absentUserIds } },
  })
  // Son prochain 403 dira que la table a rejoué sans lui (online/departures.ts)
  // plutôt qu'un « tu n'es plus à cette table » sans raison.
  for (const userId of absentUserIds) recordDeparture(userId, roomId, 'rematched_without_you')
  let hostUserId = room.hostUserId
  if (absentUserIds.includes(hostUserId)) {
    // `members` arrive trié par joinedAt (la route) : le premier présent est
    // le plus ancien à la table.
    hostUserId = presentMembers[0]?.userId ?? hostUserId
    await prisma.onlineRoom.update({ where: { id: roomId }, data: { hostUserId } })
  }
  return { ...room, hostUserId, members: presentMembers }
}

/**
 * Vote rematch : relance quand tous les membres PRÉSENTS ont voté, sinon
 * enregistre le vote. Les absents (REMATCH_PRESENCE_MS) sont retirés de la
 * table au moment de la relance.
 */
export async function processRematchVote(roomId: string, room: RematchRoom, userId: string) {
  const gameId = room.gameId ?? ''
  // La sentinelle vaut AUSSI pour un vote qui lit la salle pendant la fenêtre de
  // relance : l'état terminé y est momentanément remis en base (le Président y
  // relit son classement), donc seul le numéro de version dit la vérité. Sans
  // cette garde d'entrée, un tel vote repartait pour une seconde distribution.
  if (room.stateVersion === REMATCH_CLAIMED_VERSION) return
  const initialState = parseOnlineGameState(gameId, room.gameStateJson)
  if (!initialState || !gameId || !isOnlineGameFinished(gameId, initialState)) {
    throw new Error('game_not_finished')
  }

  // Quorum = membres PRÉSENTS. Le votant en fait toujours partie : sa requête
  // prouve qu'il est là, alors que la trace lue ici peut dater — la route ne
  // la rafraîchit qu'au plus toutes les 30 s (touchMemberPresence), et un
  // onglet revenu au premier plan clique parfois avant que son sondage ait
  // touché la base. Seul à la table (les autres partis, ou partie contre
  // bots : le cas courant du solo), il relance donc seul.
  const presenceCutoff = Date.now() - REMATCH_PRESENCE_MS
  const isPresent = (m: RematchRoom['members'][number]) =>
    m.userId === userId || m.lastSeenAt.getTime() >= presenceCutoff
  const presentMembers = room.members.filter(isPresent)
  const presentUserIds = presentMembers.map((m) => m.userId)
  const absentUserIds = room.members.filter((m) => !isPresent(m)).map((m) => m.userId)
  let state = initialState
  /**
   * JSON EXACT de la partie terminée : la réclamation ci-dessous l'efface, or
   * certains lancements le relisent en base (Président : le classement final
   * donne les positions héritées) — on le garde donc sous la main pour le
   * remettre avant de relancer.
   */
  let stateJson = room.gameStateJson
  let stateVersion = room.stateVersion

  for (let attempt = 0; attempt < REMATCH_VOTE_ATTEMPTS; attempt++) {
    const votes = new Set(state.rematchVotes ?? [])
    votes.add(userId)
    // Seuls les présents font le quorum, et seuls leurs votes y comptent : un
    // membre qui a voté puis fermé l'onglet n'en fait plus partie — sinon son
    // vote « gratuit » aidait à relancer une table qu'il ne rejoindra pas.
    const everyoneVoted = presentUserIds.length > 0 && presentUserIds.every((id) => votes.has(id))

    if (everyoneVoted) {
      // Réclamation atomique anti-double-relance : la MÊME écriture fait perdre
      // à la salle son caractère « partie terminée » (état vidé + version
      // sentinelle). Incrémenter la version ne suffisait pas : le vote
      // concurrent relisait l'état terminé intact, se croyait légitime et
      // lançait une DEUXIÈME partie (deux distributions de cartes).
      const claimed = await prisma.onlineRoom.updateMany({
        where: { id: roomId, stateVersion },
        data: { gameStateJson: null, stateVersion: REMATCH_CLAIMED_VERSION },
      })
      if (claimed.count === 1) {
        try {
          // L'état terminé revient en base AVANT la relance (le Président y
          // relit son classement) ; la sentinelle, elle, reste posée : c'est
          // elle qui continue d'écarter les votes concurrents pendant ce temps.
          await prisma.onlineRoom.update({
            where: { id: roomId },
            data: { gameStateJson: stateJson },
          })
          // Les absents sortent AVANT le lancement, dans la même relance : la
          // nouvelle partie se distribue aux seuls présents.
          const relaunched = await dropAbsentMembers(roomId, room, presentMembers, absentUserIds)
          await launchOnlineRoom(roomId, relaunched)
        } catch (error) {
          // Relance ratée : sans ce retour en arrière la sentinelle figerait la
          // salle pour de bon (plus aucun vote « Rejouer » n'aboutirait). Les
          // absents déjà retirés ne reviennent pas : ils l'étaient de toute
          // façon, le prochain vote compte simplement une table plus petite.
          await prisma.onlineRoom.update({
            where: { id: roomId },
            data: { gameStateJson: stateJson, stateVersion },
          })
          throw error
        }
        return
      }
    } else {
      // Compare-and-swap : l'écriture inconditionnelle d'avant écrasait le
      // vote concurrent (lecture puis update sans garde), et le joueur dont
      // le vote sautait croyait pourtant avoir voté.
      const written = await prisma.onlineRoom.updateMany({
        where: { id: roomId, stateVersion },
        data: {
          gameStateJson: JSON.stringify({
            ...state,
            rematchVotes: [...votes],
            version: state.version + 1,
          }),
          stateVersion: stateVersion + 1,
        },
      })
      if (written.count === 1) return
    }

    // Course perdue : on laisse le vote gagnant finir d'écrire, puis on relit
    // l'état frais pour rejouer le vote dessus.
    await sleep(REMATCH_RETRY_BASE_MS * (attempt + 1) + Math.random() * REMATCH_RETRY_BASE_MS)
    const fresh = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: { gameStateJson: true, stateVersion: true },
    })
    if (!fresh) throw new Error('room_not_found')
    // Relance déjà réclamée par un autre vote (sentinelle, ou état déjà
    // remplacé par la nouvelle partie) : ce vote-ci est devenu sans objet, mais
    // il a bien produit l'effet attendu — pas d'erreur.
    if (fresh.stateVersion === REMATCH_CLAIMED_VERSION) return
    const freshState = parseOnlineGameState(gameId, fresh.gameStateJson)
    if (!freshState || !isOnlineGameFinished(gameId, freshState)) return
    state = freshState
    stateJson = fresh.gameStateJson
    stateVersion = fresh.stateVersion
  }

  throw new Error('rematch_conflict')
}
