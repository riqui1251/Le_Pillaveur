import { describe, expect, it, vi } from 'vitest'

// La bannière est un composant client : ses dépendances de navigation
// next-intl tirent `next/navigation`, introuvable dans l'environnement node de
// vitest. On les neutralise — le test ne porte que sur la fonction pure.
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/' }))

import { computeNightSummary, findTopGameId } from './gameMetrics'
import { gainForCurrentXp } from '@/components/online/XpGainBanner'
import { buildXpGainDetail } from '@/lib/online/xp'
import type { Player, PlayerStats } from './players'

// Fabrique minimale : le palmarès ne lit que `stats` et `name`.
function makePlayer(name: string, stats: Partial<PlayerStats>): Player {
  return {
    id: `player-${name}`,
    name,
    createdAt: 0,
    stats: { gamesPlayed: 0, wins: 0, totalDrinks: 0, ...stats },
    preferences: { color: 'bg-red-500' },
  }
}

describe('computeNightSummary', () => {
  it("ne renvoie rien tant que la table n'a joué aucune partie", () => {
    const players = [makePlayer('Alice', {}), makePlayer('Bob', {})]
    expect(computeNightSummary(players)).toBeNull()
    expect(computeNightSummary([])).toBeNull()
  })

  it('compte les parties de la table sans les multiplier par le nombre de joueurs', () => {
    // Trois joueurs, trois parties : la table en a vu trois, pas neuf.
    const players = [
      makePlayer('Alice', { gamesPlayed: 3, wins: 2, totalDrinks: 4 }),
      makePlayer('Bob', { gamesPlayed: 3, wins: 1, totalDrinks: 9 }),
      makePlayer('Chloé', { gamesPlayed: 3, wins: 0, totalDrinks: 2 }),
    ]
    const summary = computeNightSummary(players)
    expect(summary?.gamesPlayed).toBe(3)
    expect(summary?.totalDrinks).toBe(15)
  })

  it('sacre le champion et le gosier de la table', () => {
    const players = [
      makePlayer('Alice', { gamesPlayed: 3, wins: 2, totalDrinks: 4 }),
      makePlayer('Bob', { gamesPlayed: 3, wins: 1, totalDrinks: 9 }),
    ]
    const summary = computeNightSummary(players)
    expect(summary?.awards).toEqual([
      { id: 'champion', names: ['Alice'], value: 2 },
      { id: 'thirsty', names: ['Bob'], value: 9 },
    ])
  })

  it('garde les ex æquo, mais abandonne le titre au-delà de deux', () => {
    const tie = [
      makePlayer('Alice', { gamesPlayed: 2, wins: 2, totalDrinks: 5 }),
      makePlayer('Bob', { gamesPlayed: 2, wins: 2, totalDrinks: 1 }),
      makePlayer('Chloé', { gamesPlayed: 2, wins: 0, totalDrinks: 3 }),
    ]
    expect(computeNightSummary(tie)?.awards.find((a) => a.id === 'champion')).toEqual({
      id: 'champion',
      names: ['Alice', 'Bob'],
      value: 2,
    })

    const tooManyTied = [
      makePlayer('Alice', { gamesPlayed: 2, wins: 2, totalDrinks: 5 }),
      makePlayer('Bob', { gamesPlayed: 2, wins: 2, totalDrinks: 5 }),
      makePlayer('Chloé', { gamesPlayed: 2, wins: 2, totalDrinks: 1 }),
    ]
    expect(computeNightSummary(tooManyTied)?.awards.some((a) => a.id === 'champion')).toBe(false)
  })

  it("ne décerne rien quand tout le monde est à égalité ou à zéro", () => {
    const players = [
      makePlayer('Alice', { gamesPlayed: 2, wins: 1, totalDrinks: 3 }),
      makePlayer('Bob', { gamesPlayed: 2, wins: 1, totalDrinks: 3 }),
    ]
    expect(computeNightSummary(players)?.awards).toEqual([])
  })

  it('donne la lanterne rouge au plus malchanceux quand quelqu’un a gagné', () => {
    const players = [
      makePlayer('Alice', { gamesPlayed: 5, wins: 3, totalDrinks: 2 }),
      makePlayer('Bob', { gamesPlayed: 5, wins: 0, totalDrinks: 8 }),
      makePlayer('Chloé', { gamesPlayed: 2, wins: 0, totalDrinks: 1 }),
    ]
    expect(computeNightSummary(players)?.awards).toContainEqual({
      id: 'unlucky',
      names: ['Bob'],
      value: 5,
    })
  })

  it('bascule sur « le plus sage » quand personne ne collectionne les défaites', () => {
    // Aucune victoire enregistrée (jeux sans vainqueur) : pas de lanterne rouge,
    // mais celui qui a le moins bu mérite quand même sa ligne.
    const players = [
      makePlayer('Alice', { gamesPlayed: 4, wins: 0, totalDrinks: 12 }),
      makePlayer('Bob', { gamesPlayed: 4, wins: 0, totalDrinks: 1 }),
      makePlayer('Chloé', { gamesPlayed: 4, wins: 0, totalDrinks: 5 }),
    ]
    const awards = computeNightSummary(players)?.awards
    expect(awards?.some((a) => a.id === 'unlucky')).toBe(false)
    expect(awards).toContainEqual({ id: 'sober', names: ['Bob'], value: 1 })
  })

  it('à deux, « le plus sage » ne répète pas le « gosier »', () => {
    const players = [
      makePlayer('Alice', { gamesPlayed: 4, wins: 0, totalDrinks: 12 }),
      makePlayer('Bob', { gamesPlayed: 4, wins: 0, totalDrinks: 1 }),
    ]
    expect(computeNightSummary(players)?.awards).toEqual([
      { id: 'thirsty', names: ['Alice'], value: 12 },
    ])
  })

  it('ignore un joueur qui n’a rien joué dans le titre du plus sage', () => {
    // Le nouveau venu à zéro gorgée ne vole pas le titre à celui qui a joué.
    const players = [
      makePlayer('Alice', { gamesPlayed: 4, wins: 0, totalDrinks: 12 }),
      makePlayer('Bob', { gamesPlayed: 4, wins: 0, totalDrinks: 3 }),
      makePlayer('Chloé', { gamesPlayed: 4, wins: 0, totalDrinks: 7 }),
      makePlayer('Nouveau', { gamesPlayed: 0, wins: 0, totalDrinks: 0 }),
    ]
    expect(computeNightSummary(players)?.awards).toContainEqual({
      id: 'sober',
      names: ['Bob'],
      value: 3,
    })
  })

  it('ne décerne aucun titre à une table d’un seul joueur', () => {
    const players = [makePlayer('Alice', { gamesPlayed: 4, wins: 2, totalDrinks: 6 })]
    const summary = computeNightSummary(players)
    expect(summary?.gamesPlayed).toBe(4)
    expect(summary?.awards).toEqual([])
  })
})

