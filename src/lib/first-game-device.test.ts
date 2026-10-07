import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FIRST_GAME_DEVICE_KEY,
  FIRST_GAME_FEEDBACK_MAX_SHOWN,
  FIRST_GAME_FRESH_WINDOW_MS,
  HAS_LOGGED_IN_KEY,
  LOCAL_PLAYERS_KEY,
  LOCAL_SAVE_PREFIX,
  RECENT_LOCAL_GAMES_STORAGE_KEY,
  TUTORIAL_SEEN_PREFIX,
  flagAfterAsked,
  flagAfterShown,
  flagAsVeteran,
  hasPastActivity,
  initFirstGameDeviceFlag,
  isFreshFirstGameDevice,
  markFirstGameDeviceVeteran,
  markFirstGameFeedbackAsked,
  noteFirstGameFeedbackShown,
  parseFirstGameDeviceFlag,
  shouldAskFirstGameFeedback,
  type DeviceStorage,
  type FirstGameDeviceFlag,
} from './first-game-device'
import { RECENT_LOCAL_GAMES_KEY } from './recent-local-games'
import { localGameSaveKey } from './game-session'
import { savePlayers } from './players'
import { AGE_VERIFIED_COOKIE } from './auth-cookies'

/**
 * Avis de première partie : l'appareil sait s'il découvre le site (local) et
 * borne les affichages (local comme en ligne). Un habitué ne doit JAMAIS lire
 * « ta première partie », un nouveau doit être sollicité au plus deux fois,
 * et seulement dans les 24 h de sa première visite.
 */

/** Stockage en mémoire, avec l'énumération des clés (Storage.key / length). */
function memoryStorage(initial: Record<string, string> = {}): DeviceStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  }
}

const refusedStorage: DeviceStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  key: () => null,
  length: 0,
}

/** Première visite de l'appareil. */
const SINCE = new Date('2026-10-07T19:00:00.000Z').getTime()
const HOUR_MS = 60 * 60 * 1000

const flag = (state: FirstGameDeviceFlag['state'], seen = 0, since = SINCE): FirstGameDeviceFlag => ({
  v: 2,
  state,
  seen,
  since,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('clés lues', () => {
  it('collent aux modules qui les écrivent', () => {
    expect(RECENT_LOCAL_GAMES_STORAGE_KEY).toBe(RECENT_LOCAL_GAMES_KEY)
    expect(localGameSaveKey('pyramide').startsWith(LOCAL_SAVE_PREFIX)).toBe(true)

    // STORAGE_KEY de players.ts n'est pas exporté : on regarde où savePlayers écrit.
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    savePlayers([])
    expect(Array.from(storage.data.keys())).toEqual([LOCAL_PLAYERS_KEY])

    // Composants React (non importables ici) : on relit leur source.
    const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
    expect(source('../components/online/GameTutorialModal.tsx')).toContain(`'${TUTORIAL_SEEN_PREFIX}'`)
    expect(source('../components/auth/AuthForm.tsx')).toContain(`'${HAS_LOGGED_IN_KEY}'`)
  })

  it('reste dans la famille « lp-… » des mémoires de l’appareil', () => {
    expect(FIRST_GAME_DEVICE_KEY).toBe('lp-first-game-feedback')
  })
})

describe('parseFirstGameDeviceFlag', () => {
  it('relit un drapeau valide', () => {
    expect(parseFirstGameDeviceFlag(JSON.stringify(flag('fresh', 1)))).toEqual(flag('fresh', 1))
    expect(parseFirstGameDeviceFlag(JSON.stringify(flag('asked', 2)))).toEqual(flag('asked', 2))
  })

  it('tient pour absent tout ce qui n’a pas la forme attendue', () => {
    expect(parseFirstGameDeviceFlag(null)).toBeNull()
    expect(parseFirstGameDeviceFlag('')).toBeNull()
    expect(parseFirstGameDeviceFlag('{pas du json')).toBeNull()
    expect(parseFirstGameDeviceFlag('"fresh"')).toBeNull()
    // v:1 (sans date de première visite) : recalculée, jamais réinterprétée.
    expect(parseFirstGameDeviceFlag(JSON.stringify({ v: 1, state: 'fresh', seen: 0 }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ ...flag('fresh'), v: 3 }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ ...flag('fresh'), state: 'nouveau' }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ ...flag('fresh'), seen: -1 }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ ...flag('fresh'), seen: 0.5 }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ v: 2, state: 'fresh', seen: 0 }))).toBeNull()
    expect(parseFirstGameDeviceFlag(JSON.stringify({ ...flag('fresh'), since: '2026-10-07' }))).toBeNull()
  })
})

