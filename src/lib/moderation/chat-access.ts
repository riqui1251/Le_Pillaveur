import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth-server'
import { areFriends } from '@/lib/friends'
import type { LGState } from '@/lib/loup-garou/engine'
import { parseLGState } from '@/lib/loup-garou/server-adapter'
import { isBlockedBetween } from '@/lib/moderation/blocks'

/**
 * Qui a le droit d'ouvrir quel canal de chat — point de vérité UNIQUE, partagé
 * par l'envoi/lecture des messages et par le signalement. Un signalement doit
 * s'appuyer exactement sur les mêmes droits qu'une lecture : c'est ce qui
 * garantit qu'il n'ouvre pas une porte dérobée vers des conversations privées.
 *
 * Canaux :
 *  - `room:<roomId>`    — partie/lobby en cours (réservé aux membres) ;
 *  - `friend:<a>:<b>`   — conversation privée entre deux amis (ids triés) ;
 *  - `wolves:<roomId>`  — chat privé des loups (rôle réel vérifié côté serveur).
 *
 * Écriture (`mode: 'write'`, l'envoi d'un message) : en pleine partie de
 * Loup-Garou, un mort est un fantôme qui voit tous les rôles — il lit `room`
 * et `wolves` mais n'y écrit plus, sans quoi un loup éliminé renseignait sa
 * meute en secret. Le chasseur qui tire n'est pas un fantôme (il ne voit pas
 * les rôles). Lecture et signalement ne changent pas.
 */

export type ChannelResolution =
  | { ok: true; channel: string; peerUserId: string | null }
  | { ok: false; error: string; status: number }

export type ChatAccessMode = 'read' | 'write'

/** Fantôme du Loup-Garou dans une partie non finie (voir l'en-tête). */
function lgSilencedGhost(state: LGState | null, userId: string): boolean {
  if (!state || state.phase === 'finished') return false
  const me = state.players.find((p) => p.id === userId)
  return Boolean(me && !me.alive && me.id !== state.pendingHunterId)
}

const READ_ONLY: ChannelResolution = { ok: false, error: 'chat_read_only', status: 403 }

export async function resolveChatChannel(
  user: AuthUser,
  scope: string | null,
  friendUserId: string | null,
  mode: ChatAccessMode = 'read'
): Promise<ChannelResolution> {
  if (scope === 'room') {
    const membership = await prisma.onlineRoomMember.findFirst({
      where: { userId: user.id },
      select: { roomId: true },
    })
    if (!membership) return { ok: false, error: 'Aucune partie en cours', status: 404 }
    if (mode === 'write') {
      // L'état n'est lu que pour une partie de Loup-Garou en cours : ceux
      // des jeux de dessin pèsent lourd.
      const game = await prisma.onlineRoom.findFirst({
        where: { id: membership.roomId, status: 'playing', gameId: 'loup-garou' },
        select: { gameStateJson: true },
      })
      if (game && lgSilencedGhost(parseLGState(game.gameStateJson), user.id)) return READ_ONLY
    }
    return { ok: true, channel: `room:${membership.roomId}`, peerUserId: null }
  }

  if (scope === 'friend' && friendUserId) {
    if (!(await areFriends(user.id, friendUserId))) {
      return { ok: false, error: "Vous n'êtes pas amis", status: 403 }
    }
    // Blocage : la conversation privée se ferme dans les deux sens, sans
    // révéler qui a bloqué qui (message neutre).
    if (await isBlockedBetween(user.id, friendUserId)) {
      return { ok: false, error: 'Conversation indisponible', status: 403 }
    }
    const [a, b] = [user.id, friendUserId].sort()
    return { ok: true, channel: `friend:${a}:${b}`, peerUserId: friendUserId }
  }

  if (scope === 'wolves') {
    const membership = await prisma.onlineRoomMember.findFirst({
      where: { userId: user.id },
      select: { roomId: true },
    })
    if (!membership) return { ok: false, error: 'Aucune partie en cours', status: 404 }
    const room = await prisma.onlineRoom.findUnique({
      where: { id: membership.roomId },
      select: { status: true, gameId: true, gameStateJson: true },
    })
    if (!room || room.gameId !== 'loup-garou') {
      return { ok: false, error: 'Canal invalide', status: 400 }
    }
    const state = parseLGState(room.gameStateJson)
    const me = state?.players.find((p) => p.id === user.id)
    if (!me || me.role !== 'loup') {
      return { ok: false, error: 'Réservé aux loups', status: 403 }
    }
    if (mode === 'write' && room.status === 'playing' && lgSilencedGhost(state, user.id)) {
      return READ_ONLY
    }
    return { ok: true, channel: `wolves:${membership.roomId}`, peerUserId: null }
  }

  return { ok: false, error: 'Canal invalide', status: 400 }
}
