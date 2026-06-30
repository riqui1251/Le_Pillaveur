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
