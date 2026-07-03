import { createHmac } from 'crypto'

/**
 * Serveurs ICE pour le vocal WebRTC.
 *
 * - STUN publics : suffisent pour la majorité des paires (découverte d'adresse).
 * - TURN (coturn sur le VPS) : relais de SECOURS pour les NAT stricts (~15 %
 *   des joueurs, réseaux mobiles surtout). Identifiants ÉPHÉMÈRES au format
 *   « REST API » de coturn : username = expiration unix, credential =
 *   HMAC-SHA1(secret, username) en base64 — le secret ne quitte jamais le
 *   serveur. Sans TURN_HOST/TURN_SECRET configurés, on fonctionne en STUN
 *   seul (dev, réseaux ouverts).
 */

export type IceServer = { urls: string | string[]; username?: string; credential?: string }

const STUN_SERVERS: IceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

/** Durée de validité des identifiants TURN (le client re-fetch à chaque join). */
export const TURN_TTL_SECONDS = 2 * 60 * 60

export function buildIceServers(
  env: { turnHost?: string; turnSecret?: string },
  nowMs: number = Date.now()
): { iceServers: IceServer[]; ttlSeconds: number } {
  const iceServers: IceServer[] = [...STUN_SERVERS]

  if (env.turnHost && env.turnSecret) {
    const username = `${Math.floor(nowMs / 1000) + TURN_TTL_SECONDS}:lepillaveur`
    const credential = createHmac('sha1', env.turnSecret).update(username).digest('base64')
    iceServers.push({
      urls: [
        `turn:${env.turnHost}:3478?transport=udp`,
        `turn:${env.turnHost}:3478?transport=tcp`,
      ],
      username,
      credential,
    })
  }

  return { iceServers, ttlSeconds: TURN_TTL_SECONDS }
}