describe('hasPastActivity', () => {
  it('appareil vierge : aucune activité', () => {
    expect(hasPastActivity(memoryStorage())).toBe(false)
    expect(hasPastActivity(memoryStorage(), 'lp_analytics_consent=0; autre=1')).toBe(false)
  })

  it('ignore les mémoires qui ne disent pas qu’on a joué', () => {
    expect(
      hasPastActivity(
        memoryStorage({
          'lp-ambiance-mode': 'soft',
          'lp-sound-muted': '1',
          [RECENT_LOCAL_GAMES_STORAGE_KEY]: '[]',
          [LOCAL_PLAYERS_KEY]: JSON.stringify([{ id: 'a', stats: { gamesPlayed: 0 } }]),
        })
      )
    ).toBe(false)
  })

  it('un seul indice suffit', () => {
    expect(hasPastActivity(memoryStorage({ [`${TUTORIAL_SEEN_PREFIX}quiz`]: '1' }))).toBe(true)
    expect(hasPastActivity(memoryStorage({ [RECENT_LOCAL_GAMES_STORAGE_KEY]: '["pyramide"]' }))).toBe(true)
    expect(hasPastActivity(memoryStorage({ [HAS_LOGGED_IN_KEY]: '1' }))).toBe(true)
    expect(hasPastActivity(memoryStorage({ [localGameSaveKey('pyramide')]: '{}' }))).toBe(true)
    expect(
      hasPastActivity(
        memoryStorage({
          [LOCAL_PLAYERS_KEY]: JSON.stringify([
            { id: 'a', stats: { gamesPlayed: 0 } },
            { id: 'b', stats: { gamesPlayed: 3 } },
          ]),
        })
      )
    ).toBe(true)
  })

  it('portail d’âge déjà franchi : visite passée, même au stockage vidé (purge Safari)', () => {
    expect(AGE_VERIFIED_COOKIE).toBe('lp_age_verified')
    expect(hasPastActivity(memoryStorage(), `${AGE_VERIFIED_COOKIE}=1`)).toBe(true)
    expect(hasPastActivity(memoryStorage(), `lp_vid=abc; ${AGE_VERIFIED_COOKIE}=1; x=2`)).toBe(true)
    // Un autre cookie dont le nom CONTIENT celui du portail ne compte pas.
    expect(hasPastActivity(memoryStorage(), `old_${AGE_VERIFIED_COOKIE}=1`)).toBe(false)
  })

  it('un JSON illisible ne vaut pas activité', () => {
    expect(
      hasPastActivity(
        memoryStorage({ [RECENT_LOCAL_GAMES_STORAGE_KEY]: '{oups', [LOCAL_PLAYERS_KEY]: 'null' })
      )
    ).toBe(false)
  })
})

