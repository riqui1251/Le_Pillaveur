import { describe, expect, it } from 'vitest'
import { parseReminderStatus } from './useFridayReminder'

describe('parseReminderStatus', () => {
  it('lit les quatre états connus', () => {
    expect(parseReminderStatus({ status: 'on' })).toBe('on')
    expect(parseReminderStatus({ status: 'off' })).toBe('off')
    expect(parseReminderStatus({ status: 'pending' })).toBe('pending')
    expect(parseReminderStatus({ status: 'unavailable' })).toBe('unavailable')
  })

  it('refuse une réponse illisible : l’appelant n’offre alors aucun geste', () => {
    expect(parseReminderStatus(null)).toBeNull()
    expect(parseReminderStatus({})).toBeNull()
    expect(parseReminderStatus({ status: 'peut-être' })).toBeNull()
    expect(parseReminderStatus({ error: 'auth_required' })).toBeNull()
  })
})
