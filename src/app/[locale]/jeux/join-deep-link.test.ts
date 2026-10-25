import { describe, expect, it } from 'vitest'
import type { RoomDto } from '@/lib/online-room'
import { deepLinkJoinDecision } from './join-deep-link'

/**
 * Lien d'invitation (?join=CODE, QR d'une télé) ouvert par un joueur DÉJÀ
 * assis :
 *  - le QR de la télé de SA partie le ramène à son jeu — la route join
 *    répondait 409 game_already_started à un joueur actif, et le hub
 *    affichait « La partie est déjà lancée » sans chemin de retour ;
 *  - une partie en cours ailleurs n'est quittée qu'après confirmation
 *    (leaveOtherRooms le marque parti, un bot le remplace) ;
 *  - sans partie en jeu, rien ne change : on rejoint.
 */

type Seat = Pick<RoomDto, 'code' | 'status' | 'gameId' | 'gameStateJson'>

/** Assis à une table de Quiz (code AAAAAA) : vue de partie minimale. */
function quizSeat(status: string, finished = false): Seat {
  const view = finished ? { version: 9, phase: 'finished' } : { version: 3, phase: 'question' }
  return {
    code: 'AAAAAA',
    status,
    gameId: 'quiz',
    gameStateJson: status === 'playing' ? JSON.stringify(view) : null,
  }
}

describe('deepLinkJoinDecision', () => {
  it('sans table : on rejoint', () => {
    expect(deepLinkJoinDecision(null, 'BBBBBB')).toBe('join')
  })

  it('QR de sa propre table : on y reste, quel que soit son état', () => {
    expect(deepLinkJoinDecision(quizSeat('playing'), 'AAAAAA')).toBe('stay')
    expect(deepLinkJoinDecision(quizSeat('waiting'), 'AAAAAA')).toBe('stay')
    expect(deepLinkJoinDecision(quizSeat('briefing'), 'AAAAAA')).toBe('stay')
  })

  it('partie en cours ailleurs (ou briefing) : confirmation avant de la quitter', () => {
    expect(deepLinkJoinDecision(quizSeat('playing'), 'BBBBBB')).toBe('confirm')
    expect(deepLinkJoinDecision(quizSeat('briefing'), 'BBBBBB')).toBe('confirm')
  })

  it('état de partie illisible : on demande plutôt que de faire quitter', () => {
    expect(deepLinkJoinDecision({ ...quizSeat('playing'), gameStateJson: 'corrompu' }, 'BBBBBB')).toBe('confirm')
  })

  it('table en attente ou partie finie : rien à perdre, on rejoint', () => {
    expect(deepLinkJoinDecision(quizSeat('waiting'), 'BBBBBB')).toBe('join')
    expect(deepLinkJoinDecision(quizSeat('playing', true), 'BBBBBB')).toBe('join')
  })
})
