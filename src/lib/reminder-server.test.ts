import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rappel du vendredi : la sélection des destinataires (pure), les liens de
 * l'e-mail, l'accord (adresse prouvée ou double opt-in), la confirmation, le
 * retrait, et le tour du planificateur — base et envoi simulés. Aucune
 * adresse ne doit jamais apparaître dans un journal.
 */

const { db } = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))

import {
  REMINDER_CONFIRM_RESEND_MS,
  REMINDER_CONFIRM_TTL_MS,
  REMINDER_QUIET_MS,
  buildReminderConfirmLink,
  buildReminderLinks,
  confirmLandingPath,
  confirmReminderByToken,
  generateReminderToken,
  isAddressProven,
  isReminderRecipient,
  isWellFormedReminderToken,
  optInReminder,
  optOutReminder,
  parisWeekStartUtc,
  reminderStatusOf,
  runFridayReminders,
  selectReminderRecipients,
  unsubscribeLandingPath,
  unsubscribeReminderByToken,
  type ReminderAccount,
  type ReminderCandidate,
} from './reminder-server'

/** Vendredi 9 octobre 2026, 17 h à Paris (15 h UTC, heure d'été). */
const FRIDAY_17H = new Date('2026-10-09T15:00:00.000Z')
/** Lundi 5 octobre 2026, 00:00 à Paris. */
const MONDAY = new Date('2026-10-04T22:00:00.000Z')

const TOKEN = 'A'.repeat(43)

const candidate = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  id: 'compte-1',
  email: 'joueur@exemple.fr',
  locale: 'fr',
  role: 'user',
  isGuest: false,
  banType: null,
  bannedUntil: null,
  banComment: null,
  bannedAt: null,
  lastSeenAt: new Date('2026-10-04T21:00:00.000Z'),
  emailVerified: new Date('2026-09-20T20:00:00.000Z'),
  reminderOptInAt: new Date('2026-09-20T20:00:00.000Z'),
  reminderLastSentAt: null,
  reminderToken: TOKEN,
  ...over,
})

/** Compte tel que le lit l'accord : e-mail + mot de passe, rien de prouvé, rien d'accordé. */
const account = (over: Partial<ReminderAccount & { locale: string }> = {}): ReminderAccount & { locale: string } => ({
  email: 'joueur@exemple.fr',
  isGuest: false,
  passwordHash: 'hash-scrypt',
  emailVerified: null,
  reminderOptInAt: null,
  reminderLastSentAt: null,
  reminderToken: null,
  locale: 'fr',
  ...over,
})

const configured = () => true

// Journal d'exploitation du tour (console.log, comme scheduler.ts) : espionné
// par une référence gardée, pour l'asserter sans relire console.log ici.
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parisWeekStartUtc', () => {
  it('lundi 00:00 Paris de la semaine en cours, l’été', () => {
    expect(parisWeekStartUtc(FRIDAY_17H).toISOString()).toBe(MONDAY.toISOString())
  })

  it('le lundi même, dès minuit', () => {
    expect(parisWeekStartUtc(new Date('2026-10-04T22:30:00.000Z')).toISOString()).toBe(MONDAY.toISOString())
  })

  it('le dimanche soir appartient encore à la semaine commencée le lundi d’avant', () => {
    // Dimanche 11 octobre, 23 h 30 à Paris.
    expect(parisWeekStartUtc(new Date('2026-10-11T21:30:00.000Z')).toISOString()).toBe(MONDAY.toISOString())
  })

  it('la semaine du passage à l’heure d’hiver : lundi 00:00 en heure d’hiver', () => {
    // Vendredi 30 octobre 2026, 17 h à Paris (16 h UTC) ; le lundi 26 est
    // déjà en heure d'hiver (bascule le dimanche 25).
    expect(parisWeekStartUtc(new Date('2026-10-30T16:00:00.000Z')).toISOString()).toBe(
      '2026-10-25T23:00:00.000Z'
    )
  })
})

