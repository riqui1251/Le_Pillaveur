import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import {
  UNTRACKED_REASONS,
  UNTRACKED_REASON_KEYS,
  VISITS_7D_KEYS,
  VISIT_RETENTION_MS,
  VISIT_TRACKING_STATES,
  classifyVisitTracking,
  isVisitTrackingState,
  untrackedReason,
  visitsKeptSince,
} from '@/lib/supervision/visit-tracking'

/**
 * Pourquoi un compte n'a pas de temps de visite. Une étiquette fausse (« vu
 * sans visite suivie » sur un compte suivi) serait pire que l'ancien flou :
 * chaque règle et chaque bord est tenu ici.
 */

// Lundi 16/11/2026 00:00 à Paris (heure d'hiver, UTC+1).
const WINDOW_START = new Date('2026-11-15T23:00:00.000Z')
const before = (ms: number) => new Date(WINDOW_START.getTime() - ms)
const after = (ms: number) => new Date(WINDOW_START.getTime() + ms)
const HOUR = 60 * 60 * 1000

const base = {
  role: 'user',
  visitsStarted: 0,
  carriedVisit: false,
  games: 0,
  lastSeenAt: null as Date | null,
  windowStart: WINDOW_START,
}

describe('classifyVisitTracking — ligne « 7 j » de la liste Comptes', () => {
  it('table de deux : A a des visites, B a seulement un siège au journal — B est « vu », pas absent', () => {
    const a = classifyVisitTracking({ ...base, visitsStarted: 3, games: 2, lastSeenAt: after(HOUR) })
    const b = classifyVisitTracking({ ...base, games: 2, lastSeenAt: after(HOUR) })
    expect(a).toBe('tracked')
    expect(b).toBe('seenUntracked')
  })

  it('compte de l’équipe sans visite : équipe, même vu et assis à une table', () => {
    for (const role of ['moderator', 'admin', 'superadmin', 'fondateur']) {
      expect(classifyVisitTracking({ ...base, role, games: 4, lastSeenAt: after(HOUR) })).toBe('staff')
    }
  })

  it('les visites priment sur le rôle : un compte de l’équipe qui en a garde ses chiffres', () => {
    expect(classifyVisitTracking({ ...base, role: 'admin', visitsStarted: 1 })).toBe('tracked')
    expect(classifyVisitTracking({ ...base, role: 'admin', carriedVisit: true })).toBe('carried')
  })

  it('soirée passée minuit : la visite commencée avant la fenêtre et poursuivie dedans n’est jamais « non suivie »', () => {
    expect(classifyVisitTracking({ ...base, carriedVisit: true, games: 1, lastSeenAt: after(HOUR) })).toBe('carried')
  })

  it('vu dans la fenêtre sans visite ni partie (simple connexion) : vu, aucune visite suivie', () => {
    expect(classifyVisitTracking({ ...base, lastSeenAt: after(HOUR) })).toBe('seenUntracked')
  })

  it('un siège au journal suffit, même sans signe de vie récent (battements retenus par un bloqueur)', () => {
    expect(classifyVisitTracking({ ...base, games: 1, lastSeenAt: before(40 * 24 * HOUR) })).toBe('seenUntracked')
    expect(classifyVisitTracking({ ...base, games: 1, lastSeenAt: null })).toBe('seenUntracked')
  })

  it('bords de la fenêtre : vu à minuit pile compte, une milliseconde avant ne compte pas', () => {
    expect(classifyVisitTracking({ ...base, lastSeenAt: new Date(WINDOW_START) })).toBe('seenUntracked')
    expect(classifyVisitTracking({ ...base, lastSeenAt: before(1) })).toBe('notSeen')
  })

  it('jamais vu, ou date illisible : pas vu', () => {
    expect(classifyVisitTracking({ ...base, lastSeenAt: null })).toBe('notSeen')
    expect(classifyVisitTracking({ ...base, lastSeenAt: new Date('pas une date') })).toBe('notSeen')
  })

  it('rôle inconnu : traité comme un joueur (normalizeRole), jamais comme l’équipe', () => {
    expect(classifyVisitTracking({ ...base, role: 'vip', lastSeenAt: after(HOUR) })).toBe('seenUntracked')
  })
})

