import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLOCK_OFFSET_MIN_MS,
  clockOffsetBounds,
  clockOffsetMs,
  mergeClockOffsetBounds,
  type ClockOffsetBounds,
} from './server-clock'

/**
 * Les échéances d'une partie sont des dates serveur : elles se comparent à
 * l'heure du serveur estimée d'après l'en-tête `Date` des sondages, pas à
 * l'horloge du téléphone. Promesses :
 *  - un téléphone à l'heure n'est jamais corrigé (la seconde de l'en-tête ne
 *    fabrique pas de décalage) ;
 *  - un téléphone décalé de quelques secondes est recalé, de plus en plus
 *    précisément à chaque réponse, sans jamais être sur-corrigé ;
 *  - une horloge qui saute (réglée à la main) repart de la mesure neuve ;
 *  - chrono, verrous de délai et tick « advance » lisent cette heure-là.
 */

/** Seconde ronde côté serveur. */
const S = 1_700_000_000_000

/** En-tête `Date` (tronqué à la seconde) d'une réponse émise à `serverMs`. */
function dateHeader(serverMs: number): string {
  return new Date(Math.floor(serverMs / 1000) * 1000).toUTCString()
}

/**
 * Réponse simulée : envoyée à `sentAt` et reçue à `receivedAt` (horloge du
 * téléphone), émise par le serveur à l'instant local `emittedAt`, avec un
 * téléphone qui avance de `skewMs` sur le serveur.
 */
function sample(skewMs: number, sentAt: number, emittedAt: number, receivedAt: number) {
  return clockOffsetBounds(dateHeader(emittedAt - skewMs), sentAt, receivedAt)
}

function contains(bounds: ClockOffsetBounds, offset: number): boolean {
  return bounds.low <= offset && offset <= bounds.high
}

describe('clockOffsetBounds', () => {
  it('borne le décalage par la seconde annoncée et le trajet de la requête', () => {
    expect(clockOffsetBounds(dateHeader(S), S - 120, S + 80)).toEqual({ low: -80, high: 1120 })
  })

  it('ignore une réponse sans en-tête lisible ou une mesure incohérente', () => {
    expect(clockOffsetBounds(null, S, S + 50)).toBeNull()
    expect(clockOffsetBounds('', S, S + 50)).toBeNull()
    expect(clockOffsetBounds('pas une date', S, S + 50)).toBeNull()
    expect(clockOffsetBounds(dateHeader(S), S + 50, S)).toBeNull()
  })

  it('contient toujours le vrai décalage', () => {
    for (const skew of [-7_000, -1_200, 0, 300, 5_000]) {
      for (const emitted of [S + 10, S + 499, S + 999, S + 1_000]) {
        const bounds = sample(skew, emitted - 60, emitted, emitted + 90)!
        expect(contains(bounds, -skew)).toBe(true)
      }
    }
  })
})

