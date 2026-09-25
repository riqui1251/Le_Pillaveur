import { describe, expect, it } from 'vitest'
import {
  endShareClipboardText,
  endShareUrl,
  isTableShareable,
  mayBringTableBack,
  rematchCounter,
  type EndScreenMember,
} from './end-screen'

/**
 * L'écran de fin partagé doit tenir ces promesses :
 *  - le compteur « Rejouer x/total » dit le quorum du SERVEUR (membres
 *    présents de la table), pas les humains de l'état moteur : un parti ou un
 *    absent ne gonfle plus le total, son vote orphelin ne gonfle plus le
 *    compte ;
 *  - seul à la table, le vote relance aussitôt : aucune attente affichée ;
 *  - le lien partagé est celui du lobby (/invite/CODE, sans langue) tant que
 *    la table se rejoint par son code, la page du jeu sinon.
 */

const member = (userId: string, present?: boolean): EndScreenMember =>
  present === undefined ? { userId } : { userId, present }

describe('rematchCounter', () => {
  it('compte les votes des membres de la table sur leur nombre', () => {
    const c = rematchCounter([member('a'), member('b'), member('c')], ['a'], 'a')
    expect(c).toEqual({ count: 1, total: 3, iVoted: true, waiting: true })
  })

  it("ignore le vote d'un joueur qui n'est plus à la table", () => {
    // « d » a voté puis quitté : l'état moteur garde son vote, pas le quorum.
    const c = rematchCounter([member('a'), member('b'), member('c')], ['a', 'd'], 'b')
    expect(c).toEqual({ count: 1, total: 3, iVoted: false, waiting: false })
  })

  it('un membre absent sort du total, et son vote avec lui', () => {
    // Le cas du constat : quatre à table, un onglet fermé — la relance part à 3.
    const members = [member('a', true), member('b', true), member('c', true), member('d', false)]
    const c = rematchCounter(members, ['a', 'd'], 'a')
    expect(c).toEqual({ count: 1, total: 3, iVoted: true, waiting: true })
  })

  it('le joueur local fait toujours partie du quorum, même marqué absent', () => {
    const c = rematchCounter([member('a', false), member('b', true)], [], 'a')
    expect(c.total).toBe(2)
  })

  it('présence inconnue (DTO sans `present`) : chaque membre compte', () => {
    const c = rematchCounter([member('a'), member('b')], ['b'], 'a')
    expect(c).toEqual({ count: 1, total: 2, iVoted: false, waiting: false })
  })

  it('seul à la table (partie contre bots) : pas d’attente après le vote', () => {
    const c = rematchCounter([member('a')], ['a'], 'a')
    expect(c).toEqual({ count: 1, total: 1, iVoted: true, waiting: false })
  })

  it('un vote en double ne compte qu’une fois', () => {
    const c = rematchCounter([member('a'), member('b')], ['a', 'a'], 'a')
    expect(c.count).toBe(1)
  })

  it('sans joueur local connu : personne n’a « voté », rien n’attend', () => {
    const c = rematchCounter([member('a'), member('b')], ['a'], null)
    expect(c).toEqual({ count: 1, total: 2, iVoted: false, waiting: false })
  })

  it('tout le monde a voté : le compte atteint le total', () => {
    const c = rematchCounter([member('a'), member('b')], ['b', 'a'], 'a')
    expect(c).toEqual({ count: 2, total: 2, iVoted: true, waiting: true })
  })
})

describe('mayBringTableBack', () => {
  const members: EndScreenMember[] = [
    { userId: 'host', present: true },
    { userId: 'bob', present: true },
  ]

  it('l’hôte ramène toujours la table', () => {
    expect(mayBringTableBack(members, 'host', 'host')).toBe(true)
  })

  it('un membre, pas tant que l’hôte est là', () => {
    expect(mayBringTableBack(members, 'host', 'bob')).toBe(false)
  })

  it('un membre, dès que l’hôte est absent ou parti', () => {
    expect(mayBringTableBack([{ userId: 'host', present: false }, members[1]], 'host', 'bob')).toBe(true)
    expect(mayBringTableBack([members[1]], 'host', 'bob')).toBe(true)
  })

  it('sans joueur ni table connus : rien', () => {
    expect(mayBringTableBack(members, 'host', null)).toBe(false)
    expect(mayBringTableBack(members, undefined, 'bob')).toBe(false)
  })
})

describe('isTableShareable', () => {
  it('table publique : le code peut partir avec le partage de fin', () => {
    expect(isTableShareable({ code: 'ABC123', visibility: 'public' })).toBe(true)
  })

  it('table privée : son code ne part pas dans un partage public', () => {
    expect(isTableShareable({ code: 'ABC123', visibility: 'private' })).toBe(false)
  })

  it('table sur invitation : le code seul est refusé', () => {
    expect(isTableShareable({ code: 'ABC123', visibility: 'invite' })).toBe(false)
  })

  it('pas de table ou code invalide : rien à partager', () => {
    expect(isTableShareable(null)).toBe(false)
    expect(isTableShareable(undefined)).toBe(false)
    expect(isTableShareable({ code: 'abc', visibility: 'public' })).toBe(false)
  })
})

describe('endShareUrl', () => {
  const origin = 'https://lepillaveur.fr'

  it('table publique : le lien d’invitation du lobby, sans préfixe de langue', () => {
    expect(endShareUrl(origin, { code: 'ABC123', visibility: 'public' }, '/games/menteur')).toBe(
      'https://lepillaveur.fr/invite/ABC123'
    )
  })

  it('table sur invitation : la page du jeu', () => {
    expect(endShareUrl(origin, { code: 'ABC123', visibility: 'invite' }, '/games/menteur')).toBe(
      'https://lepillaveur.fr/games/menteur'
    )
  })

  it('table privée : la page du jeu, jamais son code', () => {
    expect(endShareUrl(origin, { code: 'ABC123', visibility: 'private' }, '/games/menteur')).toBe(
      'https://lepillaveur.fr/games/menteur'
    )
  })

  it('sans table : la page du jeu', () => {
    expect(endShareUrl(origin, null, '/games/quiz')).toBe('https://lepillaveur.fr/games/quiz')
  })

  it('jeu inconnu ou chemin douteux : l’accueil', () => {
    expect(endShareUrl(origin, null, null)).toBe('https://lepillaveur.fr/')
    expect(endShareUrl(origin, null, 'https://ailleurs.example')).toBe('https://lepillaveur.fr/')
  })

  it('origine avec barre finale : pas de double barre', () => {
    expect(endShareUrl('https://lepillaveur.fr/', null, '/games/bluff')).toBe('https://lepillaveur.fr/games/bluff')
  })
})

describe('endShareClipboardText', () => {
  it('le message puis le lien, sur deux lignes', () => {
    expect(endShareClipboardText("J'ai gagné !", 'https://lepillaveur.fr/invite/ABC123')).toBe(
      "J'ai gagné !\nhttps://lepillaveur.fr/invite/ABC123"
    )
  })

  it('sans message : le lien seul', () => {
    expect(endShareClipboardText('  ', 'https://lepillaveur.fr/')).toBe('https://lepillaveur.fr/')
  })
})
