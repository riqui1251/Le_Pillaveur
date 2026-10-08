import { describe, expect, it } from 'vitest'
import { parisDayString } from '@/lib/paris-time'
import { DEFAULT_ONLINE_ICON, PIONEER_FRAME_KEY, xpForLevel } from './cosmetics'
import {
  FIRST_STEP_ORDER,
  LEVEL2_ICON_SERIES_ID,
  LEVEL3_EFFECT_ID,
  PIONEER_DEADLINE,
  PIONEER_DEADLINE_MS,
  computeFirstSteps,
  earnsPioneerFrame,
  isPioneerWindowOpen,
  pioneerReward,
  pioneerRewardState,
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

describe('cadre Pionnier — date limite', () => {
  it('fin mars 2027, heure de Paris : le 31 mars compte encore, le 1er avril non', () => {
    // Minuit le 1er avril à Paris, déjà en heure d'été (+02:00) = 22 h UTC la veille.
    expect(PIONEER_DEADLINE_MS).toBe(Date.UTC(2027, 2, 31, 22, 0, 0))
    expect(parisDayString(new Date(PIONEER_DEADLINE_MS - 1))).toBe('2027-03-31')
    expect(parisDayString(new Date(PIONEER_DEADLINE_MS))).toBe('2027-04-01')
  })

  it('fenêtre ouverte strictement avant la date limite', () => {
    expect(isPioneerWindowOpen(new Date('2026-10-08T12:00:00Z'))).toBe(true)
    expect(isPioneerWindowOpen(PIONEER_DEADLINE_MS - 1)).toBe(true)
    expect(isPioneerWindowOpen(PIONEER_DEADLINE_MS)).toBe(false)
    expect(isPioneerWindowOpen(new Date('2027-06-01T12:00:00Z'))).toBe(false)
  })

  it('date limite fournie par le serveur (carte) : la même règle, illisible = fermée', () => {
    const utc = new Date(PIONEER_DEADLINE_MS).toISOString()
    expect(isPioneerWindowOpen(PIONEER_DEADLINE_MS - 1, PIONEER_DEADLINE)).toBe(true)
    expect(isPioneerWindowOpen(PIONEER_DEADLINE_MS - 1, utc)).toBe(true)
    expect(isPioneerWindowOpen(PIONEER_DEADLINE_MS, utc)).toBe(false)
    expect(isPioneerWindowOpen(0, 'pas une date')).toBe(false)
  })
})

describe('cadre Pionnier — attribution', () => {
  const allDone = computeFirstSteps({
    xp: 450,
    prefs: { icon: 'autre-icone', specialEffect: 'emerald' },
    isGuest: false,
    hasFirstGame: true,
    playedWithHumans: true,
  })
  const before = new Date('2027-03-31T23:59:59+02:00')
  const after = new Date('2027-04-01T00:00:00+02:00')

  it('toutes les étapes faites avant la date limite : gagné', () => {
    expect(earnsPioneerFrame(allDone, before)).toBe(true)
  })

  it('toutes faites, mais à la date limite ou après : plus gagné', () => {
    expect(earnsPioneerFrame(allDone, after)).toBe(false)
    expect(earnsPioneerFrame(allDone, new Date('2028-01-01T00:00:00Z'))).toBe(false)
  })

  it('invité qui a tout fait sauf sauvegarder : pas encore ; une fois sauvegardé : gagné', () => {
    const asGuest = fresh({
      xp: 450,
      prefs: { icon: 'autre-icone', specialEffect: 'emerald' },
      hasFirstGame: true,
      playedWithHumans: true,
    })
    const almost = computeFirstSteps(asGuest)
    expect(almost.completed).toBe(almost.total - 1)
    expect(earnsPioneerFrame(almost, before)).toBe(false)
    // Même parcours, compte mis à l'abri : la sauvegarde était l'étape qui manquait.
    expect(earnsPioneerFrame(computeFirstSteps({ ...asGuest, isGuest: false }), before)).toBe(true)
  })

  it('liste vide : jamais (garde-fou)', () => {
    expect(earnsPioneerFrame({ completed: 0, total: 0 }, before)).toBe(false)
  })

  it('la réponse porte la clé du grant et la date limite', () => {
    expect(pioneerReward(true)).toEqual({ key: PIONEER_FRAME_KEY, granted: true, deadline: PIONEER_DEADLINE })
    expect(pioneerReward(false).granted).toBe(false)
    expect(PIONEER_FRAME_KEY).toBe('frame:pionnier')
  })
})

describe('cadre Pionnier — ce qu’en dit la carte (pioneerRewardState)', () => {
  const base = { stepsLeft: true, windowOpen: true, equipped: false, justEquipped: false }

  it('à gagner : promis tant que la liste est à finir et la date pas passée', () => {
    expect(pioneerRewardState({ ...base, reward: { granted: false } })).toBe('promise')
  })

  it('date passée sans l’avoir : plus promis', () => {
    expect(pioneerRewardState({ ...base, reward: { granted: false }, windowOpen: false })).toBeNull()
  })

  it('liste finie sans grant (après la date) : rien à dire', () => {
    expect(pioneerRewardState({ ...base, reward: { granted: false }, stepsLeft: false })).toBeNull()
  })

  it('accordé, pas porté : « L’équiper », même après la date limite', () => {
    expect(pioneerRewardState({ ...base, reward: { granted: true }, stepsLeft: false })).toBe('unlocked')
    expect(
      pioneerRewardState({ ...base, reward: { granted: true }, stepsLeft: false, windowOpen: false })
    ).toBe('unlocked')
  })

  it('équipé pendant la visite : confirmé ; déjà porté en arrivant : silence', () => {
    const worn = { ...base, reward: { granted: true }, stepsLeft: false, equipped: true }
    expect(pioneerRewardState({ ...worn, justEquipped: true })).toBe('equipped')
    expect(pioneerRewardState(worn)).toBeNull()
  })

  it('serveur d’avant la récompense : rien', () => {
    expect(pioneerRewardState({ ...base, reward: undefined })).toBeNull()
    expect(pioneerRewardState({ ...base, reward: null })).toBeNull()
  })
})