describe('clockOffsetMs', () => {
  it('ne corrige pas un téléphone à l’heure, ni un écart sous la seconde', () => {
    let bounds: ClockOffsetBounds | null = null
    for (const emitted of [S + 20, S + 640, S + 990, S + 1_310]) {
      bounds = mergeClockOffsetBounds(bounds, sample(0, emitted - 80, emitted, emitted + 80)!)
      expect(clockOffsetMs(bounds)).toBe(0)
    }
    // Téléphone en avance de 0,8 s, mesure serrée : l'écart est certain mais
    // reste sous le seuil.
    const small = sample(800, S + 1_795, S + 1_799, S + 1_805)!
    expect(contains(small, 0)).toBe(false)
    expect(clockOffsetMs(small)).toBe(0)
    expect(clockOffsetMs(null)).toBe(0)
  })

  it('recale un téléphone en avance de 5 s, sans jamais sur-corriger', () => {
    const skew = 5_000
    // Émise juste avant puis juste après un changement de seconde serveur.
    const first = sample(skew, S + 5_990, S + 5_999, S + 6_000)!
    const offsetAfterFirst = clockOffsetMs(first)
    expect(offsetAfterFirst).toBeLessThanOrEqual(-CLOCK_OFFSET_MIN_MS)
    expect(offsetAfterFirst).toBeGreaterThanOrEqual(-skew)

    const both = mergeClockOffsetBounds(first, sample(skew, S + 5_995, S + 6_000, S + 6_010)!)
    expect(contains(both, -skew)).toBe(true)
    expect(both.high - both.low).toBeLessThanOrEqual(25)
    expect(Math.abs(clockOffsetMs(both) + skew)).toBeLessThanOrEqual(25)
  })

  it('recale aussi un téléphone en retard', () => {
    const skew = -4_000
    let bounds: ClockOffsetBounds | null = null
    for (const emitted of [S + 300, S + 995, S + 1_002]) {
      bounds = mergeClockOffsetBounds(bounds, sample(skew, emitted - 5, emitted, emitted + 5)!)
    }
    expect(Math.abs(clockOffsetMs(bounds) - 4_000)).toBeLessThanOrEqual(15)
  })

  it('repart de la mesure neuve quand l’heure du téléphone a sauté', () => {
    const ahead = sample(5_000, S + 5_990, S + 5_999, S + 6_000)!
    // Le joueur remet son téléphone à l'heure : bornes incompatibles.
    const fixed = sample(0, S + 60_000, S + 60_020, S + 60_040)!
    const merged = mergeClockOffsetBounds(ahead, fixed)
    expect(merged).toEqual(fixed)
    expect(clockOffsetMs(merged)).toBe(0)
  })
})

describe('application de l’heure serveur', () => {
  /** Téléphone en avance de 5 s, deux sondages déjà relevés. */
  const SKEW = 5_000
  /** Heure locale au moment du rendu (2 s à l'heure serveur). */
  const LOCAL_NOW = S + 7_000

  async function loadWithSkew() {
    vi.resetModules()
    const clock = await import('./server-clock')
    const respond = (emittedAt: number) =>
      new Response(null, { headers: { date: dateHeader(emittedAt - SKEW) } })
    clock.noteServerDate(respond(S + 5_999), S + 5_990, S + 6_000)
    clock.noteServerDate(respond(S + 6_000), S + 5_995, S + 6_010)
    vi.setSystemTime(LOCAL_NOW)
    return clock
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('serverNow suit le serveur, pas le téléphone', async () => {
    const clock = await loadWithSkew()
    expect(Math.abs(clock.serverNow() - (LOCAL_NOW - SKEW))).toBeLessThanOrEqual(25)
  })

  it('PhaseCountdown montre le temps qui reste VRAIMENT au serveur', async () => {
    const clock = await loadWithSkew()
    const { PhaseCountdown } = await import('@/components/online/PhaseCountdown')
    // 10 s de phase à l'heure serveur ; l'horloge du téléphone en voit 5.
    const endsAt = LOCAL_NOW - SKEW + 10_000
    expect(clock.serverNow()).toBeLessThan(endsAt)
    const html = renderToStaticMarkup(createElement(PhaseCountdown, { endsAt }))
    expect(html).toBe('<span>10</span>')
  })

  it('useDeadline ne débloque pas avant l’échéance serveur', async () => {
    await loadWithSkew()
    const { useDeadline } = await import('./useDeadline')
    // « Manche suivante » ouverte dans 3 s côté serveur : déjà passée pour
    // l'horloge du téléphone, en avance de 5 s.
    const continueAt = LOCAL_NOW - SKEW + 3_000
    function Probe() {
      return useDeadline(continueAt) ? 'ouvert' : 'verrouillé'
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe('verrouillé')
  })

  it('le tick « advance » vise l’échéance serveur', async () => {
    await loadWithSkew()
    const { advanceTickDelayMs, ADVANCE_TICK_MARGIN_MS } = await import('./useBotReferee')
    const dueAt = LOCAL_NOW - SKEW + 8_000
    const delay = advanceTickDelayMs(dueAt, 0)
    expect(Math.abs(delay - (8_000 + ADVANCE_TICK_MARGIN_MS))).toBeLessThanOrEqual(25)
  })
})
