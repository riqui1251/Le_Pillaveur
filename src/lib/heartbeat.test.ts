import { describe, expect, it } from 'vitest'
import {
  ACTIVE_WINDOW_MS,
  BEAT_INTERVAL_MS,
  HONEST_PRESENCE_SINCE,
  INTERACTION_WINDOW_MS,
  beatBody,
  clampToNow,
  hasRecentInteraction,
  isActive,
  isInGame,
  msUntilNextBeat,
  shouldBeat,
} from '@/lib/heartbeat'

const NOW = Date.parse('2026-09-13T12:00:00.000Z')
const MIN = 60_000

describe('constantes du battement', () => {
  it('au plus un battement par minute', () => {
    expect(BEAT_INTERVAL_MS).toBe(60 * 1000)
  })

  it('page abandonnée après 30 min sans interaction', () => {
    expect(INTERACTION_WINDOW_MS).toBe(30 * 60 * 1000)
  })

  it('date de gel de l’ancien cumul : un jour de Paris AAAA-MM-JJ valide', () => {
    expect(HONEST_PRESENCE_SINCE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(`${HONEST_PRESENCE_SINCE}T12:00:00Z`))).toBe(false)
  })
})

describe('clampToNow', () => {
  it('laisse passer null et tout horodatage passé ou présent', () => {
    expect(clampToNow(null, NOW)).toBeNull()
    expect(clampToNow(NOW, NOW)).toBe(NOW)
    expect(clampToNow(NOW - 5 * MIN, NOW)).toBe(NOW - 5 * MIN)
  })

  it('recale sur maintenant un horodatage « dans le futur » (horloge reculée)', () => {
    expect(clampToNow(NOW + 60 * MIN, NOW)).toBe(NOW)
  })
})

describe('hasRecentInteraction', () => {
  it('faux tant qu’aucune interaction n’a eu lieu (le montage n’en est pas une)', () => {
    expect(hasRecentInteraction(null, NOW)).toBe(false)
  })

  it('vrai juste après une interaction', () => {
    expect(hasRecentInteraction(NOW, NOW)).toBe(true)
    expect(hasRecentInteraction(NOW - 5 * MIN, NOW)).toBe(true)
  })

  it('vrai pile à 30 min (« au plus »), faux une milliseconde après', () => {
    expect(hasRecentInteraction(NOW - INTERACTION_WINDOW_MS, NOW)).toBe(true)
    expect(hasRecentInteraction(NOW - INTERACTION_WINDOW_MS - 1, NOW)).toBe(false)
  })

  it('une interaction « dans le futur » (horloge reculée) reste récente', () => {
    expect(hasRecentInteraction(NOW + 10 * MIN, NOW)).toBe(true)
  })

  it('un horodatage illisible ne vaut jamais interaction', () => {
    expect(hasRecentInteraction(Number.NaN, NOW)).toBe(false)
    expect(hasRecentInteraction(Number.POSITIVE_INFINITY, NOW)).toBe(false)
  })
})

describe('msUntilNextBeat', () => {
  it('0 avant le premier battement', () => {
    expect(msUntilNextBeat(null, NOW)).toBe(0)
  })

  it('le reste de la minute juste après un battement', () => {
    expect(msUntilNextBeat(NOW, NOW)).toBe(BEAT_INTERVAL_MS)
    expect(msUntilNextBeat(NOW - 20_000, NOW)).toBe(40_000)
    expect(msUntilNextBeat(NOW - BEAT_INTERVAL_MS + 1, NOW)).toBe(1)
  })

  it('0 dès que 60 s sont écoulées', () => {
    expect(msUntilNextBeat(NOW - BEAT_INTERVAL_MS, NOW)).toBe(0)
    expect(msUntilNextBeat(NOW - 45 * MIN, NOW)).toBe(0)
  })

  it('un dernier battement « dans le futur » (horloge reculée) ne gèle pas le flux', () => {
    expect(msUntilNextBeat(NOW + 3600_000, NOW)).toBe(0)
  })

  it('un horodatage illisible est traité comme « aucun battement »', () => {
    expect(msUntilNextBeat(Number.NaN, NOW)).toBe(0)
  })

  it('ne dépasse jamais la cadence', () => {
    for (const offset of [0, 1, 30_000, 59_999, 60_000, 90_000, -1, -60_000]) {
      const delay = msUntilNextBeat(NOW - offset, NOW)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(BEAT_INTERVAL_MS)
    }
  })
})