describe('isReminderRecipient', () => {
  const context = { now: FRIDAY_17H, weekStart: MONDAY }

  it('accepte un compte inscrit, jamais servi, pas vu depuis 12 h', () => {
    expect(isReminderRecipient(candidate(), context)).toBe(true)
  })

  it('refuse sans accord', () => {
    expect(isReminderRecipient(candidate({ reminderOptInAt: null }), context)).toBe(false)
  })

  it('refuse une adresse jamais prouvée, même avec un accord (ligne d’avant le double opt-in)', () => {
    expect(isReminderRecipient(candidate({ emailVerified: null }), context)).toBe(false)
  })

  it('refuse un invité et un compte sans adresse plausible', () => {
    expect(isReminderRecipient(candidate({ isGuest: true }), context)).toBe(false)
    expect(isReminderRecipient(candidate({ email: null }), context)).toBe(false)
    expect(isReminderRecipient(candidate({ email: '' }), context)).toBe(false)
    expect(isReminderRecipient(candidate({ email: 'pas-une-adresse' }), context)).toBe(false)
  })

  it('refuse un compte banni, mais pas un ban temporaire échu', () => {
    expect(isReminderRecipient(candidate({ banType: 'permanent' }), context)).toBe(false)
    expect(
      isReminderRecipient(candidate({ banType: 'temporary', bannedUntil: new Date('2099-01-01') }), context)
    ).toBe(false)
    expect(
      isReminderRecipient(candidate({ banType: 'temporary', bannedUntil: new Date('2026-01-01') }), context)
    ).toBe(true)
  })

  it('accepte l’équipe (accord personnel), refuse un rôle inconnu', () => {
    for (const role of ['moderator', 'admin', 'superadmin', 'fondateur']) {
      expect(isReminderRecipient(candidate({ role }), context)).toBe(true)
    }
    expect(isReminderRecipient(candidate({ role: 'pirate' }), context)).toBe(false)
  })

  it('un seul rappel par semaine : déjà servi depuis lundi, refusé', () => {
    expect(isReminderRecipient(candidate({ reminderLastSentAt: MONDAY }), context)).toBe(false)
    expect(
      isReminderRecipient(candidate({ reminderLastSentAt: new Date('2026-10-02T15:00:00.000Z') }), context)
    ).toBe(true)
  })

  it('pas de rappel à qui est passé sur le site dans les 12 dernières heures', () => {
    const recent = new Date(FRIDAY_17H.getTime() - REMINDER_QUIET_MS + 60_000)
    const quiet = new Date(FRIDAY_17H.getTime() - REMINDER_QUIET_MS)
    expect(isReminderRecipient(candidate({ lastSeenAt: recent }), context)).toBe(false)
    expect(isReminderRecipient(candidate({ lastSeenAt: quiet }), context)).toBe(true)
    expect(isReminderRecipient(candidate({ lastSeenAt: null }), context)).toBe(true)
  })
})

describe('selectReminderRecipients', () => {
  it('garde l’ordre et ne retient que les destinataires de la semaine', () => {
    const picked = selectReminderRecipients(
      [
        candidate({ id: 'a' }),
        candidate({ id: 'b', reminderOptInAt: null }),
        candidate({ id: 'c', isGuest: true }),
        candidate({ id: 'd', reminderLastSentAt: new Date('2026-10-06T15:00:00.000Z') }),
        candidate({ id: 'e' }),
      ],
      FRIDAY_17H
    )
    expect(picked.map((c) => c.id)).toEqual(['a', 'e'])
  })
})

