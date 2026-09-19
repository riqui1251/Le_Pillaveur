import { describe, expect, it } from 'vitest'
import {
  INITIAL_CONNECTION_SIGNALS,
  connectionStatus,
  serverReached,
  type ConnectionSignals,
} from './connection-status'

/**
 * Ce que le bandeau de connexion doit promettre au joueur :
 *  - le navigateur qui se dit hors ligne a TOUJOURS le dernier mot ;
 *  - hors salle, ou flux vivant, on ne dit rien ;
 *  - une coupure n'est annoncée que sur un signal qui l'atteste (erreur du
 *    flux vue par le navigateur, ou sondage qui ne joint plus le serveur) —
 *    jamais sur le seul soupçon du chien de garde, ni pendant l'ouverture
 *    du flux ;
 *  - dès que quelque chose PASSE (un `ready`, une réponse HTTP), le bandeau
 *    disparaît.
 */

function signals(overrides: Partial<ConnectionSignals> = {}): ConnectionSignals {
  return { ...INITIAL_CONNECTION_SIGNALS, inRoom: true, ...overrides }
}

describe('connectionStatus — verdicts', () => {
  it('au départ, tout va bien', () => {
    expect(connectionStatus(INITIAL_CONNECTION_SIGNALS)).toBe('online')
  })

  it('le navigateur hors ligne l’emporte sur tout le reste', () => {
    expect(connectionStatus(signals({ browserOnline: false }))).toBe('offline')
    expect(connectionStatus(signals({ browserOnline: false, streamAlive: true }))).toBe('offline')
    expect(connectionStatus(signals({ browserOnline: false, inRoom: false }))).toBe('offline')
  })

  it('hors salle, rien à dire — même avec un sondage en échec', () => {
    expect(connectionStatus(signals({ inRoom: false, pollFailed: true }))).toBe('online')
    expect(connectionStatus(signals({ inRoom: false, streamErrored: true }))).toBe('online')
  })

  it('flux vivant : en ligne, même si le dernier sondage a raté', () => {
    // Un `ping` reçu il y a moins de 50 s prouve que le serveur est là ; un
    // sondage raté sur un flux vivant est un incident ponctuel, pas une coupure.
    expect(connectionStatus(signals({ streamAlive: true, pollFailed: true }))).toBe('online')
  })

  it('flux mort sans autre signal : en ligne quand même (ouverture, ou chien de garde)', () => {
    expect(connectionStatus(signals())).toBe('online')
  })

  it('l’erreur du flux vue par le navigateur annonce la reconnexion tout de suite', () => {
    expect(connectionStatus(signals({ streamErrored: true }))).toBe('reconnecting')
  })

  it('un sondage qui ne joint plus le serveur annonce la reconnexion, flux mort', () => {
    expect(connectionStatus(signals({ pollFailed: true }))).toBe('reconnecting')
  })
})

describe('connectionStatus — scénarios vécus à table', () => {
  it('Wi-Fi coupé sur un téléphone : hors ligne aussitôt, puis reconnexion, puis rien', () => {
    let s = signals({ streamAlive: true })
    expect(connectionStatus(s)).toBe('online')
    // Le navigateur le dit le premier (événement `offline`).
    s = { ...s, browserOnline: false }
    expect(connectionStatus(s)).toBe('offline')
    // Le flux tombe dans la foulée, le sondage échoue : toujours hors ligne.
    s = { ...s, streamAlive: false, streamErrored: true, pollFailed: true }
    expect(connectionStatus(s)).toBe('offline')
    // Wi-Fi de retour (`online`) : le flux n'est pas encore rouvert, on
    // annonce la reconnexion — pas un faux « tout va bien ».
    s = { ...s, browserOnline: true }
    expect(connectionStatus(s)).toBe('reconnecting')
    // Le sondage immédiat du retour passe : le bandeau disparaît sans
    // attendre le `ready` du flux.
    s = { ...s, pollFailed: false, streamErrored: false }
    expect(connectionStatus(s)).toBe('online')
    s = { ...s, streamAlive: true }
    expect(connectionStatus(s)).toBe('online')
  })

  it('Wi-Fi → 4G : flux zombie, chien de garde, sondage qui passe — AUCUN bandeau', () => {
    let s = signals({ streamAlive: true })
    // Le chien de garde déclare le flux mort ; le navigateur n'a rien vu.
    s = { ...s, streamAlive: false }
    expect(connectionStatus(s)).toBe('online')
    // Les sondages serrés passent par la 4G : la table vit, rien à dire.
    s = { ...s, pollFailed: false }
    expect(connectionStatus(s)).toBe('online')
    // L'OS ferme enfin le zombie : erreur vue → reconnexion, le temps que
    // le flux se rouvre (`ready`) ou qu'un sondage réponde.
    s = { ...s, streamErrored: true }
    expect(connectionStatus(s)).toBe('reconnecting')
    s = { ...s, streamErrored: false, streamAlive: true }
    expect(connectionStatus(s)).toBe('online')
  })

  it('serveur redéployé : reconnexion tant que le proxy répond seul, plus rien dès que le jeu répond', () => {
    let s = signals({ streamAlive: true })
    s = { ...s, streamAlive: false, streamErrored: true }
    expect(connectionStatus(s)).toBe('reconnecting')
    // Le proxy répond 502 à la place du processus absent : pas joint.
    expect(serverReached(502)).toBe(false)
    s = { ...s, pollFailed: true }
    expect(connectionStatus(s)).toBe('reconnecting')
    // Le processus est revenu : une réponse du jeu, et la table suit au
    // rythme serré sans attendre le flux.
    expect(serverReached(200)).toBe(true)
    s = { ...s, streamErrored: false, pollFailed: false }
    expect(connectionStatus(s)).toBe('online')
  })

  it('serverReached : seuls les statuts de passerelle valent « injoignable »', () => {
    expect(serverReached(200)).toBe(true)
    // Salle disparue, accès refusé, bug applicatif : le serveur EST là.
    expect(serverReached(404)).toBe(true)
    expect(serverReached(403)).toBe(true)
    expect(serverReached(500)).toBe(true)
    expect(serverReached(502)).toBe(false)
    expect(serverReached(503)).toBe(false)
    expect(serverReached(504)).toBe(false)
  })

  it('entrée dans une salle : l’ouverture du flux ne passe jamais pour une coupure', () => {
    const s = signals({ streamAlive: false, streamErrored: false, pollFailed: false })
    expect(connectionStatus(s)).toBe('online')
  })

  it('sortie de salle pendant une coupure : le bandeau n’a plus lieu d’être', () => {
    const s = signals({ streamErrored: true, pollFailed: true, inRoom: false })
    expect(connectionStatus(s)).toBe('online')
  })
})
