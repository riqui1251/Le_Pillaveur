import { describe, expect, it } from 'vitest'
import type { RoomDto } from '@/lib/online-room'
import {
  DEFERRED_REFRESH_MAX_MS,
  POLL_IDLE_MS,
  POLL_LOBBY_MS,
  POLL_LOBBY_STREAM_OK_MS,
  POLL_PLAYING_ACTIVE_MS,
  POLL_PLAYING_STREAM_OK_MS,
  POLL_PLAYING_WAIT_MS,
  STREAM_HEARTBEAT_MS,
  STREAM_WATCHDOG_MS,
  mergePolledState,
  mergeServerView,
  pollDelayMs,
  roomEventDecision,
  roomEventVersion,
} from './online-room-polling'

/**
 * Le sondage de salle doit tenir ces promesses :
 *  - flux SSE vivant = filet lâche (une requête toutes les 15-25 s), flux
 *    mort = cadences serrées historiques ; la bascule se lit à chaque tick ;
 *  - un `changed` qui annonce l'état qu'on a déjà ne coûte AUCUNE requête ;
 *    tout le reste (lobby, finished, trame sans version) rafraîchit ;
 *  - une réponse serveur n'écrase jamais un état plus récent qu'elle — ni
 *    la vue d'une action doublée par un sondage, ni un sondage doublé par
 *    une action.
 */

function roomFixture(overrides: Partial<RoomDto> = {}): RoomDto {
  return {
    id: 'r1',
    code: 'ABCD',
    status: 'playing',
    visibility: 'private',
    gameId: 'menteur',
    hostUserId: 'u1',
    members: [],
    allReady: true,
    canLaunch: false,
    settings: {} as RoomDto['settings'],
    stateVersion: 5,
    currentTurnUserId: 'u1',
    gameStateJson: '{"v":5}',
    briefing: null,
    ...overrides,
  }
}

describe('pollDelayMs', () => {
  it('sans salle : rien à surveiller, cadence de découverte quel que soit le flux', () => {
    expect(pollDelayMs(null, 'u1', false)).toBe(POLL_IDLE_MS)
    expect(pollDelayMs(null, 'u1', true)).toBe(POLL_IDLE_MS)
  })

  it('lobby : cadence serrée flux mort, longue flux vivant', () => {
    const lobby = roomFixture({ status: 'waiting', currentTurnUserId: null })
    expect(pollDelayMs(lobby, 'u1', false)).toBe(POLL_LOBBY_MS)
    expect(pollDelayMs(lobby, 'u1', true)).toBe(POLL_LOBBY_STREAM_OK_MS)
  })

  it('partie, flux mort : cadences historiques selon le tour', () => {
    expect(pollDelayMs(roomFixture({ currentTurnUserId: 'u2' }), 'u1', false)).toBe(
      POLL_PLAYING_WAIT_MS
    )
    expect(pollDelayMs(roomFixture({ currentTurnUserId: 'u1' }), 'u1', false)).toBe(
      POLL_PLAYING_ACTIVE_MS
    )
    // Phase simultanée (personne « au tour ») : cadence active.
    expect(pollDelayMs(roomFixture({ currentTurnUserId: null }), 'u1', false)).toBe(
      POLL_PLAYING_ACTIVE_MS
    )
  })

  it('partie, flux vivant : cadence longue, que ce soit notre tour ou non', () => {
    expect(pollDelayMs(roomFixture({ currentTurnUserId: 'u2' }), 'u1', true)).toBe(
      POLL_PLAYING_STREAM_OK_MS
    )
    expect(pollDelayMs(roomFixture({ currentTurnUserId: 'u1' }), 'u1', true)).toBe(
      POLL_PLAYING_STREAM_OK_MS
    )
  })

  it('les cadences « flux vivant » restent dans la fenêtre décidée (15-20 s / 20-30 s)', () => {
    expect(POLL_PLAYING_STREAM_OK_MS).toBeGreaterThanOrEqual(15_000)
    expect(POLL_PLAYING_STREAM_OK_MS).toBeLessThanOrEqual(20_000)
    expect(POLL_LOBBY_STREAM_OK_MS).toBeGreaterThanOrEqual(20_000)
    expect(POLL_LOBBY_STREAM_OK_MS).toBeLessThanOrEqual(30_000)
    // Et elles sont bien PLUS lâches que les cadences de secours.
    expect(POLL_PLAYING_STREAM_OK_MS).toBeGreaterThan(POLL_PLAYING_WAIT_MS)
    expect(POLL_LOBBY_STREAM_OK_MS).toBeGreaterThan(POLL_LOBBY_MS)
  })

  it('un rafraîchissement mis en attente ne l’est jamais plus longtemps qu’un sondage serré', () => {
    expect(DEFERRED_REFRESH_MAX_MS).toBeLessThanOrEqual(POLL_PLAYING_WAIT_MS)
  })

  it('le chien de garde du flux tolère un battement en retard, pas un flux muet', () => {
    // Un seul `ping` un peu tardif ne doit pas ramener tout le monde à la
    // cadence serrée ; un flux zombie, lui, doit être vu en moins d'une minute
    // et demie — bien avant le délai TCP de l'OS.
    expect(STREAM_WATCHDOG_MS).toBeGreaterThan(STREAM_HEARTBEAT_MS)
    expect(STREAM_WATCHDOG_MS).toBeLessThanOrEqual(3 * STREAM_HEARTBEAT_MS)
  })
})