describe('liens et jetons', () => {
  it('jeton aléatoire, base64url, 43 caractères, jamais deux fois le même', () => {
    const a = generateReminderToken()
    const b = generateReminderToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(isWellFormedReminderToken(a)).toBe(true)
  })

  it('refuse un jeton mal formé avant toute lecture', () => {
    for (const bad of ['', 'court', 'a b c d e f g h i j k l m n o p', '<script>'.repeat(4), null, 42]) {
      expect(isWellFormedReminderToken(bad)).toBe(false)
    }
  })

  it('liens dans la langue du compte, jeton encodé, langue inconnue ramenée au français', () => {
    expect(buildReminderLinks('https://lepillaveur.fr/', 'it', 'abc_DEF-123')).toEqual({
      games: 'https://lepillaveur.fr/it/jeux',
      account: 'https://lepillaveur.fr/it/compte?focus=rappel',
      // Corps : la PAGE au bouton ; en-tête : la route qui ne coupe qu'en POST One-Click.
      unsubscribe: 'https://lepillaveur.fr/it/compte/rappel?token=abc_DEF-123',
      unsubscribeOneClick: 'https://lepillaveur.fr/api/reminder/unsubscribe?token=abc_DEF-123&lang=it',
    })
    expect(buildReminderLinks('https://lepillaveur.fr', 'de', 't').games).toBe('https://lepillaveur.fr/fr/jeux')
    expect(buildReminderConfirmLink('https://lepillaveur.fr/', 'es', 'abc_DEF-123')).toBe(
      'https://lepillaveur.fr/es/compte/rappel/confirmer?token=abc_DEF-123'
    )
  })

  it('pages de désinscription et de confirmation : langue du lien, jamais autre chose', () => {
    expect(unsubscribeLandingPath('en')).toBe('/en/compte/rappel')
    expect(unsubscribeLandingPath(null)).toBe('/fr/compte/rappel')
    expect(unsubscribeLandingPath('//evil.example')).toBe('/fr/compte/rappel')
    expect(unsubscribeLandingPath('it', TOKEN)).toBe(`/it/compte/rappel?token=${TOKEN}`)
    // Un « jeton » hors forme n'est jamais recopié dans l'URL.
    expect(unsubscribeLandingPath('it', '<script>')).toBe('/it/compte/rappel')
    expect(confirmLandingPath('en', { token: TOKEN })).toBe(`/en/compte/rappel/confirmer?token=${TOKEN}`)
    expect(confirmLandingPath('xx', { outcome: 'active' })).toBe('/fr/compte/rappel/confirmer?etat=actif')
    expect(confirmLandingPath('es', { outcome: 'invalid' })).toBe('/es/compte/rappel/confirmer?etat=invalide')
  })
})

describe('adresse prouvée et état du rappel (pur)', () => {
  it('prouvée : confirmée (emailVerified) ou compte Google (sans mot de passe) ; jamais un invité', () => {
    expect(isAddressProven(account())).toBe(false)
    expect(isAddressProven(account({ emailVerified: MONDAY }))).toBe(true)
    expect(isAddressProven(account({ passwordHash: '' }))).toBe(true)
    expect(isAddressProven(account({ passwordHash: '', isGuest: true }))).toBe(false)
    expect(isAddressProven(account({ passwordHash: '', email: null }))).toBe(false)
  })

  it('envoi non configuré : unavailable, quel que soit le compte', () => {
    expect(reminderStatusOf(account({ reminderOptInAt: MONDAY }), { now: FRIDAY_17H, configured: false })).toBe(
      'unavailable'
    )
  })

  it('on, off, unavailable (invité, sans adresse)', () => {
    const ctx = { now: FRIDAY_17H, configured: true }
    expect(reminderStatusOf(account({ reminderOptInAt: MONDAY }), ctx)).toBe('on')
    expect(reminderStatusOf(account(), ctx)).toBe('off')
    expect(reminderStatusOf(account({ isGuest: true }), ctx)).toBe('unavailable')
    expect(reminderStatusOf(account({ email: null }), ctx)).toBe('unavailable')
    expect(reminderStatusOf(null, ctx)).toBe('unavailable')
  })

  it('pending tant que le lien de confirmation vaut (7 jours), off ensuite', () => {
    const ctx = { now: FRIDAY_17H, configured: true }
    const sentAt = (ms: number) => new Date(FRIDAY_17H.getTime() - ms)
    expect(reminderStatusOf(account({ reminderToken: TOKEN, reminderLastSentAt: sentAt(60_000) }), ctx)).toBe(
      'pending'
    )
    expect(
      reminderStatusOf(account({ reminderToken: TOKEN, reminderLastSentAt: sentAt(REMINDER_CONFIRM_TTL_MS) }), ctx)
    ).toBe('off')
    // Adresse prouvée et accord retiré : le dernier e-mail était un rappel, pas une confirmation.
    expect(
      reminderStatusOf(
        account({ emailVerified: MONDAY, reminderToken: TOKEN, reminderLastSentAt: sentAt(60_000) }),
        ctx
      )
    ).toBe('off')
  })
})