describe('initFirstGameDeviceFlag', () => {
  it('nouveau visiteur : « fresh », daté de sa première visite, écrit dans le stockage', () => {
    const storage = memoryStorage()
    expect(initFirstGameDeviceFlag(storage, '', SINCE)).toEqual(flag('fresh'))
    expect(parseFirstGameDeviceFlag(storage.getItem(FIRST_GAME_DEVICE_KEY))).toEqual(flag('fresh'))
  })

  it('habitué au déploiement : « veteran » d’emblée', () => {
    const storage = memoryStorage({ [HAS_LOGGED_IN_KEY]: '1' })
    expect(initFirstGameDeviceFlag(storage, '', SINCE)).toEqual(flag('veteran'))
  })

  it('stockage vidé mais portail d’âge déjà franchi : « veteran »', () => {
    expect(initFirstGameDeviceFlag(memoryStorage(), `${AGE_VERIFIED_COOKIE}=1`, SINCE)).toEqual(flag('veteran'))
  })

  it('ne réécrit JAMAIS un drapeau existant (le nouveau qui a joué reste « fresh »)', () => {
    const storage = memoryStorage({
      [FIRST_GAME_DEVICE_KEY]: JSON.stringify(flag('fresh', 1)),
      [RECENT_LOCAL_GAMES_STORAGE_KEY]: '["pyramide"]',
    })
    // Le cookie du portail, posé depuis, ne change rien non plus.
    expect(initFirstGameDeviceFlag(storage, `${AGE_VERIFIED_COOKIE}=1`, SINCE + HOUR_MS)).toEqual(flag('fresh', 1))
  })

  it('un drapeau illisible ou v:1 est recalculé', () => {
    const storage = memoryStorage({ [FIRST_GAME_DEVICE_KEY]: 'oups', [HAS_LOGGED_IN_KEY]: '1' })
    expect(initFirstGameDeviceFlag(storage, '', SINCE)).toEqual(flag('veteran'))
    const old = memoryStorage({ [FIRST_GAME_DEVICE_KEY]: JSON.stringify({ v: 1, state: 'fresh', seen: 0 }) })
    expect(initFirstGameDeviceFlag(old, '', SINCE)).toEqual(flag('fresh'))
  })

  it('stockage absent ou refusé : null, sans lever', () => {
    expect(initFirstGameDeviceFlag(null)).toBeNull()
    expect(initFirstGameDeviceFlag(refusedStorage)).toBeNull()
  })

  it('hors navigateur (rendu serveur) : null', () => {
    expect(initFirstGameDeviceFlag()).toBeNull()
  })
})

describe('isFreshFirstGameDevice', () => {
  it('« fresh » pendant 24 h après la première visite, plus après', () => {
    expect(isFreshFirstGameDevice(flag('fresh'), SINCE)).toBe(true)
    expect(isFreshFirstGameDevice(flag('fresh'), SINCE + FIRST_GAME_FRESH_WINDOW_MS)).toBe(true)
    expect(isFreshFirstGameDevice(flag('fresh'), SINCE + FIRST_GAME_FRESH_WINDOW_MS + 1)).toBe(false)
    // Horloge recalée en arrière : récent, comme côté serveur.
    expect(isFreshFirstGameDevice(flag('fresh'), SINCE - HOUR_MS)).toBe(true)
    expect(isFreshFirstGameDevice(flag('veteran'), SINCE)).toBe(false)
  })
})

describe('shouldAskFirstGameFeedback', () => {
  const now = SINCE + 3 * HOUR_MS

  it('local : seulement un appareil neuf, deux affichages au plus', () => {
    expect(shouldAskFirstGameFeedback({ device: flag('fresh', 0), mode: 'local', now })).toBe(true)
    expect(shouldAskFirstGameFeedback({ device: flag('fresh', 1), mode: 'local', now })).toBe(true)
    expect(shouldAskFirstGameFeedback({ device: flag('fresh', 2), mode: 'local', now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: flag('veteran', 0), mode: 'local', now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: flag('asked', 0), mode: 'local', now })).toBe(false)
  })

  it('local : plus jamais au-delà de 24 h (Purple et 1220 n’éteignent pas le drapeau)', () => {
    const tenDaysLater = SINCE + 10 * 24 * HOUR_MS
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'local', now: tenDaysLater })).toBe(false)
  })

  it('local avec un compte connecté : le serveur doit aussi le juger nouveau', () => {
    // Sans compte : l'appareil décide seul.
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'local', now })).toBe(true)
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'local', serverEligible: true, now })).toBe(true)
    // Habitué sur un téléphone neuf, ou compte déjà sollicité ailleurs.
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'local', serverEligible: false, now })).toBe(false)
    // Le serveur ne rend pas « nouveau » un appareil qui ne l'est pas.
    expect(shouldAskFirstGameFeedback({ device: flag('veteran'), mode: 'local', serverEligible: true, now })).toBe(false)
  })

  it('en ligne : le serveur décide, l’appareil évite la répétition', () => {
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'online', serverEligible: true, now })).toBe(true)
    // Un habitué du local peut découvrir le jeu en ligne, à n'importe quelle date.
    expect(shouldAskFirstGameFeedback({ device: flag('veteran'), mode: 'online', serverEligible: true, now })).toBe(true)
    expect(
      shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'online', serverEligible: true, now: SINCE * 2 })
    ).toBe(true)
    expect(shouldAskFirstGameFeedback({ device: flag('veteran', 1), mode: 'online', serverEligible: true, now })).toBe(true)
    expect(shouldAskFirstGameFeedback({ device: flag('veteran', 2), mode: 'online', serverEligible: true, now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: flag('asked'), mode: 'online', serverEligible: true, now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'online', serverEligible: false, now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: flag('fresh'), mode: 'online', now })).toBe(false)
  })

  it('sans mémoire de l’appareil : jamais', () => {
    expect(shouldAskFirstGameFeedback({ device: null, mode: 'local', now })).toBe(false)
    expect(shouldAskFirstGameFeedback({ device: null, mode: 'online', serverEligible: true, now })).toBe(false)
  })
})