describe('untrackedReason — fiche d’un compte sans aucune visite conservée', () => {
  const NOW = new Date('2026-11-22T20:00:00.000Z')

  it('compte de l’équipe : toujours « équipe », quoi qu’il ait fait', () => {
    expect(untrackedReason({ role: 'fondateur', lastSeenAt: NOW, games: 5, now: NOW })).toBe('staff')
    expect(untrackedReason({ role: 'moderator', lastSeenAt: null, games: 0, now: NOW })).toBe('staff')
  })

  it('joueur vu depuis le début du suivi, sans visite : vu sans visite suivie', () => {
    expect(untrackedReason({ role: 'user', lastSeenAt: new Date('2026-11-21T22:00:00Z'), games: 0, now: NOW })).toBe(
      'seenUntracked'
    )
  })

  it('des parties au journal prouvent sa venue, même sans date de dernière activité', () => {
    expect(untrackedReason({ role: 'user', lastSeenAt: null, games: 2, now: NOW })).toBe('seenUntracked')
  })

  it('dernière activité avant le suivi des visites (13/09/2026, minuit de Paris) : on ne peut rien en dire', () => {
    // 12/09/2026 23:59 à Paris (heure d'été, UTC+2).
    expect(untrackedReason({ role: 'user', lastSeenAt: new Date('2026-09-12T21:59:00Z'), games: 0, now: NOW })).toBe(
      'beforeTracking'
    )
    // 13/09/2026 00:00 à Paris : le suivi existe.
    expect(untrackedReason({ role: 'user', lastSeenAt: new Date('2026-09-12T22:00:00Z'), games: 0, now: NOW })).toBe(
      'seenUntracked'
    )
  })

  it('dernière activité plus vieille que la conservation des visites : une visite suivie aurait été purgée', () => {
    const later = new Date('2027-06-01T12:00:00Z')
    const lastSeenAt = new Date('2026-10-10T12:00:00Z')
    expect(later.getTime() - lastSeenAt.getTime()).toBeGreaterThan(VISIT_RETENTION_MS)
    expect(untrackedReason({ role: 'user', lastSeenAt, games: 0, now: later })).toBe('beforeTracking')
    // Le même compte, lu en novembre 2026 : sa visite existerait encore.
    expect(untrackedReason({ role: 'user', lastSeenAt, games: 0, now: NOW })).toBe('seenUntracked')
  })

  it('aucune activité enregistrée, ou date illisible : jamais vu', () => {
    expect(untrackedReason({ role: 'user', lastSeenAt: null, games: 0, now: NOW })).toBe('neverSeen')
    expect(untrackedReason({ role: 'user', lastSeenAt: new Date('x'), games: 0, now: NOW })).toBe('neverSeen')
  })
})

describe('visitsKeptSince', () => {
  it('début du suivi tant qu’il a moins de 6 mois, limite de conservation ensuite', () => {
    expect(visitsKeptSince(new Date('2026-11-22T20:00:00Z')).toISOString()).toBe('2026-09-12T22:00:00.000Z')
    const later = new Date('2027-06-01T12:00:00Z')
    expect(visitsKeptSince(later).getTime()).toBe(later.getTime() - VISIT_RETENTION_MS)
  })
})

describe('états et textes', () => {
  it('reconnaît les états servis par la liste, rien d’autre', () => {
    for (const state of VISIT_TRACKING_STATES) expect(isVisitTrackingState(state)).toBe(true)
    expect(isVisitTrackingState('untracked')).toBe(false)
    expect(isVisitTrackingState(undefined)).toBe(false)
  })

  it('chaque état sans visite a sa ligne dans la liste, chaque raison son message dans la fiche', () => {
    const accounts = fr.supervision.accounts as Record<string, unknown>
    const accountFile = fr.supervision.accountFile as Record<string, unknown>
    expect(Object.keys(VISITS_7D_KEYS).sort()).toEqual(VISIT_TRACKING_STATES.filter((s) => s !== 'tracked').sort())
    for (const key of Object.values(VISITS_7D_KEYS)) expect(accounts[key], key).toEqual(expect.any(String))
    expect(Object.keys(UNTRACKED_REASON_KEYS).sort()).toEqual([...UNTRACKED_REASONS].sort())
    for (const key of Object.values(UNTRACKED_REASON_KEYS)) expect(accountFile[key], key).toEqual(expect.any(String))
  })

  it('aucun libellé ne parle d’un refus : la Supervision déduit, elle ne lit pas le choix du joueur', () => {
    const accounts = fr.supervision.accounts as Record<string, unknown>
    const accountFile = fr.supervision.accountFile as Record<string, unknown>
    const texts = [
      ...Object.values(VISITS_7D_KEYS).map((key) => accounts[key]),
      ...Object.values(UNTRACKED_REASON_KEYS).map((key) => accountFile[key]),
    ]
    for (const text of texts) expect(String(text)).not.toMatch(/refus|rejet|décoch/i)
  })
})
