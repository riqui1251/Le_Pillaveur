import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { DEFAULT_BOT_TRAITS, type BotTrait, type BotTraits } from '@/lib/online/bot-personas'
import { IMPOSTEUR_EMPTY_CLUE, normalizeClue } from './engine'
import { clueRankWindow, firstRoundEchoCap, pickBotClue, type PickBotClueInput } from './bot-clue'

/** Six indices → tiers de deux : prudent {0,1}, médian {2,3}, agressif {4,5}. */
const OWN = ['été', 'serviette', 'sable', 'vagues', 'parasol', 'marée']
const TRAITS: BotTrait[] = ['prudent', 'suiveur', 'farceur', 'agressif']

const traitsOf = (trait: BotTrait, audace = 0): BotTraits => ({ ...DEFAULT_BOT_TRAITS, trait, audace })
const zero = () => 0
const top = () => 0.99

/** Par défaut : manche 2 (le trait joue), 5 joueurs à table. */
function pick(over: Partial<PickBotClueInput> = {}): string {
  return pickBotClue({
    clues: OWN,
    given: [],
    traits: traitsOf('prudent'),
    round: 2,
    rand: zero,
    mode: 'play',
    alive: 5,
    ...over,
  })
}

describe('clueRankWindow', () => {
  it('un tiers par trait', () => {
    expect(clueRankWindow('prudent', 6)).toEqual([0, 2])
    expect(clueRankWindow('suiveur', 6)).toEqual([2, 4])
    expect(clueRankWindow('farceur', 6)).toEqual([2, 4])
    expect(clueRankWindow('agressif', 6)).toEqual([4, 6])
    expect(clueRankWindow('prudent', 5)).toEqual([0, 2])
    expect(clueRankWindow('suiveur', 5)).toEqual([2, 3])
    expect(clueRankWindow('agressif', 5)).toEqual([3, 5])
    expect(clueRankWindow('prudent', 8)).toEqual([0, 3])
    expect(clueRankWindow('suiveur', 8)).toEqual([3, 5])
    expect(clueRankWindow('agressif', 8)).toEqual([5, 8])
  })

  it('jamais vide ni hors liste, même sur une liste courte', () => {
    for (const n of [1, 2, 3, 4, 7]) {
      for (const trait of TRAITS) {
        const [lo, hi] = clueRankWindow(trait, n)
        expect(lo).toBeGreaterThanOrEqual(0)
        expect(hi).toBeGreaterThan(lo)
        expect(hi).toBeLessThanOrEqual(n)
      }
    }
  })
})

describe('firstRoundEchoCap', () => {
  it('de quoi laisser toute la table dans le tiers vague, jamais moins de deux', () => {
    // Liste de 7 : tiers vague de 3 indices.
    expect(firstRoundEchoCap(4, 7)).toBe(2)
    expect(firstRoundEchoCap(6, 7)).toBe(2)
    expect(firstRoundEchoCap(9, 7)).toBe(3)
    expect(firstRoundEchoCap(16, 7)).toBe(6)
    expect(firstRoundEchoCap(0, 7)).toBe(2)
    // Liste de 5 : tiers vague de 2.
    expect(firstRoundEchoCap(16, 5)).toBe(8)
  })
})