describe('accord', () => {
  it('envoi non configuré : unavailable, sans lecture en base', async () => {
    await expect(optInReminder('compte-1', { isConfigured: () => false })).resolves.toEqual({
      status: 'unavailable',
    })
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('compte Google (adresse prouvée par Google) : accord, jeton et preuve posés tout de suite', async () => {
    db.user.findUnique.mockResolvedValue(account({ passwordHash: '' }))
    const sendConfirm = vi.fn()
    await expect(
      optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H, sendConfirm })
    ).resolves.toEqual({ status: 'on' })
    const data = db.user.update.mock.calls[0][0].data
    expect(data.reminderOptInAt).toEqual(FRIDAY_17H)
    expect(data.reminderToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(data.emailVerified).toEqual(FRIDAY_17H)
    expect(sendConfirm).not.toHaveBeenCalled()
  })

  it('adresse déjà confirmée : accord immédiat, MÊME jeton, preuve d’origine gardée', async () => {
    db.user.findUnique.mockResolvedValue(account({ emailVerified: MONDAY, reminderToken: TOKEN }))
    await optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H })
    const data = db.user.update.mock.calls[0][0].data
    expect(data.reminderToken).toBe(TOKEN)
    expect(data).not.toHaveProperty('emailVerified')
  })

  it('idempotent : un second accord ne réécrit ni la date ni le jeton', async () => {
    db.user.findUnique.mockResolvedValue(account({ emailVerified: MONDAY, reminderOptInAt: MONDAY, reminderToken: TOKEN }))
    await expect(optInReminder('compte-1', { isConfigured: configured })).resolves.toEqual({ status: 'on' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('adresse non prouvée : e-mail de confirmation, AUCUN accord posé (double opt-in)', async () => {
    db.user.findUnique.mockResolvedValue(account({ locale: 'it' }))
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const sendConfirm = vi.fn().mockResolvedValue(undefined)

    await expect(
      optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H, sendConfirm })
    ).resolves.toEqual({ status: 'pending' })

    expect(db.user.update).not.toHaveBeenCalled()
    const claim = db.user.updateMany.mock.calls[0][0]
    expect(claim.where).toMatchObject({ id: 'compte-1', reminderOptInAt: null, emailVerified: null })
    expect(claim.data.reminderLastSentAt).toEqual(FRIDAY_17H)
    expect(claim.data).not.toHaveProperty('reminderOptInAt')
    const token = claim.data.reminderToken as string
    expect(isWellFormedReminderToken(token)).toBe(true)
    expect(sendConfirm).toHaveBeenCalledTimes(1)
    expect(sendConfirm.mock.calls[0][0]).toMatchObject({ to: 'joueur@exemple.fr', locale: 'it' })
    expect(sendConfirm.mock.calls[0][0].confirmUrl).toContain(`/it/compte/rappel/confirmer?token=${token}`)
  })

  it('confirmation déjà envoyée il y a moins d’un jour : rien de renvoyé', async () => {
    db.user.findUnique.mockResolvedValue(
      account({ reminderToken: TOKEN, reminderLastSentAt: new Date(FRIDAY_17H.getTime() - 3_600_000) })
    )
    const sendConfirm = vi.fn()
    await expect(
      optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H, sendConfirm })
    ).resolves.toEqual({ status: 'pending' })
    expect(sendConfirm).not.toHaveBeenCalled()
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })

  it('plus d’un jour après : renvoyée avec le MÊME jeton', async () => {
    db.user.findUnique.mockResolvedValue(
      account({
        reminderToken: TOKEN,
        reminderLastSentAt: new Date(FRIDAY_17H.getTime() - REMINDER_CONFIRM_RESEND_MS - 1000),
      })
    )
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const sendConfirm = vi.fn().mockResolvedValue(undefined)
    await optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H, sendConfirm })
    expect(db.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('reminderToken')
    expect(sendConfirm.mock.calls[0][0].confirmUrl).toContain(`token=${TOKEN}`)
  })

  it('envoi raté : réservation rendue, erreur levée (la route répond 503), journal sans adresse', async () => {
    db.user.findUnique.mockResolvedValue(account())
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const sendConfirm = vi.fn().mockRejectedValue(new Error('refus pour joueur@exemple.fr'))
    await expect(
      optInReminder('compte-1', { isConfigured: configured, now: FRIDAY_17H, sendConfirm })
    ).rejects.toThrow()
    expect(db.user.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'compte-1', reminderLastSentAt: FRIDAY_17H },
      data: { reminderLastSentAt: null },
    })
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.map(String).join(' '))
      .join('\n')
    expect(logged).not.toMatch(/@/)
  })

  it('invité : aucun accord possible', async () => {
    db.user.findUnique.mockResolvedValue(account({ email: null, isGuest: true }))
    await expect(optInReminder('invite-1', { isConfigured: configured })).resolves.toEqual({ status: 'unavailable' })
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('confirmation par le lien', () => {
  it('pose l’accord ET la preuve d’adresse, d’une écriture conditionnelle', async () => {
    db.user.updateMany.mockResolvedValue({ count: 1 })
    await expect(confirmReminderByToken(TOKEN, FRIDAY_17H)).resolves.toBe('active')
    const { where, data } = db.user.updateMany.mock.calls[0][0]
    expect(where).toMatchObject({
      reminderToken: TOKEN,
      isGuest: false,
      reminderOptInAt: null,
      emailVerified: null,
      reminderLastSentAt: { gte: new Date(FRIDAY_17H.getTime() - REMINDER_CONFIRM_TTL_MS) },
    })
    expect(data).toEqual({ reminderOptInAt: FRIDAY_17H, emailVerified: FRIDAY_17H })
  })

  it('second clic : déjà actif, succès', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 })
    db.user.findUnique.mockResolvedValue({ reminderOptInAt: FRIDAY_17H })
    await expect(confirmReminderByToken(TOKEN, FRIDAY_17H)).resolves.toBe('active')
  })

  it('jeton inconnu ou expiré : invalide ; mal formé : sans lecture en base', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 })
    db.user.findUnique.mockResolvedValue(null)
    await expect(confirmReminderByToken(TOKEN, FRIDAY_17H)).resolves.toBe('invalid')
    vi.clearAllMocks()
    await expect(confirmReminderByToken('<x>', FRIDAY_17H)).resolves.toBe('invalid')
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('retrait', () => {

  it('retrait : date d’accord remise à null, jeton gardé', async () => {
    db.user.updateMany.mockResolvedValue({ count: 1 })
    await optOutReminder('compte-1')
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'compte-1', reminderOptInAt: { not: null } },
      data: { reminderOptInAt: null },
    })
  })

  it('désinscription par jeton : un jeton mal formé ne touche pas la base', async () => {
    await unsubscribeReminderByToken('<rien>')
    expect(db.user.updateMany).not.toHaveBeenCalled()
    db.user.updateMany.mockResolvedValue({ count: 0 })
    await unsubscribeReminderByToken(TOKEN)
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { reminderToken: TOKEN, reminderOptInAt: { not: null } },
      data: { reminderOptInAt: null },
    })
  })
})

