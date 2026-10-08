import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * E-mail du rappel du vendredi : configuration détectée sans lever, liens
 * présents et échappés dans les deux versions (HTML, texte), en-têtes de
 * désinscription en un clic posés à l'envoi. Resend est simulé.
 */

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import frMessages from '../../messages/fr.json'
import enMessages from '../../messages/en.json'
import esMessages from '../../messages/es.json'
import itMessages from '../../messages/it.json'
import {
  isEmailSendingConfigured,
  renderFridayReminderEmail,
  renderReminderConfirmEmail,
  sendFridayReminderEmail,
  sendReminderConfirmEmail,
} from './email'

const LINKS = {
  games: 'https://lepillaveur.fr/fr/jeux',
  account: 'https://lepillaveur.fr/fr/compte?focus=rappel',
  unsubscribe: 'https://lepillaveur.fr/fr/compte/rappel?token=abc_DEF-123',
  unsubscribeOneClick: 'https://lepillaveur.fr/api/reminder/unsubscribe?token=abc_DEF-123&lang=fr',
}

const CONFIRM_URL = 'https://lepillaveur.fr/fr/compte/rappel/confirmer?token=abc_DEF-123'

afterEach(() => {
  vi.unstubAllEnvs()
  sendMock.mockReset()
})

describe('isEmailSendingConfigured', () => {
  it('faux sans clé (la production aujourd’hui), vrai avec', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(isEmailSendingConfigured()).toBe(false)
    vi.stubEnv('RESEND_API_KEY', '   ')
    expect(isEmailSendingConfigured()).toBe(false)
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    expect(isEmailSendingConfigured()).toBe(true)
  })
})

describe('renderFridayReminderEmail', () => {
  it('porte les trois liens, échappés dans le HTML, tels quels dans le texte', async () => {
    const content = await renderFridayReminderEmail('fr', LINKS)
    expect(content.subject.length).toBeGreaterThan(0)
    expect(content.html).toContain('href="https://lepillaveur.fr/fr/jeux"')
    expect(content.html).toContain('href="https://lepillaveur.fr/fr/compte?focus=rappel"')
    // Le corps mène à la PAGE de désinscription (bouton), jamais à la route qui coupe.
    expect(content.html).toContain('href="https://lepillaveur.fr/fr/compte/rappel?token=abc_DEF-123"')
    expect(content.html).not.toContain('/api/reminder/unsubscribe')
    expect(content.text).toContain(LINKS.unsubscribe)
    expect(content.text).toContain(LINKS.games)
  })

  it('un lien piégé ne sort pas de son attribut', async () => {
    const content = await renderFridayReminderEmail('fr', { ...LINKS, games: 'https://x/"><script>' })
    expect(content.html).not.toContain('<script>')
    expect(content.html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('langue inconnue : rendu quand même (repli sur le français), jamais d’exception', async () => {
    await expect(renderFridayReminderEmail('de', LINKS)).resolves.toMatchObject({
      subject: expect.any(String),
    })
  })
})

describe('sendFridayReminderEmail', () => {
  it('pose List-Unsubscribe (route One-Click, distincte du lien du corps) et List-Unsubscribe-Post (RFC 8058)', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    sendMock.mockResolvedValue({ data: { id: 'e-1' }, error: null })
    await sendFridayReminderEmail({ to: 'joueur@exemple.fr', locale: 'fr', links: LINKS })
    const payload = sendMock.mock.calls[0][0]
    expect(payload.to).toBe('joueur@exemple.fr')
    expect(payload.headers).toEqual({
      'List-Unsubscribe': `<${LINKS.unsubscribeOneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(payload.text).toContain(LINKS.unsubscribe)
  })

  it('refus de Resend : lève, et le journal ne recopie pas l’adresse', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'joueur@exemple.fr refusée', statusCode: 422 },
    })
    await expect(
      sendFridayReminderEmail({ to: 'joueur@exemple.fr', locale: 'fr', links: LINKS })
    ).rejects.toThrow()
    const logged = errorSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
    expect(logged).not.toMatch(/@/)
    errorSpy.mockRestore()
  })
})

describe('e-mail de confirmation du rappel (double opt-in)', () => {
  it('un seul lien, échappé, et la phrase « ignore cet e-mail »', async () => {
    const content = await renderReminderConfirmEmail('fr', CONFIRM_URL)
    expect(content.subject.length).toBeGreaterThan(0)
    expect(content.html).toContain(`href="${CONFIRM_URL}"`)
    expect(content.text).toContain(CONFIRM_URL)
    // Les clés existent dans chaque langue : le texte vient du catalogue, pas
    // du repli (qui rendrait le nom de la clé, « subject », « ignore »…).
    for (const [locale, catalog] of [
      ['fr', frMessages],
      ['en', enMessages],
      ['es', esMessages],
      ['it', itMessages],
    ] as const) {
      const rendered = await renderReminderConfirmEmail(locale, CONFIRM_URL)
      const keys = catalog.reminder.confirmEmail
      expect(rendered.subject).toBe(keys.subject)
      expect(rendered.text).toContain(keys.ignore)
      expect(rendered.text).toContain(keys.expiry)
    }
  })

  it('part sans en-tête de désinscription (envoi unique), lève sur refus', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    sendMock.mockResolvedValue({ data: { id: 'e-2' }, error: null })
    await sendReminderConfirmEmail({ to: 'joueur@exemple.fr', locale: 'en', confirmUrl: CONFIRM_URL })
    expect(sendMock.mock.calls[0][0].headers).toBeUndefined()

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendMock.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'x@y.z', statusCode: 422 } })
    await expect(
      sendReminderConfirmEmail({ to: 'joueur@exemple.fr', locale: 'fr', confirmUrl: CONFIRM_URL })
    ).rejects.toThrow()
    expect(errorSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')).not.toMatch(/@/)
    errorSpy.mockRestore()
  })
})