describe('shouldBeat', () => {
  const base = { visible: true, lastInteractionAt: NOW - 10_000, lastBeatAt: null, now: NOW }

  it('premier battement dès la première interaction', () => {
    expect(shouldBeat({ ...base, lastInteractionAt: NOW })).toBe(true)
  })

  it('rien au montage : aucune interaction, même onglet visible', () => {
    expect(shouldBeat({ ...base, lastInteractionAt: null })).toBe(false)
  })

  it('rien onglet caché, même avec une interaction toute fraîche', () => {
    expect(shouldBeat({ ...base, visible: false, lastInteractionAt: NOW })).toBe(false)
    expect(
      shouldBeat({ ...base, visible: false, lastInteractionAt: NOW, lastBeatAt: NOW - 10 * MIN }),
    ).toBe(false)
  })

  it('au plus un battement toutes les 60 s', () => {
    expect(shouldBeat({ ...base, lastInteractionAt: NOW, lastBeatAt: NOW - 59_999 })).toBe(false)
    expect(shouldBeat({ ...base, lastInteractionAt: NOW, lastBeatAt: NOW - BEAT_INTERVAL_MS })).toBe(true)
  })

  it('continue sans interaction jusqu’à 30 min après la dernière', () => {
    const lastInteractionAt = NOW - INTERACTION_WINDOW_MS
    expect(shouldBeat({ ...base, lastInteractionAt, lastBeatAt: NOW - MIN })).toBe(true)
  })

  it('s’arrête au-delà de 30 min sans interaction (écran maintenu allumé)', () => {
    const lastInteractionAt = NOW - INTERACTION_WINDOW_MS - 1
    expect(shouldBeat({ ...base, lastInteractionAt, lastBeatAt: NOW - MIN })).toBe(false)
    expect(shouldBeat({ ...base, lastInteractionAt, lastBeatAt: null })).toBe(false)
  })

  it('reprend immédiatement à la première interaction qui suit un arrêt', () => {
    // Dernier battement il y a 31 min, puis plus rien : un geste relance tout de suite.
    expect(shouldBeat({ ...base, lastInteractionAt: NOW, lastBeatAt: NOW - 31 * MIN })).toBe(true)
  })

  it('battement immédiat au retour au premier plan si l’interaction date de 30 min au plus', () => {
    // Onglet caché 10 min après un dernier geste : le retour visible bat aussitôt.
    expect(
      shouldBeat({ visible: true, lastInteractionAt: NOW - 10 * MIN, lastBeatAt: NOW - 10 * MIN, now: NOW }),
    ).toBe(true)
    // Même retour, mais la page n’a plus été touchée depuis 40 min : rien.
    expect(
      shouldBeat({ visible: true, lastInteractionAt: NOW - 40 * MIN, lastBeatAt: NOW - 40 * MIN, now: NOW }),
    ).toBe(false)
  })

  it('un aller-retour d’onglet en moins de 60 s ne rajoute pas de battement', () => {
    expect(
      shouldBeat({ visible: true, lastInteractionAt: NOW - 5_000, lastBeatAt: NOW - 20_000, now: NOW }),
    ).toBe(false)
  })

  it('une horloge reculée ne bloque pas le flux', () => {
    expect(
      shouldBeat({ visible: true, lastInteractionAt: NOW + 3600_000, lastBeatAt: NOW + 3600_000, now: NOW }),
    ).toBe(true)
  })
})