describe('roomEventVersion', () => {
  it('lit la version d’une trame RoomEvent', () => {
    expect(roomEventVersion('{"type":"changed","stateVersion":7,"at":1}')).toBe(7)
  })

  it('renvoie null sans version, ou sur trame illisible', () => {
    expect(roomEventVersion('{"type":"changed","at":1}')).toBeNull()
    expect(roomEventVersion('{"type":"changed","stateVersion":"7"}')).toBeNull()
    expect(roomEventVersion('{}')).toBeNull()
    expect(roomEventVersion('pas du json')).toBeNull()
    expect(roomEventVersion('null')).toBeNull()
    expect(roomEventVersion(undefined)).toBeNull()
    expect(roomEventVersion(42)).toBeNull()
  })
})

describe('roomEventDecision', () => {
  const changed = (stateVersion?: number) =>
    JSON.stringify({ type: 'changed', stateVersion, at: 1 })

  it('lobby et finished rafraîchissent toujours, version ou pas', () => {
    expect(
      roomEventDecision({ type: 'lobby', data: '{"type":"lobby"}', knownVersion: 5, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
    expect(
      roomEventDecision({ type: 'finished', data: changed(5), knownVersion: 5, actionInFlight: true })
    ).toEqual({ kind: 'refresh' })
  })

  it('changed sans version (lancement, briefing, relance) rafraîchit', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(undefined), knownVersion: 5, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
    expect(
      roomEventDecision({ type: 'changed', data: 'illisible', knownVersion: 5, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
  })

  it('changed qui annonce la version déjà connue : rien à faire (écho de notre état)', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(5), knownVersion: 5, actionInFlight: false })
    ).toEqual({ kind: 'ignore' })
    expect(
      roomEventDecision({ type: 'changed', data: changed(5), knownVersion: 5, actionInFlight: true })
    ).toEqual({ kind: 'ignore' })
  })

  it('changed plus récent : rafraîchit', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(6), knownVersion: 5, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
  })

  it('changed plus ancien n’est pas ignoré : une relance repart à la version 1', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(1), knownVersion: 40, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
  })

  it('version inconnue (salle pas encore chargée) : on rafraîchit plutôt que de deviner', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(6), knownVersion: null, actionInFlight: false })
    ).toEqual({ kind: 'refresh' })
  })

  it('changed nouveau pendant une action en vol : mis en attente avec sa version', () => {
    expect(
      roomEventDecision({ type: 'changed', data: changed(6), knownVersion: 5, actionInFlight: true })
    ).toEqual({ kind: 'defer', stateVersion: 6 })
  })
})

