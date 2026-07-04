import { EventEmitter } from 'events'

/**
 * Bus de notifications temps réel par salle (mono-instance).
 * Un EventEmitter unique par processus, persistant à travers le HMR de dev
 * via globalThis. En multi-instances, remplacer par un relais (Redis/PG LISTEN).
 */
const globalForBus = globalThis as unknown as { __lpRoomBus?: EventEmitter }

const bus =
  globalForBus.__lpRoomBus ??
  (() => {
    const e = new EventEmitter()
    e.setMaxListeners(0)
    return e
  })()

if (!globalForBus.__lpRoomBus) {
  globalForBus.__lpRoomBus = bus
}

export type RoomEvent = {
  type: 'changed' | 'finished' | 'lobby'
  stateVersion?: number
  at: number
}

function channel(roomId: string): string {
  return `room:${roomId}`
}

/** Publie un changement de salle vers tous les abonnés SSE. */
export function publishRoomChanged(roomId: string, event?: Partial<RoomEvent>): void {
  const payload: RoomEvent = {
    type: event?.type ?? 'changed',
    stateVersion: event?.stateVersion,
    at: Date.now(),
  }
  bus.emit(channel(roomId), payload)
}

/** Abonne un listener aux événements d'une salle. Retourne une fonction de désabonnement. */
export function subscribeRoom(roomId: string, listener: (event: RoomEvent) => void): () => void {
  const ch = channel(roomId)
  bus.on(ch, listener)
  return () => {
    bus.off(ch, listener)
  }
}

// ─── Signalisation WebRTC (vocal de salle) ───────────────────────────────────
// Relai éphémère de messages offer/answer/ice/hello/bye entre DEUX membres
// d'une même salle. Ciblé par destinataire : chaque flux SSE n'écoute que son
// propre canal — un joueur ne voit jamais la signalisation des autres paires.

export type RtcSignal = {
  from: string
  kind: 'hello' | 'offer' | 'answer' | 'ice' | 'bye'
  payload: unknown
  at: number
}

function rtcChannel(roomId: string, userId: string): string {
  return `rtc:${roomId}:${userId}`
}

/** Envoie un message de signalisation à UN membre précis de la salle. */
export function publishRtcSignal(roomId: string, toUserId: string, signal: RtcSignal): void {
  bus.emit(rtcChannel(roomId, toUserId), signal)
}

/** Abonne le flux SSE d'un membre à SA signalisation. */
export function subscribeRtc(
  roomId: string,
  userId: string,
  listener: (signal: RtcSignal) => void
): () => void {
  const ch = rtcChannel(roomId, userId)
  bus.on(ch, listener)
  return () => {
    bus.off(ch, listener)
  }
}

// ─── Trames de cast (positions de billes, jeu local diffusé sur TV) ──────────
// Canal ÉPHÉMÈRE : relaie les positions de billes du téléphone vers la TV sans
// écriture DB (haute fréquence). Le contenu est un JSON opaque (PlinkoCastFrame).

function castFrameChannel(roomId: string): string {
  return `castframe:${roomId}`
}

export function publishCastFrame(roomId: string, frame: unknown): void {
  bus.emit(castFrameChannel(roomId), frame)
}

export function subscribeCastFrame(roomId: string, listener: (frame: unknown) => void): () => void {
  const ch = castFrameChannel(roomId)
  bus.on(ch, listener)
  return () => {
    bus.off(ch, listener)
  }
}
