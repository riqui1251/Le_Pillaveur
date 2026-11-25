import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deleteErrorKey, parseDeleteProbe } from './delete-account'

describe('parseDeleteProbe', () => {
  it('reprend le moyen et les services annoncés par la sonde', () => {
    expect(parseDeleteProbe({ method: 'google', providers: ['discord'] })).toEqual({
      method: 'google',
      providers: ['discord'],
    })
    expect(parseDeleteProbe({ method: 'session', providers: [] })).toEqual({ method: 'session', providers: [] })
    expect(parseDeleteProbe({ method: 'password', providers: [] })).toEqual({ method: 'password', providers: [] })
  })

  it('retombe sur le mot de passe quand la sonde échoue ou répond autre chose', () => {
    expect(parseDeleteProbe(null)).toEqual({ method: 'password', providers: [] })
    expect(parseDeleteProbe({})).toEqual({ method: 'password', providers: [] })
    expect(parseDeleteProbe({ method: 'magic-link' })).toEqual({ method: 'password', providers: [] })
  })

  it('ne garde que les services connus', () => {
    expect(parseDeleteProbe({ method: 'google', providers: ['discord', 'myspace', 42, 'facebook'] })).toEqual({
      method: 'google',
      providers: ['discord', 'facebook'],
    })
    expect(parseDeleteProbe({ method: 'google', providers: 'discord' }).providers).toEqual([])
  })
})

describe('deleteErrorKey', () => {
  it('traduit chaque refus connu de la route', () => {
    expect(deleteErrorKey('wrong_password')).toBe('wrongPassword')
    expect(deleteErrorKey('google_confirmation_required')).toBe('googleRequired')
    expect(deleteErrorKey('founder_protected')).toBe('founderProtected')
  })

  it('tout autre refus devient le message générique', () => {
    expect(deleteErrorKey('rate_limited')).toBe('genericError')
    expect(deleteErrorKey(undefined)).toBe('genericError')
  })

  it('chaque clé existe dans le catalogue français', () => {
    const fr = JSON.parse(readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8')) as {
      account: { deleteAccount: Record<string, string> }
    }
    for (const code of ['wrong_password', 'google_confirmation_required', 'founder_protected', 'autre']) {
      expect(fr.account.deleteAccount[deleteErrorKey(code)]).toBeTruthy()
    }
  })
})
