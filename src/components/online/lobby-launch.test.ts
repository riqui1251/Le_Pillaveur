import { describe, expect, it } from 'vitest'
import { forceLaunchDecision, MC_TEAM_MIN_PLAYERS, type ForceLaunchSeat } from './lobby-launch'

/**
 * Le raccourci « Lancer sans les retardataires » doit tenir ces promesses :
 *  - il n'apparaît QUE s'il y a quelqu'un à retirer (l'hôte n'est jamais
 *    un retardataire : le bouton le met prêt avant de lancer) ;
 *  - il n'est actionnable que si ceux qui restent, bots compris, atteignent
 *    le minimum du jeu — sinon il dit combien de prêts il manque ;
 *  - le seuil est celui du jeu, pas une constante : Toucher-Coulé (min. 1)
 *    laisse l'hôte lancer seul, Loup-Garou (min. 4) non.
 */

const host = (isReady: boolean): ForceLaunchSeat => ({ isReady, isHost: true })
const guest = (isReady: boolean): ForceLaunchSeat => ({ isReady, isHost: false })

describe('forceLaunchDecision', () => {
  it('tout le monde prêt : rien à retirer, raccourci non proposé', () => {
    const d = forceLaunchDecision({ members: [host(true), guest(true), guest(true)], botCount: 0, minPlayers: 2 })
    expect(d).toEqual({ offered: false, allowed: false, staying: 3, late: 0, missing: 0 })
  })

  it('un retardataire et assez de prêts : proposé et actionnable', () => {
    const d = forceLaunchDecision({ members: [host(true), guest(true), guest(false)], botCount: 0, minPlayers: 2 })
    expect(d).toEqual({ offered: true, allowed: true, staying: 2, late: 1, missing: 0 })
  })

  it("l'hôte pas encore prêt n'est pas un retardataire : seul le bouton « Prêt » manque", () => {
    const d = forceLaunchDecision({ members: [host(false), guest(true), guest(true)], botCount: 0, minPlayers: 2 })
    expect(d.offered).toBe(false)
    expect(d.late).toBe(0)
    expect(d.staying).toBe(3)
  })

  it("l'hôte pas prêt reste compté parmi ceux qui restent quand un autre traîne", () => {
    const d = forceLaunchDecision({ members: [host(false), guest(true), guest(false)], botCount: 0, minPlayers: 2 })
    expect(d).toEqual({ offered: true, allowed: true, staying: 2, late: 1, missing: 0 })
  })

  it('sous le minimum une fois les retardataires retirés : proposé mais bloqué, avec le manque', () => {
    const d = forceLaunchDecision({
      members: [host(true), guest(false), guest(false), guest(false)],
      botCount: 0,
      minPlayers: 3,
    })
    expect(d.offered).toBe(true)
    expect(d.allowed).toBe(false)
    expect(d.missing).toBe(2)
    expect(d.late).toBe(3)
  })

  it('les bots comblent le manque, comme pour le lancement ordinaire', () => {
    const sans = forceLaunchDecision({ members: [host(true), guest(false)], botCount: 0, minPlayers: 3 })
    expect(sans.allowed).toBe(false)
    expect(sans.missing).toBe(2)
    const avec = forceLaunchDecision({ members: [host(true), guest(false)], botCount: 2, minPlayers: 3 })
    expect(avec.allowed).toBe(true)
    expect(avec.missing).toBe(0)
  })

  it('un nombre de bots négatif (réglage corrompu) vaut zéro', () => {
    const d = forceLaunchDecision({ members: [host(true), guest(false)], botCount: -3, minPlayers: 2 })
    expect(d.allowed).toBe(false)
    expect(d.missing).toBe(1)
  })

  it('Toucher-Coulé (min. 1) : l\'hôte seul prêt peut lancer sans les autres', () => {
    const d = forceLaunchDecision({ members: [host(true), guest(false), guest(false)], botCount: 0, minPlayers: 1 })
    expect(d.allowed).toBe(true)
    expect(d.staying).toBe(1)
  })

  it('table vide : ni proposé ni autorisé, sans division ni négatif', () => {
    const d = forceLaunchDecision({ members: [], botCount: 0, minPlayers: 2 })
    expect(d).toEqual({ offered: false, allowed: false, staying: 0, late: 0, missing: 2 })
  })

  describe('Mots Codés : 2 par équipe une fois les retardataires retirés (même borne que la route)', () => {
    const gold = (isReady: boolean, isHost = false): ForceLaunchSeat => ({ isReady, isHost, team: 'A' })
    const red = (isReady: boolean): ForceLaunchSeat => ({ isReady, isHost: false, team: 'B' })

    it('4 or + 1 rouge, le retardataire est or : 3/1, bloqué avec le manque (le serveur refuserait team_min_players)', () => {
      const d = forceLaunchDecision({
        members: [gold(true, true), gold(true), gold(true), gold(false), red(true)],
        botCount: 0,
        minPlayers: 4,
        teamMinPlayers: MC_TEAM_MIN_PLAYERS,
      })
      expect(d.offered).toBe(true)
      expect(d.allowed).toBe(false)
      expect(d.missing).toBe(1)
    })

    it('les non-assignés comblent la plus petite équipe, comme au lancement', () => {
      const d = forceLaunchDecision({
        members: [gold(true, true), gold(true), guest(true), guest(true), red(false)],
        botCount: 0,
        minPlayers: 4,
        teamMinPlayers: MC_TEAM_MIN_PLAYERS,
      })
      // Les deux libres vont en rouge : 2/2, ça passe.
      expect(d.allowed).toBe(true)
      expect(d.missing).toBe(0)
    })

    it('le manque le plus grand fait foi : équipes satisfaites mais total sous le minimum du jeu', () => {
      const d = forceLaunchDecision({
        members: [gold(true, true), red(true), gold(false), red(false)],
        botCount: 0,
        minPlayers: 4,
        teamMinPlayers: MC_TEAM_MIN_PLAYERS,
      })
      expect(d.allowed).toBe(false)
      expect(d.missing).toBe(2)
    })

    it('sans teamMinPlayers, les équipes ne comptent pas (autres jeux)', () => {
      const d = forceLaunchDecision({
        members: [gold(true, true), gold(true), gold(true), red(false)],
        botCount: 0,
        minPlayers: 2,
      })
      expect(d.allowed).toBe(true)
    })
  })
})
