import { describe, expect, it } from 'vitest'
import { DEFAULT_ONLINE_ICON, xpForLevel } from './cosmetics'
import {
  FIRST_STEP_ORDER,
  LEVEL2_ICON_SERIES_ID,
  LEVEL3_EFFECT_ID,
  computeFirstSteps,
  type FirstStepsInput,
} from './first-steps'

/** Nouveau venu : invité, rien joué, rien personnalisé. */
const fresh = (over: Partial<FirstStepsInput> = {}): FirstStepsInput => ({
  xp: 0,
  prefs: { icon: DEFAULT_ONLINE_ICON, specialEffect: null },
  isGuest: true,
  hasFirstGame: false,
  playedWithHumans: false,
  ...over,
})

const doneOf = (input: FirstStepsInput) =>
  Object.fromEntries(computeFirstSteps(input).steps.map((s) => [s.id, s.done]))

describe('computeFirstSteps — liste et ordre', () => {
  it('invité : les six étapes, dans l’ordre du contrat, aucune faite', () => {
    const result = computeFirstSteps(fresh())

    expect(result.steps.map((s) => s.id)).toEqual(['play', 'icon', 'effect', 'save', 'friends', 'level3'])
    expect(result.steps.every((s) => !s.done)).toBe(true)
    expect(result).toMatchObject({ completed: 0, total: 6, xp: 0, xpToLevel3: 300 })
  })

  it('compte enregistré : pas d’étape « sauvegarder » (elle gonflerait le compteur)', () => {
    const result = computeFirstSteps(fresh({ isGuest: false }))

    expect(result.steps.map((s) => s.id)).toEqual(['play', 'icon', 'effect', 'friends', 'level3'])
    expect(result.total).toBe(5)
    expect(result.completed).toBe(0)
  })

  it('l’ordre exporté est celui des étapes rendues', () => {
    expect(computeFirstSteps(fresh()).steps.map((s) => s.id)).toEqual([...FIRST_STEP_ORDER])
  })
})

describe('computeFirstSteps — détection de chaque étape', () => {
  it('jouer : de l’XP OU le succès première partie', () => {
    expect(doneOf(fresh({ xp: 10 })).play).toBe(true)
    expect(doneOf(fresh({ hasFirstGame: true })).play).toBe(true)
    expect(doneOf(fresh()).play).toBe(false)
  })

  it('icône : faite dès qu’elle diffère de l’icône par défaut', () => {
    expect(doneOf(fresh({ prefs: { icon: 'autre-icone', specialEffect: null } })).icon).toBe(true)
    expect(doneOf(fresh({ prefs: { icon: DEFAULT_ONLINE_ICON, specialEffect: null } })).icon).toBe(false)
    // Icône absente = icône par défaut côté serveur : pas faite.
    expect(doneOf(fresh({ prefs: { icon: undefined, specialEffect: null } })).icon).toBe(false)
    expect(doneOf(fresh({ prefs: { icon: '', specialEffect: null } })).icon).toBe(false)
  })

  it('effet : fait dès qu’un effet est équipé', () => {
    expect(doneOf(fresh({ prefs: { icon: DEFAULT_ONLINE_ICON, specialEffect: 'red' } })).effect).toBe(true)
    expect(doneOf(fresh({ prefs: { icon: DEFAULT_ONLINE_ICON, specialEffect: null } })).effect).toBe(false)
    expect(doneOf(fresh({ prefs: { icon: DEFAULT_ONLINE_ICON, specialEffect: undefined } })).effect).toBe(false)
  })

  it('sauvegarder : présent pour un invité, jamais fait tant qu’il l’est', () => {
    expect(doneOf(fresh()).save).toBe(false)
    expect(doneOf(fresh({ isGuest: false }))).not.toHaveProperty('save')
  })

  it('potes : suit la partie journalisée à plusieurs humains', () => {
    expect(doneOf(fresh({ playedWithHumans: true })).friends).toBe(true)
    expect(doneOf(fresh({ xp: 120, hasFirstGame: true })).friends).toBe(false)
  })

  it('niveau 3 : au seuil exact de 300 XP, pas avant', () => {
    const below = computeFirstSteps(fresh({ xp: xpForLevel(3) - 1 }))
    const at = computeFirstSteps(fresh({ xp: xpForLevel(3) }))

    expect(xpForLevel(3)).toBe(300)
    expect(below.steps.find((s) => s.id === 'level3')?.done).toBe(false)
    expect(below.xpToLevel3).toBe(1)
    expect(at.steps.find((s) => s.id === 'level3')?.done).toBe(true)
    expect(at.xpToLevel3).toBe(0)
    expect(computeFirstSteps(fresh({ xp: 5000 })).xpToLevel3).toBe(0)
  })
})

describe('computeFirstSteps — compteurs et valeurs limites', () => {
  it('tout fait : completed = total', () => {
    const result = computeFirstSteps({
      xp: 450,
      prefs: { icon: 'autre-icone', specialEffect: 'emerald' },
      isGuest: false,
      hasFirstGame: true,
      playedWithHumans: true,
    })

    expect(result.completed).toBe(result.total)
    expect(result.total).toBe(5)
  })

  it('compte partiel : le compteur suit les étapes cochées', () => {
    const result = computeFirstSteps(fresh({ xp: 60, playedWithHumans: true }))

    // play + friends
    expect(result.completed).toBe(2)
    expect(result.total).toBe(6)
    expect(result.xpToLevel3).toBe(240)
  })

  it.each([[-40], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'XP exotique %s : traitée comme 0',
    (xp) => {
      const result = computeFirstSteps(fresh({ xp }))
      expect(result.xp).toBe(0)
      expect(result.xpToLevel3).toBe(300)
      expect(doneOf(fresh({ xp })).play).toBe(false)
    }
  )

  it('XP fractionnaire : arrondie vers le bas', () => {
    expect(computeFirstSteps(fresh({ xp: 299.9 })).xpToLevel3).toBe(1)
  })
})

describe('déblocages cités par la carte', () => {
  it('le niveau 2 débloque une série d’icônes, le niveau 3 un effet de pseudo', () => {
    // La carte les nomme : si le catalogue change de palier, ce test le dit.
    expect(LEVEL2_ICON_SERIES_ID).toBe('trognes')
    expect(LEVEL3_EFFECT_ID).toBe('emerald')
  })
})
