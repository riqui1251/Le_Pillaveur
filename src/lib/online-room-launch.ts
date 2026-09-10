import { prisma } from '@/lib/prisma'
import { launchPetitBuveurRoom } from '@/lib/online-petit-buveur'
import { launchPurpleRoom } from '@/lib/online-purple'
import { launch1220Room } from '@/lib/online-1220'
import { launchHiLoRoom } from '@/lib/online-hi-lo'
import { launchMonsieur3Room } from '@/lib/online-monsieur-3'
import { launchPmuRoom } from '@/lib/online-pmu'
import { launchPlinkoRoom } from '@/lib/online-plinko'
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
  await prisma.onlineRoomMember.updateMany({
    where: { roomId },
    data: { isReady: false },
  })
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
    case 'hi-lo':
      await launchHiLoRoom(roomId, room)
      break
    case 'monsieur-3':
      await launchMonsieur3Room(roomId, room)
      break
    case 'pmu':
      await launchPmuRoom(roomId, room)
      break
    case 'plinko':
      await launchPlinkoRoom(roomId, room)
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Vote rematch : relance si tous ont voté, sinon enregistre le vote */
export async function processRematchVote(
  roomId: string,
  room: RoomWithMembers & { gameStateJson: string | null; stateVersion: number },
  userId: string
) {
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

  const memberUserIds = room.members.map((m) => m.userId)
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
    const everyoneVoted = memberUserIds.length > 0 && memberUserIds.every((id) => votes.has(id))

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
          await launchOnlineRoom(roomId, room)
        } catch (error) {
          // Relance ratée : sans ce retour en arrière la sentinelle figerait la
          // salle pour de bon (plus aucun vote « Rejouer » n'aboutirait).
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
