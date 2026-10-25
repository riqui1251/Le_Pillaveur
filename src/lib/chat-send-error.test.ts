import { describe, expect, it } from 'vitest'
import { chatSendError } from './chat-send-error'

describe('chatSendError', () => {
  it('fantôme du Loup-Garou : lecture seule, pas une panne', () => {
    expect(chatSendError(403, 'chat_read_only')).toBe('readOnly')
  })

  it('anti-flood : trop rapide', () => {
    expect(chatSendError(429, 'rate_limited')).toBe('tooFast')
  })

  it.each([
    [403, 'chat-banned'],
    [400, 'invalid_message'],
    [500, 'server_error'],
    [403, undefined],
  ])('%i %s : échec générique', (status, error) => {
    expect(chatSendError(status, error)).toBe('failed')
  })
})