describe('transitions', () => {
  it('le premier affichage laisse une seconde chance, le deuxième clôt', () => {
    const once = flagAfterShown(flag('fresh'))
    expect(once).toEqual(flag('fresh', 1))
    expect(flagAfterShown(once)).toEqual(flag('asked', FIRST_GAME_FEEDBACK_MAX_SHOWN))
    expect(flagAfterShown(flag('veteran', 1))).toEqual(flag('asked', 2))
  })

  it('une réponse clôt sans toucher au compteur ni à la date', () => {
    expect(flagAfterAsked(flag('fresh', 1))).toEqual(flag('asked', 1))
  })

  it('compte écarté par le serveur : « fresh » devient « veteran », « asked » le reste', () => {
    expect(flagAsVeteran(flag('fresh', 1))).toEqual(flag('veteran', 1))
    expect(flagAsVeteran(flag('asked', 1))).toEqual(flag('asked', 1))
    expect(flagAsVeteran(flag('veteran'))).toEqual(flag('veteran'))
  })

  it('noteFirstGameFeedbackShown / markFirstGameFeedbackAsked / markFirstGameDeviceVeteran écrivent dans le stockage', () => {
    const storage = memoryStorage({ [FIRST_GAME_DEVICE_KEY]: JSON.stringify(flag('fresh')) })
    noteFirstGameFeedbackShown(storage)
    expect(parseFirstGameDeviceFlag(storage.getItem(FIRST_GAME_DEVICE_KEY))).toEqual(flag('fresh', 1))
    // Démonté par la revanche, réaffiché à la partie suivante : c'était la dernière fois.
    noteFirstGameFeedbackShown(storage)
    expect(parseFirstGameDeviceFlag(storage.getItem(FIRST_GAME_DEVICE_KEY))).toEqual(flag('asked', 2))

    const other = memoryStorage({ [FIRST_GAME_DEVICE_KEY]: JSON.stringify(flag('fresh', 1)) })
    markFirstGameFeedbackAsked(other)
    expect(parseFirstGameDeviceFlag(other.getItem(FIRST_GAME_DEVICE_KEY))).toEqual(flag('asked', 1))

    const phone = memoryStorage({ [FIRST_GAME_DEVICE_KEY]: JSON.stringify(flag('fresh')) })
    markFirstGameDeviceVeteran(phone)
    expect(parseFirstGameDeviceFlag(phone.getItem(FIRST_GAME_DEVICE_KEY))).toEqual(flag('veteran'))
  })

  it('stockage refusé : ni erreur ni écriture', () => {
    expect(() => noteFirstGameFeedbackShown(refusedStorage)).not.toThrow()
    expect(() => markFirstGameFeedbackAsked(refusedStorage)).not.toThrow()
    expect(() => markFirstGameFeedbackAsked(null)).not.toThrow()
    expect(() => markFirstGameDeviceVeteran(refusedStorage)).not.toThrow()
  })
})