describe('scénarios sur une durée', () => {
  /**
   * Rejoue une soirée seconde par seconde : un battement part dès que
   * shouldBeat l'autorise (c'est ce que fait VisitTracker, minuteur aligné sur
   * le dernier battement). Renvoie les instants des battements.
   */
  function simulate(opts: {
    durationMs: number
    interactions: number[]
    hidden?: Array<[number, number]>
  }): number[] {
    const beats: number[] = []
    let lastInteractionAt: number | null = null
    let lastBeatAt: number | null = null
    const pending = [...opts.interactions].sort((a, b) => a - b)
    for (let t = 0; t <= opts.durationMs; t += 1000) {
      const visible = !(opts.hidden ?? []).some(([from, to]) => t >= from && t < to)
      while (pending.length > 0 && pending[0] <= t) {
        const at = pending.shift() as number
        if (visible) lastInteractionAt = at
      }
      if (shouldBeat({ visible, lastInteractionAt, lastBeatAt, now: t })) {
        lastBeatAt = t
        beats.push(t)
      }
    }
    return beats
  }

  it('onglet visible 8 h sans jamais être touché : zéro battement', () => {
    expect(simulate({ durationMs: 8 * 60 * MIN, interactions: [] })).toEqual([])
  })

  it('un seul geste puis écran maintenu allumé : 31 battements, puis plus rien', () => {
    const beats = simulate({ durationMs: 4 * 60 * MIN, interactions: [0] })
    expect(beats[0]).toBe(0)
    expect(beats.at(-1)).toBe(INTERACTION_WINDOW_MS)
    expect(beats).toHaveLength(31)
  })

  it('partie active (un geste toutes les 5 s pendant 10 min) : un battement par minute', () => {
    const interactions = Array.from({ length: 120 }, (_, i) => i * 5000)
    const beats = simulate({ durationMs: 10 * MIN, interactions })
    expect(beats).toHaveLength(11)
    for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBe(BEAT_INTERVAL_MS)
  })

  it('onglet caché : aucun battement pendant, un battement immédiat au retour', () => {
    const beats = simulate({
      durationMs: 20 * MIN,
      interactions: [0],
      hidden: [[2 * MIN + 500, 12 * MIN]],
    })
    expect(beats.filter((t) => t > 2 * MIN && t < 12 * MIN)).toEqual([])
    expect(beats).toContain(12 * MIN)
  })

  it('une interaction pendant que l’onglet est caché ne compte pas', () => {
    const beats = simulate({
      durationMs: 70 * MIN,
      interactions: [0, 45 * MIN],
      hidden: [[MIN / 2, 50 * MIN]],
    })
    // Seul le geste initial compte ; au retour (50 min), il date de plus de 30 min.
    expect(beats).toEqual([0])
  })

  it('horloge reculée d’1 h après un geste : arrêt 30 min après le recalage, pas 1 h 30', () => {
    // Rejoue ce que fait VisitTracker à chaque tick (clampToNow puis
    // shouldBeat) sur un temps monotone `m`, alors que l'horloge murale
    // (Date.now()) recule d'une heure à m = 5 min. Seul geste : m = 0.
    const JUMP_AT = 5 * MIN
    const wall = (m: number) => NOW + m - (m >= JUMP_AT ? 60 * MIN : 0)
    let lastInteractionAt: number | null = wall(0)
    let lastBeatAt: number | null = null
    let lastBeatMonotonic = -1
    for (let m = 0; m <= 3 * 60 * MIN; m += 1000) {
      const now = wall(m)
      lastInteractionAt = clampToNow(lastInteractionAt, now)
      if (shouldBeat({ visible: true, lastInteractionAt, lastBeatAt, now })) {
        lastBeatAt = now
        lastBeatMonotonic = m
      }
    }
    expect(lastBeatMonotonic).toBe(JUMP_AT + INTERACTION_WINDOW_MS)
  })
})

describe('isActive (lot 6)', () => {
  it('fenêtre de 10 min, incluse dans celle des battements', () => {
    expect(ACTIVE_WINDOW_MS).toBe(10 * 60 * 1000)
    expect(ACTIVE_WINDOW_MS).toBeLessThan(INTERACTION_WINDOW_MS)
  })

  it('faux sans interaction (le montage n’en est pas une) ou horodatage illisible', () => {
    expect(isActive(null, NOW)).toBe(false)
    expect(isActive(Number.NaN, NOW)).toBe(false)
    expect(isActive(Number.NEGATIVE_INFINITY, NOW)).toBe(false)
  })

  it('vrai juste après un geste et pile à 10 min (« au plus »), faux une milliseconde après', () => {
    expect(isActive(NOW, NOW)).toBe(true)
    expect(isActive(NOW - 3 * MIN, NOW)).toBe(true)
    expect(isActive(NOW - ACTIVE_WINDOW_MS, NOW)).toBe(true)
    expect(isActive(NOW - ACTIVE_WINDOW_MS - 1, NOW)).toBe(false)
  })

  it('une interaction « dans le futur » (horloge reculée) reste active', () => {
    expect(isActive(NOW + 10 * MIN, NOW)).toBe(true)
  })

  it('téléphone posé : entre 10 et 30 min sans geste, la page bat encore mais n’est plus active', () => {
    const lastInteractionAt = NOW - 20 * MIN
    expect(shouldBeat({ visible: true, lastInteractionAt, lastBeatAt: NOW - MIN, now: NOW })).toBe(true)
    expect(isActive(lastInteractionAt, NOW)).toBe(false)
  })

  it('un seul geste puis écran allumé : 11 battements actifs sur 31', () => {
    // Même cadence que VisitTracker : un battement par minute tant que le geste
    // date de 30 min au plus, marqué actif s'il date de 10 min au plus.
    const beats: boolean[] = []
    let lastBeatAt: number | null = null
    for (let t = 0; t <= 60 * MIN; t += 1000) {
      if (shouldBeat({ visible: true, lastInteractionAt: 0, lastBeatAt, now: t })) {
        lastBeatAt = t
        beats.push(isActive(0, t))
      }
    }
    expect(beats).toHaveLength(31)
    expect(beats.filter(Boolean)).toHaveLength(11)
    // Les battements actifs viennent d'abord, jamais après un battement inactif.
    expect(beats.indexOf(false)).toBe(11)
  })
})

