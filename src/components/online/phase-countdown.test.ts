import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MIN_TICK_MS, countdownSnapshot, formatCountdown, nextSecondTickMs } from './phase-countdown'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'

/**
 * Les secondes affichées doivent être EXACTEMENT celles que les composants
 * calculaient avec leur horloge locale (`Math.ceil(max(0, endsAt - clock) / 1000)`),
 * et le tick suivant doit tomber au moment précis où le chiffre change.
 */

describe('countdownSnapshot', () => {
  it('arrondit à la seconde supérieure, comme les comptes à rebours d’origine', () => {
    expect(countdownSnapshot(10_000, 0).seconds).toBe(10)
    expect(countdownSnapshot(10_000, 1).seconds).toBe(10)
    expect(countdownSnapshot(10_000, 9_000).seconds).toBe(1)
    expect(countdownSnapshot(10_000, 9_999).seconds).toBe(1)
    expect(countdownSnapshot(10_000, 10_000).seconds).toBe(0)
  })

  it('ne descend jamais sous zéro une fois l’échéance passée', () => {
    const snap = countdownSnapshot(10_000, 12_345)
    expect(snap.leftMs).toBe(0)
    expect(snap.seconds).toBe(0)
    expect(snap.ratio).toBe(0)
    expect(snap.expired).toBe(true)
  })

  it('donne la fraction de barre plafonnée à 1', () => {
    expect(countdownSnapshot(60_000, 15_000, 60_000).ratio).toBe(0.75)
    expect(countdownSnapshot(60_000, 0, 30_000).ratio).toBe(1)
    // Sans durée totale, pas de barre.
    expect(countdownSnapshot(60_000, 0).ratio).toBe(0)
    expect(countdownSnapshot(60_000, 0, 0).ratio).toBe(0)
  })

  it('traite une échéance absente comme déjà passée', () => {
    expect(countdownSnapshot(null, 5_000)).toEqual({ leftMs: 0, seconds: 0, ratio: 0, expired: true })
    expect(countdownSnapshot(undefined, 5_000).expired).toBe(true)
  })
})

describe('nextSecondTickMs', () => {
  it('vise l’instant exact où la seconde affichée change', () => {
    // Il reste 4 678 ms : « 5 » devient « 4 » dans 678 ms.
    expect(nextSecondTickMs(10_000, 5_322)).toBe(678)
    expect(countdownSnapshot(10_000, 5_322).seconds).toBe(5)
    expect(countdownSnapshot(10_000, 5_322 + 678).seconds).toBe(4)
  })

  it('attend une seconde pleine quand on est pile sur la frontière', () => {
    expect(nextSecondTickMs(10_000, 7_000)).toBe(1000)
    expect(nextSecondTickMs(10_000, 10_000)).toBe(1000)
  })

  it('ne dépend pas de la frontière de l’horloge murale', () => {
    // Même reste, décalage différent par rapport aux secondes « rondes ».
    expect(nextSecondTickMs(10_500, 5_822)).toBe(678)
    expect(nextSecondTickMs(10_123, 9_000)).toBe(123)
  })

  it('garde un plancher pour ne pas tourner en boucle serrée', () => {
    expect(nextSecondTickMs(10_000, 9_999)).toBe(COUNTDOWN_MIN_TICK_MS)
    expect(nextSecondTickMs(10_000, 12_995)).toBe(COUNTDOWN_MIN_TICK_MS)
  })
})

describe('formatCountdown', () => {
  it('écrit minutes:secondes, avec le « 0: » sous la minute', () => {
    expect(formatCountdown(23)).toBe('0:23')
    expect(formatCountdown(5)).toBe('0:05')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(125)).toBe('2:05')
  })

  it('ne descend jamais sous 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-3)).toBe('0:00')
  })
})

describe('PhaseCountdown — barre chiffrée', () => {
  it('garde la barre nue des appels existants', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseCountdown, { variant: 'bar', endsAt: Date.now() + 20_000, total: 40_000, colorClassName: 'bg-gold' })
    )
    expect(html).toContain('class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"')
    expect(html).not.toContain('role="timer"')
  })

  it('affiche les secondes en m:ss à droite d’une piste plus haute', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseCountdown, {
        variant: 'bar',
        showDigits: true,
        endsAt: Date.now() + 23_500,
        total: 60_000,
        dangerMs: 10_000,
        colorClassName: 'bg-gold',
      })
    )
    expect(html).toContain('h-2.5')
    expect(html).toMatch(/role="timer"[^>]*>0:24</)
    expect(html).toContain('text-cream')
    expect(html).toContain('bg-gold')
  })

  it('passe le chiffre en rouge pulsé et la barre en red-400 par défaut sous le seuil', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseCountdown, {
        variant: 'bar',
        showDigits: true,
        endsAt: Date.now() + 4_500,
        total: 60_000,
        dangerMs: 10_000,
        colorClassName: 'bg-gold',
      })
    )
    expect(html).toContain('text-red-300 motion-safe:animate-pulse')
    expect(html).toContain('bg-red-400')
    expect(html).not.toContain('bg-gold')
  })

  it('ne pulse plus une fois l’échéance passée, en attendant le serveur', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseCountdown, {
        variant: 'bar',
        showDigits: true,
        endsAt: Date.now() - 1_000,
        total: 60_000,
        dangerMs: 10_000,
      })
    )
    expect(html).toMatch(/role="timer"[^>]*>0:00</)
    expect(html).toContain('text-red-300')
    expect(html).not.toContain('animate-pulse')
  })

  it('n’écrit pas de « 0:00 » sans échéance', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseCountdown, { variant: 'bar', showDigits: true, endsAt: null, total: 60_000, dangerMs: 10_000 })
    )
    expect(html).not.toContain('role="timer"')
    expect(html).not.toContain('0:00')
  })
})

describe('PhaseHeader', () => {
  it('pose manche, phase en titre d’or, chrono chiffré et ligne d’état', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseHeader, {
        round: 'Nuit 1',
        phase: 'Les loups choisissent',
        endsAt: Date.now() + 30_000,
        total: 60_000,
        status: 'En attente de 3 joueurs',
      })
    )
    expect(html).toContain('Nuit 1')
    expect(html).toMatch(/font-display text-base[^"]*text-gold[^>]*>Les loups choisissent/)
    expect(html).toContain('line-clamp-2')
    expect(html).toContain('role="timer"')
    expect(html).toContain('En attente de 3 joueurs')
  })

  it('n’affiche pas de chrono sans échéance', () => {
    const html = renderToStaticMarkup(createElement(PhaseHeader, { phase: 'Révélation', endsAt: null }))
    expect(html).not.toContain('role="timer"')
  })
})