describe('pickBotClue', () => {
  it('dès la manche 2, rand fixé : fenêtre par trait (+1 rang de manche)', () => {
    expect(pick({ traits: traitsOf('prudent') })).toBe('serviette')
    expect(pick({ traits: traitsOf('suiveur') })).toBe('vagues')
    expect(pick({ traits: traitsOf('farceur') })).toBe('vagues')
    expect(pick({ traits: traitsOf('agressif') })).toBe('marée')
    expect(pick({ traits: traitsOf('prudent'), rand: top })).toBe('sable')
    expect(pick({ traits: traitsOf('agressif'), rand: top })).toBe('marée')
  })

  it('manche 1 : tout le monde vise le tiers vague, quel que soit le trait', () => {
    for (const trait of TRAITS) {
      expect(pick({ round: 1, traits: traitsOf(trait) })).toBe('été')
      expect(pick({ round: 1, traits: traitsOf(trait), rand: top })).toBe('serviette')
    }
  })

  it('+1 rang par audace, +1 rang dès la manche 2, borné à la fin de liste', () => {
    expect(pick({ round: 1, traits: traitsOf('prudent', 1) })).toBe('serviette')
    expect(pick({ round: 1, traits: traitsOf('agressif', 1), rand: top })).toBe('sable')
    expect(pick({ traits: traitsOf('prudent', 1) })).toBe('sable')
    expect(pick({ traits: traitsOf('prudent', 1), round: 5 })).toBe('sable')
    expect(pick({ traits: traitsOf('agressif', 1), round: 3, rand: top })).toBe('marée')
  })

  it('manche 1 : l’indice visé déjà dit se redit, sans faire de chœur', () => {
    // 4 joueurs, tiers vague de 2 → au plus deux voix sur un même indice.
    expect(pick({ round: 1, alive: 4, given: ['ÉTÉ'] })).toBe('été')
    expect(pick({ round: 1, alive: 4, given: ['été', 'Été'] })).toBe('serviette')
    // 5 joueurs : trois voix.
    expect(pick({ round: 1, given: ['été', 'Été'] })).toBe('été')
    expect(pick({ round: 1, given: ['été', 'Été', 'ete'] })).toBe('serviette')
    // À 16, la table entière peut rester vague : 16 / 2 → huit voix.
    expect(pick({ round: 1, alive: 16, given: Array(7).fill('été') })).toBe('été')
    expect(pick({ round: 1, alive: 16, given: Array(8).fill('été') })).toBe('serviette')
  })

  it('dès la manche 2, jamais un indice déjà dit tant qu’il en reste un libre : le plus proche, vers le précis', () => {
    expect(pick({ given: ['SERVIETTE'] })).toBe('sable')
    expect(pick({ given: ['serviette', 'sable', 'vagues'] })).toBe('été')
    expect(pick({ traits: traitsOf('agressif'), rand: top, given: ['marée'] })).toBe('parasol')
    // Rang visé 3 (vagues) pris, 4 (parasol) pris : sable (distance 1) avant marée (distance 2).
    expect(pick({ traits: traitsOf('suiveur'), given: ['vagues', 'parasol'] })).toBe('sable')
    expect(pick({ traits: traitsOf('suiveur'), given: ['vagues', 'parasol', 'sable'] })).toBe('marée')
  })

  it('liste épuisée : il redit SON indice le moins récemment dit, jamais « … »', () => {
    const mine = ['sable', 'marée', 'Sable']
    // « sable » redit plus tard que « marée » : c'est « marée » qui revient.
    expect(pick({ given: OWN, mine })).toBe('marée')
    expect(pick({ given: OWN.map((c) => c.toUpperCase()), mine: ['vagues'] })).toBe('vagues')
    // Ses indices hors liste (un perroquet d'avant, « … ») ne comptent pas.
    expect(pick({ given: OWN, mine: ['chlore', IMPOSTEUR_EMPTY_CLUE, 'été'] })).toBe('été')
  })

  it('liste épuisée sans indice à lui : celui de la liste que la table a le moins entendu', () => {
    const given = [...OWN, 'été', 'serviette', 'sable', 'vagues', 'marée']
    expect(pick({ given })).toBe('parasol')
    // Tous entendus autant : le plus proche du rang visé (prudent, manche 2 → serviette).
    expect(pick({ given: OWN })).toBe('serviette')
  })

  it('« … » seulement sans liste', () => {
    expect(pick({ clues: [] })).toBe(IMPOSTEUR_EMPTY_CLUE)
    expect(pick({ clues: [], mode: 'blend', mine: ['été'] })).toBe(IMPOSTEUR_EMPTY_CLUE)
    expect(pick({ given: OWN, mode: 'blend' })).not.toBe(IMPOSTEUR_EMPTY_CLUE)
  })

  it('mode blend : le plus vague, quels que soient le trait et la manche', () => {
    expect(pick({ mode: 'blend', traits: traitsOf('agressif', 1), round: 3, rand: top })).toBe('été')
    expect(pick({ mode: 'blend', round: 1, given: ['été'] })).toBe('serviette')
  })

  it('mode blend + perroquets : rand < ½ → un indice de la manche, dit une seule fois et valide pour mon mot', () => {
    const blend = (over: Partial<PickBotClueInput>) =>
      pick({ mode: 'blend', ownWord: 'plage', ...over })
    const given = ['sable', 'chlore', 'pas une plage', '…']
    const parrots = ['chlore', 'pas une plage', '…']
    // Seul « chlore » convient : « pas une plage » me trahirait, « … » n'apprend rien.
    expect(blend({ given, parrots, rand: zero })).toBe('chlore')
    // rand ≥ ½ : le plus vague de ma liste.
    expect(blend({ given, parrots, rand: top })).toBe('été')
    // Déjà répété une fois : on ne fait pas le chœur.
    expect(blend({ given: [...given, 'Chlore'], parrots, rand: zero })).toBe('été')
    // Variante de graphie (tiret, apostrophe) = même indice déjà répété.
    expect(
      blend({ given: ['maître-nageur', 'maître nageur'], parrots: ['maître nageur'], rand: zero })
    ).toBe('été')
    // Sans mot fourni, pas de perroquet (on ne peut pas vérifier qu'il serait accepté).
    expect(pick({ mode: 'blend', given, parrots, rand: zero })).toBe('été')
    // Le mode play ignore les perroquets.
    expect(pick({ given, parrots, ownWord: 'plage', rand: zero, round: 1 })).toBe('été')
  })

  it('1 000 tirages dès la manche 2 : rang moyen prudent < suiveur < agressif (audace égale)', () => {
    const meanRank = (trait: BotTrait): number => {
      const rng = createRng(`clue-${trait}`)
      let sum = 0
      for (let i = 0; i < 1000; i += 1) {
        const clue = pickBotClue({
          clues: OWN,
          given: [],
          traits: traitsOf(trait, 0.5),
          round: 2,
          rand: rng.next,
          mode: 'play',
        })
        sum += OWN.indexOf(clue)
      }
      return sum / 1000
    }
    const prudent = meanRank('prudent')
    const suiveur = meanRank('suiveur')
    const agressif = meanRank('agressif')
    expect(prudent).toBeLessThan(suiveur)
    expect(suiveur).toBeLessThan(agressif)
    expect(prudent).toBeGreaterThanOrEqual(0)
    expect(agressif).toBeLessThanOrEqual(OWN.length - 1)
  })

  it('INVARIANT : résultat ∈ liste ; déjà dit seulement en écho de manche 1 ou liste épuisée ; jamais « … »', () => {
    const rng = createRng('invariant')
    const norm = (list: readonly string[]) => list.map(normalizeClue)
    for (let i = 0; i < 1000; i += 1) {
      const given = OWN.filter(() => rng.next() < 0.5)
      const mine = given.filter(() => rng.next() < 0.5)
      const round = 1 + rng.pickIndex(3)
      const mode = rng.chance(0.2) ? ('blend' as const) : ('play' as const)
      const clue = pickBotClue({
        clues: OWN,
        given,
        mine,
        traits: traitsOf(TRAITS[rng.pickIndex(TRAITS.length)], rng.next()),
        round,
        rand: rng.next,
        mode,
        alive: 3 + rng.pickIndex(14),
      })
      expect(OWN).toContain(clue)
      const exhausted = norm(OWN).every((c) => norm(given).includes(c))
      if (!exhausted && !(mode === 'play' && round === 1)) expect(given).not.toContain(clue)
      if (exhausted && mine.length > 0 && !(mode === 'play' && round === 1)) expect(mine).toContain(clue)
    }
  })

  it('INVARIANT blend : résultat ∈ liste ∪ perroquets valides', () => {
    const rng = createRng('invariant-blend')
    const heard = ['chlore', 'plongeoir', 'pas une plage', 'sable', '…']
    for (let i = 0; i < 1000; i += 1) {
      const parrots = heard.filter(() => rng.next() < 0.5)
      const given = [...OWN.filter(() => rng.next() < 0.5), ...parrots]
      const clue = pickBotClue({
        clues: OWN,
        given,
        traits: traitsOf(TRAITS[rng.pickIndex(TRAITS.length)], rng.next()),
        round: 1 + rng.pickIndex(3),
        rand: rng.next,
        mode: 'blend',
        parrots,
        ownWord: 'plage',
      })
      const fromParrots = parrots.includes(clue) && clue !== '…' && clue !== 'pas une plage'
      expect(fromParrots || OWN.includes(clue)).toBe(true)
    }
  })
})