describe('isInGame (lot 6)', () => {
  it('page de jeu en mode local : en partie (estimation, réglages compris)', () => {
    expect(isInGame({ pathname: '/games/quiz', playMode: 'local', roomStatus: undefined })).toBe(true)
    expect(isInGame({ pathname: '/games/roue-des-gorgees/', playMode: 'local', roomStatus: null })).toBe(true)
  })

  it('page de jeu en ligne : seulement salle lancée (partie ou briefing tuto)', () => {
    const pathname = '/games/sans-filtre'
    expect(isInGame({ pathname, playMode: 'online', roomStatus: 'playing' })).toBe(true)
    expect(isInGame({ pathname, playMode: 'online', roomStatus: 'briefing' })).toBe(true)
    expect(isInGame({ pathname, playMode: 'online', roomStatus: 'waiting' })).toBe(false)
    expect(isInGame({ pathname, playMode: 'online', roomStatus: 'finished' })).toBe(false)
    expect(isInGame({ pathname, playMode: 'online', roomStatus: undefined })).toBe(false)
  })

  it('salle lancée mais compte sans mode connu : la salle suffit', () => {
    expect(isInGame({ pathname: '/games/quiz', playMode: undefined, roomStatus: 'playing' })).toBe(true)
  })

  it('hors page de jeu : jamais en partie, même en mode local ou salle lancée', () => {
    for (const pathname of ['/', '/jeux', '/online', '/regles/quiz', '/classement', '/games', '/games/']) {
      expect(isInGame({ pathname, playMode: 'local', roomStatus: 'playing' })).toBe(false)
    }
    // Un préfixe de langue n'est pas attendu (usePathname de @/i18n/navigation le retire).
    expect(isInGame({ pathname: '/fr/games/quiz', playMode: 'local', roomStatus: 'playing' })).toBe(false)
    expect(isInGame({ pathname: '/gamesquiz', playMode: 'local', roomStatus: 'playing' })).toBe(false)
  })

  it('chemin absent (rendu serveur) : pas en partie', () => {
    expect(isInGame({ pathname: null, playMode: 'local', roomStatus: 'playing' })).toBe(false)
    expect(isInGame({ pathname: undefined, playMode: 'local', roomStatus: 'playing' })).toBe(false)
  })

  it('sans compte ni salle : pas en partie', () => {
    expect(isInGame({ pathname: '/games/quiz', playMode: undefined, roomStatus: undefined })).toBe(false)
  })
})

describe('beatBody (lot 6)', () => {
  const detail = { active: true, inGame: false }

  it('sans consentement accordé : exactement { beat: true }, détail jamais envoyé', () => {
    expect(beatBody(detail, false)).toEqual({ beat: true })
    expect(Object.keys(beatBody({ active: true, inGame: true }, false))).toEqual(['beat'])
  })

  it('sans détail fourni : { beat: true }, même avec consentement', () => {
    expect(beatBody(undefined, true)).toEqual({ beat: true })
    expect(beatBody(undefined, false)).toEqual({ beat: true })
  })

  it('avec consentement : les deux booléens et rien d’autre', () => {
    expect(beatBody(detail, true)).toEqual({ beat: true, active: true, inGame: false })
    expect(beatBody({ active: false, inGame: true }, true)).toEqual({ beat: true, active: false, inGame: true })
    expect(Object.keys(beatBody(detail, true)).sort()).toEqual(['active', 'beat', 'inGame'])
  })

  it('valeurs strictes : tout ce qui n’est pas true part à false (jamais une chaîne ou un objet)', () => {
    const loose = { active: 'oui', inGame: { url: '/games/quiz' } } as unknown as { active: boolean; inGame: boolean }
    expect(beatBody(loose, true)).toEqual({ beat: true, active: false, inGame: false })
  })
})