describe('mergeServerView', () => {
  const view = { roomId: 'r1', stateVersion: 6, gameStateJson: '{"v":6}', currentTurnUserId: 'u2' }

  it('applique une vue plus récente (état, version et tour)', () => {
    const next = mergeServerView(roomFixture(), view)
    expect(next).toMatchObject({ stateVersion: 6, gameStateJson: '{"v":6}', currentTurnUserId: 'u2' })
    // Le reste de la salle (membres, réglages…) est conservé.
    expect(next?.id).toBe('r1')
    expect(next?.gameId).toBe('menteur')
  })

  it('n’écrase jamais une version égale ou plus récente (sondage arrivé avant)', () => {
    const same = roomFixture({ stateVersion: 6, gameStateJson: '{"v":"6-sondage"}' })
    expect(mergeServerView(same, view)).toBe(same)
    const newer = roomFixture({ stateVersion: 7 })
    expect(mergeServerView(newer, view)).toBe(newer)
  })

  it('ignore une vue d’une autre salle, ou sans salle', () => {
    const other = roomFixture({ id: 'r2' })
    expect(mergeServerView(other, view)).toBe(other)
    expect(mergeServerView(null, view)).toBeNull()
  })
})

describe('mergePolledState', () => {
  const polled = (stateVersion: number, currentTurnUserId: string | null = 'u2') => ({
    stateVersion,
    gameStateJson: `{"v":${stateVersion}}`,
    currentTurnUserId,
  })

  it('même version et même contenu : rend la salle telle quelle (pas de rendu)', () => {
    const prev = roomFixture({ currentTurnUserId: 'u2' })
    expect(mergePolledState(prev, 'r1', polled(5), 5)).toBe(prev)
  })

  it('même version mais tour différent : applique (le tour est aussi de l’état)', () => {
    const prev = roomFixture({ currentTurnUserId: 'u1' })
    expect(mergePolledState(prev, 'r1', polled(5), 5)).toMatchObject({ currentTurnUserId: 'u2' })
  })

  it('version plus récente : applique', () => {
    expect(mergePolledState(roomFixture(), 'r1', polled(6), 5)).toMatchObject({
      stateVersion: 6,
      gameStateJson: '{"v":6}',
    })
  })

  it('sondage doublé par une action : sa réponse périmée ne ramène pas la salle en arrière', () => {
    // Sondage parti en version 5 ; l'action a appliqué la 6 entre-temps ;
    // le sondage rapporte encore la 5.
    const prev = roomFixture({ stateVersion: 6, gameStateJson: '{"v":6}' })
    expect(mergePolledState(prev, 'r1', polled(5), 5)).toBe(prev)
  })

  it('sondage doublé mais plus récent que tout : applique (tick de bot après l’action)', () => {
    const prev = roomFixture({ stateVersion: 6 })
    expect(mergePolledState(prev, 'r1', polled(7), 5)).toMatchObject({ stateVersion: 7 })
  })

  it('relance : une version plus petite passe quand rien n’a bougé localement', () => {
    const prev = roomFixture({ stateVersion: 40 })
    expect(mergePolledState(prev, 'r1', polled(1), 40)).toMatchObject({ stateVersion: 1 })
    // Version connue inconnue au départ (salle chargée entre-temps) : idem.
    expect(mergePolledState(prev, 'r1', polled(1), null)).toMatchObject({ stateVersion: 1 })
  })

  it('ignore une réponse d’une autre salle, ou sans salle', () => {
    const other = roomFixture({ id: 'r2' })
    expect(mergePolledState(other, 'r1', polled(6), 5)).toBe(other)
    expect(mergePolledState(null, 'r1', polled(6), 5)).toBeNull()
  })
})