describe('périmètre annoncé : des records CUMULÉS, pas la soirée', () => {
  it('classe sur les compteurs à vie, même sans une seule partie ce soir', () => {
    // Ces stats viennent des soirées PRÉCÉDENTES : le palmarès les décerne
    // quand même, puisqu'il ne sait rien d'une « soirée en cours ». C'est
    // exactement pourquoi les libellés doivent annoncer des records depuis le
    // début — un intitulé qui parlerait de la soirée mentirait sur ce chiffre.
    const players = [
      makePlayer('Alice', { gamesPlayed: 40, wins: 21, totalDrinks: 118 }),
      makePlayer('Bob', { gamesPlayed: 40, wins: 3, totalDrinks: 260 }),
    ]
    const summary = computeNightSummary(players)
    expect(summary?.gamesPlayed).toBe(40)
    expect(summary?.totalDrinks).toBe(378)
    expect(summary?.awards).toContainEqual({ id: 'champion', names: ['Alice'], value: 21 })
  })

  it('ne retranche aucun point de départ : deux appels donnent le même palmarès', () => {
    // Aucune photo d'avant-soirée n'est mémorisée : la fonction ne dépend que
    // des stats reçues. Si un jour on veut vraiment mesurer la soirée, ce test
    // tombera — et il faudra corriger les libellés en même temps.
    const players = [
      makePlayer('Alice', { gamesPlayed: 6, wins: 4, totalDrinks: 9 }),
      makePlayer('Bob', { gamesPlayed: 6, wins: 1, totalDrinks: 14 }),
    ]
    expect(computeNightSummary(players)).toEqual(computeNightSummary(players))
  })
})

describe('findTopGameId', () => {
  it('additionne les parties de tous les joueurs par jeu', () => {
    const players = [
      makePlayer('Alice', {
        gamesPlayed: 5,
        gameStats: {
          pyramide: { gamesPlayed: 2, wins: 1 },
          'hi-lo': { gamesPlayed: 3, wins: 0 },
        },
      }),
      makePlayer('Bob', {
        gamesPlayed: 5,
        gameStats: {
          pyramide: { gamesPlayed: 2, wins: 0 },
          'hi-lo': { gamesPlayed: 1, wins: 1 },
        },
      }),
    ]
    expect(findTopGameId(players)).toBe('pyramide')
  })

  it('renvoie null quand aucun jeu n’a été joué', () => {
    expect(findTopGameId([makePlayer('Alice', {})])).toBeNull()
  })
})

/**
 * Bannière d'XP de fin de partie. Le test vit ici faute de fichier de test
 * dédié dans le périmètre de ce lot — à déplacer dans
 * src/components/online/XpGainBanner.test.ts dès qu'il sera ouvert.
 */
describe('gainForCurrentXp', () => {
  const gain = buildXpGainDetail({
    reason: 'win',
    xpBefore: 60,
    base: 50,
    streakBonus: 30,
    streakCount: 3,
  })

  it("affiche le gain quand il mène exactement à l'XP affichée", () => {
    expect(gain.xpAfter).toBe(140)
    expect(gainForCurrentXp(140, gain)).toBe(gain)
  })

  it("tait le gain d'une AUTRE partie que celle qu'on est en train d'afficher", () => {
    // Écran de fin rouvert, ou partie suivante déjà créditée : le serveur rend
    // le dernier gain du JOUEUR pendant une demi-heure. S'il ne tombe pas sur
    // l'XP courante, il décrit un autre état — pas de chiffre plutôt qu'un
    // chiffre faux (la barre et le niveau, eux, restent affichés).
    expect(gainForCurrentXp(190, gain)).toBeNull()
    expect(gainForCurrentXp(60, gain)).toBeNull()
  })

  it('ne montre rien quand le serveur ne se souvient de rien', () => {
    expect(gainForCurrentXp(140, null)).toBeNull()
    expect(gainForCurrentXp(140, undefined)).toBeNull()
  })

  it("accepte un gain nul (solo au plafond) : l'XP n'a pas bougé", () => {
    const capped = buildXpGainDetail({
      reason: 'solo',
      xpBefore: 1000,
      base: 0,
      streakBonus: 0,
      streakCount: 0,
    })
    expect(gainForCurrentXp(1000, capped)).toBe(capped)
  })
})