describe('runFridayReminders', () => {
  it('sans clé d’envoi : tour sauté, aucune lecture en base, journal clair', async () => {
    const report = await runFridayReminders({ isConfigured: () => false, now: FRIDAY_17H })
    expect(report).toEqual({ status: 'skipped', reason: 'email_not_configured' })
    expect(db.user.findMany).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY absente'))
  })

  it('envoie aux destinataires du lot, réserve chaque envoi, puis s’arrête', async () => {
    db.user.findMany.mockResolvedValueOnce([
      candidate({ id: 'a' }),
      candidate({ id: 'b', reminderOptInAt: null }),
      candidate({ id: 'c', locale: 'en' }),
    ])
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const send = vi.fn().mockResolvedValue(undefined)

    const report = await runFridayReminders({
      isConfigured: () => true,
      now: FRIDAY_17H,
      pauseMs: 0,
      batchSize: 50,
      send,
    })

    expect(report).toEqual({ status: 'done', sent: 2, failed: 0, capped: false, aborted: false })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0]).toMatchObject({ to: 'joueur@exemple.fr', locale: 'en' })
    expect(send.mock.calls[1][0].links.unsubscribe).toContain(`/en/compte/rappel?token=${TOKEN}`)
    expect(send.mock.calls[1][0].links.unsubscribeOneClick).toContain(`token=${TOKEN}&lang=en`)
    // Réservation conditionnelle : « pas encore servi cette semaine ».
    expect(db.user.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'a', OR: [{ reminderLastSentAt: null }, { reminderLastSentAt: { lt: MONDAY } }] },
      data: { reminderLastSentAt: FRIDAY_17H },
    })
    // La requête ne lit que des comptes inscrits, à l'adresse prouvée, non invités.
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      reminderOptInAt: { not: null },
      emailVerified: { not: null },
      isGuest: false,
      email: { not: null },
    })
  })

  it('réservation perdue (autre tour plus rapide) : pas d’envoi', async () => {
    db.user.findMany.mockResolvedValueOnce([candidate({ id: 'a' })])
    db.user.updateMany.mockResolvedValue({ count: 0 })
    const send = vi.fn()
    const report = await runFridayReminders({ isConfigured: () => true, now: FRIDAY_17H, pauseMs: 0, send })
    expect(send).not.toHaveBeenCalled()
    expect(report).toMatchObject({ sent: 0 })
  })

  it('plafond par tour : les suivants attendent la semaine prochaine', async () => {
    db.user.findMany.mockResolvedValueOnce([candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })])
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const send = vi.fn().mockResolvedValue(undefined)
    const report = await runFridayReminders({
      isConfigured: () => true,
      now: FRIDAY_17H,
      pauseMs: 0,
      maxSends: 2,
      send,
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(report).toMatchObject({ sent: 2, capped: true })
  })

  it('lit par lots avec un curseur d’identifiant', async () => {
    db.user.findMany
      .mockResolvedValueOnce([candidate({ id: 'a' }), candidate({ id: 'b' })])
      .mockResolvedValueOnce([candidate({ id: 'c' })])
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const send = vi.fn().mockResolvedValue(undefined)
    await runFridayReminders({ isConfigured: () => true, now: FRIDAY_17H, pauseMs: 0, batchSize: 2, send })
    expect(db.user.findMany).toHaveBeenCalledTimes(2)
    expect(db.user.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'b' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('échec d’envoi : réservation rendue, journal sans adresse, tour poursuivi', async () => {
    db.user.findMany.mockResolvedValueOnce([candidate({ id: 'a' }), candidate({ id: 'b' })])
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('refus pour joueur@exemple.fr'))
      .mockResolvedValueOnce(undefined)

    const report = await runFridayReminders({ isConfigured: () => true, now: FRIDAY_17H, pauseMs: 0, send })

    expect(report).toMatchObject({ sent: 1, failed: 1, aborted: false })
    // Deuxième écriture : la réservation de « a » rendue (date précédente).
    expect(db.user.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'a', reminderLastSentAt: FRIDAY_17H },
      data: { reminderLastSentAt: null },
    })
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.map(String).join(' '))
      .join('\n')
    expect(logged).not.toMatch(/@/)
  })

  it('échecs en série : le tour s’interrompt', async () => {
    db.user.findMany.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => candidate({ id: `c${i}` }))
    )
    db.user.updateMany.mockResolvedValue({ count: 1 })
    const send = vi.fn().mockRejectedValue(new Error('quota'))
    const report = await runFridayReminders({ isConfigured: () => true, now: FRIDAY_17H, pauseMs: 0, send })
    expect(send).toHaveBeenCalledTimes(5)
    expect(report).toMatchObject({ sent: 0, failed: 5, aborted: true })
  })
})
